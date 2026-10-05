// prototype-render.mjs - a drawn prototype in the browser, against the screens designers made for the product.
//
// The prototype check reads the composition: the right components, their options, the product's conventions. What it
// cannot see is how the page comes out once drawn: a section 12px lower than in Figma, a padding that is not the one
// the product's screens use, a component drawn taller than its Figma size. This opens the drawn page in headless
// Chrome, measures every part, and compares it with the designed screen it redraws (each component in its place and at
// its size), or, for a new page, with the closest designed screen of the product (the page's width, padding and
// spacing, and the size of each component the two share with the same options). It also saves a picture of the page,
// for Claude and the person to look at, and when a Figma image of the screen is at hand, the share of pixels that
// differ from it.
//
// Pure except renderPrototype (Chrome) and the image lookups.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { findChrome, launchChrome, connectCDP, openPage, waitForTrue, FILE_PAGE_LOADED } from './cdp.mjs';
import { compareExpression, figmaImage } from './visual-diff.mjs';
import { OUT_DIR } from './names.mjs';

const PIECES = new Set(['Page', 'Stack', 'Row', 'Columns', 'Text', 'Missing']);
const key = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const slugOf = (s) => String(s).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';
const round = (n) => Math.round(n * 10) / 10;

// Every node of a designed screen with its box on the screen. A capture made since x and y were recorded gives them;
// an older one is placed by Figma's auto layout rules (padding, spacing, alignment), and a frame without auto layout
// leaves its children unplaced (their sizes still count).
export function screenBoxes(tree) {
  const out = [];
  const place = (n, x, y, depth) => {
    if (!n) return;
    const X = Number.isFinite(n.x) ? n.x : x, Y = Number.isFinite(n.y) ? n.y : y;
    out.push({ node: n, x: X, y: Y, w: n.w, h: n.h, depth });
    const all = n.children ?? [];
    if (!all.length) return;
    const layout = n.layout ?? 'NONE';
    // A layer placed absolutely inside an auto layout frame is out of its flow: only a recorded x and y place it.
    for (const k of all.filter((c) => c.absolute)) place(k, NaN, NaN, depth + 1);
    const kids = all.filter((c) => !c.absolute);
    if (layout !== 'VERTICAL' && layout !== 'HORIZONTAL') { for (const k of kids) place(k, NaN, NaN, depth + 1); return; }
    const v = layout === 'VERTICAL';
    const [pt, pr, pb, pl] = n.pad ?? [0, 0, 0, 0];
    const main = v ? n.h - pt - pb : n.w - pl - pr, cross = v ? n.w - pl - pr : n.h - pt - pb;
    const sizes = kids.map((k) => (v ? k.h : k.w));
    const sum = sizes.reduce((a, b) => a + b, 0);
    let gap = n.gap ?? 0, cur = 0;
    if (n.justify === 'SPACE_BETWEEN' && kids.length > 1) gap = (main - sum) / (kids.length - 1);
    else if (n.justify === 'CENTER') cur = (main - sum - gap * (kids.length - 1)) / 2;
    else if (n.justify === 'MAX') cur = main - sum - gap * (kids.length - 1);
    kids.forEach((k, i) => {
      const size = v ? k.w : k.h;
      const across = n.align === 'CENTER' ? (cross - size) / 2 : n.align === 'MAX' ? cross - size : 0;
      place(k, X + pl + (v ? across : cur), Y + pt + (v ? cur : across), depth + 1);
      cur += sizes[i] + gap;
    });
  };
  place(tree, 0, 0, 0);
  return out;
}

// The system's components a screen holds, in reading order, by their catalog name.
export function screenInstances(tree, catalog = { components: {} }) {
  const byKey = new Map(Object.keys(catalog.components ?? {}).map((n) => [key(n), n]));
  return screenBoxes(tree).filter((b) => b.node.kind === 'instance').map((b) => {
    const name = byKey.get(key(b.node.component)) ?? byKey.get(key(String(b.node.component).split('/').pop()));
    return name ? { ...b, component: name, props: b.node.props ?? {} } : null;
  }).filter(Boolean);
}

// The composition's nodes with the path the page gives them (data-pt-path: "0", "0.1", "0.1.2").
export function compositionPaths(tree) {
  const out = [];
  const walk = (n, path) => { if (!n) return; out.push({ path, node: n }); (n.children ?? []).forEach((k, i) => walk(k, `${path}.${i}`)); };
  walk(tree, '0');
  return out;
}

// The designed screen a prototype is compared with: the one it redraws (same name), else the one it started from
// (its $note), else the one sharing the most components. Returns { screen, mode: 'redraw' | 'sibling' } or null.
export function screenFor(name, raw, tree, screens = [], catalog = { components: {} }, slug = (s) => key(s)) {
  if (!screens.length) return null;
  const same = screens.find((s) => slug(s.name) === name);
  if (same) return { screen: same, mode: 'redraw' };
  const started = /^Starting point read from the screen "([^"]+)"/.exec(raw?.$note ?? '')?.[1];
  const from = started && screens.find((s) => s.name === started);
  if (from) return { screen: from, mode: 'sibling' };
  const mine = new Set(compositionPaths(tree).map((p) => p.node.component).filter((c) => !PIECES.has(c)));
  let best = null, bestScore = 0;
  for (const s of screens) {
    const theirs = new Set(screenInstances(s.tree, catalog).map((i) => i.component));
    const both = [...mine].filter((c) => theirs.has(c)).length;
    const score = both / (new Set([...mine, ...theirs]).size || 1);
    if (score > bestScore) { best = s; bestScore = score; }
  }
  return best ? { screen: best, mode: 'sibling' } : null;
}

const sameProps = (a = {}, b = {}) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)].filter((k) => k !== 'standInFor'));
  return [...keys].every((k) => key(a[k] ?? '') === key(b[k] ?? '') || a[k] == null || b[k] == null);
};

// The drawn page against the designed screen → [{ kind: 'page' | 'place' | 'size' | 'text', what, message, off }].
// rendered: [{ path, x, y, w, h, fontSize, pad: [t, r, b, l], gaps: [between consecutive children] }] (renderExpression).
// 'page' and 'place' are the prototype's own arrangement; 'size' is a component drawn at another size than Figma's, a
// difference in the component's code (the audit's to fix), never the prototype's.
// drawn: the components the page draws from their code (one the code lacks is a labelled box, its size not its own).
export function compareWithScreen(tree, rendered, screen, { mode = 'redraw', catalog = { components: {} }, tolerance = 2, drawn = null } = {}) {
  const out = [];
  const at = new Map(rendered.map((r) => [r.path, r]));
  const nodes = compositionPaths(tree);
  const root = at.get('0');
  const s = screen.tree ?? {};
  const label = (n) => (n.component === 'Text' ? `the text "${String(n.props?.text ?? '').slice(0, 30)}"` : `the ${n.component}${n.props?.Label ?? n.props?.label ? ` "${n.props.Label ?? n.props.label}"` : ''}`);
  if (root) {
    if (s.w && Math.abs(root.w - s.w) > tolerance) out.push({ kind: 'page', what: 'width', off: Math.abs(root.w - s.w), message: `the page is ${round(root.w)}px wide, the designed screen "${screen.name}" ${s.w}px` });
    const pad = s.pad ?? [0, 0, 0, 0];
    const sides = ['top', 'right', 'bottom', 'left'].filter((_, i) => Math.abs((root.pad?.[i] ?? 0) - (pad[i] ?? 0)) > 1);
    if (sides.length && s.layout && s.layout !== 'NONE') out.push({ kind: 'page', what: 'padding', off: Math.max(...sides.map((x) => Math.abs((root.pad?.[['top', 'right', 'bottom', 'left'].indexOf(x)] ?? 0) - (pad[['top', 'right', 'bottom', 'left'].indexOf(x)] ?? 0)))), message: `the page's padding is ${(root.pad ?? []).map(round).join(' ')}px, "${screen.name}" uses ${pad.join(' ')}px` });
    // The space between the page's sections as drawn (component margins included), against the screen's spacing.
    if (s.layout && s.layout !== 'NONE' && (root.gaps ?? []).length) {
      const want = s.justify === 'SPACE_BETWEEN' ? null : (s.gap ?? 0);
      const off = want == null ? [] : root.gaps.filter((g) => Math.abs(g - want) > 1);
      if (off.length) out.push({ kind: 'page', what: 'spacing', off: Math.max(...off.map((g) => Math.abs(g - want))), message: `the space between the page's sections is ${[...new Set(root.gaps.map(round))].join(', ')}px, "${screen.name}" spaces them ${want}px` });
    }
  }
  // The parts both show, in reading order: the system's components (redrawing the screen: the next instance of the same
  // component; a new page: the same component with the same options, anywhere on the screen), and the same text.
  const figma = screenInstances(s, catalog);
  const texts = screenBoxes(s).filter((b) => b.node.kind === 'text');
  const used = new Set(), usedText = new Set(), pairs = [];
  for (const { path, node } of nodes) {
    const r = at.get(path);
    if (!r) continue;
    if (node.component === 'Text') {
      const i = texts.findIndex((t, j) => !usedText.has(j) && key(t.node.text) && key(t.node.text) === key(node.props?.text));
      if (i < 0) continue;
      usedText.add(i);
      const f = texts[i];
      if (r.fontSize && f.node.size && Math.abs(r.fontSize - f.node.size) > 0.5) out.push({ kind: 'text', what: 'text', off: Math.abs(r.fontSize - f.node.size), message: `${label(node)} is ${round(r.fontSize)}px, ${f.node.size}px in Figma` });
      pairs.push({ path, node, r, f });
      continue;
    }
    if (PIECES.has(node.component) || !catalog.components?.[node.component]) continue;
    const i = figma.findIndex((f, j) => !used.has(j) && f.component === node.component && (mode === 'redraw' || sameProps(f.props, node.props)));
    if (i < 0) continue;
    used.add(i);
    const f = figma[i];
    // Its height is the component's own (a difference in its code, for the audit). Its width may be the screen's: an
    // instance stretched or resized there, which no option of the prototype sets.
    const own = !drawn || drawn.has(node.component);
    if (own && Math.abs(r.h - f.h) > 1) out.push({ kind: 'size', what: node.component, off: Math.abs(r.h - f.h), message: `${label(node)} is drawn ${round(r.h)}px tall, ${f.h}px in Figma (the component's own size: a difference in its code, for the audit)` });
    if (own && !f.node.fillW && Math.abs(r.w - f.w) > Math.max(2, f.w * 0.04)) out.push({ kind: 'size', what: node.component, off: Math.abs(r.w - f.w), message: `${label(node)} is drawn ${round(r.w)}px wide, ${f.w}px on the screen in Figma (the component's width, or the instance resized on the screen)` });
    pairs.push({ path, node, r, f });
  }
  // Redrawing the screen: each part's place against what comes before it in the same container of the composition
  // (the space between them, across a Row or down anything else, and their alignment), and the page's first part from
  // its corner. What comes before may be a whole group (a Row of chips): its extent is the box around the parts in it
  // both sides show. So a part drawn wider moves nothing after it into a finding, and parts in different columns are
  // never compared. Parts that overlap in Figma (one placed over another) are not a flow and are left out.
  if (mode === 'redraw') {
    const add = (p, off, message) => out.push({ kind: 'place', what: p.node.component, off: Math.abs(off), message });
    const ok = (b) => b && Number.isFinite(b.x) && Number.isFinite(b.y);
    const kindAt = new Map(nodes.map((x) => [x.path, x.node.component]));
    const extent = (path, side) => {
      const boxes = pairs.filter((p) => (p.path === path || p.path.startsWith(`${path}.`)) && ok(p.f)).map((p) => p[side]);
      if (!boxes.length) return null;
      const x = Math.min(...boxes.map((b) => b.x)), y = Math.min(...boxes.map((b) => b.y));
      return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y };
    };
    for (const p of pairs) {
      if (!ok(p.f)) continue;
      const parts = p.path.split('.'), parent = parts.slice(0, -1).join('.'), at = Number(parts[parts.length - 1]);
      let prev = null;
      for (let i = at - 1; i >= 0 && !prev; i--) { const f = extent(`${parent}.${i}`, 'f'); if (f) prev = { f, r: extent(`${parent}.${i}`, 'r'), node: nodes.find((x) => x.path === `${parent}.${i}`).node }; }
      if (!prev) {
        if (parent !== '0') continue;
        const dx = p.r.x - p.f.x, dy = p.r.y - p.f.y;
        const msgs = [Math.abs(dy) > tolerance ? `${round(Math.abs(dy))}px ${dy > 0 ? 'lower' : 'higher'}` : null, Math.abs(dx) > tolerance ? `${round(Math.abs(dx))}px ${dx > 0 ? 'further right' : 'further left'}` : null].filter(Boolean);
        if (msgs.length) add(p, Math.max(Math.abs(dx), Math.abs(dy)), `${label(p.node)} sits ${msgs.join(' and ')} than in "${screen.name}" (from the page's top left corner)`);
        continue;
      }
      const beside = kindAt.get(parent) === 'Row';
      const space = (b, a) => (beside ? b.x - (a.x + a.w) : b.y - (a.y + a.h));
      const align = (b, a) => (beside ? b.y - a.y : b.x - a.x);
      if (space(p.f, prev.f) < 0) continue;
      const before = PIECES.has(prev.node.component) && prev.node.component !== 'Text' ? `the ${prev.node.component === 'Row' ? 'row' : 'group'} above it` : label(prev.node);
      const ds = space(p.r, prev.r) - space(p.f, prev.f), da = align(p.r, prev.r) - align(p.f, prev.f);
      if (Math.abs(ds) > tolerance) add(p, ds, `the space between ${before} and ${label(p.node)} is ${round(space(p.r, prev.r))}px, ${round(space(p.f, prev.f))}px in "${screen.name}"`);
      else if (Math.abs(da) > tolerance) add(p, da, `${label(p.node)} sits ${round(Math.abs(da))}px ${beside ? (da > 0 ? 'lower' : 'higher') : (da > 0 ? 'further right' : 'further left')} against ${before} than in "${screen.name}"`);
    }
  }
  const order = { page: 0, place: 1, text: 2, size: 3 };
  const seen = new Set();
  return out.filter((d) => !seen.has(d.message) && seen.add(d.message)).sort((a, b) => order[a.kind] - order[b.kind] || b.off - a.off);
}

// What the page measures, from the browser: every drawn node's box relative to the page, its font size, the padding of
// the engine's pieces and the space between their children.
export const RENDER_EXPRESSION = `(() => {
  const root = document.querySelector('[data-pt-path="0"]');
  if (!root) return null;
  const o = root.getBoundingClientRect();
  return [...document.querySelectorAll('[data-pt-path]')].map((e) => {
    const r = e.getBoundingClientRect(), s = getComputedStyle(e);
    const kids = [...e.children].filter((k) => k.hasAttribute('data-pt-path')).map((k) => k.getBoundingClientRect());
    const row = s.flexDirection === 'row';
    const gaps = kids.slice(1).map((k, i) => row ? k.left - kids[i].right : k.top - kids[i].bottom);
    return { path: e.getAttribute('data-pt-path'), x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height, fontSize: parseFloat(s.fontSize),
      pad: [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft].map(parseFloat), gaps };
  });
})()`;

// How the page works, tried in the browser: each part that opens another (a dialog, a menu) is clicked, the part must
// show with the focus inside it, Escape must close it and the focus go back; each field must take what is typed.
// → [{ kind: 'opens', id, by, opened, focusInside, closed, focusBack } | { kind: 'field', path, where, takes }]
export const INTERACT_EXPRESSION = `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = [];
  const shown = (e) => !!e && e.isConnected && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
  const FIELDS = 'input:not([type]), input[type=text], input[type=search], input[type=email], input[type=url], input[type=tel], input[type=password], textarea';
  const fields = (root, where) => {
    for (const f of [...root.querySelectorAll(FIELDS)]) {
      if (f.disabled || !shown(f)) continue;
      const before = f.value; f.focus();
      out.push({ kind: 'field', path: (f.closest('[data-pt-path]') || f).getAttribute('data-pt-path'), where, takes: document.activeElement === f && !f.readOnly });
      f.value = before;
    }
  };
  fields(document.getElementById('pt-canvas'), null);
  for (const t of [...document.querySelectorAll('#pt-canvas [data-pt-opens]')]) {
    const id = t.getAttribute('data-pt-opens');
    const by = (t.getAttribute('aria-label') || t.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 60) || t.getAttribute('data-pt-path');
    t.click(); await wait(80);
    const el = document.querySelector('[data-pt-overlay="' + id + '"]');
    const opened = shown(el);
    const focusInside = opened && el.contains(document.activeElement);
    if (opened) fields(el, id);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    let closed = false;
    for (let i = 0; i < 40 && !closed; i++) { await wait(50); closed = !document.querySelector('[data-pt-layer="' + id + '"]'); }
    out.push({ kind: 'opens', id, by, opened, focusInside, closed, focusBack: closed && document.activeElement === t });
  }
  return out;
})()`;

// The lines for what did not work: a part that does not open what it names, an overlay that keeps the focus out or
// does not close with Escape, a field that takes no typing.
export function interactionLines(list = []) {
  const out = [];
  for (const i of list) {
    if (i.kind === 'opens') {
      if (!i.opened) out.push(`⚠️  "${i.by}" does not open ${i.id}`);
      else {
        if (!i.focusInside) out.push(`⚠️  ${i.id} opens without the focus inside it`);
        if (!i.closed) out.push(`⚠️  ${i.id} does not close with Escape`);
        else if (!i.focusBack) out.push(`⚠️  closing ${i.id} does not give the focus back to "${i.by}"`);
      }
    } else if (i.kind === 'field' && !i.takes) out.push(`⚠️  the field at ${i.path}${i.where ? ` in ${i.where}` : ''} takes no typing`);
  }
  return out;
}

// Every state at every screen width, with the words as written and 40% longer (as a translation makes them): what
// runs past the screen's edge, a text cut or spilling out of its box, a control's label on two lines, and on a phone a
// target smaller than 24px (WCAG 2.5.8). → [{ kind, path, component, text, w, h, over }]
export const FIT_EXPRESSION = (state, pseudo, phone) => `(async () => {
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  window.__ptShow(${JSON.stringify(state)});
  const canvas = document.getElementById('pt-canvas'), root = document.querySelector('[data-pt-path="0"]');
  if (!root) return [];
  root.style.width = '100%'; root.style.maxWidth = '100%';
  const orig = new Map();
  const texts = () => { const out = [], w = document.createTreeWalker(canvas, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) if (n.textContent.trim() && !n.parentNode.closest('svg, script, style')) out.push(n); return out; };
  if (${pseudo ? 'true' : 'false'}) {
    const acc = { a: 'å', e: 'é', i: 'î', o: 'ö', u: 'ü', c: 'ç', n: 'ñ', s: 'š', y: 'ý', A: 'Å', E: 'É', I: 'Î', O: 'Ö', U: 'Ü', C: 'Ç', N: 'Ñ', S: 'Š' };
    const longer = (t) => { const core = t.trim(); if (!core) return t; const pad = Math.max(2, Math.ceil(core.length * 0.4)); return t.replace(core, core.replace(/[a-zA-Z]/g, (c) => acc[c] || c) + ' ' + 'ẋ'.repeat(pad)); };
    for (const n of texts()) { orig.set(n, n.textContent); n.textContent = longer(n.textContent); }
    for (const f of canvas.querySelectorAll('input[placeholder], textarea[placeholder]')) f.placeholder = longer(f.placeholder);
  }
  await frame();
  const out = [];
  const where = (el) => { const p = el.closest('[data-pt-path]'); const c = el.closest('[data-pt-component]'); return { path: p ? p.getAttribute('data-pt-path') : null, component: c ? c.getAttribute('data-pt-component') : null }; };
  const say = (n) => (orig.get(n) ?? n.textContent).trim().replace(/\\s+/g, ' ').slice(0, 60);
  const vw = document.documentElement.clientWidth;
  const wordsIn = (e) => { const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT); const out = []; let n; while ((n = w.nextNode())) if (n.textContent.trim() && !n.parentNode.closest('svg')) out.push((orig.get(n) ?? n.textContent).trim()); return out.join(' ').replace(/\\s+/g, ' '); };
  // Past the screen's edge: the innermost parts that reach beyond it (measured, since a system's CSS often hides the
  // page's own overflow), unless a part between them and the page scrolls or cuts on purpose.
  const scrolls = (e) => { for (let a = e.parentElement; a && a !== canvas; a = a.parentElement) { const cs = getComputedStyle(a); if (/auto|scroll|hidden|clip/.test(cs.overflowX) && a.getBoundingClientRect().right <= vw + 1) return true; } return false; };
  const past = [...canvas.querySelectorAll('[data-pt-path]')].filter((e) => { const b = e.getBoundingClientRect(); return b.width && (b.right > vw + 1 || b.left < -1) && !scrolls(e); });
  for (const e of past.filter((e) => !past.some((o) => o !== e && e.contains(o))).slice(0, 6)) { const b = e.getBoundingClientRect(); out.push({ kind: 'wide', ...where(e), text: wordsIn(e).slice(0, 40), over: Math.round(Math.max(b.right - vw, -b.left)), screen: vw }); }
  const CONTROL = 'button, a, label, [role=button], [role=tab], [role=switch], [role=option], [role=menuitem], [role=checkbox], [role=radio]';
  for (const n of texts()) {
    const el = n.parentElement; if (!el || !el.getClientRects().length) continue;
    const r = document.createRange(); r.selectNodeContents(n);
    const tr = r.getBoundingClientRect(); if (!tr.width) continue;
    const lines = new Set([...r.getClientRects()].filter((x) => x.width > 1).map((x) => Math.round(x.top))).size;
    // Cut: a box between the words and the page that hides what does not fit, or an ellipsis.
    let cut = null;
    for (let a = el; a && a !== canvas; a = a.parentElement) {
      const cs = getComputedStyle(a), ar = a.getBoundingClientRect();
      const hides = /hidden|clip/.test(cs.overflowX + cs.overflow);
      if ((hides || cs.textOverflow === 'ellipsis') && (tr.right > ar.right + 1 || tr.left < ar.left - 1 || (a === el && a.scrollWidth > a.clientWidth + 1))) { cut = a; break; }
      if (a.hasAttribute('data-pt-component')) break;
    }
    const box = el.closest('[data-pt-component]') || el;
    if (cut) out.push({ kind: 'cut', ...where(el), text: say(n) });
    else if (box !== el && tr.right > box.getBoundingClientRect().right + 1) out.push({ kind: 'spill', ...where(el), text: say(n) });
    else if (lines > 1 && el.closest(CONTROL) && canvas.contains(el.closest(CONTROL))) out.push({ kind: 'wraps', ...where(el), text: say(n), lines });
  }
  if (${phone ? 'true' : 'false'}) {
    for (const t of canvas.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=switch], [role=checkbox], [role=radio], [role=option], [role=link]')) {
      const b = t.getBoundingClientRect(); if (!b.width || !b.height) continue;
      const lab = t.closest('label'); const lb = lab && canvas.contains(lab) ? lab.getBoundingClientRect() : null;
      const w = Math.max(b.width, lb ? lb.width : 0), h = Math.max(b.height, lb ? lb.height : 0);
      if (w < 24 || h < 24) out.push({ kind: 'target', ...where(t), text: (t.getAttribute('aria-label') || t.textContent || t.getAttribute('placeholder') || '').trim().replace(/\\s+/g, ' ').slice(0, 40), w: Math.round(w), h: Math.round(h) });
    }
  }
  if (orig.size) window.__ptShow(${JSON.stringify(state)});
  return out;
})()`;

// The screen widths a prototype is tried at: Figma's breakpoints, else a phone's, a tablet's and a desktop's.
export function screenWidths(breakpoints = []) {
  const list = (breakpoints ?? []).filter((b) => Number.isFinite(b.px) && b.px >= 240).map((b) => ({ name: b.name, px: Math.round(b.px) }));
  return (list.length ? list : [{ name: 'Phone', px: 375 }, { name: 'Tablet', px: 768 }, { name: 'Desktop', px: 1280 }]).sort((a, b) => a.px - b.px);
}

// Everything found across states, widths and text lengths, one line per problem with where it happens.
// raw: [{ state, width, longer, issues }] → [{ kind, path, component, text, states, widths, longerOnly, … }]
export function fitFindings(raw = []) {
  const by = new Map();
  for (const run of raw) for (const i of run.issues ?? []) {
    const key = /^(wide|target)$/.test(i.kind) ? `${i.kind}|${i.path}` : `${i.kind}|${i.path}|${i.text}`;
    if (!by.has(key)) by.set(key, { ...i, states: [], widths: [], asWritten: false });
    const f = by.get(key);
    if (!f.states.includes(run.state)) f.states.push(run.state);
    if (!f.widths.includes(run.width)) f.widths.push(run.width);
    if (!run.longer) f.asWritten = true;
    if (i.over > (f.over ?? 0)) f.over = i.over;
  }
  return [...by.values()].sort((a, b) => b.asWritten - a.asWritten);
}
const KIND_WORDS = { cut: 'is cut', spill: 'runs out of its box', wraps: 'wraps onto two lines' };
export function fitLines(list = [], { states = ['default'] } = {}) {
  return list.map((f) => {
    const who = `${f.component ?? (f.kind === 'wide' ? `the part at ${f.path}` : 'a control')}${f.text ? ` "${f.text}"` : ''}`;
    const what = f.kind === 'wide' ? `${who} runs ${f.over ? `${f.over}px ` : ''}past the screen's edge`
      : f.kind === 'target' ? `${who} is ${f.w}×${f.h}px, smaller than 24px to tap`
      : `"${f.text}"${f.component ? ` in ${f.component}` : ''} ${KIND_WORDS[f.kind]}`;
    const st = states.length > 1 && f.states.length < states.length ? `, in the ${f.states.join(', ')} state${f.states.length === 1 ? '' : 's'}` : '';
    return `⚠️  ${what} at ${f.widths.join(', ')}${st}${f.asWritten ? '' : ', with the words 40% longer (as a translation makes them)'}`;
  });
}

// Open the drawn page, measure it, save its picture, and compare the picture with the Figma image of the screen when
// one is at hand, and try how it works. Returns { rendered, picture, visual, interactions } or { why } when Chrome is missing or the page did not draw.
export async function renderPrototype(ROOT, cfg, page, { name, screen = null, mode = 'sibling', chromePath = findChrome({ playwright: true }), outDir = OUT_DIR, token, fetchImpl, widths = screenWidths() } = {}) {
  if (!chromePath || typeof WebSocket === 'undefined') return { why: 'Chrome not found' };
  const chrome = await launchChrome(chromePath, { tmpPrefix: 'prototype-render-' });
  try {
    const cdp = await connectCDP(chrome.wsUrl);
    try {
      const { sessionId } = await openPage(cdp.send, 'about:blank');
      const width = Math.max(1024, (screen?.tree?.w ?? 0) + 64);
      await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 2, mobile: false }, sessionId);
      const errors = [];
      cdp.on('Runtime.exceptionThrown', (e) => errors.push(String(e.exceptionDetails?.exception?.description ?? e.exceptionDetails?.text ?? '').split('\n')[0]));
      await cdp.send('Page.enable', {}, sessionId);
      await cdp.send('Page.navigate', { url: pathToFileURL(page).href }, sessionId);
      if (!(await waitForTrue(cdp.send, sessionId, `${FILE_PAGE_LOADED} && !!document.querySelector('[data-pt-path="0"]')`, { tolerateErrors: true }))) return { why: `the page did not draw${errors.length ? `: ${errors[0]}` : ''}` };
      // The design's fonts, when the page loads them: measured once they are in (or after 3s without them).
      await cdp.send('Runtime.evaluate', { expression: `Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 3000))]).then(() => true)`, awaitPromise: true, returnByValue: true }, sessionId).catch(() => null);
      const rendered = (await cdp.send('Runtime.evaluate', { expression: RENDER_EXPRESSION, returnByValue: true }, sessionId)).result?.value ?? [];
      // The picture: the page itself, without the engine's bar, at scale 2 as Figma exports.
      const box = (await cdp.send('Runtime.evaluate', { expression: `(() => { const e = document.querySelector('[data-pt-path="0"]'); const kids = [...e.children]; const r = e.getBoundingClientRect(); const pb = parseFloat(getComputedStyle(e).paddingBottom) || 0; const bottom = kids.length ? Math.max(...kids.map((k) => k.getBoundingClientRect().bottom)) + pb : r.bottom; return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: Math.max(1, bottom - r.top) }; })()`, returnByValue: true }, sessionId)).result?.value;
      const dir = resolve(ROOT, outDir, 'prototypes');
      mkdirSync(dir, { recursive: true });
      const picture = join(dir, `${name}.png`);
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { x: box.x, y: box.y, width: box.w, height: box.h, scale: 1 }, captureBeyondViewport: true }, sessionId);
      writeFileSync(picture, Buffer.from(shot.data, 'base64'));
      const interactions = (await cdp.send('Runtime.evaluate', { expression: INTERACT_EXPRESSION, awaitPromise: true, returnByValue: true }, sessionId).catch(() => null))?.result?.value ?? null;
      let visual = null;
      if (screen && mode === 'redraw') {
        const img = await figmaImage(ROOT, cfg, screen.name, { nodeId: screen.id, folder: 'screens', token, fetchImpl, outDir });
        if (img.file) {
          // The page drawn again at the Figma image's own scale (an MCP screenshot is at 1, an export often at 2).
          const figmaPng = readFileSync(img.file);
          const scale = figmaPng.readUInt32BE(16) / box.w / 2;
          const same = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { x: box.x, y: box.y, width: box.w, height: box.h, scale }, captureBeyondViewport: true }, sessionId);
          const dataUrl = (b) => `data:image/png;base64,${b.toString('base64')}`;
          const r = (await cdp.send('Runtime.evaluate', { expression: compareExpression(dataUrl(figmaPng), dataUrl(Buffer.from(same.data, 'base64')), '#ffffff', 10, [], 1), awaitPromise: true, returnByValue: true }, sessionId)).result?.value;
          if (r) {
            const diff = join(dir, `${name}.diff.png`);
            writeFileSync(diff, Buffer.from(r.png, 'base64'));
            visual = { pct: Math.round((1000 * r.diff) / r.total) / 10, figmaSize: r.figma, pageSize: r.code, diff, from: img.from };
          }
        } else visual = { why: img.why };
      }
      // Every state at every screen width, as written and with longer words; a picture of each width and each state.
      const states = (await cdp.send('Runtime.evaluate', { expression: 'window.__ptStates || ["default"]', returnByValue: true }, sessionId)).result?.value ?? ['default'];
      const runs = [], pictures = [];
      const shoot = async (file) => {
        const b = (await cdp.send('Runtime.evaluate', { expression: `(() => { document.documentElement.style.overflow = 'visible'; document.body.style.overflow = 'visible'; const e = document.querySelector('[data-pt-path="0"]'); e.style.width = '100%'; e.style.maxWidth = '100%'; const r = e.getBoundingClientRect(); const bottom = Math.max(r.bottom, ...[...e.querySelectorAll('[data-pt-path]')].map((k) => k.getBoundingClientRect().bottom + (parseFloat(getComputedStyle(e).paddingBottom) || 0))); return { x: r.left + scrollX, y: r.top + scrollY, w: Math.max(1, r.width), h: Math.max(1, bottom - r.top) }; })()`, returnByValue: true }, sessionId)).result?.value;
        if (!b) return;
        const shot = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { x: b.x, y: b.y, width: b.w, height: b.h, scale: 1 }, captureBeyondViewport: true }, sessionId);
        writeFileSync(file, Buffer.from(shot.data, 'base64')); pictures.push(file);
      };
      for (const w of widths) {
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: w.px, height: 900, deviceScaleFactor: 1, mobile: w.px < 600 }, sessionId);
        await cdp.send('Runtime.evaluate', { expression: `window.__ptSize && window.__ptSize(${JSON.stringify(w.name)})`, returnByValue: true }, sessionId);
        const phone = w.px < 600;
        for (const st of states) {
          for (const longer of [false, true]) {
            const issues = (await cdp.send('Runtime.evaluate', { expression: FIT_EXPRESSION(st, longer, phone), awaitPromise: true, returnByValue: true }, sessionId).catch(() => null))?.result?.value ?? [];
            runs.push({ state: st, width: w.name, longer, issues });
          }
          if (st === 'default') await shoot(join(dir, `${name}@${slugOf(w.name)}.png`));
          else if (w === widths[widths.length - 1]) await shoot(join(dir, `${name}.${slugOf(st)}.png`));
        }
      }
      await cdp.send('Runtime.evaluate', { expression: 'window.__ptShow && window.__ptShow("default")', returnByValue: true }, sessionId).catch(() => null);
      const fit = { widths: widths.map((w) => `${w.name} ${w.px}`), states, findings: fitFindings(runs), pictures };
      return { rendered, picture, visual, interactions, fit };
    } finally { cdp.close(); }
  } finally { chrome.kill(); }
}

// The lines the prototype command prints, and what the reply owes the person (the page's arrangement only).
export function screenLines(cmp, { screen, mode, picture, visual, root = '' } = {}) {
  const lines = [];
  const rel = (p) => String(p ?? '').replace(root + '/', '');
  lines.push(`📏 AGAINST THE DESIGNED SCREEN "${screen.name}"${mode === 'redraw' ? ' (this prototype redraws it)' : ' (the closest of the product\'s designed screens)'}: ${cmp.length ? `${cmp.length} difference(s)` : 'drawn as designed'}`);
  for (const d of cmp.slice(0, 12)) lines.push(`   ${d.kind === 'size' ? '•' : '⚠️ '} ${d.message}`);
  if (cmp.length > 12) lines.push(`   … ${cmp.length - 12} more`);
  if (visual?.pct != null) lines.push(`   🖼  ${visual.pct}% of pixels differ from the Figma image of "${screen.name}" (text included)  → ${rel(visual.diff)}`);
  else if (visual?.why) lines.push(`   🖼  ⏭ not compared with a Figma image (${visual.why}; save it at scale 2 as .design-system-engine-refs/screens/<screen>.png, or set FIGMA_TOKEN)`);
  if (picture) lines.push(`   picture of the page: ${rel(picture)}`);
  return lines;
}
export const owedFromScreen = (cmp) => cmp.filter((d) => d.kind === 'page' || d.kind === 'place');


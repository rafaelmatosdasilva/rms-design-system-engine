// motion-parity.mjs - motion against Figma.
//
// Figma says how a component moves in its prototype: a variant leads to another on a trigger (hover, press, click) with
// a transition, its duration and its easing (Smart animate, 200ms, ease out). The code says it in CSS: the transition on
// the state's rule (.button:hover), else on the component's own rule. This reads Figma's transitions (a read-only Plugin
// API capture, MOTION_CAPTURE_JS, kept as figma-motion.snapshot.json) and compares each with the code's: a change Figma
// animates and the code makes at once, a duration or a curve that differs. A spring in Figma (Gentle, Quick, Bouncy) has
// no CSS curve: only its duration is compared, and the line says so. Whether each animation stops for someone who asks
// for less motion is the accessibility check's (prefers-reduced-motion, in the browser and in the code).
// How a component moves on its own (a spinner turning, a panel opening and closing) is motion-components.mjs's, from
// the same capture: its Motion keyframes and the overlays its prototype opens.

import { walkCss } from './css-source.mjs';
import { bezierOf, sameEasing, timeMs } from './css-values.mjs';
import { HASH_SRC } from './figma-capture.mjs';

// Run with use_figma or figma-cli on the file, once (PAGE_IDS: the pages to read, null for every page). It only reads:
// every component set's variants and each prototype reaction that changes one variant into another, with its trigger
// (and the delay of an After delay) and transition; each component's Motion keyframes (its timeline's tracks, on it and
// its layers) and animation styles; and each overlay a prototype opens, with the component it shows and its transition.
// It is read in two calls (capture-chunks.mjs), each answer within BUDGET characters: CALL 'sums' gives the checksum
// of each item's record (a set, a component outside a set, or a page's overlays), from START (a page and an item on
// it), and says where the next page of them starts (next, null when all are read); CALL 'read' gives the records of
// the items IDS names, each with its checksum, as many as fit.
export const MOTION_CAPTURE_JS = `
const PAGE_IDS = __PAGE_IDS__;
const CALL = __CALL__, START = __START__, IDS = __IDS__, BUDGET = __BUDGET__;
__HASH__
const pages = PAGE_IDS ? (await Promise.all(PAGE_IDS.map((id) => figma.getNodeByIdAsync(id)))).filter(Boolean) : figma.root.children;
const FIELDS = ['ROTATION', 'OPACITY', 'TRANSLATION_X', 'TRANSLATION_Y', 'TRANSLATION_XY', 'SCALE_X', 'SCALE_Y', 'SCALE_XY'];
const ownerOf = async (n) => {
  if (n.type === 'COMPONENT') return n.parent && n.parent.type === 'COMPONENT_SET' ? n.parent.name : n.name;
  if (n.type === 'INSTANCE') { const m = await n.getMainComponentAsync(); return m ? (m.parent && m.parent.type === 'COMPONENT_SET' ? m.parent.name : m.name) : null; }
  return null;
};
const shown = async (d) => {
  if (d.type === 'COMPONENT' || d.type === 'INSTANCE') return ownerOf(d);
  if (!('findAllWithCriteria' in d)) return null;
  const near = d.findAllWithCriteria({ types: ['INSTANCE'] }).filter((i) => { let p = i.parent, k = 0; while (p && p !== d) { if (p.type === 'INSTANCE') return false; p = p.parent; k++; } return k <= 2; });
  near.sort((a, b) => b.width * b.height - a.width * a.height);
  return near.length ? ownerOf(near[0]) : null;
};
const valueOf = (v) => (v && typeof v.value === 'number' ? v.value : v && v.value && typeof v.value === 'object' && 'x' in v.value ? { x: v.value.x, y: v.value.y } : null);
const motionOf = (root, variant) => {
  const list = [];
  const visit = (n, path, depth) => {
    if (list.length >= 20) return;
    let anim = null, styles = [];
    try { anim = n.animations; } catch (e) { anim = null; }
    try { styles = (n.animationStyles || []).map((s) => ({ styleId: s.styleId, name: s.name, type: s.type, duration: s.duration, offset: s.timelineOffset, props: s.props })); } catch (e) { styles = []; }
    const tracks = {};
    for (const f of FIELDS) {
      const b = anim && anim[f];
      if (!b || !b.tracks || !b.tracks.length) continue;
      const kf = [];
      for (const t of b.tracks) for (const k of (t.keyframes || [])) kf.push({ t: k.timelinePosition, v: valueOf(k.value), e: k.easing || null });
      kf.sort((a, b2) => a.t - b2.t);
      const base = valueOf(b.baseValue), rec = (vals) => ({ base: vals(base), duration: b.timelineDuration, op: b.tracks[0].keyframeOperation, keyframes: kf.slice(0, 12).map((k) => ({ t: k.t, v: vals(k.v), e: k.e })) });
      if (f === 'TRANSLATION_XY') { tracks.TRANSLATION_X = rec((v) => (v ? v.x : null)); tracks.TRANSLATION_Y = rec((v) => (v ? v.y : null)); }
      else tracks[f] = rec((v) => v);
    }
    if (Object.keys(tracks).length || styles.length) list.push({ layer: path, variant, tracks, styles });
    if ('children' in n && depth < 4) for (const c of n.children) visit(c, path + '/' + c.name, depth + 1);
  };
  visit(root, root.name, 0);
  return list;
};
const want = IDS ? new Set(IDS) : null, entries = [];
let size = 2, next = null;
pages: for (let p = CALL === 'sums' ? START.page : 0; p < pages.length; p++) {
  const page = pages[p];
  await page.loadAsync();   // loaded where it is: switching the page would change the file
  const sets = page.findAllWithCriteria({ types: ['COMPONENT_SET'] });
  const solo = page.findAllWithCriteria({ types: ['COMPONENT'] }).filter((c) => !(c.parent && c.parent.type === 'COMPONENT_SET'));
  const items = [...sets, ...solo, 'overlays'];
  for (let i = CALL === 'sums' && p === START.page ? START.item : 0; i < items.length; i++) {
    const n = items[i], id = n === 'overlays' ? page.id + '#overlays' : n.id;
    if (want && !want.has(id)) continue;
    const list = [], ov = [], seen = new Set();
    let m = [];
    if (n === 'overlays') {
      const opens = page.findAll((x) => 'reactions' in x && (x.reactions || []).some((r) => (r.actions || (r.action ? [r.action] : [])).some((a) => a && a.type === 'NODE' && (a.navigation === 'OVERLAY' || a.navigation === 'SWAP'))));
      for (const o of opens) for (const r of o.reactions) for (const a of (r.actions || (r.action ? [r.action] : []))) {
        if (!a || a.type !== 'NODE' || !(a.navigation === 'OVERLAY' || a.navigation === 'SWAP') || !a.destinationId) continue;
        const dest = await figma.getNodeByIdAsync(a.destinationId);
        const component = dest ? await shown(dest) : null;
        if (!component) continue;
        const t = a.transition || null;
        const rec = { component, frame: dest.name, from: (await ownerOf(o)) || o.name, trigger: r.trigger ? r.trigger.type : null, navigation: a.navigation, position: 'overlayPositionType' in dest ? dest.overlayPositionType : null, transition: t ? { type: t.type, direction: t.direction || null, duration: t.duration, easing: t.easing || null } : null };
        const key = JSON.stringify([component, rec.transition]);
        if (seen.has(key)) continue;
        seen.add(key);
        ov.push(rec);
      }
    } else if (n.type === 'COMPONENT_SET') {
      for (const v of n.children) {
        for (const r of (v.reactions || [])) {
          const actions = r.actions || (r.action ? [r.action] : []);
          for (const a of actions) {
            if (!a || a.type !== 'NODE' || !a.destinationId) continue;
            const to = n.children.find((c) => c.id === a.destinationId);
            if (!to) continue;
            const t = a.transition || null;
            list.push({ from: v.variantProperties || {}, to: to.variantProperties || {}, trigger: r.trigger ? r.trigger.type : null, timeout: r.trigger && r.trigger.type === 'AFTER_TIMEOUT' ? r.trigger.timeout : undefined, type: t ? t.type : 'INSTANT', duration: t && typeof t.duration === 'number' ? t.duration : 0, easing: t && t.easing ? t.easing : null });
          }
        }
        m = m.concat(motionOf(v, v.name));
      }
    } else m = motionOf(n, null);
    if (!list.length && !m.length && !ov.length) continue;
    // What JSON keeps, so the checksum is over what the answer carries.
    const rec = JSON.parse(JSON.stringify({ name: n === 'overlays' ? '' : n.name, ...(list.length ? { transitions: list } : {}), ...(m.length ? { motion: m } : {}), ...(ov.length ? { overlays: ov } : {}) }));
    const sum = cyrb53(JSON.stringify(rec)), e = CALL === 'sums' ? [id, sum] : [id, sum, rec], add = JSON.stringify(e).length + 1;
    if (entries.length && size + add > BUDGET) { next = { page: p, item: i }; break pages; }
    entries.push(e); size += add;
    if (want) { want.delete(id); if (!want.size) break pages; }
  }
}
const note = 'Read-only capture of prototype transitions between variants, Motion keyframes and overlays (motion-parity.mjs).';
if (CALL === 'sums') return { capture: 'motion', kind: 'sums', _note: note, version: 2, start: START, next, sums: entries };
return { capture: 'motion', kind: 'read', _note: note, version: 2, items: entries, ...(next ? {} : { gone: [...want] }) };
`;

// The script for one call: { call: 'sums', start } (a page of the checksums, from start: a page and an item on it, a
// set, a component, or the page's overlays last) or { call: 'read', ids } (the records of those items), as
// capture-chunks.mjs asks for them.
export const motionCaptureScript = (pageIds = null, { call = 'sums', start = { page: 0, item: 0 }, ids = null, budget = 15000 } = {}) => {
  const pages = pageIds == null ? null : [pageIds].flat().filter(Boolean).map((id) => String(id).replace('-', ':'));
  return MOTION_CAPTURE_JS.replace('__PAGE_IDS__', JSON.stringify(pages && pages.length ? pages : null)).replace('__CALL__', JSON.stringify(call)).replace('__START__', JSON.stringify(start))
    .replace('__IDS__', JSON.stringify(call === 'read' ? ids ?? [] : null)).replace('__BUDGET__', String(budget)).replace('__HASH__', () => HASH_SRC).trim() + '\n';
};

// Figma's easing as CSS: its presets are cubic-bezier curves; a spring has none (null, with its name).
const FIGMA_EASE = { LINEAR: 'linear', EASE_IN: 'ease-in', EASE_OUT: 'ease-out', EASE_IN_AND_OUT: 'ease-in-out', EASE_IN_BACK: 'cubic-bezier(0.3, -0.05, 0.7, -0.5)', EASE_OUT_BACK: 'cubic-bezier(0.45, 1.45, 0.8, 1)', EASE_IN_AND_OUT_BACK: 'cubic-bezier(0.7, -0.4, 0.4, 1.4)' };
export function figmaEasing(e) {
  if (!e) return { css: 'linear' };
  if (FIGMA_EASE[e.type]) return { css: FIGMA_EASE[e.type] };
  const c = e.easingFunctionCubicBezier;
  if (e.type === 'CUSTOM_CUBIC_BEZIER' && c) return { css: `cubic-bezier(${c.x1}, ${c.y1}, ${c.x2}, ${c.y2})` };
  return { css: null, spring: String(e.type ?? 'a spring').toLowerCase().replace(/_/g, ' ') };
}

// The state a trigger leaves a component in, as CSS reads it: hover, active (pressed); a click or a key changes a
// variant the code sets itself (a class, an attribute), so its transition is the component's own.
export const STATE = { ON_HOVER: 'hover', WHILE_HOVERING: 'hover', MOUSE_ENTER: 'hover', ON_PRESS: 'active', WHILE_PRESSING: 'active', MOUSE_DOWN: 'active' };
export const TRIGGER_WORD = { ON_HOVER: 'hover', WHILE_HOVERING: 'hover', MOUSE_ENTER: 'hover', ON_PRESS: 'press', WHILE_PRESSING: 'press', MOUSE_DOWN: 'press', ON_CLICK: 'click', ON_KEY_DOWN: 'key', AFTER_TIMEOUT: 'delay', MOUSE_LEAVE: 'leave', MOUSE_UP: 'release', ON_DRAG: 'drag' };

// A transition declaration's parts: [{ prop, ms, easing, delay }], from the shorthand or the longhands.
const splitTop = (s) => { const out = []; let d = 0, cur = ''; for (const ch of String(s ?? '')) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && !d) { out.push(cur.trim()); cur = ''; } else cur += ch; } if (cur.trim()) out.push(cur.trim()); return out; };
export function transitionsOf(decls = []) {
  const get = (p) => decls.filter((d) => d.prop === p).at(-1)?.value ?? null;
  let items = [];
  const sh = get('transition');
  if (sh) items = splitTop(sh).map((part) => {
    const toks = part.match(/cubic-bezier\([^)]*\)|steps\([^)]*\)|[^\s]+/g) ?? [];
    const times = toks.map(timeMs).filter((x) => x != null);
    const easing = toks.find((t) => bezierOf(t) || /^steps\(|^step-(start|end)$/.test(t)) ?? 'ease';
    const prop = toks.find((t) => timeMs(t) == null && t !== easing) ?? 'all';
    return { prop, ms: times[0] ?? 0, delay: times[1] ?? 0, easing };
  });
  const durs = get('transition-duration'), eases = get('transition-timing-function'), props = get('transition-property');
  if (durs || eases || props) {
    const D = durs ? splitTop(durs).map(timeMs) : null, E = eases ? splitTop(eases) : null, P = props ? splitTop(props) : null;
    const n = Math.max(items.length, D?.length ?? 0, E?.length ?? 0, P?.length ?? 0, 1);
    items = Array.from({ length: n }, (_, i) => ({ prop: P ? P[i % P.length] : items[i]?.prop ?? 'all', ms: D ? D[i % D.length] ?? 0 : items[i]?.ms ?? 0, delay: items[i]?.delay ?? 0, easing: E ? E[i % E.length] : items[i]?.easing ?? 'ease' }));
  }
  return items.filter((x) => x.prop !== 'none');
}

// The code's transition into a state of a component: the state's own rule when it declares one (.button:hover), else
// the component's own rule. Rules inside a reduced-motion block are its other answer, not this one.
// sources: [{ file, text }]. → { ms, easing, selector, file, line } | null (no transition)
export function codeMotion(sources, cls, state = null) {
  const c = String(cls).replace(/^\./, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const base = new RegExp(`^\\.${c}$`), on = state ? new RegExp(`^\\.${c}(?:\\.[\\w-]+|\\[[^\\]]+\\])*:${state}(?![\\w-])`) : null;
  let own = null, at = null;
  for (const src of sources ?? []) for (const r of walkCss(String(src.text ?? ''), src.file)) {
    if ((r.atRules ?? []).some((a) => /prefers-reduced-motion/.test(a))) continue;
    if (!r.decls.some((d) => /^transition/.test(d.prop))) continue;
    for (const sel of r.selectors) {
      const s = sel.trim().replace(/\s+/g, ' ');
      if (on && on.test(s)) at = { decls: r.decls, selector: s, file: src.file, line: r.line };
      else if (base.test(s)) own = { decls: r.decls, selector: s, file: src.file, line: r.line };
    }
  }
  // A state's longhands (transition-duration alone) change only that part of the component's own transition.
  const hit = at ?? own;
  if (!hit) return null;
  const decls = at && own && !at.decls.some((d) => d.prop === 'transition') ? [...own.decls, ...at.decls] : hit.decls;
  const t = transitionsOf(decls);
  if (!t.length) return null;
  const longest = t.reduce((a, b) => (b.ms + b.delay > a.ms + a.delay ? b : a));
  return { ms: longest.ms, easing: longest.easing, selector: hit.selector, file: hit.file, line: hit.line };
}

const what = (from, to) => { const k = Object.keys(to ?? {}).filter((p) => String(from?.[p]) !== String(to[p])); return k.length ? k.map((p) => `${p} ${from?.[p] ?? '?'} to ${to[p]}`).join(', ') : 'to another variant'; };

// Each Figma transition against the code's. snapshot: the capture's components. classFor(name): the component's class.
// → [{ component, change, trigger, kind: 'none'|'duration'|'easing', message, figma: { ms, easing }, code? }]
export function motionFindings(snapshot, sources, classFor = () => null) {
  const out = [];
  for (const [component, list] of Object.entries(snapshot?.components ?? {})) {
    const cls = classFor(component);
    if (!cls) continue;
    const seen = new Set();
    for (const m of list) {
      if (!m || m.type === 'INSTANT' || !(m.duration > 0)) continue;   // Figma changes it at once: nothing to compare
      if (m.trigger === 'AFTER_TIMEOUT') continue;   // a variant that leads on by itself: a loop, motion-components.mjs's
      const state = STATE[m.trigger] ?? null;
      const key = `${state}|${m.duration}|${JSON.stringify(m.easing)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const ms = Math.round(m.duration * 1000), fe = figmaEasing(m.easing);
      const change = what(m.from, m.to), trigger = TRIGGER_WORD[m.trigger] ?? String(m.trigger ?? '').toLowerCase();
      const code = codeMotion(sources, cls, state);
      const base = { component, change, trigger, figma: { ms, easing: fe.css ?? fe.spring } };
      const say = `${component} ${change} on ${trigger}`;
      if (!code || !(code.ms > 0)) { out.push({ ...base, kind: 'none', message: `${say}: Figma animates it (${ms}ms, ${fe.css ?? fe.spring}); the code changes it at once` }); continue; }
      const where = `${code.selector}, ${code.file}:${code.line}`;
      if (Math.abs(code.ms - ms) > 10) out.push({ ...base, kind: 'duration', code, message: `${say}: the code takes ${code.ms}ms (${where}), Figma ${ms}ms` });
      if (fe.css && sameEasing(code.easing, fe.css) === false) out.push({ ...base, kind: 'easing', code, message: `${say}: the code eases ${code.easing} (${where}), Figma ${fe.css}` });
    }
  }
  return out;
}

// Each transition Figma's prototype animates, one row per component, change and trigger, with what the code does for
// it (findings: motionFindings' list): the style guide's motion page lists them. → [{ component, change, trigger, ms,
// easing, code }], code null when the code agrees.
export function prototypeTransitions(snapshot, findings = []) {
  const out = [], seen = new Set();
  for (const [component, list] of Object.entries(snapshot?.components ?? {})) {
    for (const m of list ?? []) {
      if (!m || m.type === 'INSTANT' || !(m.duration > 0)) continue;
      const change = what(m.from, m.to), trigger = TRIGGER_WORD[m.trigger] ?? String(m.trigger ?? '').toLowerCase();
      const key = `${component}|${change}|${trigger}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const fe = figmaEasing(m.easing);
      const off = findings.filter((f) => f.component === component && f.change === change && f.trigger === trigger);
      const code = off.length ? off.map((f) => (f.kind === 'none' ? 'changes at once' : f.kind === 'duration' ? `${f.code?.ms}ms` : `eases ${f.code?.easing}`)).join(', ') : null;
      out.push({ component, change, trigger, ms: Math.round(m.duration * 1000), easing: fe.css ?? fe.spring, code });
    }
  }
  return out;
}

// The whole check for a project: the snapshot, the theme and the system's sheets, each component's class.
// → { findings, compared } | null without a capture
export async function projectMotion(ROOT, cfg = {}) {
  const { readFileSync } = await import('node:fs');
  const { resolve, dirname, join } = await import('node:path');
  const file = cfg.paths?.snapshotMotion ?? join(dirname(cfg.paths?.snapshotVars ?? 'src/figma-vars.snapshot.json'), 'figma-motion.snapshot.json');
  let snap;
  try { snap = JSON.parse(readFileSync(resolve(ROOT, file), 'utf8')); } catch { return null; }
  const { loadCssSources } = await import('./css-source.mjs');
  const { loadLocator } = await import('./component-locator.mjs');
  // The theme and the component sheets ds-config.json names, and every other sheet of the system's own code (a
  // component's own button.css), never a product's.
  const named = loadCssSources(ROOT, [cfg.paths?.themeCSS ?? [], ...[cfg.paths?.componentCSS ?? []]].flat()).files;
  const { sourceFiles } = await import('./code-roots.mjs');
  const have = new Set(named.map((f) => f.file));
  const sources = [...named, ...sourceFiles(ROOT, cfg).filter((f) => /\.css$/i.test(f.file) && !f.file.startsWith('..') && !have.has(f.file))];
  const locator = await loadLocator(ROOT, cfg);
  const findings = motionFindings(snap, sources, (n) => locator.classFor(n));
  // How each component moves on its own: its loop, its opening and its closing, Figma's against the code's.
  const { componentMotionFindings } = await import('./motion-components.mjs');
  // Every component the system has: Figma's (its props snapshot), the contract's and the configured ones.
  let figmaNames = [];
  try { figmaNames = Object.keys(JSON.parse(readFileSync(resolve(ROOT, cfg.paths?.compPropsSnapshot ?? 'src/figma-component-props.snapshot.json'), 'utf8'))).filter((n) => !n.startsWith('_')); } catch { /* none yet */ }
  const own = componentMotionFindings(snap, sources, (n) => locator.classFor(n), [...new Set([...locator.names(), ...figmaNames])]);
  const compared = Object.values(snap.components ?? {}).reduce((k, l) => k + l.length, 0) + Object.values(snap.motion ?? {}).reduce((k, l) => k + l.length, 0) + (snap.overlays ?? []).length;
  return { findings: [...findings, ...own], compared, file, motionRead: !!(snap.motion || snap.overlays) };
}

// The motion snapshot from a capture's answer (what use_figma returned, saved as a file).
export function motionSnapshot(answer) {
  const a = typeof answer === 'string' ? JSON.parse(answer) : answer;
  const body = a?.components ? a : a?.result?.components ? a.result : null;
  if (!body) throw new Error('not a motion capture (no "components")');
  return { _updated: new Date().toISOString(), _note: 'Prototype transitions between variants, Motion keyframes and overlays, read from Figma (motion-parity.mjs MOTION_CAPTURE_JS).', ...(body.version ? { version: body.version } : {}), components: body.components, ...(body.motion ? { motion: body.motion } : {}), ...(body.overlays ? { overlays: body.overlays } : {}) };
}

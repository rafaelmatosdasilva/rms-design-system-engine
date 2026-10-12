// screen-a11y.mjs - the designed screens themselves, checked for accessibility (W1): what a person sees on each screen
// Figma has, before any code is written.
//
//   • contrast: each text and each icon that stands alone, measured from its own colour against what is drawn behind
//     it, inside every component instance with its overrides, every see-through layer composited in the order Figma
//     paints it (WCAG 1.4.3 for text, 1.4.11 for an icon);
//   • text on an image or a gradient: no one colour is behind it, so it cannot be measured; a solid plate behind the
//     words keeps it readable whatever the picture (1.4.3);
//   • a control under 24 by 24 (2.5.8).
//
// What only documents the screen (a spec, a redline, a legend, a callout, a dev note), what lies outside the screen and
// a control shown disabled (WCAG asks nothing of a disabled control's contrast or size) are left out. The token pairs a component's own layers draw are checked elsewhere (drawnOn); this reads the screens as
// they are drawn. Pure except SCREEN_A11Y_JS (run in Figma, never writes).

import { contrastRatio, aaThreshold, isLargeText } from './a11y-check.mjs';

// Run with use_figma or figma-cli (`figma-cli eval`) on the file, with SCREEN_IDS replaced by the screens' node ids.
// It only reads: no node, variable or style is created or changed.
export const SCREEN_A11Y_JS = `
const SCREEN_IDS = __SCREEN_IDS__;
// What documents the screen rather than being part of it, by its own or a parent's name.
const DOC = /(^|[^a-z])(specs?|annotations?|redlines?|measurements?|legend|documentation|handoff|hand-off|callouts?|dev ?notes?)([^a-z]|$)/i;
const ICON = /(^|[^a-z])(icons?|glyph|ico)([^a-z]|$)/i;
const SURFACE = /^(FRAME|COMPONENT|COMPONENT_SET|INSTANCE|RECTANGLE|ELLIPSE|SECTION|POLYGON)$/;
const vars = new Map();
async function varOf(id) { if (vars.has(id)) return vars.get(id); let v = null; try { v = await figma.variables.getVariableByIdAsync(id); } catch (e) {} vars.set(id, v); return v; }
// A solid paint as drawn here: its variable resolved for this node (its modes, its overrides), its opacity applied.
async function rgba(node, p, alpha) {
  let c = p.color;
  const id = p.boundVariables && p.boundVariables.color && p.boundVariables.color.id;
  if (id) { const v = await varOf(id); try { const r = v && v.resolveForConsumer(node); if (r && r.value && typeof r.value === 'object' && 'r' in r.value) c = r.value; } catch (e) {} }
  const a = (c && 'a' in c ? c.a : 1) * (p.opacity == null ? 1 : p.opacity) * alpha;
  return [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255), Math.round(a * 1000) / 1000];
}
// The visible paints of a node's fills (or strokes), bottom first: a colour, or G for a gradient, I for an image.
async function paints(node, key, alpha) {
  let list = node[key];
  if (list === figma.mixed && key === 'fills' && typeof node.getRangeFills === 'function') { try { list = node.getRangeFills(0, 1); } catch (e) { list = []; } }
  const out = [];
  for (const p of Array.isArray(list) ? list : []) {
    if (p.visible === false) continue;
    if (p.type === 'SOLID') { const c = await rgba(node, p, alpha); if (c[3] > 0) out.push(c); }
    else if (/^GRADIENT/.test(p.type)) out.push('G');
    else if (p.type === 'IMAGE' || p.type === 'VIDEO') out.push('I');
  }
  return out;
}
// An instance shown disabled (a State=Disabled variant, a Disabled toggle on, or the whole of it drawn at half its
// opacity or less, as a disabled control is): WCAG asks nothing of its contrast or size. "Inactive" is not disabled
// (a tab or a row not chosen), so it is measured.
const inactive = (n) => n.type === 'INSTANCE' && ((n.opacity != null && n.opacity <= 0.5) || Object.entries(n.componentProperties || {}).some(([k, v]) => v && ((v.type === 'VARIANT' && /disabled/i.test(String(v.value))) || (v.type === 'BOOLEAN' && v.value === true && /disabled/i.test(k)))));
const contains = (b, x, y) => x >= b[0] && x <= b[0] + b[2] && y >= b[1] && y <= b[1] + b[3];
const opaque = (p) => Array.isArray(p) && p[3] >= 1;
const screens = [], left = [];
const BUDGET = 19000;
let used = 300;
for (const id of SCREEN_IDS) {
  if (left.length) { left.push(id); continue; }
  const root = await figma.getNodeByIdAsync(id); if (!root) continue;
  const o = root.absoluteBoundingBox;
  const box = (n) => { const b = n.absoluteBoundingBox; return b ? [Math.round(b.x - o.x), Math.round(b.y - o.y), Math.round(b.width), Math.round(b.height)] : null; };
  // Every fill drawn so far, in the order Figma paints (a parent before its children, a layer before the ones above it).
  const under = [], inks = new Map(), small = new Map();
  let docs = 0, off = 0;
  // What is drawn behind a point: the fills that cover it, from the last opaque one up.
  const behind = (x, y) => { const at = under.filter((u) => contains(u.b, x, y)); let from = 0; at.forEach((u, i) => { if (u.p.some(opaque)) from = i; }); return at.slice(from).flatMap((u) => { const k = u.p.map(opaque).lastIndexOf(true); return k > 0 ? u.p.slice(k) : u.p; }); };
  const ink = (kind, fg, b, extra) => {
    const on = behind(b[0] + b[2] / 2, b[1] + b[3] / 2);
    const k = JSON.stringify([kind, fg, on, extra.s || 0, extra.w || 0]);
    const e = inks.get(k);
    if (e) e.n++; else inks.set(k, { k: kind, fg, on, ...extra, n: 1, at: [b[0], b[1]] });
  };
  async function walk(n, alpha, isRoot, dim) {
    if (!n || n.visible === false) return;
    if (!isRoot && DOC.test(n.name || '')) { docs++; return; }
    const a = alpha * (n.opacity == null ? 1 : n.opacity);
    if (a <= 0) return;
    const b = box(n);
    if (b && !isRoot && (b[0] + b[2] / 2 < 0 || b[1] + b[3] / 2 < 0 || b[0] + b[2] / 2 > o.width || b[1] + b[3] / 2 > o.height)) return;
    const isOff = dim || inactive(n);
    if (n.type === 'TEXT') {
      const text = String(n.characters || '').trim();
      if (!text || !b) return;
      if (isOff) { off++; return; }
      let s = n.fontSize, w = n.fontWeight;
      if (s === figma.mixed) { try { s = n.getRangeFontSize(0, 1); } catch (e) { s = 0; } }
      if (w === figma.mixed) { try { w = n.getRangeFontWeight(0, 1); } catch (e) { w = 400; } }
      const fg = await paints(n, 'fills', a);
      if (fg.length) ink('t', fg[fg.length - 1], b, { s: Math.round((s || 0) * 100) / 100, w: w || 400, ex: text.slice(0, 32) });
      return;
    }
    // A control drawn smaller than 24 by 24: its component, for the engine to tell a control from an ornament.
    if (n.type === 'INSTANCE' && b && !isOff && (b[2] < 24 || b[3] < 24)) {
      let name = n.name;
      try { const m = await n.getMainComponentAsync(); name = m ? (m.parent && m.parent.type === 'COMPONENT_SET' ? m.parent.name : m.name) : n.name; } catch (e) {}
      const k = name + ' ' + b[2] + 'x' + b[3];
      const e = small.get(k); if (e) e.n++; else small.set(k, { c: name, w: b[2], h: b[3], n: 1, at: [b[0], b[1]] });
    }
    // An icon: its colour is its first drawn shape's; it counts when no words sit beside it in its parent.
    if (b && ICON.test(n.name || '') && b[2] <= 64 && b[3] <= 64 && n.type !== 'TEXT') {
      if (isOff) { off++; return; }
      const parent = n.parent;
      const words = parent && typeof parent.findOne === 'function' && parent.findOne((x) => x.type === 'TEXT' && x.visible !== false && String(x.characters || '').trim());
      if (!words) {
        const shape = typeof n.findOne === 'function' ? n.findOne((x) => x.visible !== false && /^(VECTOR|BOOLEAN_OPERATION|STAR|POLYGON|ELLIPSE|LINE|RECTANGLE)$/.test(x.type) && ((Array.isArray(x.fills) && x.fills.some((p) => p.visible !== false && p.type === 'SOLID')) || (Array.isArray(x.strokes) && x.strokes.some((p) => p.visible !== false && p.type === 'SOLID')))) : null;
        if (shape) { const fill = await paints(shape, 'fills', a), stroke = await paints(shape, 'strokes', a); const fg = (fill.length ? fill : stroke).filter(Array.isArray); if (fg.length) { let name = n.name; if (n.type === 'INSTANCE') { try { const m = await n.getMainComponentAsync(); if (m) name = m.parent && m.parent.type === 'COMPONENT_SET' ? m.parent.name : m.name; } catch (e) {} } ink('i', fg[fg.length - 1], b, { ex: String(name).slice(0, 32) }); } }
      }
      return;
    }
    if (b && SURFACE.test(n.type) && !n.isMask) { const p = await paints(n, 'fills', a); if (p.length) under.push({ b, p }); }
    if ('children' in n) for (const k of n.children) await walk(k, a, false, isOff);
  }
  await walk(root, 1, true, false);
  const s = { id, name: root.name, w: Math.round(o.width), h: Math.round(o.height), inks: [...inks.values()], small: [...small.values()], ...(docs ? { docs } : {}), ...(off ? { off } : {}) };
  // Too large for one answer on its own: its examples' words first, then its rarest combinations (counted, cut).
  if (JSON.stringify(s).length > BUDGET - 300) { s.inks = s.inks.map((x) => ({ ...x, ex: x.ex ? x.ex.slice(0, 8) : x.ex })); s.cut = true; }
  while (JSON.stringify(s).length > BUDGET - 300 && s.inks.length > 1) { s.inks.sort((p, q) => q.n - p.n); s.more = (s.more || 0) + s.inks.length - Math.floor(s.inks.length * 0.8); s.inks = s.inks.slice(0, Math.floor(s.inks.length * 0.8)); }
  const size = JSON.stringify(s).length;
  if (screens.length && used + size > BUDGET) { left.push(id); continue; }
  screens.push(s); used += size + 1;
}
return { _captured: new Date().toISOString(), _note: 'Read-only accessibility capture of designed screens (screen-a11y.mjs).', screens, ...(left.length ? { left } : {}) };
`;

export function screenA11yCaptureScript(ids) {
  return SCREEN_A11Y_JS.replace('__SCREEN_IDS__', JSON.stringify(ids.map((i) => String(i).replace('-', ':'))));
}

// What use_figma returned (its answer as saved, or the object) → { screens, left }.
export function screenA11ySnapshot(saved) {
  let o = typeof saved === 'string' ? JSON.parse(saved) : saved;
  if (o && !o.screens && o.result) o = typeof o.result === 'string' ? JSON.parse(o.result) : o.result;
  if (!o || !Array.isArray(o.screens)) throw new Error('not a screen accessibility capture: it has no screens');
  return o;
}

// The answers so far and a new one: each screen once, the newest kept, in the order ds-config names them.
export function mergeA11yScreens(prev = [], next = [], ids = []) {
  const byId = new Map([...prev, ...next].map((s) => [s.id, s]));
  const order = ids.map((i) => String(i).replace('-', ':'));
  return [...byId.values()].filter((s) => !order.length || order.includes(s.id)).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}

const hex = ({ r, g, b }) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const over = (top, under) => ({ r: top[0] * top[3] + under.r * (1 - top[3]), g: top[1] * top[3] + under.g * (1 - top[3]), b: top[2] * top[3] + under.b * (1 - top[3]) });

// What the eye sees behind something: its stack of fills composited over a white canvas, or null when an image or a
// gradient is part of it (no one colour to measure against).
export function surfaceOf(stack = []) {
  let at = { r: 255, g: 255, b: 255 };
  for (const p of stack) { if (!Array.isArray(p)) return null; at = over(p, at); }
  return at;
}

const INTERACTIVE = /^(button|togglebutton|toggle|iconbutton|checkbox|radio|switch|tab|link|textbox|textfield|textinput|input|searchbox|combobox|select|spinbutton|stepper|slider|disclosure|accordion|menuitem|option)$/;
const CONTROL_NAME = /button|toggle|check ?box|radio|switch|tab(?!le)|link|input|field|stepper|slider|select|chip|segment/i;

// snapshot: { screens } from the capture · roles: { component: role } (Figma's role annotations or the contract) →
// [{ screen, kind: 'contrast'|'plate'|'bare'|'target', what, n, ratio?, need?, fg?, bg?, criterion, fix }]
export function screenA11yFindings(snapshot = {}, { roles = {} } = {}) {
  const out = [];
  const norm = (s) => String(s ?? '').toLowerCase().replace(/[\s_-]+/g, '');
  const roleOf = (c) => roles[c] ?? roles[norm(c)] ?? Object.entries(roles).find(([k]) => norm(k) === norm(c))?.[1] ?? null;
  // Two screens with one name (the same window in two themes) are told apart by their node ids.
  const named = {}; for (const s of snapshot.screens ?? []) named[s.name] = (named[s.name] || 0) + 1;
  for (const raw of snapshot.screens ?? []) {
    const s = named[raw.name] > 1 ? { ...raw, name: `${raw.name} (${raw.id})` } : raw;
    let bare = 0;
    for (const x of s.inks ?? []) {
      const what = x.k === 'i' ? `the icon "${x.ex}"` : `"${x.ex}"`;
      if (!Array.isArray(x.fg)) continue;
      // Nothing drawn behind it at all (a screen frame with no fill): what the product draws there is not known.
      if (!(x.on ?? []).length) { bare += x.n || 1; continue; }
      const bg = surfaceOf(x.on);
      if (!bg) {
        if (x.k === 't') out.push({ screen: s.name, kind: 'plate', what, n: x.n, criterion: '1.4.3',
          fix: 'put a solid plate (a surface colour) behind the words, so they read whatever the picture or gradient shows' });
        continue;
      }
      const fg = over(x.fg, bg);
      const ratio = contrastRatio(fg, bg);
      const need = x.k === 'i' ? 3 : aaThreshold(x.s || 0, x.w || 400);
      if (ratio + 1e-9 < need) {
        out.push({ screen: s.name, kind: 'contrast', what, n: x.n, ratio: Math.round(ratio * 100) / 100, need, fg: hex(fg), bg: hex(bg),
          criterion: x.k === 'i' ? '1.4.11' : '1.4.3', size: x.s, large: x.k === 't' ? isLargeText(x.s || 0, x.w || 400) : undefined,
          fix: x.k === 'i' ? `make the icon reach ${need}:1 against what is behind it` : `make the text reach ${need}:1 against what is behind it (a darker or lighter colour token, or a different surface)` });
      }
    }
    if (bare) out.push({ screen: s.name, kind: 'bare', what: `${bare} text${bare === 1 ? '' : 's'} and icons`, n: 1, count: bare, criterion: '1.4.3',
      fix: 'give the screen the surface colour the product draws behind it, so what sits on it can be measured' });
    // Each control once a screen, every size it is drawn at under 24 by 24.
    const targets = new Map();
    for (const t of s.small ?? []) {
      const role = roleOf(t.c);
      const control = role ? INTERACTIVE.test(norm(role)) : CONTROL_NAME.test(t.c);
      if (!control) continue;
      const e = targets.get(t.c) ?? { sizes: [], n: 0 };
      e.sizes.push(`${t.w}×${t.h}`); e.n += t.n || 1; targets.set(t.c, e);
    }
    for (const [c, e] of targets) out.push({ screen: s.name, kind: 'target', what: c, n: e.n, size: e.sizes.join(', '), criterion: '2.5.8',
      fix: 'make it at least 24×24, or keep 24px of space around it on the screen' });
  }
  return out;
}

// The block the audit prints: one line a finding, the screen first.
export function screenA11yLines(findings = [], { screens = 0 } = {}) {
  if (!findings.length) return screens ? [`✓ Figma screens: the ${screens} screen${screens === 1 ? '' : 's'} read pass contrast and target size.`] : [];
  const times = (n) => (n > 1 ? ` (${n} times)` : '');
  const lines = [`♿ Figma screens, accessibility (advisory, for whoever keeps the Figma file): ${findings.length} to fix`];
  for (const f of findings) {
    if (f.kind === 'contrast') lines.push(`   ${f.screen}: ${f.what}${times(f.n)} is ${f.ratio}:1 (${f.fg} on ${f.bg}), needs ${f.need}:1 (WCAG ${f.criterion}). Fix: ${f.fix}.`);
    else if (f.kind === 'plate') lines.push(`   ${f.screen}: ${f.what}${times(f.n)} sits on an image or a gradient, so its contrast cannot be measured (WCAG ${f.criterion}). Fix: ${f.fix}.`);
    else if (f.kind === 'bare') lines.push(`   ${f.screen}: ${f.count} ${f.count === 1 ? 'text or icon has' : 'texts and icons have'} nothing drawn behind ${f.count === 1 ? 'it' : 'them'} (the screen has no fill), so the contrast cannot be measured (WCAG ${f.criterion}). Fix: ${f.fix}.`);
    else lines.push(`   ${f.screen}: ${f.what}${times(f.n)} is drawn ${f.size}, under 24×24 (WCAG ${f.criterion}). Fix: ${f.fix}.`);
  }
  return lines;
}

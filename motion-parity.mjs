// motion-parity.mjs - motion against Figma (C5).
//
// Figma says how a component moves in its prototype: a variant leads to another on a trigger (hover, press, click) with
// a transition, its duration and its easing (Smart animate, 200ms, ease out). The code says it in CSS: the transition on
// the state's rule (.button:hover), else on the component's own rule. This reads Figma's transitions (a read-only Plugin
// API capture, MOTION_CAPTURE_JS, kept as figma-motion.snapshot.json) and compares each with the code's: a change Figma
// animates and the code makes at once, a duration or a curve that differs. A spring in Figma (Gentle, Quick, Bouncy) has
// no CSS curve: only its duration is compared, and the line says so. Whether each animation stops for someone who asks
// for less motion is the accessibility check's (prefers-reduced-motion, in the browser and in the code).

import { walkCss } from './css-source.mjs';
import { bezierOf, sameEasing, timeMs } from './css-values.mjs';

// Run with use_figma or figma-cli on the file, once per page that holds components (PAGE_ID: the page's id, null for
// the page open). It only reads: every component set's variants, each prototype reaction that changes one variant into
// another, with its trigger and transition.
export const MOTION_CAPTURE_JS = `
const PAGE_ID = __PAGE_ID__;
const page = PAGE_ID ? await figma.getNodeByIdAsync(PAGE_ID) : figma.currentPage;
if (PAGE_ID) await figma.setCurrentPageAsync(page);
const out = {};
const sets = page.findAllWithCriteria({ types: ['COMPONENT_SET'] });
for (const set of sets) {
  const list = [];
  for (const v of set.children) {
    for (const r of (v.reactions || [])) {
      const actions = r.actions || (r.action ? [r.action] : []);
      for (const a of actions) {
        if (!a || a.type !== 'NODE' || !a.destinationId) continue;
        const to = set.children.find((c) => c.id === a.destinationId);
        if (!to) continue;
        const t = a.transition || null;
        list.push({ from: v.variantProperties || {}, to: to.variantProperties || {}, trigger: r.trigger ? r.trigger.type : null, type: t ? t.type : 'INSTANT', duration: t && typeof t.duration === 'number' ? t.duration : 0, easing: t && t.easing ? t.easing : null });
      }
    }
  }
  if (list.length) out[set.name] = list;
}
return { _captured: new Date().toISOString(), _note: 'Read-only capture of prototype transitions between variants (motion-parity.mjs).', components: out };
`;

export const motionCaptureScript = (pageId = null) => MOTION_CAPTURE_JS.replace('__PAGE_ID__', JSON.stringify(pageId ? String(pageId).replace('-', ':') : null)).trim() + '\n';

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
const STATE = { ON_HOVER: 'hover', WHILE_HOVERING: 'hover', MOUSE_ENTER: 'hover', ON_PRESS: 'active', WHILE_PRESSING: 'active', MOUSE_DOWN: 'active' };
const TRIGGER_WORD = { ON_HOVER: 'hover', WHILE_HOVERING: 'hover', MOUSE_ENTER: 'hover', ON_PRESS: 'press', WHILE_PRESSING: 'press', MOUSE_DOWN: 'press', ON_CLICK: 'click', ON_KEY_DOWN: 'key', AFTER_TIMEOUT: 'delay', MOUSE_LEAVE: 'leave', MOUSE_UP: 'release', ON_DRAG: 'drag' };

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
  const sources = loadCssSources(ROOT, [cfg.paths?.themeCSS ?? [], ...[cfg.paths?.componentCSS ?? []]].flat()).files;
  const locator = await loadLocator(ROOT, cfg);
  const findings = motionFindings(snap, sources, (n) => locator.classFor(n));
  return { findings, compared: Object.values(snap.components ?? {}).reduce((k, l) => k + l.length, 0), file };
}

// The motion snapshot from a capture's answer (what use_figma returned, saved as a file).
export function motionSnapshot(answer) {
  const a = typeof answer === 'string' ? JSON.parse(answer) : answer;
  const body = a?.components ? a : a?.result?.components ? a.result : null;
  if (!body) throw new Error('not a motion capture (no "components")');
  return { _updated: new Date().toISOString(), _note: 'Prototype transitions between variants, read from Figma (motion-parity.mjs MOTION_CAPTURE_JS).', components: body.components };
}

// motion-components.mjs - how each component moves on its own (C7): a spinner turning, a panel, a modal or a toast
// opening and closing.
//
// motion-parity.mjs compares what Figma's prototype animates between variants (hover, press) with the code's transition.
// This reads the rest of a component's motion, from both sides, and compares them:
//   - the code: each @keyframes animation on the component or one of its parts (.loader-spinner turning forever, the
//     .modal-card sliding in, .modal.is-closing .modal-card sliding out), and each transition a state that opens or
//     closes it plays (.drawer.is-open changes its transform, which .drawer transitions);
//   - Figma: the keyframes of its Motion timeline (a Rotation track, an animation style such as Fade in), each overlay
//     its prototype opens that shows it (Move in, 300ms, Ease out; played backwards when it closes), and variants that
//     lead to each other after a delay and back to the first (a loop drawn as frames).
// Each component has at most three motions, one of each kind: loop (it repeats while it shows), open, close.

import { blankComments, walkCss } from './css-source.mjs';
import { bezierOf, sameEasing, timeMs } from './css-values.mjs';
import { figmaEasing, transitionsOf, codeMotion, STATE, TRIGGER_WORD } from './motion-parity.mjs';

export const MOTIONS = ['loop', 'open', 'close'];

// A state that opens or closes a component, in a class, an attribute or an animation's name (.is-open, [data-state=
// "closed"], toast-out).
const OPEN_WORD = /(?:^|[-_ .[="'])(?:is-)?(?:open|opened|opening|in|enter|entering|show|shown|showing|visible|appear|appearing|expanded|expand)(?=$|[-_ \]"'])/i;
const CLOSE_WORD = /(?:^|[-_ .[="'])(?:is-)?(?:close|closed|closing|out|exit|exiting|leave|leaving|hide|hidden|hiding|dismiss|dismissing|collapsed|collapse)(?=$|[-_ \]"'])/i;
const INTERACTION = /:(hover|active|focus|focus-visible|focus-within)(?![\w-])/;
const skipped = (r) => (r.atRules ?? []).some((a) => /prefers-reduced-motion|@keyframes/.test(a));
// The sheet's rules, its comments blanked first (a brace or a semicolon in a comment would split a rule), lines kept.
const rulesIn = (src) => walkCss(blankComments(String(src.text ?? '')), src.file);

// Each custom property the sources declare, the first time (the base mode), so var(--modal-duration) reads 220ms.
export function customProps(sources = []) {
  const decl = new Map();
  for (const src of sources) for (const r of rulesIn(src)) {
    if (skipped(r)) continue;
    for (const d of r.decls) if (d.prop.startsWith('--') && !decl.has(d.prop)) decl.set(d.prop, d.value);
  }
  const resolve = (v, n = 0) => String(v ?? '').replace(/var\(\s*(--[\w-]+)\s*(?:,([^()]*))?\)/g, (m, name, fb) => (n < 6 && decl.has(name) ? resolve(decl.get(name), n + 1) : (fb ?? m).trim()));
  return resolve;
}

const splitTop = (s) => { const out = []; let d = 0, cur = ''; for (const ch of String(s ?? '')) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && !d) { out.push(cur.trim()); cur = ''; } else cur += ch; } if (cur.trim()) out.push(cur.trim()); return out; };
const KEYWORD = /^(infinite|normal|reverse|alternate|alternate-reverse|none|forwards|backwards|both|running|paused|initial|inherit|unset)$/i;
const isEase = (t) => !!bezierOf(t) || /^(steps|linear)\(|^step-(start|end)$/i.test(t);

// An animation declaration's parts: [{ name, ms, delay, easing, infinite }], from the shorthand or the longhands.
export function animationsOf(decls = [], resolve = (v) => v) {
  const get = (p) => { const v = decls.filter((d) => d.prop === p).at(-1)?.value; return v == null ? null : resolve(v); };
  let items = [];
  const sh = get('animation');
  if (sh) items = splitTop(sh).map((part) => {
    const toks = part.match(/cubic-bezier\([^)]*\)|steps\([^)]*\)|linear\([^)]*\)|[^\s]+/g) ?? [];
    const times = toks.map(timeMs).filter((x) => x != null);
    const easing = toks.find(isEase) ?? 'ease';
    const count = toks.find((t) => /^(infinite|\d+(\.\d+)?)$/i.test(t));
    const name = toks.find((t) => timeMs(t) == null && t !== easing && t !== count && !KEYWORD.test(t)) ?? null;
    return { name, ms: times[0] ?? 0, delay: times[1] ?? 0, easing, infinite: /^infinite$/i.test(count ?? '') };
  });
  const names = get('animation-name'), durs = get('animation-duration'), eases = get('animation-timing-function'), counts = get('animation-iteration-count');
  if (names || durs || eases || counts) {
    const N = names ? splitTop(names) : null, D = durs ? splitTop(durs).map(timeMs) : null, E = eases ? splitTop(eases) : null, C = counts ? splitTop(counts) : null;
    const n = Math.max(items.length, N?.length ?? 0, 1);
    items = Array.from({ length: n }, (_, i) => ({ name: N ? N[i % N.length] : items[i]?.name ?? null, ms: D ? D[i % D.length] ?? 0 : items[i]?.ms ?? 0, delay: items[i]?.delay ?? 0, easing: E ? E[i % E.length] : items[i]?.easing ?? 'ease', infinite: C ? /^infinite$/i.test(C[i % C.length]) : items[i]?.infinite ?? false }));
  }
  return items.filter((a) => a.name && !/^none$/i.test(a.name));
}

// Every @keyframes block: name → [{ at: 0…1, decls: { prop: value } }], in order.
export function keyframesIn(sources = [], resolve = (v) => v) {
  const out = new Map();
  for (const src of sources) for (const r of rulesIn(src)) {
    const at = (r.atRules ?? []).map((a) => /^@(?:-\w+-)?keyframes\s+(\S+)/.exec(a)).filter(Boolean).at(-1);
    if (!at) continue;
    const list = out.get(at[1]) ?? [];
    for (const sel of r.selectors) {
      const s = sel.trim().toLowerCase(), pos = s === 'from' ? 0 : s === 'to' ? 1 : /^[\d.]+%$/.test(s) ? parseFloat(s) / 100 : null;
      if (pos == null) continue;
      let f = list.find((x) => x.at === pos);
      if (!f) list.push(f = { at: pos, decls: {} });
      for (const d of r.decls) f.decls[d.prop] = resolve(d.value);
    }
    out.set(at[1], list.sort((a, b) => a.at - b.at));
  }
  return out;
}

// A transform's turn, its move and its scale: { rotate (deg), x, y (px, or ±1 for a share of its size), scale }.
function transformOf(v) {
  const s = String(v ?? '');
  const deg = (t) => { const m = /^(-?[\d.]+)(deg|turn|rad|grad)?$/.exec(String(t).trim()); if (!m) return 0; const n = parseFloat(m[1]); return m[2] === 'turn' ? n * 360 : m[2] === 'rad' ? n * 180 / Math.PI : m[2] === 'grad' ? n * 0.9 : n; };
  const len = (t) => { const m = /^(-?[\d.]+)(px|%|rem|em)?$/.exec(String(t ?? '').trim()); if (!m) return 0; const n = parseFloat(m[1]); return m[2] === '%' ? Math.sign(n) : m[2] === 'rem' || m[2] === 'em' ? n * 16 : n; };
  const out = { rotate: 0, x: 0, y: 0, scale: 1 };
  for (const m of s.matchAll(/(rotate|rotateZ|translate|translateX|translateY|translate3d|scale|scaleX|scaleY)\(([^)]*)\)/g)) {
    const a = m[2].split(',').map((x) => x.trim());
    if (/^rotate/.test(m[1])) out.rotate += deg(a[0]);
    else if (m[1] === 'translateX') out.x += len(a[0]);
    else if (m[1] === 'translateY') out.y += len(a[0]);
    else if (m[1] === 'translate' || m[1] === 'translate3d') { out.x += len(a[0]); out.y += len(a[1]); }
    else out.scale *= parseFloat(a[0]) || 1;
  }
  return out;
}
const SIDE = { below: 'from below', above: 'from above', right: 'from the right', left: 'from the left' };
const sideOf = ({ x, y }) => (Math.abs(y) >= Math.abs(x) ? (y > 0 ? 'below' : 'above') : x > 0 ? 'right' : 'left');

// What a keyframes animation does, in words: turns a full circle, fades in and slides in from below.
export function keyframesWhat(frames) {
  if (!frames?.length) return null;
  const first = frames[0].at === 0 ? frames[0].decls : {}, last = frames.at(-1).at === 1 ? frames.at(-1).decls : {};
  const t0 = transformOf(first.transform), t1 = transformOf(last.transform);
  const parts = [];
  const turn = t1.rotate - t0.rotate;
  if (Math.abs(turn) >= 359) parts.push('turns a full circle'); else if (Math.abs(turn) >= 1) parts.push(`turns ${Math.round(turn)}°`);
  const o0 = first.opacity != null ? parseFloat(first.opacity) : 1, o1 = last.opacity != null ? parseFloat(last.opacity) : 1;
  if (o0 < o1) parts.push('fades in'); else if (o0 > o1) parts.push('fades out');
  const moved0 = t0.x || t0.y, moved1 = t1.x || t1.y;
  if (moved0 && !moved1) parts.push(`slides in ${SIDE[sideOf(t0)]}`);
  else if (!moved0 && moved1) parts.push(`slides out ${SIDE[sideOf(t1)].replace('from', 'to')}`);
  if (t0.scale < t1.scale) parts.push('grows'); else if (t0.scale > t1.scale) parts.push('shrinks');
  return parts.length ? parts.join(' and ') : 'moves';
}

const classesOf = (sel) => [...sel.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)].map((m) => m[1]);
const partOf = (c, k) => k === c || k.startsWith(c + '-') || k.startsWith(c + '__');
// Whether a rule is the component's. A Vue component's scoped rules carry its own [data-v-…] mark: such a rule is the
// component's when the mark is its own and never when it is another's, whatever its classes say (a loader's
// .text-wrapper is not the text component's; a loader named loaderGeneral, with no class of that name, still has its
// own rules). A rule with no mark, or a component whose mark is not known, goes by its classes.
const marksOf = (s) => [...s.matchAll(/\[data-v-([0-9a-f]+)\]/gi)].map((m) => m[1].toLowerCase());
// scope: the component's own mark, or { own, known } with every mark the project's components are known by, so a
// component whose own mark is not known still leaves another's scoped rules alone.
const ownMark = (scope) => { const o = scope && typeof scope === 'object' ? scope.own : scope; return o ? String(o).toLowerCase() : null; };
const ruleOf = (s, c, scope) => {
  const m = marksOf(s), own = ownMark(scope), known = scope && typeof scope === 'object' ? scope.known : null;
  if (m.length && own) return m.includes(own);
  if (m.length && known && m.some((x) => known.has(x))) return false;
  return classesOf(s).some((k) => partOf(c, k));
};
// The part a rule moves: the component's own part named in its last step, else (a scoped rule) that step's class.
const partFor = (s, c, scope) => { const ks = classesOf(s.split(' ').at(-1) ?? ''); const k = ks.find((x) => partOf(c, x)); if (k) return k !== c ? k : null; const own = ownMark(scope); return own && marksOf(s).includes(own) ? ks[0] ?? null : null; };

// How the code moves a component: [{ motion: 'loop'|'open'|'close', what, ms, easing, part, selector, file, line,
// via: 'animation'|'transition', name }]. sources: [{ file, text }] (the theme and the component sheets). cls: its class.
export function codeMotions(sources = [], cls, { resolve = null, scope = null } = {}) {
  const c = String(cls ?? '').replace(/^\./, '');
  if (!c || /[^\w-]/.test(c)) return [];
  resolve ??= customProps(sources);
  const frames = keyframesIn(sources, resolve);
  const rules = [];
  for (const src of sources) for (const r of rulesIn(src)) {
    if (skipped(r)) continue;
    for (const sel of r.selectors) {
      const s = sel.trim().replace(/\s+/g, ' ');
      if (!INTERACTION.test(s) && ruleOf(s, c, scope)) rules.push({ s, r, file: src.file });
    }
  }
  // What a selector says beyond the component and its parts: its state (.is-closing, [data-state="open"]).
  const stateOf = (s) => s.replace(/\.(-?[A-Za-z_][\w-]*)/g, (m, k) => (partOf(c, k) ? ' ' : m));
  const partIn = (s) => partFor(s, c, scope);
  const out = [], seen = new Set();
  const add = (m) => { const key = `${m.motion}|${m.via}|${m.name ?? ''}|${m.ms}|${m.part ?? ''}`; if (!seen.has(key)) { seen.add(key); out.push(m); } };
  for (const { s, r, file } of rules) {
    for (const a of animationsOf(r.decls, resolve)) {
      if (!(a.ms > 0)) continue;
      const motion = a.infinite ? 'loop' : CLOSE_WORD.test(`${stateOf(s)} ${a.name}`) ? 'close' : 'open';
      add({ motion, what: keyframesWhat(frames.get(a.name)) ?? 'moves', ms: a.ms, easing: a.easing, part: partIn(s), selector: s, file, line: r.line, via: 'animation', name: a.name });
    }
  }
  // A transition plays when a state that opens or closes the component changes a property it transitions: on that
  // state's own rule it plays one way, on the component's rule both ways. A size it transitions opens and closes it too,
  // whatever sets the size (a side panel its script widens and narrows).
  const states = rules.filter((x) => OPEN_WORD.test(stateOf(x.s)) || CLOSE_WORD.test(stateOf(x.s)));
  const SIZE = /^(width|height|max-width|max-height|min-width|min-height|flex-basis|inline-size|block-size)$/;
  for (const { s, r, file } of rules) {
    const ts = transitionsOf(r.decls.map((d) => ({ ...d, value: resolve(d.value) })));
    if (!ts.length) continue;
    const props = new Set(ts.map((t) => t.prop));
    let changed = states.filter((x) => x.s !== s && x.r.decls.some((d) => props.has('all') || props.has(d.prop))).flatMap((x) => x.r.decls.map((d) => d.prop)).filter((p) => props.has('all') || props.has(p));
    // A size: on the component's own element only (.panel--resizable), never on a part inside it (a tab's label).
    const own = classesOf(s.split(' ').at(-1) ?? '').some((k) => k === c || k.startsWith(c + '--'));
    if (!changed.length && own) changed = [...props].filter((p) => SIZE.test(p));
    if (!changed.length) continue;
    const t = ts.filter((x) => x.prop === 'all' || changed.includes(x.prop)).reduce((a, b) => (b.ms + b.delay > a.ms + a.delay ? b : a));
    if (!(t.ms > 0)) continue;
    const st = stateOf(s), kinds = CLOSE_WORD.test(st) ? ['close'] : OPEN_WORD.test(st) ? ['open'] : ['open', 'close'];
    const word = (k) => [changed.includes('opacity') ? (k === 'open' ? 'fades in' : 'fades out') : '', changed.some((p) => /transform|translate|left|right|top|bottom/.test(p)) ? (k === 'open' ? 'slides in' : 'slides out') : '',
      changed.some((p) => /width|inline-size|flex-basis/.test(p)) ? (k === 'open' ? 'widens' : 'narrows') : changed.some((p) => /height|block-size/.test(p)) ? (k === 'open' ? 'grows' : 'shrinks') : ''].filter(Boolean).join(' and ') || 'changes';
    for (const k of kinds) add({ motion: k, what: word(k), ms: t.ms, easing: t.easing, part: partIn(s), selector: s, file, line: r.line, via: 'transition', name: null });
  }
  return out;
}

// ── Figma's side ──

// The motion Figma gives a component, in words, from its Motion keyframes (a track on one of its layers), an animation
// style, an overlay its prototype opens that shows it, and variants that lead to each other after a delay and back.
// snap: the motion snapshot. → [{ motion, what, ms, easing, from, layer }]
const msOf = (s) => Math.round((Number(s) || 0) * 1000);
const easeName = (e) => {
  if (!e) return 'linear';
  if (e.type === 'VARIABLE_ALIAS') return 'a variable';
  if (e.type === 'HOLD') return 'hold';
  const f = figmaEasing(e), c = e.easingFunctionCubicBezier;
  return f.css ?? (c ? `cubic-bezier(${c.x1}, ${c.y1}, ${c.x2}, ${c.y2})` : f.spring);
};
export function figmaMotions(snap, component) {
  const out = [];
  for (const entry of snap?.motion?.[component] ?? []) {
    const tracks = entry.tracks ?? {};
    const span = (t) => { const k = t.keyframes ?? []; if (k.length < 2) return msOf(t.duration); return msOf(k.at(-1).t - k[0].t); };
    const ends = (t) => { const k = t.keyframes ?? []; const a = k[0]?.t > 0 && t.base != null ? t.base : k[0]?.v; return [a, k.at(-1)?.v]; };
    const easeOf = (t) => easeName((t.keyframes ?? []).slice(1).find((k) => k.e)?.e ?? t.keyframes?.[0]?.e);
    const kinds = new Map();
    const put = (motion, what, t) => { const m = kinds.get(motion) ?? { motion, what: [], ms: 0, easing: null, from: 'its Motion timeline', layer: entry.layer, variant: entry.variant ?? null }; m.what.push(what); if (span(t) > m.ms) { m.ms = span(t); m.easing = easeOf(t); } kinds.set(motion, m); };
    if (tracks.ROTATION) { const [a, b] = ends(tracks.ROTATION); const turn = (b ?? 0) - (a ?? 0); if (Math.abs(turn) >= 359) put('loop', 'turns a full circle', tracks.ROTATION); else if (Math.abs(turn) >= 1) put('open', `turns ${Math.round(turn)}°`, tracks.ROTATION); }
    if (tracks.OPACITY) { const [a, b] = ends(tracks.OPACITY); if (a < b) put('open', 'fades in', tracks.OPACITY); else if (a > b) put('close', 'fades out', tracks.OPACITY); }
    for (const [f, axis] of [['TRANSLATION_X', 'x'], ['TRANSLATION_Y', 'y']]) {
      if (!tracks[f]) continue;
      const [a, b] = ends(tracks[f]);
      const at = (v) => ({ x: axis === 'x' ? v : 0, y: axis === 'y' ? v : 0 });
      if (a && !b) put('open', `slides in ${SIDE[sideOf(at(a))]}`, tracks[f]);
      else if (!a && b) put('close', `slides out ${SIDE[sideOf(at(b))].replace('from', 'to')}`, tracks[f]);
    }
    for (const f of ['SCALE_X', 'SCALE_Y', 'SCALE_XY']) {
      if (!tracks[f]) continue;
      const [a, b] = ends(tracks[f]);
      if (typeof a === 'number' && typeof b === 'number' && a !== b) put(a < b ? 'open' : 'close', a < b ? 'grows' : 'shrinks', tracks[f]);
    }
    for (const m of kinds.values()) out.push({ ...m, what: [...new Set(m.what)].join(' and ') });
    // An animation style with no keyframes read: its name says the kind (Spin, Fade in, Slide out).
    if (!kinds.size) for (const st of entry.styles ?? []) {
      // Figma's presets are named by their kind (Opacity, Position, Scale) and say in or out in their type (fadeIn, slide_out).
      const n = `${st.styleId ?? ''} ${st.name ?? ''} ${st.props?.type ?? ''} ${st.props?.animationDirection ?? ''}`;
      const motion = /spin|loading|pulse/i.test(n) ? 'loop' : /(fade|slide|scale|rotate|resize)_?out|\b(out|exit|leave|disappear|hide|close)\b/i.test(n) ? 'close' : /(fade|slide|scale|rotate|resize)_?in|\b(in|enter|appear|show|open|reveal|pop)\b/i.test(n) ? 'open' : null;
      if (!motion) continue;
      const ease = Object.values(st.props ?? {}).find((v) => v && typeof v === 'object' && v.type);
      const label = String(st.props?.type ?? st.styleId ?? st.name ?? 'an animation style').replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
      out.push({ motion, what: label, ms: msOf(st.duration), easing: easeName(ease), from: `its animation style ${st.styleId ?? st.name}`, layer: entry.layer, variant: entry.variant ?? null });
    }
  }
  // An overlay its prototype opens that shows it: open with its transition, close the same played backwards.
  for (const o of (snap?.overlays ?? []).filter((x) => x.component === component)) {
    const t = o.transition ?? {};
    if (!t.type || t.type === 'INSTANT' || !(t.duration > 0)) continue;
    const dir = t.direction ? ` moving ${String(t.direction).toLowerCase()}` : '';
    const what = t.type === 'DISSOLVE' ? 'fades in' : /MOVE|SLIDE|PUSH/.test(t.type) ? `slides in${dir}` : 'animates in';
    const back = t.type === 'DISSOLVE' ? 'fades out' : /MOVE|SLIDE|PUSH/.test(t.type) ? `slides out${dir ? ` moving back ${String(t.direction).toLowerCase() === 'left' ? 'right' : String(t.direction).toLowerCase() === 'right' ? 'left' : String(t.direction).toLowerCase() === 'top' ? 'down' : 'up'}` : ''}` : 'animates out';
    const from = `the overlay ${o.frame ?? component} its prototype opens${o.from ? ` from ${o.from}` : ''}`;
    out.push({ motion: 'open', what, ms: msOf(t.duration), easing: easeName(t.easing), from, layer: null });
    out.push({ motion: 'close', what: back, ms: msOf(t.duration), easing: easeName(t.easing), from: `${from}, played backwards as it closes`, layer: null, reversed: true });
  }
  // Variants that lead to each other after a delay and back to the first: a loop, one round the delays and transitions.
  const steps = (snap?.components?.[component] ?? []).filter((m) => m && m.trigger === 'AFTER_TIMEOUT');
  if (steps.length) {
    const key = (v) => JSON.stringify(v ?? {});
    const next = new Map(steps.map((m) => [key(m.from), m]));
    const start = steps[0]; let at = start, total = 0, n = 0, animated = null;
    while (at && n < 50) { total += msOf(at.timeout ?? 0) + (at.type === 'INSTANT' ? 0 : msOf(at.duration)); if (at.type !== 'INSTANT' && at.duration > 0 && !animated) animated = at; n++; at = next.get(key(at.to)); if (at === start) break; }
    if (at === start && total > 0) out.push({ motion: 'loop', what: `repeats its ${n} variants`, ms: total, easing: easeName(animated?.easing), from: 'its prototype, each variant leading to the next after a delay', layer: null });
  }
  return out;
}

// ── The comparison ──

// The one motion of a kind that stands for it: the longest, then the component's own body over a backdrop behind it,
// then the one that does the most (fades in and slides in over fades in).
const backdrop = (m) => /overlay|backdrop|scrim|shade|veil/i.test(m.part ?? '');
const pick = (list) => list.reduce((a, b) => (!a || b.ms > a.ms || (b.ms === a.ms && (backdrop(a) && !backdrop(b) || (backdrop(a) === backdrop(b) && String(b.what).length > String(a.what).length))) ? b : a), null);
const TRIGGER = { loop: 'repeating', open: 'open', close: 'close' };
const said = (m) => `${m.ms}ms, ${m.easing}`;

// Each component's loop, opening and closing, Figma's against the code's: one it animates that the other does not, or
// another duration or curve. figmaRead: the snapshot has Figma's Motion read (a capture made since C7), so the code's
// motion with none in Figma is said too. → [{ component, change, trigger, motion, kind, message, figma, code }]
export function componentMotionFindings(snap, sources, classFor = () => null, names = [], scopeFor = () => null) {
  const resolve = customProps(sources);
  const figmaRead = !!(snap?.motion || snap?.overlays);
  const comps = new Set([...Object.keys(snap?.motion ?? {}), ...(snap?.overlays ?? []).map((o) => o.component), ...Object.keys(snap?.components ?? {}), ...names]);
  const out = [];
  for (const component of comps) {
    const cls = classFor(component);
    if (!cls) continue;
    const code = codeMotions(sources, cls, { resolve, scope: scopeFor(component) }), fig = figmaMotions(snap, component);
    for (const motion of MOTIONS) {
      const f = pick(fig.filter((m) => m.motion === motion)), k = pick(code.filter((m) => m.motion === motion));
      if (!f && !k) continue;
      const change = motion === 'loop' ? `${(f ?? k).what}, repeating` : motion === 'open' ? 'opens' : 'closes';
      const codeSide = k ? { ms: k.ms, easing: k.easing, what: k.what, selector: k.selector, file: k.file, line: k.line } : null;
      const base = { component, change, trigger: TRIGGER[motion], motion, figma: f ? { ms: f.ms, easing: f.easing, what: f.what, from: f.from } : null, code: codeSide };
      const say = `${component} ${change}`;
      if (f && !k) { out.push({ ...base, kind: 'none', message: `${say}: Figma animates it (${f.what}, ${said(f)}, ${f.from}); the code ${motion === 'loop' ? 'does not move it' : motion === 'open' ? 'opens it at once' : 'closes it at once'}` }); continue; }
      if (!f && k) { if (figmaRead) out.push({ ...base, kind: 'figma-none', message: `${say}: the code animates it (${k.what}, ${said(k)}, ${k.selector}, ${k.file}:${k.line}); Figma has no motion for it` }); continue; }
      const where = `${k.selector}, ${k.file}:${k.line}`;
      if (Math.abs(k.ms - f.ms) > 10) out.push({ ...base, kind: 'duration', message: `${say}: the code takes ${k.ms}ms (${where}), Figma ${f.ms}ms` });
      if (bezierOf(f.easing) && sameEasing(k.easing, f.easing) === false) out.push({ ...base, kind: 'easing', message: `${say}: the code eases ${k.easing} (${where}), Figma ${f.easing}` });
    }
  }
  return out;
}

// Each component's motion for the style guide's motion page, the code's beside Figma's: [{ component, motion, what, code:
// { ms, easing, selector }, figma: { ms, easing, what } | null, status: 'same'|'differs'|'figma-none'|'code-none'|'unread' }].
export function componentMotionRows(snap, sources, classFor = () => null, names = [], scopeFor = () => null) {
  const resolve = customProps(sources);
  const figmaRead = !!(snap?.motion || snap?.overlays);
  const rows = [];
  for (const component of new Set([...names, ...Object.keys(snap?.motion ?? {}), ...(snap?.overlays ?? []).map((o) => o.component)])) {
    const cls = classFor(component);
    const code = cls ? codeMotions(sources, cls, { resolve, scope: scopeFor(component) }) : [], fig = figmaMotions(snap, component);
    for (const motion of MOTIONS) {
      const f = pick(fig.filter((m) => m.motion === motion)), k = pick(code.filter((m) => m.motion === motion));
      if (!f && !k) continue;
      const status = !figmaRead && !f ? 'unread' : !f ? 'figma-none' : !k ? 'code-none' : Math.abs(k.ms - f.ms) > 10 || (bezierOf(f.easing) && sameEasing(k.easing, f.easing) === false) ? 'differs' : 'same';
      rows.push({ component, motion, what: (k ?? f).what, code: k ? { ms: k.ms, easing: k.easing, selector: k.selector, what: k.what } : null, figma: f ? { ms: f.ms, easing: f.easing, what: f.what, from: f.from } : null, status });
    }
  }
  return rows.sort((a, b) => a.component.localeCompare(b.component) || MOTIONS.indexOf(a.motion) - MOTIONS.indexOf(b.motion));
}

// Every motion the code gives a component, for its Motion area: each transition and animation on its own rules and its
// parts' (a hover's included), what it moves, how long, its curve and delay, the variables it is written with, where,
// and whether it stops for a person who asks for less motion (a prefers-reduced-motion rule that sets it to none or to
// no time, on it or on everything). sources: [{ file, text }].
// → [{ via: 'transition'|'animation', selector, prop, name, ms, delay, easing, infinite, vars: ['--…'], calm, at }]
export function componentTransitions(sources = [], cls, { resolve = null, scope = null } = {}) {
  const c = String(cls ?? '').replace(/^\./, '');
  if (!c || /[^\w-]/.test(c)) return [];
  resolve ??= customProps(sources);
  const all = sources.flatMap((src) => rulesIn(src).map((r) => ({ r, file: src.file })));
  // A rule that stops it: none, or a duration of no time (0s, 0.01ms), in a prefers-reduced-motion block.
  const stops = (d) => { if (!/^(transition|animation)(-duration)?$/.test(d.prop)) return false; const v = d.value.trim(); if (/^none\b/i.test(v)) return true; const t = v.split(/[\s,]+/).map(timeMs).find((x) => x != null); return t != null && t <= 1; };
  const calmRules = all.filter(({ r }) => (r.atRules ?? []).some((a) => /prefers-reduced-motion\s*:\s*reduce/.test(a)) && r.decls.some(stops));
  // It stops when such a rule wins over the one that moves it: the same selector, or one on the same element at least as
  // specific, or one marked !important (a rule on everything, * or *::before, only so).
  const spec = (x) => (x.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+(\([^)]*\))?|#[\w-]+/g) ?? []).length;
  const lastOf = (x) => classesOf(x.split(' ').at(-1) ?? '');
  const calmFor = (s) => calmRules.some(({ r }) => { const imp = r.decls.some((d) => stops(d) && d.important); return r.selectors.some((x) => { const t = x.trim().replace(/\s+/g, ' '); if (t === s) return true; if (/^\*/.test(t)) return imp; return lastOf(t).some((k) => lastOf(s).includes(k)) && (imp || spec(t) >= spec(s)); }); });
  const varsIn = (v) => [...String(v).matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]);
  const out = [];
  for (const { r, file } of all) {
    if (skipped(r)) continue;
    const decls = r.decls.filter((d) => /^(transition|animation)(-|$)/.test(d.prop));
    if (!decls.length) continue;
    for (const sel of r.selectors) {
      const s = sel.trim().replace(/\s+/g, ' ');
      if (!ruleOf(s, c, scope)) continue;
      const vars = [...new Set(decls.flatMap((d) => varsIn(d.value)))], at = `${file}:${r.line}`, calm = calmFor(s);
      for (const t of transitionsOf(decls.map((d) => ({ ...d, value: resolve(d.value) })))) if (t.ms > 0) out.push({ via: 'transition', selector: s, prop: t.prop, name: null, ms: t.ms, delay: t.delay, easing: t.easing, infinite: false, vars, calm, at });
      for (const a of animationsOf(decls, resolve)) if (a.ms > 0) out.push({ via: 'animation', selector: s, prop: null, name: a.name, ms: a.ms, delay: a.delay, easing: a.easing, infinite: a.infinite, vars, calm, at });
    }
  }
  return out;
}

// Everything that moves in a component, in one list for its Motion area: what repeats while it shows, how it opens and
// closes, what plays on hover, press or focus, and any other change it eases. Each row says when it plays and what moves,
// the part it moves, the code's timing with the variables and the rule it is written in, Figma's timing with where in
// Figma it comes from (its Motion timeline, an animation style, an overlay or a transition of its prototype), whether it
// stops for a person who asks for less motion, and how the two compare.
// → [{ when, what, part, code: { ms, easing, delay, vars, at, calm } | null, figma: { ms, easing, from } | null,
//      status: 'same'|'differs'|'figma-none'|'code-none'|'code-only'|'unread' }]
const PSEUDO = { hover: 'hover', active: 'press', focus: 'focus', 'focus-visible': 'focus', 'focus-within': 'focus', checked: 'checked', disabled: 'disabled' };
const WHEN_OF = { loop: 'Repeats', open: 'Opens', close: 'Closes' };
const ORDER = ['Repeats', 'Opens', 'Closes', 'On hover', 'On press', 'On focus'];
export function motionSpec(snap, sources = [], cls, component, scope = null) {
  const c = String(cls ?? '').replace(/^\./, '');
  const resolve = customProps(sources);
  const all = c ? componentTransitions(sources, c, { resolve, scope }) : [], used = new Set(), rows = [], frames = keyframesIn(sources, resolve);
  const read = !!(snap?.motion || snap?.overlays);
  const codeOf = (t, k) => ({ ms: k?.ms ?? t.ms, easing: k?.easing ?? t.easing, delay: t?.delay ?? 0, vars: t?.vars ?? [], at: t?.at ?? (k ? `${k.file}:${k.line}` : null), calm: t?.calm ?? null });
  const compare = (k, f) => (Math.abs(k.ms - f.ms) > 10 || (bezierOf(f.easing) && sameEasing(k.easing, f.easing) === false) ? 'differs' : 'same');
  // When a transition plays: the states whose rules change what it eases (.chip:hover sets the colour it eases), else
  // whatever changes it (a script that widens a panel).
  const rules = sources.flatMap((src) => rulesIn(src)).filter((r) => !skipped(r));
  const statesOf = (t) => {
    const out = new Set();
    for (const r of rules) {
      if (!r.decls.some((d) => t.prop === 'all' || d.prop === t.prop || d.prop.startsWith(t.prop + '-') || t.prop.startsWith(d.prop + '-'))) continue;
      for (const sel of r.selectors) {
        const s = sel.trim().replace(/\s+/g, ' ');
        if (s === t.selector || !ruleOf(s, c, scope)) continue;
        for (const m of s.matchAll(/:([\w-]+)/g)) if (PSEUDO[m[1]]) out.add(PSEUDO[m[1]]);
        const rest = s.replace(/\.(-?[A-Za-z_][\w-]*)/g, (m, k) => (partOf(c, k) ? ' ' : m)).replace(/:[\w-]+(\([^)]*\))?/g, ' ');
        if (OPEN_WORD.test(rest)) out.add('open'); else if (CLOSE_WORD.test(rest)) out.add('close');
        else { const w = /\.(?:is-|has-)?([\w-]+)|\[(?:aria-|data-)?([\w-]+)/.exec(rest); if (w) out.add(w[1] ?? w[2]); }
      }
    }
    return [...out];
  };
  const whenWords = (states) => { const on = states.filter((s) => ['hover', 'press', 'focus'].includes(s)); return on.length ? `On ${on.join(' and ')}` : states.length ? `When ${states.join(' or ')}` : 'When it changes'; };
  // Its loop, opening and closing, the code's beside Figma's.
  for (const r of componentMotionRows(snap, sources, () => cls, [component], () => scope).filter((x) => x.component === component)) {
    const t = r.code ? all.find((x) => x.selector === r.code.selector && x.ms === r.code.ms) ?? all.find((x) => x.selector === r.code.selector) : null;
    if (t) used.add(t);
    rows.push({ when: WHEN_OF[r.motion], what: r.what, part: r.code?.selector ?? null, code: r.code ? codeOf(t, r.code) : null, figma: r.figma ? { ms: r.figma.ms, easing: r.figma.easing, from: r.figma.from } : null, status: r.status });
  }
  // What Figma's prototype animates between its variants on hover or press, against each transition that plays then.
  const seen = new Set();
  for (const m of snap?.components?.[component] ?? []) {
    if (!m || m.trigger === 'AFTER_TIMEOUT' || m.type === 'INSTANT' || !(m.duration > 0)) continue;
    const word = TRIGGER_WORD[m.trigger] ?? String(m.trigger ?? '').toLowerCase(), state = STATE[m.trigger];
    const change = Object.keys(m.to ?? {}).filter((p) => String(m.from?.[p]) !== String(m.to[p])).map((p) => `${p} ${m.from?.[p] ?? '?'} to ${m.to[p]}`).join(', ') || 'to another variant';
    if (seen.has(word + change)) continue;
    seen.add(word + change);
    const fe = figmaEasing(m.easing), figma = { ms: Math.round(m.duration * 1000), easing: fe.css ?? fe.spring, from: `its prototype, ${change}` };
    // On hover or press, every transition a :hover or :active rule plays; on a click or a key, which the code turns into
    // a class or an attribute of its own, the component's own transition.
    const own = state ? null : codeMotion(sources, c, null);
    const plays = all.filter((t) => !used.has(t) && t.via === 'transition' && (state ? statesOf(t).includes(state === 'active' ? 'press' : 'hover') : own && t.selector === own.selector));
    if (!plays.length) rows.push({ when: `On ${word}`, what: change, part: null, code: null, figma, status: 'code-none' });
    for (const t of plays) { used.add(t); rows.push({ when: state ? whenWords(statesOf(t)) : `On ${word}`, what: t.prop === 'all' ? 'everything changes' : `${t.prop} changes`, part: t.selector, code: codeOf(t), figma, status: compare(t, figma) }); }
  }
  // Every other transition or animation its code has: a part that loops, opens or closes too (the backdrop behind a
  // modal's card) is Figma's to animate as the rest; what plays on hover or focus that Figma's prototype does not
  // animate is the code's alone.
  for (const t of all) {
    if (used.has(t)) continue;
    const when = t.via === 'animation' ? (t.infinite ? 'Repeats' : CLOSE_WORD.test(`${t.selector} ${t.name}`) ? 'Closes' : 'Opens') : whenWords(statesOf(t));
    rows.push({ when, what: t.via === 'animation' ? keyframesWhat(frames.get(t.name)) ?? `plays ${t.name}` : t.prop === 'all' ? 'everything changes' : `${t.prop} changes`, part: t.selector, code: codeOf(t), figma: null, status: !(read || snap?.components) ? 'unread' : WHEN_OF.loop === when || WHEN_OF.open === when || WHEN_OF.close === when ? (read ? 'figma-none' : 'unread') : 'code-only' });
  }
  const rank = (w) => { const i = ORDER.findIndex((o) => w === o || w.startsWith(o + ' ')); return i < 0 ? ORDER.length : i; };
  return rows.map((r, i) => [r, i]).sort((a, b) => rank(a[0].when) - rank(b[0].when) || a[1] - b[1]).map((x) => x[0]);
}

// The system's motion as its fundamentals, one table for the motion page: each timing its components move with (a
// duration, a curve and a delay), from the fastest, with what it is used for (repeating, opening, closing, on hover, on
// press, on focus), the variables it is written with (and their Figma names), the components and parts that move so,
// Figma's timing for them, and what the system could do: a purpose that has other timings too, to choose one; a timing
// several components share, to keep as one variable; one written as values, to make a variable. A duration or curve
// variable no component uses is a row too. moves: motionSpec's rows, each with its component; tokens: { durations:
// [{ var, figma, ms }], easings: [{ var, figma, value }] }.
// → [{ ms, easing, delay, purposes, vars: [{ var, figma }], uses: [{ component, part, what, purpose }], figma:
//      'same'|'differs'|'none'|'unread', figmaTiming, shared, values, alsoTimed: [{ purpose, timings }], unused }]
const PURPOSE_ORDER = ['Repeats', 'Opens', 'Closes', 'On hover', 'On press', 'On focus'];
export function motionOverview(moves = [], tokens = {}) {
  const ease = (e) => String(e ?? '').replace(/\s+/g, '').toLowerCase();
  const purposeOf = (w) => PURPOSE_ORDER.find((p) => w === p || String(w).startsWith(p + ' ')) ?? 'When it changes';
  const named = new Map([...(tokens.durations ?? []), ...(tokens.easings ?? [])].map((t) => [t.var, t.figma ?? null]));
  const groups = new Map(), timingsOf = new Map();
  for (const m of moves) {
    if (!m.code) continue;
    const purpose = purposeOf(m.when), key = `${m.code.ms}|${ease(m.code.easing)}|${m.code.delay ?? 0}`;
    const g = groups.get(key) ?? { ms: m.code.ms, easing: m.code.easing, delay: m.code.delay ?? 0, purposes: new Set(), vars: new Set(), uses: [], statuses: new Set(), figmaTimings: new Set() };
    g.purposes.add(purpose);
    for (const v of m.code.vars ?? []) g.vars.add(v);
    if (!g.uses.some((u) => u.component === m.component && u.part === m.part && u.purpose === purpose)) g.uses.push({ component: m.component, part: m.part, what: m.what, purpose });
    g.statuses.add(m.status);
    if (m.figma) g.figmaTimings.add(`${m.figma.ms}ms, ${m.figma.easing}`);
    groups.set(key, g);
    (timingsOf.get(purpose) ?? timingsOf.set(purpose, new Set()).get(purpose)).add(key);
  }
  const rank = (p) => { const i = PURPOSE_ORDER.indexOf(p); return i < 0 ? PURPOSE_ORDER.length : i; };
  const rows = [...groups.entries()].map(([key, g]) => {
    const st = g.statuses;
    const figma = st.size === 1 && st.has('unread') ? 'unread' : st.has('differs') || st.has('code-none') ? 'differs' : st.has('same') && !st.has('figma-none') && !st.has('code-only') ? 'same' : 'none';
    const purposes = [...g.purposes].sort((a, b) => rank(a) - rank(b));
    return { ms: g.ms, easing: g.easing, delay: g.delay, purposes, vars: [...g.vars].sort().map((v) => ({ var: v, figma: named.get(v) ?? null })), uses: g.uses.sort((a, b) => rank(a.purpose) - rank(b.purpose) || a.component.localeCompare(b.component)), figma, figmaTiming: [...g.figmaTimings].join('; ') || null, shared: new Set(g.uses.map((u) => u.component)).size, values: !g.vars.size,
      alsoTimed: purposes.filter((p) => timingsOf.get(p).size > 1).map((p) => ({ purpose: p, timings: timingsOf.get(p).size })) };
  });
  // A variable for a duration or a curve that no component uses.
  const used = new Set(rows.flatMap((r) => r.vars.map((v) => v.var)));
  for (const t of tokens.durations ?? []) if (!used.has(t.var)) rows.push({ ms: t.ms, easing: null, delay: 0, purposes: [], vars: [{ var: t.var, figma: t.figma ?? null }], uses: [], figma: t.figma ? 'same' : 'none', figmaTiming: null, shared: 0, values: false, alsoTimed: [], unused: true });
  for (const t of tokens.easings ?? []) if (!used.has(t.var)) rows.push({ ms: null, easing: t.value, delay: 0, purposes: [], vars: [{ var: t.var, figma: t.figma ?? null }], uses: [], figma: t.figma ? 'same' : 'none', figmaTiming: null, shared: 0, values: false, alsoTimed: [], unused: true });
  return rows.sort((a, b) => (a.ms ?? Infinity) - (b.ms ?? Infinity) || !!a.unused - !!b.unused || String(a.easing).localeCompare(String(b.easing)));
}

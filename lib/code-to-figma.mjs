// code-to-figma.mjs - a component only the code has, drawn into Figma from what the engine reads of it.
//
// A component that exists only in the code is shown on the style guide as Only in the code, with a task to add it to
// Figma or take it out of the code, and a designer redraws it by hand. The engine reads the code as deeply as Figma
// (code-grammar.mjs): its props and their options, its parts in order and which are shown on a condition, which prop
// writes which text, the tokens its styles use, the text style each part's text is set in. This turns that reading into
// the operations a spec is built from (figma-ops.mjs), so the existing path checks them against the system and builds
// them in Figma through the script a person says yes to (--spec, --figma-build): a component created from nothing but
// auto layout, an axis for each prop of options, a layer for each part, a boolean property for each part a prop shows,
// a text property for each prop it writes, and each value bound to the system's own variable. Nothing is guessed: a
// value the code writes by hand, a part's text with no text style of the system's, a nested component Figma does not
// have, each becomes a question of the spec, as any spec asks it.
//
//   opsFromCode({ name, text, api, anatomy, varOf, componentOf }) → [operation]
//     varOf(cssVar)       → the Figma variable a custom property stands for, or null (variablesByCss)
//     componentOf(tag)    → the Figma component a nested element is (<chip-tag>, <ChipTag>), or null
//   variablesByCss(varNames, toCss) → (cssVar) → Figma variable name, from every variable the capture names
//   opsFromMarkup({ name, markup, componentOf, textStyleOf, layoutOf, bindsOf }) → [operation]: a template or a pattern
//     drawn as a frame (create kind 'frame'), its elements nested frames, its tags instances, its texts in their style
//   markupTree(markup) → { tag, classes, kids, words, shownOn }, the markup's elements as they nest
//
// Pure: nothing is read or written here.

const PROPS_ON = { 'background-color': 'fill', background: 'fill', color: null, gap: 'gap', 'column-gap': 'gap', 'row-gap': 'gap', 'border-radius': 'radius', 'border-color': 'stroke', 'border-width': 'strokeWeight', padding: 'padding', 'padding-inline': 'paddingX', 'padding-block': 'paddingY', 'padding-left': 'paddingLeft', 'padding-right': 'paddingRight', 'padding-top': 'paddingTop', 'padding-bottom': 'paddingBottom', 'min-height': 'height', height: 'height' };
const firstVar = (v) => (/var\(\s*(--[\w-]+)/.exec(String(v ?? '')) ?? [])[1] ?? null;
const words = (s) => String(s ?? '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[^A-Za-z0-9]+/).filter(Boolean);
const layerName = (cls, root) => { const w = words(String(cls).replace(new RegExp(`^${String(root).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(__|-)`), '')); return w.length ? w.map((x, i) => (i ? x : x[0].toUpperCase() + x.slice(1))).join(' ') : cls; };

export function variablesByCss(varNames = {}, toCss = () => null) {
  const map = new Map();
  for (const v of Object.values(varNames ?? {})) { const n = typeof v === 'string' ? v : v?.name; const c = n ? toCss(n) : null; if (c && !map.has(c)) map.set(c, n); }
  return (cssVar) => map.get(cssVar) ?? null;
}

// The element a prop's words are written into ({{ label }}, {label}), by the class it carries.
function writtenBy(text, prop) {
  const re = new RegExp(`<([A-Za-z][\\w.-]*)\\b([^>]*)>\\s*(?:\\{\\{\\s*${prop}\\s*\\}\\}|\\{\\s*(?:props\\.)?${prop}\\s*\\})\\s*<`, 'g');
  const m = re.exec(String(text ?? ''));
  return m ? (/class(?:Name)?\s*=\s*["']([^"'\s]+)/.exec(m[2]) ?? [])[1] ?? null : null;
}
// The prop a part is shown on (v-if="icon", {icon && <span class="…">}, {#if icon}), by the class it carries.
function shownBy(text, cls, props) {
  const t = String(text ?? '');
  const at = t.search(new RegExp(`class(?:Name)?\\s*=\\s*["'][^"']*\\b${cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`));
  if (at < 0) return null;
  const tag = t.lastIndexOf('<', at), around = t.slice(Math.max(0, tag - 80), t.indexOf('>', at) + 1);
  const cond = (/(?:v-if|v-show)\s*=\s*"([^"]+)"/.exec(around) ?? /\{\s*([\w.!]+)\s*&&\s*\(?\s*<[^<]*$/.exec(t.slice(Math.max(0, tag - 80), tag + 1)) ?? /\{#if\s+([^}]+)\}\s*$/.exec(t.slice(Math.max(0, tag - 80), tag)) ?? [])[1];
  if (!cond) return null;
  const w = cond.replace(/^!|props\./g, '').trim();
  return props.includes(w) ? w : null;
}

export function opsFromCode({ name, text = '', api = {}, anatomy = null, varOf = () => null, componentOf = () => null } = {}) {
  if (!name || !anatomy) return [];
  const props = api?.props ?? {}, propNames = Object.keys(props);
  const root = String(anatomy.root ?? '').replace(/^\./, '');
  const options = Object.entries(props).filter(([, p]) => (p.options ?? []).length > 1);
  const ops = [{ op: 'create', name, axes: options.map(([k, p]) => ({ name: k, options: p.options.map(String) })), layout: { dir: anatomy.wrap?.wrap === 'wrap' ? 'HORIZONTAL' : 'HORIZONTAL' } }];
  if (String(api.description ?? '').trim()) ops.push({ op: 'describe', text: String(api.description).trim() });
  // Its parts, in the order the markup writes them: a nested component as an instance of Figma's, a part that writes a
  // prop's words as a text in its text style, any other as a frame.
  const textProps = Object.fromEntries(Object.entries(props).filter(([, p]) => /^(string|text)/i.test(String(p.type ?? '')) && !(p.options ?? []).length).map(([k]) => [k, writtenBy(text, k)]).filter(([, c]) => c));
  const styleOf = (cls) => (anatomy.text ?? []).find((x) => x.part === cls && x.style)?.style ?? null;
  const layers = {};
  for (const p of anatomy.parts ?? []) {
    if (!p.class && !p.component) continue;
    const of = p.component ? componentOf(p.element) : null;
    const lname = p.class ? layerName(p.class, root) : of ?? p.element;
    if (layers[lname]) continue;
    const writes = Object.entries(textProps).find(([, c]) => c === p.class)?.[0];
    const layer = p.component ? { type: 'instance', name: lname, of: of ?? p.element }
      : writes ? { type: 'text', name: lname, style: styleOf(p.class) ?? undefined, text: String(props[writes]?.default ?? writes) }
      : { type: 'frame', name: lname };
    ops.push({ op: 'addLayer', parent: '', layer });
    layers[lname] = p;
    if (writes) ops.push({ op: 'addProperty', name: writes, kind: 'text', default: String(props[writes]?.default ?? writes), layer: lname });
    const by = p.class ? shownBy(text, p.class, propNames) : null;
    if (by && p.optional) ops.push({ op: 'addProperty', name: by, kind: 'boolean', default: props[by]?.default !== false, layer: lname });
  }
  // Its own look, each value bound to the variable it is written with; one written by hand is a question.
  const seen = new Set();
  // Only its own base rule (.chip, never .chip:hover or .chip--large): a state's or an option's value is that variant's.
  for (const r of [...(anatomy.fills ?? []), ...(anatomy.spacing ?? []), ...(anatomy.borders ?? [])].filter((x) => !x.part && String(x.selector ?? '').trim() === `.${root}`)) {
    const field = PROPS_ON[r.prop]; if (!field || seen.has(field)) continue;
    const v = firstVar(r.value);
    seen.add(field);
    ops.push({ op: 'bind', layer: '', field, variable: (v && varOf(v)) ?? r.value });
  }
  if (anatomy.radius) { const v = firstVar(anatomy.radius.values?.[0]); ops.push({ op: 'bind', layer: '', field: 'radius', variable: (v && varOf(v)) ?? anatomy.radius.values?.[0] }); }
  return ops;
}

// ── A template or a pattern: a frame of the system's own components, drawn from its markup ─────────────────────────

const VOID = /^(img|input|br|hr|meta|link|source|area|col|embed|param|track|wbr)$/i;
const TEXTISH = /^(span|p|h[1-6]|label|strong|em|small|a|li|dt|dd|figcaption|caption|legend)$/i;
// The markup as a tree: each element with its tag, its classes, its children and the words it holds directly.
export function markupTree(markup) {
  // Every comment, however they nest or are left open, taken out until none is left.
  let t = String(markup ?? ''), was;
  do { was = t; t = t.replace(/<!--[\s\S]*?-->/g, ''); } while (t !== was);
  t = t.replace(/<!--[\s\S]*$/, '');
  const root = { tag: '#root', classes: [], kids: [], words: '' }, stack = [root];
  for (const m of t.matchAll(/<\/([A-Za-z][\w.-]*)\s*>|<([A-Za-z][\w.-]*)((?:\s+(?:[^>"'`{}]|"[^"]*"|'[^']*'|`[^`]*`|\{[^{}]*\})*)?)\s*(\/?)>|([^<]+)/g)) {
    const top = stack[stack.length - 1];
    if (m[1]) { while (stack.length > 1 && stack.pop().tag !== m[1]); continue; }
    if (m[5]) { const w = m[5].replace(/\s+/g, ' ').trim(); if (w) top.words = `${top.words} ${w}`.trim(); continue; }
    const tag = m[2], attrs = m[3] ?? '', closed = !!m[4] || /\/\s*$/.test(attrs);
    if (/^(template|script|style|slot)$/i.test(tag)) { if (/^template$/i.test(tag) && !closed) stack.push({ tag, classes: [], kids: top.kids, words: '' }); continue; }
    const classes = [...attrs.matchAll(/(?:^|\s)(?:class|className)\s*=\s*["']([^"']*)["']/g)].flatMap((a) => a[1].split(/\s+/)).filter(Boolean);
    const node = { tag, classes, kids: [], words: '', shownOn: /(?:^|\s)(?:v-if|v-show)\s*=/.test(attrs) };
    top.kids.push(node);
    if (!closed && !VOID.test(tag)) stack.push(node);
  }
  return root;
}

// textStyleOf(class) → the system's text style a class's text is set in; layoutOf(class) → { dir } from its own rule;
// bindsOf(class) → [{ field, variable }] its gap and padding, each the variable it is written with.
export function opsFromMarkup({ name, markup, componentOf = () => null, textStyleOf = () => null, layoutOf = () => null, bindsOf = () => [] } = {}) {
  const tree = markupTree(markup);
  const top = tree.kids.length === 1 ? tree.kids[0] : tree;
  const topCls = top.classes?.[0];
  const ops = [{ op: 'create', name, kind: 'frame', layout: layoutOf(topCls) ?? { dir: 'VERTICAL' } }];
  for (const b of topCls ? bindsOf(topCls) : []) ops.push({ op: 'bind', layer: '', ...b });
  const used = new Set();
  const nameFor = (n, as = null) => { const base = as ?? (n.classes[0] ? n.classes[0].split(/__|-/).filter(Boolean).slice(-2).map((w, i) => (i ? w : w[0].toUpperCase() + w.slice(1))).join(' ') : n.tag); let k = base, i = 2; while (used.has(k)) k = `${base} ${i++}`; used.add(k); return k; };
  const walk = (n, parent) => {
    for (const k of n.kids) {
      const of = /^[A-Z]|-/.test(k.tag) ? componentOf(k.tag) : null;
      if (of || /^[A-Z]|-/.test(k.tag)) { ops.push({ op: 'addLayer', parent, layer: { type: 'instance', name: nameFor(k, of ?? k.tag), of: of ?? k.tag } }); continue; }
      if (TEXTISH.test(k.tag) && !k.kids.length) { ops.push({ op: 'addLayer', parent, layer: { type: 'text', name: nameFor(k), style: k.classes.map(textStyleOf).find(Boolean) ?? undefined, text: k.words.replace(/\{\{\s*([\w.]+)\s*\}\}|\{\s*([\w.]+)\s*\}/g, (x, a, b) => a ?? b) || k.tag } }); continue; }
      if (!k.kids.length && !k.words) continue;
      const lname = nameFor(k), path = parent ? `${parent}/${lname}` : lname;
      ops.push({ op: 'addLayer', parent, layer: { type: 'frame', name: lname, layout: layoutOf(k.classes[0]) ?? { dir: 'VERTICAL' } } });
      for (const b of k.classes[0] ? bindsOf(k.classes[0]) : []) ops.push({ op: 'bind', layer: path, ...b });
      walk(k, path);
    }
  };
  walk(top, '');
  return ops;
}

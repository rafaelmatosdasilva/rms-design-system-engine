// figma-ops.mjs - a component built or changed in Figma the system's way: a few operations, checked against the system
// before anything is written, and the plugin script that makes exactly them.
//
// The engine never draws a component from memory. A new one starts as a copy of the component it is like (clone), or
// from nothing but auto layout (create); a change is only what it changes. Each step is one operation:
//   clone {from, name}                     a copy of an existing component, named anew (a new component starts here)
//   create {name, axes?, layout?}          a component (a set, when it has axes) with nothing inside but auto layout
//   rename {what: component|axis|option|property|layer, from, to, axis?}
//   addOption {axis, option, like}         a variant option, its variants copied from the option it is like
//   removeOption {axis, option}
//   addAxis {axis, options, default?}      a variant axis: every variant once per option
//   addProperty {name, kind: boolean|text|swap, default, layer}   a property and the layer it drives
//   removeProperty {name}
//   setDefault {property, value}
//   addLayer {parent, index?, layer: {type: instance|text|frame, name, of?, variant?, style?, text?, layout?, hidden?}}
//   removeLayer {layer}
//   bind {layer, field, variable, where?}  a variable on a layer ('' is the component's own frame), in every variant or
//                                          those where says ({ size: 'l' }); field: fill, stroke, gap, padding,
//                                          paddingX, paddingY, paddingTop…, radius, fontSize, strokeWeight, width, height
//   rebind {from, to}                      every binding of one variable moved to another
//   describe {text}                        its description in Figma
//   place {page?, section?}                where it sits
// Layers are named by their path inside the component (Content/Label).
//
//   modelOf(name, captures) → the component as the capture read it: axes, options, variants, properties, layers (by key:
//     the node id when the capture has it, else the path), the variables bound on each layer and field (every variant's,
//     so a list), description, page, section
//   predict(model, ops, captures) → the model as it will be once the operations are made (null before a clone or create)
//   ground(ops, { captures, grammar, target }) → { ops, questions, named, held, breaking }: every variable, component
//     and layer an operation names is one the system has, or a question; a raw value (#ff0000, 16px) is a question,
//     never written; every new name is written the system's way (the construction grammar's rules); what adds to the
//     system (a new component, option, axis or property) is held for sign-off; what a product may lean on (a removal,
//     a rename) is breaking
//   opsScript(ops, { target, nodes }) → the Figma plugin script that makes exactly them and returns what it changed
//
// Pure: no file is read or written here.
import { fixOf, wordsOf } from './construction-grammar.mjs';

export const OPS = ['clone', 'create', 'rename', 'addOption', 'removeOption', 'addAxis', 'addProperty', 'removeProperty', 'setDefault', 'addLayer', 'removeLayer', 'bind', 'rebind', 'describe', 'place'];
const KIND = { boolean: 'BOOLEAN', text: 'TEXT', swap: 'INSTANCE_SWAP', 'instance swap': 'INSTANCE_SWAP', BOOLEAN: 'BOOLEAN', TEXT: 'TEXT', INSTANCE_SWAP: 'INSTANCE_SWAP' };
const KIND_ID = { BOOLEAN: 'boolean', TEXT: 'text', INSTANCE_SWAP: 'instance-swap', VARIANT: 'variant' };
// The capture's field for each binding (component-values.snapshot.json → hygiene.binds), in the words an operation uses.
const FIELD = { FRAME_FILL: 'fill', SHAPE_FILL: 'fill', TEXT_FILL: 'fill', FILL: 'fill', STROKE_COLOR: 'stroke', STROKE: 'stroke', GAP: 'gap', ITEM_SPACING: 'gap',
  PADDING: 'padding', PADDING_LEFT: 'paddingLeft', PADDING_RIGHT: 'paddingRight', PADDING_TOP: 'paddingTop', PADDING_BOTTOM: 'paddingBottom',
  CORNER_RADIUS: 'radius', TOP_LEFT_RADIUS: 'radius', TOP_RIGHT_RADIUS: 'radius', BOTTOM_LEFT_RADIUS: 'radius', BOTTOM_RIGHT_RADIUS: 'radius',
  FONT_SIZE: 'fontSize', STROKE_WEIGHT: 'strokeWeight', WIDTH: 'width', HEIGHT: 'height', OPACITY: 'opacity', COUNTER_AXIS_SPACING: 'counterAxisSpacing' };
export const FIELDS = ['fill', 'stroke', 'gap', 'counterAxisSpacing', 'padding', 'paddingX', 'paddingY', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'radius', 'fontSize', 'strokeWeight', 'width', 'height', 'opacity'];
const RAW = /^#[0-9a-f]{3,8}$|^rgba?\(|^-?\d+(\.\d+)?(px|rem|em|%)?$/i;
const clean = (k) => String(k).replace(/#[^#]*$/, '');
const copy = (x) => JSON.parse(JSON.stringify(x));
export const axesOfName = (v) => Object.fromEntries(String(v).split(',').map((x) => x.trim().split('=')).filter((x) => x.length === 2).map(([k, x]) => [k.trim(), x.trim()]));
const nameOfAxes = (a) => Object.entries(a).map(([k, v]) => `${k}=${v}`).join(', ');

// ── The component as the capture read it ──
export function modelOf(name, { props = {}, skeleton = {}, values = {}, varNames = {} } = {}) {
  const p = props[name], s = skeleton[name];
  if (!p && !s) return null;
  const axes = [], properties = [];
  for (const [key, d] of Object.entries(p?.properties ?? {})) {
    const n = clean(key);
    if (d.type === 'VARIANT') axes.push({ k: n, name: n, options: (d.variantOptions ?? []).map((o) => ({ k: o, name: o })), default: d.defaultValue ?? d.variantOptions?.[0] ?? null });
    else properties.push({ k: n, name: n, kind: d.type, default: typeof d.defaultValue === 'object' ? null : d.defaultValue ?? null, ...(d.preferredValues?.length ? { preferred: d.preferredValues.length } : {}) });
  }
  // Every layer any variant holds, by its path; an instance's own layers are its component's, never walked.
  const layers = {};
  const walk = (t, path) => {
    for (const c of t?.c ?? []) {
      const at = path ? `${path}/${c.n}` : c.n, k = c.id ?? at;
      layers[k] ??= { path: at, type: c.t, ...(c.of?.name ? { of: c.of.name } : {}), ...(c.wired ? { wired: { ...c.wired } } : {}), ...(c.styles?.text ? { style: c.styles.text } : {}), ...(c.hidden ? { hidden: true } : {}) };
      if (c.t !== 'INSTANCE') walk(c, at);
    }
  };
  for (const t of s?.trees ?? []) walk(t, '');
  const byPath = Object.fromEntries(Object.entries(layers).map(([k, l]) => [l.path, k]));
  // The variables bound on each layer: the values capture keeps, for each variable, the field and the layer's path,
  // headed by the component's name.
  const binds = {};
  for (const [id, where] of Object.entries(values[name]?.hygiene?.binds ?? {})) {
    const v = varNames[id]?.name ?? (typeof varNames[id] === 'string' ? varNames[id] : null);
    if (!v) continue;
    for (const [field, at] of Object.entries(where ?? {})) {
      const path = String(at).split('/').slice(1).join('/');
      const k = path ? byPath[path] ?? path : '';
      const b = (binds[`${k}|${FIELD[field] ?? field.toLowerCase()}`] ??= []);
      if (!b.includes(v)) { b.push(v); b.sort(); }
    }
  }
  const variants = (s?.variants ?? []).map(([vn]) => vn);
  return { name, nodeId: p?.nodeId ?? null, description: String(p?.description ?? ''), page: s?.page ?? null, section: s?.section ?? null,
    axes, properties, variants: variants.length ? variants : axes.length ? [] : [name], layers, binds, ...(s?.layout ? { layout: s.layout } : (s?.trees?.[0]?.layout ? { layout: s.trees[0].layout } : {})) };
}

// The key of a layer by its path, now.
const keyAt = (m, path) => (path === '' ? '' : Object.entries(m.layers).find(([, l]) => l.path === path)?.[0] ?? null);
const under = (path, p) => path === p || path.startsWith(p + '/');
const optionsOf = (m, axis) => m.axes.find((a) => a.name === axis)?.options ?? [];

// ── The model once the operations are made ──
export function predict(model, ops = [], captures = {}) {
  let m = model ? copy(model) : null;
  for (const o of ops) {
    if (o.op === 'clone') { const from = modelOf(o.from, captures); m = from ? { ...copy(from), name: o.name, nodeId: null, from: o.from, description: '' } : null; continue; }
    if (o.op === 'create') {
      const axes = (o.axes ?? []).map((a) => ({ k: `new:${a.name}`, name: a.name, options: a.options.map((x) => ({ k: `new:${x}`, name: x })), default: a.default ?? a.options[0] }));
      const combos = axes.reduce((all, a) => all.flatMap((c) => a.options.map((x) => ({ ...c, [a.name]: x.name }))), [{}]);
      m = { name: o.name, nodeId: null, description: '', page: null, section: null, axes, properties: [], variants: axes.length ? combos.map(nameOfAxes) : [o.name], layers: {}, binds: {}, ...(o.layout ? { layout: o.layout } : {}) };
      continue;
    }
    if (!m) continue;
    if (o.op === 'rename') {
      if (o.what === 'component') m.name = o.to;
      if (o.what === 'axis') { const a = m.axes.find((x) => x.name === o.from); if (a) a.name = o.to; m.variants = m.variants.map((v) => nameOfAxes(Object.fromEntries(Object.entries(axesOfName(v)).map(([k, x]) => [k === o.from ? o.to : k, x])))); }
      if (o.what === 'option') { const x = optionsOf(m, o.axis).find((y) => y.name === o.from); if (x) x.name = o.to; const a = m.axes.find((y) => y.name === o.axis); if (a?.default === o.from) a.default = o.to; m.variants = m.variants.map((v) => { const a2 = axesOfName(v); if (a2[o.axis] === o.from) a2[o.axis] = o.to; return nameOfAxes(a2); }); }
      if (o.what === 'property') { const p = m.properties.find((x) => x.name === o.from); if (p) p.name = o.to; for (const l of Object.values(m.layers)) for (const [f, v] of Object.entries(l.wired ?? {})) if (v === o.from) l.wired[f] = o.to; }
      if (o.what === 'layer') { const base = o.from.includes('/') ? o.from.slice(0, o.from.lastIndexOf('/') + 1) : ''; for (const l of Object.values(m.layers)) if (under(l.path, o.from)) l.path = base + o.to + l.path.slice(o.from.length); }
    }
    if (o.op === 'addOption') {
      const a = m.axes.find((x) => x.name === o.axis);
      if (a && !a.options.some((x) => x.name === o.option)) a.options.push({ k: `new:${o.option}`, name: o.option });
      m.variants.push(...m.variants.filter((v) => axesOfName(v)[o.axis] === o.like).map((v) => nameOfAxes({ ...axesOfName(v), [o.axis]: o.option })));
    }
    if (o.op === 'removeOption') { const a = m.axes.find((x) => x.name === o.axis); if (a) a.options = a.options.filter((x) => x.name !== o.option); m.variants = m.variants.filter((v) => axesOfName(v)[o.axis] !== o.option); }
    if (o.op === 'addAxis') {
      m.axes.push({ k: `new:${o.axis}`, name: o.axis, options: o.options.map((x) => ({ k: `new:${x}`, name: x })), default: o.default ?? o.options[0] });
      const first = o.default ?? o.options[0];
      m.variants = m.variants.flatMap((v) => [first, ...o.options.filter((x) => x !== first)].map((x) => nameOfAxes({ ...axesOfName(v), [o.axis]: x })));
    }
    if (o.op === 'addProperty') {
      const kind = KIND[o.kind] ?? o.kind;
      m.properties.push({ k: `new:${o.name}`, name: o.name, kind, default: o.default ?? null });
      const k = keyAt(m, o.layer ?? '');
      if (k != null && k !== '') { const l = m.layers[k]; l.wired = { ...(l.wired ?? {}), [{ BOOLEAN: 'visible', TEXT: 'characters', INSTANCE_SWAP: 'mainComponent' }[kind]]: o.name }; }
    }
    if (o.op === 'removeProperty') { m.properties = m.properties.filter((p) => p.name !== o.name); for (const l of Object.values(m.layers)) for (const [f, v] of Object.entries(l.wired ?? {})) if (v === o.name) delete l.wired[f]; }
    if (o.op === 'setDefault') { const p = m.properties.find((x) => x.name === o.property); if (p) p.default = o.value; }
    if (o.op === 'addLayer') {
      const L = o.layer ?? {}, path = o.parent ? `${o.parent}/${L.name}` : L.name;
      m.layers[`new:${path}`] = { path, type: { instance: 'INSTANCE', text: 'TEXT', frame: 'FRAME' }[L.type] ?? String(L.type ?? 'FRAME').toUpperCase(), ...(L.of ? { of: L.of } : {}), ...(L.style ? { style: L.style } : {}), ...(L.hidden ? { hidden: true } : {}) };
    }
    if (o.op === 'removeLayer') {
      const gone = Object.entries(m.layers).filter(([, l]) => under(l.path, o.layer)).map(([k]) => k);
      for (const k of gone) delete m.layers[k];
      for (const b of Object.keys(m.binds)) if (gone.includes(b.split('|')[0])) delete m.binds[b];
    }
    if (o.op === 'bind') { const k = keyAt(m, o.layer ?? ''); if (k != null) { const key = `${k}|${o.field}`; m.binds[key] = o.where ? [...new Set([...(m.binds[key] ?? []), o.variable])].sort() : [o.variable]; } }
    if (o.op === 'rebind') for (const [b, v] of Object.entries(m.binds)) m.binds[b] = [...new Set(v.map((x) => (x === o.from ? o.to : x)))].sort();
    if (o.op === 'describe') m.description = o.text;
    if (o.op === 'place') { if (o.page) m.page = o.page; if (o.section) m.section = o.section; }
  }
  return m;
}

// ── A new name written the system's way ──
// The grammar's rules that hold (every component follows them, or the team or most do: rule or fix) for this kind of
// name; a rule still to decide is not imposed.
function systemName(kind, name, g, { axis = null, propKind = null } = {}) {
  const rules = (g?.figma?.rules ?? []).filter((r) => r.status === 'rule' || r.status === 'fix');
  const ids = kind === 'component' ? ['component-name-case'] : kind === 'layer' ? ['layer-name-case']
    : kind === 'option' ? [/^(true|false)$/i.test(name) ? 'variant-boolean-options' : 'variant-option-case']
      : kind === 'axis' ? ['variant-property-case'] : [`${KIND_ID[propKind] ?? 'boolean'}-property-case`, `${KIND_ID[propKind] ?? 'boolean'}-property-prefix`, `${KIND_ID[propKind] ?? 'boolean'}-property-suffix`];
  // A word in capitals (XL, CTA) is one word: written in lower case before a case is applied.
  let to = kind !== 'component' && /^[A-Z]{2,}\d*$/.test(name) ? name.toLowerCase() : name;
  if (to !== name && !rules.some((r) => ids.includes(r.id) && /-case$|-options$/.test(r.id))) to = name;
  for (const id of ids) {
    const r = rules.find((x) => x.id === id);
    if (!r) continue;
    const word = (r.says.match(/"(\w+)"/) ?? [])[1]?.toLowerCase();
    if (/-prefix$/.test(id) && wordsOf(to)[0] === word && wordsOf(to).length > 1) continue;
    if (/-suffix$/.test(id) && wordsOf(to).at(-1) === word && wordsOf(to).length > 1) continue;
    const f = fixOf(r, { value: kind === 'option' ? `${axis}=${to}` : to });
    if (f?.to && f.to !== to) to = f.to;
  }
  return to;
}

// ── Every operation checked against the system ──
// captures: { props, skeleton, values, varNames }; grammar: grammarOf(...); target: the component changed (null when one
// is built). → { ops, questions: [{ at, ask }], named: [{ from, to, why }], held: [{ what }], breaking: [{ what }] }
export function ground(input = [], { captures = {}, grammar = null, target = null } = {}) {
  const { props = {}, varNames = {} } = captures;
  const variables = new Set(Object.values(varNames).map((v) => (typeof v === 'string' ? v : v?.name)).filter(Boolean));
  const components = new Set(Object.keys(props).filter((n) => !n.startsWith('_')));
  const questions = [], named = [], held = [], breaking = [], ops = [];
  let m = target ? modelOf(target, captures) : null;
  const ask = (at, text) => questions.push({ at, ask: text });
  const nameIt = (kind, name, opts) => { const to = systemName(kind, name, grammar, opts); if (to !== name) named.push({ from: name, to, why: `${kind === 'property' ? 'a property' : `a${/^[aeiou]/.test(kind) ? 'n' : ''} ${kind}`} is named the way the system names one` }); return to; };
  const near = (v) => { const w = wordsOf(String(v).replace(/\//g, ' ')); return [...variables].filter((x) => w.some((y) => y.length > 2 && x.toLowerCase().includes(y))).slice(0, 5); };
  const varOk = (at, v) => {
    if (RAW.test(String(v ?? '').trim())) { ask(at, `${v} is a value, not one of the system's variables: which variable is it?${near(v).length ? ` (${near(v).join(', ')}…)` : ''}`); return false; }
    if (!variables.has(v)) { ask(at, `The system has no variable ${v}: which one is it?${near(v).length ? ` Its nearest: ${near(v).join(', ')}.` : ''}`); return false; }
    return true;
  };
  const layerOk = (at, path, what = 'layer') => { if (path === '' || path == null) return true; if (m && keyAt(m, path) != null) return true; ask(at, `${m?.name ?? 'It'} has no ${what} ${path}${m ? `: its layers are ${Object.values(m.layers).map((l) => l.path).slice(0, 8).join(', ')}` : ''}.`); return false; };
  const existing = !!target;
  input.forEach((raw, at) => {
    const o = { ...raw };
    if (!OPS.includes(o.op)) { ask(at, `${o.op} is not an operation the engine makes (${OPS.join(', ')}).`); return; }
    if (o.op === 'clone') {
      if (!components.has(o.from)) { ask(at, `The system has no component ${o.from} to build it like.`); return; }
      if (!o.name) { ask(at, 'What is the new component called?'); return; }
      o.name = nameIt('component', o.name);
      if (components.has(o.name)) { ask(at, `The system already has ${o.name}: change that one (--figma-change), or give the new one another name.`); return; }
      held.push({ what: `a new component, ${o.name}, built like ${o.from}` });
    }
    if (o.op === 'create') {
      if (!o.name) { ask(at, 'What is the new component called?'); return; }
      o.name = nameIt('component', o.name);
      if (components.has(o.name)) { ask(at, `The system already has ${o.name}.`); return; }
      o.axes = (o.axes ?? []).map((a) => ({ ...a, name: nameIt('axis', a.name), options: (a.options ?? []).map((x) => nameIt('option', x, { axis: a.name })) }));
      held.push({ what: `a new component, ${o.name}, built from nothing (no component in the system is like it)` });
    }
    if (o.op === 'rename') {
      if (!['component', 'axis', 'option', 'property', 'layer'].includes(o.what)) { ask(at, `rename takes what: component, axis, option, property or layer (not ${o.what}).`); return; }
      if (o.what === 'axis' && m && !m.axes.some((a) => a.name === o.from)) { ask(at, `${m.name} has no variant axis ${o.from}.`); return; }
      if (o.what === 'option' && m && !optionsOf(m, o.axis).some((x) => x.name === o.from)) { ask(at, `${m.name}'s ${o.axis} has no option ${o.from}.`); return; }
      if (o.what === 'property' && m && !m.properties.some((p) => p.name === o.from)) { ask(at, `${m.name} has no property ${o.from}.`); return; }
      if (o.what === 'layer' && !layerOk(at, o.from)) return;
      const kind = m?.properties.find((p) => p.name === o.from)?.kind;
      o.to = nameIt(o.what, o.what === 'layer' ? o.to.split('/').at(-1) : o.to, { axis: o.axis, propKind: kind });
      if (existing && o.what !== 'layer') breaking.push({ what: `the ${o.what} ${o.what === 'option' ? `${o.axis}=${o.from}` : o.from} renamed ${o.to}: an instance keeps working, but the code and every product that names it must follow` });
    }
    if (o.op === 'addOption') {
      if (m && !m.axes.some((a) => a.name === o.axis)) { ask(at, `${m.name} has no variant axis ${o.axis}${m.axes.length ? ` (it has ${m.axes.map((a) => a.name).join(', ')})` : ''}.`); return; }
      if (m && !optionsOf(m, o.axis).some((x) => x.name === o.like)) { ask(at, `Which of ${m.name}'s ${o.axis} options is the new ${o.option} like (${optionsOf(m, o.axis).map((x) => x.name).join(', ')})? Its variants start as copies of that one's.`); return; }
      o.option = nameIt('option', o.option, { axis: o.axis });
      if (existing) held.push({ what: `a new option, ${o.axis}=${o.option}, on ${m?.name}` });
    }
    if (o.op === 'removeOption') {
      if (m && !optionsOf(m, o.axis).some((x) => x.name === o.option)) { ask(at, `${m.name}'s ${o.axis} has no option ${o.option}.`); return; }
      if (existing) breaking.push({ what: `the option ${o.axis}=${o.option} removed: every instance set to it, and every product that uses it, breaks` });
    }
    if (o.op === 'addAxis') {
      if (!(o.options ?? []).length) { ask(at, `Which options does ${o.axis} take?`); return; }
      o.axis = nameIt('axis', o.axis); o.options = o.options.map((x) => nameIt('option', x, { axis: o.axis }));
      if (existing) held.push({ what: `a new variant axis, ${o.axis} (${o.options.join(', ')}), on ${m?.name}` });
    }
    if (o.op === 'addProperty') {
      const kind = KIND[o.kind];
      if (!kind) { ask(at, `A property is a boolean, a text or a swap (not ${o.kind}).`); return; }
      if (!layerOk(at, o.layer ?? '')) return;
      if (!o.layer) { ask(at, `Which layer does ${o.name} drive? A property that drives no layer is a fault the system flags.`); return; }
      if (kind === 'INSTANCE_SWAP' && !components.has(o.default)) { ask(at, `Which of the system's components does ${o.name} show unless swapped? (the system has no ${o.default})`); return; }
      o.name = nameIt('property', o.name, { propKind: kind });
      if (existing) held.push({ what: `a new ${o.kind} property, ${o.name}, on ${m?.name}` });
    }
    if (o.op === 'removeProperty') {
      if (m && !m.properties.some((p) => p.name === o.name)) { ask(at, `${m.name} has no property ${o.name}.`); return; }
      if (existing) breaking.push({ what: `the property ${o.name} removed: every instance that sets it, and every product that uses it, breaks` });
    }
    if (o.op === 'setDefault' && m && !m.properties.some((p) => p.name === o.property)) { ask(at, `${m.name} has no property ${o.property}.`); return; }
    if (o.op === 'addLayer') {
      const L = o.layer ?? {};
      if (!layerOk(at, o.parent ?? '', 'parent layer')) return;
      if (!['instance', 'text', 'frame'].includes(L.type)) { ask(at, `A new layer is an instance of one of the system's components, a text or a frame (not ${L.type}): an icon or a shape is an instance of a component the system has.`); return; }
      if (L.type === 'instance' && !components.has(L.of)) { ask(at, `The system has no component ${L.of}: which of its components goes there?`); return; }
      if (L.type === 'text' && !L.style) { ask(at, `Which of the system's text styles does ${L.name ?? 'the text'} use? (every text layer uses one)`); return; }
      if (!L.name) { ask(at, 'What is the new layer called?'); return; }
      o.layer = { ...L, name: L.type === 'instance' && L.name === L.of ? L.name : nameIt('layer', L.name) };
      for (const k of ['fill', 'stroke', 'color', 'padding', 'gap', 'radius']) if (L[k] != null) { ask(at, `${L.name} sets ${k} to ${L[k]}: bind one of the system's variables instead (a bind operation).`); return; }
    }
    if (o.op === 'removeLayer') {
      if (!layerOk(at, o.layer)) return;
      if (existing) breaking.push({ what: `the layer ${o.layer} removed: a product that overrides it loses that` });
    }
    if (o.op === 'bind') {
      if (!FIELDS.includes(o.field)) { ask(at, `bind takes a field: ${FIELDS.join(', ')} (not ${o.field}).`); return; }
      if (!layerOk(at, o.layer ?? '') || !varOk(at, o.variable)) return;
      if (o.where && m) for (const [k, x] of Object.entries(o.where)) if (!optionsOf(m, k).some((y) => y.name === x)) { ask(at, `${m.name} has no variant ${k}=${x} to bind on.`); return; }
    }
    if (o.op === 'rebind') { if (!varOk(at, o.from) || !varOk(at, o.to)) return; }
    if (o.op === 'describe' && !String(o.text ?? '').trim()) { ask(at, 'What does its description say?'); return; }
    ops.push(o);
    m = predict(m, [o], captures);
  });
  return { ops, questions, named, held, breaking };
}

// ── The Figma plugin script ──
// target: the node id of the component changed (null when it is built); nodes: { component name → node id }, for the
// components it copies or nests.
export function opsScript(ops = [], { target = null, nodes = {}, what = 'figma-build' } = {}) {
  return `// Written by rms-design-system-engine --${what}. Run it with the Figma MCP's use_figma only after the person said yes.
const ops = ${JSON.stringify(ops, null, 2)};
const nodes = ${JSON.stringify(nodes, null, 2)};
const changed = [], skipped = [], missing = [];
const pageOf = async (n) => { let p = n; while (p && p.type !== 'PAGE') p = p.parent; if (p && p.loadAsync) await p.loadAsync(); return p; };
const nodeOf = async (name) => (nodes[name] ? await figma.getNodeByIdAsync(nodes[name]) : null);
const vars = await figma.variables.getLocalVariablesAsync();
const varOf = (name) => vars.find((v) => v.name === name);
const textStyles = await figma.getLocalTextStylesAsync();
const variantsOf = (s) => (s.type === 'COMPONENT_SET' ? s.children.filter((c) => c.type === 'COMPONENT') : [s]);
const axesOf = (v) => Object.fromEntries(String(v.name).split(/,\\s*/).map((p) => p.split('=').map((x) => x.trim())).filter((p) => p.length === 2));
const named = (a) => Object.entries(a).map(([k, v]) => k + '=' + v).join(', ');
const layerIn = (v, path) => { if (!path) return v; let n = v; for (const seg of path.split('/')) { n = (n.children || []).find((c) => c.name === seg); if (!n) return null; } return n; };
const keyOf = (s, name) => Object.keys(s.componentPropertyDefinitions || {}).find((k) => k.replace(/#[^#]*$/, '') === name);
const fonts = async (n) => { if (n.type !== 'TEXT') return; const f = n.fontName === figma.mixed ? n.getRangeAllFontNames(0, n.characters.length) : [n.fontName]; for (const x of f) await figma.loadFontAsync(x); };
const inside = (s) => [s, ...(s.findAll ? s.findAll((n) => { for (let p = n.parent; p && p !== s; p = p.parent) if (p.type === 'INSTANCE') return false; return true; }) : [])];
// New variants go in a row under the others, and the set grows to hold them.
const fit = (s) => { if (s.type !== 'COMPONENT_SET' || (s.layoutMode && s.layoutMode !== 'NONE')) return; let w = 0, h = 0; for (const c of s.children) { w = Math.max(w, c.x + c.width); h = Math.max(h, c.y + c.height); } s.resizeWithoutConstraints(Math.max(s.width, w + 20), Math.max(s.height, h + 20)); };
const below = (s) => (s.type === 'COMPONENT_SET' ? Math.max(0, ...s.children.map((c) => c.y + c.height)) + 40 : 0);
const FIELDS = { gap: ['itemSpacing'], counterAxisSpacing: ['counterAxisSpacing'], padding: ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'], paddingX: ['paddingLeft', 'paddingRight'], paddingY: ['paddingTop', 'paddingBottom'], radius: ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius'] };
const bindOne = async (l, field, v) => {
  if (field === 'fill' || field === 'stroke') {
    const k = field === 'fill' ? 'fills' : 'strokes';
    const ps = Array.isArray(l[k]) && l[k].length ? l[k] : [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }];
    l[k] = ps.map((p, i) => (i === 0 && p.type === 'SOLID' ? figma.variables.setBoundVariableForPaint(p, 'color', v) : p));
    return;
  }
  await fonts(l);
  for (const f of FIELDS[field] || [field]) l.setBoundVariable(f, v);
};
let set = ${target ? `await figma.getNodeByIdAsync(${JSON.stringify(target)})` : 'null'};
if (set) await pageOf(set);
${target ? "if (!set) return { changed, skipped, missing: ['the component (node ' + " + JSON.stringify(target) + " + ') is not in this file'] };\n" : ''}for (const o of ops) {
  try {
    if (o.op === 'clone') {
      const src = await nodeOf(o.from);
      if (!src) { missing.push(o.from); return { changed, skipped, missing }; }
      await pageOf(src);
      set = src.clone();
      const parent = src.parent;
      parent.insertChild(parent.children.indexOf(src) + 1, set);
      set.name = o.name; set.description = ''; set.x = src.x; set.y = src.y + src.height + 80;
      changed.push(o.name + ': built as a copy of ' + o.from);
    } else if (o.op === 'create') {
      const combos = (o.axes || []).reduce((all, a) => all.flatMap((c) => a.options.map((x) => ({ ...c, [a.name]: x }))), [{}]);
      const made = (o.axes || []).length ? combos : [null];
      const comps = made.map((a, i) => {
        const c = figma.createComponent();
        c.name = a ? named(a) : o.name;
        const l = o.layout || { dir: 'HORIZONTAL' };
        c.layoutMode = l.dir || 'HORIZONTAL'; c.primaryAxisSizingMode = 'AUTO'; c.counterAxisSizingMode = 'AUTO';
        if (l.main) c.primaryAxisAlignItems = l.main; if (l.cross) c.counterAxisAlignItems = l.cross;
        c.fills = []; c.x = 0; c.y = i * 80;
        return c;
      });
      set = comps.length > 1 || (o.axes || []).length ? figma.combineAsVariants(comps, figma.currentPage) : comps[0];
      set.name = o.name;
      if (set.type === 'COMPONENT_SET') { set.x = 0; set.y = 0; fit(set); }
      changed.push(o.name + ': built with ' + comps.length + ' variant' + (comps.length === 1 ? '' : 's'));
    } else if (!set) {
      missing.push(o.op + ': no component to change');
    } else if (o.op === 'rename') {
      if (o.what === 'component') { if (set.name === o.to) skipped.push(o.to); else { set.name = o.to; changed.push(o.from + ' → ' + o.to); } }
      if (o.what === 'axis' || o.what === 'property') { const k = keyOf(set, o.from); if (!k) { (keyOf(set, o.to) ? skipped : missing).push(o.from); } else { set.editComponentProperty(k, { name: o.to }); changed.push(o.what + ' ' + o.from + ' → ' + o.to); } }
      if (o.what === 'option') { let n = 0; for (const v of variantsOf(set)) { const a = axesOf(v); if (a[o.axis] === o.from) { a[o.axis] = o.to; v.name = named(a); n++; } } (n ? changed : skipped).push(o.axis + '=' + o.from + (n ? ' → ' + o.to : '')); }
      if (o.what === 'layer') { let n = 0; for (const v of variantsOf(set)) { const l = layerIn(v, o.from); if (l) { l.name = o.to; n++; } } (n ? changed : missing).push('layer ' + o.from + (n ? ' → ' + o.to : '')); }
    } else if (o.op === 'addOption') {
      const from = variantsOf(set).filter((v) => axesOf(v)[o.axis] === o.like);
      if (!from.length) { missing.push(o.axis + '=' + o.like); continue; }
      if (variantsOf(set).some((v) => axesOf(v)[o.axis] === o.option)) { skipped.push(o.axis + '=' + o.option); continue; }
      let x = 0; const y = below(set);
      for (const v of from) { const c = v.clone(); set.appendChild(c); c.name = named({ ...axesOf(v), [o.axis]: o.option }); c.x = x; c.y = y; x += c.width + 20; }
      fit(set); changed.push(o.axis + '=' + o.option + ': ' + from.length + ' variant' + (from.length === 1 ? '' : 's') + ', copied from ' + o.like);
    } else if (o.op === 'removeOption') {
      const gone = variantsOf(set).filter((v) => axesOf(v)[o.axis] === o.option);
      for (const v of gone) v.remove();
      (gone.length ? changed : skipped).push(o.axis + '=' + o.option + (gone.length ? ' removed (' + gone.length + ' variants)' : ''));
    } else if (o.op === 'addAxis') {
      const first = o.default || o.options[0], rest = o.options.filter((x) => x !== first), was = variantsOf(set);
      let x = 0; const y = below(set);
      for (const v of was) { const a = axesOf(v); for (const opt of rest) { const c = v.clone(); set.appendChild(c); c.name = named({ ...a, [o.axis]: opt }); c.x = x; c.y = y; x += c.width + 20; } v.name = named({ ...a, [o.axis]: first }); }
      fit(set); changed.push('axis ' + o.axis + ' (' + o.options.join(', ') + ')');
    } else if (o.op === 'addProperty') {
      const type = { boolean: 'BOOLEAN', text: 'TEXT', swap: 'INSTANCE_SWAP', 'instance swap': 'INSTANCE_SWAP' }[o.kind];
      if (keyOf(set, o.name)) { skipped.push('property ' + o.name); continue; }
      let def = o.default;
      if (type === 'INSTANCE_SWAP') { const c = await nodeOf(o.default); if (!c) { missing.push(o.default); continue; } def = c.type === 'COMPONENT_SET' ? c.defaultVariant.id : c.id; }
      if (type === 'BOOLEAN') def = def !== false && def !== 'false';
      if (type === 'TEXT') def = String(def == null ? '' : def);
      const key = set.addComponentProperty(o.name, type, def);
      const field = { BOOLEAN: 'visible', TEXT: 'characters', INSTANCE_SWAP: 'mainComponent' }[type];
      let n = 0;
      for (const v of variantsOf(set)) { const l = layerIn(v, o.layer); if (!l) continue; await fonts(l); l.componentPropertyReferences = { ...(l.componentPropertyReferences || {}), [field]: key }; n++; }
      (n ? changed : missing).push('property ' + o.name + (n ? ' → ' + o.layer : ' (no layer ' + o.layer + ')'));
    } else if (o.op === 'removeProperty') {
      const k = keyOf(set, o.name);
      if (!k) { skipped.push('property ' + o.name); continue; }
      set.deleteComponentProperty(k); changed.push('property ' + o.name + ' removed');
    } else if (o.op === 'setDefault') {
      const k = keyOf(set, o.property);
      if (!k) { missing.push('property ' + o.property); continue; }
      set.editComponentProperty(k, { defaultValue: o.value }); changed.push(o.property + ' unless set: ' + o.value);
    } else if (o.op === 'addLayer') {
      const L = o.layer; let n = 0;
      for (const v of variantsOf(set)) {
        const p = layerIn(v, o.parent || '');
        if (!p || !('appendChild' in p)) continue;
        if ((p.children || []).some((c) => c.name === L.name)) { skipped.push(L.name); continue; }
        let node;
        if (L.type === 'instance') { const c = await nodeOf(L.of); if (!c) { missing.push(L.of); break; } const comp = c.type === 'COMPONENT_SET' ? (L.variant && c.children.find((x) => x.name === L.variant)) || c.defaultVariant : c; node = comp.createInstance(); }
        else if (L.type === 'text') {
          node = figma.createText();
          const st = textStyles.find((s) => s.name === L.style);
          await figma.loadFontAsync(st ? st.fontName : node.fontName);
          if (st) await node.setTextStyleIdAsync(st.id);
          node.characters = String(L.text || L.name);
        } else { node = figma.createFrame(); node.fills = []; const l = L.layout || {}; if (l.dir) { node.layoutMode = l.dir; node.primaryAxisSizingMode = 'AUTO'; node.counterAxisSizingMode = 'AUTO'; } }
        node.name = L.name;
        if (o.index != null) p.insertChild(Math.min(o.index, p.children.length), node); else p.appendChild(node);
        if (L.hidden) node.visible = false;
        if (L.fill && 'layoutSizingHorizontal' in node && p.layoutMode && p.layoutMode !== 'NONE') node.layoutSizingHorizontal = 'FILL';
        n++;
      }
      (n ? changed : missing).push('layer ' + (o.parent ? o.parent + '/' : '') + L.name + (n ? ' in ' + n + ' variant' + (n === 1 ? '' : 's') : ''));
    } else if (o.op === 'removeLayer') {
      let n = 0; for (const v of variantsOf(set)) { const l = layerIn(v, o.layer); if (l) { l.remove(); n++; } }
      (n ? changed : skipped).push('layer ' + o.layer + (n ? ' removed' : ''));
    } else if (o.op === 'bind') {
      const v = varOf(o.variable);
      if (!v) { missing.push('variable ' + o.variable); continue; }
      let n = 0;
      for (const x of variantsOf(set).filter((x) => !o.where || Object.entries(o.where).every(([k, y]) => axesOf(x)[k] === y))) { const l = layerIn(x, o.layer || ''); if (!l) continue; await bindOne(l, o.field, v); n++; }
      (n ? changed : missing).push((o.layer || 'its frame') + ' ' + o.field + ' → ' + o.variable + (n ? '' : ' (no such layer)'));
    } else if (o.op === 'rebind') {
      const a = varOf(o.from), b = varOf(o.to);
      if (!a || !b) { missing.push('variable ' + (a ? o.to : o.from)); continue; }
      let n = 0;
      for (const node of inside(set)) {
        for (const k of ['fills', 'strokes']) { const ps = node[k]; if (!Array.isArray(ps)) continue; if (ps.some((p) => p.boundVariables && p.boundVariables.color && p.boundVariables.color.id === a.id)) { node[k] = ps.map((p) => (p.boundVariables && p.boundVariables.color && p.boundVariables.color.id === a.id ? figma.variables.setBoundVariableForPaint(p, 'color', b) : p)); n++; } }
        for (const [f, al] of Object.entries(node.boundVariables || {})) { if (f === 'fills' || f === 'strokes' || f === 'effects' || Array.isArray(al)) continue; if (al && al.id === a.id) { await fonts(node); node.setBoundVariable(f, b); n++; } }
      }
      (n ? changed : skipped).push(o.from + ' → ' + o.to + (n ? ' (' + n + ' bindings)' : ': not bound'));
    } else if (o.op === 'describe') {
      set.description = o.text; changed.push('description written');
    } else if (o.op === 'place') {
      const page = o.page ? figma.root.children.find((p) => p.name === o.page) : await pageOf(set);
      if (!page) { missing.push('page ' + o.page); continue; }
      await page.loadAsync();
      const sec = o.section ? page.findOne((n) => (n.type === 'SECTION' || n.type === 'FRAME') && n.name === o.section) : null;
      if (o.section && !sec) { missing.push('section ' + o.section); continue; }
      const into = sec || page;
      if (set.parent === into) { skipped.push('already on ' + (o.section || o.page)); continue; }
      const y = Math.max(0, ...(into.children || []).filter((c) => c !== set).map((c) => c.y + c.height)) + 80;
      into.appendChild(set); set.x = sec ? 40 : 0; set.y = y;
      if (sec && sec.type === 'SECTION') sec.resizeWithoutConstraints(Math.max(sec.width, set.x + set.width + 40), Math.max(sec.height, set.y + set.height + 40));
      changed.push('placed on ' + [o.page, o.section].filter(Boolean).join(' › '));
    }
  } catch (e) { missing.push(o.op + ': ' + String((e && e.message) || e)); }
}
return { changed, skipped, missing, node: set ? set.id : null };
`;
}

// ── What the operations do, in words ──
export function opWords(o) {
  const at = (l) => (l ? l : 'its own frame');
  switch (o.op) {
    case 'clone': return `a copy of ${o.from}, named ${o.name}`;
    case 'create': return `${o.name}, from nothing but auto layout${(o.axes ?? []).length ? `, with ${o.axes.map((a) => `${a.name} (${a.options.join(', ')})`).join(' and ')}` : ''}`;
    case 'rename': return `the ${o.what} ${o.what === 'option' ? `${o.axis}=${o.from}` : o.from} renamed ${o.to}`;
    case 'addOption': return `a new option ${o.axis}=${o.option}, its variants copied from ${o.like}`;
    case 'removeOption': return `the option ${o.axis}=${o.option} removed`;
    case 'addAxis': return `a new variant axis ${o.axis} (${o.options.join(', ')})`;
    case 'addProperty': return `a ${o.kind} property ${o.name}${o.default != null ? ` (${o.default} unless set)` : ''}, on ${o.layer}`;
    case 'removeProperty': return `the property ${o.name} removed`;
    case 'setDefault': return `${o.property} is ${o.value} unless set`;
    case 'addLayer': return `a ${o.layer.type === 'instance' ? `${o.layer.of} instance` : o.layer.type} ${o.layer.name} in ${at(o.parent)}${o.layer.style ? `, text style ${o.layer.style}` : ''}`;
    case 'removeLayer': return `the layer ${o.layer} removed`;
    case 'bind': return `${at(o.layer)}: ${o.field} bound to ${o.variable}${o.where ? ` where ${nameOfAxes(o.where)}` : ''}`;
    case 'rebind': return `every binding of ${o.from} moved to ${o.to}`;
    case 'describe': return `its description: "${o.text}"`;
    case 'place': return `placed on ${[o.page, o.section].filter(Boolean).join(' › ')}`;
    default: return o.op;
  }
}

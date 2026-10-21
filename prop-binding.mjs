// prop-binding.mjs - which code prop (or slot) a Figma component property is, decided one way for every reader: the
// prop check (Gate 14) and the contract both ask here, so they never give two answers.
//
//   bindingSources({ codeConnect, aliases, authored }) → the names recorded for each Figma property, by who recorded them
//   bindFigmaProp(fp, def, ctx) → { code, as: 'prop'|'slot'|'defaultSlot', source, exactName, key? } or null (key: the key of an
//                                 object prop it fills, as Code Connect writes :opts="{ caption: … }")
//   valuesOf(fp, codeConnectProps) → every attribute or key the Code Connect file fills with the property's value
//   invertsValue(fp, code, ctx) → true when a true/false binding writes the opposite value (show ↔ hide)
//   readingsOf(fp, codeConnectProps) → what the project's Code Connect file does with the property beyond its value:
//                                      [{ code, role: 'condition', negated?, equals? }]
//
// The order, strongest first: a binding the project wrote for the component (contract.authored.json bindings), a
// documented alias (ds-config.json componentPropAliases), the project's own Code Connect file, then the same name (letter
// case and separators aside). A name that only contains the other is never a binding: it is a suggestion, and the
// property stays unmapped until someone records it.
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

// { figmaProp: { name, source } }: later sources win, as the prop check always read them.
export function bindingSources({ codeConnect = null, aliases = null, authored = null } = {}) {
  const out = {};
  for (const [source, map] of [['codeConnect', codeConnect], ['alias', aliases], ['authored', authored]]) {
    for (const [fp, name] of Object.entries(map ?? {})) if (typeof name === 'string' && name) out[fp] = { name, source };
  }
  return out;
}

// ctx: { codeProps: { name: {…} } (the code's API props), slots: { named: [], default: bool }, recorded (bindingSources),
//        authoredSlots: { figmaProp: true | 'slotName' } }
export function bindFigmaProp(fp, def, { codeProps = {}, slots = { named: [], default: false }, recorded = {}, authoredSlots = {} } = {}) {
  const names = Object.keys(codeProps);
  const byNorm = new Map(names.map((p) => [norm(p), p]));
  const rec = recorded[fp];
  const slotByNorm = new Map((slots.named ?? []).map((n) => [norm(n), n]));
  // A recorded key of an object prop (Code Connect writing :opts="{ caption: … }"): that prop, at that key.
  const keyed = rec && rec.name.includes('.') && names.includes(rec.name.split('.')[0]) ? { code: rec.name.split('.')[0], as: 'prop', source: rec.source, exactName: true, key: rec.name.split('.').slice(1).join('.') } : null;
  // An instance swap may be a prop or a slot: its own name first, then a recorded one, then a slot.
  if (def?.type === 'INSTANCE_SWAP') {
    if (byNorm.has(norm(fp))) { const p = byNorm.get(norm(fp)); return { code: p, as: 'prop', source: 'name', exactName: p === fp }; }
    if (rec && byNorm.has(norm(rec.name))) return { code: byNorm.get(norm(rec.name)), as: 'prop', source: rec.source, exactName: true };
    if (keyed) return keyed;
    if (slotByNorm.has(norm(fp))) { const s = slotByNorm.get(norm(fp)); return { code: s, as: 'slot', source: 'name', exactName: s === fp }; }
    if (slots.default) return { code: 'default', as: 'defaultSlot', source: 'name', exactName: true };
    const sb = authoredSlots[fp];
    if (typeof sb === 'string' && slotByNorm.has(norm(sb))) return { code: slotByNorm.get(norm(sb)), as: 'slot', source: 'authored', exactName: true };
    return null;
  }
  // A recorded name, as written, is the agreed one: read before the letter-case comparison.
  if (rec && names.includes(rec.name)) return { code: rec.name, as: 'prop', source: rec.source, exactName: true };
  if (keyed) return keyed;
  if (byNorm.has(norm(fp))) { const p = byNorm.get(norm(fp)); return { code: p, as: 'prop', source: 'name', exactName: p === fp }; }
  if (rec && byNorm.has(norm(rec.name))) return { code: byNorm.get(norm(rec.name)), as: 'prop', source: rec.source, exactName: true };
  return null;
}

// A suggestion for an unmapped property: the one unused code prop whose name contains its name or is contained in it.
export function suggestionFor(fp, unusedCodeProps = []) {
  const fn = norm(fp);
  if (fn.length < 3) return null;
  return unusedCodeProps.find((p) => { const cn = norm(p); return cn.length >= 3 && (cn.includes(fn) || fn.includes(cn)); }) ?? null;
}

// Every attribute (or key of one) the Code Connect file fills with a property's value, in the order it writes them.
export function valuesOf(fp, codeConnectProps = []) {
  return [...new Set((codeConnectProps ?? []).filter((p) => p.figma === fp && p.role === 'value' && p.code && !p.event).map((p) => p.code))];
}

// What the Code Connect file does with a property besides filling its value: the attributes it decides are written.
export function readingsOf(fp, codeConnectProps = []) {
  return (codeConnectProps ?? []).filter((p) => p.figma === fp && p.role === 'condition' && p.code && !p.event)
    .map((p) => ({ code: p.code, role: 'condition', ...(p.negated ? { negated: true } : {}), ...(p.equals != null ? { equals: p.equals } : {}), ...(p.unclear ? { unclear: true } : {}) }));
}

// Whether a true/false binding writes the opposite of the Figma value (Figma "Show close" on is the code's hideClose
// false). The project's own word decides first (negated on its contract.authored.json binding), then its Code Connect file
// (hideClose={!showClose}), then the two names when they say opposite things (show/has/with ↔ hide/no/without).
const ON = /^(show|has|with|enable|enabled|display|visible)(?=[^a-z]|$)/, OFF = /^(hide|hidden|no|without|disable|disabled|not)(?=[^a-z]|$)/;
const head = (s) => String(s).split('#')[0].trim().replace(/^./, (c) => c.toLowerCase());
export function invertsValue(fp, code, { codeConnectProps = [], authored = null } = {}) {
  if (typeof authored?.negated === 'boolean') return authored.negated;
  if ((codeConnectProps ?? []).some((p) => p.figma === fp && p.code === code && p.role === 'value' && p.negated)) return true;
  const f = head(fp), c = head(code);
  return (ON.test(f) && OFF.test(c)) || (OFF.test(f) && ON.test(c));
}
export const flipBoolean = (v) => (/^true$/i.test(String(v)) ? 'false' : /^false$/i.test(String(v)) ? 'true' : v);

// The naming conventions a design system keeps between its Figma file and its code, taken only where the types agree, so
// a near name is never guessed (tileCaptionContent is never caption):
//   value      Figma xContent (text or swap)  ↔ code x (a string)            labelContent → label
//   condition  Figma showX (on/off)           ↔ code x (not on/off)         showLabel decides whether label is written
//   value      Figma x (on/off)               ↔ code isX or xs (on/off)     interactive → isInteractive, showLabel → showLabels
//   value      Figma x (variant)              ↔ the one code prop ending in X with exactly x's options   size → buttonSize
// codeProps: { name: { type, options } }. codeConnectProps: the component's Code Connect readings, when it has a file: a
// showX is never said to decide an x that file writes whatever showX is. → { code, role, source: 'convention' } or null.
const typeOf = (d) => String(d?.type ?? '').toLowerCase();
const onOff = (def) => def?.type === 'BOOLEAN' || (def?.type === 'VARIANT' && (def.variantOptions ?? []).length === 2 && def.variantOptions.every((o) => /^(true|false)$/i.test(String(o))));
export function conventionFor(fp, def, codeProps = {}, { codeConnectProps = [] } = {}) {
  const name = String(fp).split('#')[0].trim();
  const byNorm = new Map(Object.keys(codeProps).map((p) => [norm(p), p]));
  const stringy = (p) => /string/.test(typeOf(codeProps[p])) || !typeOf(codeProps[p]);
  if (def?.type === 'TEXT' || def?.type === 'INSTANCE_SWAP') {
    const base = name.replace(/\s*content$/i, '');
    const p = base !== name && base ? byNorm.get(norm(base)) : null;
    if (p && stringy(p)) return { code: p, role: 'value', source: 'convention' };
    return null;
  }
  if (onOff(def)) {
    const shown = /^show\s*(.+)$/i.exec(name)?.[1];
    const p = shown ? byNorm.get(norm(shown)) : null;
    const writtenAlways = (c) => (codeConnectProps ?? []).some((x) => x.role === 'value' && x.code === c) && !(codeConnectProps ?? []).some((x) => x.role === 'condition' && x.code === c);
    if (p && !/boolean/.test(typeOf(codeProps[p])) && !writtenAlways(p)) return { code: p, role: 'condition', source: 'convention' };
    for (const alt of [`is${name}`, `${name}s`]) {
      const q = byNorm.get(norm(alt));
      if (q && /boolean/.test(typeOf(codeProps[q]))) return { code: q, role: 'value', source: 'convention' };
    }
    return null;
  }
  if (def?.type === 'VARIANT' && (def.variantOptions ?? []).length > 1) {
    const want = [...def.variantOptions].map(String).sort().join('|');
    const fits = Object.keys(codeProps).filter((p) => norm(p) !== norm(name) && norm(p).endsWith(norm(name)) && Array.isArray(codeProps[p]?.options) && [...codeProps[p].options].map(String).sort().join('|') === want);
    if (fits.length === 1) return { code: fits[0], role: 'value', source: 'convention' };
  }
  return null;
}

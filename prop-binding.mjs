// prop-binding.mjs - which code prop (or slot) a Figma component property is, decided one way for every reader: the
// prop check (Gate 14) and the contract both ask here, so they never give two answers.
//
//   bindingSources({ codeConnect, aliases, authored }) → the names recorded for each Figma property, by who recorded them
//   bindFigmaProp(fp, def, ctx) → { code, as: 'prop'|'slot'|'defaultSlot', source, exactName } or null
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
  // An instance swap may be a prop or a slot: its own name first, then a recorded one, then a slot.
  if (def?.type === 'INSTANCE_SWAP') {
    if (byNorm.has(norm(fp))) { const p = byNorm.get(norm(fp)); return { code: p, as: 'prop', source: 'name', exactName: p === fp }; }
    if (rec && byNorm.has(norm(rec.name))) return { code: byNorm.get(norm(rec.name)), as: 'prop', source: rec.source, exactName: true };
    if (slotByNorm.has(norm(fp))) { const s = slotByNorm.get(norm(fp)); return { code: s, as: 'slot', source: 'name', exactName: s === fp }; }
    if (slots.default) return { code: 'default', as: 'defaultSlot', source: 'name', exactName: true };
    const sb = authoredSlots[fp];
    if (typeof sb === 'string' && slotByNorm.has(norm(sb))) return { code: slotByNorm.get(norm(sb)), as: 'slot', source: 'authored', exactName: true };
    return null;
  }
  // A recorded name, as written, is the agreed one: read before the letter-case comparison.
  if (rec && names.includes(rec.name)) return { code: rec.name, as: 'prop', source: rec.source, exactName: true };
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

// What the Code Connect file does with a property besides filling its value: the attributes it decides are written.
export function readingsOf(fp, codeConnectProps = []) {
  return (codeConnectProps ?? []).filter((p) => p.figma === fp && p.role === 'condition' && p.code && !p.event)
    .map((p) => ({ code: p.code, role: 'condition', ...(p.negated ? { negated: true } : {}), ...(p.equals != null ? { equals: p.equals } : {}) }));
}

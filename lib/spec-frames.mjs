// spec-frames.mjs - a component's spec, drawn in Figma beside its component set, from its contract.
//
// Designers could not read a component's spec inside Figma: it lived in the contract, the style guide and the code.
// This lays out what the contract already holds as a frame the hand-back draws (figma-edits.mjs), only once the person
// says yes: the anatomy (an instance of the component with a numbered marker on each part, the parts listed by
// number), each property with its options and default, the states, the tokens it uses, its sizes per variant as
// Figma's own capture has them, and its accessibility as the code and the browser give it.
//
// Nothing is written that the contract does not say. A part is placed on the layer of its own name in the instance;
// one with no such layer is listed with no marker, and said. A spec is drawn afresh only when its contract changed
// since the one drawn (the frame keeps the contract's fingerprint), so an unchanged component is left as it is, and a
// stale one is redrawn on the next yes.
//
//   specOf(contract, { sizes }) → { component, nodeId, fingerprint, title, parts, sections } or null
//     contract: a component's contract (contracts/<name>.contract.json)
//     sizes:    Figma's capture of its variants (the structure snapshot's variants), for sizes per variant
//   fingerprint(contract) → a short hash of what the spec says, so a changed contract is known
// Pure.
import { createHash } from 'node:crypto';

const tokenName = (t) => String(t ?? '').replace(/^\{|\}$/g, '');
const val = (x) => (x && typeof x === 'object' && 'value' in x ? x.value : x);
const list = (x) => (Array.isArray(x) ? x : x == null ? [] : [x]);
// Four sides written once when they are the same (padding 0, never padding 0 0 0 0).
const sides = (x) => { const a = list(x); return a.length > 1 && a.every((v) => v === a[0]) ? String(a[0]) : a.join(' '); };

// What the spec says, as it would be drawn: a changed line here is a changed spec.
export function fingerprint(contract = {}) {
  const what = { props: contract.props, anatomy: contract.anatomy, states: contract.states, tokens: contract.tokens?.used, accessibility: contract.accessibility };
  return createHash('sha256').update(JSON.stringify(what)).digest('hex').slice(0, 12);
}

// Each part's tokens, from its anatomy entry: every field whose name ends in Token, and an inset's.
function partTokens(entry = {}) {
  const out = [];
  for (const [k, v] of Object.entries(entry)) {
    if (/Token$/.test(k) && v) out.push(`${k.replace(/Token$/, '')}: ${tokenName(v)}`);
    if (k === 'inset' && v && typeof v === 'object') for (const [ik, iv] of Object.entries(v)) if (/Token$/.test(ik) && iv) out.push(`inset ${ik.replace(/Token$/, '')}: ${tokenName(iv)}`);
  }
  return out;
}

export function specOf(contract, { sizes = null } = {}) {
  if (!contract?.name || !contract.figmaNodeId) return null;
  const anatomy = contract.anatomy ?? {};
  // The root is said once, above the parts; an entry named as the component itself is that root again, never a part.
  const parts = Object.entries(anatomy).filter(([k]) => k !== 'root' && k !== contract.name).map(([name, e], i) => ({ n: i + 1, name, tokens: partTokens(e) }));
  const root = anatomy.root ?? {};
  const sections = [];
  sections.push({ title: 'Anatomy', lines: [
    ...(root.height ? [`Height ${root.height}px`] : []),
    ...partTokens(root).map((t) => `Root ${t}`),
    ...parts.map((p) => `${p.n}  ${p.name}${p.tokens.length ? ` · ${p.tokens.join(' · ')}` : ''}`),
  ] });
  const props = (contract.props ?? []).map((p) => {
    const opts = p.options ?? p.bindings?.figma?.options ?? null;
    const def = p.default ?? p.bindings?.figma?.default;
    return `${p.name} (${p.type ?? 'value'})${opts?.length ? `: ${opts.join(' | ')}` : ''}${def != null && def !== '' && !/^\d+:\d+$/.test(String(def)) ? `, default ${def}` : ''}`;
  });
  if (props.length) sections.push({ title: 'Properties', lines: props });
  const states = (contract.states ?? []).map((s) => s.name).filter(Boolean);
  if (states.length) sections.push({ title: 'States', lines: [states.join(' · ')] });
  const used = list(contract.tokens?.used);
  if (used.length) sections.push({ title: 'Tokens', lines: used });
  const sized = Object.entries(sizes ?? {}).map(([variant, v]) => {
    const bits = [
      v.paddingPx ? `padding ${sides(v.paddingPx)}` : null,
      v.gapPx != null ? `gap ${v.gapPx}` : null,
      v.radiusPx ? `radius ${sides(v.radiusPx)}` : null,
      v.fontSize ? `text ${v.fontSize}` : null,
    ].filter(Boolean);
    return bits.length ? `${variant}: ${bits.join(', ')}` : null;
  }).filter(Boolean);
  if (sized.length) sections.push({ title: 'Sizes', lines: sized });
  const a = contract.accessibility ?? {};
  const a11y = [
    val(a.element) ? `Element: ${val(a.element)}` : null,
    val(a.role) ? `Role: ${val(a.role)}` : null,
    val(a.name) ? `Named by: ${val(a.name)}` : null,
    list(val(a.keyboard)).length ? `Keys: ${list(val(a.keyboard)).join(', ')}` : null,
    list(val(a.states)).length ? `States it says: ${list(val(a.states)).join(', ')}` : null,
  ].filter(Boolean);
  if (a11y.length) sections.push({ title: 'Accessibility', lines: a11y });
  return { component: contract.name, nodeId: contract.figmaNodeId, fingerprint: fingerprint(contract), title: `${contract.name} · spec`, parts: parts.map(({ n, name }) => ({ n, name })), sections };
}

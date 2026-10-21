// contract-code.mjs - the code half of a component contract and what joins it to Figma: for each Figma property the code
// prop (or slot) it is, decided by prop-binding.mjs, with the code's own type, options, default and how sure the reading
// is; what the project's Code Connect file says it decides beyond its value; where Figma and the code differ; the props
// only the code has; its events and slots as the code declares them; its states, the tokens each state paints with,
// and what the code says about its accessibility. Every fact names where it came from; nothing is guessed.
import { bindingSources, bindFigmaProp, readingsOf, suggestionFor, invertsValue, flipBoolean } from './prop-binding.mjs';

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const strip = (k) => String(k).split('#')[0].trim();
const same = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
// A Figma state axis (its name is a state's, or every value is one) and a plain variant axis.
const STATE_AXES = new Set(['state', 'states', 'status', 'disabled', 'hover', 'focus', 'focused', 'active', 'selected', 'pressed', 'loading', 'checked', 'filled', 'error', 'open', 'expanded']);
const STATE_VALUES = new Set(['default', 'rest', 'hover', 'hovered', 'focus', 'focused', 'active', 'pressed', 'disabled', 'selected', 'loading', 'error', 'checked', 'open', 'closed', 'expanded', 'collapsed']);
export const isStateAxis = (name, options = []) => STATE_AXES.has(String(name).toLowerCase()) || (options.length > 1 && options.every((o) => STATE_VALUES.has(String(o).toLowerCase())));

// A Figma value as the code would write it: "true"/"false" of a VARIANT are booleans, an instance swap's node id is not a
// value anyone writes (its component's name is, when the snapshot names it), a slot's placeholder is nothing.
export function figmaValue(def) {
  const v = def?.defaultValue;
  if (def?.type === 'SLOT') return null;
  if (def?.type === 'INSTANCE_SWAP') return def.defaultName ?? null;
  if (def?.type === 'VARIANT' && Array.isArray(def.variantOptions) && def.variantOptions.every((o) => o === 'true' || o === 'false')) return v === 'true' ? true : v === 'false' ? false : v;
  return v ?? null;
}

// → { props: [...contract props with bindings.code, conditions, differences, suggestion], codeOnly, events, slots, source }
// figmaProps: the props snapshot entry's `properties`; api: the code's API (structure-capture.mjs apiEntry); authored: the
// component's contract.authored.json entry; aliases: ds-config.json componentPropAliases for it.
export function codeHalf(contractProps, figmaProps = {}, api = null, { authored = {}, aliases = null } = {}) {
  const defs = new Map(Object.entries(figmaProps ?? {}).map(([k, d]) => [strip(k), d]));
  // A Vue Boolean prop given no default is false: Vue says so, so the contract does (other frameworks leave it unset).
  const codeProps = Object.fromEntries(Object.entries(api?.props ?? {}).map(([n, d]) => [n, api?.syntax === 'vue' && d?.type === 'boolean' && d.default == null ? { ...d, default: false } : d]));
  const authoredAttr = Object.fromEntries(Object.entries(authored?.bindings ?? {}).filter(([, b]) => typeof b?.attribute === 'string').map(([k, b]) => [k, b.attribute]));
  const authoredSlots = Object.fromEntries(Object.entries(authored?.bindings ?? {}).filter(([, b]) => b?.slot != null).map(([k, b]) => [k, b.slot]));
  const recorded = bindingSources({ codeConnect: api?.codeConnect, aliases, authored: authoredAttr });
  const ccValues = new Map((api?.codeConnectProps ?? []).filter((p) => p.role === 'value' && p.values).map((p) => [p.figma, p.values]));
  const used = new Set();
  const props = contractProps.map((p) => {
    const def = defs.get(p.name) ?? {};
    const out = { ...p, bindings: { ...p.bindings, figma: { ...p.bindings.figma, ...(def.type ? { kind: def.type } : {}), default: figmaValue(def), ...(def.type === 'INSTANCE_SWAP' && def.defaultValue ? { defaultNodeId: def.defaultValue } : {}), ...(Array.isArray(def.variantOptions) ? { options: def.variantOptions } : {}) } } };
    // A binding written by hand in contract.authored.json is the project's decision: it stays as written, never replaced
    // by another reading, and gets the code's facts only when the code has that prop.
    const handWritten = p.bindings?.code && typeof p.bindings.code === 'object' && Object.keys(p.bindings.code).length;
    const authoredName = handWritten && typeof p.bindings.code.attribute === 'string' ? p.bindings.code.attribute : null;
    const b = handWritten
      ? (authoredName && codeProps[authoredName] ? { code: authoredName, as: 'prop', source: 'authored', exactName: true } : null)
      : api ? bindFigmaProp(p.name, def, { codeProps, slots: api.slots ?? {}, recorded, authoredSlots }) : null;
    if (b) {
      const c = codeProps[b.code] ?? {};
      const inverted = b.as === 'prop' && def.type === 'BOOLEAN' && invertsValue(p.name, b.code, { codeConnectProps: api?.codeConnectProps, authored: authored?.bindings?.[p.name] });
      if (b.as === 'prop') used.add(norm(b.code));
      out.bindings.code = {
        ...(out.bindings.code && typeof out.bindings.code === 'object' ? out.bindings.code : {}),
        [b.as === 'prop' ? 'prop' : 'slot']: b.code, as: b.as, source: b.source,
        ...(c.type ? { type: c.type } : {}), ...(c.options ? { options: c.options } : {}), ...(c.default != null ? { default: c.default } : {}),
        ...(typeof c.required === 'boolean' ? { required: c.required } : {}), ...(c.description ? { description: c.description } : {}),
        ...(c.confidence ? { confidence: c.confidence } : {}), ...(ccValues.get(p.name) ? { valueMap: ccValues.get(p.name) } : {}),
        ...(inverted ? { inverted: true } : {}),
      };
      // Where Figma and the code differ on it: its default, and the values each has that the other does not (through
      // the Code Connect value map when there is one: Figma "Large" written "lg").
      const differences = [];
      const fd = out.bindings.figma.default, cd = c.default;
      const map = ccValues.get(p.name) ?? {};
      const asCode = (v) => (inverted ? flipBoolean(v) : map[v] != null ? map[v] : v);
      if (fd != null && fd !== '' && cd != null && !same(asCode(fd), cd)) differences.push({ kind: 'default', figma: fd, code: cd });
      if (Array.isArray(def.variantOptions) && Array.isArray(c.options) && !def.variantOptions.every((o) => o === 'true' || o === 'false')) {
        const f = def.variantOptions.map(asCode), co = c.options;
        const onlyInFigma = f.filter((o) => !co.some((x) => same(x, o))), onlyInCode = co.filter((o) => !f.some((x) => same(x, o)));
        if (onlyInFigma.length || onlyInCode.length) differences.push({ kind: 'options', onlyInFigma, onlyInCode });
      }
      if (b.source === 'name' && !b.exactName) differences.push({ kind: 'name', figma: p.name, code: b.code });
      if (differences.length) out.differences = differences;
    }
    // What the Code Connect file says it decides beyond a value: the attributes written only when it is on (or off).
    const conditions = readingsOf(p.name, api?.codeConnectProps);
    if (conditions.length) out.conditions = conditions;
    return out;
  });
  // A Figma property no code prop is: a near name is suggested, never taken.
  const unusedNames = Object.keys(codeProps).filter((n) => !used.has(norm(n)));
  for (const p of props) if (!p.bindings.code && !p.conditions && api) { const s = suggestionFor(p.name, unusedNames); if (s) p.suggestion = s; }
  // A prop that decides an attribute (its condition) has a home even with no value of its own.
  for (const p of props) for (const c of p.conditions ?? []) used.add(norm(c.code));
  const PLUMBING = /^(on[A-Z]\w*|children|className|class|style|ref|key|id|aria-[\w-]+|data-[\w-]+)$/;
  const codeOnly = Object.entries(codeProps).filter(([n]) => !used.has(norm(n)) && !PLUMBING.test(n)).map(([n, c]) => ({
    name: n, ...(c.type ? { type: c.type } : {}), ...(c.options ? { options: c.options } : {}), ...(c.default != null ? { default: c.default } : {}),
    ...(typeof c.required === 'boolean' ? { required: c.required } : {}), ...(c.description ? { description: c.description } : {}), ...(c.confidence ? { confidence: c.confidence } : {}),
  }));
  const events = (api?.events ?? []).map((e) => (typeof e === 'string' ? { name: e } : e));
  return { props, codeOnly, events };
}

// The code's slots, each with what it hands its content and the Figma property it is, when one is.
export function codeSlots(api, props = []) {
  const s = api?.slots ?? {};
  const figmaOf = (slot) => props.find((p) => p.bindings?.code?.slot === slot || (slot === 'default' && p.bindings?.code?.as === 'defaultSlot'))?.name ?? null;
  const out = (s.named ?? []).map((name) => ({ name, ...(s.props?.[name] ? { props: s.props[name] } : {}), ...(figmaOf(name) ? { figmaProperty: figmaOf(name) } : {}) }));
  if (s.default) out.unshift({ name: 'default', ...(s.props?.default ? { props: s.props.default } : {}), ...(figmaOf('default') ? { figmaProperty: figmaOf('default') } : {}) });
  return out;
}

// States and variants from Figma's VARIANT properties, when nothing authored maps them to selectors: a state axis gives one
// state per value (disabled=true), any other axis one variant per value. The states the code's own markup reacts to (its
// pseudo-classes and state props) are added, marked as the code's.
export function figmaStatesVariants(figmaProps = {}, codeText = '') {
  const states = [], variants = [];
  for (const [k, def] of Object.entries(figmaProps ?? {})) {
    if (def?.type !== 'VARIANT' || !Array.isArray(def.variantOptions)) continue;
    const name = strip(k);
    const state = isStateAxis(name, def.variantOptions);
    for (const opt of def.variantOptions) (state ? states : variants).push({ ...(state ? { name: `${name}=${opt}` } : {}), when: { [name]: opt }, from: 'figma' });
  }
  const css = [...new Set([...String(codeText).matchAll(/:(hover|focus-visible|focus|active|disabled|checked)\b/g)].map((m) => m[1]))];
  for (const c of css) if (!states.some((s) => s.name.toLowerCase().includes(c.replace('-visible', '')))) states.push({ name: c, from: 'code' });
  return { states, variants };
}

// The tokens a component paints with: every one it uses, and per state the ones only that state uses (from the state
// bindings the Figma capture keeps per variant).
// componentTokens: every token the component binds anywhere (component-state-tokens.json _components[name].tokens).
export function stateTokens(variantBindings = {}, figmaProps = {}, componentTokens = {}) {
  const variants = Object.values(variantBindings ?? {}).filter((v) => v && Array.isArray(v.bindings));
  const tokensOf = (v) => new Set(v.bindings.map((b) => b.token).filter(Boolean));
  const all = new Set([...variants.flatMap((v) => [...tokensOf(v)]), ...Object.keys(componentTokens ?? {})]);
  if (!all.size) return null;
  const axes = Object.entries(figmaProps ?? {}).filter(([k, d]) => d?.type === 'VARIANT' && isStateAxis(strip(k), d.variantOptions ?? [])).map(([k]) => strip(k));
  const byState = {};
  for (const axis of axes) {
    const key = axis.toLowerCase();
    const values = [...new Set(variants.map((v) => v.props?.[key]).filter((x) => x != null))];
    for (const val of values) {
      const inIt = variants.filter((v) => v.props?.[key] === val), outOf = variants.filter((v) => v.props?.[key] !== val);
      if (!outOf.length) continue;   // a value every variant has tells no state apart
      const only = [...new Set(inIt.flatMap((v) => [...tokensOf(v)]))].filter((t) => !outOf.some((v) => tokensOf(v).has(t)));
      if (only.length) byState[`${axis}=${val}`] = only.sort();
    }
  }
  return { used: [...all].sort(), ...(Object.keys(byState).length ? { byState } : {}) };
}

// What the code says about its accessibility: the element its markup starts with, an explicit role, the aria attributes
// it sets and the keys it listens to; a role Figma's annotation states and authored semantics come first.
export function accessibilityOf(codeText = '', { figmaRole = null, authored = null } = {}) {
  const tpl = /<template>([\s\S]*)<\/template>/.exec(String(codeText))?.[1] ?? '';
  const root = /<\s*([a-z][\w-]*)/.exec(tpl)?.[1] ?? null;
  const role = /\srole\s*=\s*["']([\w-]+)["']/.exec(tpl)?.[1] ?? null;
  const aria = [...new Set([...tpl.matchAll(/\s:?(aria-[\w-]+)\s*=/g)].map((m) => m[1]))];
  const keys = [...new Set([...String(codeText).matchAll(/@key(?:down|up|press)\.([\w.]+)/g)].map((m) => m[1]))];
  const out = {};
  const el = authored?.element ?? root;
  if (el) out.element = { value: el, from: authored?.element ? 'authored' : 'code' };
  const r = authored?.role ?? figmaRole ?? role;
  if (r) out.role = { value: r, from: authored?.role ? 'authored' : figmaRole ? 'figma' : 'code' };
  if (aria.length) out.aria = { value: aria, from: 'code' };
  if (keys.length) out.keyboard = { value: keys, from: 'code' };
  return Object.keys(out).length ? out : null;
}

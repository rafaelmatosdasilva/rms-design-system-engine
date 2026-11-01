// contract-spec.mjs - the component contracts, viewed in the open component specs format (schema 0.39), for a team that
// specifies its components that way: each component's anatomy (its parts), its props with their types, values and
// defaults, its slots, and the styles each part has, in its default and in each variant, as tokens.
//
//   specOf(contract)                           → { spec, left }: one component spec, and what it could not say and why
//   specDocuments(built, { system, figmaFile }) → [{ rel, doc }]: an index (index.json) and one spec a component
//
// Every fact comes from the contract, which read it from Figma and the code; nothing is guessed. A part is in the
// anatomy when the contract knows what kind of layer it is: the frame itself, a frame inside it that Figma lays out
// (its padding or gap), the text layer a text property writes, the instance an instance swap swaps, the slot a slot
// property fills. A style is written when the contract knows the token and where it goes: the frame's padding, gap,
// corner radius, height and type style, and what each variant fills and strokes it with (tokens.byVariant). A text's
// fill goes on its text layer only when the component has one text property. What the code calls each prop, and its
// own values, ride along in the prop's $extensions.
//
// A spec holds only what the format defines, so the links (the contract, the code file, the Figma component) are in the
// index beside it, never copied in. Where a part sits inside the frame (its parent, its order) is not in the contract,
// so no spec says it. Pure: no file is read or written here (contract-gen.mjs writes them).
import { isStateAxis } from './contract-code.mjs';

export const SPEC_VERSION = '0.39.0';
export const SPEC_FORMAT = 'open component specs';
const EXT = 'rms-design-system-engine';

// A key the format reads: words joined in camel case (Show icon → showIcon).
export const specKey = (s) => String(s ?? '').trim().replace(/[^A-Za-z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : '')).replace(/^[A-Z]/, (c) => c.toLowerCase());
// A file name for a component (buttonPrimary → button-primary).
const fileId = (name) => String(name ?? '').replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
const yesNo = (p) => p.type === 'enum' && Array.isArray(p.options) && p.options.length === 2 && p.options.every((o) => /^(true|false)$/i.test(String(o)));
const isTrue = (v) => v === true || /^true$/i.test(String(v));
// A token reference: the contract's {padding.xs} or Figma's padding/xs, as the format's dot path.
const ref = (t, type) => ({ $token: String(t).replace(/^\{|\}$/g, '').split('/').map((x) => x.trim()).filter(Boolean).join('.'), $type: type });

// The prop's key: the code's own name where the contract pairs one, else Figma's name in camel case.
function keyOf(p, taken) {
  const c = p.bindings?.code;
  const own = c && !c.key && (c.as === 'prop' ? c.prop : c.as === 'slot' ? c.slot : null);
  const k = own && /^[A-Za-z_$][\w$]*$/.test(own) && !taken.has(own) ? own : specKey(p.name);
  return taken.has(k) || !k ? null : k;
}

// What the code says about the prop, beside Figma's: its name, type, values, default and how Figma's values are written.
function codeFacts(c) {
  if (!c) return null;
  const out = {};
  for (const k of ['prop', 'slot', 'key', 'as', 'type', 'options', 'default', 'valueMap', 'inverted', 'derived', 'source']) if (c[k] != null) out[k] = c[k];
  return Object.keys(out).length ? out : null;
}

function propOf(p, slots) {
  const kind = p.bindings?.figma?.kind;
  const figma = { 'com.figma': { type: kind ?? p.type, name: p.name } };
  const code = codeFacts(p.bindings?.code);
  const $extensions = { ...figma, ...(code ? { [EXT]: { code } } : {}) };
  const def = p.bindings?.figma?.default !== undefined ? p.bindings.figma.default : p.default;
  if (yesNo(p) || p.type === 'boolean') return def == null ? { why: 'Figma gives it no default' } : { prop: { type: 'boolean', default: isTrue(def), $extensions } };
  if (p.type === 'enum') {
    if (!Array.isArray(p.options) || !p.options.length) return { why: 'Figma lists no values for it' };
    if (def == null) return { why: 'Figma gives it no default' };
    return { prop: { type: 'string', enum: p.options.map(String), default: String(def), $extensions } };
  }
  if (p.type === 'text') return { prop: { type: 'string', ...(def != null && def !== '' ? { examples: [String(def)] } : {}), $extensions } };
  if (p.type === 'instance' || p.type === 'children') {
    const accepts = slots.find((s) => s.name === p.name)?.accepts;
    const named = p.type === 'instance' ? (typeof def === 'string' && !/^\d+:\d+$/.test(def) ? def : null) : null;
    return { prop: { type: 'slot', ...(named ? { default: named } : {}), ...(Array.isArray(accepts) && accepts.length ? { anyOf: accepts } : {}), ...(p.bindings?.code?.as === 'defaultSlot' ? { defaultSlot: true } : {}), $extensions } };
  }
  return { why: `its type (${p.type}) is not one the format has` };
}

// A code-only prop, with the facts the code gives: a boolean with its default, values with a default, a text, a number.
function codeOnlyProp(c) {
  const $extensions = { [EXT]: { from: 'code' } };
  const t = String(c.type ?? '');
  if (/^boolean$/.test(t) && typeof c.default === 'boolean') return { type: 'boolean', default: c.default, $extensions };
  if (Array.isArray(c.options) && c.options.length && c.default != null) return { type: 'string', enum: c.options.map(String), default: String(c.default), $extensions };
  if (/^string$/.test(t)) return { type: 'string', ...(c.default != null && c.default !== '' ? { examples: [String(c.default)] } : {}), $extensions };
  if (/^number$/.test(t)) return { type: 'number', ...(typeof c.default === 'number' ? { default: c.default } : {}), $extensions };
  return null;
}

// The styles a frame's layout facts give: padding, gap, corner radius, height, type style.
function layoutStyles(part = {}) {
  const s = {};
  const inset = part.inset;
  if (inset?.blockToken || inset?.inlineToken) {
    s.padding = {};
    if (inset.blockToken) Object.assign(s.padding, { top: ref(inset.blockToken, 'dimension'), bottom: ref(inset.blockToken, 'dimension') });
    if (inset.inlineToken) Object.assign(s.padding, { start: ref(inset.inlineToken, 'dimension'), end: ref(inset.inlineToken, 'dimension') });
  }
  if (part.gapToken) s.itemSpacing = ref(part.gapToken, 'dimension');
  else if (part.gap === 0) s.itemSpacing = 0;
  if (part.radiusToken) s.cornerRadius = ref(part.radiusToken, 'dimension');
  if (typeof part.height === 'number') s.height = part.height;
  if (part.typographyToken) s.typography = ref(part.typographyToken, 'typography');
  return s;
}

export function specOf(c) {
  const name = c.name || String(c.id ?? '').replace(/^[^.]+\./, '');
  const left = [];
  const props = {}, keyFor = new Map(), taken = new Set();
  const slots = c.slots ?? [];
  for (const p of c.props ?? []) {
    const key = keyOf(p, taken);
    if (!key) { left.push(`prop ${p.name}: its name is taken by another prop`); continue; }
    const r = propOf(p, slots);
    if (!r.prop) { left.push(`prop ${p.name}: ${r.why}`); continue; }
    props[key] = r.prop; keyFor.set(p.name, key); taken.add(key);
  }
  for (const co of c.codeOnly ?? []) {
    if (taken.has(co.name) || !/^[A-Za-z_$][\w$]*$/.test(co.name)) continue;
    const pr = codeOnlyProp(co);
    if (pr) { props[co.name] = pr; taken.add(co.name); }
  }

  // The anatomy: the frame, the frames inside it Figma lays out, then the layer each text, swap and slot property is.
  const anatomy = { root: { type: 'container' } };
  const elements = { root: {} };
  const rootStyles = layoutStyles(c.anatomy?.root);
  for (const [part, facts] of Object.entries(c.anatomy ?? {})) {
    if (part === 'root') continue;
    const styles = layoutStyles(facts);
    if (!Object.keys(styles).length) { left.push(`part ${part}: the contract knows no layout of it, so not what kind of layer it is`); continue; }
    const k = specKey(part) || part;
    anatomy[k] = { type: 'container', ...(k !== part ? { $extensions: { 'com.figma': { name: part } } } : {}) };
    elements[k] = { styles };
  }
  const textKeys = [];
  for (const p of c.props ?? []) {
    const key = keyFor.get(p.name);
    if (!key) continue;
    const type = p.type === 'text' ? 'text' : p.type === 'instance' ? 'instance' : p.type === 'children' ? 'slot' : null;
    if (!type) continue;
    let el = specKey(p.name) || key;
    if (anatomy[el]) el = `${el}${type === 'text' ? 'Text' : type === 'slot' ? 'Slot' : 'Instance'}`;
    anatomy[el] = { type };
    const bind = { $binding: `#/props/${key}` };
    elements[el] = { ...(type === 'text' ? { content: bind } : type === 'instance' ? { instanceOf: bind } : { children: bind }) };
    if (type === 'text') textKeys.push(el);
  }

  // The default: every prop at its default, and the styles of the variant those defaults draw.
  const configuration = {};
  for (const [k, pr] of Object.entries(props)) if (pr.default !== undefined && pr.type !== 'slot') configuration[k] = pr.default;
  const valueOf = (figmaName, v) => { const k = keyFor.get(figmaName); return k && props[k]?.type === 'boolean' ? isTrue(v) : v; };
  const whenOf = (when) => { const out = {}; for (const [fn, v] of Object.entries(when ?? {})) { const k = keyFor.get(fn); if (k) out[k] = valueOf(fn, v); } return out; };
  const paints = c.tokens?.byVariant ?? [];
  const paintStyles = (list) => {
    const root = {}, text = {};
    for (const x of list) {
      if (x.text) { if (x.field === 'fills') text.textColor = ref(x.token, 'color'); }
      else if (x.field === 'fills') root.backgroundColor = ref(x.token, 'color');
      else if (x.field === 'strokes') root.strokes = ref(x.token, 'color');
    }
    return { root, text };
  };
  const isDefault = (when) => Object.entries(whenOf(when)).every(([k, v]) => configuration[k] === v);
  const textEl = textKeys.length === 1 ? textKeys[0] : null;
  if (paints.some((v) => v.paints.some((x) => x.text)) && !textEl) left.push(textKeys.length ? 'text colours: it has several text properties, and the contract does not say which text each colour paints' : 'text colours: it has no text property, so no text layer the colour goes on');
  const base = paints.find((v) => isDefault(v.when));
  const baseStyles = base ? paintStyles(base.paints) : { root: {}, text: {} };
  Object.assign(rootStyles, baseStyles.root);
  if (Object.keys(rootStyles).length) elements.root.styles = rootStyles;
  if (textEl && Object.keys(baseStyles.text).length) elements[textEl].styles = { ...(elements[textEl].styles ?? {}), ...baseStyles.text };

  // Each other variant: what it paints differently from the default.
  const variants = [];
  const differs = (now, was = {}) => Object.fromEntries(Object.entries(now).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(was[k])));
  for (const v of paints) {
    if (v === base) continue;
    const cfg = whenOf(v.when);
    if (!Object.keys(cfg).length) continue;
    const s = paintStyles(v.paints);
    const els = {};
    const r = differs(s.root, baseStyles.root);
    if (Object.keys(r).length) els.root = { styles: r };
    const t = textEl ? differs(s.text, baseStyles.text) : {};
    if (Object.keys(t).length) els[textEl] = { styles: t };
    if (Object.keys(els).length) variants.push({ configuration: cfg, elements: els });
  }
  // A state the contract names (from Figma or the code) whose styles it does not hold is said, not drawn.
  const drawn = new Set(variants.map((v) => JSON.stringify(v.configuration)));
  const states = (c.states ?? []).filter((s) => s.when && !drawn.has(JSON.stringify(whenOf(s.when))) && !isDefault(s.when) && isStateAxis(Object.keys(s.when)[0], []));
  if (states.length && paints.length) left.push(`states ${states.map((s) => s.name).join(', ')}: the contract holds no tokens of their own`);

  const spec = { title: name, anatomy, ...(Object.keys(props).length ? { props } : {}), default: { ...(Object.keys(configuration).length ? { configuration } : {}), elements }, ...(variants.length ? { variants } : {}) };
  return { spec, left };
}

// built: [{ name, contract, file }] with file the contract's path relative to the contracts folder. → [{ rel, doc }]
export function specDocuments(built, { system = 'Design system', figmaFile = null } = {}) {
  const out = [], index = [], seen = new Set();
  for (const { name, contract, file } of built) {
    const id = fileId(name);
    if (!id || seen.has(id)) continue;   // two contracts making one file name: the first kept
    seen.add(id);
    const { spec, left } = specOf(contract);
    const rel = `components/${id}.json`;
    out.push({ rel, doc: spec });
    const fig = contract.source?.figma, node = fig?.nodeId || contract.figmaNodeId, key = fig?.file || figmaFile;
    index.push({
      name, spec: rel,
      ...(file ? { contract: `../${file}` } : {}),
      ...(contract.source?.code?.file ? { code: contract.source.code.file } : {}),
      ...(key && node ? { figma: `https://www.figma.com/design/${key}?node-id=${String(node).replace(':', '-')}` } : {}),
      ...(left.length ? { notSaid: left } : {}),
    });
  }
  const doc = {
    format: SPEC_FORMAT, version: SPEC_VERSION, system,
    note: `${system}'s components in the ${SPEC_FORMAT} format, from the contracts the engine writes from Figma and the code: generated, do not edit. Each spec says what the contract knows; each line here links its contract, its code file and its Figma component, and says what the spec could not.`,
    components: index,
  };
  return [{ rel: 'index.json', doc }, ...out];
}

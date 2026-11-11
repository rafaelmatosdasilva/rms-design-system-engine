// content-rules.mjs - what a component's words need, read from the file's own evidence: which of its text properties a
// use must set, whether a text has room for the longest words its uses give it, and whether an icon-only use still
// carries the name its hidden label gives it.
//
// The examples (figma-examples.mjs) hold each use's properties and the words it shows; the skeleton holds which text
// layer each text property writes, which boolean shows it, and how the layer grows and truncates. Nothing asked them
// what an agent must fill in, how long a label runs, or what an icon-only form leaves out. Each rule is one to fix where
// most of the library already follows it, and a question for the team where it does not. A rule is said only from MIN
// uses or more, so a component seen once or twice is never held to what its uses happen to say.
//
//   contentRules({ props, skeleton, examples }) → [{ id, area, says, items: [{ component, value, fits }] }]
//   givenProps({ props, examples })             → { component: [property] }: what a use must set (a placeholder
//                                                  default, or one every use sets), for the agents' grammar
//   labelLengths({ props, skeleton, examples }) → { component: { property: [shortest, longest] } }, in words
//
//   props-given      a text property every use sets starts on placeholder words (Label), never words that read as real
//   text-room        a text that grows on one line, whose uses run past four words, ends in an ellipsis or stops at a
//                    maximum width
//   icon-only-named  an icon-only use (its label hidden, no words shown) still sets its label: its words are what a
//                    screen reader calls the control (WCAG 4.1.2), which the code is given from it
//
// Pure: nothing is read or written here.

const MIN = 3;          // three uses, or three components, before anything is said
const SHORT = 4;        // a short label is two to four words (use-rules.mjs words-case)
const clean = (k) => String(k).replace(/#[^#]*$/, '');
const wordsOf = (s) => String(s ?? '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const count = (s) => String(s ?? '').trim().split(/\s+/).filter(Boolean).length;
// Figma's and a designer's words for "fill this in": the property's own name (stepText's Step), or one of these.
const PLACEHOLDER = new Set(['label', 'title', 'subtitle', 'text', 'description', 'helper', 'placeholder', 'name', 'value', 'content', 'heading', 'caption', 'item', 'list', 'message', 'error', 'note', 'lorem', 'ipsum', 'dolor', 'sit', 'amet']);
export function isPlaceholder(value, prop = '') {
  const v = String(value ?? '').trim();
  if (!v) return true;
  if (/^[[{(<].*[\]})>]$/.test(v)) return true;
  const own = new Set(wordsOf(clean(prop)));
  const w = wordsOf(v).filter((x) => !/^\d+$/.test(x));
  return w.length > 0 && w.every((x) => PLACEHOLDER.has(x) || own.has(x) || own.has(x.replace(/s$/, '')));
}

// Every use of each component the examples show: its own, and each time it sits inside another's (a bar's tabs).
function usesOf(names, examples) {
  const ex = examples?.components ?? {};
  const uses = new Map(names.map((n) => [n, [...(ex[n] ?? [])]]));
  for (const list of Object.values(ex)) for (const e of list ?? []) for (const i of e?.items ?? []) if (uses.has(i.component)) uses.get(i.component).push(i);
  return uses;
}
const textProps = (props, n) => Object.entries(props[n]?.properties ?? {}).filter(([, d]) => d?.type === 'TEXT').map(([k, d]) => [clean(k), d]);
const setIn = (e, key) => (e?.props && typeof e.props[key] === 'string' ? e.props[key] : null);

// Each text layer a text property writes (wired.characters), once, with the boolean that shows it (its own, or a
// layer's above it) and how it grows: [{ prop, layer, shownBy, resize, truncate, maxWidth }].
function textLayers(entry) {
  const out = new Map();
  const walk = (t, shownBy) => { for (const c of t?.c ?? []) {
    const by = c.wired?.visible ? clean(c.wired.visible) : shownBy;
    if (c.t === 'TEXT' && c.wired?.characters && !out.has(clean(c.wired.characters)))
      out.set(clean(c.wired.characters), { prop: clean(c.wired.characters), layer: c.n, shownBy: by, resize: c.text?.resize ?? null, truncate: !!c.text?.truncate, maxLines: c.text?.maxLines ?? null, maxWidth: !!c.limits?.maxWidth, width: c.size?.w ?? null });
    if (c.t !== 'INSTANCE') walk(c, by); } };
  for (const t of entry?.trees ?? []) walk(t, null);
  return [...out.values()];
}
const hasIcon = (entry, props, n) => Object.values(props[n]?.properties ?? {}).some((d) => d?.type === 'INSTANCE_SWAP')
  || (entry?.trees ?? []).some((t) => { const w = (x) => (x?.c ?? []).some((c) => c.t === 'INSTANCE' || (c.t !== 'INSTANCE' && w(c))); return w(t); });

export function givenProps({ props = {}, examples = null } = {}) {
  const names = Object.keys(props).filter((n) => !/^[_.]/.test(n)).sort();
  const uses = usesOf(names, examples), out = {};
  for (const n of names) {
    const given = textProps(props, n).filter(([k, d]) => {
      if (isPlaceholder(d.defaultValue, k)) return true;
      const set = uses.get(n).map((e) => setIn(e, k)).filter((v) => v != null);
      return set.length >= MIN && set.every((v) => v !== d.defaultValue);
    }).map(([k]) => k);
    if (given.length) out[n] = given;
  }
  return out;
}

export function labelLengths({ props = {}, skeleton = {}, examples = null } = {}) {
  const names = Object.keys(props).filter((n) => !/^[_.]/.test(n)).sort();
  const uses = usesOf(names, examples), out = {};
  for (const n of names) for (const [k, d] of textProps(props, n)) {
    const set = uses.get(n).map((e) => setIn(e, k)).filter((v) => v != null && !isPlaceholder(v, k) && v !== d.defaultValue);
    if (set.length < MIN) continue;
    const lens = set.map(count);
    (out[n] ??= {})[k] = [Math.min(...lens), Math.max(...lens)];
  }
  return out;
}

export function contentRules({ props = {}, skeleton = {}, examples = null } = {}) {
  const rules = [];
  const push = (id, area, says, items) => { if (items.length) rules.push({ id, area, says, items }); };
  if (!examples?.components) return rules;
  const names = Object.keys(props).filter((n) => !/^[_.]/.test(n)).sort();
  const uses = usesOf(names, examples);

  // A text property every use fills in is one a use must set: its default is said as placeholder words, so a use that
  // leaves it shows it unset. A default that reads as real words (42%, Pay now) passes for a finished one.
  push('props-given', 'content', 'A text property every use sets starts on placeholder words (Label), never words that read as real', names.flatMap((n) => textProps(props, n).map(([k, d]) => {
    const set = uses.get(n).map((e) => setIn(e, k)).filter((v) => v != null);
    if (set.length < MIN || set.some((v) => v === d.defaultValue)) return null;
    const ok = isPlaceholder(d.defaultValue, k);
    return { component: n, prop: k, value: ok ? '' : `${k} starts on "${String(d.defaultValue).trim()}", which all ${set.length} uses replace`, fits: ok };
  }).filter(Boolean)));

  // A text whose uses run past a short label, and that grows on one line, has nothing to stop it pushing its frame
  // wider: it ends in an ellipsis or stops at a maximum width. One that wraps, or is as wide as its frame, has room.
  push('text-room', 'content', `A text that grows on one line, whose uses run past ${SHORT} words, ends in an ellipsis or stops at a maximum width`, names.flatMap((n) => {
    const layers = textLayers(skeleton[n]).filter((l) => l.resize === 'WIDTH_AND_HEIGHT' && l.width !== 'FIXED' && l.width !== 'FILL');
    return layers.map((l) => {
      const d = textProps(props, n).find(([k]) => k === l.prop)?.[1];
      const set = uses.get(n).map((e) => setIn(e, l.prop)).filter((v) => v != null && v !== d?.defaultValue && !isPlaceholder(v, l.prop));
      if (set.length < MIN) return null;
      const longest = set.reduce((a, b) => (count(b) > count(a) ? b : a));
      if (count(longest) <= SHORT) return null;
      const ok = l.truncate || l.maxWidth;
      return { component: n, prop: l.prop, value: ok ? '' : `${l.layer} grows on one line with nothing to stop it, and its uses run to ${count(longest)} words ("${longest.slice(0, 40)}${longest.length > 40 ? '…' : ''}")`, fits: ok };
    }).filter(Boolean);
  }));

  // An icon-only use hides its label and shows no words: what the label says is what a screen reader calls the control,
  // so the use still sets it, and the code is given its name from it. One left on its placeholder has none. A
  // component that shows no words by default is the design accessibility check's (design-a11y.mjs, noname).
  push('icon-only-named', 'content', 'An icon-only use still sets its hidden label, which is what a screen reader calls it', names.map((n) => {
    if (!hasIcon(skeleton[n], props, n)) return null;
    const labels = textLayers(skeleton[n]).filter((l) => l.shownBy);
    if (!labels.length) return null;
    const def = Object.fromEntries(textProps(props, n));
    const iconOnly = uses.get(n).filter((e) => e?.props && !(e.texts ?? []).length && labels.some((l) => String(e.props[l.shownBy]) === 'false'));
    if (!iconOnly.length) return null;
    const unnamed = iconOnly.filter((e) => !labels.some((l) => String(e.props[l.shownBy]) === 'false' && setIn(e, l.prop) != null && !isPlaceholder(setIn(e, l.prop), l.prop) && setIn(e, l.prop) !== def[l.prop]?.defaultValue));
    const l = labels.find((x) => iconOnly.some((e) => String(e.props[x.shownBy]) === 'false'));
    return { component: n, value: unnamed.length ? `${unnamed.length} of ${iconOnly.length} icon-only uses leave ${l.prop} on "${String(def[l.prop]?.defaultValue ?? '').trim() || 'nothing'}"` : '', fits: !unnamed.length };
  }).filter(Boolean));
  return rules;
}

// anatomy-parity.mjs - Figma's anatomy of a component held against the code's, part by part.
//
// The parity checks compare values: a colour, a padding, a height, each as Figma binds it and as the browser draws it.
// The two sides are now read as deeply as each other (the Figma skeleton, the code's anatomy in code-grammar.mjs), and
// nothing held one reading against the other, so a difference in how a component is put together went unseen while
// every value matched: a part Figma always shows that the code renders on a condition (or the other way round), a
// part's text set by hand where Figma sets it in a text style, corners that share one variable in Figma and four values
// in the code, two shadow layers in Figma and one in the code, a frame that wraps in one and not the other. Each is said
// with the part it is on and the line to patch. What the browser check and the shadow check (effects-parity.mjs)
// already compare value by value is not said again here. Two were tried on a real system and left out, because the
// code's reading cannot yet say them without flagging what is fine: the order of the parts (it does not know how
// deep each element sits, so a frame inside another read as out of order) and whether a width fills or hugs (a rule
// that sets both, or a fixed width, read as one of the two).
//
//   compareAnatomies({ skeleton, structure, anatomy, paired }) → { match, differ, notComparable, facts }
//     skeleton:  figma-skeleton.snapshot.json (each component's variant trees and what each layer binds)
//     structure: figma-structure.snapshot.json → components (the default variant)
//     anatomy:   the code's anatomy by component (code-grammar.mjs codeGrammarOf → code.anatomy)
//     paired:    { component: { partName: '.class' } }, each Figma part paired with the class that draws it
//                (part-pairing.mjs): only a paired part is held against its element, never one guessed
//   Each difference: { component, part?, field, figma, code, at, kind: 'anatomy' }, in the shape the browser check's
//   are, so the gate prints it with the line to patch and the hand-back lists it.
//
// Pure: nothing is read or written here.
import { partFacts } from './part-pairing.mjs';

const CORNERS = ['topLeftRadius', 'topRightRadius', 'bottomRightRadius', 'bottomLeftRadius'];
const AUTO = /^(frame|group|rectangle|vector|ellipse|line|polygon|star|boolean|union|subtract|text|instance|component|slot)(\s*\d+)?$/i;
const clean = (k) => String(k ?? '').replace(/#[^#]*$/, '');

// The default variant's tree and its name: the structure's default, else the first variant.
function defaultTree(sk, st) {
  const vs = sk?.variants ?? [];
  const name = st?.defaultVariant && vs.some(([v]) => v === st.defaultVariant) ? st.defaultVariant : vs[0]?.[0] ?? null;
  const at = vs.find(([v]) => v === name)?.[1] ?? 0;
  return { name, tree: sk?.trees?.[at] ?? null };
}

// The named layers of a tree in the order they sit (depth first), each with the boolean that shows it (its own or a
// layer's above it) and whether it is hidden. An instance's own layers are its component's, never walked.
function partsOf(tree) {
  const out = [];
  const walk = (t, shownBy, hidden) => { for (const c of t?.c ?? []) {
    const by = c.wired?.visible ? clean(c.wired.visible) : shownBy, hid = hidden || !!c.hidden;
    const n = String(c.n ?? '').trim();
    if (n && !AUTO.test(n) && !out.some((x) => x.name === n)) out.push({ name: n, shownBy: by, hidden: hid });
    if (c.t !== 'INSTANCE') walk(c, by, hid);
  } };
  walk(tree, null, false);
  return out;
}

export function compareAnatomies({ skeleton = {}, structure = {}, anatomy = {}, paired = {} } = {}) {
  const out = { match: 0, differ: [], notComparable: [], facts: [] };
  const settle = (ok, d) => {
    out.facts.push({ key: `${d.component}${d.part ? ` › ${d.part}` : ''} · ${d.field}`, figma: String(d.figma), code: String(d.code), same: !!ok, component: d.component });
    if (ok) out.match++; else out.differ.push({ ...d, kind: 'anatomy' });
  };
  for (const [name, a] of Object.entries(anatomy ?? {})) {
    const sk = skeleton?.[name];
    if (!a || !sk?.trees?.length) continue;
    const { name: dv, tree } = defaultTree(sk, structure?.[name]);
    if (!tree) continue;
    const pairs = paired?.[name] ?? {};
    const codePart = (sel) => a.parts.find((p) => p.class && `.${p.class}` === sel);

    // The parts both sides have: shown always, or only in some variants or when a property is on.
    // A part absent or hidden in any variant is shown in some only (showLabel=false leaves the label out).
    const everyTree = (sk.variants ?? []).map(([, i]) => sk.trees[i]).filter(Boolean);
    const inSome = (n) => everyTree.some((t) => { const p = partsOf(t).find((x) => x.name === n); return !p || p.hidden; });
    const figParts = partsOf(tree).filter((p) => pairs[p.name] && codePart(pairs[p.name]));
    for (const fp of figParts) {
      const cp = codePart(pairs[fp.name]);
      const some = inSome(fp.name);
      const figOptional = !!fp.shownBy || fp.hidden || some;
      const figSays = fp.shownBy ? `shown when ${fp.shownBy} is on` : some ? 'shown in some variants only' : 'always shown';
      // Shown in some variants only (a state, an option) and always in the markup: the code may hide it with that
      // variant's class, which the markup does not say, so it is not held to a condition.
      if (!fp.shownBy && !fp.hidden && some && !cp.optional) continue;
      settle(figOptional === !!cp.optional, { component: name, part: fp.name, field: 'shown', figma: figSays, code: cp.optional ? 'rendered on a condition' : 'always rendered', at: cp.at ?? null });
    }

    // A part's text: set in a text style in Figma, by hand in the code.
    const styles = partFacts(sk).styles;
    for (const [pn, sel] of Object.entries(pairs)) {
      const style = styles[pn];
      const cls = String(sel).replace(/^\./, '');
      const texts = (a.text ?? []).filter((t) => t.part === cls);
      if (!style || !texts.length) continue;
      const byHand = texts.find((t) => !t.token);
      settle(!byHand, { component: name, part: pn, field: 'text style', figma: style, code: byHand ? `${byHand.prop}: ${byHand.value} by hand` : 'the system\'s text style', at: (byHand ?? texts[0]).at ?? null });
    }

    // Its corners: one variable for all four in Figma against one token in the code, or several against several.
    const binds = sk.binds?.[dv]?.[''] ?? {};
    const bound = CORNERS.filter((k) => binds[k]);
    if (bound.length && a.radius) {
      const vars = [...new Set(bound.map((k) => String(binds[k])))];
      const figShared = bound.length === 4 && vars.length === 1;
      settle(figShared === !!a.radius.shared, { component: name, field: 'corners', figma: figShared ? `one variable for all four (${vars[0]})` : `${vars.length} variables (${vars.join(', ')})`, code: a.radius.shared ? `one token (${a.radius.tokens[0]})` : `${a.radius.values.join(', ')}`, at: a.radius.at ?? null });
    }

    // Its shadow: as many layers on its frame in Figma as on its root in the code.
    const figFx = Number(tree.effects) || 0;
    const rootShadow = (a.shadows ?? []).find((s) => !s.part && !s.off && !/:(hover|focus|active|disabled)/.test(s.selector ?? ''));
    if (figFx && rootShadow) settle(figFx === rootShadow.layers.length, { component: name, field: 'shadow layers', figma: figFx, code: rootShadow.layers.length, at: rootShadow.at ?? null });

    // How it wraps.
    if (tree.layout && a.wrap?.wrap) settle(!!tree.layout.wrap === (a.wrap.wrap === 'wrap'), { component: name, field: 'wrap', figma: tree.layout.wrap ? 'wraps' : 'one line', code: a.wrap.wrap === 'wrap' ? 'wraps' : 'one line', at: a.wrap.at ?? null });
  }
  return out;
}

// construction-grammar.mjs - how this system builds a component in Figma: its construction grammar, mined from what the
// Figma capture already holds.
//
// The engine knows what each component holds (its values, bindings, properties, states). An agent asked to build or
// change one also needs how the system builds: how it names a component, each kind of property and each option, whether
// its layers carry names, whether every component lays out with auto layout, which variables a component binds (its own
// or the shared ones), whether it carries a description. No system says this in one place, and every system says it
// differently, so nothing here is imposed: each rule is what most of the system's own components already do, with how
// many follow it and which do not.
//
//   grammarOf({ props, structure, values }, { answers }) → { figma: { components, rules, vocabulary }, questions }
//     props:     figma-component-props.snapshot.json   (properties, their kinds, options and the description)
//     structure: figma-structure.snapshot.json → components (layout, the variables bound, child frames, toggles)
//     values:    component-values.snapshot.json        (hygiene: the layers each variable is bound on, variants with no
//                                                       auto layout); optional
//     answers:   { <rule id>: true | false }: the team's word on a question, kept in the authored contract
//                (construction); true makes it a rule, false drops it
//   grammarLines(grammar) → the grammar in a few lines, for llms.txt and --query
//
// A rule needs at least MIN_SEEN components and RULE_SHARE of them following it. Between QUESTION_SHARE and RULE_SHARE
// it is a question for the team (is this the rule, and the rest exceptions?), asked once and kept. Below that, the system
// has no rule there, and none is written: an agent then follows the component it was asked to build like.
//
// Pure: no file is read or written here (contract-gen.mjs writes contracts/construction.json).

export const RULE_SHARE = 0.75;
export const QUESTION_SHARE = 0.5;
export const MIN_SEEN = 3;

// Figma's own names for a layer nobody named: "Frame 235", "Rectangle 12".
const AUTO_NAMED = /^(Frame|Group|Rectangle|Ellipse|Vector|Line|Polygon|Star|Union|Subtract|Intersect|Exclude|Image|Text|Component|Instance|Section|Slice)( \d+)+$/;
export const isAutoNamed = (name) => AUTO_NAMED.test(String(name ?? '').trim());

// The way a name is written. Single lower-case words are camelCase as much as anything (a system that writes camelCase
// writes "state" too), so they count for camelCase and for lower case alike: see caseFits.
export function caseOf(name) {
  const s = String(name ?? '').trim();
  if (!s) return 'empty';
  if (/^[a-z][a-z0-9]*$/.test(s)) return 'lower';
  if (/^[a-z][a-z0-9]*([A-Z][a-z0-9]*)+$/.test(s)) return 'camelCase';
  if (/^[A-Z][a-z0-9]*([A-Z][a-z0-9]*)+$/.test(s)) return 'PascalCase';
  if (/^[A-Z][a-z0-9]*$/.test(s)) return 'Capitalized';
  if (/^[a-z0-9]+(-[a-z0-9]+)+$/.test(s)) return 'kebab-case';
  if (/^[a-z0-9]+(_[a-z0-9]+)+$/.test(s)) return 'snake_case';
  if (/^[A-Z][a-z0-9]*( [A-Z][a-z0-9]*)+$/.test(s)) return 'Title Case';
  if (/^[A-Za-z0-9]+( [a-z0-9]+)+$/.test(s)) return 'Sentence case';
  return 'mixed';
}
// Whether a name fits a case: a single lower-case word fits camelCase, kebab-case, snake_case and lower; a single
// capitalized word fits PascalCase, Title Case and Capitalized.
export function caseFits(name, rule) {
  const c = caseOf(name);
  if (c === rule) return true;
  if (c === 'lower') return ['camelCase', 'kebab-case', 'snake_case'].includes(rule);
  if (c === 'Capitalized') return ['PascalCase', 'Title Case', 'Sentence case'].includes(rule);
  return false;
}

// A name's words: camelCase, PascalCase, kebab, snake and spaces alike (showBadgeDot → show, badge, dot).
export const wordsOf = (name) => String(name ?? '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[\s_-]+/).filter(Boolean).map((w) => w.toLowerCase());

// A property's own name, without the id Figma adds to every kind but a variant (showIcon#79399:1 → showIcon).
const propName = (key) => String(key).replace(/#[^#]*$/, '');

const KINDS = { BOOLEAN: 'boolean', TEXT: 'text', INSTANCE_SWAP: 'instance swap', SLOT: 'slot', VARIANT: 'variant' };

// One rule from a list of items, each { component, value, fits }: a rule, a question or nothing, by the share that fits.
function judge(id, area, says, items, { answers = {}, min = MIN_SEEN, unsettled = [] } = {}) {
  const of = items.length;
  if (of < min) return null;
  const follows = items.filter((i) => i.fits).length;
  const share = follows / of;
  const exceptions = items.filter((i) => !i.fits).map(({ component, value }) => ({ component, value }));
  const base = { id, area, says, follows, of, share: Math.round(share * 100) / 100, exceptions };
  if (answers[id] === true) return { ...base, status: 'rule', by: 'team' };
  if (answers[id] === false) return null;
  if (share >= RULE_SHARE) return { ...base, status: 'rule', by: 'majority' };
  if (share >= QUESTION_SHARE) return { ...base, status: 'question', by: 'majority' };
  unsettled.push({ id, area, says, follows, of });
  return null;
}

// The most common of a list of values, with its count.
function top(values) {
  const n = new Map();
  for (const v of values) n.set(v, (n.get(v) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0] ?? [null, 0];
}

// The case most of these names are written in. A single lower-case word says nothing between camelCase and kebab-case,
// so it counts for whichever of those the longer names choose (camelCase when there are none).
function dominantCase(names) {
  const cases = names.map(caseOf).filter((c) => c !== 'empty');
  const told = cases.filter((c) => c !== 'lower' && c !== 'Capitalized' && c !== 'mixed');
  if (told.length) return top(told)[0];
  return top(cases)[0] === 'Capitalized' ? 'PascalCase' : 'camelCase';
}

// A word most names of one kind begin or end with (show for a boolean, Content for a text), when there is one.
function affix(names, where) {
  const words = names.map((n) => wordsOf(n)).filter((w) => w.length > 1).map((w) => (where === 'start' ? w[0] : w[w.length - 1]));
  if (!words.length) return null;
  const [word, count] = top(words);
  return count / names.length >= QUESTION_SHARE ? word : null;
}

// The variables a component's own frame binds, from the structure capture: { colour: [...], spacing: [...] }.
function boundTokens(s = {}) {
  const colour = ['fill', 'text', 'stroke'].map((k) => s.colors?.[k]?.token).filter(Boolean);
  const spacing = [s.paddingVar?.tb, s.paddingVar?.lr, s.gapVar, s.innerRadiusVar, ...(s.childFrameGaps ?? []).map((g) => g.gapVar)].filter(Boolean);
  return { colour, spacing };
}

// Whether a variable is the component's own (its name is one of the path's segments: advanced/buttonPrimary/text/color),
// and the segments before it (advanced), which make the template.
function ownToken(token, component) {
  const segs = String(token).split('/');
  const at = segs.findIndex((s) => s.toLowerCase() === String(component).toLowerCase());
  return at < 0 ? null : segs.slice(0, at).join('/');
}

// The names of the layers a capture saw inside a component: those a variable is bound on (values' hygiene), the child
// frames with their own gap (structure) and those a boolean property shows (structure's toggles). The component's own
// name, at the head of each path, is left out, and so are the names of instances of the system's components (an
// instance keeps its component's name, which is that component's to choose).
function layerNames(name, s = {}, v = {}, components = new Set()) {
  const out = new Set();
  for (const where of Object.values(v.hygiene?.binds ?? {})) for (const path of Object.values(where)) for (const seg of String(path).split('/').slice(1)) out.add(seg);
  for (const g of s.childFrameGaps ?? []) if (g.name) out.add(g.name);
  for (const layers of Object.values(s.toggles ?? {})) for (const l of layers ?? []) out.add(l);
  return [...out].filter((l) => l && l !== name && !components.has(l));
}

export function grammarOf({ props = {}, structure = {}, values = {} } = {}, { answers = {} } = {}) {
  const names = [...new Set([...Object.keys(props), ...Object.keys(structure)])]
    .filter((n) => !n.startsWith('_') && (props[n]?.properties || structure[n]) && n.trim() && !/\s{2,}|^\s|\s$/.test(n) && !/usage context/i.test(n))
    .sort();
  const components = new Set(names);
  const rules = [], unsettled = [];
  const add = (r) => { if (r) rules.push(r); };
  const opts = { answers, unsettled };

  // Component names.
  // A part's name is its root's and its own (table/Row): each is written in the system's case.
  const segs = (n) => String(n).split('/').map((x) => x.trim()).filter(Boolean);
  const nameCase = dominantCase(names.flatMap(segs));
  add(judge('component-name-case', 'components', `A component is named in ${nameCase}`, names.map((n) => ({ component: n, value: n, fits: segs(n).every((x) => caseFits(x, nameCase)) })), opts));

  // Each kind of property: how it is written, and the word it begins or ends with.
  const byKind = {};
  for (const n of names) for (const [key, d] of Object.entries(props[n]?.properties ?? {})) (byKind[d.type] ??= []).push({ component: n, value: propName(key), def: d });
  for (const [type, list] of Object.entries(byKind)) {
    const kind = KINDS[type] ?? type.toLowerCase();
    const a = /^[aeiou]/.test(kind) ? 'An' : 'A';
    const id = kind.replace(/ /g, '-');
    const values_ = list.map((i) => i.value);
    const c = dominantCase(values_);
    add(judge(`${id}-property-case`, 'properties', `${a} ${kind} property is named in ${c}`, list.map((i) => ({ ...i, fits: caseFits(i.value, c) })), opts));
    const pre = affix(values_, 'start'), post = affix(values_, 'end');
    const cap = (w) => w.replace(/^\w/, (x) => x.toUpperCase());
    if (pre) add(judge(`${id}-property-prefix`, 'properties', `${a} ${kind} property begins with "${pre}" (${pre}${cap('thing')})`, list.map((i) => ({ ...i, fits: wordsOf(i.value)[0] === pre && wordsOf(i.value).length > 1 })), opts));
    if (post) add(judge(`${id}-property-suffix`, 'properties', `${a} ${kind} property ends with "${cap(post)}" (thing${cap(post)})`, list.map((i) => ({ ...i, fits: wordsOf(i.value).at(-1) === post && wordsOf(i.value).length > 1 })), opts));
  }

  // Variant options: how each is written, and a yes/no axis's two options.
  // A number (style=1) or a placeholder ((Select a preset)) is not written in any case, and is left out.
  const options = (byKind.VARIANT ?? []).flatMap((i) => (i.def.variantOptions ?? []).filter((o) => /[A-Za-z]/.test(o) && !/^\(.*\)$/.test(o)).map((o) => ({ component: i.component, value: `${i.value}=${o}`, option: o })));
  const optCase = dominantCase(options.map((o) => o.option).filter((o) => !/^(true|false)$/i.test(o)));
  add(judge('variant-option-case', 'variants', `A variant option is written in ${optCase} (${optCase === 'camelCase' ? 'default, inProgress' : 'as most are'})`, options.filter((o) => !/^(true|false)$/i.test(o.option)).map((o) => ({ ...o, fits: caseFits(o.option, optCase) })), opts));
  const yesNo = options.filter((o) => /^(true|false)$/i.test(o.option));
  if (yesNo.length) {
    const lower = yesNo.filter((o) => /^(true|false)$/.test(o.option)).length >= yesNo.length / 2;
    add(judge('variant-boolean-options', 'variants', `A yes/no variant's options are ${lower ? 'true and false' : 'True and False'}`, yesNo.map((o) => ({ ...o, fits: lower ? /^(true|false)$/.test(o.option) : /^(True|False)$/.test(o.option) })), opts));
  }

  // Layers: named by the team, not left with Figma's own names; and written in one case.
  const layers = names.map((n) => ({ n, l: layerNames(n, structure[n], values[n], components) })).filter((x) => x.l.length);
  add(judge('layers-named', 'layers', 'Every layer has a name of its own (never Figma\'s "Frame 235")', layers.map(({ n, l }) => ({ component: n, value: l.filter(isAutoNamed).join(', '), fits: !l.some(isAutoNamed) })), opts));
  const named = layers.flatMap(({ n, l }) => l.filter((x) => !isAutoNamed(x)).map((x) => ({ component: n, value: x })));
  const layerCase = dominantCase(named.map((x) => x.value));
  add(judge('layer-name-case', 'layers', `A layer is named in ${layerCase}`, named.map((x) => ({ ...x, fits: caseFits(x.value, layerCase) })), opts));

  // Auto layout: on the component's frame, and on every variant of two layers or more.
  const laid = names.filter((n) => structure[n]).map((n) => {
    const s = structure[n], v = values[n]?.hygiene;
    const frame = s.layout ?? s.box?.layout;
    const without = v?.noAutoLayout ?? [];
    return { component: n, value: [frame && frame !== 'NONE' ? null : 'its frame', without.length ? `${without.length} variant${without.length === 1 ? '' : 's'}` : null].filter(Boolean).join(', '), fits: !!frame && frame !== 'NONE' && !without.length };
  });
  add(judge('auto-layout', 'layout', 'Every component lays out with auto layout, and so does each of its variants', laid, opts));

  // Variables: whether a component binds its own (advanced/<component>/…) or the shared ones, colour and spacing apart.
  for (const [kind, label] of [['colour', 'colours'], ['spacing', 'spacing, gaps and radii']]) {
    const seen = names.map((n) => ({ n, t: boundTokens(structure[n])[kind] })).filter((x) => x.t.length);
    if (!seen.length) continue;
    const prefixes = seen.flatMap(({ n, t }) => t.map((tok) => ownToken(tok, n)).filter((p) => p !== null));
    const own = prefixes.length >= seen.flatMap((x) => x.t).length / 2;
    const prefix = own ? top(prefixes)[0] : null;
    const template = own ? `${prefix ? prefix + '/' : ''}<component>/…` : null;
    add(judge(`${kind}-variables`, 'variables', own ? `A component's ${label} bind its own variables (${template})` : `A component's ${label} bind the system's shared variables, not variables of its own`,
      seen.map(({ n, t }) => {
        const off = t.filter((tok) => (own ? ownToken(tok, n) === null : ownToken(tok, n) !== null));
        return { component: n, value: off.join(', '), fits: !off.length };
      }), opts));
  }

  // Description.
  const described = names.filter((n) => props[n]).map((n) => ({ component: n, value: '', fits: !!String(props[n].description ?? '').trim() || values[n]?.hygiene?.description === true }));
  add(judge('description', 'documentation', 'Every component carries a description in Figma', described, opts));

  // The variant axes the system uses, with their options: a vocabulary to reuse rather than a rule.
  const axes = new Map();
  for (const i of byKind.VARIANT ?? []) {
    const a = axes.get(i.value) ?? { name: i.value, components: [], options: {} };
    a.components.push(i.component);
    for (const o of i.def.variantOptions ?? []) a.options[o] = (a.options[o] ?? 0) + 1;
    axes.set(i.value, a);
  }
  const variantAxes = [...axes.values()].filter((a) => a.components.length >= 2)
    .sort((a, b) => b.components.length - a.components.length || a.name.localeCompare(b.name))
    .map((a) => ({ name: a.name, components: a.components.length, options: Object.entries(a.options).sort((x, y) => y[1] - x[1]).map(([o]) => o) }));

  const questions = rules.filter((r) => r.status === 'question').map((r) => ({ id: r.id, ask: `${r.says}? ${r.follows} of ${r.of} do; ${r.of - r.follows} do not (${r.exceptions.slice(0, 3).map((e) => e.component).join(', ')}${r.exceptions.length > 3 ? '…' : ''}). Is it the rule, and the others to change?` }));
  return { figma: { components: names.length, rules, unsettled, vocabulary: { variantAxes } }, questions };
}

// The grammar in a few lines: each rule with how many follow it, then the axes most used.
export function grammarLines(g, { axes = 8, options = 6 } = {}) {
  const f = g?.figma;
  if (!f?.rules?.length) return [];
  const lines = [`How this system builds a component in Figma (from its ${f.components} components):`];
  for (const r of f.rules) lines.push(`- ${r.says}${r.status === 'question' ? ' (a question for the team)' : ''}: ${r.follows} of ${r.of}${r.by === 'team' ? ', the team\'s rule' : ''}.`);
  for (const u of f.unsettled ?? []) lines.push(`- No rule: ${u.says.replace(/^\w/, (c) => c.toLowerCase())} in ${u.follows} of ${u.of}; follow the component it is like.`);
  const va = f.vocabulary?.variantAxes ?? [];
  if (va.length) lines.push(`- Variant axes it already uses: ${va.slice(0, axes).map((a) => `${a.name} (${a.options.slice(0, options).join(' | ')}${a.options.length > options ? ' …' : ''})`).join('; ')}.`);
  return lines;
}

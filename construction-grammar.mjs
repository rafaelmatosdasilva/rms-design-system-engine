// construction-grammar.mjs - how this system builds a component in Figma: its construction grammar, mined from what the
// Figma capture already holds.
//
// The engine knows what each component holds (its values, bindings, properties, states). An agent asked to build or
// change one also needs how the system builds: how it names a component, each kind of property and each option, whether
// its layers carry names, whether every component lays out with auto layout, which variables a component binds (its own
// or the shared ones), whether it carries a description. No system says this in one place, and every system says it
// differently, so nothing here is imposed: each rule is what most of the system's own components already do, with how
// many follow it and which do not. It is a rule only once every component follows it: there are no exceptions, a
// component follows it or is to fix.
//
//   grammarOf({ props, structure, values }, { answers }) → { figma: { components, rules, vocabulary }, questions }
//     props:     figma-component-props.snapshot.json   (properties, their kinds, options and the description)
//     structure: figma-structure.snapshot.json → components (layout, the variables bound, child frames, toggles)
//     values:    component-values.snapshot.json        (hygiene: the layers each variable is bound on, variants with no
//                                                       auto layout); optional
//     skeleton:  figma-skeleton.snapshot.json (skeletonOf: every variant's layer tree, wiring, styles, modes, nesting,
//                swaps, placement, reactions, dev links), for how each component is built inside; optional
//     varNames:  figma-vars.snapshot.json → variableScopes (each variable id with its name), for the variables bound on
//                the layers inside a component; optional
//     answers:   { <rule id>: true | false }: the team's decision, kept in the authored contract (construction); true
//                makes it one to fix, false drops it; for the variables a component binds, 'own' or 'shared' says
//                which way the system goes (each such rule carries both ways: ways, way)
//   grammarLines(grammar) → the grammar in a few lines, for llms.txt and --query
//   fixOf(rule, toFix) → what to do in Figma for one component that breaks a rule: a rename the engine can write
//     ({ what: 'component' | 'property' | 'option' | 'layer', from, to, prop?, say }), or what only a person can do
//     ({ what: null, say }: a layer's new name needs its content read, layout and bindings a design decision)
//
// Each one, seen on at least MIN_SEEN components, has a status:
//   rule    every component follows it: nothing to do;
//   fix     FIX_SHARE of them or more follow it, or the team decided it is the rule: the others are to fix;
//   decide  fewer follow it and the team has not decided: whether it is the rule, then the others are to fix.
// The team's no drops it.
//
// Pure: no file is read or written here (contract-gen.mjs writes contracts/construction.json).

export const FIX_SHARE = 0.8;
export const MIN_SEEN = 3;
// A word a kind of property begins or ends with is a candidate when half its names have it.
const AFFIX_SHARE = 0.5;

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

// One rule from a list of items, each { component, value, fits }: its status, by who follows it and what the team said.
// area: the kind of rule it is, as the Construction page groups them: naming (how components, their properties, their
// variants' options and their layers are named), layout, variables, documentation.
function judge(id, area, says, items, { answers = {}, min = MIN_SEEN } = {}) {
  const of = items.length;
  if (of < min) return null;
  const follows = items.filter((i) => i.fits).length;
  const share = follows / of;
  const toFix = items.filter((i) => !i.fits).map(({ component, value, prop }) => ({ component, value, ...(prop ? { prop } : {}) }));
  const base = { id, area, says, follows, of, share: Math.round(share * 100) / 100, toFix };
  if (answers[id] === false) return null;
  const by = answers[id] === true ? 'team' : 'majority';
  if (!toFix.length) return { ...base, status: 'rule', by };
  if (by === 'team' || share >= FIX_SHARE) return { ...base, status: 'fix', by };
  return { ...base, status: 'decide', by };
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
  return count / names.length >= AFFIX_SHARE ? word : null;
}

// The variables a component binds, on its frame and on every layer inside it (an instance's are its own component's):
// its frame's from the structure capture, every layer's from the values capture (hygiene.binds: each variable id with
// the properties and layers it is bound on), named by the vars snapshot (variableScopes). A variable from another
// library, which the snapshot does not name, is left out. → { colour: [...], spacing: [...] }
const COLOUR_FIELDS = new Set(['FRAME_FILL', 'SHAPE_FILL', 'TEXT_FILL', 'STROKE_COLOR', 'FILL', 'STROKE', 'COLOR']);
const SPACING_FIELDS = new Set(['GAP', 'CORNER_RADIUS', 'PADDING', 'PADDING_LEFT', 'PADDING_RIGHT', 'PADDING_TOP', 'PADDING_BOTTOM', 'ITEM_SPACING', 'COUNTER_AXIS_SPACING', 'TOP_LEFT_RADIUS', 'TOP_RIGHT_RADIUS', 'BOTTOM_LEFT_RADIUS', 'BOTTOM_RIGHT_RADIUS']);
function boundTokens(s = {}, v = {}, varNames = {}) {
  const colour = new Set(['fill', 'text', 'stroke'].map((k) => s.colors?.[k]?.token).filter(Boolean));
  const spacing = new Set([s.paddingVar?.tb, s.paddingVar?.lr, s.gapVar, s.innerRadiusVar, ...(s.childFrameGaps ?? []).map((g) => g.gapVar)].filter(Boolean));
  for (const [id, where] of Object.entries(v.hygiene?.binds ?? {})) {
    const name = varNames[id]?.name ?? (typeof varNames[id] === 'string' ? varNames[id] : null);
    if (!name) continue;
    for (const field of Object.keys(where ?? {})) {
      if (COLOUR_FIELDS.has(field) || /_FILL$|_COLOR$/.test(field)) colour.add(name);
      else if (SPACING_FIELDS.has(field) || /PADDING|SPACING|RADIUS/.test(field)) spacing.add(name);
    }
  }
  return { colour: [...colour], spacing: [...spacing] };
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

export function grammarOf({ props = {}, structure = {}, values = {}, varNames = {}, skeleton = {} } = {}, { answers = {} } = {}) {
  const names = [...new Set([...Object.keys(props), ...Object.keys(structure)])]
    .filter((n) => !n.startsWith('_') && (props[n]?.properties || structure[n]) && n.trim() && !/\s{2,}|^\s|\s$/.test(n) && !/usage context/i.test(n))
    .sort();
  const components = new Set(names);
  const rules = [];
  const add = (r) => { if (r) rules.push(r); };
  const opts = { answers };

  // Component names.
  // A part's name is its root's and its own (table/Row): each is written in the system's case.
  const segs = (n) => String(n).split('/').map((x) => x.trim()).filter(Boolean);
  const nameCase = dominantCase(names.flatMap(segs));
  add(judge('component-name-case', 'naming', `A component is named in ${nameCase}`, names.map((n) => ({ component: n, value: n, fits: segs(n).every((x) => caseFits(x, nameCase)) })), opts));

  // Each kind of property: how it is written, and the word it begins or ends with.
  // A yes/no is named as one whether Figma makes it a boolean property or a variant of true and false: in code both are
  // the same boolean prop, so they are held to the same rules (byName). The variant's options are still a variant's.
  const byKind = {}, byName = {};
  const yesNoVariant = (d) => d.type === 'VARIANT' && (d.variantOptions ?? []).length === 2 && (d.variantOptions ?? []).every((o) => /^(true|false)$/i.test(o));
  for (const n of names) for (const [key, d] of Object.entries(props[n]?.properties ?? {})) {
    const item = { component: n, value: propName(key), def: d };
    (byKind[d.type] ??= []).push(item);
    (byName[yesNoVariant(d) ? 'BOOLEAN' : d.type] ??= []).push(item);
  }
  for (const [type, list] of Object.entries(byName)) {
    const both = type === 'BOOLEAN' && list.some((i) => i.def.type === 'VARIANT');
    const kind = both ? 'yes/no' : KINDS[type] ?? type.toLowerCase();
    const a = /^[aeiou]/.test(kind) ? 'An' : 'A';
    const id = (KINDS[type] ?? type.toLowerCase()).replace(/ /g, '-');   // the same id whatever it is called, so an answer stays
    const c = dominantCase(list.map((i) => i.value));
    // The word a name begins or ends with is a boolean property's own (showIcon shows a layer): a variant of true and
    // false names a state (disabled, active), and is never told to begin with "show".
    const own = both ? list.filter((i) => i.def.type === 'BOOLEAN') : list, values_ = own.map((i) => i.value), whatOwn = both ? 'A boolean property' : null;
    const what = both ? `${a} ${kind} property (a boolean, or a variant of true and false)` : `${a} ${kind} property`;
    add(judge(`${id}-property-case`, 'naming', `${what} is named in ${c}`, list.map((i) => ({ ...i, fits: caseFits(i.value, c) })), opts));
    const pre = own.length ? affix(values_, 'start') : null, post = own.length ? affix(values_, 'end') : null;
    const cap = (w) => w.replace(/^\w/, (x) => x.toUpperCase());
    if (pre) add(judge(`${id}-property-prefix`, 'naming', `${whatOwn ?? what} begins with "${pre}" (${pre}${cap('thing')})`, own.map((i) => ({ ...i, fits: wordsOf(i.value)[0] === pre && wordsOf(i.value).length > 1 })), opts));
    if (post) add(judge(`${id}-property-suffix`, 'naming', `${whatOwn ?? what} ends with "${cap(post)}" (thing${cap(post)})`, own.map((i) => ({ ...i, fits: wordsOf(i.value).at(-1) === post && wordsOf(i.value).length > 1 })), opts));
  }

  // Variant options: how each is written, and a yes/no axis's two options.
  // A number (style=1) or a placeholder ((Select a preset)) is not written in any case, and is left out.
  const options = (byKind.VARIANT ?? []).flatMap((i) => (i.def.variantOptions ?? []).filter((o) => /[A-Za-z]/.test(o) && !/^\(.*\)$/.test(o)).map((o) => ({ component: i.component, value: `${i.value}=${o}`, option: o, prop: i.value })));
  const optCase = dominantCase(options.map((o) => o.option).filter((o) => !/^(true|false)$/i.test(o)));
  add(judge('variant-option-case', 'naming', `A variant option is written in ${optCase} (${optCase === 'camelCase' ? 'default, inProgress' : 'as most are'})`, options.filter((o) => !/^(true|false)$/i.test(o.option)).map((o) => ({ ...o, fits: caseFits(o.option, optCase) })), opts));
  const yesNo = options.filter((o) => /^(true|false)$/i.test(o.option));
  if (yesNo.length) {
    const lower = yesNo.filter((o) => /^(true|false)$/.test(o.option)).length >= yesNo.length / 2;
    add(judge('variant-boolean-options', 'naming', `A yes/no variant's options are ${lower ? 'true and false' : 'True and False'}`, yesNo.map((o) => ({ ...o, fits: lower ? /^(true|false)$/.test(o.option) : /^(True|False)$/.test(o.option) })), opts));
  }

  // Layers: named by the team, not left with Figma's own names; and written in one case.
  const layers = names.map((n) => ({ n, l: layerNames(n, structure[n], values[n], components) })).filter((x) => x.l.length);
  add(judge('layers-named', 'naming', 'Every layer has a name of its own (never Figma\'s "Frame 235")', layers.map(({ n, l }) => ({ component: n, value: l.filter(isAutoNamed).join(', '), fits: !l.some(isAutoNamed) })), opts));
  const named = layers.flatMap(({ n, l }) => l.filter((x) => !isAutoNamed(x)).map((x) => ({ component: n, value: x })));
  const layerCase = dominantCase(named.map((x) => x.value));
  add(judge('layer-name-case', 'naming', `A layer is named in ${layerCase}`, named.map((x) => ({ ...x, fits: caseFits(x.value, layerCase) })), opts));

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
    const seen = names.map((n) => ({ n, t: boundTokens(structure[n], values[n], varNames)[kind] })).filter((x) => x.t.length);
    if (!seen.length) continue;
    // Two ways a system goes: its components bind the shared variables directly, or variables made for each of them
    // (<prefix>/<component>/…). Which one is the team's to say (answers: 'own' or 'shared'); until then, the way more
    // components go is put to them, with the other beside it.
    const id = `${kind}-variables`;
    const prefixes = seen.flatMap(({ n, t }) => t.map((tok) => ownToken(tok, n)).filter((p) => p !== null));
    const prefix = top(prefixes)[0];
    const template = `${prefix ? prefix + '/' : ''}<component>/…`;
    const shared = seen.flatMap(({ n, t }) => t.filter((tok) => ownToken(tok, n) === null));
    const example = top(shared)[0];
    const isOwn = (n, tok) => ownToken(tok, n) !== null;
    const byWay = (way) => seen.map(({ n, t }) => { const off = t.filter((tok) => (way === 'own' ? !isOwn(n, tok) : isOwn(n, tok))); return { component: n, value: off.join(', '), fits: !off.length }; });
    const SAYS = {
      own: `A component's ${label} use variables made for it (${template}), never the shared ones directly`,
      shared: `A component's ${label} use the system's shared variables directly${example ? ` (${example})` : ''}, never variables made for it`,
    };
    const said = answers[id] === 'own' || answers[id] === 'shared' ? answers[id] : null;
    const way = said ?? (byWay('own').filter((x) => x.fits).length > byWay('shared').filter((x) => x.fits).length ? 'own' : 'shared');
    const other = way === 'own' ? 'shared' : 'own';
    const r = judge(id, 'variables', SAYS[way], byWay(way), { ...opts, answers: { ...answers, [id]: said ? true : answers[id] } });
    // Which way is the system's architecture, never the engine's guess: until the team says, it is to decide.
    if (r && !said && r.status === 'fix') r.status = 'decide';
    if (r) { r.way = way; r.template = template; r.ways = [way, other].map((w) => ({ way: w, says: SAYS[w], follows: byWay(w).filter((x) => x.fits).length })); add(r); }
  }

  // Where a component's padding sits: on its own frame, or on a layer inside it (a Content frame), as most do.
  const padded = (p) => Array.isArray(p) && p.some((x) => x > 0);
  const padWhere = names.map((n) => {
    const st = structure[n] ?? {};
    const own = !!(st.paddingVar?.tb || st.paddingVar?.lr) || padded(st.paddingPx), inside = (st.childFramePadding ?? []).length > 0;
    return own || inside ? { component: n, where: own ? 'frame' : 'inside', inner: (st.childFramePadding ?? []).map((x) => x.name).filter(Boolean) } : null;
  }).filter(Boolean);
  const padWay = top(padWhere.map((x) => x.where))[0];
  add(judge('padding-where', 'layout', padWay === 'inside' ? 'A component\'s padding sits on a layer inside it (a Content frame), not on its own frame' : 'A component\'s padding sits on its own frame, not on a layer inside it',
    padWhere.map((x) => ({ component: x.component, value: x.where === 'frame' ? 'its own frame' : x.inner.join(', ') || 'a layer inside it', fits: x.where === padWay })), opts));

  // A yes/no variant changes how the component looks. One whose two variants differ only in layers shown or hidden
  // (the same fill, stroke, text, padding, gap and corners, one holding the other's layers and more) is a boolean
  // property in all but name: a boolean on that layer does it, with half the variants. A layer swapped for another (a
  // value in place of a placeholder) or a style that changes with it keeps it a variant.
  const axesOf = (v) => Object.fromEntries(String(v).split(',').map((x) => x.trim().split('=')).filter((x) => x.length === 2).map(([k, v2]) => [k.trim(), v2.trim()]));
  const sameStyle = (a, b) => ['paddingPx', 'gapPx', 'radiusPx', 'fontSize', 'colors'].every((k) => JSON.stringify(a?.[k] ?? null) === JSON.stringify(b?.[k] ?? null));
  const shows = (byKind.VARIANT ?? []).filter((i) => yesNoVariant(i.def)).map((i) => {
    const vs = Object.entries(structure[i.component]?.variants ?? {});
    const pairs = [];
    for (const [tn, t] of vs) {
      const ta = axesOf(tn);
      if (String(ta[i.value] ?? '').toLowerCase() !== 'true') continue;
      const f = vs.find(([fn]) => { const fa = axesOf(fn); return String(fa[i.value] ?? '').toLowerCase() === 'false' && Object.entries(ta).every(([k, v]) => k === i.value || fa[k] === v); });
      if (f) pairs.push([t, f[1]]);
    }
    if (!pairs.length) return null;
    const layersShown = new Set();
    const only = pairs.every(([t, f]) => {
      const lt = new Set(t.layers ?? []), lf = new Set(f.layers ?? []);
      const sub = (a, b) => [...a].every((x) => b.has(x));
      const grows = (lt.size !== lf.size && (sub(lt, lf) || sub(lf, lt))) || (lt.size === lf.size && sub(lt, lf) && t.inFlow !== f.inFlow);
      for (const x of lt) if (!lf.has(x)) layersShown.add(x);
      for (const x of lf) if (!lt.has(x)) layersShown.add(x);
      return grows && sameStyle(t, f);
    });
    const shown = [...layersShown].slice(0, 3);
    return { component: i.component, prop: i.value, value: `${i.value}: ${only ? (shown.length ? shown.join(', ') : 'a layer') + (layersShown.size > 3 ? '…' : '') : 'restyles it'}`, fits: !only };
  }).filter(Boolean);
  add(judge('yes-no-variant-restyles', 'wiring', 'A yes/no variant changes how the component looks; one that only shows or hides layers is a boolean property', shows, opts));

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

  // How each component is built inside: its layers, wiring, nesting, styles, placement, and each family's shape.
  const arch = architecture(skeleton, props, add, opts);

  const questions = rules.filter((r) => r.status === 'decide').map((r) => ({ id: r.id, ask: `${r.says}? ${r.follows} of ${r.of} do. Is it the rule? If it is, ${r.toFix.length} ${r.toFix.length === 1 ? 'is' : 'are'} to fix.` }));
  return { figma: { components: names.length, rules, vocabulary: { variantAxes }, families: arch.families }, questions };
}

// The rules the team decided (answered yes, or chose the way for the variables a component binds) and what breaks each:
// what a run fails on, beside the gates (a gate compares Figma with the code; this is Figma beside its own rules).
// → { decided: [rule], broken: [rule] }
export function decidedRules(g) {
  const decided = (g?.figma?.rules ?? []).filter((r) => r.by === 'team');
  return { decided, broken: decided.filter((r) => r.toFix.length) };
}
// The run's summary lines for it: none until the team decided a rule. → [line]
export function constructionLines(g, { max = 6 } = {}) {
  const { decided, broken } = decidedRules(g);
  if (!decided.length) return [];
  if (!broken.length) return [`**Construction.** The ${decided.length === 1 ? 'rule' : `${decided.length} rules`} the team decided ${decided.length === 1 ? 'is' : 'are'} followed by every component.`];
  const n = new Set(broken.flatMap((r) => r.toFix.map((x) => x.component))).size;
  return [`**Construction.** ${broken.length} of the ${decided.length} rules the team decided ${broken.length === 1 ? 'is' : 'are'} broken, by ${n} component${n === 1 ? '' : 's'}:`,
    ...broken.slice(0, max).map((r) => { const c = [...new Set(r.toFix.map((x) => x.component))]; return `- ${r.says}: ${c.slice(0, 4).join(', ')}${c.length > 4 ? ` and ${c.length - 4} more` : ''}`; }),
    ...(broken.length > max ? [`- and ${broken.length - max} more`] : []),
    'Each one\'s fix is on the style guide\'s Construction page (rms-design-system-engine --figma-fix <component> writes the renames).'];
}

// The grammar in a few lines: each rule with how many follow it, then the axes most used.
export function grammarLines(g, { axes = 8, options = 6 } = {}) {
  const f = g?.figma;
  if (!f?.rules?.length) return [];
  const lines = [`How this system builds a component in Figma (from its ${f.components} components). A new or changed component follows each line; one still to decide, as the component it is like does:`];
  const fix = (r) => `${r.toFix.length} to fix`;
  for (const r of f.rules) lines.push(`- ${r.says}: ${r.status === 'rule' ? `the rule, every component follows it` : r.status === 'fix' ? `${r.follows} of ${r.of} follow it, ${fix(r)}${r.by === 'team' ? ' (the team\'s rule)' : ''}` : `${r.follows} of ${r.of} follow it; the team decides whether it is the rule (then ${fix(r)})`}.`);
  const va = f.vocabulary?.variantAxes ?? [];
  if (va.length) lines.push(`- Variant axes it already uses: ${va.slice(0, axes).map((a) => `${a.name} (${a.options.slice(0, options).join(' | ')}${a.options.length > options ? ' …' : ''})`).join('; ')}.`);
  return lines;
}

// camelCase of a name: Show Hint Text, ShowHintText, ↳ expanded → showHintText, expanded.
export const camelOf = (s) => String(s ?? '').replace(/^\u21b3\s*/, '').split(/[\s_-]+/).filter(Boolean).map((w, i) => (i ? w[0].toUpperCase() : w[0].toLowerCase()) + w.slice(1)).join('');
const casedAs = (s, rule) => (/camel/i.test(rule) ? camelOf(s) : /pascal/i.test(rule) ? camelOf(s).replace(/^\w/, (c) => c.toUpperCase()) : /kebab/i.test(rule) ? wordsOf(s).join('-') : /snake/i.test(rule) ? wordsOf(s).join('_') : /title/i.test(rule) ? wordsOf(s).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ') : s);
const caseIn = (says) => (says.match(/in (camelCase|PascalCase|kebab-case|snake_case|Title Case)/) ?? [])[1] ?? 'camelCase';

export function fixOf(rule, e) {
  const v = String(e?.value ?? ''), id = rule?.id ?? '', says = rule?.says ?? '';
  const word = (says.match(/"(\w+)"/) ?? [])[1] ?? '';
  const cap = (w) => w.replace(/^\w/, (c) => c.toUpperCase());
  if (id === 'component-name-case') { const to = v.split('/').map((x) => casedAs(x, caseIn(says))).join('/'); return { what: 'component', from: v, to, say: `Rename the component to ${to}` }; }
  if (/-property-case$/.test(id)) { const to = casedAs(v, caseIn(says)); return { what: 'property', from: v, to, say: `Rename the property ${v} to ${to}` }; }
  if (/-property-prefix$/.test(id)) { const to = word + cap(camelOf(v)); return { what: 'property', from: v, to, say: `Rename the property ${v} to ${to}, if it shows or hides a layer; otherwise make it a variant` }; }
  if (/-property-suffix$/.test(id)) { const to = camelOf(v).replace(new RegExp(`${word}$`, 'i'), '') + cap(word); return { what: 'property', from: v, to, say: `Rename the property ${v} to ${to}` }; }
  if (id === 'variant-option-case' || id === 'variant-boolean-options') {
    const [prop, opt] = [v.slice(0, v.indexOf('=')), v.slice(v.indexOf('=') + 1)];
    const to = id === 'variant-option-case' ? casedAs(opt, caseIn(says)) : /true and false/.test(says) ? opt.toLowerCase() : cap(opt.toLowerCase());
    return { what: 'option', prop, from: opt, to, say: `Rename the option ${opt} of ${prop} to ${to}` };
  }
  if (id === 'layer-name-case') { const to = casedAs(v, caseIn(says)); return { what: 'layer', from: v, to, say: `Rename the layer ${v} to ${to}` }; }
  if (id === 'layers-named') return { what: null, say: `Name ${v} after what ${v.includes(',') ? 'each holds' : 'it holds'}`, layers: v.split(', ') };
  if (id === 'auto-layout') return { what: null, say: `Lay out ${v} with auto layout` };
  if (/-variables$/.test(id)) return { what: null, say: rule.way === 'own' ? `It binds ${v} directly: bind a variable made for it (${rule.template ?? '<component>/…'}) that points at it instead` : `It binds ${v}, a variable made for it: bind the shared variable it points at instead` };
  if (id === 'description') return { what: null, say: 'Write its description in Figma' };
  if (id === 'padding-where') return { what: null, say: `Its padding is on ${v}: ${/inside it \(/.test(says) ? 'move it to a layer inside it' : 'move it to its own frame'}` };
  if (id === 'layer-order') return { what: null, say: `Its layers are in this order: ${v}. Put them in the system's order` };
  if (id === 'family-page') return { what: null, say: `It is ${v}: move it to its family's page` };
  if (id === 'yes-no-variant-restyles') { const at = v.indexOf(': '), prop = e?.prop ?? v.slice(0, at), shown = v.slice(at + 2); return { what: null, say: `${prop} only shows or hides ${shown}: make that a boolean property on the layer, and remove the ${prop} variant` }; }
  const ARCH = {
    'text-styles': `Give ${v} a text style`,
    'effect-styles': `Give the shadow on ${v} an effect style`,
    'hidden-layers-wired': `Wire ${v} to a boolean property that shows it, or delete it`,
    'properties-wired': `Wire the property ${v} to the layer it should drive, or delete it`,
    'icons-are-instances': `Replace ${v} with an instance of the icon component`,
    'no-absolute-layers': `Put ${v} back in the auto layout flow`,
    'nested-from-this-file': `Swap ${v} for this file's own component`,
    'variables-from-this-file': `Bind this file's variables instead of ${v}`,
    'no-pinned-modes': `Remove the pinned mode (${v})`,
    'variants-one-structure': `Give every variant the same layers (${v} now); show or hide what differs with a property`,
    'states-interactive': 'Add the prototype reactions: on hover change to the hover variant, on press to the pressed one',
    'swaps-preferred': `List the components ${v} takes (its preferred values)`,
    'in-a-section': 'Move it into a section of its page',
    'links-to-code': 'Add a dev resource that links to its code',
  };
  if (ARCH[id]) return { what: null, say: ARCH[id] };
  if (id.startsWith('family-')) return { what: null, say: `Rebuild it as the family is built (${says.replace(/^A \w+ is built as /, '')}); now ${v}` };
  return { what: null, say: v };
}

// ── Architecture: how each component is built inside, from the skeleton (figma-skeleton.snapshot.json, skeletonOf) ──
// Every layer of every variant tree, walked; an instance's own layers are its component's, never walked.
function layersOf(tree, out = [], path = '') {
  for (const c of tree?.c ?? []) { const at = path ? `${path}/${c.n}` : c.n; out.push({ ...c, at }); if (c.t !== 'INSTANCE') layersOf(c, out, at); }
  return out;
}
// A component's family: the first word of its name (button for buttonPrimary, card for card/Row).
export const familyOf = (name) => wordsOf(String(name).split('/')[0])[0] ?? String(name);
// A tree's shape in a few words: its root's layout and what it holds, in order (an instance by its component).
// generic: each nested component as "a component" (so a family compares how it is built, not which pieces it holds), and
// no sizing (a full-width variant is the same construction).
export function shapeOf(tree, { generic = false } = {}) {
  const l = tree?.layout;
  const dir = l ? `${l.dir === 'VERTICAL' ? 'vertical' : l.dir === 'HORIZONTAL' ? 'horizontal' : String(l.dir).toLowerCase()} auto layout` : 'no auto layout';
  const root = l && !generic ? `${dir}, ${String(l.w ?? 'fixed').toLowerCase()} × ${String(l.h ?? 'fixed').toLowerCase()}` : dir;
  const kids = (tree?.c ?? []).filter((c) => !c.hidden || c.wired?.visible).map((c) => (c.t === 'INSTANCE' ? (generic ? 'a component' : c.of?.name ? `${c.of.name}` : 'instance') : c.t === 'TEXT' ? 'text' : c.t === 'SLOT' ? 'slot' : /^(RECTANGLE|ELLIPSE|VECTOR|LINE|POLYGON|STAR|BOOLEAN_OPERATION)$/.test(c.t) && generic ? 'shape' : c.t.toLowerCase()) + (c.wired?.visible ? '?' : '') + (c.absolute ? ' (absolute)' : ''));
  return `${root}: ${kids.length ? kids.join(' → ') : 'nothing inside'}`;
}

function architecture(skeleton, props, add, opts) {
  const names = Object.keys(skeleton).filter((n) => !n.startsWith('_') && skeleton[n]?.trees?.length).sort();
  if (!names.length) return { families: [] };
  // A component's resting variant: the one its axes name default or rest (state=default), else its first.
  const REST = /=(default|rest|enabled|idle|off|false)\b/i;
  const sk = (n) => skeleton[n];
  const resting = (n) => { const v = sk(n).variants ?? []; const at = v.find(([vn]) => String(vn).split(/,\s*/).every((p) => !p.includes('=') || REST.test(p) || !/state/i.test(p)) && REST.test(vn)) ?? v[0]; return sk(n).trees[at?.[1] ?? 0]; };
  // A tree's structure alone: each layer's type and name, and what it holds; no value, size or visibility.
  const structure = (t) => JSON.stringify([t.t, t.n, (t.c ?? []).map(structure)]);
  const all = (n) => sk(n).trees.flatMap((t) => layersOf(t));
  const item = (component, off) => ({ component, value: [...new Set(off)].join(', '), fits: !off.length });
  const judgeAll = (id, area, says, items) => add(judge(id, area, says, items, opts));

  // Text: every text layer uses a text style.
  judgeAll('text-styles', 'styles', 'Every text layer uses a text style', names.filter((n) => all(n).some((l) => l.t === 'TEXT')).map((n) => item(n, all(n).filter((l) => l.t === 'TEXT' && !l.styles?.text).map((l) => l.at))));
  // Shadows: every layer with a shadow or blur uses an effect style.
  judgeAll('effect-styles', 'styles', 'Every shadow or blur uses an effect style', names.filter((n) => all(n).some((l) => l.effects) || sk(n).trees.some((t) => t.effects)).map((n) => item(n, all(n).filter((l) => l.effects && !l.styles?.effect).map((l) => l.at))));
  // Hidden layers: one hidden is shown by a property, never left hidden for nothing.
  judgeAll('hidden-layers-wired', 'wiring', 'A hidden layer is shown by a property, never left hidden for nothing', names.map((n) => item(n, all(n).filter((l) => l.hidden && !l.wired?.visible).map((l) => l.at))));
  // Properties: each boolean, text and swap property drives a layer.
  const WIRE = { BOOLEAN: 'visible', TEXT: 'characters', INSTANCE_SWAP: 'mainComponent' };
  judgeAll('properties-wired', 'wiring', 'Every boolean, text and swap property drives a layer', names.filter((n) => props[n]?.properties).map((n) => {
    const used = new Set(all(n).flatMap((l) => Object.entries(l.wired ?? {}).map(([k, v]) => `${k}:${v}`)));
    const off = Object.entries(props[n].properties).filter(([, d]) => WIRE[d.type]).map(([k, d]) => [k.replace(/#[^#]*$/, ''), WIRE[d.type]]).filter(([k, w]) => !used.has(`${w}:${k}`)).map(([k]) => k);
    return item(n, off);
  }));
  // Icons: instances of the system's icon components, never vectors drawn inside a component.
  judgeAll('icons-are-instances', 'nesting', 'An icon inside a component is an instance of an icon component, never a vector drawn in it', names.filter((n) => !/^icon/i.test(n)).map((n) => item(n, all(n).filter((l) => /^(VECTOR|BOOLEAN_OPERATION|STAR|POLYGON)$/.test(l.t)).map((l) => l.at))));
  // Absolute layers: the flow of auto layout, or not.
  judgeAll('no-absolute-layers', 'layout', 'Layers stay in the auto layout flow, never placed absolutely', names.map((n) => item(n, all(n).filter((l) => l.absolute).map((l) => l.at))));
  // Libraries: nested components and variables from this file, or from another library.
  judgeAll('nested-from-this-file', 'nesting', 'The components nested inside come from this file, never another library', names.filter((n) => all(n).some((l) => l.t === 'INSTANCE')).map((n) => item(n, all(n).filter((l) => l.of?.library).map((l) => l.of.name))));
  judgeAll('variables-from-this-file', 'variables', 'The variables a component binds come from this file, never another library', names.map((n) => item(n, (sk(n).library ?? []).map((v) => v.name))));
  // Modes: a component follows the mode it is placed in, never pins one.
  judgeAll('no-pinned-modes', 'variables', 'A component follows the variable mode it is placed in, never pins one of its own', names.map((n) => item(n, all(n).concat(sk(n).trees).filter((l) => l.modes).flatMap((l) => Object.entries(l.modes).map(([c, m]) => `${c}: ${m}`)))));
  // Variants: one structure, only values change.
  judgeAll('variants-one-structure', 'layers', 'A component\'s variants share one layer structure; only values and visibility change between them', names.filter((n) => (sk(n).variants ?? []).length > 1).map((n) => {
    const kinds = new Set(sk(n).variants.map(([, i]) => structure({ ...sk(n).trees[i], n: '' })));
    return item(n, kinds.size > 1 ? [`${kinds.size} structures across ${sk(n).variants.length} variants`] : []);
  }));
  // Interactions: a hover or pressed state is reached on hover or press.
  const STATE = /\b(hover|pressed|press)\b/i;
  judgeAll('states-interactive', 'interactions', 'A component with a hover or pressed state changes to it on hover or press (an interactive component)', names.filter((n) => (sk(n).variants ?? []).some(([vn]) => STATE.test(vn))).map((n) => item(n, Object.keys(sk(n).reactions ?? {}).length ? [] : ['no reaction'])));
  // Swaps: each swap property says which components it takes.
  judgeAll('swaps-preferred', 'nesting', 'Every swap property lists the components it takes (preferred values)', names.filter((n) => Object.values(sk(n).swaps ?? {}).some((s) => s.type === 'INSTANCE_SWAP')).map((n) => item(n, Object.entries(sk(n).swaps).filter(([, s]) => s.type === 'INSTANCE_SWAP' && !(s.preferred ?? []).length).map(([k]) => k))));
  // Placement: in a section of its page.
  judgeAll('in-a-section', 'placement', 'A component sits in a section of its page', names.map((n) => item(n, sk(n).section ? [] : [sk(n).page ? `on ${sk(n).page}` : 'no section'])));
  // Code: a link to its code (a dev resource).
  judgeAll('links-to-code', 'code', 'A component links to its code (a dev resource)', names.map((n) => item(n, (sk(n).dev ?? []).length ? [] : ['no link'])));

  // Its layers' order: the layers its resting variant's frame holds, in the order most components hold them
  // (Background, then Content), for the names seen on enough components to have one; a nested component's own name is
  // its component's, and is left out.
  const own = new Set(Object.keys(props));
  const rootsOf = (n) => (resting(n)?.c ?? []).filter((c) => c.t !== 'INSTANCE' && !own.has(c.n)).map((c) => c.n);
  const seenAt = new Map();
  for (const n of names) for (const l of new Set(rootsOf(n))) seenAt.set(l, (seenAt.get(l) ?? 0) + 1);
  const roles = [...seenAt].filter(([, c]) => c >= MIN_SEEN).map(([l]) => l);
  const before = (a, b) => names.filter((n) => { const r = rootsOf(n); return r.includes(a) && r.includes(b) && r.indexOf(a) < r.indexOf(b); }).length;
  const order = roles.slice().sort((a, b) => before(b, a) - before(a, b) || a.localeCompare(b));
  if (order.length >= 2) judgeAll('layer-order', 'layers', `A component's layers come in one order: ${order.join(', ')}`, names.map((n) => { const r = rootsOf(n).filter((l) => order.includes(l)); return r.length >= 2 ? { component: n, value: r.join(', '), fits: r.every((l, i) => !i || order.indexOf(r[i - 1]) < order.indexOf(l)) } : null; }).filter(Boolean));
  // Its page: the one its family is on, as most of the family are (a family of one is beside nothing).
  const famOf = {};
  for (const n of names) if (sk(n).page) (famOf[familyOf(n)] ??= []).push(n);
  judgeAll('family-page', 'placement', 'A component sits on the page its family is on', Object.entries(famOf).filter(([, l]) => l.length >= 2).flatMap(([f, l]) => {
    const page = top(l.map((n) => sk(n).page))[0];
    return l.map((n) => ({ component: n, value: `on ${sk(n).page}, where its family (${f}…) is on ${page}`, fits: sk(n).page === page }));
  }));

  // Each family of three or more: the shape most of its components are built in.
  const fam = {};
  for (const n of names) (fam[familyOf(n)] ??= []).push(n);
  const families = [];
  for (const [f, list] of Object.entries(fam).filter(([, l]) => l.length >= MIN_SEEN).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))) {
    const shapes = list.map((n) => [n, shapeOf(resting(n), { generic: true })]);
    const [shape, count] = top(shapes.map((s) => s[1]));
    const depth = (t, d = 0) => Math.max(d, ...(t?.c ?? []).filter((c) => c.t !== 'INSTANCE').map((c) => depth(c, d + 1)));
    const a = /^[aeiou]/i.test(f) ? 'An' : 'A';
    families.push({ family: f, components: list.length, shape, follow: count, depths: list.map((n) => depth(resting(n))), shapes: Object.entries(shapes.reduce((m, [, s]) => ({ ...m, [s]: (m[s] ?? 0) + 1 }), {})).sort((x, y) => y[1] - x[1]).slice(0, 4) });
    judgeAll(`family-${f}`, 'architecture', `${a} ${f} is built as ${shape}`, shapes.map(([n, s]) => ({ component: n, value: s, fits: s === shape })));
  }
  return { families };
}

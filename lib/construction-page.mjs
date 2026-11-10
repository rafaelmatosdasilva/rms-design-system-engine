// construction-page.mjs - the Rules page's two sides: how the system is built in Figma and in the code, and
// every place that breaks it, each with who fixes it.
//
// The rules the system builds a component by in Figma are mined by construction-grammar.mjs. Beside them, as rules of
// the same shape (id, area, says, follows, of, toFix, status), this adds what is already found elsewhere and was read
// nowhere together:
//   • in Figma, the file's own hygiene (figma-hygiene.mjs): values with no variable or style, instances detached from
//     their component, an instance's layer named unlike its component, a property bound outside its variable's scope,
//     variables left on all scopes. Auto layout and descriptions are the grammar's own rules already, so not twice;
//   • in the code, what the code linting finds: values written by hand (raw-census.mjs), the Status page's code rows
//     (an alias to a token declared nowhere, a font family written by hand), the gates of the comparison that lint the
//     code (their records in findings.json) and a product's near copy of a component.
// Every one is a rule of the system, never a question: none of these is a choice a team makes the other way. Each says
// who fixes it (side and who, as the Status page's To do says it: figma, code, both). The engine changes no code
// people wrote: the code's fix is a patch handed back, as everywhere else.
// Pure: the caller reads the files.
import { hygieneFindings } from './figma-hygiene.mjs';
import { familiesOf, familyFindings } from './family-consistency.mjs';
import { namedByLook, tokenNames } from './system-advice.mjs';
import { layerPlacement } from './layer-placement.mjs';
import { brandLayering } from './brand-layers.mjs';

// One rule from the components (or places) read and the ones that break it: to fix while any does, a rule otherwise.
// of: how many were read, or null when only the breaks are known (the code's places), and then no share is said.
function rule(id, area, says, toFix, { of = null, broken = null, side, who, todo }) {
  broken = broken ?? new Set(toFix.map((t) => t.component ?? t.where)).size;
  return { id, area, says, side, who, todo, kind: 'break', status: toFix.length ? 'fix' : 'rule', toFix,
    ...(of != null ? { of, follows: Math.max(0, of - broken) } : {}) };
}

// In Figma: the hygiene findings as rules, over the components whose record the sweep wrote.
// values: component-values.snapshot.json; scopes: the vars snapshot's variableScopes.
export function figmaRules(values = {}, scopes = null) {
  const read = Object.entries(values ?? {}).filter(([n, v]) => !n.startsWith('_') && v && v.hygiene).length;
  if (!read) return [];
  const found = hygieneFindings(values, { scopes });
  const of = (kind) => found.filter((f) => f.kind === kind && f.component).map((f) => ({ component: f.component, value: f.text }));
  const side = 'figma', who = 'figma';
  const out = [
    rule('figma-values-bound', 'variables', 'Every colour, radius, padding, gap and text is bound to a variable or a style', of('raw'), { of: read, side, who, todo: 'Bind each value to the variable or style the system has for it, in Figma.' }),
    rule('figma-not-detached', 'nesting', 'An instance stays attached to its component', of('detached'), { of: read, side, who, todo: 'Swap each detached frame back for an instance of its component, in Figma.' }),
    rule('figma-instance-named', 'naming', 'An instance\'s layer is named as its component, or after its role', of('renamed'), { of: read, side, who, todo: 'Name each layer as its component, or after its role, in Figma.' }),
  ];
  if (scopes) out.push(rule('figma-variable-scope', 'variables', 'A property is bound to a variable scoped for it', of('scope'), { of: read, side, who, todo: 'Bind a variable scoped to that property, or add the scope to the variable, in Figma.' }));
  if (scopes) {
    const vars = Object.values(scopes).filter((v) => v && Array.isArray(v.scopes));
    const all = vars.filter((v) => v.scopes.includes('ALL_SCOPES')).map((v) => ({ component: null, where: v.name, value: 'offered for every property (all scopes)' }));
    if (vars.length) out.push(rule('figma-scoped-variables', 'variables', 'Each variable is scoped to the properties it is for, and a primitive to none', all, { of: vars.length, side, who, todo: 'Scope each variable to the properties it is for, and each primitive to none, in Figma.' }));
  }
  return out;
}

// In Figma, the components of one type compared with each other (family-consistency.mjs): a state set one way on most
// and another on a few, one thing called two names, a property most of them have and one lacks (to check: a component
// may leave it out on purpose, so that one is to decide). props: the props snapshot.
export function familyRules(props = {}) {
  const fams = familiesOf(props);
  if (!fams.length) return [];
  const of = fams.reduce((n, f) => n + f.list.length, 0);
  const found = familyFindings(props);
  const items = (kind) => found.filter((f) => f.kind === kind).map((f) => ({ component: f.component, value: `${f.name}: ${f.why}; ${f.want}` }));
  const side = 'figma';
  const has = rule('family-has', 'architecture', 'A component has what most of its family has', items('missing'), { of, side, who: 'both', todo: 'Check each: add what the family has, or keep it out on purpose.' });
  return [
    rule('family-states', 'architecture', 'A family sets each state one way: a property of its own, or an option of State, as most of it does', items('shape'), { of, side, who: 'figma', todo: 'Set each state as most of the family does, in Figma.' }),
    rule('family-names', 'naming', 'One thing has one name across a family', items('name'), { of, side, who: 'figma', todo: 'Rename each property to the name most of the family uses, in Figma.' }),
    has.toFix.length ? { ...has, status: 'decide' } : has,
  ];
}

// The tokens: how they are named, layered and used, as the system-health advice and the token checks already read
// them. vars: the vars snapshot; todos: the Status page's system rows; brands: the brands snapshot or null; jobs: the
// last audit's token-jobs.json; primitivePrefix.
export function tokenRules({ vars = null, todos = [], brands = null, jobs = null, primitivePrefix = 'primitives/' } = {}) {
  const out = [], side = 'figma';
  const names = vars ? tokenNames(vars) : [];
  const said = (kind, who) => todos.filter((t) => t.kind === kind && (!who || t.who === who)).map((t) => ({ component: null, where: 'The tokens', value: t.say }));
  const fromTodo = (kind, id, area, says, who, { decide = false, onlyWho = null } = {}) => {
    const it = said(kind, onlyWho);
    if (!it.length && !names.length) return;
    // What the check read and how many broke it, when it says so: the rule then reads 207 of 207 (100%) rather than
    // a phrase standing in for a number it never had.
    const t = todos.find((x) => x.kind === kind && (!onlyWho || x.who === onlyWho));
    const r = rule(id, area, says, it, { side, who, todo: t?.todo ?? '', ...(t?.of != null ? { of: t.of, broken: t.n ?? it.length } : {}) });
    out.push(decide && it.length ? { ...r, status: 'decide' } : r);
  };
  if (names.length) {
    const semantic = names.filter((n) => !n.startsWith(primitivePrefix));
    out.push(rule('tokens-named-by-role', 'naming', 'A semantic token is named for its role, never its look (blue-500)', namedByLook(names, { primitivePrefix }).map((x) => ({ component: null, where: x.name, value: `named by its look ("${x.word}")` })), { of: semantic.length, side, who: 'figma', todo: 'Rename each one in Figma to the role it plays.' }));
  }
  fromTodo('Brand in the name', 'tokens-no-brand', 'naming', 'A token is named for its role, never after a product or brand', 'figma');
  fromTodo('Description', 'tokens-described', 'documentation', 'Every shared token says in Figma what it is for', 'figma');
  fromTodo('Broken alias', 'tokens-aliases', 'tokens', 'Every alias in Figma points at a variable that is in the file', 'figma', { onlyWho: 'figma' });
  fromTodo('Same value', 'tokens-one-primitive', 'tokens', 'A value written by hand is held once, by one primitive the others point at', 'both', { decide: true });
  if (vars) {
    const lp = layerPlacement(vars);
    if (lp.length || (vars.color && Object.keys(vars.color).length > 1)) {
      const it = lp.flatMap((c) => c.still.map((f) => ({ component: null, where: `${c.collection}, ${f.family}`, value: `${f.count} token${f.count === 1 ? ' is' : 's are'} defined the same in every mode (${f.examples.join(', ')})` })));
      const r = rule('tokens-first-layer', 'tokens', 'A token sits in the first layer where its value can change: one the same in every mode lives in a layer without modes', it, { of: lp[0]?.total ?? null, side, who: 'both', todo: 'Decide for each family: move it to a layer without modes that aliases this one, or keep it here on purpose.' });
      out.push(it.length ? { ...r, status: 'decide', follows: lp[0].total - lp[0].count } : r);
    }
  }
  if (brands) {
    const rows = brandLayering(brands).filter((b) => b.parent);
    if (rows.length) {
      const it = rows.flatMap((b) => b.same.map((s) => ({ component: null, where: `${b.brand} (over ${b.parent})`, value: `sets ${s.variable} in ${s.mode} as it already inherits it` })));
      const r = rule('brands-inherit', 'tokens', 'A brand sets only what it changes from the brand it extends', it, { of: rows.length, side, who: 'both', todo: 'Keep each value the brand must hold; remove the rest, so it follows the brand it extends.' });
      out.push(it.length ? { ...r, status: 'decide' } : r);
    }
  }
  if (Array.isArray(jobs) && jobs.length) {
    out.push(rule('tokens-control-border', 'tokens', 'A border token a control uses reaches 3:1 against what it sits on', jobs.filter((j) => j.low?.length).map((j) => ({ component: null, where: j.var, value: `under 3:1 on ${j.low.map((x) => x.name).join(', ')}` })), { of: jobs.length, side, who: 'figma', todo: 'Give each control a border colour that reaches 3:1, in Figma.' }));
    const two = jobs.filter((j) => j.others?.length).map((j) => ({ component: null, where: j.var, value: `a control's edge and decorative on ${j.others.join(', ')}` }));
    const r = rule('tokens-one-job', 'tokens', 'A border token does one job: a control\'s edge, or decoration', two, { of: jobs.length, side, who: 'both', todo: 'Decide for each: give controls a border token of their own, or keep one token on purpose.' });
    out.push(two.length ? { ...r, status: 'decide' } : r);
  }
  return out;
}

// The gates of the comparison that lint the code, by the check name their records carry (findings.json), with the
// rule each says in plain words when the record has none.
const CODE_GATES = [
  ['Tokens used in screens exist in CSS', 'code-bound-tokens-exist', 'variables', 'Every token a screen binds in Figma has its CSS variable', 'Declare each token as a CSS variable, as the theme declares the others.'],
  ['Every mode is covered', 'code-modes-covered', 'variables', 'Every token adapts in every mode the system has', 'Give each token its value in each mode it lacks.'],
  ['No invented CSS variables', 'code-variables-traced', 'variables', 'Every CSS variable traces back to a Figma token', 'Name each variable after the Figma token it carries, or remove it.'],
  ['No invented text casing', 'code-text-casing', 'styles', 'Text is cased only as the system defines', 'Remove each text-transform the system does not define.'],
  ['No hand-built DS components', 'code-no-hand-built', 'architecture', 'A screen uses the system\'s component, never a look-alike built by hand', 'Use the system\'s component in place of each one built by hand.'],
  ['Clean CSS', 'code-clean-css', 'styles', 'No unused variable, no value that contradicts Figma', 'Remove each unused variable, and write each value as Figma states it.'],
];
// In the code. census: raw-census.mjs censusOf; records: findings.json's findings; todos: the Status page's system
// rows (only the code's own: who "code"); copies: [{ component, product, file, line, cls, same, of }].
export function codeRules({ census = null, records = null, todos = [], copies = [] } = {}) {
  const side = 'code', who = 'code', out = [];
  if (census) {
    const places = (census.files ?? []).flatMap((f) => (f.findings ?? []).filter((x) => x.level === 'error').map((x) => ({ component: null, where: `${f.file}:${x.line}`, value: x.text })));
    out.push(rule('code-values-tokens', 'variables', 'Every colour, spacing, radius and font size the system names is written with its token', places, { side, who, todo: 'Write each value with the token named beside it.' }));
  }
  const alias = todos.filter((t) => t.who === 'code' && t.kind === 'Broken alias');
  if (alias.length) out.push(rule('code-aliases', 'variables', 'Every alias in the code points at a token that exists', alias.map((t) => ({ component: null, where: 'The system', value: t.say })), { side, who, todo: alias[0].todo }));
  const fonts = todos.filter((t) => t.who === 'code' && t.kind === 'Font written by hand');
  const combos = todos.filter((t) => t.who === 'code' && t.kind === 'Modes together');
  if (combos.length) out.push(rule('code-modes-together', 'variables', 'Every combination of modes draws right, not only each mode alone', combos.map((t) => ({ component: t.component ?? null, where: t.component ? null : 'The system', value: t.say })), { side, who, todo: combos[0].todo }));
  if (fonts.length) out.push(rule('code-font-family', 'styles', 'A font family is written with the system\'s family variable', fonts.map((t) => ({ component: null, where: 'The system', value: t.say })), { side, who, todo: fonts[0].todo }));
  if (records) for (const [check, id, area, says, todo] of CODE_GATES) {
    const mine = records.filter((r) => r.check === check);
    out.push(rule(id, area, mine.find((r) => r.rule)?.rule ?? says, mine.map((r) => ({ component: r.component ?? null, where: r.component ? null : (r.product ?? 'The system'), value: r.evidence })), { side, who, todo }));
  }
  if (copies.length) {
    const r = rule('code-near-copies', 'products', 'A product uses the system\'s component, never a near copy of it', copies.map((x) => ({ component: x.component, where: `${x.product}, ${x.file}:${x.line}`, value: `${x.product}'s .${x.cls} is nearly ${x.component} (${x.same} of ${x.of} declarations alike)` })), { side, who: 'both', todo: 'Decide for each: use the component in the product, with a new option if it needs one, or add the new one to the system on purpose.' });
    out.push({ ...r, status: 'decide' });
  }
  return out;
}

// Both sides on one page: the grammar's rules (each said as Figma's, its fix the designer's unless it is to decide),
// then the hygiene's, the families', the tokens' and the code's. null when there is nothing on either side.
// waiting: the checks that wait on a fresh read of Figma (capture-waits.mjs), said above the table.
export function constructionView({ grammar = null, figma = [], family = [], tokens = [], code = [], families = [], components = [], listed = true, waiting = [] } = {}) {
  const mined = (grammar ?? []).map((r) => ({ ...r, side: 'figma', who: r.status === 'decide' ? 'both' : 'figma' }));
  const rules = [...mined, ...figma, ...family, ...tokens, ...code];
  if (!rules.length) return null;
  return { rules, components, families, listed, ...(waiting.length ? { waiting } : {}) };
}

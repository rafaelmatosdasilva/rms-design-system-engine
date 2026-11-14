// The Figma build benchmark: the kept requests (requests.json) run through the engine's own path on an invented system
// (system.json), each script run on a stand-in for Figma (standin.mjs), and each scored on separate counts, never one
// number:
//   runs       the script ran and found everything it named
//   asked      what was asked is there (each check of the request's expect, met of all)
//   untouched  nodes and variables changed that the request did not ask to change (0 is right)
//   system     instances of a component the system does not have, and variables bound that it does not have (0 is right)
//   layout     layout faults the result has that what it was built from did not (layout-faults.mjs; 0 is right)
//   said       the layout faults the script itself said it made, for the person to decide (a layout fault it does
//              not say is one nobody hears of)
//   questions  what the engine asked before the person's answers were given
//   ms         how long the engine took, the spec and the script; no model is asked on this path, so no tokens are
//              spent: an agent's turns and tokens on the same requests are the skill evaluation's to measure
//
//   node test/figma-bench/bench.mjs            the table, against the kept results (results.json)
//   node test/figma-bench/bench.mjs --keep     the results kept as they are now (only when a change is meant)
//   node test/figma-bench/bench.mjs --source <project>   the same kinds of request on a project's own library and
//                                              rules, drawn from its own components and variables; its results stay on
//                                              this computer (DESIGN_SYSTEM_ENGINE_EVAL_PRIVATE_OUT, else
//                                              ~/.config/rms-engine/figma-bench), held to the run before, never written here
//   node test/figma-bench/bench.mjs --sample 3 a review sheet for a person: three requests, what was built, the counts,
//                                              and a line for whether the counts say what they see (review/)
// test/figma-bench.test.mjs fails when a request scores worse than its kept result on any count.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { standin, fileState } from './standin.mjs';
import { opsScript, modelOf, ground, opWords, partNamed, rankOf } from '../../lib/figma-ops.mjs';
import { specOf, likeOf, nameOf, askedOf, EXT } from '../../lib/component-spec.mjs';
import { parseChange } from '../../lib/component-change.mjs';
import { kindOf, examplesOf, kindRules, composeOps, foundationOps, kindSpec } from '../../lib/system-kinds.mjs';
import { grammarOf } from '../../lib/construction-grammar.mjs';
import { layoutFaults } from '../../lib/layout-faults.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const COUNTS = ['runs', 'asked', 'sense', 'asks', 'untouched', 'system', 'rules', 'layout', 'unsaid'];
// Higher is better for these, lower for the rest.
const UP = new Set(['runs', 'asked', 'sense', 'asks']);

// What the engine reads of the system, as a capture of it would say it.
export function capturesOf(system) {
  const ids = Object.fromEntries(system.variables.map((v, i) => [v.name, `V:${i + 1}`]));
  const varNames = Object.fromEntries(system.variables.map((v) => [ids[v.name], { name: v.name }]));
  const aliases = Object.fromEntries(system.variables.filter((v) => v.alias).map((v) => [v.name, [v.alias]]));
  const props = {}, skeleton = {}, values = {};
  for (const [name, c] of Object.entries(system.components)) {
    props[name] = { nodeId: `N:${name}`, description: c.description ?? '', properties: c.properties ?? {} };
    skeleton[name] = { trees: [c.tree], variants: c.variants.map((v) => [v, 0]), page: system.page, section: system.page };
    const binds = {};
    const walk = (t, path) => { for (const [f, v] of Object.entries(t.bind ?? {})) { const F = { fill: 'FILL', itemSpacing: 'GAP' }[f] ?? f.toUpperCase(); for (const vn of c.variants) (binds[ids[v]] ??= {})[F] = [vn, path].filter(Boolean).join('/'); } for (const k of t.c ?? []) walk(k, path ? `${path}/${k.n}` : k.n); };
    walk(c.tree, '');
    values[name] = { hygiene: { binds } };
  }
  return { props, skeleton, values, varNames, aliases, aliasesByMode: Object.fromEntries((system.modes.Tokens ?? []).map((m) => [m, aliases])) };
}

// ── A project's own library (--source) ──────────────────────────────────────────────────────────────────────────────
// Its captures as the engine reads them for a spec (audit.mjs --spec): the props, the skeleton, the values and the
// variables, with what each variable points at.
export async function capturesOfProject(root) {
  const read = (p) => { try { return JSON.parse(readFileSync(join(root, p), 'utf8')); } catch { return null; } };
  const cfg = read('ds-config.json') ?? {};
  const { componentFiles } = await import('../../lib/figma-capture.mjs');
  const props = read(cfg.paths?.compPropsSnapshot ?? 'src/figma-component-props.snapshot.json') ?? {};
  const vars = read(cfg.paths?.snapshotVars ?? 'src/figma-vars.snapshot.json') ?? {};
  const skeleton = read(componentFiles(cfg).skeleton) ?? {};
  const aliases = { ...(vars.otherAliases ?? {}), ...(Object.values(vars.aliases ?? {})[0] ?? {}) };
  return { cfg, vars, captures: { props, skeleton, values: read('component-values.snapshot.json') ?? {}, varNames: vars.variableScopes ?? {}, aliases, aliasesByMode: vars.aliases ?? {} } };
}
// The stand-in's system from those captures: every component with its first variant's tree, every variable.
export function systemOfCaptures({ captures, vars = {} }) {
  const components = {};
  for (const [name, e] of Object.entries(captures.skeleton).filter(([n, e]) => !n.startsWith('_') && e?.trees?.length)) {
    const variants = (e.variants ?? []).map(([v]) => v);
    components[name] = { variants: variants.length ? variants : [name], axes: variants.length > 1, description: captures.props[name]?.description ?? '', properties: captures.props[name]?.properties ?? {}, tree: e.trees[(e.variants?.[0] ?? [null, 0])[1]] };
  }
  const colours = new Set(Object.keys(vars.color ?? {}));
  const variables = Object.values(captures.varNames).filter((v) => v?.name).map((v) => ({ name: v.name, collection: 'Tokens', type: colours.has(v.name) || /colou?r/i.test(v.name) ? 'COLOR' : 'FLOAT', ...(captures.aliases[v.name]?.[0] ? { alias: captures.aliases[v.name][0] } : {}) }));
  const known = new Set(variables.map((v) => v.name));
  return { page: 'Components', modes: { Tokens: ['default'] }, textStyles: [], variables: variables.map((v) => (v.alias && !known.has(v.alias) ? { ...v, alias: undefined } : v)), components, templates: {} };
}
// The requests, drawn from the library's own components and variables, a few of each kind, the same on every run:
// a step past the largest on a size scale (the builder must ask what it changes), a boolean named for a part the
// component lacks (it must ask), a boolean on a part it has (built, and held to the library's rules), a copy of a
// component (built, held to its rules), and a variable beside one that points at another (built).
export function requestsOf(captures, { each = 2 } = {}) {
  const names = Object.keys(captures.skeleton).filter((n) => !n.startsWith('_') && captures.skeleton[n]?.trees?.length && captures.props[n]).sort();
  const out = [];
  const SCALE = ['xxxs', 'xxs', 'xs', 's', 'm', 'l', 'xl', 'xxl', 'xxxl'];
  for (const n of names) {
    if (out.filter((r) => r.id.startsWith('step-')).length >= each) break;
    for (const [axis, d] of Object.entries(captures.props[n].properties ?? {}).filter(([, d]) => d?.type === 'VARIANT')) {
      const ranked = (d.variantOptions ?? []).filter((o) => rankOf(o) != null).sort((a, b) => rankOf(a) - rankOf(b));
      const top = ranked.at(-1), next = top != null ? SCALE[rankOf(top) + 1] : null;
      if (ranked.length >= 2 && next) { out.push({ id: `step-${n}`, kind: 'change', target: n, ask: `add ${next} to ${axis} like ${top}`, expect: { component: n, asks: [`what does ${next} change`] } }); break; }
    }
  }
  const layersOf = (n) => Object.values(modelOf(n, captures)?.layers ?? {}).map((l) => l);
  for (const n of names) {
    if (out.filter((r) => r.id.startsWith('part-missing-')).length >= each) break;
    const ls = layersOf(n), frame = ls.find((l) => l.type === 'FRAME' && !l.path.includes('/'));
    if (frame && !ls.some((l) => /badge/i.test(l.path))) out.push({ id: `part-missing-${n}`, kind: 'change', target: n, ask: `add a boolean showBadge on ${frame.path}`, expect: { component: n, asks: ['has no badge'] } });
  }
  for (const n of names) {
    if (out.filter((r) => r.id.startsWith('part-')  && !r.id.startsWith('part-missing-')).length >= each) break;
    const ls = layersOf(n), inst = ls.find((l) => l.type === 'INSTANCE' && !l.wired?.visible && /^[A-Za-z]/.test(l.path.split('/').pop()));
    if (!inst) continue;
    const part = inst.path.split('/').pop(), prop = `show${part[0].toUpperCase()}${part.slice(1).replace(/[^A-Za-z0-9]/g, '')}`;
    if ((captures.props[n].properties ?? {})[prop]) continue;
    out.push({ id: `part-${n}`, kind: 'change', target: n, answers: [{ op: 'addProperty', name: prop, kind: 'boolean', default: true, layer: inst.path }], ask: `add a boolean ${prop} on ${inst.path}`, expect: { component: n, properties: [prop] } });
  }
  // A bare copy is a twin, which a library that holds no-twins does not allow: it is asked what makes it different. One
  // that drops a property it has is a component of its own, built and held to the library's rules.
  for (const n of names.filter((x) => modelOf(x, captures)?.axes?.length).slice(0, each)) {
    out.push({ id: `twin-${n}`, kind: 'build', ask: `make a ${n}Bench like ${n}, called ${n}Bench`, autoAnswer: true, expect: { asks: ['a twin'] }, twinOnly: true });
    const drop = (modelOf(n, captures)?.properties ?? [])[0]?.name;
    if (drop) out.push({ id: `copy-${n}`, kind: 'build', ask: `make a ${n}Bench like ${n}, called ${n}Bench`, autoAnswer: true, answers: [{ op: 'removeProperty', name: drop }], expect: { component: `${n}Bench`, noProperties: [drop] } });
  }
  const vs = Object.values(captures.varNames).map((v) => v?.name).filter((v) => v && captures.aliases[v]?.[0]).sort();
  for (const v of vs.slice(0, each)) {
    const to = captures.aliases[v][0], name = `${v.split('/').pop()}Bench`;
    out.push({ id: `variable-${v}`, kind: 'build', ask: `add a token like ${v}, called ${name}, pointing at ${to}`, expect: { variable: { name: `${v.split('/').slice(0, -1).join('/')}/${name}`, alias: to } } });
  }
  return out;
}

// The engine's own path for one request: the spec (or the change) as a person's words read, with their answers.
function opsOf(req, system, captures, grammar) {
  const answers = [...(req.answers ?? [])];
  if (req.kind === 'change') {
    const model = modelOf(req.target, captures);
    const read = parseChange(req.ask, model);
    const first = ground(read.ops, { captures, grammar, target: req.target });
    // The person's answers are every operation so far, as --figma-change --ops takes them: they replace the words.
    const g = ground(answers.length ? answers : read.ops, { captures, grammar, target: req.target });
    return { ops: g.ops, asked: first.questions.length + read.unread.length, asks: [...first.questions.map((q) => q.ask), ...read.unread.map((u) => `not read: ${u}`)], left: g.questions.length, target: req.target };
  }
  const kind = kindOf(req.ask);
  if (kind === 'foundation') {
    const f = foundationOps({ description: req.ask, variables: Object.values(captures.varNames).map((v) => v.name) });
    const { spec } = kindSpec({ kind, description: req.ask, ops: [...f.ops, ...answers], questions: f.questions, captures, grammar });
    const first = kindSpec({ kind, description: req.ask, ops: f.ops, questions: f.questions, captures, grammar }).spec[EXT].questions;
    return { ops: spec[EXT].ops, asked: first.length, asks: first.map((q) => q.ask), left: spec[EXT].questions.length, like: f.ops[0]?.like ?? null };
  }
  if (kind !== 'component') {
    const comps = Object.keys(captures.props);
    const examples = examplesOf(kind, { templates: system.templates, components: comps });
    const c = composeOps({ kind, name: nameOf(req.ask) ?? req.ask.match(/called (\w+)/)?.[1], description: req.ask, examples, components: comps, rules: kindRules(kind, examples) });
    const first = kindSpec({ kind, description: req.ask, name: c.ops[0].name, ops: c.ops, questions: c.questions, captures, grammar }).spec;
    const { spec } = kindSpec({ kind, description: req.ask, name: c.ops[0].name, ops: [...c.ops, ...answers], captures, grammar });
    return { ops: spec[EXT].ops, asked: first[EXT].questions.length, asks: first[EXT].questions.map((q) => q.ask), left: spec[EXT].questions.length, like: null };
  }
  const like = likeOf(req.ask, Object.keys(captures.props)).like;
  const name = nameOf(req.ask);
  const read = askedOf(req.ask, modelOf(like, captures));
  const first = specOf({ description: req.ask, like, name, ops: read.ops, unread: read.unread, captures, grammar }).spec;
  // A request drawn from a library answers what a person would: its description, and the shared variable each of the
  // like's own points at (--shared).
  if (req.autoAnswer) answers.push(...(first[EXT].shared ?? []), { op: 'describe', text: `A copy of ${like}, for the benchmark.` });
  const { spec } = specOf({ description: req.ask, like, name, ops: [...read.ops, ...answers], captures, grammar });
  return { ops: spec[EXT].ops, asked: first[EXT].questions.length, asks: first[EXT].questions.map((q) => q.ask), left: spec[EXT].questions.length, like };
}

// A node as the capture reads one, for the layout check: its tree and, per layer, where it sits and the size of a box
// of a fixed size.
function entryOf(node) {
  node.lay?.();
  const variants = node.type === 'COMPONENT_SET' ? node.children.filter((c) => c.type === 'COMPONENT') : [node];
  const trees = [], looks = {};
  variants.forEach((v, i) => {
    const look = {};
    const fixed = (n) => n.type !== 'TEXT' && n.type !== 'INSTANCE' && (!n.auto || n.primaryAxisSizingMode === 'FIXED' || n.counterAxisSizingMode === 'FIXED');
    const tree = (n, place) => {
      if (place !== '') look[place] = { ...(look[place] ?? {}), at: [n.x, n.y, n.width, n.height] };
      if (n.children.length && fixed(n)) look[place] = { ...(look[place] ?? {}), box: [n.width, n.height] };
      return { t: n.type, n: n.name, clip: !!n.clipsContent, absolute: n.layoutPositioning === 'ABSOLUTE', hidden: !n.visible, c: n.type === 'INSTANCE' ? [] : n.children.map((k, j) => tree(k, place ? `${place}.${j}` : String(j))) };
    };
    trees.push(tree(v, ''));
    looks[v.name] = look;
  });
  return { variants: variants.map((v, i) => [v.name, i]), trees, looks };
}
// A component as the capture reads one (its axes, properties and the tree of its first variant), so the construction
// grammar can be read again with it in, and the rules it breaks counted (construction-grammar.mjs).
function captured(node) {
  if (!node) return null;
  const vs = variantsOf(node);
  const tree = (n) => ({ ...(n === vs[0] ? {} : { t: n.type, n: n.name }), ...(n.auto ? { layout: { dir: n.layoutMode } } : {}),
    ...(n.type === 'INSTANCE' ? { of: { name: n.mainComponent?.parent?.type === 'COMPONENT_SET' ? n.mainComponent.parent.name : n.mainComponent?.name } } : {}),
    ...(n.componentPropertyReferences ? { wired: Object.fromEntries(Object.entries(n.componentPropertyReferences).map(([f, k]) => [f, String(k).split('#')[0]])) } : {}),
    c: n.type === 'INSTANCE' ? [] : n.children.map(tree) });
  const axes = {};
  for (const v of vs) for (const [k, x] of Object.entries(Object.fromEntries(String(v.name).split(/,\s*/).map((p) => p.split('=').map((y) => y.trim())).filter((p) => p.length === 2)))) (axes[k] ??= new Set()).add(x);
  const properties = { ...Object.fromEntries(Object.entries(axes).map(([k, o]) => [k, { type: 'VARIANT', variantOptions: [...o], defaultValue: [...o][0] }])),
    ...Object.fromEntries(Object.entries(node.componentPropertyDefinitions ?? {}).filter(([, d]) => d.type !== 'VARIANT')) };
  return { props: { nodeId: node.id, description: node.description ?? '', properties }, skeleton: { trees: [tree(vs[0])], variants: vs.map((v) => [v.name, 0]) } };
}
const RULED = new Set(['rule', 'fix']);
function broken(name, captures, grammarInputs = {}) {
  const g = grammarOf({ props: captures.props, values: captures.values, varNames: captures.varNames, skeleton: captures.skeleton, ...grammarInputs });
  // A rule names what breaks it in toFix (construction-grammar.mjs judge).
  return new Set((g.figma?.rules ?? []).filter((r) => RULED.has(r.status)).flatMap((r) => (r.toFix ?? []).filter((i) => i.component === name).map(() => r.id)));
}

const faultKeys = (node) => new Set(node ? layoutFaults(entryOf(node)).map((f) => `${f.kind}|${f.layer}|${f.with ?? ''}`) : []);

const variantsOf = (s) => (s.type === 'COMPONENT_SET' ? s.children.filter((c) => c.type === 'COMPONENT') : [s]);
const layerIn = (v, path) => { let n = v; for (const seg of path.split('/')) { n = n.children.find((c) => c.name === seg); if (!n) return null; } return n; };

export async function runCase(req, system, { captures = capturesOf(system) } = {}) {
  const grammar = grammarOf({ props: captures.props, structure: Object.fromEntries(Object.keys(captures.props).map((n) => [n, { layout: 'HORIZONTAL' }])), values: captures.values, varNames: captures.varNames, skeleton: captures.skeleton });
  const t0 = performance.now();
  const plan = opsOf(req, system, captures, grammar);
  // Nothing is built while a question is open, as --figma-build and --figma-change refuse to: what was asked stays asked.
  if (plan.left) plan.ops = [];
  const f = standin(system);
  // Laid out as Figma lays it out, before anything is read of it.
  for (const p of f.pages) for (const c of p.children) c.lay();
  const before = fileState(f);
  // Every node there before the run, whether on a page or not (a component another library's instance stands for).
  const existed = new Set(f.reg.keys());
  const hadDefs = new Set(Object.keys(((plan.target ? await f.figma.getNodeByIdAsync(f.nodes[plan.target]) : null)?.componentPropertyDefinitions) ?? {}));
  const target = plan.target ? await f.figma.getNodeByIdAsync(f.nodes[plan.target]) : null;
  const from = target ?? (plan.like && f.nodes[plan.like] ? await f.figma.getNodeByIdAsync(f.nodes[plan.like]) : null);
  const had = faultKeys(from);
  // What it was built from, read the same way the result is read after, so the two compare like for like.
  const capturedBefore = captured(from);
  const inTarget = new Set(target ? [target.id, ...target.findAll().map((n) => n.id)] : []);
  let out = null, threw = null;
  try { out = await new (Object.getPrototypeOf(async () => {}).constructor)('figma', opsScript(plan.ops, { target: target?.id ?? null, nodes: f.nodes }))(f.figma); } catch (e) { threw = String(e?.message ?? e); }
  const ms = Math.round(performance.now() - t0);
  const after = fileState(f);
  const result = out?.node ? await f.figma.getNodeByIdAsync(out.node) : null;
  // What was asked, each check once.
  const e = req.expect ?? {}, checks = [];
  const vs = result ? variantsOf(result) : [];
  if (e.component) checks.push(result?.name === e.component || (req.autoAnswer && !!result && result.name.toLowerCase().replace(/[^a-z0-9]/g, '') === e.component.toLowerCase().replace(/[^a-z0-9]/g, '')));
  if (e.variants != null) checks.push(vs.length === e.variants);
  for (const [axis, opts] of Object.entries(e.options ?? {})) checks.push(JSON.stringify([...new Set(vs.map((v) => (v.name.match(new RegExp(`${axis}=([^,]+)`)) ?? [])[1]))].sort()) === JSON.stringify([...opts].sort()));
  for (const l of e.layers ?? []) checks.push(vs.length > 0 && vs.every((v) => layerIn(v, l)));
  for (const l of e.noLayers ?? []) checks.push(vs.length > 0 && vs.every((v) => !layerIn(v, l)));
  const defs = Object.keys(result?.componentPropertyDefinitions ?? {}).map((k) => k.split('#')[0]);
  for (const p of e.properties ?? []) checks.push(defs.includes(p));
  for (const p of e.noProperties ?? []) checks.push(!defs.includes(p));
  const inst = result ? result.findAll((n) => n.type === 'INSTANCE').map((n) => n.name) : [];
  for (const c of e.instances ?? []) checks.push(inst.includes(c));
  if (e.variable) { const v = f.vars.find((x) => x.name === e.variable.name), to = f.vars.find((x) => x.name === e.variable.alias); checks.push(!!v && !!to && Object.values(v.valuesByMode).length > 0 && Object.values(v.valuesByMode).every((x) => x?.id === to.id)); }
  // Beyond what was asked: what existed before and changed, but the component a change was asked of.
  const untouched = Object.keys(before).filter((id) => !inTarget.has(id) && before[id] !== after[id]).length;
  // Only the system's own: every instance of a component that was there before, every variable bound one it has.
  const known = new Set([...Object.keys(before), ...existed]);
  const made = result ? [result, ...result.findAll()] : [];
  const madeVars = new Set(f.vars.filter((v) => !known.has(v.id)).map((v) => v.id));
  const foreign = made.filter((n) => n.type === 'INSTANCE' && !known.has(n.mainComponent?.id)).length
    + made.flatMap((n) => [...Object.values(n.boundVariables ?? {}), ...(n.fills ?? []).map((p) => p.boundVariables?.color)]).filter((b) => b?.id && !known.has(b.id) && !madeVars.has(b.id)).length;
  const now = faultKeys(result);
  const layout = [...now].filter((k) => !had.has(k)).length;
  // Whether it makes sense: a boolean named for a part shows or hides that part, a larger step is larger.
  const sense = [];
  for (const [k, d] of Object.entries(result?.componentPropertyDefinitions ?? {}).filter(([k]) => !hadDefs.has(k))) {
    const part = d.type === 'BOOLEAN' ? partNamed(k.split('#')[0]) : [];
    if (!part.length) continue;
    const drives = vs.flatMap((v) => [v, ...v.findAll()]).filter((n) => n.componentPropertyReferences?.visible === k);
    sense.push(drives.length > 0 && drives.every((n) => part.every((w) => String(n.name).toLowerCase().includes(w))));
  }
  for (const b of e.bigger ? [e.bigger] : []) {
    const of = (o) => vs.find((v) => new RegExp(`${b.axis}=${o}(,|$)`, 'i').test(v.name));
    const big = of(b.option), small = of(b.than);
    sense.push(!!big && !!small && (big.height > small.height || big.width > small.width));
  }
  // The construction rules the result breaks that what it was built from did not (construction-grammar.mjs).
  let rules = 0, brokenRules = [];
  const capturedAfter = captured(result);
  if (capturedAfter && result?.type !== 'FRAME') {
    const name = result.name, base = plan.target ?? plan.like;
    const was = base && capturedBefore ? broken(base, { ...captures, props: { ...captures.props, [base]: capturedBefore.props }, skeleton: { ...captures.skeleton, [base]: capturedBefore.skeleton } }) : new Set();
    const withIt = { ...captures, props: { ...captures.props, [name]: capturedAfter.props }, skeleton: { ...captures.skeleton, [name]: capturedAfter.skeleton } };
    const newly = [...broken(name, withIt)].filter((id) => !was.has(id)); rules = newly.length; if (newly.length) brokenRules = newly;
  }
  // What it asked: every question a request expects is asked, and nothing is built on a guess where one is owed.
  const owed = req.expect?.asks ?? [];
  const asksHit = owed.filter((re) => plan.asks.some((a) => new RegExp(re, 'i').test(a))).length;
  return {
    id: req.id, runs: !threw && (out?.missing ?? ['?']).length === 0 ? 1 : 0, asked: checks.length ? Number((checks.filter(Boolean).length / checks.length).toFixed(2)) : 1,
    sense: sense.length ? Number((sense.filter(Boolean).length / sense.length).toFixed(2)) : 1,
    asks: owed.length ? Number((asksHit / owed.length).toFixed(2)) : 1,
    untouched, system: foreign, rules, ...(brokenRules.length ? { brokenRules } : {}), layout, said: (out?.faults ?? []).length, unsaid: Math.max(0, layout - (out?.faults ?? []).length), questions: plan.asked, left: plan.left, ms,
    ...(threw ? { error: threw } : out?.missing?.length ? { missing: out.missing } : {}), ops: plan.ops.length, plan: { ops: plan.ops, asks: plan.asks, target: plan.target ?? null, like: plan.like ?? null }, steps: plan.ops.map(opWords), changed: out?.changed ?? [], faults: out?.faults ?? [],
  };
}

export async function runBench({ requests = JSON.parse(readFileSync(join(HERE, 'requests.json'), 'utf8')).requests, system = JSON.parse(readFileSync(join(HERE, 'system.json'), 'utf8')) } = {}) {
  const out = [];
  for (const r of requests) out.push(await runCase(r, system));
  return out;
}

// Worse than kept, on any count: a lower run or asked, a higher untouched, system or layout.
export function worse(now, kept) {
  const out = [];
  for (const r of now) {
    const k = kept.find((x) => x.id === r.id);
    if (!k) { out.push(`${r.id}: a request with no kept result (keep it with --keep once it is right)`); continue; }
    for (const c of COUNTS) if (UP.has(c) ? r[c] < k[c] : r[c] > k[c]) out.push(`${r.id}: ${c} ${k[c]} → ${r[c]}`);
  }
  return out;
}

export const table = (rows) => ['| Request | Runs | Asked | Sense | Asks | Untouched | System | Rules | Layout | Said | Questions | ms |', '|---|---|---|---|---|---|---|---|---|---|---|---|', ...rows.map((r) => `| ${r.id} | ${r.runs} | ${r.asked} | ${r.sense} | ${r.asks} | ${r.untouched} | ${r.system} | ${r.rules} | ${r.layout} | ${r.said} | ${r.questions} | ${r.ms} |`)].join('\n');

// A person's review of a sample: the sheets in review/, each request's counts and whether the person says they hold.
export function calibration(dir = join(HERE, 'review')) {
  if (!existsSync(dir)) return { reviewed: 0, agree: 0 };
  let reviewed = 0, agree = 0;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.md'))) for (const m of readFileSync(join(dir, f), 'utf8').matchAll(/^Counts hold: (yes|no)\b/gim)) { reviewed++; if (/yes/i.test(m[1])) agree++; }
  return { reviewed, agree };
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes('--source')) {
  // A team's own library: drawn from it, run on a stand-in built from its capture, kept on this computer only.
  const { resolve: res } = await import('node:path');
  const { homedir } = await import('node:os');
  const { createHash } = await import('node:crypto');
  const root = res(process.argv[process.argv.indexOf('--source') + 1] ?? '.');
  const project = await capturesOfProject(root);
  if (!Object.keys(project.captures.skeleton).length) { console.log(`No Figma capture in ${root}: refresh Figma there first.`); process.exit(2); }
  const system = systemOfCaptures(project);
  const requests = requestsOf(project.captures);
  const rows = [];
  for (const r of requests) { try { rows.push(await runCase(r, system, { captures: project.captures })); } catch (e) { rows.push({ id: r.id, runs: 0, asked: 0, sense: 0, asks: 0, untouched: 0, system: 0, rules: 0, layout: 0, unsaid: 0, said: 0, questions: 0, ms: 0, error: String(e?.message ?? e) }); } }
  console.log(table(rows));
  for (const r of rows.filter((x) => x.error || x.missing)) console.log(`  ${r.id}: ${r.error ?? r.missing.join('; ')}`);
  const dir = process.env.DESIGN_SYSTEM_ENGINE_EVAL_PRIVATE_OUT ? join(process.env.DESIGN_SYSTEM_ENGINE_EVAL_PRIVATE_OUT, 'figma-bench') : join(homedir(), '.config', 'rms-engine', 'figma-bench');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${createHash('sha256').update(root).digest('hex').slice(0, 12)}.json`);
  const before = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).results : [];
  const w = before.length ? worse(rows, before).filter((x) => !/no kept result/.test(x)) : [];
  console.log(before.length ? (w.length ? `\nWorse than the run before:\n${w.map((x) => `  ${x}`).join('\n')}` : '\nNo request scores worse than the run before.') : '\nThe first run on this library: kept, to hold the next to.');
  writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), results: rows.map(({ ms, steps, changed, faults, plan, ...r }) => r) }, null, 2) + '\n');
  console.log(`Kept on this computer only: ${file}`);
  process.exit(0);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rows = await runBench();
  const keptFile = join(HERE, 'results.json');
  const kept = existsSync(keptFile) ? JSON.parse(readFileSync(keptFile, 'utf8')).results : [];
  console.log(table(rows));
  const w = worse(rows, kept);
  console.log(w.length ? `\nWorse than kept:\n${w.map((x) => `  ${x}`).join('\n')}` : '\nNo request scores worse than its kept result.');
  const c = calibration();
  console.log(c.reviewed ? `A person reviewed ${c.reviewed} result${c.reviewed === 1 ? '' : 's'}: the counts hold on ${c.agree}.` : 'No result reviewed by a person yet: --sample <n> writes a sheet for one.');
  if (process.argv.includes('--keep')) { writeFileSync(keptFile, JSON.stringify({ about: 'The kept result of each request (bench.mjs): a run that scores worse on any count fails the test.', results: rows.map(({ ms, steps, changed, faults, plan, ...r }) => r) }, null, 2) + '\n'); console.log(`Kept: ${keptFile}`); }
  const n = Number(process.argv[process.argv.indexOf('--sample') + 1]);
  if (process.argv.includes('--sample') && n > 0) {
    const reqs = JSON.parse(readFileSync(join(HERE, 'requests.json'), 'utf8')).requests;
    const pick = rows.slice().sort((a, b) => (a.id.length * 7) % 5 - (b.id.length * 7) % 5).slice(0, n);
    const dir = join(HERE, 'review'); mkdirSync(dir, { recursive: true });
    const file = join(dir, `${new Date().toISOString().slice(0, 10)}.md`);
    writeFileSync(file, `# Figma build benchmark, a sample to review\n\nFor each request: read what was asked and what was built, then say whether the counts say what you see. Write yes or no after "Counts hold:".\n\n${pick.map((r) => { const q = reqs.find((x) => x.id === r.id); return `## ${r.id}\n\nAsked: "${q.ask}"${q.answers ? `, with ${q.answers.length} answer${q.answers.length === 1 ? '' : 's'}` : ''}.\n\nWhat the engine built:\n\n${r.steps.map((x) => `- ${x}`).join('\n')}\n\nWhat the script said it did:\n\n${[...r.changed, ...r.faults].map((x) => `- ${x}`).join('\n')}\n\nCounts: runs ${r.runs}, asked ${r.asked}, untouched ${r.untouched}, system ${r.system}, layout ${r.layout} (said ${r.said}).\n\nCounts hold: \n`; }).join('\n')}`);
    // The sample built in Figma, to be seen: the system first, then each request, Before and After (review-figma.mjs).
    const { systemScript, requestScript } = await import('./review-figma.mjs');
    const sys = JSON.parse(readFileSync(join(HERE, 'system.json'), 'utf8'));
    const fdir = file.replace(/\.md$/, '');
    mkdirSync(fdir, { recursive: true });
    writeFileSync(join(fdir, 'figma-0.js'), systemScript(sys));
    pick.forEach((r, i) => writeFileSync(join(fdir, `figma-${i + 1}.js`), requestScript(i + 1, reqs.find((x) => x.id === r.id), r.plan, opsScript(r.plan.ops, { target: r.plan.target ? '__AFTER__' : null, nodes: {} }))));
    const text = readFileSync(file, 'utf8').replace('Write yes or no after "Counts hold:".', `Write yes or no after "Counts hold:". Look at each in Figma first: on an empty Figma file, run ${relative(HERE, fdir)}/figma-0.js, then figma-1.js to figma-${pick.length}.js, in order, with the Figma MCP's use_figma. Each request is a section with its component Before and After.`);
    writeFileSync(file, text);
    console.log(`A sheet for a person to review: ${file}, and its results to build in Figma: ${fdir}/`);
  }
}

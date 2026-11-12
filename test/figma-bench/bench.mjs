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
//   node test/figma-bench/bench.mjs --sample 3 a review sheet for a person: three requests, what was built, the counts,
//                                              and a line for whether the counts say what they see (review/)
// test/figma-bench.test.mjs fails when a request scores worse than its kept result on any count.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { standin, fileState } from './standin.mjs';
import { opsScript, modelOf, ground, opWords } from '../../lib/figma-ops.mjs';
import { specOf, likeOf, nameOf, askedOf, EXT } from '../../lib/component-spec.mjs';
import { parseChange } from '../../lib/component-change.mjs';
import { kindOf, examplesOf, kindRules, composeOps, foundationOps, kindSpec } from '../../lib/system-kinds.mjs';
import { grammarOf } from '../../lib/construction-grammar.mjs';
import { layoutFaults } from '../../lib/layout-faults.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const COUNTS = ['runs', 'asked', 'untouched', 'system', 'layout', 'unsaid'];
// Higher is better for these, lower for the rest.
const UP = new Set(['runs', 'asked']);

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

// The engine's own path for one request: the spec (or the change) as a person's words read, with their answers.
function opsOf(req, system, captures, grammar) {
  const answers = req.answers ?? [];
  if (req.kind === 'change') {
    const model = modelOf(req.target, captures);
    const read = parseChange(req.ask, model);
    const first = ground(read.ops, { captures, grammar, target: req.target });
    const g = ground([...read.ops, ...answers], { captures, grammar, target: req.target });
    return { ops: g.ops, asked: first.questions.length + read.unread.length, left: g.questions.length, target: req.target };
  }
  const kind = kindOf(req.ask);
  if (kind === 'foundation') {
    const f = foundationOps({ description: req.ask, variables: Object.values(captures.varNames).map((v) => v.name) });
    const { spec } = kindSpec({ kind, description: req.ask, ops: [...f.ops, ...answers], questions: f.questions, captures, grammar });
    return { ops: spec[EXT].ops, asked: kindSpec({ kind, description: req.ask, ops: f.ops, questions: f.questions, captures, grammar }).spec[EXT].questions.length, left: spec[EXT].questions.length, like: f.ops[0]?.like ?? null };
  }
  if (kind !== 'component') {
    const comps = Object.keys(captures.props);
    const examples = examplesOf(kind, { templates: system.templates, components: comps });
    const c = composeOps({ kind, name: nameOf(req.ask) ?? req.ask.match(/called (\w+)/)?.[1], description: req.ask, examples, components: comps, rules: kindRules(kind, examples) });
    const first = kindSpec({ kind, description: req.ask, name: c.ops[0].name, ops: c.ops, questions: c.questions, captures, grammar }).spec;
    const { spec } = kindSpec({ kind, description: req.ask, name: c.ops[0].name, ops: [...c.ops, ...answers], captures, grammar });
    return { ops: spec[EXT].ops, asked: first[EXT].questions.length, left: spec[EXT].questions.length, like: null };
  }
  const like = likeOf(req.ask, Object.keys(captures.props)).like;
  const name = nameOf(req.ask);
  const read = askedOf(req.ask, modelOf(like, captures));
  const first = specOf({ description: req.ask, like, name, ops: read.ops, unread: read.unread, captures, grammar }).spec;
  const { spec } = specOf({ description: req.ask, like, name, ops: [...read.ops, ...answers], captures, grammar });
  return { ops: spec[EXT].ops, asked: first[EXT].questions.length, left: spec[EXT].questions.length, like };
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
const faultKeys = (node) => new Set(node ? layoutFaults(entryOf(node)).map((f) => `${f.kind}|${f.layer}|${f.with ?? ''}`) : []);

const variantsOf = (s) => (s.type === 'COMPONENT_SET' ? s.children.filter((c) => c.type === 'COMPONENT') : [s]);
const layerIn = (v, path) => { let n = v; for (const seg of path.split('/')) { n = n.children.find((c) => c.name === seg); if (!n) return null; } return n; };

export async function runCase(req, system) {
  const captures = capturesOf(system);
  const grammar = grammarOf({ props: captures.props, structure: Object.fromEntries(Object.keys(captures.props).map((n) => [n, { layout: 'HORIZONTAL' }])), values: captures.values, varNames: captures.varNames, skeleton: captures.skeleton });
  const t0 = performance.now();
  const plan = opsOf(req, system, captures, grammar);
  const f = standin(system);
  // Laid out as Figma lays it out, before anything is read of it.
  for (const p of f.pages) for (const c of p.children) c.lay();
  const before = fileState(f);
  const target = plan.target ? await f.figma.getNodeByIdAsync(f.nodes[plan.target]) : null;
  const from = target ?? (plan.like && f.nodes[plan.like] ? await f.figma.getNodeByIdAsync(f.nodes[plan.like]) : null);
  const had = faultKeys(from);
  const inTarget = new Set(target ? [target.id, ...target.findAll().map((n) => n.id)] : []);
  let out = null, threw = null;
  try { out = await new (Object.getPrototypeOf(async () => {}).constructor)('figma', opsScript(plan.ops, { target: target?.id ?? null, nodes: f.nodes }))(f.figma); } catch (e) { threw = String(e?.message ?? e); }
  const ms = Math.round(performance.now() - t0);
  const after = fileState(f);
  const result = out?.node ? await f.figma.getNodeByIdAsync(out.node) : null;
  // What was asked, each check once.
  const e = req.expect ?? {}, checks = [];
  const vs = result ? variantsOf(result) : [];
  if (e.component) checks.push(result?.name === e.component);
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
  const known = new Set(Object.keys(before));
  const made = result ? [result, ...result.findAll()] : [];
  const madeVars = new Set(f.vars.filter((v) => !known.has(v.id)).map((v) => v.id));
  const foreign = made.filter((n) => n.type === 'INSTANCE' && !known.has(n.mainComponent?.id)).length
    + made.flatMap((n) => [...Object.values(n.boundVariables ?? {}), ...(n.fills ?? []).map((p) => p.boundVariables?.color)]).filter((b) => b?.id && !known.has(b.id) && !madeVars.has(b.id)).length;
  const now = faultKeys(result);
  const layout = [...now].filter((k) => !had.has(k)).length;
  return {
    id: req.id, runs: !threw && (out?.missing ?? ['?']).length === 0 ? 1 : 0, asked: checks.length ? Number((checks.filter(Boolean).length / checks.length).toFixed(2)) : 1,
    untouched, system: foreign, layout, said: (out?.faults ?? []).length, unsaid: Math.max(0, layout - (out?.faults ?? []).length), questions: plan.asked, left: plan.left, ms,
    ...(threw ? { error: threw } : out?.missing?.length ? { missing: out.missing } : {}), ops: plan.ops.length, steps: plan.ops.map(opWords), changed: out?.changed ?? [], faults: out?.faults ?? [],
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

export const table = (rows) => ['| Request | Runs | Asked | Untouched | System | Layout | Said | Questions | ms |', '|---|---|---|---|---|---|---|---|---|', ...rows.map((r) => `| ${r.id} | ${r.runs} | ${r.asked} | ${r.untouched} | ${r.system} | ${r.layout} | ${r.said} | ${r.questions} | ${r.ms} |`)].join('\n');

// A person's review of a sample: the sheets in review/, each request's counts and whether the person says they hold.
export function calibration(dir = join(HERE, 'review')) {
  if (!existsSync(dir)) return { reviewed: 0, agree: 0 };
  let reviewed = 0, agree = 0;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.md'))) for (const m of readFileSync(join(dir, f), 'utf8').matchAll(/^Counts hold: (yes|no)\b/gim)) { reviewed++; if (/yes/i.test(m[1])) agree++; }
  return { reviewed, agree };
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
  if (process.argv.includes('--keep')) { writeFileSync(keptFile, JSON.stringify({ about: 'The kept result of each request (bench.mjs): a run that scores worse on any count fails the test.', results: rows.map(({ ms, steps, changed, faults, ...r }) => r) }, null, 2) + '\n'); console.log(`Kept: ${keptFile}`); }
  const n = Number(process.argv[process.argv.indexOf('--sample') + 1]);
  if (process.argv.includes('--sample') && n > 0) {
    const reqs = JSON.parse(readFileSync(join(HERE, 'requests.json'), 'utf8')).requests;
    const pick = rows.slice().sort((a, b) => (a.id.length * 7) % 5 - (b.id.length * 7) % 5).slice(0, n);
    const dir = join(HERE, 'review'); mkdirSync(dir, { recursive: true });
    const file = join(dir, `${new Date().toISOString().slice(0, 10)}.md`);
    writeFileSync(file, `# Figma build benchmark, a sample to review\n\nFor each request: read what was asked and what was built, then say whether the counts say what you see. Write yes or no after "Counts hold:".\n\n${pick.map((r) => { const q = reqs.find((x) => x.id === r.id); return `## ${r.id}\n\nAsked: "${q.ask}"${q.answers ? `, with ${q.answers.length} answer${q.answers.length === 1 ? '' : 's'}` : ''}.\n\nWhat the engine built:\n\n${r.steps.map((x) => `- ${x}`).join('\n')}\n\nWhat the script said it did:\n\n${[...r.changed, ...r.faults].map((x) => `- ${x}`).join('\n')}\n\nCounts: runs ${r.runs}, asked ${r.asked}, untouched ${r.untouched}, system ${r.system}, layout ${r.layout} (said ${r.said}).\n\nCounts hold: \n`; }).join('\n')}`);
    console.log(`A sheet for a person to review: ${file}`);
  }
}

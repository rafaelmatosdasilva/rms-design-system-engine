// system-health.mjs - how the design system is doing, answered from what the engine already read.
//
// The engine's model has four layers (the main guide, "The model"): Facts (what Figma and the code hold), Contracts
// (what the code must satisfy), Intent (why each part exists and how it is used) and Evaluation (whether what is built
// with the system holds). The health report asks the questions each layer can answer, thirteen in all, from the
// evidence the engine's own runs left behind. Each answer is good, mixed or poor with the facts it rests on, says what
// the engine did not see and the command that would let it, and names what only the team can tell. A question with
// no evidence is left unanswered, never guessed. Each report is kept, so the next one says what changed since.
//
//   health(evidence)               → [{ id, layer, question, rating, evidence, unseen, run, team }]
//   readEvidence(ROOT, cfg, out)   → the evidence, each part null when the engine has nothing of it to read
//   healthSince(rows, last)        → { better: [ids], worse: [ids], at } or null with no earlier report
//   healthLines(rows, since)       → the terminal's lines
//   healthMarkdown(rows, opts)     → system-health.md

import { readFileSync, readdirSync, existsSync, realpathSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { slashed } from './shown-path.mjs';

const CMD = 'rms-design-system-engine';

export const LAYERS = [
  { id: 'facts', name: 'Facts', asks: 'is the picture right?' },
  { id: 'contracts', name: 'Contracts', asks: 'does the code hold?' },
  { id: 'intent', name: 'Intent', asks: 'is it whole and explained?' },
  { id: 'evaluation', name: 'Evaluation', asks: 'is it used, by people and by agents?' },
];

export const QUESTIONS = [
  { id: 'current', layer: 'facts', question: 'Is what the engine read still current?', run: `${CMD} --refresh-figma`, team: 'whether Figma has changes nobody has published yet' },
  { id: 'agree', layer: 'facts', question: 'Do Figma and the code agree?', run: CMD, team: 'how a change made on one side reaches the other, and who carries it' },
  { id: 'names', layer: 'facts', question: 'Is each part called one name in Figma, in the code and in the docs?', run: CMD, team: 'whether people use those names when they talk about the product' },
  { id: 'values', layer: 'facts', question: 'Do the styles use tokens rather than values typed by hand?', run: `${CMD} --census`, team: 'which hand-typed values are meant to stay, and why' },
  { id: 'rules', layer: 'contracts', question: 'Does the code keep the rules the team set itself?', run: CMD, team: 'which rules the team follows that are written down nowhere' },
  { id: 'access', layer: 'contracts', question: 'Does every component work by keyboard, with a screen reader and in every theme?', run: CMD, team: 'what people who use assistive technology said when they tried it' },
  { id: 'proof', layer: 'contracts', question: 'Is each component tested, and drawn in its states?', run: CMD, team: 'whether the tests are trusted, and run before every release' },
  { id: 'whole', layer: 'intent', question: 'Is every part the products need in Figma, in the code and in the docs?', run: CMD, team: 'what the products build for themselves because the system has nothing for it' },
  { id: 'explained', layer: 'intent', question: "Is each component's purpose, and when to use it, written down?", run: `${CMD} --guidance-rating`, team: 'where the people who use the system go when the docs say nothing' },
  { id: 'releases', layer: 'intent', question: "Do releases go out the way the team's own documents say?", run: CMD, team: 'who decides what goes in, and how a product team asks for something' },
  { id: 'products', layer: 'evaluation', question: 'Are the products on the system, and keeping up?', run: CMD, team: 'why a product that moved away did, and what would bring it back' },
  { id: 'learn', layer: 'evaluation', question: 'Can an agent learn the system without guessing?', run: `${CMD} --guidance-rating`, team: 'which agents the team uses, and what it lets them do alone' },
  { id: 'built', layer: 'evaluation', question: 'When an agent builds with it, does the result pass?', run: 'node lib/eval-run.mjs', team: 'what the team reviews in work an agent made, and what it sends back' },
];

const share = (a, b) => (b ? a / b : 0);
const by = (s, good, mixed) => (s >= good ? 'good' : s >= mixed ? 'mixed' : 'poor');
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const few = (list, n = 6) => `${list.slice(0, n).join(' · ')}${list.length > n ? ' · …' : ''}`;
const days = (h) => (h < 24 ? 'today' : `${plural(Math.floor(h / 24), 'day', 'days')} ago`);
const none = (why) => ({ rating: null, evidence: [], unseen: [why] });

// Each question from its own evidence. → { rating, evidence: [], unseen: [] }, rating null when none was read.
const ANSWER = {
  current({ ages }) {
    const read = Object.entries(ages ?? {}).filter(([, h]) => h != null);
    if (!read.length) return none('no Figma capture with a date to read');
    const [oldest, h] = read.sort((a, b) => b[1] - a[1])[0];
    const limit = ages.limitDays ?? 30;
    const evidence = [`${plural(read.length, 'capture', 'captures')} read, the oldest (${oldest}) taken ${days(h)}`];
    if (ages.lastRun != null) evidence.push(`last full check ${days(ages.lastRun)}`);
    const d = h / 24;
    return { rating: d <= Math.min(7, limit) ? 'good' : d <= limit ? 'mixed' : 'poor', evidence, unseen: [] };
  },
  agree({ differences, components }) {
    if (!differences) return none('Figma and the code not compared yet');
    const n = differences.total ?? 0, of = components || 1;
    const evidence = [`${plural(n, 'open difference', 'open differences')} between Figma and the code${components ? ` across ${plural(components, 'component', 'components')}` : ''}`];
    if (differences.kept) evidence.push(`${plural(differences.kept, 'difference', 'differences')} kept on purpose, each with its reason`);
    const unseen = (differences.notChecked ?? []).length ? [`${plural(differences.notChecked.length, 'comparison', 'comparisons')} not run`] : [];
    return { rating: !n ? 'good' : n / of <= 1 ? 'mixed' : 'poor', evidence, unseen };
  },
  names({ names }) {
    if (!names?.figma?.length || !names?.code?.length) return none(!names?.figma?.length ? 'no Figma capture' : 'no component code');
    const code = new Set(names.code.map(norm));
    const same = names.figma.filter((n) => code.has(norm(n)));
    const apart = names.figma.filter((n) => !code.has(norm(n)));
    const evidence = [`${same.length} of ${names.figma.length} Figma components have a component of the same name in the code`];
    if (apart.length) evidence.push(`named differently: ${few(apart)}`);
    const unseen = [];
    if (names.documented) {
      const doc = new Set(names.documented.map(norm));
      const undoc = names.figma.filter((n) => code.has(norm(n)) && !doc.has(norm(n)));
      evidence.push(`${same.length - undoc.length} of those also go by that name in the docs`);
    } else unseen.push('the docs, no intent layer read');
    return { rating: by(share(same.length, names.figma.length), 0.9, 0.6), evidence, unseen };
  },
  values({ census, components }) {
    if (!census) return none('no style files read');
    const { errors = 0, warnings = 0, files = 0, byKind = {} } = census;
    if (!errors && !warnings) return { rating: 'good', evidence: [`no value typed by hand in ${plural(files, 'style file', 'style files')} that a token should carry`], unseen: [] };
    const kinds = Object.entries(byKind).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${k}`);
    const evidence = [errors ? `${plural(errors, 'value', 'values')} typed by hand where the system has a token for it${warnings ? `, and ${warnings} more with no token to use yet` : ''}` : `${plural(warnings, 'value', 'values')} typed by hand with no token to use yet, so the system may lack a token`];
    if (kinds.length) evidence.push(`by kind: ${few(kinds, 5)}`);
    return { rating: errors / (components || 1) <= 1 ? 'mixed' : 'poor', evidence, unseen: [] };
  },
  rules({ gates }) {
    if (!gates?.length) return none('no full check run yet');
    const ran = gates.filter((g) => g.verdict === 'passes' || g.verdict === 'fails');
    if (!ran.length) return none('no check could run');
    const pass = ran.filter((g) => g.verdict === 'passes'), fail = ran.filter((g) => g.verdict === 'fails');
    const evidence = [`${pass.length} of ${ran.length} checks pass`];
    if (fail.length) evidence.push(`failing: ${few(fail.map((g) => g.check))}`);
    const not = gates.length - ran.length;
    return { rating: by(share(pass.length, ran.length), 0.9, 0.6), evidence, unseen: not ? [`${plural(not, 'check', 'checks')} not run`] : [] };
  },
  access({ a11y }) {
    if (!a11y) return none('no accessibility check run yet');
    const { blockers = 0, warnings = 0 } = a11y;
    const evidence = [`${plural(blockers, 'blocker', 'blockers')} and ${plural(warnings, 'warning', 'warnings')} against ${a11y.target ?? 'WCAG'}`];
    if (a11y.measured) evidence.push(`measured ${plural(a11y.measured.controls ?? 0, 'control', 'controls')} and ${plural(a11y.measured.texts ?? 0, 'text', 'texts')} in ${plural(a11y.measured.themes ?? 0, 'theme', 'themes')}`);
    const unseen = Object.entries(a11y.browsers ?? {}).filter(([, ran]) => !ran).map(([b]) => `${b}, not installed here`);
    if (a11y.partial) unseen.push('the check stopped before it measured everything');
    return { rating: blockers ? 'poor' : warnings ? 'mixed' : 'good', evidence, unseen };
  },
  proof({ tests }) {
    if (!tests?.components) return none('no component code');
    const evidence = [`${tests.tested} of ${tests.components} components have a test`, `${tests.shown} of ${tests.components} are drawn in a story`];
    return { rating: by(share(tests.tested, tests.components), 0.8, 0.3), evidence, unseen: ['whether the tests run before every release'] };
  },
  whole({ common }) {
    if (!common?.sides?.length) return none('no Figma capture, code or intent layer to read the parts nearly every product builds with from');
    const open = common.rows.filter((r) => r.kept === undefined);
    const all = open.filter((r) => common.sides.every((s) => r[s]?.length));
    const nowhere = open.filter((r) => common.sides.every((s) => !r[s]?.length));
    const evidence = [`${all.length} of ${open.length} parts nearly every product builds with are on every side read (${common.sides.join(' · ')})`];
    if (nowhere.length) evidence.push(`on no side: ${few(nowhere.map((r) => r.id))}`);
    const kept = common.rows.length - open.length;
    if (kept) evidence.push(`${plural(kept, 'part', 'parts')} left out on purpose`);
    const unseen = ['figma', 'code', 'documented'].filter((s) => !common.sides.includes(s)).map((s) => `the ${s === 'documented' ? 'intent layer' : s === 'figma' ? 'Figma file' : 'code'}, not read`);
    return { rating: by(share(all.length, open.length), 0.8, 0.5), evidence, unseen };
  },
  explained({ explained }) {
    if (!explained) return none('no intent layer read');
    const { components = 0, purpose = 0, use = 0 } = explained;
    if (!components) return none('no component to hold the intent layer to');
    const both = Math.min(purpose, use);
    const evidence = [`${purpose} of ${components} components say what they are for`, `${use} of ${components} say when to use them`];
    if (explained.missing?.length) evidence.push(`saying neither: ${few(explained.missing)}`);
    return { rating: by(share(both, components), 0.8, 0.4), evidence, unseen: [] };
  },
  releases({ governance }) {
    if (!governance) return none('the project is not its own repository, so no history to hold its documents to');
    const { rules, gaps } = governance;
    const stated = ['major', 'changelog', 'migration', 'conventional'].filter((k) => rules?.[k]);
    if (!stated.length) return none('no contribution guide, release process or changelog that states a rule');
    if (!gaps) return { rating: null, evidence: [`the documents state ${stated.length === 1 ? 'a rule' : 'rules'} for ${stated.join(' · ')}`], unseen: ['no release tagged to hold them to'] };
    const n = (gaps.breaking?.length ?? 0) + (gaps.unconventional ? 1 : 0);
    const evidence = [`${plural(gaps.checked?.releases ?? 0, 'release', 'releases')} held against the documents`, n ? `${plural(gaps.breaking?.length ?? 0, 'breaking change', 'breaking changes')} went out other than they say${gaps.unconventional ? `, and ${gaps.unconventional.commits.length} of ${gaps.unconventional.of} commits do not follow the commit convention` : ''}` : 'every release went out the way they say'];
    return { rating: !n ? 'good' : n <= 2 ? 'mixed' : 'poor', evidence, unseen: ['the tracker, unless its issues are read from GitLab'] };
  },
  products({ products, latest, compare, departures }) {
    if (!products?.length) return none('no product named in ds-config.json (pluginDirs, products)');
    const known = products.filter((p) => p.uses);
    const major = (v) => parseInt(String(v ?? '').replace(/^[^\d]*/, '').split('.')[0], 10);
    const behind = latest ? known.filter((p) => (compare ? compare(p.uses, latest) < 0 : p.uses !== latest)) : [];
    const majorBehind = latest ? known.filter((p) => major(p.uses) < major(latest)) : [];
    const evidence = [`${plural(products.length, 'product', 'products')} named, ${known.length} with the version it uses`];
    if (latest) evidence.push(`${known.length - behind.length} on the latest (${latest})${behind.length ? `, ${behind.length} behind${majorBehind.length ? `, ${majorBehind.length} by a major` : ''}` : ''}`);
    const built = departures?.length ?? 0;
    if (built) evidence.push(`${plural(built, 'product builds', 'products build')} its own copy or look-alike of a system component: ${few(departures)}`);
    const unseen = products.length > known.length ? [`the version of ${plural(products.length - known.length, 'product', 'products')}`] : [];
    if (!latest) return { rating: null, evidence, unseen: [...unseen, "the system's own version"] };
    return { rating: majorBehind.length > known.length / 2 ? 'poor' : behind.length || built ? 'mixed' : 'good', evidence, unseen };
  },
  learn({ machine, agents }) {
    if (!machine && !agents) return none('nothing read');
    const have = [machine?.llms && 'llms.txt', machine?.contracts && plural(machine.contracts, 'component contract', 'component contracts'), machine?.intentLayer && 'an intent layer', agents?.mcp && 'an MCP server set up', agents?.rules?.length && `agent instructions (${agents.rules.join(' · ')})`, agents?.codeConnect && plural(agents.codeConnect, 'Code Connect file', 'Code Connect files')].filter(Boolean);
    const evidence = [have.length ? `holds ${have.join(' · ')}` : 'no llms.txt, contract, intent layer, MCP server or agent instructions'];
    if (machine?.guidance) evidence.push(`what an agent can take from the guidance: ${machine.guidance}`);
    const reads = !!(machine?.llms && machine?.contracts), reaches = !!(agents?.mcp || agents?.rules?.length);
    const rating = reads && reaches && machine?.guidance !== 'thin' ? 'good' : have.length ? 'mixed' : 'poor';
    return { rating, evidence, unseen: machine?.guidance ? [] : ['how much an agent can take from the guidance'] };
  },
  built({ evals, invented }) {
    const names = invented ? Object.values(invented).reduce((n, k) => n + Object.keys(k ?? {}).length, 0) : 0;
    if (!evals) return { rating: null, evidence: names ? [`${plural(names, 'name', 'names')} agents invented here so far, each now refused by name`] : [], unseen: ['no evaluation of agent-built work run yet'] };
    const evidence = [`${evals.rate}% of agent-built cases passed with no fix, in the last evaluation (${evals.at})`];
    if (evals.violations) evidence.push(`${plural(evals.violations, 'break', 'breaks')} of the system's rules found in them`);
    if (names) evidence.push(`${plural(names, 'name', 'names')} agents invented here so far, each now refused by name`);
    return { rating: by(evals.rate / 100, 0.8, 0.5), evidence, unseen: [] };
  },
};

export function health(ev = {}) {
  return QUESTIONS.map((q) => ({ ...q, ...ANSWER[q.id](ev) }));
}

// What changed since the report before: a rating that went up or down. Unanswered on either side is not a change.
const RANK = { poor: 0, mixed: 1, good: 2 };
export function healthSince(rows, last) {
  if (!last?.ratings) return null;
  const better = [], worse = [];
  for (const r of rows) {
    const was = last.ratings[r.id];
    if (!r.rating || !was || was === r.rating) continue;
    (RANK[r.rating] > RANK[was] ? better : worse).push(r.id);
  }
  return { better, worse, at: last.at ?? null };
}
export const healthRecord = (rows, at = new Date().toISOString()) => ({ at, ratings: Object.fromEntries(rows.map((r) => [r.id, r.rating])) });

const MARK = { good: '🟢', mixed: '🟡', poor: '🔴' };
const word = (r) => r ?? 'not answered';
const q = (rows, id) => rows.find((r) => r.id === id)?.question ?? id;

// title, file: whose health it is and where the full report is written (a product's report reads the same).
export function healthLines(rows, since = null, { title = 'System health', file = 'system-health.md' } = {}) {
  const answered = rows.filter((r) => r.rating);
  const lines = [`🩺 ${title}: ${answered.length} of ${rows.length} questions answered from the engine's evidence (${['good', 'mixed', 'poor'].map((c) => `${answered.filter((r) => r.rating === c).length} ${c}`).join(' · ')}).`];
  if (since && (since.better.length || since.worse.length)) lines.push(`   Since the last report${since.at ? ` (${since.at.slice(0, 10)})` : ''}: ${[since.better.length && `${since.better.length} better`, since.worse.length && `${since.worse.length} worse (${since.worse.map((id) => q(rows, id)).join(' · ')})`].filter(Boolean).join(', ')}.`);
  else if (since) lines.push('   No rating changed since the last report.');
  for (const L of LAYERS) {
    lines.push(`   ${L.name}: ${L.asks}`);
    for (const r of rows.filter((x) => x.layer === L.id)) {
      lines.push(`   ${r.rating ? MARK[r.rating] : '⚪'} ${r.question} ${word(r.rating)}`);
      for (const e of r.evidence) lines.push(`      · ${e}`);
      for (const u of r.unseen) lines.push(`      · not seen: ${u}`);
      if (!r.rating) lines.push(`      · to answer it: ${r.run}`);
    }
  }
  lines.push(`   What only the team can tell is listed in ${file}, one line a question.`);
  return lines;
}

export function healthMarkdown(rows, { at = null, since = null, title = 'Design system health' } = {}) {
  const out = [`# ${title}`, '', `${rows.length} questions in the engine's four layers, each answered from what it read${at ? ` (${at})` : ''}. A question with no evidence is left unanswered and says the command that would answer it. Each one also names what only the team can tell.`, ''];
  if (since) out.push(since.better.length || since.worse.length ? `Since the last report: ${since.better.length} better, ${since.worse.length} worse.` : 'No rating changed since the last report.', '');
  out.push('| Layer | Question | Answer |', '|---|---|---|', ...rows.map((r) => `| ${LAYERS.find((L) => L.id === r.layer).name} | ${r.question} | ${word(r.rating)} |`), '');
  for (const L of LAYERS) {
    out.push(`## ${L.name}: ${L.asks}`, '');
    for (const r of rows.filter((x) => x.layer === L.id)) {
      out.push(`### ${r.question}`, '', `**${word(r.rating)}**`, '');
      for (const e of r.evidence) out.push(`- ${e}`);
      for (const u of r.unseen) out.push(`- Not seen: ${u}`);
      if (!r.rating) out.push(`- To answer it: \`${r.run}\``);
      out.push(`- Only the team can tell: ${r.team}`, '');
    }
  }
  return out.join('\n');
}

// ── reading the evidence ──
const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const walk = (dir, test, out = [], depth = 0) => {
  if (depth > 8) return out;
  let list;
  try { list = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of list) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!/^(node_modules|dist|build|coverage|out)$/.test(e.name) && !e.name.startsWith('.')) walk(p, test, out, depth + 1); }
    else if (test(e.name)) out.push(p);
  }
  return out;
};
const hoursSince = (iso) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000)) : null);

export async function readEvidence(ROOT, cfg = {}, OUT_DIR = '.design-system-engine-out') {
  const ev = {};
  const out = (f) => join(ROOT, OUT_DIR, f);
  const vars = cfg.paths?.snapshotVars ?? 'src/figma-vars.snapshot.json';
  const structPath = cfg.paths?.snapshotStructure ?? 'src/figma-structure.snapshot.json';
  const structure = readJson(resolve(ROOT, structPath));
  ev.ages = {};
  for (const f of [vars, structPath, cfg.paths?.compPropsSnapshot ?? vars.replace(/[^/\\]+$/, 'figma-component-props.snapshot.json')]) {
    const s = readJson(resolve(ROOT, f));
    if (s?._updated) ev.ages[f] = hoursSince(s._updated);
  }
  if (Number(cfg.maxSnapshotAgeDays) > 0) ev.ages.limitDays = Number(cfg.maxSnapshotAgeDays);
  try { ev.ages.lastRun = hoursSince(statSync(out('findings.json')).mtime.toISOString()); } catch { /* no run */ }
  const figma = Object.keys(structure?.components ?? {}).filter((n) => !n.startsWith('_'));
  const il = await import('./intent-layer.mjs');
  let codeFiles = {};
  try { codeFiles = il.codeFilesOf(ROOT, cfg); } catch { /* no code */ }
  const code = Object.keys(codeFiles);
  let layer = null;
  try { layer = il.readIntentLayer(ROOT, cfg); } catch { /* none */ }
  const docEntities = layer ? layer.entities.filter((e) => e.layer === 'components') : null;
  const documented = docEntities ? docEntities.map((e) => e.name) : null;
  if (cfg.commonSet !== false) {
    const cs = await import('./common-set.mjs');
    ev.common = cs.commonSet({ figma: figma.length ? figma : null, code: code.length ? code : null, documented }, { leaveOut: cs.leftOut(cfg) });
  }
  ev.gates = readJson(out('findings.json'))?.gates ?? null;
  const a = readJson(out('a11y.json'));
  ev.a11y = a ? { blockers: a.verdict?.blockers ?? 0, warnings: a.verdict?.warnings ?? 0, target: a.verdict?.target ?? null, partial: !!a.verdict?.partial, measured: a.measured ?? null, browsers: a.browsers ?? null } : null;
  ev.names = { figma, code, documented };
  ev.components = figma.length || code.length;
  try {
    const { censusOf } = await import('./raw-census.mjs');
    const c = censusOf(ROOT, cfg);
    ev.census = { errors: c.errors, warnings: c.warnings, files: c.files.length, byKind: c.byKind };
  } catch { ev.census = null; }
  if (docEntities) {
    const has = (e, k) => (Array.isArray(e[k]) ? e[k].length > 0 : !!e[k]);
    const of = code.length ? code : docEntities.map((e) => e.name);
    const byName = new Map(docEntities.map((e) => [norm(e.name), e]));
    const ent = of.map((n) => [n, byName.get(norm(n))]);
    ev.explained = { components: of.length, purpose: ent.filter(([, e]) => e && has(e, 'purpose')).length, use: ent.filter(([, e]) => e && has(e, 'whenToUse')).length, missing: ent.filter(([, e]) => !e || (!has(e, 'purpose') && !has(e, 'whenToUse'))).map(([n]) => n) };
  } else ev.explained = null;
  if (code.length) {
    const { codeRoots } = await import('./code-roots.mjs');
    const sys = codeRoots(ROOT, cfg)[0] ?? ROOT;
    const testFiles = walk(sys, (n) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(n)).map((p) => readFileSync(p, 'utf8') + '\n' + p);
    const stories = walk(sys, (n) => /\.stories\.[cm]?[jt]sx?$|\.stories\.mdx$/.test(n)).map((p) => slashed(p).split('/').pop());
    const named = (n, list) => list.some((t) => norm(t).includes(norm(n)));
    ev.tests = { components: code.length, tested: code.filter((n) => named(n, testFiles)).length, shown: code.filter((n) => named(n, stories)).length };
  } else ev.tests = null;
  const d = readJson(out('differences.json'));
  ev.differences = d ? { total: d.total ?? 0, kept: (d.kept ?? []).length, notChecked: d.notChecked ?? [] } : null;
  ev.governance = null;
  try {
    const top = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: ROOT, encoding: 'utf8', timeout: 5000 });
    if (top.status === 0 && realpathSync(String(top.stdout).trim()) === realpathSync(ROOT)) {
      const gv = await import('./governance.mjs'), { readReleases } = await import('./releases.mjs');
      const ls = (dir) => { try { return readdirSync(join(ROOT, dir)).map((f) => (dir === '.' ? f : `${dir}/${f}`)); } catch { return []; } };
      const git = (args) => { const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', timeout: 10000, maxBuffer: 32 * 1024 * 1024 }); return r.status === 0 ? r.stdout : ''; };
      ev.governance = gv.readGovernance({ read: (f) => { try { return readFileSync(join(ROOT, f), 'utf8'); } catch { return ''; } }, git, files: [...ls('.'), ...ls('docs')], records: readReleases(ROOT) });
    }
  } catch { /* no history */ }
  const rel = await import('./releases.mjs');
  ev.products = rel.productsOf(ROOT, cfg);
  ev.latest = rel.systemVersion(ROOT, cfg);
  ev.compare = rel.compareVersions;
  ev.departures = null;
  // The products that built beside the system, from what the last full run wrote (departures.json). It was read
  // through a function that never existed, so no report ever said one.
  const dep = readJson(out('departures.json'));
  if (Array.isArray(dep?.products)) ev.departures = dep.products.filter((b) => b.forks?.length || b.parallels?.length).map((b) => b.product);
  const contractsDir = resolve(ROOT, cfg.contracts?.out ?? 'contracts');
  const contracts = existsSync(contractsDir) ? readdirSync(contractsDir).filter((f) => f.endsWith('.contract.json')).length : 0;
  const guidance = readJson(out('guidance-rating.json'))?.cls ?? null;
  ev.machine = { llms: existsSync(join(contractsDir, 'llms.txt')) || existsSync(join(ROOT, 'llms.txt')), contracts, intentLayer: !!layer, guidance };
  const { RULE_FILES } = await import('./agent-rules.mjs');
  const mcp = ['.mcp.json', '.cursor/mcp.json', '.vscode/mcp.json'].some((f) => /mcp\.mjs|design-system-engine/.test((() => { try { return readFileSync(join(ROOT, f), 'utf8'); } catch { return ''; } })()));
  ev.agents = { mcp, rules: RULE_FILES.filter((f) => existsSync(join(ROOT, f))), codeConnect: walk(ROOT, (n) => /\.figma\.[jt]sx?$/.test(n)).length };
  const hist = readJson(join(ROOT, 'evals-history.json'));
  const last = Array.isArray(hist) ? [...hist].reverse().find((h) => h.zeroFixRate != null) : null;
  ev.evals = last ? { rate: last.zeroFixRate, violations: last.violations ?? 0, at: String(last.timestamp ?? '').slice(0, 10) } : null;
  try { ev.invented = (await import('./invented.mjs')).readInvented(ROOT); } catch { ev.invented = null; }
  return ev;
}

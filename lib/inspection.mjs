// inspection.mjs - the engine's results read as one inspection report.
//
// A design system inspection asks ten questions: coverage, best practices, accessibility, shared language, testing,
// orchestration across design, code and docs, governance, adoption, machine-readable docs and agent access. The engine
// already holds evidence for most of them, spread over its runs. This reads that evidence and answers each question
// with a rating (green, yellow or red) and what it rests on, says what the engine could not see, and names what only
// an interview answers. A question with no evidence gets no rating: it says so, never a guess.
//
//   inspect(evidence)            → [{ id, question, rating, evidence, unseen, interview }]
//   readEvidence(ROOT, cfg, out) → the evidence, each part null when the engine has nothing of it to read
//   inspectionLines(rows)        → the terminal's lines
//   inspectionMarkdown(rows)     → inspection.md

import { readFileSync, readdirSync, existsSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

export const QUESTIONS = [
  { id: 'coverage', question: 'Coverage: does the system hold what its products need?', interview: 'which needs the products have that no product has asked the system for yet' },
  { id: 'practices', question: 'Best practices: is it built the way it says it is?', interview: 'which rules the team holds that are written down nowhere' },
  { id: 'accessibility', question: 'Accessibility: can everyone use what it ships?', interview: 'how people who use assistive technology find it, tested with them' },
  { id: 'language', question: 'Shared language: do design and code call things by the same names?', interview: 'whether designers, developers and product people use those names when they talk' },
  { id: 'testing', question: 'Testing: is each component tested and shown?', interview: 'whether the tests are trusted and run before each release' },
  { id: 'orchestration', question: 'Orchestration: do design, code and docs say the same thing?', interview: 'how a change in one reaches the other two, and who carries it' },
  { id: 'governance', question: 'Governance: are changes made the way the team says they are?', interview: 'who decides what goes in, and how a product team asks' },
  { id: 'adoption', question: 'Adoption: do the products use it, and keep up?', interview: 'why a product that left did, and what would bring it back' },
  { id: 'machine', question: 'Machine-readable docs: can a tool read what the system is?', interview: 'which tools the team uses that read them' },
  { id: 'agents', question: 'Agent access: can an agent build with it the way a person would?', interview: 'what the team lets agents do, and what it reviews' },
];

const share = (a, b) => (b ? a / b : 0);

const by = (s, green, yellow) => (s >= green ? 'green' : s >= yellow ? 'yellow' : 'red');
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Each question from its own evidence. → { rating, evidence: [], unseen: [] }, rating null when none was read.
const ANSWER = {
  coverage({ common }) {
    if (!common?.sides?.length) return { rating: null, evidence: [], unseen: ['no Figma capture, code or intent layer to read the common set from'] };
    const open = common.rows.filter((r) => r.kept === undefined);
    const whole = open.filter((r) => common.sides.every((s) => r[s]?.length));
    const none = open.filter((r) => common.sides.every((s) => !r[s]?.length));
    const evidence = [`${whole.length} of ${open.length} common components on every side read (${common.sides.join(' · ')})`];
    if (none.length) evidence.push(`missing on every side: ${none.slice(0, 6).map((r) => r.id).join(' · ')}${none.length > 6 ? ' · …' : ''}`);
    const kept = common.rows.length - open.length;
    if (kept) evidence.push(`${plural(kept, 'gap', 'gaps')} left out on purpose`);
    const unseen = ['figma', 'code', 'documented'].filter((s) => !common.sides.includes(s)).map((s) => `the ${s === 'documented' ? 'intent layer' : s === 'figma' ? 'Figma file' : 'code'}, not read`);
    return { rating: by(share(whole.length, open.length), 0.8, 0.5), evidence, unseen };
  },
  practices({ gates }) {
    if (!gates?.length) return { rating: null, evidence: [], unseen: ['no full audit run yet'] };
    const checked = gates.filter((g) => g.verdict === 'passes' || g.verdict === 'fails');
    if (!checked.length) return { rating: null, evidence: [], unseen: ['no check could run'] };
    const pass = checked.filter((g) => g.verdict === 'passes'), fail = checked.filter((g) => g.verdict === 'fails');
    const evidence = [`${pass.length} of ${checked.length} checks pass`];
    if (fail.length) evidence.push(`failing: ${fail.slice(0, 6).map((g) => g.check).join(' · ')}${fail.length > 6 ? ' · …' : ''}`);
    const not = gates.length - checked.length;
    return { rating: by(share(pass.length, checked.length), 0.9, 0.6), evidence, unseen: not ? [`${plural(not, 'check', 'checks')} not run`] : [] };
  },
  accessibility({ a11y }) {
    if (!a11y) return { rating: null, evidence: [], unseen: ['no accessibility check run yet'] };
    const { blockers = 0, warnings = 0 } = a11y;
    const evidence = [`${plural(blockers, 'blocker', 'blockers')} and ${plural(warnings, 'warning', 'warnings')} against ${a11y.target ?? 'WCAG'}`];
    if (a11y.measured) evidence.push(`measured ${plural(a11y.measured.controls ?? 0, 'control', 'controls')} and ${plural(a11y.measured.texts ?? 0, 'text', 'texts')} in ${plural(a11y.measured.themes ?? 0, 'theme', 'themes')}`);
    const unseen = Object.entries(a11y.browsers ?? {}).filter(([, ran]) => !ran).map(([b]) => `${b}, not here to run in`);
    if (a11y.partial) unseen.push('the check stopped before it measured everything');
    return { rating: blockers ? 'red' : warnings ? 'yellow' : 'green', evidence, unseen };
  },
  language({ names }) {
    if (!names?.figma?.length || !names?.code?.length) return { rating: null, evidence: [], unseen: [!names?.figma?.length ? 'no Figma capture' : 'no component code'] };
    const code = new Set(names.code.map(norm));
    const same = names.figma.filter((n) => code.has(norm(n)));
    const apart = names.figma.filter((n) => !code.has(norm(n)));
    const evidence = [`${same.length} of ${names.figma.length} Figma components have a component of the same name in the code`];
    if (apart.length) evidence.push(`named apart: ${apart.slice(0, 6).join(' · ')}${apart.length > 6 ? ' · …' : ''}`);
    return { rating: by(share(same.length, names.figma.length), 0.9, 0.6), evidence, unseen: [] };
  },
  testing({ tests }) {
    if (!tests?.components) return { rating: null, evidence: [], unseen: ['no component code'] };
    const evidence = [`${tests.tested} of ${tests.components} components have a test`, `${tests.shown} of ${tests.components} have a story`];
    return { rating: by(share(Math.max(tests.tested, 0), tests.components), 0.8, 0.3), evidence, unseen: ['whether the tests run before each release'] };
  },
  orchestration({ differences, components }) {
    if (!differences) return { rating: null, evidence: [], unseen: ['no comparison of Figma and the code run yet'] };
    const n = differences.total ?? 0, of = components || 1;
    const evidence = [`${plural(n, 'open difference', 'open differences')} between Figma and the code${components ? ` across ${plural(components, 'component', 'components')}` : ''}`];
    if (differences.kept) evidence.push(`${plural(differences.kept, 'difference', 'differences')} kept on purpose, with a reason`);
    const unseen = (differences.notChecked ?? []).length ? [`${plural(differences.notChecked.length, 'comparison', 'comparisons')} not run`] : [];
    return { rating: !n ? 'green' : n / of <= 1 ? 'yellow' : 'red', evidence, unseen };
  },
  governance({ governance }) {
    if (!governance) return { rating: null, evidence: [], unseen: ['the project is not its own repository, so no history to hold its documents to'] };
    const { rules, gaps } = governance;
    const stated = ['major', 'changelog', 'migration', 'conventional'].filter((k) => rules?.[k]);
    if (!stated.length) return { rating: null, evidence: [], unseen: ['no contribution guide, release process or changelog that states a rule'] };
    if (!gaps) return { rating: null, evidence: [`the documents state ${stated.length === 1 ? 'a rule' : 'rules'} for ${stated.join(' · ')}`], unseen: ['no release tagged to hold them to'] };
    const n = (gaps.breaking?.length ?? 0) + (gaps.unconventional ? 1 : 0);
    const evidence = [`${plural(gaps.checked?.releases ?? 0, 'release', 'releases')} held against the documents`, n ? `${plural(gaps.breaking?.length ?? 0, 'breaking change', 'breaking changes')} went out other than they say${gaps.unconventional ? `, and ${gaps.unconventional.commits.length} of ${gaps.unconventional.of} commits do not follow the commit convention` : ''}` : 'every release went out the way they say'];
    return { rating: !n ? 'green' : n <= 2 ? 'yellow' : 'red', evidence, unseen: ['the tracker, unless its issues are read from GitLab'] };
  },
  adoption({ products, latest, compare }) {
    if (!products?.length) return { rating: null, evidence: [], unseen: ['no product named in ds-config.json (pluginDirs, products)'] };
    const known = products.filter((p) => p.uses);
    const major = (v) => parseInt(String(v ?? '').replace(/^[^\d]*/, '').split('.')[0], 10);
    const behind = latest ? known.filter((p) => (compare ? compare(p.uses, latest) < 0 : p.uses !== latest)) : [];
    const majorBehind = latest ? known.filter((p) => major(p.uses) < major(latest)) : [];
    const evidence = [`${plural(products.length, 'product', 'products')} named, ${known.length} with the version it uses`];
    if (latest) evidence.push(`${known.length - behind.length} on the latest (${latest})${behind.length ? `, ${behind.length} behind${majorBehind.length ? `, ${majorBehind.length} by a major` : ''}` : ''}`);
    const unseen = products.length > known.length ? [`the version of ${plural(products.length - known.length, 'product', 'products')}`] : [];
    if (!latest) return { rating: null, evidence, unseen: [...unseen, 'the system\'s own version'] };
    return { rating: majorBehind.length > known.length / 2 ? 'red' : behind.length ? 'yellow' : 'green', evidence, unseen };
  },
  machine({ machine }) {
    if (!machine) return { rating: null, evidence: [], unseen: ['nothing read'] };
    const have = [machine.llms && 'llms.txt', machine.contracts && plural(machine.contracts, 'component contract', 'component contracts'), machine.intentLayer && 'an intent layer'].filter(Boolean);
    const evidence = [have.length ? `holds ${have.join(' · ')}` : 'holds no llms.txt, contract or intent layer'];
    if (machine.guidance) evidence.push(`guidance rated ${machine.guidance}`);
    const rating = have.length === 3 && machine.guidance !== 'thin' ? 'green' : have.length ? 'yellow' : 'red';
    return { rating, evidence, unseen: machine.guidance ? [] : ['how much an agent takes from the guidance (--guidance-rating)'] };
  },
  agents({ agents }) {
    if (!agents) return { rating: null, evidence: [], unseen: ['nothing read'] };
    const have = [agents.mcp && 'an MCP server set up', agents.rules?.length && `agent instructions (${agents.rules.join(' · ')})`, agents.codeConnect && plural(agents.codeConnect, 'Code Connect file', 'Code Connect files')].filter(Boolean);
    const evidence = [have.length ? have.join(' · ') : 'no MCP server, agent instructions or Code Connect'];
    return { rating: agents.mcp && agents.rules?.length ? 'green' : have.length ? 'yellow' : 'red', evidence, unseen: [] };
  },
};

export function inspect(ev = {}) {
  return QUESTIONS.map((q) => ({ ...q, ...ANSWER[q.id](ev) }));
}

const MARK = { green: '🟢', yellow: '🟡', red: '🔴' };
const word = (r) => (r ? r : 'not rated');

export function inspectionLines(rows) {
  const rated = rows.filter((r) => r.rating);
  const lines = [`🔎 Inspection: ${rated.length} of ${rows.length} questions answered from the engine's evidence (${['green', 'yellow', 'red'].map((c) => `${rated.filter((r) => r.rating === c).length} ${c}`).join(' · ')}).`];
  for (const r of rows) {
    lines.push(`${r.rating ? MARK[r.rating] : '⚪'} ${r.question} ${word(r.rating)}`);
    for (const e of r.evidence) lines.push(`   · ${e}`);
    for (const u of r.unseen) lines.push(`   · not seen: ${u}`);
  }
  lines.push('   Only an interview answers the rest of each question: inspection.md says what to ask.');
  return lines;
}

export function inspectionMarkdown(rows, { at = null } = {}) {
  const out = ['# Design system inspection', '', `Ten questions, each answered from what the engine read${at ? ` (${at})` : ''}. A question with no evidence has no rating, and each says what only an interview answers.`, ''];
  out.push('| Question | Rating |', '|---|---|', ...rows.map((r) => `| ${r.question.split(':')[0]} | ${word(r.rating)} |`), '');
  for (const r of rows) {
    out.push(`## ${r.question}`, '', `**${word(r.rating)}**`, '');
    for (const e of r.evidence) out.push(`- ${e}`);
    for (const u of r.unseen) out.push(`- Not seen: ${u}`);
    out.push(`- Ask in an interview: ${r.interview}`, '');
  }
  return out.join('\n');
}

// ── reading the evidence ──
const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const walk = (dir, test, out = [], depth = 0) => {
  if (depth > 8) return out;
  let list = [];
  try { list = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of list) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!/^(node_modules|dist|build|coverage|out)$/.test(e.name) && !e.name.startsWith('.')) walk(p, test, out, depth + 1); }
    else if (test(e.name)) out.push(p);
  }
  return out;
};

export async function readEvidence(ROOT, cfg = {}, OUT_DIR = '.design-system-engine-out') {
  const ev = {};
  const out = (f) => join(ROOT, OUT_DIR, f);
  const structure = readJson(resolve(ROOT, cfg.paths?.snapshotStructure ?? 'src/figma-structure.snapshot.json'));
  const figma = Object.keys(structure?.components ?? {}).filter((n) => !n.startsWith('_'));
  const il = await import('./intent-layer.mjs');
  let codeFiles = {};
  try { codeFiles = il.codeFilesOf(ROOT, cfg); } catch { /* no code */ }
  const code = Object.keys(codeFiles);
  let layer = null;
  try { layer = il.readIntentLayer(ROOT, cfg); } catch { /* none */ }
  const documented = layer ? layer.entities.filter((e) => e.layer === 'components').map((e) => e.name) : null;
  if (cfg.commonSet !== false) {
    const cs = await import('./common-set.mjs');
    ev.common = cs.commonSet({ figma: figma.length ? figma : null, code: code.length ? code : null, documented }, { leaveOut: cs.leftOut(cfg) });
  }
  ev.gates = readJson(out('findings.json'))?.gates ?? null;
  const a = readJson(out('a11y.json'));
  ev.a11y = a ? { blockers: a.verdict?.blockers ?? 0, warnings: a.verdict?.warnings ?? 0, target: a.verdict?.target ?? null, partial: !!a.verdict?.partial, measured: a.measured ?? null, browsers: a.browsers ?? null } : null;
  ev.names = { figma, code };
  ev.components = figma.length || code.length;
  if (code.length) {
    const { codeRoots } = await import('./code-roots.mjs');
    const sys = codeRoots(ROOT, cfg)[0] ?? ROOT;
    const testFiles = walk(sys, (n) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(n)).map((p) => readFileSync(p, 'utf8') + '\n' + p);
    const stories = walk(sys, (n) => /\.stories\.[cm]?[jt]sx?$|\.stories\.mdx$/.test(n)).map((p) => p.split('/').pop());
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
  const contractsDir = resolve(ROOT, cfg.contracts?.out ?? 'contracts');
  const contracts = existsSync(contractsDir) ? readdirSync(contractsDir).filter((f) => f.endsWith('.contract.json')).length : 0;
  const guidance = readJson(out('guidance-rating.json'))?.cls ?? null;
  ev.machine = { llms: existsSync(join(contractsDir, 'llms.txt')) || existsSync(join(ROOT, 'llms.txt')), contracts, intentLayer: !!layer, guidance };
  const { RULE_FILES } = await import('./agent-rules.mjs');
  const mcp = ['.mcp.json', '.cursor/mcp.json', '.vscode/mcp.json'].some((f) => /mcp\.mjs|design-system-engine/.test((() => { try { return readFileSync(join(ROOT, f), 'utf8'); } catch { return ''; } })()));
  ev.agents = { mcp, rules: RULE_FILES.filter((f) => existsSync(join(ROOT, f))), codeConnect: walk(ROOT, (n) => /\.figma\.[jt]sx?$/.test(n)).length };
  return ev;
}

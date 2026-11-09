#!/usr/bin/env node
// test/skill-evals/run.mjs - run the skill evaluation. Spends model tokens; not in `node --test`.
//
//   node test/skill-evals/run.mjs --variant baseline|cookbook|skill|bare|mcp --model <id> --runs 5 --set dev|heldout|all|build|prototype|prototype-figma|route
//        [--route shell|both|mcp|none] [--only <task-id>] [--jobs 2] [--budget 3] [--ref <git ref for baseline>] [--resume] [--dry]
//        [--source <a project of your own>]
//
// --source measures the same tasks against a real design system instead of the four-component fixture: name a
// project set up with that team's profile, and the engine brings in what it reads. The system is never copied
// into this repository and never written to - each run gets a throwaway copy of the project, and the agent
// writes its prototype only there. Everything the run produces is that team's, so every row is private and goes
// under DESIGN_SYSTEM_ENGINE_EVAL_PRIVATE_OUT, which such a run requires.
//
// --route says how the agent reaches the engine (lib.mjs ROUTES): a shell (the default), the engine's MCP server with
// no shell (mcp), both, or neither. The route benchmark (--set route) runs the same tasks on each.
//
// A run the API refused (a usage limit, a 429) is not a result: nothing is written for it, the pool stops, and
// the same command with --resume carries on, skipping each (task, run) already in the results file. Without
// --resume, a results file that already has rows is refused, so two measurements never mix.
//
// Results: one JSON line per run in test/skill-evals/results/<variant>.<model>.jsonl (demo tasks), and the
// transcripts beside them (not committed). Private tasks (DESIGN_SYSTEM_ENGINE_EVAL_PRIVATE_TASKS) write only under
// DESIGN_SYSTEM_ENGINE_EVAL_PRIVATE_OUT, never in the repository.
import { mkdirSync, writeFileSync, appendFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeProject, makeHome, runClaude, context, decisionPoints, cleanup, keepFiles, projectHash, againstOwnProject, ENGINE, DEMO, cliOf, cliChange, cliLine, ROUTES } from './lib.mjs';
import { ROUTE_TASKS } from './route-tasks.mjs';
import { globalChecks } from './rules.mjs';
import { DEV } from './tasks.mjs';
import { engineFell, engineNeverStarted, kindOf } from './reading.mjs';
import { HELDOUT } from './heldout.mjs';
import { BUILD, TIDEPOOL } from './build-tasks.mjs';
import { PROTO, PROTO_FIGMA } from './proto-tasks.mjs';
import { variant } from './variants.mjs';
import { envVar } from '../../lib/names.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i === -1 ? d : process.argv[i + 1]; };
const V = arg('variant', 'baseline'), MODEL = arg('model', 'claude-sonnet-5'), RUNS = Number(arg('runs', 1)), SET = arg('set', 'dev');
const ROUTE = arg('route', 'shell');
if (!ROUTES[ROUTE]) { console.log(`✗ no route ${ROUTE}: ${Object.keys(ROUTES).join(', ')}`); process.exit(2); }
const ONLY = arg('only', null), JOBS = Number(arg('jobs', 2)), BUDGET = Number(arg('budget', 3)), DRY = process.argv.includes('--dry'), RESUME = process.argv.includes('--resume');
// --source <a project of your own>: the same tasks, measured against a real design system instead of the fixture.
// The system is never copied here and never written to: the project named is one set up with that team's profile,
// the engine brings in what it reads, and each run gets a throwaway copy of it so the agent writes only there.
//
// Everything such a run produces is a team's own: their component names in the files kept with each row, their
// words in the transcripts. So it is private by construction, not by how a task happens to be named. The results
// go where the team says and nowhere else, and every row is named so the recorder drops it (record.mjs, pruneRow).
const SOURCE = arg('source', null);
if (SOURCE && !existsSync(SOURCE)) { console.log(`✗ no project at ${SOURCE}`); process.exit(2); }
// Said before a single run starts, not when the first one goes to write: a measurement against somebody's own
// system with nowhere private to put the results is one that should not begin.
const PRIVATE_OUT = envVar(process.env, 'EVAL_PRIVATE_OUT');
if (SOURCE && !PRIVATE_OUT) { console.log('✗ --source measures a system that is somebody\'s own: set DESIGN_SYSTEM_ENGINE_EVAL_PRIVATE_OUT to a folder outside this repository for the results and transcripts.'); process.exit(2); }
// Outside this repository, and checked rather than trusted: a folder inside it is how a team's code gets committed
// by somebody who meant well, and the one time it happens is the time that matters.
if (SOURCE && !relative(ENGINE, resolve(PRIVATE_OUT)).startsWith('..')) { console.log(`✗ ${PRIVATE_OUT} is inside this repository, which is public. Point DESIGN_SYSTEM_ENGINE_EVAL_PRIVATE_OUT somewhere outside it.`); process.exit(2); }

let privateTasks = [];
const PRIVATE_TASKS = envVar(process.env, 'EVAL_PRIVATE_TASKS');
if (PRIVATE_TASKS && (SET === 'heldout' || SET === 'all' || SET === 'private')) {
  privateTasks = (await import(PRIVATE_TASKS)).PRIVATE.map((t) => ({ ...t, private: true }));
}
const sets = { dev: DEV, heldout: [...HELDOUT, ...privateTasks], private: privateTasks, all: [...DEV, ...HELDOUT, ...privateTasks], build: BUILD, prototype: PROTO, 'prototype-figma': PROTO_FIGMA, route: ROUTE_TASKS };
const tasks = againstOwnProject((sets[SET] ?? []).filter((t) => !ONLY || t.id === ONLY).map((t) => ({ ...t, set: BUILD.includes(t) ? 'build' : PROTO.includes(t) ? 'prototype' : PROTO_FIGMA.includes(t) ? 'prototype-figma' : ROUTE_TASKS.includes(t) ? 'route' : DEV.includes(t) ? 'dev' : 'heldout', source: BUILD.includes(t) || PROTO.includes(t) || PROTO_FIGMA.includes(t) ? TIDEPOOL : t.source })), SOURCE);
const vr = variant(V, { ref: arg('ref', undefined) });
const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 12);
const engineHash = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ENGINE, encoding: 'utf8' }).trim() + (execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: ENGINE, encoding: 'utf8' }).trim() ? '+dirty' : '');
const cliVersion = execFileSync('claude', ['--version'], { encoding: 'utf8' }).trim();
const meta = { variant: V, ref: vr.ref, guideHash: sha(vr.text), guideBytes: Buffer.byteLength(vr.text), engineHash, project: SOURCE ? projectHash(SOURCE) : SET === 'build' || SET === 'prototype' ? `${projectHash(TIDEPOOL)}+${projectHash(join(HERE, 'build-reference'))}` : projectHash(DEMO), model: MODEL, cliVersion, ...(ROUTE !== 'shell' || SET === 'route' ? { route: ROUTE } : {}) };
console.log(`${V}${ROUTE !== 'shell' ? ` by ${ROUTE}` : ''} (${vr.ref}, guide ${meta.guideHash}, ${meta.guideBytes} bytes) · ${MODEL} · ${tasks.length} tasks × ${RUNS} runs · engine ${engineHash} · project ${meta.project} · ${cliVersion}`);
if (DRY) { for (const t of tasks) console.log(`  ${t.set.padEnd(8)} ${t.id}`); process.exit(0); }

const outFor = (t) => (t.private ? envVar(process.env, 'EVAL_PRIVATE_OUT') : t.set === 'build' ? join(HERE, 'results', 'build') : t.set === 'prototype' ? join(HERE, 'results', 'prototype') : t.set === 'prototype-figma' ? join(HERE, 'results', 'prototype-figma') : t.set === 'route' ? join(HERE, 'results', 'route') : join(HERE, 'results'));
// A route other than the shell is a side of its own: its runs never mix with the shell's.
const SIDE = ROUTE !== 'shell' || SET === 'route' ? `${V}-${ROUTE}` : V;
const resultsFile = (t) => join(outFor(t), `${SIDE}.${MODEL}.jsonl`);

// What is already measured, per results file. Rows from another guide or engine never mix with this one.
const done = new Set();
for (const f of new Set(tasks.filter((t) => outFor(t)).map(resultsFile))) {
  if (!existsSync(f)) continue;
  const rows = readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  if (!rows.length) continue;
  if (!RESUME) { console.log(`✗ ${f} already has ${rows.length} rows: add --resume to carry on, or move it away to start again`); process.exit(2); }
  const other = rows.find((r) => r.guideHash !== meta.guideHash || r.engineHash !== meta.engineHash || (r.project && r.project !== meta.project));
  if (other) { console.log(`✗ ${f} has rows from guide ${other.guideHash} / engine ${other.engineHash}, not ${meta.guideHash} / ${engineHash}: move it away to start again`); process.exit(2); }
  for (const r of rows) done.add(`${r.task}#${r.run}`);
}
const jobs = tasks.flatMap((t) => Array.from({ length: RUNS }, (_, run) => ({ t, run }))).filter((j) => !done.has(`${j.t.id}#${j.run}`));
if (done.size) console.log(`resuming: ${done.size} runs already measured, ${jobs.length} to go`);

class Refused extends Error {}

async function one({ t, run }) {
  const out = outFor(t);
  if (!out) throw new Error('private tasks need DESIGN_SYSTEM_ENGINE_EVAL_PRIVATE_OUT');
  mkdirSync(join(out, 'transcripts'), { recursive: true });
  const dir = makeProject(t.source ?? DEMO, t.setup, { engine: vr.engine !== false, skillFiles: t.skillFiles ?? [] });
  const { home, path } = makeHome(vr, { cliOnPath: t.cliOnPath !== false });
  const events = [];
  let sessionId = null, error = null, limit = null;
  for (const prompt of t.prompts ?? [t.prompt]) {
    const r = await runClaude({ cwd: dir, home, path, prompt: `${vr.prefix ?? '/rms-design-system-engine '}${prompt}`, model: MODEL, resume: sessionId, budget: BUDGET, route: ROUTE });
    events.push(...r.events);
    sessionId = r.sessionId ?? sessionId;
    if (r.infra) {
      writeFileSync(join(out, 'transcripts', `${SIDE}.${MODEL}.${t.id}.${run}.refused.jsonl`), events.map((e) => JSON.stringify(e)).join('\n') + '\n');
      cleanup(dir, home);
      throw new Refused(r.infra);
    }
    // A ceiling this harness set, not the task being failed: kept on the row so a reading can tell the two apart.
    if (r.limit) { limit = r.limit; break; }
    if (r.error) { error = r.error; break; }
  }
  const ctx = context(events, dir);
  // Before a single check runs: a run whose shell could not start the engine measures this machine, not the guide.
  // Refused the way a run that is not logged in is, because scoring it is how 15 of 79 came to read as a guide
  // getting worse (8 November, when every run had lost node from its path). The no-engine side never trips this:
  // what it takes away is the engine's command, and node goes into every run's bin.
  const never = vr.engine !== false ? engineNeverStarted(ctx) : null;
  if (never) {
    writeFileSync(join(out, 'transcripts', `${SIDE}.${MODEL}.${t.id}.${run}.refused.jsonl`), events.map((e) => JSON.stringify(e)).join('\n') + '\n');
    cleanup(dir, home);
    throw new Refused(`the engine never started: all ${never.calls} call${never.calls === 1 ? '' : 's'} to it said "${never.said}"`);
  }
  let taskChecks;
  try { taskChecks = limit ? [{ name: 'the run was given room to finish', ok: false, detail: limit }] : error ? [{ name: 'the run finished', ok: false, detail: error }] : await t.score(ctx); }
  catch (e) { taskChecks = [{ name: 'the scorer ran', ok: false, detail: e.message }]; }
  const rules = globalChecks(ctx, t);
  // A run that reached an engine which fell over is not the agent's failure: it is kept on the row and counted
  // apart, the same as a run the harness stopped at its own ceiling.
  const fell = engineFell(ctx);
  // After the checks, so what they read is kept with the row and the row says what they read: a path missing from
  // `files` that is listed here was not there when the run was scored, and one listed nowhere is evidence this row
  // never held. Scoring the run again reads both (reading.mjs, `unanswerable`).
  const files = keepFiles(ctx, t.keep ?? []);
  const row = { ...meta, cli: cliOf(events), task: t.id, set: t.set, kind: kindOf(t), run, ...(fell ? { fell } : {}), pass: [...taskChecks, ...rules].every((c) => c.ok), checks: taskChecks, rules, usage: ctx.usage, calls: ctx.calls.length, mcpCalls: ctx.mcp.map((m) => m.tool), decisionPoints: decisionPoints(ctx), engineRuns: ctx.engine.length, enginePaths: [...new Set(ctx.engine.map((b) => b.command.match(/node\s+(\S*audit\.mjs)/)?.[1] ?? 'rms-design-system-engine'))], changed: ctx.changed, commits: ctx.commits, files, readPaths: [...ctx.readPaths].filter((p) => !ctx.tooBig.has(p)), error, limit, at: new Date().toISOString() };
  writeFileSync(join(out, 'transcripts', `${SIDE}.${MODEL}.${t.id}.${run}.jsonl`), events.map((e) => JSON.stringify(e)).join('\n') + '\n');
  appendFileSync(resultsFile(t), JSON.stringify(row) + '\n');
  cleanup(dir, home);
  console.log(`  ${fell ? '⚠' : row.pass ? '✓' : '✗'} ${t.id} #${run}  $${ctx.usage.cost.toFixed(2)}  ${ctx.usage.turns} turns${fell ? `  (the engine fell over: ${fell.said} — not the agent's failure)` : row.pass ? '' : `  (${[...taskChecks, ...rules].filter((c) => !c.ok).map((c) => c.name).join('; ')})`}`);
  return row;
}

// A small pool: each run starts a Claude session and, through the audit, a Chrome. A refused run stops it.
const rows = [];
let next = 0, refused = null;
await Promise.all(Array.from({ length: Math.max(1, JOBS) }, async () => {
  while (!refused && next < jobs.length) {
    const j = jobs[next++];
    try { rows.push(await one(j)); } catch (e) {
      if (e instanceof Refused) { refused ??= e.message; console.log(`  ⏸ ${j.t.id} #${j.run}  not run: ${e.message}`); } else console.log(`  ✗ ${j.t.id} #${j.run}  harness error: ${e.message}`);
    }
  }
}));
const cost = rows.reduce((k, r) => k + r.usage.cost, 0);
console.log(`\n${rows.filter((r) => r.pass).length}/${rows.length} passed · $${cost.toFixed(2)}`);
// Loudest of all, and before anything else is read: a run that reached an engine which fell over measures the
// engine, not the guide. A score read past this line is a score about the wrong thing.
const fellRows = rows.filter((r) => r.fell);
if (fellRows.length) {
  console.log(`\n⚠️  ${fellRows.length} of ${rows.length} runs reached an engine that fell over. This measures the engine, not the guide: fix it and measure again.`);
  for (const r of fellRows.slice(0, 5)) console.log(`     ${r.task} #${r.run}: ${r.fell.said} — ${r.fell.command}`);
}
// The agent's bundled skills, against the last recorded evaluation's: a new command line is said, never read as the guide.
try {
  const { readFolder } = await import('./summarize.mjs');
  const prev = /Records: `records\/([^`]+)`/.exec(readFileSync(join(HERE, 'RESULTS.md'), 'utf8'))?.[1];
  const before = prev && existsSync(join(HERE, 'records', prev)) ? readFolder(join(HERE, 'records', prev)).flatMap((x) => x.rows) : [];
  const said = cliLine(cliChange(rows, before));
  if (said) console.log(`⚠️  ${said}`);
} catch { /* no record to compare with */ }
const left = jobs.length - rows.length;
// The API key's credits are spent: waiting for a usage limit to reset never brings them back, so this stops rather than pausing.
if (refused && /credit balance (is )?too low/i.test(refused)) { console.log('✗ the API key has no credits left: the runs carry on with --resume once next month\'s credits arrive, or with credits bought in the Console.'); process.exit(2); }
// A run with no login never gets one by waiting: stop, so continuous.mjs does not wait out a usage limit that is not there.
if (refused && /not logged in/i.test(refused)) { console.log('✗ a run is not logged in: its fresh HOME holds no login (macOS keeps it in the keychain). Run `claude setup-token` and set CLAUDE_CODE_OAUTH_TOKEN (billed to the plan), or put an API key in ~/.config/rms-engine/anthropic-key (chmod 600) or ANTHROPIC_API_KEY (its API credits, through the Agent SDK: npm ci --prefix test/.eval-tools).'); process.exit(2); }
// The machine, not the API: no limit resets into a node that is on the path, so this stops rather than pausing.
if (refused && /the engine never started/.test(refused)) { console.log(`✗ ${refused}. A run's shell starts from a fresh HOME with no profile, so only the PATH makeHome hands it says where node is: check that \`${process.execPath}\` is still there and runnable. Nothing was scored — a run that never reached the engine says nothing about the guide.`); process.exit(2); }
if (refused) console.log(`⏸ stopped: the API refused a run (${refused}). ${left} runs not measured; run the same command with --resume after the limit resets.`);
else if (left) console.log(`⚠ ${left} runs failed in the harness; run the same command with --resume to retry them.`);
// 3: the API refused a run, so waiting helps; 4: runs failed in the harness, which waiting for a limit never fixes.
process.exit(refused ? 3 : left ? 4 : 0);

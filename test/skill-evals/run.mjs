#!/usr/bin/env node
// test/skill-evals/run.mjs - run the skill evaluation (idea I55). Spends model tokens; not in `node --test`.
//
//   node test/skill-evals/run.mjs --variant baseline|cookbook|skill --model <id> --runs 5 --set dev|heldout|all
//        [--only <task-id>] [--jobs 3] [--budget 3] [--ref <git ref for baseline>] [--dry]
//
// Results: one JSON line per run in test/skill-evals/results/<variant>.<model>.jsonl (demo tasks), and the
// transcripts beside them (not committed). Private tasks (PARITY_EVAL_PRIVATE_TASKS) write only under
// PARITY_EVAL_PRIVATE_OUT, never in the repository.
import { mkdirSync, writeFileSync, appendFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeProject, makeHome, runClaude, context, decisionPoints, cleanup, ENGINE, DEMO } from './lib.mjs';
import { globalChecks } from './rules.mjs';
import { DEV } from './tasks.mjs';
import { HELDOUT } from './heldout.mjs';
import { variant } from './variants.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i === -1 ? d : process.argv[i + 1]; };
const V = arg('variant', 'baseline'), MODEL = arg('model', 'claude-sonnet-5'), RUNS = Number(arg('runs', 1)), SET = arg('set', 'dev');
const ONLY = arg('only', null), JOBS = Number(arg('jobs', 3)), BUDGET = Number(arg('budget', 3)), DRY = process.argv.includes('--dry');

let privateTasks = [];
if (process.env.PARITY_EVAL_PRIVATE_TASKS && (SET === 'heldout' || SET === 'all' || SET === 'private')) {
  privateTasks = (await import(process.env.PARITY_EVAL_PRIVATE_TASKS)).PRIVATE.map((t) => ({ ...t, private: true }));
}
const sets = { dev: DEV, heldout: [...HELDOUT, ...privateTasks], private: privateTasks, all: [...DEV, ...HELDOUT, ...privateTasks] };
const tasks = (sets[SET] ?? []).filter((t) => !ONLY || t.id === ONLY).map((t) => ({ ...t, set: DEV.includes(t) ? 'dev' : 'heldout' }));
const vr = variant(V, { ref: arg('ref', undefined) });
const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 12);
const engineHash = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ENGINE, encoding: 'utf8' }).trim() + (execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: ENGINE, encoding: 'utf8' }).trim() ? '+dirty' : '');
const cliVersion = execFileSync('claude', ['--version'], { encoding: 'utf8' }).trim();
const meta = { variant: V, ref: vr.ref, guideHash: sha(vr.text), guideBytes: Buffer.byteLength(vr.text), engineHash, model: MODEL, cliVersion };
console.log(`${V} (${vr.ref}, guide ${meta.guideHash}, ${meta.guideBytes} bytes) · ${MODEL} · ${tasks.length} tasks × ${RUNS} runs · engine ${engineHash} · ${cliVersion}`);
if (DRY) { for (const t of tasks) console.log(`  ${t.set.padEnd(8)} ${t.id}`); process.exit(0); }

const outFor = (t) => (t.private ? process.env.PARITY_EVAL_PRIVATE_OUT : join(HERE, 'results'));
const jobs = tasks.flatMap((t) => Array.from({ length: RUNS }, (_, run) => ({ t, run })));

async function one({ t, run }) {
  const out = outFor(t);
  if (!out) throw new Error('private tasks need PARITY_EVAL_PRIVATE_OUT');
  mkdirSync(join(out, 'transcripts'), { recursive: true });
  const dir = makeProject(t.source ?? DEMO, t.setup);
  const { home, path } = makeHome(vr, { cliOnPath: t.cliOnPath !== false });
  const events = [];
  let sessionId = null, error = null;
  for (const prompt of t.prompts ?? [t.prompt]) {
    const r = await runClaude({ cwd: dir, home, path, prompt: `/rms-figma-code-parity ${prompt}`, model: MODEL, resume: sessionId, budget: BUDGET });
    events.push(...r.events);
    sessionId = r.sessionId ?? sessionId;
    if (r.error) { error = r.error; break; }
  }
  const ctx = context(events, dir);
  const taskChecks = error ? [{ name: 'the run finished', ok: false, detail: error }] : t.score(ctx);
  const rules = globalChecks(ctx, t);
  const row = { ...meta, task: t.id, set: t.set, run, pass: [...taskChecks, ...rules].every((c) => c.ok), checks: taskChecks, rules, usage: ctx.usage, calls: ctx.calls.length, decisionPoints: decisionPoints(ctx), engineRuns: ctx.engine.length, changed: ctx.changed, at: new Date().toISOString() };
  writeFileSync(join(out, 'transcripts', `${V}.${MODEL}.${t.id}.${run}.jsonl`), events.map((e) => JSON.stringify(e)).join('\n') + '\n');
  appendFileSync(join(out, `${V}.${MODEL}.jsonl`), JSON.stringify(row) + '\n');
  cleanup(dir, home);
  console.log(`  ${row.pass ? '✓' : '✗'} ${t.id} #${run}  $${ctx.usage.cost.toFixed(2)}  ${ctx.usage.turns} turns${row.pass ? '' : `  (${[...taskChecks, ...rules].filter((c) => !c.ok).map((c) => c.name).join('; ')})`}`);
  return row;
}

// A small pool: each run starts a Claude session and, through the audit, a Chrome.
const rows = [];
let next = 0;
await Promise.all(Array.from({ length: Math.max(1, JOBS) }, async () => {
  while (next < jobs.length) { const j = jobs[next++]; try { rows.push(await one(j)); } catch (e) { console.log(`  ✗ ${j.t.id} #${j.run}  harness error: ${e.message}`); } }
}));
const cost = rows.reduce((k, r) => k + r.usage.cost, 0);
console.log(`\n${rows.filter((r) => r.pass).length}/${rows.length} passed · $${cost.toFixed(2)}`);

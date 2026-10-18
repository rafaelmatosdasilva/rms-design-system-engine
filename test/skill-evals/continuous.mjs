#!/usr/bin/env node
// test/skill-evals/continuous.mjs - the evaluation a guide change needs, run and recorded in one command.
//
//   node test/skill-evals/continuous.mjs [--model claude-haiku-4-5-20251001] [--name <record>] [--title "…"] [--what "…"]
//
// Runs the guide tasks with the skill on the committed engine (3 runs each, new-ui-saved at 10), waits out a usage
// limit and carries on where it stopped, then records the runs (record.mjs --entry): the RESULTS.md entry, the records
// folder and its README row. A results file left by another guide or engine is moved aside first, never mixed in.
// Exits 1 when a run failed, with each failed check listed, so the engine is fixed before the change ships.
import { spawnSync, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = dirname(dirname(HERE));
const argv = process.argv.slice(2);
const opt = (k, d = null) => { const i = argv.indexOf(`--${k}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const MODEL = opt('model', 'claude-haiku-4-5-20251001');
const WAIT_MIN = Number(opt('wait', 15));
const git = (...a) => execFileSync('git', a, { cwd: ENGINE, encoding: 'utf8' }).trim();

// Only a committed engine is measured: the record names the commit, and a guide that is not committed cannot be named.
if (git('status', '--porcelain', '--untracked-files=no')) { console.log('✗ commit the change first: the evaluation measures a committed engine'); process.exit(2); }
const engine = git('rev-parse', '--short', 'HEAD');

// The audit's browser checks (every variant combination, the rendered page) run in Chrome: without one they are
// skipped and the tasks that ask for what they find fail for a reason that is not the guide's. Found here once.
if (!process.env.CHROME_PATH) {
  const { findChrome } = await import(join(ENGINE, 'cdp.mjs'));
  const found = findChrome({ playwright: true });
  if (!found) { console.log('✗ no Chrome found: set CHROME_PATH, the audit\'s browser checks need it'); process.exit(2); }
  process.env.CHROME_PATH = found;
}
console.log(`Chrome: ${process.env.CHROME_PATH}`);

// A results file from another engine or guide is moved aside, so this measurement starts clean and never mixes.
const file = join(HERE, 'results', `cookbook.${MODEL}.jsonl`);
if (existsSync(file)) {
  const rows = readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  if (rows.some((r) => r.engineHash !== engine)) {
    mkdirSync(join(HERE, 'results', 'old'), { recursive: true });
    const to = join(HERE, 'results', 'old', `cookbook.${MODEL}.${rows[0].engineHash}.${Date.now()}.jsonl`);
    renameSync(file, to);
    console.log(`moved the runs of engine ${rows[0].engineHash} aside: ${to}`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function step(args) {
  for (let attempt = 1; attempt <= 60; attempt++) {
    const r = spawnSync(process.execPath, [join(HERE, 'run.mjs'), '--variant', 'cookbook', '--model', MODEL, ...args, '--resume'], { cwd: ENGINE, stdio: 'inherit' });
    if (r.status === 0) return;
    if (r.status !== 3) { console.log(`✗ run.mjs stopped (exit ${r.status})`); process.exit(r.status ?? 2); }
    console.log(`… paused by a usage limit, carrying on in ${WAIT_MIN} min`);
    await sleep(WAIT_MIN * 60 * 1000);
  }
  console.log('✗ still paused after 60 tries'); process.exit(3);
}
await step(['--runs', '3', '--set', 'all', '--jobs', '3']);
await step(['--runs', '10', '--only', 'new-ui-saved', '--jobs', '3']);

const slug = git('log', '-1', '--format=%s').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').trim().split(/\s+/).slice(0, 5).join('-');
// Never over an earlier record: a day's runs from commits worded alike get -2, -3.
const base = `${new Date().toISOString().slice(0, 10)}-${slug}`;
let free = base; for (let n = 2; existsSync(join(HERE, 'records', free)); n++) free = `${base}-${n}`;
const name = opt('name', free);
const rec = spawnSync(process.execPath, [join(HERE, 'record.mjs'), name, file, '--entry',
  ...(opt('title') ? ['--title', opt('title')] : []), ...(opt('what') ? ['--what', opt('what')] : [])], { cwd: ENGINE, stdio: 'inherit' });
process.exit(rec.status ?? 2);

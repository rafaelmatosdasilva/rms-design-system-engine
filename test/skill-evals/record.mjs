#!/usr/bin/env node
// test/skill-evals/record.mjs - keep the runs of an evaluation in the repository, next to what RESULTS.md says of them.
//
//   node test/skill-evals/record.mjs <name> <results folder or file>… [--entry] [--title "…"] [--what "…"]
//
// With --entry it also writes what RESULTS.md says of the runs, so recording an evaluation is one step: the entry
// (the guide set and project measured, what changed since the entry before, from the commits and the guide files
// they touched, and per model the pass count, cost, input and rule violations against the runs recorded for the
// entry before) and the row in records/README.md. Every failed check is printed and the command exits 1, so a
// problem the runs show goes back to the engine before the change ships.
//
// Copies each result file into test/skill-evals/records/<name>/ (a build/ or prototype/ file keeps its folder), every
// row as it was scored, without what is not the run's own work or must stay out of the repository: private tasks
// (private-*), packages a run installed (node_modules, lockfiles, build output), and anything past 40 KB in one file.
// Transcripts are never copied (they stay in results/, gitignored). Rescore and summarize read the copies as they read
// results/.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'node:fs';
import { readingLine } from './reading.mjs';
import { homedir } from 'node:os';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const SKIP = /(^|\/)(node_modules|\.cache|dist|build\/static|coverage)(\/|$)|(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?)$/;
const MAX = 40 * 1024;

export function pruneRow(row) {
  if (/^private/.test(row.task)) return null;
  const files = {};
  for (const [p, t] of Object.entries(row.files ?? {})) {
    if (SKIP.test(p)) continue;
    const text = String(t ?? '');
    files[p] = text.length > MAX ? `${text.slice(0, MAX)}\n… (${text.length - MAX} more characters left out of the record)` : t;
  }
  return { ...row, changed: (row.changed ?? []).filter((p) => !SKIP.test(p)), files };
}

function sources(p) {
  if (statSync(p).isFile()) return [{ path: p, sub: /\/(build|prototype)\/[^/]+$/.exec(p)?.[1] ?? '' }];
  const out = [];
  for (const f of readdirSync(p)) {
    const q = join(p, f);
    if (f.endsWith('.jsonl')) out.push({ path: q, sub: ['build', 'prototype'].includes(basename(p)) ? basename(p) : '' });
    else if (['build', 'prototype'].includes(f) && statSync(q).isDirectory()) for (const g of readdirSync(q)) if (g.endsWith('.jsonl')) out.push({ path: join(q, g), sub: f });
  }
  return out;
}

const MODEL_NAME = (m) => (/opus/.test(m) ? 'Opus' : /sonnet/.test(m) ? 'Sonnet' : /haiku/.test(m) ? 'Haiku' : m);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
// What a set of runs of one model says: tasks, runs, passes, cost and input a run, rule violations, failed checks.
export function runStats(rows = []) {
  const byTask = new Map();
  for (const r of rows) byTask.set(r.task, (byTask.get(r.task) ?? 0) + 1);
  const usual = Math.min(...byTask.values());
  return {
    tasks: byTask.size, runs: rows.length, pass: rows.filter((r) => r.pass).length,
    more: [...byTask].filter(([, n]) => n > usual).map(([t, n]) => `\`${t}\` at ${n} runs`),
    cost: mean(rows.map((r) => r.usage?.cost ?? 0)), input: mean(rows.map((r) => r.usage?.input ?? 0)),
    violations: rows.reduce((n, r) => n + (r.rules ?? []).filter((c) => !c.ok).length, 0),
    // Runs the harness stopped at its own ceiling (turns, budget). Counted apart: a run never allowed to finish says
    // nothing about the guide, and reading it as a failure is how a task came to read 69/70 on a branch that had not
    // touched it. A number here means the ceiling wants raising, not that the skill got worse.
    limits: rows.filter((r) => r.limit).length,
    limited: rows.filter((r) => r.limit).map((r) => `${r.task} #${r.run}: ${r.limit}`),
    // Runs that reached an engine which fell over. The same reasoning as the ceiling above, from the other side: the
    // agent did everything right, got a stack back, and was marked down for what the engine failed to say. A number
    // here means the measurement is about the engine, and reading it as the guide is how 66/70 was believed once.
    fell: rows.filter((r) => r.fell).length,
    fellOver: rows.filter((r) => r.fell).map((r) => `${r.task} #${r.run}: ${r.fell.said} (${r.fell.command})`),
    rows,
    failed: rows.flatMap((r) => [...(r.checks ?? []), ...(r.rules ?? [])].filter((c) => !c.ok).map((c) => `${r.task} #${r.run}: ${c.name}${c.detail ? ` (${c.detail})` : ''}`)),
    engine: [...new Set(rows.map((r) => r.engineHash))].join(', '), project: rows[0]?.project ?? '',
  };
}

// The RESULTS.md entry for one recorded evaluation. `now` and `before` are { model: runStats } (before may be empty).
export function resultsEntry({ title, what, guideFiles = [], prevEngine = '', guideSet, now, before = {}, name, cli = '', date = new Date().toISOString().slice(0, 7) }) {
  const k = (x) => `${Math.round(x / 1000)}k`, usd = (x) => `$${x.toFixed(3)}`;
  const out = [`## ${date}: ${title} (continuous evaluation)`, ''];
  out.push(`What changed since the entry below${prevEngine ? ` (engine ${prevEngine})` : ''}: ${what}${/[.!?]$/.test(what) ? '' : '.'}${guideFiles.length ? ` The guide changed in ${guideFiles.map((f) => `\`${f}\``).join(', ')}.` : ''}`, '');
  const project = Object.values(now)[0]?.project ?? '';
  out.push(`Guide set measured: \`${guideSet}\` · Project measured: \`${project}\``, '');
  if (cli) out.push(`**The agent's command line changed.** ${cli.charAt(0).toUpperCase()}${cli.slice(1)}`, '');
  const reading = [];
  for (const [model, s] of Object.entries(now)) {
    const b = before[model];
    out.push(`| ${MODEL_NAME(model)}, engine ${s.engine} | Entry below | This version |`, '|---|---|---|');
    out.push(`| The ${s.tasks} guide tasks${s.more.length ? ` (${s.more.join(', ')})` : ''} | ${b ? `${b.pass}/${b.runs}` : '-'} | ${s.pass}/${s.runs} |`);
    out.push(`| Mean cost a run | ${b ? usd(b.cost) : '-'} | ${usd(s.cost)} |`);
    out.push(`| Input a run | ${b ? k(b.input) : '-'} | ${k(s.input)} |`);
    out.push(`| Rule violations | ${b ? b.violations : '-'} | ${s.violations} |`);
    if (s.limits || b?.limits) out.push(`| Runs stopped at a limit | ${b ? b.limits ?? 0 : '-'} | ${s.limits} |`);
    if (s.fell || b?.fell) out.push(`| Runs that reached an engine that fell over | ${b ? b.fell ?? 0 : '-'} | ${s.fell} |`);
    out.push('');
    const lower = b && s.pass / s.runs < b.pass / b.runs;
    reading.push(s.pass === s.runs && !s.violations
      ? `${MODEL_NAME(model)}: every task passes and no rule is broken${b ? `; runs read ${k(s.input)} a run against ${k(b.input)}` : ''}.`
      : `${MODEL_NAME(model)}: ${s.runs - s.pass} of ${s.runs} runs failed${lower ? ', fewer passes than the entry below' : ''}${s.violations ? `, ${s.violations} rule violation${s.violations === 1 ? '' : 's'}` : ''}${s.limits ? `, and ${s.limits} of them never finished: ${s.limited.slice(0, 3).join('; ')} — read those as the ceiling, not the guide` : ''}. Failed: ${s.failed.slice(0, 6).join('; ')}.`);
    // What actually changed, task by task: a count that moved by one is a task that passes sometimes, not a
    // difference. Said after the failures, because it is what a person should act on.
    if (b?.rows?.length && s.rows?.length) reading.push(readingLine(b.rows, s.rows));
    // And loudest of all, because it says the measurement is not about the guide at all.
    if (s.fell) reading.push(`${s.fell} run${s.fell === 1 ? '' : 's'} reached an engine that fell over (${s.fellOver.slice(0, 3).join('; ')}): this measures the engine, not the guide. Fix it and measure again.`);
  }
  out.push(`**Reading.** ${reading.join(' ')} Records: \`records/${name}\`.`, '');
  return out.join('\n');
}

const sh = (args, cwd) => { try { return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim(); } catch { return ''; } };
const GUIDE_PATHS = ['rms-design-system-engine.md', 'cookbook', 'reference'];

if (process.argv[1] && process.argv[1].endsWith('record.mjs')) {
  const argv = process.argv.slice(2);
  const opt = (k) => { const i = argv.indexOf(`--${k}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null; };
  const ENTRY = argv.includes('--entry');
  const [name, ...from] = argv.filter((a, i) => !a.startsWith('--') && !['--title', '--what'].includes(argv[i - 1]));
  if (!name || !from.length || !from.every(existsSync)) { console.log('Usage: node test/skill-evals/record.mjs <name> <results folder or file>…'); process.exit(2); }
  for (const src of from.flatMap(sources)) {
    const rows = readFileSync(src.path, 'utf8').split('\n').filter(Boolean).map((l) => pruneRow(JSON.parse(l))).filter(Boolean);
    const dir = join(HERE, 'records', name, src.sub);
    mkdirSync(dir, { recursive: true });
    // A path on this computer is written from ~ (a run names the engine where it lives): a record never carries a
    // person's home folder.
    const home = homedir();
    writeFileSync(join(dir, basename(src.path)), rows.map((r) => JSON.stringify(r).split(home).join('~')).join('\n') + '\n');
    console.log(`${join('records', name, src.sub, basename(src.path))}: ${rows.length} rows`);
  }
  if (ENTRY) {
    const ENGINE = dirname(dirname(HERE));
    const { readFolder } = await import('./summarize.mjs');
    const { guideSetHash } = await import('../../skill-files.mjs');
    const sidesOf = (dir) => Object.fromEntries(readFolder(dir).filter((x) => x.set === 'guide').map((x) => [x.model, runStats(x.rows)]));
    const now = sidesOf(join(HERE, 'records', name));
    const engines = [...new Set(Object.values(now).flatMap((x) => x.engine.split(', ')))];
    if (engines.length !== 1 || /dirty/.test(engines[0])) { console.log(`✗ the runs come from ${engines.join(', ')}: one committed engine only`); process.exit(2); }
    // The guide measured must be the guide here: no guide file changed between the measured engine and this checkout.
    const moved = sh(['diff', '--name-only', engines[0], 'HEAD', '--', ...GUIDE_PATHS], ENGINE);
    if (moved) { console.log(`✗ the guide changed after the measured engine ${engines[0]}: ${moved.split('\n').join(', ')}; measure again`); process.exit(2); }
    const results = readFileSync(join(HERE, 'RESULTS.md'), 'utf8');
    const prevName = /Records: `records\/([^`]+)`/.exec(results)?.[1];
    const before = prevName && existsSync(join(HERE, 'records', prevName)) ? sidesOf(join(HERE, 'records', prevName)) : {};
    const prevEngine = [...new Set(Object.values(before).map((x) => x.engine))][0] ?? '';
    const range = prevEngine ? `${prevEngine}..${engines[0]}` : `${engines[0]}~1..${engines[0]}`;
    // What changed: the commits in between, without the ones that only recorded an evaluation (RESULTS.md, records/).
    const recordOnly = (h) => sh(['show', '--name-only', '--format=', h], ENGINE).split('\n').filter(Boolean).every((f) => /^test\/skill-evals\/(RESULTS\.md|records\/)/.test(f));
    const subjects = sh(['log', '--no-merges', '--format=%h %s', range], ENGINE).split('\n').filter(Boolean).reverse()
      .filter((l) => !recordOnly(l.split(' ')[0])).map((l) => l.slice(l.indexOf(' ') + 1));
    const guideFiles = sh(['diff', '--name-only', ...range.split('..'), '--', ...GUIDE_PATHS], ENGINE).split('\n').filter(Boolean);
    const title = opt('title') ?? sh(['log', '-1', '--format=%s', engines[0]], ENGINE);
    const what = opt('what') ?? subjects.join('; ');
    // The agent's bundled skills against the entry before's: a new command line is said in the entry, apart from the guide.
    const { cliChange, cliLine } = await import('./lib.mjs');
    const rowsOf = (dir) => (dir && existsSync(dir) ? readFolder(dir).filter((x) => x.set === 'guide').flatMap((x) => x.rows) : []);
    const cli = cliLine(cliChange(rowsOf(join(HERE, 'records', name)), rowsOf(prevName && join(HERE, 'records', prevName))));
    const entry = resultsEntry({ title, what, guideFiles, prevEngine, guideSet: guideSetHash(ENGINE), now, before, name, cli });
    const at = results.indexOf('\n## ');
    writeFileSync(join(HERE, 'RESULTS.md'), at < 0 ? `${results.trimEnd()}\n\n${entry}` : `${results.slice(0, at + 1)}${entry}\n${results.slice(at + 1)}`);
    const readmePath = join(HERE, 'records', 'README.md');
    const readme = readFileSync(readmePath, 'utf8');
    if (!readme.includes(`\`${name}\``)) {
      const row = `| \`${name}\` | The ${Object.entries(now).map(([m, x]) => `${x.tasks} guide tasks on ${MODEL_NAME(m)}`).join(', ')} (engine ${engines[0]}) | "${title}" |`;
      const tail = readme.indexOf('\nSummarize a folder');
      writeFileSync(readmePath, tail < 0 ? `${readme.trimEnd()}\n${row}\n` : `${readme.slice(0, tail).trimEnd()}\n${row}\n${readme.slice(tail)}`);
    }
    console.log(`RESULTS.md: entry "${title}", guide set ${guideSetHash(ENGINE)}`);
    const failed = Object.entries(now).flatMap(([m, x]) => x.failed.map((f) => `${MODEL_NAME(m)} ${f}`));
    if (failed.length) { console.log(`✗ ${failed.length} failed check(s), for the engine to fix before this ships:`); for (const f of failed) console.log(`  ${f}`); process.exit(1); }
  }
}

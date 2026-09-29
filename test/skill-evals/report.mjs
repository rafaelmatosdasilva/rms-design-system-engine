#!/usr/bin/env node
// test/skill-evals/report.mjs - the evaluation's tables and the adoption decision (idea I55).
//
//   node test/skill-evals/report.mjs --a baseline --b cookbook --model claude-sonnet-5 --runs 5 [--model claude-haiku-4-5-20251001 --runs 3]
//
// Adopt B over A only if, on the held-out set, for every model:
//   • no task's pass rate is lower (a lower task is re-run before it counts: see --rerun below),
//   • no rule violation that A did not have,
//   • the total pass rate is equal or higher,
//   • input tokens are lower;
// and the development set shows no lower task either. The rule is applied here, not by reading the table.
// A partial measurement is never decided: every task of both sets must be in both variants with the same
// number of runs, at least --runs of them (a limit that stopped the run leaves it short; resume it first).
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

export function load(variant, model, dirs) {
  return dirs.flatMap((d) => { const f = join(d, `${variant}.${model}.jsonl`); return existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []; });
}

// Per task: runs, passes, rate, rule violations (by name), mean input tokens, mean decision points.
export function byTask(rows) {
  const out = {};
  for (const r of rows) {
    const t = (out[r.task] ??= { set: r.set, runs: 0, passes: 0, violations: {}, input: 0, turns: 0, decisions: 0, cost: 0 });
    t.runs++; if (r.pass) t.passes++;
    for (const c of r.rules ?? []) if (!c.ok) t.violations[c.name] = (t.violations[c.name] ?? 0) + 1;
    t.input += r.usage?.input ?? 0; t.turns += r.usage?.turns ?? 0; t.decisions += r.decisionPoints ?? 0; t.cost += r.usage?.cost ?? 0;
  }
  for (const t of Object.values(out)) { t.rate = t.runs ? t.passes / t.runs : 0; t.input /= t.runs || 1; t.turns /= t.runs || 1; t.decisions /= t.runs || 1; }
  return out;
}

const total = (tasks, set) => { const l = Object.values(tasks).filter((t) => !set || t.set === set); const runs = l.reduce((k, t) => k + t.runs, 0); return { runs, rate: runs ? l.reduce((k, t) => k + t.passes, 0) / runs : 0, input: l.length ? l.reduce((k, t) => k + t.input, 0) / l.length : 0, violations: l.reduce((k, t) => k + Object.values(t.violations).reduce((a, b) => a + b, 0), 0) }; };

// The adoption rule for one model. Returns { adopt, reasons, lower }.
export function decide(A, B) {
  const reasons = [];
  const lower = Object.keys(A).filter((id) => B[id] && B[id].rate < A[id].rate - 1e-9);
  for (const set of ['heldout', 'dev']) {
    const l = lower.filter((id) => A[id].set === set);
    if (l.length) reasons.push(`${set}: lower pass rate on ${l.join(', ')}`);
  }
  const newViolations = Object.keys(B).flatMap((id) => Object.keys(B[id].violations).filter((v) => !(A[id]?.violations?.[v]))).map((v) => v);
  if (newViolations.length) reasons.push(`new rule violations: ${[...new Set(newViolations)].join('; ')}`);
  const a = total(A, 'heldout'), b = total(B, 'heldout');
  if (b.rate < a.rate - 1e-9) reasons.push(`held-out pass rate ${pct(b.rate)} < ${pct(a.rate)}`);
  if (!(b.input < a.input)) reasons.push(`input tokens not lower (${Math.round(b.input)} vs ${Math.round(a.input)})`);
  const missing = Object.keys(A).filter((id) => !B[id]);
  if (missing.length) reasons.push(`not run on B: ${missing.join(', ')}`);
  return { adopt: !reasons.length, reasons, lower };
}

// What keeps a measurement from being decided: a task missing from a variant, fewer runs than asked, or a
// different number of runs on each side.
export function incomplete(A, B, ids, minRuns) {
  const out = [];
  for (const id of ids) {
    const a = A[id]?.runs ?? 0, b = B[id]?.runs ?? 0;
    if (a < minRuns || b < minRuns) out.push(`${id}: ${a} and ${b} runs, ${minRuns} asked`);
    else if (a !== b) out.push(`${id}: ${a} runs against ${b}`);
  }
  return out;
}

const pct = (x) => `${Math.round(x * 100)}%`;

export function table(A, B, nameA, nameB) {
  const ids = [...new Set([...Object.keys(A), ...Object.keys(B)])].sort((x, y) => (A[x] ?? B[x]).set.localeCompare((A[y] ?? B[y]).set) || x.localeCompare(y));
  const lines = [`| task | set | ${nameA} pass | ${nameB} pass | ${nameA} input | ${nameB} input | ${nameA} decisions | ${nameB} decisions |`, '|---|---|---|---|---|---|---|---|'];
  for (const id of ids) {
    const a = A[id], b = B[id];
    lines.push(`| ${id} | ${(a ?? b).set} | ${a ? `${a.passes}/${a.runs}` : '-'} | ${b ? `${b.passes}/${b.runs}` : '-'} | ${a ? Math.round(a.input / 1000) + 'k' : '-'} | ${b ? Math.round(b.input / 1000) + 'k' : '-'} | ${a ? a.decisions.toFixed(1) : '-'} | ${b ? b.decisions.toFixed(1) : '-'} |`);
  }
  return lines.join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const get = (k) => args.flatMap((a, i) => (a === `--${k}` ? [args[i + 1]] : []));
  const [nameA = 'baseline'] = get('a'), [nameB = 'cookbook'] = get('b');
  const { DEV } = await import('./tasks.mjs'), { HELDOUT } = await import('./heldout.mjs');
  const minRuns = get('runs').map(Number);
  const ids = [...DEV, ...HELDOUT].map((t) => t.id);
  const dirs = [join(HERE, 'results'), ...(process.env.PARITY_EVAL_PRIVATE_OUT ? [process.env.PARITY_EVAL_PRIVATE_OUT] : [])];
  let all = true;
  for (const [i, model] of get('model').entries()) {
    const A = byTask(load(nameA, model, dirs)), B = byTask(load(nameB, model, dirs));
    const need = minRuns[i] ?? minRuns[0] ?? 1;
    const privateIds = Object.keys(A).filter((id) => !ids.includes(id));
    const gaps = incomplete(A, B, [...ids, ...privateIds], need);
    console.log(`\n## ${model}: ${nameA} vs ${nameB}\n\n${table(A, B, nameA, nameB)}\n`);
    for (const set of ['dev', 'heldout']) { const a = total(A, set), b = total(B, set); console.log(`${set}: ${nameA} ${pct(a.rate)} of ${a.runs} runs, ${nameB} ${pct(b.rate)} of ${b.runs}; violations ${a.violations} vs ${b.violations}`); }
    if (gaps.length) { console.log(`\n⏸ not decided for ${model}: the measurement is incomplete\n${gaps.map((g) => `   - ${g}`).join('\n')}`); all = false; continue; }
    const d = decide(A, B);
    console.log(d.adopt ? `\n✅ adopt ${nameB} for ${model}` : `\n❌ do not adopt ${nameB} for ${model}:\n${d.reasons.map((r) => `   - ${r}`).join('\n')}`);
    if (d.lower.length) console.log(`   re-run before deciding: ${d.lower.map((id) => `--only ${id}`).join(' ')} with --runs 10 on both variants`);
    all = all && d.adopt;
  }
  process.exit(all ? 0 : 1);
}

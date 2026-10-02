#!/usr/bin/env node
// test/skill-evals/rescore-build.mjs - score the build evaluation's saved runs again with the current scorers, without
// running them again: each run's project is rebuilt from the fixture, the task's setup and the files the run wrote
// (kept with its result), and its final reply is read from its transcript.
//
//   node test/skill-evals/rescore-build.mjs [results/build/<variant>.<model>.jsonl …]   (default: every file there)
import { readFileSync, writeFileSync, readdirSync, mkdtempSync, cpSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { BUILD, TIDEPOOL } from './build-tasks.mjs';
import { globalChecks } from './rules.mjs';
import { context } from './lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'results', 'build');
const files = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync(OUT).filter((f) => f.endsWith('.jsonl')).map((f) => join(OUT, f));

for (const file of files) {
  const rows = readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const [variant, ...model] = file.split('/').pop().replace(/\.jsonl$/, '').split('.');
  let changedCount = 0;
  for (const row of rows) {
    const t = BUILD.find((x) => x.id === row.task);
    if (!t) continue;
    const dir = mkdtempSync(join(tmpdir(), 'rescore-build-'));
    cpSync(TIDEPOOL, dir, { recursive: true });
    t.setup?.(dir);
    for (const [p, text] of Object.entries(row.files ?? {})) { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), text); }
    const tr = join(OUT, 'transcripts', `${variant}.${model.join('.')}.${row.task}.${row.run}.jsonl`);
    const events = existsSync(tr) ? readFileSync(tr, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
    const ctx = { ...context(events, dir, row), dir };
    const checks = row.error ? row.checks : await t.score(ctx);
    const rules = globalChecks(ctx, t);
    const pass = [...checks, ...rules].every((c) => c.ok);
    if (pass !== row.pass) changedCount++;
    Object.assign(row, { checks, rules, pass, rescoredAt: new Date().toISOString() });
    rmSync(dir, { recursive: true, force: true });
    console.log(`  ${pass ? '✓' : '✗'} ${variant} ${row.task} #${row.run}${pass ? '' : `  (${[...checks, ...rules].filter((c) => !c.ok).map((c) => c.name).join('; ')})`}`);
  }
  writeFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  console.log(`${file.split('/').pop()}: ${rows.length} rows, ${changedCount} changed verdict`);
}

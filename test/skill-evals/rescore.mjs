#!/usr/bin/env node
// test/skill-evals/rescore.mjs - score saved runs again with the current scorers, no model tokens.
// A scorer fixed after a run (a false negative found by reading transcripts) is applied to every run
// already made, so no variant keeps a score the other would not get.
//   node test/skill-evals/rescore.mjs <results.jsonl> [more.jsonl]    (rewrites each file in place)
//
// There is no project to read here, only the row: a check that reads a file reads what the row kept. So a run is
// scored again only where the row can answer everything its checks read, and is left exactly as it was scored
// where it cannot. On 8 November that was missing and nine runs that had passed when they ran were written over as
// failures, because their checks read what the engine wrote and no row keeps that (reading.mjs, `unanswerable`).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { context, decisionPoints } from './lib.mjs';
import { unanswerable } from './reading.mjs';
import { globalChecks } from './rules.mjs';
import { DEV } from './tasks.mjs';
import { HELDOUT } from './heldout.mjs';
import { envVar } from '../../lib/names.mjs';

let privateTasks = [];
const PRIVATE_TASKS = envVar(process.env, 'EVAL_PRIVATE_TASKS');
if (PRIVATE_TASKS) privateTasks = (await import(PRIVATE_TASKS)).PRIVATE;
const byId = new Map([...DEV, ...HELDOUT, ...privateTasks].map((t) => [t.id, t]));
for (const file of process.argv.slice(2)) {
  const rows = readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  let changed = 0, kept = 0;
  const out = rows.map((r) => {
    const t = byId.get(r.task);
    const tr = join(dirname(file), 'transcripts', `${r.variant}.${r.model}.${r.task}.${r.run}.jsonl`);
    if (!t || !existsSync(tr) || !r.files) return r;
    const events = readFileSync(tr, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const ctx = context(events, null, { changed: r.changed, commits: r.commits, files: r.files });
    const checks = r.error ? r.checks : t.score(ctx);
    const rules = globalChecks(ctx, t);
    // The checks have run, so ctx.readPaths is what they asked this row for. A verdict this row cannot see is
    // left as it was scored: a score on evidence that is not there is not a score, and the live one was.
    const blind = unanswerable(r, ctx.readPaths);
    if (blind.length) { kept++; console.log(`  ⏭ ${r.task} #${r.run}: kept as scored, the row holds none of ${blind.slice(0, 3).join(', ')}${blind.length > 3 ? ` and ${blind.length - 3} more` : ''}`); return r; }
    const pass = [...checks, ...rules].every((c) => c.ok);
    if (pass !== r.pass) changed++;
    return { ...r, checks, rules, pass, changed: ctx.changed, decisionPoints: decisionPoints(ctx), readPaths: [...ctx.readPaths], rescoredAt: new Date().toISOString() };
  });
  writeFileSync(file, out.map((r) => JSON.stringify(r)).join('\n') + '\n');
  console.log(`${file}: ${rows.length} runs, ${changed} changed verdict${kept ? `, ${kept} kept as scored (the row cannot see what the check reads)` : ''}`);
}

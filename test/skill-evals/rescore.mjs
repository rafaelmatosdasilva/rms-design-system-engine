#!/usr/bin/env node
// test/skill-evals/rescore.mjs - score saved runs again with the current scorers (idea I55), no model tokens.
// A scorer fixed after a run (a false negative found by reading transcripts) is applied to every run
// already made, so no variant keeps a score the other would not get.
//   node test/skill-evals/rescore.mjs <results.jsonl> [more.jsonl]    (rewrites each file in place)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { context, decisionPoints } from './lib.mjs';
import { globalChecks } from './rules.mjs';
import { DEV } from './tasks.mjs';
import { HELDOUT } from './heldout.mjs';

let privateTasks = [];
if (process.env.PARITY_EVAL_PRIVATE_TASKS) privateTasks = (await import(process.env.PARITY_EVAL_PRIVATE_TASKS)).PRIVATE;
const byId = new Map([...DEV, ...HELDOUT, ...privateTasks].map((t) => [t.id, t]));
for (const file of process.argv.slice(2)) {
  const rows = readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  let changed = 0;
  const out = rows.map((r) => {
    const t = byId.get(r.task);
    const tr = join(dirname(file), 'transcripts', `${r.variant}.${r.model}.${r.task}.${r.run}.jsonl`);
    if (!t || !existsSync(tr) || !r.files) return r;
    const events = readFileSync(tr, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const ctx = context(events, null, { changed: r.changed, commits: r.commits, files: r.files });
    const checks = r.error ? r.checks : t.score(ctx);
    const rules = globalChecks(ctx, t);
    const pass = [...checks, ...rules].every((c) => c.ok);
    if (pass !== r.pass) changed++;
    return { ...r, checks, rules, pass, decisionPoints: decisionPoints(ctx), rescoredAt: new Date().toISOString() };
  });
  writeFileSync(file, out.map((r) => JSON.stringify(r)).join('\n') + '\n');
  console.log(`${file}: ${rows.length} runs, ${changed} changed verdict`);
}

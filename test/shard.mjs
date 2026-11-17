// Which test files each of CI's machines runs (tests.yml): `node test/shard.mjs 2 4` prints the second quarter's.
//
// node --test --test-shard deals the files out by position, every fourth file to the same machine, so one machine got
// the slowest files by chance and ran for half as long again as the others. Here each file goes to the machine with the
// least time so far, slowest first, by the seconds the file last took (shard-weights.json). A file not in that table
// counts as a typical one. A stale table only makes the quarters less even: every file still runs, on exactly one
// machine (test/tests-workflow.test.mjs).
//
// The same module is the reporter that measures those seconds, so the table is refreshed with one command:
//   node --test --test-reporter=./test/shard.mjs test/*.test.mjs > test/shard-weights.json
import { readdirSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';

const HERE = new URL('./', import.meta.url);

// Every test file, in the order the shell lists test/*.test.mjs.
export const testFiles = () => readdirSync(HERE).filter((f) => f.endsWith('.test.mjs')).sort();

export const readWeights = () => {
  try { return JSON.parse(readFileSync(new URL('shard-weights.json', HERE), 'utf8')); } catch { return {}; }
};

// The files of quarter `index` (1-based) of `total`, each file in exactly one quarter.
export function shardOf(files, weights, index, total) {
  const known = files.map((f) => weights[f]).filter((s) => typeof s === 'number').sort((a, b) => a - b);
  const typical = known.length ? known[known.length >> 1] : 1;
  const secs = (f) => (typeof weights[f] === 'number' ? weights[f] : typical);
  // Slowest first, ties by name, so every machine works the same split out without talking to the others.
  const order = [...files].sort((a, b) => secs(b) - secs(a) || (a < b ? -1 : 1));
  const load = Array(total).fill(0), mine = [];
  for (const f of order) {
    let k = 0;
    for (let i = 1; i < total; i++) if (load[i] < load[k]) k = i;
    load[k] += secs(f);
    if (k === index - 1) mine.push(f);
  }
  return mine.sort();
}

// As a reporter: each file's seconds, the sum of its top-level tests, as the table above reads it.
export default async function* measure(source) {
  const per = {};
  for await (const e of source) {
    if ((e.type === 'test:pass' || e.type === 'test:fail') && e.data.nesting === 0 && e.data.file) {
      const f = basename(e.data.file);
      per[f] = (per[f] ?? 0) + e.data.details.duration_ms / 1000;
    }
  }
  const sorted = Object.fromEntries(Object.keys(per).sort().map((f) => [f, Math.round(per[f] * 10) / 10]));
  yield `${JSON.stringify(sorted, null, 2)}\n`;
}

if (process.argv[1] && basename(process.argv[1]) === 'shard.mjs') {
  const [index, total] = process.argv.slice(2).map(Number);
  if (!(total >= 1 && index >= 1 && index <= total)) {
    console.error('Usage: node test/shard.mjs <index> <total>   (e.g. 2 4 for the second of four)');
    process.exit(2);
  }
  console.log(shardOf(testFiles(), readWeights(), index, total).map((f) => `test/${f}`).join('\n'));
}

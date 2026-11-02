// Nothing committed here ever carries a merge conflict marker.
//
// One reached the guide the agent reads and sat on main: a `<<<<<<< HEAD` and the two halves of a merge, in the
// middle of the page that describes two commands. Nothing caught it. The file auto-merged, so no conflict was
// reported to resolve; the docs check compares what the docs say against the gates, not against this; and the skill
// evaluation measures the guide by a hash, which a marker changes as happily as a sentence does. It scored 70/70
// with the marker in place, which is luck, not a result.
//
// A grep across the tracked files costs nothing and ends that whole class. It is the cheapest guard in this suite
// and the one with the largest thing behind it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { budget } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
// Only at the start of a line, and only the real shapes git writes: a file that writes *about* conflicts (this one)
// is not a file that has one.
const MARKER = /^(<{7} |={7}$|>{7} )/;

test('no committed file carries a merge conflict marker', { timeout: budget(60000) }, () => {
  let files = [];
  try { files = execFileSync('git', ['ls-files', '-z'], { cwd: ENGINE, encoding: 'utf8', maxBuffer: 1 << 26 }).split('\0').filter(Boolean); }
  catch { return; }   // not a checkout: nothing to read
  const found = [];
  for (const f of files) {
    if (/^test\/no-conflict-markers\.test\.mjs$/.test(f)) continue;   // the one file that may name them
    let text = '';
    try { text = readFileSync(join(ENGINE, f), 'utf8'); } catch { continue; }   // binary or gone
    if (text.includes('\0')) continue;
    const at = text.split('\n').findIndex((l) => MARKER.test(l));
    if (at >= 0) found.push(`${f}:${at + 1}`);
  }
  assert.deepEqual(found, [], 'a merge was committed half-resolved');
});

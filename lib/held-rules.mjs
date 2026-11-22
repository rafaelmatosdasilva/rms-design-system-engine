// held-rules.mjs - the rules a run holds, read wherever the run is.
//
// A rule every component follows is held from then on: its next break fails the check (construction-grammar.mjs
// holdRules). What says a rule was held is the grammar the last build wrote, contracts/construction.json, with the date
// each rule was first followed by all. A project that commits its contracts has it on every computer and in every
// pipeline. One that does not, or a pipeline that builds the contracts fresh before it checks, had nothing to read, and
// every held rule quietly went back to a warning there.
//
// So the record is read where it is: the file as it is on disk, else the last version the repository committed of it
// (git history), and when neither exists the run says so, so a pipeline that holds nothing is seen to hold nothing.
//
//   readHeld(ROOT, file, { git }) → { doc, from: 'file' | 'history', commit?, at? } | { doc: null, from: null }
//   heldLine(read)                → the line a run says about where its held rules came from, or null
import { readFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const run = (ROOT, args) => { const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', timeout: 10000, maxBuffer: 64 * 1024 * 1024 }); return r.status === 0 ? r.stdout : null; };

export function readHeld(ROOT, file, { git = (args) => run(ROOT, args) } = {}) {
  const abs = resolve(ROOT, file);
  try { return { doc: JSON.parse(readFileSync(abs, 'utf8')), from: 'file' }; } catch { /* not on disk: its history */ }
  const rel = relative(resolve(ROOT), abs).split('\\').join('/');
  const last = String(git(['log', '-1', '--format=%H %cI', '--', rel]) ?? '').trim();
  if (last) {
    const [commit, at] = last.split(' ');
    const text = git(['show', `${commit}:${rel}`]);
    try { if (text) return { doc: JSON.parse(text), from: 'history', commit: commit.slice(0, 8), at: at ?? null }; } catch { /* unreadable: as none */ }
  }
  return { doc: null, from: null };
}

export function heldLine(read, file = 'contracts/construction.json') {
  if (read?.from === 'history') return `ℹ️  The rules held before were read from ${file} as the repository last committed it (${read.commit}${read.at ? `, ${String(read.at).slice(0, 10)}` : ''}): it is not on disk here.`;
  if (!read?.from) return `ℹ️  No record of the rules held before (${file} is neither on disk nor in the repository's history): the rules every component follows now are held from this run, and none broken already is. Commit ${file} so every run holds the same rules.`;
  return null;
}

// read-only.mjs - looking at a project without leaving anything in it.
//
// Someone deciding whether to use the engine runs it on their own system to see what it says. On a real project
// that read put three files in the project's root - the check's result, the prop check's result, the GitLab
// history - before printing a word. On a folder with no git behind it there is nothing to undo them with, and a
// person who asked only to look has to explain the new files to whoever owns the repository.
//
// `--read-only` answers that: every write the engine makes into the project is skipped and said out loud at the
// end, so nothing is silently not-done either. It is not a setting in ds-config.json, because it is a property of
// one run rather than of the project: `writes` (writes.mjs) says what this project lets the engine change, and
// this says that this particular run changes nothing whatever the project allows.
//
// What it does not touch: files outside the project (the engine's own folder, this computer's caches), because
// the thing being protected is the person's project, and a cache that has to be rebuilt on every look would make
// looking slow enough that nobody does it twice.
import { writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname, relative, resolve, isAbsolute } from 'node:path';

export const FLAG = '--read-only';
// Read once from the run's own arguments, so every module answers the same whatever order they are loaded in.
let on = null;
export const readOnly = (argv = process.argv) => (on ??= argv.includes(FLAG));
export const setReadOnly = (v) => { on = v; };          // for the tests, which must not read the real argv

// What was not written, in the order it was asked for, each once.
const skipped = [];
export const skippedWrites = () => [...skipped];
export const forgetSkipped = () => { skipped.length = 0; };

// Write a file unless this run is only looking. ROOT is the project: a path outside it is written either way,
// because this protects the person's project and not the engine's own folder.
// → true when it was written, false when it was skipped.
export function writeInProject(ROOT, file, text, { argv = process.argv } = {}) {
  const full = isAbsolute(file) ? file : resolve(ROOT, file);
  const inside = !relative(resolve(ROOT), full).startsWith('..');
  if (inside && readOnly(argv)) {
    const said = relative(resolve(ROOT), full);
    if (!skipped.includes(said)) skipped.push(said);
    return false;
  }
  try { mkdirSync(dirname(full), { recursive: true }); } catch { /* it may already be there */ }
  writeFileSync(full, text);
  return true;
}

// Said at the end of a run, so a person knows what a full run would have left behind rather than finding out
// later. Nothing skipped says nothing: a run that wrote nothing because it had nothing to write is not news.
export function readOnlyLines({ argv = process.argv } = {}) {
  if (!readOnly(argv) || !skipped.length) return [];
  return ['', `👁  READ ONLY  nothing was written into this project. A full run would have written ${skipped.length} file(s):`,
    ...skipped.slice(0, 8).map((f) => `   ${f}`),
    ...(skipped.length > 8 ? [`   … and ${skipped.length - 8} more`] : []),
    '   Run it again without --read-only to let it write them.'];
}

// Removing a file is a change to the project like any other, and in a run that only looks it is the worse half:
// the engine clears its last result before the gates run, so without this a look would have taken two of the
// person's files away and, being read-only, put nothing back.
// → true when it was removed, false when it was left alone.
export function removeInProject(ROOT, file, { argv = process.argv } = {}) {
  const full = isAbsolute(file) ? file : resolve(ROOT, file);
  const inside = !relative(resolve(ROOT), full).startsWith('..');
  if (inside && readOnly(argv)) return false;
  try { unlinkSync(full); return true; } catch { return false; }
}

// names.mjs - the one place that knows the names the engine uses in a project, new and old.
//
// The skill was rms-figma-code-parity; it is now rms-design-system-engine, and the files it keeps in a project
// moved from the parity- prefix to design-system-engine-. A project set up before keeps working: every read
// looks for the new name first and falls back to the old one, and every write uses the new name. The audit
// says once per run which old names are still there and how to rename them (oldNameLines). The output folder
// is the engine's own and never committed, so it is moved instead (moveOutDir). Environment variables are
// read the same way: DESIGN_SYSTEM_ENGINE_X first, then the old PARITY_X.
import { existsSync, renameSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

export const SKILL = 'rms-design-system-engine';
export const OLD_SKILL = 'rms-figma-code-parity';

// key → { now, old }: paths relative to the project root.
export const PROJECT = {
  out:         { now: '.design-system-engine-out', old: '.parity-out' },
  refs:        { now: '.design-system-engine-refs', old: '.parity-refs' },
  map:         { now: 'design-system-engine-map.mjs', old: 'parity-map.mjs' },
  baseline:    { now: 'design-system-engine-baseline.json', old: 'parity-baseline.json' },
  agreed:      { now: 'design-system-engine-agreed.json', old: 'parity-agreed.json' },
  history:     { now: 'design-system-engine-history.json', old: 'parity-history.json' },
  checkResult: { now: 'design-system-engine-check-result.json', old: 'parity-check-result.json' },
};

// The engine's output folder, and where the code capture goes in it by default.
export const OUT_DIR = PROJECT.out.now;
export const REFS_DIR = PROJECT.refs.now;

// Folders the engine writes, under either name: never read as the project's own source.
export const ENGINE_DIRS = [PROJECT.out.now, PROJECT.refs.now, PROJECT.out.old, PROJECT.refs.old];

const entry = (key) => {
  const n = PROJECT[key];
  if (!n) throw new Error(`names.mjs: unknown project name "${key}"`);
  return n;
};

// The name to read: the new one, or the old one when only that exists.
export function projectPath(root, key) {
  const n = entry(key);
  return existsSync(join(root, n.now)) || !existsSync(join(root, n.old)) ? n.now : n.old;
}

// The name to write: always the new one.
export const newPath = (key) => entry(key).now;

// The code capture's path, relative to the project root. A config written before the rename names the old
// output folder: read it as the new one, where moveOutDir put it.
export function codeSnapshotPath(cfg) {
  const p = cfg?.codeReading?.out;
  if (!p) return `${OUT_DIR}/code.snapshot.json`;
  return p === PROJECT.out.old || p.startsWith(`${PROJECT.out.old}/`) ? PROJECT.out.now + p.slice(PROJECT.out.old.length) : p;
}

// The output folder under its old name only: move it (it is the engine's own, never committed). Returns the
// line to say, or null.
export function moveOutDir(root) {
  const from = join(root, PROJECT.out.old), to = join(root, PROJECT.out.now);
  if (!existsSync(from) || existsSync(to)) return null;
  try { renameSync(from, to); } catch { return null; }
  return `ℹ️  Moved ${PROJECT.out.old} to ${PROJECT.out.now} (the engine's output folder has a new name).`;
}

// One line per old name still in the project: the rename to make, or the old file to delete when both exist.
export function oldNameLines(root) {
  const lines = [];
  for (const [key, n] of Object.entries(PROJECT)) {
    if (key === 'out' || key === 'checkResult' || !existsSync(join(root, n.old))) continue;
    lines.push(existsSync(join(root, n.now))
      ? `ℹ️  ${n.old} is the old name and ${n.now} is read instead: delete ${n.old}.`
      : `ℹ️  ${n.old} is the old name: rename it to ${n.now}. It is read from the old name for now.`);
  }
  return lines;
}

// A .gitignore that lists the old ignored names gets the new ones beside them. Returns the names added.
export function gitignoreNewNames(root) {
  const file = join(root, '.gitignore');
  if (!existsSync(file)) return [];
  const text = readFileSync(file, 'utf8');
  const has = (name) => text.split(/\r?\n/).some((l) => l.trim().replace(/\/$/, '') === name);
  const add = [];
  for (const key of ['out', 'checkResult']) {
    const n = PROJECT[key];
    if (has(n.old) && !has(n.now)) add.push(key === 'out' ? `${n.now}/` : n.now);
  }
  if (add.length) appendFileSync(file, (text.endsWith('\n') || !text ? '' : '\n') + add.join('\n') + '\n');
  return add;
}

// An environment variable: DESIGN_SYSTEM_ENGINE_<key>, then the old PARITY_<key>.
export function envVar(env, key) {
  return env[`DESIGN_SYSTEM_ENGINE_${key}`] ?? env[`PARITY_${key}`];
}

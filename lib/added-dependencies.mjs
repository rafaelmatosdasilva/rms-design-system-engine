// added-dependencies.mjs - what a prototype added to its project's dependencies since its work began.
//
// A library a prototype pulled in may not be one the production stack accepts, and the team that builds the feature
// finds out only once it starts. So the handoff says it up front: every dependency the package.json has now that it
// did not have where the work started (the pin's starting commit), with its version and whether it is only for
// development, for that team to accept or refuse. A version moved on is said too, since it is as much a decision.
//
//   addedDependencies(repo, { from, at, file })  → [{ name, version, was, dev }] (was: the version before, for a move)
//   dependencyLines(list)                         → the lines a report prints
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileAt } from './fixed-point.mjs';

const KINDS = [['dependencies', false], ['peerDependencies', false], ['optionalDependencies', false], ['devDependencies', true]];
const depsOf = (text) => {
  let j; try { j = JSON.parse(text); } catch { return null; }
  const out = new Map();
  for (const [k, dev] of KINDS) for (const [name, version] of Object.entries(j?.[k] ?? {})) if (!out.has(name)) out.set(name, { version: String(version), dev });
  return out;
};

// from: the commit the work started at (null: nothing to compare against, so nothing is said). at: the ref the
// prototype is read at (null: the folder as it is). file: the package.json, from the repository's root.
export function addedDependencies(repo, { from = null, at = null, file = 'package.json' } = {}) {
  if (!repo || !from) return null;
  const before = depsOf(fileAt(repo, from, file) ?? '{}') ?? new Map();
  const nowText = at ? fileAt(repo, at, file) : (() => { try { return readFileSync(join(repo, file), 'utf8'); } catch { return null; } })();
  const now = depsOf(nowText ?? '{}');
  if (!now) return null;
  const out = [];
  for (const [name, d] of now) {
    const was = before.get(name);
    if (!was) out.push({ name, version: d.version, was: null, dev: d.dev });
    else if (was.version !== d.version) out.push({ name, version: d.version, was: was.version, dev: d.dev });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function dependencyLines(list) {
  if (!list) return [];
  if (!list.length) return ['DEPENDENCIES  nothing added since the work began'];
  return [`DEPENDENCIES  ${list.length} added or moved since the work began: each one is the building team's to accept`,
    ...list.map((d) => `   ${d.name} ${d.version}${d.was ? ` (was ${d.was})` : ''}${d.dev ? ', for development only' : ''}`)];
}

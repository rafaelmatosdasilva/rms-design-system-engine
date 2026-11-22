// handoff-facts.mjs - what a prototype's check says beyond its page: where it was read, what it added to the project,
// how its own code sits beside its demonstration code, and whether the copy of the system it holds is the release it
// pinned. Gathered once, for the check's report and for the handoff page, so the two never say different things.
//
//   handoffFacts({ ROOT, cfg, file, at })  → { fixed, dependencies, demo, copies }
//   handoffFactsLines(facts)               → the lines a report prints, a block each, the empty ones left out
//   handoffFactsErrors(facts)              → how many of them fail the check
import { readFileSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fixedPoint, fixedPointLines, fileAt } from './fixed-point.mjs';
import { addedDependencies, dependencyLines } from './added-dependencies.mjs';
import { demoConvention, demoFindings, demoSummary, demoLines } from './demo-code.mjs';
import { copyCheck, copyLines } from './system-copy.mjs';
import { slashed } from './shown-path.mjs';

const git = (cwd, args) => { try { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; } };

// The files the prototype's work touched: changed since the pin's starting commit, at the ref read (else the folder,
// what is not committed included). With no starting commit, every file of the source folder.
function workFiles(repo, { from, at, source }) {
  let names;
  if (from) {
    const committed = git(repo, ['diff', '--name-only', from, at ?? 'HEAD']) ?? '';
    const loose = at ? '' : `${git(repo, ['diff', '--name-only']) ?? ''}\n${git(repo, ['ls-files', '--others', '--exclude-standard']) ?? ''}`;
    names = [...new Set(`${committed}\n${loose}`.split('\n').filter(Boolean))];
  } else names = (git(repo, ['ls-tree', '-r', '--name-only', at ?? 'HEAD', '--', source]) ?? '').split('\n').filter(Boolean);
  return names.map((rel) => ({ rel, text: at ? fileAt(repo, at, rel) : (() => { try { return readFileSync(join(repo, rel), 'utf8'); } catch { return null; } })() })).filter((f) => f.text != null);
}

export function handoffFacts({ ROOT, cfg = {}, file, at = null } = {}) {
  const fixed = fixedPoint({ ROOT, cfg, file, at });
  const repo = fixed.prototype?.repo ?? null;
  const from = fixed.from;
  const dependencies = repo ? addedDependencies(repo, { from, at }) : null;
  const conv = demoConvention(cfg);
  let demo = null;
  if (conv && repo) {
    const files = workFiles(repo, { from, at, source: conv.source });
    // A copy of the system is neither the product's nor its demonstration: the building team takes it from the system.
    const withCopies = { ...conv, copies: (Array.isArray(cfg.copies) ? cfg.copies : []).filter((c) => c?.dir).map((c) => relative(repo, resolve(ROOT, c.dir)).split('\\').join('/')).filter((d) => !d.startsWith('..')) };
    demo = { summary: demoSummary(files, withCopies), findings: demoFindings(files, withCopies) };
  }
  // The copies of the system in the prototype's own repository: the ones this check can speak for.
  const copies = (Array.isArray(cfg.copies) ? cfg.copies : [])
    .filter((c) => c && c.dir && repo && !slashed(relative(repo, resolve(ROOT, c.dir))).startsWith('..'))
    .map((c) => copyCheck(ROOT, c, { at }));
  return { fixed, dependencies, demo, copies };
}

export function handoffFactsLines(f) {
  const blocks = [fixedPointLines(f.fixed), ...(f.copies ?? []).map(copyLines), demoLines(f.demo?.summary, f.demo?.findings), dependencyLines(f.dependencies)].filter((b) => b.length);
  return blocks.flatMap((b) => ['', ...b]);
}

export function handoffFactsErrors(f) {
  const copyErrors = (f.copies ?? []).filter((c) => !c.error).reduce((n, c) => n + (c.counts.older ?? 0) + (c.counts['in a later release'] ?? 0) + (c.counts['missing from the copy'] ?? 0) + c.changes.length, 0);
  return copyErrors + (f.demo?.findings?.length ?? 0);
}

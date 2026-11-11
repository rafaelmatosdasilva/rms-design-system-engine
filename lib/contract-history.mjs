// contract-history.mjs - what changed in the contracts from one build of the style guide to the next, for its History.
//
// The contracts are what an agent reads, so a change in one changes what agents build: a prop removed, an option added,
// a pattern's must rule added. A merge request already shows this (contract-changes.mjs); the guide's History did not,
// and the contracts' commits sat among the code's, where nobody could tell them apart. This keeps, beside the build's
// other output, the contracts as the last build read them and a log of what changed since, one entry a build that
// changed something: never a build that only wrote them again.
//
//   patternSlim(contract)                  → what is compared of one pattern's or flow's contract
//   comparePatterns(was, is)               → [{ name, kind, change, items: [{ what, change }] }]
//   withContractHistory(file, at, { contracts, patterns }) → the log, newest last: [{ at, changes }]
//     contracts: component contracts, parsed (contract-changes.mjs contractsIn); patterns: pattern contracts, parsed
//
// The first build records what it read and says nothing: there is nothing yet to compare it with. The log keeps a year.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { recordOf, compare } from './contract-changes.mjs';

const KEEP = 366;

export function patternSlim(c) {
  return { name: c.name, kind: c.kind ?? 'pattern', components: [...(c.components ?? [])].sort(),
    rules: (c.rules ?? []).map((r) => `${r.level ?? 'should'}: ${r.text}`).sort() };
}

export function comparePatterns(was = {}, is = {}) {
  const out = [];
  for (const name of [...new Set([...Object.keys(was), ...Object.keys(is)])].sort()) {
    const a = was[name], b = is[name], kind = (b ?? a).kind;
    if (!a) { out.push({ name, kind, change: 'added', items: [] }); continue; }
    if (!b) { out.push({ name, kind, change: 'removed', items: [] }); continue; }
    const items = [];
    for (const r of b.rules) if (!a.rules.includes(r)) items.push({ what: `${r.split(': ')[0]} rule`, change: 'added', detail: r.slice(r.indexOf(': ') + 2) });
    for (const r of a.rules) if (!b.rules.includes(r)) items.push({ what: `${r.split(': ')[0]} rule`, change: 'removed', detail: r.slice(r.indexOf(': ') + 2) });
    for (const x of b.components) if (!a.components.includes(x)) items.push({ what: `component ${x}`, change: 'added' });
    for (const x of a.components) if (!b.components.includes(x)) items.push({ what: `component ${x}`, change: 'removed' });
    if (items.length) out.push({ name, kind, change: 'changed', items });
  }
  return out;
}

export function withContractHistory(file, at, { contracts = [], patterns = [] } = {}) {
  let h = null;
  try { h = JSON.parse(readFileSync(file, 'utf8')); } catch { /* the first build */ }
  const log = Array.isArray(h?.log) ? h.log : [];
  const now = { contracts: recordOf(contracts, { at }).contracts, patterns: Object.fromEntries(patterns.map((p) => [p.name, patternSlim(p)])) };
  if (h?.last) {
    const changes = [
      ...compare({ contracts: h.last.contracts ?? {} }, { contracts: now.contracts }).map((c) => ({ name: c.name, kind: 'component', change: c.change, items: c.items, breaking: c.breaking.length > 0 })),
      ...comparePatterns(h.last.patterns ?? {}, now.patterns),
    ];
    if (changes.length) log.push({ at, changes });
  }
  const next = { _note: 'The contracts as the last build of the style guide read them, and what changed from one build to the next (rms-design-system-engine). Kept beside the build; never edit it.', last: now, log: log.slice(-KEEP) };
  try { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(next) + '\n'); } catch { /* a read-only output: the page still shows the log */ }
  return next.log;
}

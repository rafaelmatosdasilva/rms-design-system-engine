// prototype-record.mjs - each prototype's own evaluation, kept beside it.
//
// What every check found has only ever been kept in one place, in the engine's output folder, keyed by page: good
// for counting across a project, no use to the prototype itself. A prototype is a part of its own now - read from
// the team's store into prototypes/ and sent back from it - and what travels with it is the page, its handoff and
// what people said about it. Its evaluation did not travel at all. So somebody opening a prototype from the store
// could see the page and not one thing about whether it holds up.
//
// It is written beside the page, as the handoff and the comments are: prototypes/<name>.check.json. The team's
// store carries it, the style guide reads it to show each component the prototypes that used it, and a person
// looking at a prototype a month later can see what the last check of it found without running anything.
//
// It records what was found, never a verdict of its own: the components it used and how often, the mistakes with
// why each happened, what the system lacked for it, the states it owes. A record that judged would be a second
// opinion to keep in step with the first.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';

export const checkFile = (name) => `${name}.check.json`;
const DESCRIPTION = 'What the last check of this prototype found: the components it used, the mistakes with why each happened, what the system lacked, and the states it owes. Written beside the page by rms-design-system-engine --prototype, and carried with it wherever the prototype goes.';

// What one check found, in the shape kept beside the page.
// used: { component: times }; items: the mistakes, each with its why (page-check.mjs whyOf); gaps: what the system
// lacked; owed: the states the page owes.
export function checkRecord({ name, file, used = {}, items = [], gaps = [], owed = [], ok = null, at = new Date().toISOString() } = {}) {
  const kinds = {};
  for (const i of items) kinds[i.kind ?? 'other'] = (kinds[i.kind ?? 'other'] ?? 0) + 1;
  return {
    $description: DESCRIPTION, name, file, at,
    ok: ok == null ? !items.length && !owed.length : ok,
    used: Object.fromEntries(Object.entries(used).sort((a, b) => b[1] - a[1])),
    mistakes: items.length,
    // The half a person can act on, told from the half the agent owes, as every other count of these is told. Left
    // out where nothing was classified at all: a zero here would read as "the documentation owed none of them",
    // which is a different thing from "nobody worked out whose fault each was".
    ...(items.some((i) => 'gap' in i) ? { gapsInDocumentation: items.filter((i) => i.gap).length } : {}),
    kinds,
    items: items.slice(0, 50).map((i) => ({ component: i.component ?? null, kind: i.kind ?? null, message: i.message, ...('gap' in i ? { gap: !!i.gap, why: i.why ?? null } : {}) })),
    lacked: gaps.map((g) => ({ need: g.need, searched: g.searched ?? null, why: g.why ?? null })),
    owes: owed.map((o) => o.kind ?? o.state).filter(Boolean),
  };
}

// Kept beside the page, where the handoff and the comments are, so the team's store carries it too.
export function writeCheck(root, dir, record) {
  const path = join(root, dir, checkFile(record.name));
  try { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(record, null, 2) + '\n'); return path; }
  catch { return null; }
}

// Every prototype's last check, by the name of the page. A folder with none says so by being empty: a prototype
// nobody has checked is not a prototype that passed.
export function readChecks(root, dir = 'prototypes') {
  const out = {};
  let files = [];
  try { files = readdirSync(join(root, dir)).filter((f) => f.endsWith('.check.json')); } catch { return out; }
  for (const f of files) {
    try {
      const r = JSON.parse(readFileSync(join(root, dir, f), 'utf8'));
      if (r?.name) out[r.name] = r;
    } catch { /* not one of ours */ }
  }
  return out;
}

// Which prototypes used each component, newest first, for the style guide to show on its page.
// → { component: [{ name, times, at, ok, mistakes }] }
export function byComponent(checks = {}) {
  const out = {};
  for (const r of Object.values(checks)) {
    for (const [component, times] of Object.entries(r.used ?? {})) {
      (out[component] ??= []).push({ name: r.name, times, at: r.at ?? null, ok: !!r.ok, mistakes: r.mistakes ?? 0 });
    }
  }
  for (const list of Object.values(out)) list.sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')));
  return out;
}

// What a person reads at the end of a check: one line, because the report above it already said everything.
export function checkLine(record, where) {
  const n = Object.keys(record.used ?? {}).length;
  return `🗂  Kept with the prototype: ${n} component${n === 1 ? '' : 's'} used, ${record.mistakes} mistake${record.mistakes === 1 ? '' : 's'}${record.owes.length ? `, ${record.owes.length} state${record.owes.length === 1 ? '' : 's'} owed` : ''} → ${where}`;
}

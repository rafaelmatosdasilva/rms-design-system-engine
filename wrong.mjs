// wrong.mjs - the findings a person marked as wrong, and what each check has cried wolf about.
//
// A kept difference (kept.mjs) is a real difference the team decided to live with. This is the other thing: a finding
// that should never have been raised, because the check misread something. The two must not be confused — keeping a
// difference says the engine was right and the team chose otherwise; marking one wrong says the engine was wrong.
//
// A check nobody can trust sends the next change the wrong way, and a check that cries wolf is the quietest kind of
// failure there is: people stop reading its lines and then miss the true one. So each is recorded with why, counted
// per check, and the count is shown, for the check to be fixed.
//
// What is deliberately NOT done here: the finding is not suppressed. Hiding a line because someone once called it
// wrong would turn one person's judgement into everybody's blind spot, and a check that is wrong in one project may
// be right in the same words in another. The record exists to get the check fixed, not to silence it.
//
//   design-system-engine-wrong.json (committed): [{ key, check, what, component, why, by, at }]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { keptKey } from './kept.mjs';

export const WRONG_FILE = 'design-system-engine-wrong.json';
export const wrongPath = (ROOT) => join(ROOT, WRONG_FILE);

export function readWrong(ROOT) {
  try { const j = JSON.parse(readFileSync(wrongPath(ROOT), 'utf8')); return Array.isArray(j.findings) ? j.findings.filter((d) => d && typeof d.key === 'string') : []; } catch { return []; }
}

function write(ROOT, findings) {
  const sorted = [...findings].sort((a, b) => String(a.check ?? '').localeCompare(String(b.check ?? '')) || a.key.localeCompare(b.key));
  writeFileSync(wrongPath(ROOT), JSON.stringify({ version: 1, $description: 'Findings a person marked as wrong: the check misread something. Each is a case that check must stop raising. Written by rms-design-system-engine --wrong; commit it.', findings: sorted }, null, 1) + '\n');
}

// Mark findings wrong. `why` is required: a record without it tells whoever fixes the check nothing, and a check is
// only fixable from what it got wrong.
export function recordWrong(ROOT, findings, { why, by = null, at = new Date().toISOString() } = {}) {
  if (!String(why ?? '').trim()) throw new Error('a finding marked wrong needs why it is wrong');
  const byKey = new Map(readWrong(ROOT).map((d) => [d.key, d]));
  const added = [];
  for (const f of findings) {
    const key = keptKey(`${f.check} :: ${f.what}`);
    const i = key.indexOf(' :: ');
    const e = { key, check: key.slice(0, i), what: key.slice(i + 4), component: f.component ?? null, why: String(why).trim(), by: by || null, at };
    byKey.set(key, e);
    added.push(e);
  }
  write(ROOT, [...byKey.values()]);
  return added;
}

// Take a mark back: the ones test(finding) picks (the check was fixed, or the mark was itself a mistake).
export function dropWrong(ROOT, test) {
  const all = readWrong(ROOT), gone = all.filter(test);
  if (gone.length) write(ROOT, all.filter((d) => !gone.includes(d)));
  return gone;
}

// How often each check has been called wrong, most first. → [{ check, times, components, latest }]
export function byCheck(ROOT) {
  const by = new Map();
  for (const f of readWrong(ROOT)) {
    const e = by.get(f.check) ?? { check: f.check, times: 0, components: [], latest: null };
    e.times += 1;
    if (f.component && !e.components.includes(f.component)) e.components.push(f.component);
    if (!e.latest || String(f.at) > e.latest) e.latest = f.at ?? null;
    by.set(f.check, e);
  }
  return [...by.values()].sort((a, b) => b.times - a.times || a.check.localeCompare(b.check));
}

// What a run says about it: a check called wrong more than once is the one to fix first, and a run says so even when
// nothing it found today was marked, because the point is the check, not today's lines.
// `least`: how many times a check must have been called wrong before it is worth a line of a run's output.
export function wrongLines(ROOT, { least = 2 } = {}) {
  if (!existsSync(wrongPath(ROOT))) return [];
  const loud = byCheck(ROOT).filter((c) => c.times >= least);
  if (!loud.length) return [];
  return [
    `Checks called wrong by a person: ${loud.length} ${loud.length === 1 ? 'check has' : 'checks have'} raised findings that should not have been raised. Fix the check; the lines it writes are being read less because of it.`,
    ...loud.map((c) => `  ${c.check}: ${c.times} times${c.components.length ? ` (${c.components.slice(0, 4).join(', ')}${c.components.length > 4 ? ` +${c.components.length - 4}` : ''})` : ''}`),
  ];
}

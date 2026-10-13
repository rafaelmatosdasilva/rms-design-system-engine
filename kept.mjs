// kept.mjs - the differences between Figma and the code the team decided to keep.
//
// Not every difference is a mistake: the code keeps a size for a product reason, Figma keeps a colour for a mock-up.
// When the person decides to keep one, `--keep` records it in design-system-engine-kept.json (committed): the
// difference as the audit said it, why it is kept, who decided and when, which side is right when that is known, and
// when to look at it again. On every run a kept difference is neither open nor debt: it never fails the run, and the
// audit, the differences list and the style guide show it under Kept on purpose with its reason.
//
// What is kept is the difference with these values. When either side's value changes, its words change, the decision
// no longer matches it: the difference is open again, and the decision is said to be no longer found, to drop or to
// make again. Only the person keeps a difference: the project's hooks ask first unless their own message says so.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROJECT } from './names.mjs';

const ANSI = /\x1b\[[0-9;]*m/g;
const ICON = /^\s*(❌|⚠️|ℹ️|✗|•)\s*/;
// A gate's count line ("❌ FAIL  3") names nothing: it is never kept on its own.
const COUNT = /^❌\s+[A-Z][A-Z ?]*?\s+\d+(\/\d+)?(\s|$)/;
export const KEPT_MARK = '✋';

// A finding as a decision names it: its check and its words, without the icon (a difference whose severity changes is
// the same difference) and without a file's line number (an edit higher up the file moves it).
export function keptKey(finding) {
  const s = String(finding ?? '').replace(ANSI, '').trim();
  const i = s.indexOf(' :: ');
  const check = (i > 0 ? s.slice(0, i) : '').replace(/\s{2}\(.*$/, '').trim();
  const what = (i > 0 ? s.slice(i + 4) : s).replace(ICON, '').replace(/(\.[\w]+):\d+\b/g, '$1').trim();
  return `${check} :: ${what}`;
}
const split = (key) => { const i = key.indexOf(' :: '); return { check: key.slice(0, i), what: key.slice(i + 4) }; };

export const keptPath = (ROOT) => join(ROOT, PROJECT.kept.now);
export function readKept(ROOT) {
  try { const j = JSON.parse(readFileSync(keptPath(ROOT), 'utf8')); return Array.isArray(j.decisions) ? j.decisions.filter((d) => d && typeof d.key === 'string') : []; } catch { return []; }
}
function write(ROOT, decisions) {
  const sorted = [...decisions].sort((a, b) => String(a.component ?? '').localeCompare(String(b.component ?? '')) || a.key.localeCompare(b.key));
  writeFileSync(keptPath(ROOT), JSON.stringify({ version: 1, $description: 'The differences between Figma and the code the team decided to keep, each with why, who decided, when, which side is right and when to look at it again. Written by rms-design-system-engine --keep; commit it.', decisions: sorted }, null, 1) + '\n');
}

// When to look at it again: a date (2027-01-31), or a span from today (90d, 6m, 1y). → YYYY-MM-DD, or null.
export function reviewDate(value, today = new Date()) {
  const v = String(value ?? '').trim();
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))) return v;
  const m = /^(\d+)\s*(d|w|m|y)$/i.exec(v);
  if (!m) return null;
  const d = new Date(today.getTime());
  const n = Number(m[1]), unit = m[2].toLowerCase();
  if (unit === 'd') d.setUTCDate(d.getUTCDate() + n);
  else if (unit === 'w') d.setUTCDate(d.getUTCDate() + 7 * n);
  else if (unit === 'm') d.setUTCMonth(d.getUTCMonth() + n);
  else d.setUTCFullYear(d.getUTCFullYear() + n);
  return d.toISOString().slice(0, 10);
}

// Keep these findings ([{ check, what, component }], as the last audit recorded them). A decision made again for the
// same difference replaces the old one. → the decisions written.
export function recordKept(ROOT, findings, { reason, by = null, at = new Date().toISOString(), truth = null, review = null } = {}) {
  if (!String(reason ?? '').trim()) throw new Error('a kept difference needs its reason');
  const byKey = new Map(readKept(ROOT).map((d) => [d.key, d]));
  const added = [];
  for (const f of findings) {
    const key = keptKey(`${f.check} :: ${f.what}`);
    const e = { key, ...split(key), component: f.component ?? null, reason: String(reason).trim(), by: by || null, at,
      ...(truth ? { truth } : {}), ...(review ? { review } : {}) };
    byKey.set(key, e);
    added.push(e);
  }
  write(ROOT, [...byKey.values()]);
  return added;
}

// Take decisions back: the ones test(decision) picks. → the decisions removed.
export function dropKept(ROOT, test) {
  const all = readKept(ROOT), gone = all.filter(test);
  if (gone.length) write(ROOT, all.filter((d) => !gone.includes(d)));
  return gone;
}

// The differences a person names: by component (one or several), and by words they contain (any of them).
export function pick(list, { component = null, words = [] } = {}) {
  const ws = words.map((w) => String(w).toLowerCase()).filter(Boolean);
  const cs = [component ?? []].flat().map((c) => String(c).toLowerCase()).filter(Boolean);
  return list.filter((x) => (!cs.length || cs.includes(String(x.component ?? '').toLowerCase()))
    && (!ws.length || ws.some((w) => `${x.check} ${x.what}`.toLowerCase().includes(w))));
}

// A run's gates against the decisions: each kept line is said as kept (✋, with its reason), and a gate whose failing
// lines are all kept passes. Mutates the gates. → [{ finding, decision }] for every kept line.
export function keepInGates(gates, decisions) {
  if (!decisions?.length) return [];
  const byKey = new Map(decisions.map((d) => [d.key, d]));
  const out = [];
  for (const g of gates ?? []) {
    if (g.planLimited || g.notRun) continue;
    const name = String(g.label ?? '').replace(ANSI, '').replace(/\s{2}\(.*$/, '').trim();
    let failing = 0, kept = 0;
    g.lines = (g.lines ?? []).map((l) => {
      const t = String(l).replace(ANSI, '').trim();
      if (!/^(❌|⚠️)/.test(t) || COUNT.test(t)) return l;
      const bad = t.startsWith('❌');
      if (bad) failing++;
      const finding = `${name} :: ${t}`;
      const d = byKey.get(keptKey(finding));
      if (!d) return l;
      if (bad) kept++;
      out.push({ finding, decision: d });
      return `${KEPT_MARK} kept on purpose: ${keptSay(t.replace(ICON, ''))}  (${d.reason}${d.by ? `; ${d.by}` : ''}, ${String(d.at ?? '').slice(0, 10)})`;
    });
    if (!g.pass && failing > 0 && kept === failing) {
      g.pass = true; g.kept = kept;
      g.lines = g.lines.map((l) => (COUNT.test(String(l).replace(ANSI, '').trim()) ? `${KEPT_MARK} ${kept} kept on purpose` : l));
    }
  }
  return out;
}

// The rest of a run's findings against the decisions. findings: the run's findings (strings). → { kept: [{ finding,
// decision }], open: [findings not kept] }.
export function matchKept(decisions, findings) {
  const byKey = new Map((decisions ?? []).map((d) => [d.key, d]));
  const kept = [], open = [];
  for (const f of findings ?? []) { const d = byKey.get(keptKey(f)); if (d) kept.push({ finding: f, decision: d }); else open.push(f); }
  return { kept, open };
}

// Every decision against what the run found. seen: [{ decision }] (from the gates and the rest). → { kept: the
// decisions found this run, gone: the ones not found (their values changed, or the difference is gone), due: the kept
// ones whose review date has come }.
export function keptState(decisions, seen, today = new Date().toISOString().slice(0, 10)) {
  const found = new Set((seen ?? []).map((s) => s.decision.key));
  const kept = (decisions ?? []).filter((d) => found.has(d.key));
  return { kept, gone: (decisions ?? []).filter((d) => !found.has(d.key)), due: kept.filter((d) => d.review && d.review <= today) };
}

// A kept difference as people read it: without the fix the audit proposes for an open one (→ set 32px).
export const keptSay = (what) => String(what ?? '').replace(/\s{2,}→\s+.*$/, '').replace(/\s+\[[^\]]*\]$/, '').trim();

// One decision as a line: the difference, then why, who, when, which side is right and when to look again.
export function keptLine(d, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const side = d.truth === 'figma' ? 'Figma is right' : d.truth === 'code' ? 'the code is right' : null;
  const review = d.review ? (d.review <= today ? `to look at again since ${d.review}` : `look again on ${d.review}`) : null;
  return `${d.component ? `${d.component}, ` : ''}${d.check}: ${keptSay(d.what)}  (${[d.reason, d.by && `kept by ${d.by}`, d.at && `on ${String(d.at).slice(0, 10)}`, side, review].filter(Boolean).join('; ')})`;
}

// What the audit prints about the decisions. → lines.
export function keptReport(state, { file = PROJECT.kept.now, today } = {}) {
  const lines = [];
  if (state.kept.length) {
    lines.push(`${KEPT_MARK} Kept on purpose: ${state.kept.length} difference${state.kept.length === 1 ? '' : 's'} the team decided to keep (${file}). They never fail the run.`);
    for (const d of state.kept) lines.push(`   • ${keptLine(d, { today })}`);
  }
  if (state.due.length) lines.push(`   ${state.due.length} to look at again: keep each with --keep and a new --review, or drop it with --unkeep and fix it.`);
  if (state.gone.length) {
    lines.push(`⚠️  Kept on purpose, no longer found (a value changed, or the difference is gone): ${state.gone.length}. A changed one is open again until the person decides on it.`);
    for (const d of state.gone) lines.push(`   • ${keptLine(d, { today })}`);
    lines.push('   Drop the ones that are gone: rms-design-system-engine --unkeep --match <words>.');
  }
  return lines;
}

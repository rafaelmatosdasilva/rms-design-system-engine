// baseline.mjs - gate-level adoption baseline + ratchet (feature #2).
//
// A real codebase is rarely 100% green on day one. Without a baseline, adopting the audit means
// either a wall of red (ignored) or turning gates off (drift hides). The baseline records which
// gates are failing at adoption time as ACCEPTED DEBT: those gates no longer fail the run, but any
// gate NOT in the baseline that fails is a real regression and fails. Debt can only ratchet DOWN -
// a baselined gate that goes green is surfaced so it can be locked in and never regress silently.
//
// Gate-level (not per-finding) on purpose: it uses only the pass/fail the audit already has for all
// gates, is fully deterministic, imposes no structure, and the committed baseline is legible - you
// can read exactly which gates are owed. Pure and degrade-safe; the file is COMMITTED (shared in CI).

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { ZERO_FAIL } from './run-diff.mjs';

// Finding-level acceptance (idea I54): `--baseline --findings` records each failing gate's ❌ lines
// instead of the gate, keyed as the run diff keys them ("<gate> :: <line text>"). A failing gate whose
// ❌ lines are all accepted is debt; any other ❌ line (a new one, or a known one whose value changed,
// which is new text) is a regression. An accepted line that no longer appears is fixed: re-run
// --baseline --findings to drop it, so it cannot come back silently.
const ANSI = /\x1b\[[0-9;]*m/g;
const gateName = (label) => String(label).replace(ANSI, '').replace(/\s{2}\(.*$/, '').trim();
export function findingKeys(gate) {
  return (gate?.lines ?? []).map((l) => String(l).replace(ANSI, '').trim())
    .filter((t) => t.startsWith('❌') && !ZERO_FAIL.test(t)).map((t) => `${gateName(gate.label)} :: ${t}`);
}

export function loadBaselineFindings(path) {
  try {
    if (!existsSync(path)) return null;
    const doc = JSON.parse(readFileSync(path, 'utf8'));
    return Array.isArray(doc?.findings) ? doc.findings.filter((x) => typeof x === 'string') : null;
  } catch { return null; }
}

// Read the accepted-debt gate labels from the baseline file, or null when there is no baseline.
// Never throws; a malformed file reads as "no baseline" (adoption is opt-in, never a hard stop).
export function loadBaselineLabels(path) {
  try {
    if (!existsSync(path)) return null;
    const doc = JSON.parse(readFileSync(path, 'utf8'));
    return Array.isArray(doc?.gates) ? doc.gates.filter((x) => typeof x === 'string') : [];
  } catch { return null; }
}

// The gates that are genuinely failing right now (plan-limited gates are neutral, never debt).
export function currentFailingLabels(gates) {
  return (gates || []).filter((g) => !g.pass && !g.planLimited).map((g) => g.label);
}

// Compare the current gate results against the baseline. Returns:
//   debt        - failing AND baselined (accepted; does not fail the run)
//   regressions - failing AND not baselined (real; fails the run)
//   ratcheted   - baselined but now passing (lock it in with --baseline so it can't regress)
//   stale       - baseline labels that no longer match any gate (renamed/removed; prune them)
//   gateFail    - whether the gate portion of the verdict should fail (regressions only)
//   newFindings    - with accepted findings: every ❌ line not accepted (in a gate not accepted whole)
//   fixedFindings  - accepted findings that no longer appear (ratchet them out)
export function classifyBaseline(gates, baselineLabels, acceptedFindings = null) {
  const base    = new Set(baselineLabels || []);
  const present = new Set((gates || []).map((g) => g.label));
  const failing = currentFailingLabels(gates);
  const failSet = new Set(failing);
  const accepted = new Set(acceptedFindings || []);
  const byLabel = new Map((gates || []).map((g) => [g.label, g]));
  const current = new Set((gates || []).flatMap((g) => (!g.pass && !g.planLimited ? findingKeys(g) : [])));
  // A gate is accepted per line when every one of its ❌ lines is in the accepted list.
  const byLines = (l) => {
    if (!accepted.size) return false;
    const keys = findingKeys(byLabel.get(l));
    return keys.length > 0 && keys.every((k) => accepted.has(k));
  };
  const debt        = failing.filter((l) => base.has(l) || byLines(l));
  const newFindings = accepted.size ? failing.filter((l) => !base.has(l)).flatMap((l) => findingKeys(byLabel.get(l))).filter((k) => !accepted.has(k)) : [];
  const regressions = failing.filter((l) => !debt.includes(l));
  const ratcheted   = [...base].filter((l) => present.has(l) && !failSet.has(l));
  const stale       = [...base].filter((l) => !present.has(l));
  const fixedFindings = [...accepted].filter((k) => !current.has(k));
  return { debt, regressions, ratcheted, stale, newFindings, fixedFindings, acceptedFindings: accepted.size, gateFail: regressions.length > 0 };
}

// Capture the current failing gates as the new baseline and write it. Returns the labels written.
// With { findings: true }, each failing gate's ❌ lines are recorded instead of the gate; a failing gate
// with no ❌ line to accept is still recorded as a gate.
// merge: a scoped run (--component) sees only its components' findings, so it adds to the file instead of
// replacing it; the debt of every other component stays accepted (I56). An unscoped run rewrites it.
// match: only the findings whose line (or gate) contains one of these words are accepted ("the radius, not the
// rest"): it implies findings, and a gate with no ❌ line is accepted only when its name matches.
export function writeBaseline(path, gates, { findings = false, merge = false, match = null, from = path } = {}) {
  const words = (match ?? []).map((w) => String(w).toLowerCase()).filter(Boolean);
  const hit = (text) => !words.length || words.some((w) => String(text).replace(ANSI, '').toLowerCase().includes(w));
  if (words.length) findings = true;
  const failing = (gates || []).filter((g) => !g.pass && !g.planLimited);
  // A gate's count line (❌ FAIL  1, ❌ NAME  5) names nothing: it goes with the gate's lines that match.
  const COUNT = /:: ❌\s+[A-Z][A-Z ?]*?\s+\d+(\/\d+)?(\s|$)/;
  let lines = findings ? failing.flatMap((g) => { const keys = findingKeys(g); const own = keys.filter((k) => !COUNT.test(k) && hit(k)); return words.length ? (own.length ? [...keys.filter((k) => COUNT.test(k)), ...own] : []) : keys; }) : [];
  let labels = findings ? failing.filter((g) => !findingKeys(g).length && hit(g.label)).map((g) => g.label) : currentFailingLabels(gates);
  if (words.length && merge === false) merge = true;   // accepting some lines never drops the ones accepted before
  if (merge && existsSync(from)) {
    let old = {};
    try { old = JSON.parse(readFileSync(from, 'utf8')); } catch { /* unreadable: nothing to keep */ }
    labels = [...new Set([...(Array.isArray(old.gates) ? old.gates : []), ...labels])];
    lines = [...new Set([...(Array.isArray(old.findings) ? old.findings : []), ...lines])];
    if (!findings && Array.isArray(old.findings)) findings = old.findings.length > 0;
  }
  const doc = {
    $note: findings
      ? 'rms-design-system-engine adoption baseline (finding-level accepted debt). Each listed finding is a known ❌ line, accepted as debt; a failing gate whose ❌ lines are all listed does not fail the run. Any other ❌ line, including a listed one whose value changed, is a regression. A listed finding that is fixed is reported so you can re-run --baseline --findings to drop it. COMMIT this file.'
      : 'rms-design-system-engine adoption baseline (gate-level accepted debt). These gates are currently failing and are treated as KNOWN DEBT - they do not fail the run. A gate NOT listed here that fails is a real regression and fails the audit. Debt only ratchets down: a baselined gate that goes green is reported so you can re-run --baseline to lock it in. COMMIT this file (no secrets - only gate labels).',
    created: new Date().toISOString(),
    gates: labels,
    ...(findings ? { findings: lines } : {}),
  };
  writeFileSync(path, JSON.stringify(doc, null, 2) + '\n');
  return findings ? [...labels, ...lines] : labels;
}

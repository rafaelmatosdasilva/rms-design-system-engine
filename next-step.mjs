// next-step.mjs - one next step, and one plain summary, per run (idea I55, "the agent's part as small as
// possible"). An agent relays what the engine says instead of composing its own reading of a long report,
// so two runs over the same state say the same thing.
//
//   • nextStep(state)   → the single NEXT line: what to do now, with the exact command.
//   • buildSummary(...) → the plain-language result to relay in the chat as is; also written to
//                         .parity-out/summary.md, and printed again by `--summary`.
// Pure: the audit passes in what it already computed.
import { ZERO_FAIL } from './run-diff.mjs';

const ANSI = /\x1b\[[0-9;]*m/g;
const clean = (l) => String(l).replace(ANSI, '').trim();
const gateName = (label) => clean(label).replace(/\s{2}\(.*$/, '');

// The ❌ lines of a gate, and the measured differences Gate [13] lists.
// A count line ("❌ FAIL  1", "❌ BROKEN  2 (…)") says how many, not which: left out. A "Fix:" hint the gate
// printed is kept, as the way to fix the line before it.
const COUNT = /^❌\s+[A-Z][A-Z ?]*\s+\d+(\/\d+)?(\s|$)/;
export function failLines(gate) {
  return (gate?.lines ?? []).map(clean).filter((t) => (t.startsWith('❌') && !ZERO_FAIL.test(t) && !COUNT.test(t)) || /^Fix:/.test(t));
}
export function measuredLines(gates) {
  return (gates ?? []).flatMap((g) => (g.lines ?? []).map(clean))
    .filter((t) => /^⚠️\s+\S+ .*: Figma .*, rendered |while disabled \(/.test(t));
}

// state: { failing: [gate], scope: [names], handback: { code, figma }, burndownNext, baselineWritten: { count, file }, cmd }
export function nextStep({ failing = [], scope = [], handback = {}, burndownNext = null, baselineWritten = null, cmd = 'rms-figma-code-parity' } = {}) {
  const rerun = scope.length ? `${cmd} --component ${scope.join(',')}` : cmd;
  if (baselineWritten) return `NEXT: tell the user ${baselineWritten.file} now holds the accepted debt; commit it only when they ask.`;
  if (failing.length) {
    const g = failing[0];
    return `NEXT: fix the ❌ lines under "${gateName(g.label)}"${failing.length > 1 ? ` (and ${failing.length - 1} more failing gate${failing.length > 2 ? 's' : ''})` : ''}, then run ${rerun}. To accept a known one instead: ${cmd} --baseline --findings (only when the user says so).`;
  }
  if (handback.code) return `NEXT: show the user ${handback.code}; apply it only when they ask (git apply ${handback.code}), then run ${rerun}.`;
  if (handback.figma) return `NEXT: show the user ${handback.figma}, the changes to make in Figma. Nothing is changed in Figma by the skill.`;
  if (burndownNext && !scope.length) return `NEXT: ${cmd} --component ${burndownNext}`;
  return 'NEXT: nothing to do. Parity holds for what was checked.';
}

// The plain summary. verdict: 'failed' | 'debt' | 'pass' | 'baseline' (the run wrote the baseline).
export function buildSummary({ verdict, gates = [], scope = [], burndown = [], next, notRun = 0, baselineWritten = null } = {}) {
  const lines = [];
  const failing = gates.filter((g) => !g.pass && !g.planLimited && !g.baselined);
  const debt = gates.filter((g) => g.baselined);
  lines.push(`# Parity result${scope.length ? ` for ${scope.join(', ')}` : ''}`, '');
  lines.push(verdict === 'baseline' ? `**Baseline written.** ${baselineWritten?.count ?? 0} failing item${baselineWritten?.count === 1 ? '' : 's'} recorded as accepted debt in ${baselineWritten?.file ?? 'parity-baseline.json'}; from now on only new ones fail.`
    : verdict === 'failed' ? `**Not in parity.** ${failing.length} of ${gates.length} gates fail.`
    : verdict === 'debt' ? `**No regressions.** ${debt.length} gate${debt.length === 1 ? '' : 's'} carry accepted debt.`
      : `**In parity.** Every gate that ran passes${notRun ? ` (${notRun} not verified)` : ''}.`);
  for (const g of verdict === 'baseline' ? [] : failing) {
    const f = failLines(g);
    lines.push('', `- **${gateName(g.label)}** fails:`);
    for (const t of f.slice(0, 5)) lines.push(/^Fix:/.test(t) ? `    - ${t}` : `  - ${t.replace(/^❌\s*/, '')}`);
    if (f.length > 5) lines.push(`  - and ${f.length - 5} more`);
  }
  const measured = measuredLines(gates);
  if (measured.length) {
    lines.push('', `**Measured differences** (rendered in the browser, advisory): ${measured.length}`);
    for (const t of measured.slice(0, 8)) lines.push(`- ${t.replace(/^⚠️\s*/, '')}`);
    if (measured.length > 8) lines.push(`- and ${measured.length - 8} more`);
  }
  if (burndown.length) lines.push('', burndown[0].replace(/^📉\s*/, ''));
  if (next) lines.push('', next);
  return lines.join('\n') + '\n';
}

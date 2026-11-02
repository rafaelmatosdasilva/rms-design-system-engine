// first-result.mjs - the value straight after setup: one well-paired component checked, its three main findings, each
// with what to do, and what to ask next.
//
// Setup used to end on "run the audit", and the first audit of a whole system is long: dozens of findings, most of them
// about data to refresh or choices to make, before a person has seen what the engine is for. So setup ends on one
// component Figma and the code both have, the one paired most fully (its variants and props named on both sides), and
// on what matters most in it: a difference first, one each check, who acts on it. Then three requests to try next.
//
//   pickComponent({ structure, files, props })   → name | null   the component Figma and the code pair most fully
//   mainFindings(findings, component, n = 3)     → [finding]     what matters most in it, one a check
//   whoActs(finding)                             → words         who does it
//   withFixes(records, lines)                    → [record]      each finding with the fix the run printed for it
//   firstResultLines({ component, findings, cmd }) → [line]      the block the person reads

// Checks that are about the run, not about the component.
const NOT_THE_COMPONENT = /^(Data is up to date|What this audit actually checked)$/;

// The component Figma and the code pair most fully: in both, its code file there, scored by how much of it Figma names
// (variants, props) and whether the names already agree. structure: figma-structure components; files: { name: [path
// that exists] }; props: figma-component-props components.
export function pickComponent({ structure = {}, files = {}, props = {} } = {}) {
  const scored = Object.keys(structure).filter((n) => (files[n] ?? []).length).map((n) => {
    const s = structure[n] ?? {}, p = props[n]?.properties ?? {};
    const variants = Object.keys(s.variants ?? {}).length, named = Object.keys(p).length;
    return { n, score: Math.min(variants, 12) + named * 2 + (s.nodeId ? 1 : 0) };
  });
  scored.sort((a, b) => b.score - a.score || a.n.localeCompare(b.n));
  return scored[0]?.n ?? null;
}

// What matters most in the component: what fails before what is advisory, a difference before a note, a change someone
// can make (in Figma or in the code) before a choice to make; one a check, so three findings say three things.
// A difference the run names for no one component (a token the component uses) fills in when it has fewer than n.
export function mainFindings(findings = [], component, n = 3) {
  const rank = (f) => (f.verdict === 'fails' ? 0 : 4) + (f.difference ? 0 : 2) + (f.side === 'decide' ? 1 : 0);
  const usable = (f) => f && !NOT_THE_COMPONENT.test(f.check ?? '') && f.verdict !== 'passes' && !/^Fix:/.test(f.evidence ?? '');
  const mine = findings.filter((f) => usable(f) && f.component === component).sort((a, b) => rank(a) - rank(b));
  const system = findings.filter((f) => usable(f) && !f.component && f.difference).sort((a, b) => rank(a) - rank(b));
  const out = [], checks = new Set();
  for (const f of [...mine, ...system]) {
    if (checks.has(f.check)) continue;
    checks.add(f.check); out.push(f);
    if (out.length === n) break;
  }
  return out;
}

// The run's own findings as records (run-diff.mjs findingRecords), each given the "Fix:" line the run printed right
// after it for the same check. lines: the run's findings as it keeps them ("Check :: what it found").
export function withFixes(records = [], lines = []) {
  const plain = (l) => String(l).replace(/^\s*(❌|⚠️|ℹ️)\s*/, '').trim();
  const fixOf = new Map();
  lines.forEach((l, i) => {
    const m = /^(.+?) :: Fix:\s*(.+)$/.exec(String(l));
    if (!m || i === 0) return;
    for (let k = i - 1; k >= 0; k--) {
      const p = String(lines[k]), at = p.indexOf(' :: ');
      if (at < 0 || p.slice(0, at) !== m[1]) break;
      if (/ :: Fix:/.test(p)) continue;
      const key = `${m[1]}|${plain(p.slice(at + 4))}`;
      fixOf.set(key, fixOf.has(key) ? `${fixOf.get(key)}; ${m[2]}` : m[2]);
      break;
    }
  });
  return records.filter((r) => !/^Fix:/.test(String(r.evidence ?? '').trim()))
    .map((r) => { const fix = fixOf.get(`${r.check}|${plain(r.evidence)}`); return fix ? { ...r, fix } : { ...r }; });
}

export function whoActs(f) {
  return f?.side === 'figma' ? 'In Figma, by whoever keeps the file' : f?.side === 'code' ? 'In the code, by a developer' : 'You decide which side is right, then one side changes';
}

// The block the person reads: what was checked, its main findings with who acts, and three requests to try next.
export function firstResultLines({ component, findings = [], cmd = '/rms-design-system-engine', report = null, asked = false }) {
  const lines = [`🎯 First result: ${component}${asked ? '' : ', the component Figma and the code pair most fully'}, checked against Figma${report ? ` (its whole report: ${report})` : ''}.`];
  if (!findings.length) lines.push(`   Nothing to fix in ${component}: Figma and the code agree.`);
  findings.forEach((f, i) => {
    lines.push(`   ${i + 1}. ${f.check}: ${String(f.evidence ?? '').replace(/\s+/g, ' ').trim()}`);
    lines.push(`      What to do: ${f.fix ? `${f.fix.replace(/\.$/, '')} (${whoActs(f).charAt(0).toLowerCase() + whoActs(f).slice(1)})` : whoActs(f)}.`);
  });
  lines.push('', '   Ask next:');
  for (const r of [`check the ${component} and show it in the style guide`, 'which component should I fix first?', 'check everything']) lines.push(`   ${cmd} ${r}`);
  return lines;
}

// only.mjs - --only: run only what the person asked for. The accessibility check, the Figma checks (the parity
// gates), or some gates by number or by name:
//   --only accessibility        the accessibility check alone (from the code, and in the browser when it can)
//   --only parity               the gates that compare the code with Figma, without the accessibility check
//   --only 3   --only "token values"   --only states,props   one gate or several
// What was not asked is neither shown nor counted: the verdict and the summary say which part ran, so a partial
// run never reads as the whole system passing. A run that records (--baseline, the history, the "since the last
// run" list) needs the whole run.
import { readFileSync } from 'node:fs';

// The gates, in order, as the audit adds them (the same source sync-docs reads).
export function gateLabels(auditSource) {
  return [...String(auditSource ?? '').matchAll(/addGate\(\s*'([^']+)'/g)].map((m) => m[1].trim());
}
export const readGateLabels = (auditFile) => { try { return gateLabels(readFileSync(auditFile, 'utf8')); } catch { return []; } };

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const short = (label) => String(label).replace(/\s{2}\(.*$/, '').trim();
const A11Y = /^(accessibility|a11y|acessibilidade|accesibilidad|accessibilite)( check)?$/;
const PARITY = /^(parity|paridade|figma|the figma checks|gates|all gates|todos os gates)$/;

// The person's words → { a11y, parity, gates: Set(number), unknown: [words] }.
export function parseOnly(values, labels) {
  const out = { a11y: false, parity: false, gates: new Set(), unknown: [] };
  for (const raw of [values].flat().flatMap((v) => String(v ?? '').split(',')).map((v) => v.trim()).filter(Boolean)) {
    const v = norm(raw);
    if (A11Y.test(v)) { out.a11y = true; continue; }
    if (PARITY.test(v)) { out.parity = true; labels.forEach((_, i) => out.gates.add(i + 1)); continue; }
    const n = /^(?:gate )?(\d+)$/.exec(v)?.[1];
    if (n && Number(n) >= 1 && Number(n) <= labels.length) { out.gates.add(Number(n)); continue; }
    // A name, tried in this order: a gate whose short name holds it ("icon" in "Icons"), a gate whose short name it
    // holds ("Icons match Figma" holds "Icons"), then a gate whose whole label has every word of it ("No invented
    // variables"). A plural, a past tense and the bare word all match.
    const STOP = new Set(['the', 'a', 'an', 'of', 'in', 'is', 'are', 'to', 'and', 'gate', 'check']);
    const asked = norm(raw).split(' ').filter((w) => !STOP.has(w));
    // "use" and "uses", "check" and "checked": one word starts the other.
    const same = (a, b) => a === b || (a.length >= 3 && b.startsWith(a)) || (b.length >= 3 && a.startsWith(b));
    const has = (l, w) => norm(l).split(' ').some((x) => same(x, w));
    const tries = [
      (l) => v.length >= 3 && (norm(short(l)).includes(v) || norm(short(l)).replace(/s\b/g, '').includes(v.replace(/s\b/g, ''))),
      (l) => v.includes(norm(short(l))),
      (l) => asked.length > 0 && asked.every((w) => has(l, w)),
    ];
    let found = [];
    for (const t of tries) { found = labels.map((l, i) => (t(l) ? i + 1 : 0)).filter(Boolean); if (found.length) break; }
    if (found.length) found.forEach((i) => out.gates.add(i));
    else out.unknown.push(raw);
  }
  return out;
}

// What ran, in words, for the banner and the summary.
export function onlyWords(sel, labels) {
  const parts = [];
  if (sel.parity) parts.push(`the Figma checks (gates 1 to ${labels.length})`);
  else if (sel.gates.size) parts.push([...sel.gates].sort((a, b) => a - b).map((n) => `[${n}] ${short(labels[n - 1])}`).join(', '));
  if (sel.a11y) parts.push('the accessibility check');
  return parts.join(' and ');
}

// The answer to a word the engine does not know: what it can run instead.
export function onlyHelp(unknown, labels) {
  return [`Not a check this engine has: ${unknown.join(', ')}. Choose one or more of:`,
    '  accessibility   the accessibility check alone',
    '  parity          every check against Figma, without accessibility',
    ...labels.map((l, i) => `  ${String(i + 1).padEnd(15)} ${short(l)}`),
    'NEXT: rms-design-system-engine --only <one of the above>'].join('\n');
}

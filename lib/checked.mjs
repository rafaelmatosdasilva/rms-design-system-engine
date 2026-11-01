// checked.mjs - what a person checked by hand.
//
// Some WCAG criteria only a person can judge (an instruction that relies on colour alone, a heading that says what
// follows it, an error message that says how to put it right). When a person has looked, they say so and the engine
// records it in design-system-engine-checked.json (committed): the component, the criterion, who, when, and the
// component's signature at that moment. The style guide shows that row as Done, checked by that person on that day,
// until the component changes (its CSS rules, its contract entry or its source file): then it is To check again, with
// who checked it before. Only a person marks a check: the project's hooks ask first unless the person's own message
// says they checked it.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { PROJECT } from './names.mjs';
import { ruleLines, entryLines } from './styleguide-data.mjs';

const read = (ROOT, p) => { try { return readFileSync(resolve(ROOT, p), 'utf8'); } catch { return ''; } };

// What the component is now, as a short hash: its own CSS rules (in the theme files), its entry in the structure
// contract and its source file when ds-config names one. A change to any of them is a change to the component.
export function componentSignature(ROOT, cfg = {}, name, cls) {
  const linesOf = (text, nums) => { const all = text.split('\n'); return nums.map((n) => all[n - 1] ?? '').join('\n'); };
  const css = [cfg.paths?.themeCSS ?? []].flat().map((p) => read(ROOT, p)).join('\n');
  const contract = read(ROOT, cfg.paths?.structureContract ?? 'structure-contract.mjs');
  const file = cfg.componentFiles?.[name] ? read(ROOT, cfg.componentFiles[name]) : '';
  const parts = [cls ? linesOf(css, ruleLines(css, cls)) : '', linesOf(contract, entryLines(contract, name)), file];
  return createHash('sha1').update(parts.join('\n\u0000\n')).digest('hex').slice(0, 12);
}

export const checkedPath = (ROOT) => join(ROOT, PROJECT.checked.now);
export function readChecked(ROOT) {
  try { const j = JSON.parse(readFileSync(checkedPath(ROOT), 'utf8')); return Array.isArray(j.checks) ? j.checks : []; } catch { return []; }
}
const write = (ROOT, checks) => writeFileSync(checkedPath(ROOT), JSON.stringify({ version: 1, $description: 'What a person checked by hand, per component and WCAG criterion, with the component as it was then. Written by rms-design-system-engine --checked; commit it.', checks }, null, 1) + '\n');

// Record a check (one per component and criterion; a new one replaces the old). → the entry.
export function recordCheck(ROOT, { component, sc, by, at = new Date().toISOString(), signature }) {
  const entry = { component, sc, by, at, signature };
  write(ROOT, [...readChecked(ROOT).filter((c) => !(c.component === component && c.sc === sc)), entry].sort((a, b) => a.component.localeCompare(b.component) || a.sc.localeCompare(b.sc, undefined, { numeric: true })));
  return entry;
}
// Take a check back. → whether one was there.
export function removeCheck(ROOT, component, sc) {
  const all = readChecked(ROOT), left = all.filter((c) => !(c.component === component && c.sc === sc));
  if (left.length !== all.length) write(ROOT, left);
  return left.length !== all.length;
}

// A component's checks as the style guide reads them: { <sc>: { by, at, current } }, current while its signature is
// the one recorded.
export function checksFor(checks, component, signature) {
  const out = {};
  for (const c of checks ?? []) if (c.component === component) out[c.sc] = { by: c.by, at: c.at, current: c.signature === signature };
  return out;
}

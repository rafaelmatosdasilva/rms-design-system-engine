// I55: one next step and one plain summary per run, so an agent relays the engine's words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextStep, buildSummary, failLines, measuredLines, dataStateLine } from '../next-step.mjs';

const gate = (label, pass, lines = [], extra = {}) => ({ label, pass, lines, ...extra });
const tokens = gate('Token values  (color · sizing)', false, ['✅ PASS  25', '❌ FAIL  1', '❌ [sizing/-] radii/chip → --radii-chip', 'Fix:  src/theme.css:17 - change --radii-chip: 12px → 16px']);
const structure = gate('Structure', true, ['⚠️  MEASURED 1  (rendered in the browser)', '⚠️  chip height (Size=L, Icon=True): Figma 32, rendered 36px  (.tp-chip · src/theme.css:60)  → set 32px']);

test('NEXT: failing gates first, then the hand-back, then the burndown, else nothing to do', () => {
  assert.match(nextStep({ failing: [tokens] }), /^NEXT: tell the user what fails under "Token values" and the fix it names\. Change the code only when they ask for that fix, then run rms-design-system-engine\./);
  assert.match(nextStep({ failing: [tokens], scope: ['chip'] }), /then run rms-design-system-engine --component chip\./);
  assert.match(nextStep({ handback: { code: '.design-system-engine-out/handback/code-changes.diff' } }), /apply it only when they ask \(git apply/);
  assert.equal(nextStep({ burndownNext: 'chip' }), 'NEXT: rms-design-system-engine --component chip');
  assert.match(nextStep({ burndownNext: 'chip', scope: ['chip'] }), /nothing to do/);
  assert.match(nextStep({}), /nothing to do/);
});

test('summary: the failing lines with their fix, the measured differences, the same text every time', () => {
  assert.deepEqual(failLines(tokens), ['❌ [sizing/-] radii/chip → --radii-chip', 'Fix:  src/theme.css:17 - change --radii-chip: 12px → 16px']);
  assert.equal(measuredLines([structure]).length, 1);
  const args = { verdict: 'failed', gates: [tokens, structure], next: nextStep({ failing: [tokens] }) };
  const s = buildSummary(args);
  assert.match(s, /\*\*Not in parity\.\*\* 1 of 2 gates fail\./);
  assert.match(s, /- \*\*Token values\*\* fails:\n  - \[sizing\/-\] radii\/chip → --radii-chip\n    - Fix:/);
  assert.match(s, /\*\*Measured differences\*\* \(rendered in the browser, advisory\): 1\n- chip height/);
  assert.equal(s, buildSummary(args));   // deterministic
  assert.match(buildSummary({ verdict: 'pass', gates: [structure], next: 'NEXT: nothing to do.' }), /\*\*In parity\.\*\*/);
});

test('a run that writes the baseline says so, and never reads as in parity', () => {
  const written = { count: 2, file: 'design-system-engine-baseline.json' };
  assert.match(nextStep({ failing: [tokens], baselineWritten: written }), /^NEXT: tell the user design-system-engine-baseline\.json now holds the accepted debt; commit it only when they ask\./);
  const s = buildSummary({ verdict: 'baseline', gates: [tokens], baselineWritten: written });
  assert.match(s, /\*\*Baseline written\.\*\* 2 failing items recorded/);
  assert.doesNotMatch(s, /In parity|fails:/);
});

test('the summary says whether the Figma data was refreshed, so no one has to infer it (I56)', () => {
  const snaps = [{ file: 'src/figma-vars.snapshot.json', ageHours: 5 }, { file: 'src/figma-structure.snapshot.json', ageHours: 75 }];
  const not = dataStateLine({ snapshots: snaps });
  assert.match(not, /^\*\*Figma data was not refreshed in this run\.\*\*/);
  assert.match(not, /the oldest, src\/figma-structure\.snapshot\.json, 3 days old/);
  assert.match(not, /rms-design-system-engine --recipe refresh-figma/);
  assert.match(dataStateLine({ snapshots: [{ file: 'a.json', ageHours: 2 }] }), /a\.json, updated today/);
  assert.match(dataStateLine({ snapshots: [{ file: 'a.json', ageHours: 30 }] }), /1 day old/);
  const api = dataStateLine({ refreshedFromApi: true, snapshots: snaps });
  assert.match(api, /refreshed from the Figma API in this run/);
  assert.doesNotMatch(api, /not refreshed/);
  assert.match(dataStateLine({ snapshots: [{ file: 'gone.json', ageHours: null }] }), /no readable snapshot\. Not readable: gone\.json\./);
  // It sits right under the verdict, and a summary without it stays as it was.
  const s = buildSummary({ verdict: 'pass', gates: [], data: not });
  assert.ok(s.indexOf('**In parity.**') < s.indexOf('**Figma data was not refreshed'));
  assert.doesNotMatch(buildSummary({ verdict: 'pass', gates: [] }), /Figma data/);
});

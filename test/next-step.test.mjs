// one next step and one plain summary per run, so an agent relays the engine's words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextStep, buildSummary, failLines, measuredLines, dataStateLine, notCheckedLines } from '../lib/next-step.mjs';

const gate = (label, pass, lines = [], extra = {}) => ({ label, pass, lines, ...extra });
const tokens = gate('Token values  (color · sizing)', false, ['✅ PASS  25', '❌ FAIL  1', '❌ [sizing/-] radii/chip → --radii-chip', 'Fix:  src/theme.css:17 - change --radii-chip: 12px → 16px']);
const structure = gate('Structure', true, ['⚠️  MEASURED 1  (rendered in the browser)', '⚠️  chip height (Size=L, Icon=True): Figma 32, rendered 36px  (.tp-chip · src/theme.css:60)  → set 32px']);

test('NEXT: failing gates first, then the hand-back, then the burndown, else nothing to do', () => {
  assert.match(nextStep({ failing: [tokens] }), /^NEXT: tell the user what fails under "Token values" and the fix it names\. Change the code only when they ask for that fix \(a request to fix it is that ask: make the change, do not ask again\), then run rms-design-system-engine\./);
  assert.match(nextStep({ failing: [tokens], scope: ['chip'] }), /then run rms-design-system-engine --component chip\./);
  assert.match(nextStep({ handback: { code: '.design-system-engine-out/handback/code-changes.diff' } }), /apply it only when they ask \(git apply \S+; a request to fix it is that ask: do not ask again\)/);
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

test('the summary says whether the Figma data was refreshed, so no one has to infer it', () => {
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

test('NEXT names the measured differences beside the failing gates, so a relay keeps them', () => {
  const failing = [{ label: 'Token values  (color · sizing)', lines: ['❌ radii/chip'] }];
  assert.match(nextStep({ failing, measured: 2 }), /and the fix it names, and the 2 differences under "Measured differences"\./);
  assert.match(nextStep({ failing, measured: 1 }), /the 1 difference under "Measured differences"/);
  assert.doesNotMatch(nextStep({ failing }), /Measured differences/);
});

test('the summary lists what a gate could not check, even inside a gate that passed', () => {
  const gates = [
    { label: 'Markup  (ids)', pass: true, lines: ['✅ app: structure unchanged', '⏭  screen elements: no figma-screens.snapshot.json - skipped (capture it to enable)'] },
    { label: 'Figma frame unchanged  (frame)', pass: true, planLimited: true, lines: ['⏭ skipped - FIGMA_TOKEN not set'] },
    { label: 'Token values  (color)', pass: true, lines: ['✅ OK 12'] },
  ];
  const s = buildSummary({ verdict: 'passed', gates });
  assert.match(s, /\*\*Not checked in this run\*\*: 2/);
  assert.match(s, /- Markup: screen elements: no figma-screens\.snapshot\.json/);
  assert.match(s, /- Figma frame unchanged: FIGMA_TOKEN not set/);
  assert.doesNotMatch(s, /Token values:/);
  assert.deepEqual(notCheckedLines([{ label: 'X  (y)', pass: true, lines: ['✅ fine'] }]), []);
});

test('the verification headline, each component passing, drifting or not checked', async () => {
  const { verification, verificationLine } = await import('../lib/run-diff.mjs');
  const d = { groups: [
    { component: 'chip', items: [{ side: 'decide' }] },
    { component: 'card', items: [{ side: 'figma' }] },   // work in the Figma file alone is not drift
    { component: null, items: [{ side: 'decide' }] },
  ] };
  const census = { components: { chip: { compared: 4 }, card: { compared: 6 }, badge: { compared: 0, notComparable: 2 } } };
  const v = verification(['badge', 'card', 'chip', 'modal'], d, census);
  assert.deepEqual(v, { passing: ['card'], drifting: ['chip'], notChecked: ['badge', 'modal'], measured: true });
  assert.equal(verificationLine(v), '**Components: 1 passing · 1 drifting (chip) · 2 not checked (badge, modal).**');
  // Nothing measured in a browser: nothing is "not checked" by the census, and the line says what passing means then.
  assert.match(verificationLine(verification(['card', 'chip'], d, null)), /^\*\*Components: 1 passing · 1 drifting \(chip\) · 0 not checked\.\*\* Nothing was measured in a browser this run/);
  assert.equal(verificationLine(verification([], d, census)), null);
  // Inside Codex's sandbox (it sets CODEX_SANDBOX) Chrome cannot start: the line says so, with how to measure after all.
  const unmeasured = verification(['card', 'chip'], d, null);
  assert.match(verificationLine(unmeasured, { CODEX_SANDBOX: 'seatbelt' }), /inside Codex's sandbox, where Chrome cannot start[\s\S]*outside the sandbox/);
  assert.doesNotMatch(verificationLine(unmeasured, {}), /sandbox/, 'said only where it is so');
  assert.doesNotMatch(verificationLine(v, { CODEX_SANDBOX: 'seatbelt' }), /sandbox/, 'a run that measured has nothing to say about it');
  // Under the verdict in the summary; never on a run that writes the baseline.
  assert.match(buildSummary({ verdict: 'pass', headline: '**Components: 2 passing · 0 drifting · 0 not checked.**' }), /In parity\.[^\n]*\n\n\*\*Components: 2 passing/);
  assert.doesNotMatch(buildSummary({ verdict: 'baseline', baselineWritten: { count: 1 }, headline: '**Components: x**' }), /Components: x/);
});

test('whether the Figma file is reliable enough to compare is said with the Figma data, before what fails', () => {
  const s = buildSummary({ verdict: 'failed', gates: [tokens], data: '**Figma data was not refreshed in this run.**', figma: '**The Figma file is only partly reliable to compare.** x' });
  assert.match(s, /not refreshed in this run\.\*\*\n\n\*\*The Figma file is only partly reliable to compare\.\*\* x\n\n- \*\*Token values\*\* fails/);
});

test('inside Codex\'s sandbox, every run says the browser could not start, as the step before NEXT', async () => {
  const { sandboxLine } = await import('../lib/run-diff.mjs');
  const env = { CODEX_SANDBOX: 'seatbelt' };
  assert.match(sandboxLine({ measured: false }, env), /Codex's sandbox[\s\S]*outside the sandbox[\s\S]*then follow the NEXT line/);
  assert.equal(sandboxLine({ measured: true }, env), null, 'a run that measured in a browser has nothing to say about it');
  assert.equal(sandboxLine({ measured: false }, {}), null, 'outside Codex nothing is said');
  assert.equal(sandboxLine({ measured: false, said: 'inside Codex\'s sandbox, where Chrome cannot start' }, env), null, 'never twice: the full run\'s headline already said it');
});

test('inside Codex\'s sandbox no browser is started at all: the launch is refused at once, with the reason', async () => {
  const { launchChrome, sandboxRefusal, SANDBOX_NO_BROWSER } = await import('../lib/cdp.mjs');
  const { launchFirefox } = await import('../lib/bidi.mjs');
  assert.equal(sandboxRefusal({}), null);
  // A path that would fail if spawned: refused before any spawn, so the error is the sandbox's, never a crash's.
  await assert.rejects(launchChrome('/nonexistent/chrome', { env: { CODEX_SANDBOX: 'seatbelt' } }), (e) => e.message === SANDBOX_NO_BROWSER);
  await assert.rejects(launchFirefox('/nonexistent/firefox', { env: { CODEX_SANDBOX: 'seatbelt' } }), (e) => e.message === SANDBOX_NO_BROWSER);
  const { launchSafari } = await import('../lib/webdriver.mjs');
  await assert.rejects(launchSafari('/nonexistent/safaridriver', { env: { CODEX_SANDBOX: 'seatbelt' } }), (e) => e.message === SANDBOX_NO_BROWSER);
  assert.doesNotMatch(SANDBOX_NO_BROWSER, /did not start within|exited before DevTools was ready/, 'never a reason the launcher tries again');
});

test('a design system\'s token set asked about is not a secret asked for', async () => {
  const { asksForSecret } = await import('../lib/guard.mjs');
  const { asksForToken } = await import('./skill-evals/rules.mjs');
  for (const f of [asksForSecret, asksForToken]) {
    assert.equal(f('You can name existing XL variables or share the token set.'), false);
    assert.equal(f('Paste your Figma token here.'), true, 'a real secret still is');
  }
});

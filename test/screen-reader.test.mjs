// What a real screen reader says, held against what the browser says it should (screen-reader.mjs). The readers
// themselves (VoiceOver, NVDA) cannot run in a test: they speak aloud and need a setting of the computer turned on.
// A stand-in reader that says what it is told runs the whole path in a real browser instead, and the comparison is
// tried on what VoiceOver and NVDA are known to say.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { writeFileSync, rmSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeFixture, budget } from './helpers.mjs';
import { expectedParts, compareSaid, missingLine, readerFor, loadReader, hearComponents, heardOf, heardLine, READERS, RESULT_FILE, hearRun } from '../lib/screen-reader.mjs';
import { route } from '../lib/route.mjs';
import { findChrome, launchChrome, connectCDP, openPage } from '../lib/cdp.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const CHROME = findChrome({ playwright: true });
const HAS_CHROME = !!CHROME && typeof WebSocket === 'function';

test('a line of the browser\'s is read in its parts: the role, the name, the level and the states', () => {
  assert.deepEqual(expectedParts('checkbox, Remember me, not checked'), { role: 'checkbox', name: 'Remember me', states: ['not checked'] });
  assert.deepEqual(expectedParts('heading, Billing, level 2'), { role: 'heading', name: 'Billing', level: 'level 2', states: [] });
  assert.deepEqual(expectedParts('button, Menu, expanded, unavailable'), { role: 'button', name: 'Menu', states: ['expanded', 'unavailable'] });
  assert.deepEqual(expectedParts('"Saved"'), { role: null, name: 'Saved', states: [] });
});

test('what VoiceOver and NVDA say counts in their own words, and a dropped part is named', () => {
  // VoiceOver's own words: "unchecked", "dimmed", "invalid data".
  assert.ok(compareSaid('checkbox, Remember me, not checked', 'Remember me, unchecked, checkbox', 'voiceover').ok);
  assert.ok(compareSaid('button, Save, unavailable', 'Save, dimmed, button', 'voiceover').ok);
  assert.ok(compareSaid('edit text, Email, invalid entry', 'Email, invalid data, edit text', 'voiceover').ok);
  assert.ok(compareSaid('heading, Billing, level 2', 'heading level 2, Billing', 'voiceover').ok);
  // NVDA's: "check box", "graphic", "unavailable".
  assert.ok(compareSaid('checkbox, Remember me, checked', 'Remember me check box checked', 'nvda').ok);
  assert.ok(compareSaid('image, Logo', 'graphic Logo', 'nvda').ok);
  // A state the tree has and the reader dropped is the finding.
  const menu = compareSaid('button, Menu, expanded', 'Menu, button', 'voiceover');
  assert.equal(menu.ok, false);
  assert.deepEqual(menu.missing, [{ part: 'state', want: 'expanded' }]);
  assert.equal(missingLine(menu.missing), 'it left out the state "expanded"');
  // "checked" is never heard inside "unchecked" or "not checked".
  assert.equal(compareSaid('checkbox, A, checked', 'A, unchecked, checkbox', 'voiceover').ok, false);
  assert.equal(compareSaid('checkbox, A, checked', 'A check box not checked', 'nvda').ok, false);
  // A wrong level, a missing name, silence.
  assert.deepEqual(compareSaid('heading, Billing, level 2', 'heading level 3, Billing').missing, [{ part: 'level', want: 'level 2' }]);
  assert.deepEqual(compareSaid('button, Save', 'button').missing, [{ part: 'name', want: 'Save' }]);
  assert.equal(missingLine(compareSaid('button, Save', '').missing), 'it said nothing');
  // Every state spokenLine can say has words in both readers.
  for (const r of Object.values(READERS)) for (const s of ['checked', 'not checked', 'pressed', 'expanded', 'collapsed', 'selected', 'required', 'invalid entry', 'unavailable']) assert.ok(r.states[s]?.length, `${r.label}: ${s}`);
});

test('the reader that cannot be driven is said with what the person does, and nothing is changed', async () => {
  assert.equal(readerFor('darwin'), 'voiceover');
  assert.equal(readerFor('win32'), 'nvda');
  assert.equal(readerFor('linux'), null);
  const none = await loadReader(ENGINE, 'voiceover', { platform: 'darwin', importer: async () => null });
  assert.match(none.why, /Guidepup.* not installed/);
  assert.match(none.how, /npm install --save-dev @guidepup\/guidepup/);
  const fake = { voiceOver: { start() {}, stop() {}, lastSpokenPhrase: () => 'x' } };
  const closed = await loadReader(ENGINE, 'voiceover', { platform: 'darwin', importer: async () => fake, allowed: false });
  assert.match(closed.why, /not allowed to be driven/);
  assert.match(closed.how, /Allow VoiceOver to be controlled with AppleScript/);
  const wrong = await loadReader(ENGINE, 'nvda', { platform: 'darwin' });
  assert.match(wrong.why, /NVDA runs on Windows/);
  const ok = await loadReader(ENGINE, 'voiceover', { platform: 'darwin', importer: async () => fake, allowed: true });
  assert.equal(ok.reader.label, 'VoiceOver');
  assert.equal(await ok.reader.said(), 'x');
});

test('asked in words, it is the run that hears, and the reader named is the one driven', async () => {
  for (const [t, want] of [['listen to our components with VoiceOver', '--hear --reader voiceover'], ['test our components with NVDA', '--hear --reader nvda'], ['what does a screen reader actually say on our button', '--hear']]) {
    const r = await route(t, { root: ENGINE });
    assert.ok(r.run.some((x) => x.endsWith(want)), `${t}: ${r.run}`);
  }
  // How it works is a question, not the run.
  const how = await route('how does the screen reader check work', { root: ENGINE });
  assert.ok(!how.run?.some((x) => /--hear/.test(x)), String(how.run));
});

test('what the style guide shows: who heard it, when, what was said apart, and to hear again once it changed', () => {
  const run = { at: '2026-11-14T10:00:00Z', reader: { name: 'VoiceOver', version: 'macOS 27.2' }, components: {
    menu: { signature: 'aaa', lines: [{ desc: 'button.menu', want: 'button, Menu, expanded', said: 'Menu, button', ok: false, missing: [{ part: 'state', want: 'expanded' }] }, { desc: 'a.home', want: 'link, Home', said: 'Home, link', ok: true }] },
  } };
  const h = heardOf(run, 'menu', 'aaa');
  assert.equal(h.reader, 'VoiceOver');
  assert.equal(h.at, '2026-11-14');
  assert.equal(h.heard, 2);
  assert.equal(h.same, 1);
  assert.deepEqual(h.apart, [{ desc: 'button.menu', want: 'button, Menu, expanded', said: 'Menu, button', why: 'it left out the state "expanded"' }]);
  assert.equal(h.stale, undefined);
  assert.equal(heardOf(run, 'menu', 'bbb').stale, true);
  assert.equal(heardOf(run, 'other'), null);
  assert.equal(heardLine(run), 'VoiceOver heard 2 controls across one component: one said apart from what the browser says.');
  assert.match(heardLine({ reader: null, why: 'VoiceOver is not allowed to be driven on this computer yet', how: 'Turn it on.' }), /^Nothing heard: VoiceOver is not allowed .*\. Turn it on\.$/);
});

test('no style guide, no reader: the run says why and writes what it found', async () => {
  const dir = makeFixture({ 'ds-config.json': '{}' });
  try {
    const run = await hearRun(dir, {}, { load: async () => { throw new Error('never asked'); } });
    assert.match(run.why, /no style guide/);
    assert.ok(JSON.parse(readFileSync(join(dir, RESULT_FILE), 'utf8')).why);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('in a real browser: each control focused in turn, the browser\'s line held against what the reader said', { skip: HAS_CHROME ? false : 'no Chrome available', timeout: budget(120000) }, async () => {
  const dir = makeFixture({});
  const page = join(dir, 'page.html');
  writeFileSync(page, `<!doctype html><html><body><section id="c-menu"><div class="pg-preview">
    <button aria-expanded="true">Menu</button>
    <label><input type="checkbox"> Remember me</label>
    <a href="/home">Home</a>
    <span>Words only</span>
  </div></section></body></html>`);
  const chrome = await launchChrome(CHROME);
  const { send, close } = await connectCDP(chrome.wsUrl);
  try {
    const { sessionId } = await openPage(send, 'about:blank');
    const asked = [];
    // A reader that drops "expanded" and says the rest as the browser does: the one line apart is the one it changed.
    const reader = { which: 'voiceover', said: async ({ want }) => { asked.push(want); return want.replace(', expanded', '').replace('not checked', 'unchecked'); } };
    const got = await hearComponents({ url: () => pathToFileURL(page).href, names: ['menu', 'absent'], reader, send, sessionId, settleMs: 0, rootOf: (n) => `#c-${n} .pg-preview` });
    const lines = got.components.menu.lines;
    assert.deepEqual(asked, ['button, Menu, expanded', 'checkbox, Remember me, not checked', 'link, Home']);
    assert.deepEqual(lines.map((l) => l.ok), [false, true, true]);
    assert.deepEqual(lines[0].missing, [{ part: 'state', want: 'expanded' }]);
    assert.deepEqual(got.failed, ['absent: its preview is not on the page']);
  } finally { close(); chrome.kill(); rmSync(dir, { recursive: true, force: true }); }
});

test('a reader that will not start says why, with the cause Guidepup gives under its own words', async () => {
  const { startFailure } = await import('../lib/screen-reader.mjs');
  assert.equal(startFailure(new Error('VoiceOver cannot be started', { cause: new Error('Failed to mount\nat x', { cause: new Error('hdiutil: attach failed') }) })), 'VoiceOver cannot be started: Failed to mount: hdiutil: attach failed');
  assert.equal(startFailure(new Error('NVDA is not installed\n\nPlease ensure you have run:')), 'NVDA is not installed', 'the first line only');
  assert.equal(startFailure(new Error('same', { cause: new Error('same') })), 'same', 'never said twice');
});

test('the CI check fails a run whose reader said nothing on every control, and passes one that spoke', async () => {
  const { heardProblems } = await import('./heard-check.mjs');
  const run = (said) => ({ reader: { name: 'NVDA', which: 'nvda' }, failed: [], components: { button: { lines: [{ desc: 'button', want: 'button, Save', said, ok: !!said }] } } });
  assert.match(heardProblems(run(''), 'nvda').join(' '), /said nothing on any control/);
  assert.deepEqual(heardProblems(run('Save button'), 'nvda'), []);
  assert.match(heardProblems({ reader: null, why: 'NVDA is not installed' }).join(' '), /no screen reader ran: NVDA is not installed/);
});

test('in a real browser: a reader that presses Tab itself reaches each control from the one before it', { skip: HAS_CHROME ? false : 'no Chrome available', timeout: budget(120000) }, async () => {
  const dir = makeFixture({});
  const page = join(dir, 'page.html');
  writeFileSync(page, `<!doctype html><html><body><button>Before</button><section id="c-pair"><div class="pg-preview">
    <button>One</button>
    <button>Two</button>
  </div></section></body></html>`);
  const chrome = await launchChrome(CHROME);
  const { send, close } = await connectCDP(chrome.wsUrl);
  try {
    const { sessionId } = await openPage(send, 'about:blank');
    const key = (type) => send('Input.dispatchKeyEvent', { type, key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }, sessionId);
    const focused = async () => (await send('Runtime.evaluate', { expression: 'document.activeElement.textContent.trim()', returnByValue: true }, sessionId)).result.value;
    let tabs = 0;
    // A reader whose speech is what has the focus after its own Tab, as Guidepup records it.
    const reader = { which: 'nvda', tab: async () => { tabs++; await key('keyDown'); await key('keyUp'); }, said: async () => `${await focused()} button` };
    const got = await hearComponents({ url: () => pathToFileURL(page).href, names: ['pair'], reader, send, sessionId, settleMs: 0, rootOf: (n) => `#c-${n} .pg-preview` });
    const lines = got.components.pair.lines;
    assert.equal(tabs, 2, 'one Tab a control');
    assert.deepEqual(lines.map((l) => [l.want, l.said, l.ok, !!l.skipped]), [['button, One', 'One button', true, false], ['button, Two', 'Two button', true, false]]);
  } finally { close(); chrome.kill(); rmSync(dir, { recursive: true, force: true }); }
});

test('a field\'s name and value count when the reader says them apart, as NVDA does', () => {
  assert.ok(compareSaid('edit text, Name, Ada', 'Name, edit, selected Ada', 'nvda').ok);
  assert.equal(compareSaid('edit text, Name, Ada', 'Name, edit', 'nvda').ok, false, 'the value left out is still a finding');
});

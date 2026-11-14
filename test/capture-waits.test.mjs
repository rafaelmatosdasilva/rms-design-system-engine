// The Figma checks that wait on a fresh read of Figma (capture-waits.mjs): a check that finds nothing because the
// capture predates it is said, on the Rules page and in the summary, never left to read as a clean library.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { budget, tempDir } from './helpers.mjs';
import { captureWaits, waitLine, KEEPS } from '../lib/capture-waits.mjs';
import { grammarOf, grammarLines } from '../lib/construction-grammar.mjs';
import { componentFiles } from '../lib/figma-capture.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const HARBOR = join(ENGINE, 'test', 'fixtures', 'harbor-ds');
const comp = (more = {}) => ({ trees: [{ c: [] }], variants: [['x', 0]], ...more });

test('what a capture does not keep, its checks wait on', () => {
  // An old capture: no bindings, no looks, nothing that says what it keeps.
  const old = captureWaits({ a: comp(), b: comp() });
  assert.deepEqual(old.map((w) => w.field), ['binds', 'looks', 'exposed', 'notes', 'boxes']);
  assert.ok(old[0].rules.includes('family-padding') && old[1].rules.includes('opacity-bound'));
  // One that kept bindings before _keeps was written: those checks run.
  assert.deepEqual(captureWaits({ a: comp({ binds: { x: {} } }) }).map((w) => w.field), ['looks', 'exposed', 'notes', 'boxes']);
  // A capture that says what it keeps is taken at its word.
  assert.deepEqual(captureWaits({ _keeps: KEEPS, a: comp() }), []);
  // No skeleton at all is no capture to wait on.
  assert.deepEqual(captureWaits({}), []);
  assert.match(waitLine(old), /^17 Figma checks wait on a fresh read of Figma, which the last capture predates \(what each layer binds; .*\): ask "\/rms-design-system-engine refresh the Figma data"\.$/);
  assert.equal(waitLine([]), null);
});

test('in the grammar and its summary', () => {
  const g = grammarOf({ skeleton: { a: comp(), b: comp(), c: comp() } });
  assert.equal(g.figma.waiting.length, 5);
  assert.equal(grammarOf({ skeleton: { _keeps: KEEPS, a: comp() } }).figma.waiting, undefined);
});

test('the summary of the rules says it, last', () => {
  const lines = grammarLines({ figma: { components: 3, rules: [{ says: 'x', status: 'rule', follows: 3, of: 3, toFix: [] }], waiting: captureWaits({ a: comp() }) } });
  assert.match(lines.at(-1), /wait on a fresh read of Figma/);
});

test('in Chrome: the Rules page says which checks wait, with the request to copy', { timeout: budget(300000) }, async (t) => {
  const dir = tempDir('sg-capture-waits-');
  cpSync(HARBOR, dir, { recursive: true });
  const cfg = JSON.parse(readFileSync(join(dir, 'ds-config.json'), 'utf8'));
  // A skeleton from before the bindings were kept: three components, no bindings, nothing said of what it keeps.
  const skel = join(dir, componentFiles(cfg).skeleton);
  mkdirSync(dirname(skel), { recursive: true });
  writeFileSync(skel, JSON.stringify({ _updated: '2026-11-01T00:00:00.000Z', button: comp(), badge: comp(), iconButton: comp() }));
  const r = spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--styleguide', '--no-a11y-bake'], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const page = join(dir, '.design-system-engine-out', 'styleguide', 'index.html');
  const { findChrome, launchChrome, connectCDP, openPage, waitForTrue, FILE_PAGE_LOADED } = await import('../lib/cdp.mjs');
  const chromePath = findChrome({ playwright: true });
  if (!chromePath || typeof WebSocket === 'undefined') { t.skip('no Chrome'); return; }
  const c = await launchChrome(chromePath);
  try {
    const { send, on, close } = await connectCDP(c.wsUrl);
    const errors = []; on('Runtime.exceptionThrown', (p) => errors.push(p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text));
    const { sessionId } = await openPage(send, `file://${page}#rules`);
    await waitForTrue(send, sessionId, FILE_PAGE_LOADED);
    const run = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true }, sessionId)).result.value;
    assert.equal(await waitForTrue(send, sessionId, `!!document.querySelector('#rules .sg-cx-wait')`, { attempts: 200 }), true, 'the note is on the Rules page');
    const note = await run(`(() => { const n = document.querySelector('#rules .sg-cx-wait'); return { text: n.innerText.replace(/\\s+/g, ' ').trim(), before: n.nextElementSibling && n.nextElementSibling.querySelector('.sg-cx-table') !== null, copy: n.querySelector('[data-cx-copy]').getAttribute('data-cx-copy') }; })()`);
    assert.match(note.text, /^17 Figma checks wait on a fresh read of Figma The last capture predates what they read: what each layer binds;/);
    assert.equal(note.before, true, 'above the rules\' table');
    assert.equal(note.copy, '/rms-design-system-engine refresh the Figma data');
    assert.deepEqual(errors, []);
    close();
  } finally { c.kill(); }
});

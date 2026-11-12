// The criteria that only apply where something plays (WCAG 1.2.1 to 1.2.5 and 1.4.2): nothing the engine tested had
// video or sound, so the whole branch had never run - neither the checks that find a missing captions track or sound
// that starts by itself, nor what the style guide says for the criteria a person judges once a component does play
// something. A fixture that plays something runs it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { readFileSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeFixture, budget } from './helpers.mjs';
import { WCAG22, WCAG_PAGE_SOURCE, WCAG_KIND } from '../lib/wcag21.mjs';
import { A11Y_GUIDE, severityOf } from '../lib/a11y-check.mjs';
import { findChrome, launchChrome, connectCDP, openPage, waitForTrue, FILE_PAGE_LOADED } from '../lib/cdp.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const CHROME = findChrome({ playwright: true });
const HAS_CHROME = !!CHROME && typeof WebSocket === 'function';
const FIXTURE = join(ENGINE, 'test', 'fixtures', 'wcag21', 'media.html');

test('catalogue: the media criteria say what a person checks, and the two a check finds name their findings', () => {
  const media = WCAG22.filter((c) => c.how === 'media');
  assert.deepEqual(media.map((c) => c.sc), ['1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.2.5', '1.4.2']);
  for (const c of media) {
    // One a check finds names the finding that fails it; one a person judges says what to look at, in steps, so the
    // row a component that plays something shows has something to do on it.
    if (c.kinds) for (const k of c.kinds) { assert.equal(WCAG_KIND[k], c.sc, k); assert.ok(A11Y_GUIDE[k]?.fix, k); }
    else { assert.ok(c.person, `${c.sc} says what a person checks`); assert.ok((c.steps ?? []).length, `${c.sc} says the steps`); }
  }
  // The two the browser finds are blockers: a video with no captions, sound nobody asked for.
  assert.equal(severityOf('captions'), 'blocker');
  assert.equal(severityOf('autoaudio'), 'blocker');
});

test('a page that plays something: the media checks run on it, and find only what is wrong', { skip: HAS_CHROME ? false : 'no Chrome available', timeout: budget(120000) }, async () => {
  const chrome = await launchChrome(CHROME);
  const { send, close } = await connectCDP(chrome.wsUrl);
  try {
    const { sessionId } = await openPage(send, pathToFileURL(FIXTURE).href);
    await waitForTrue(send, sessionId, FILE_PAGE_LOADED, { attempts: 200 });
    const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }, sessionId); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result?.value; };
    await ev(WCAG_PAGE_SOURCE + '; true');
    const r = await ev(`(() => { const a = window.__wcag21.check(document.getElementById('main'), { name: 'main' }); return { ran: a.ran, found: a.findings.filter((f) => f.kind === 'captions' || f.kind === 'autoaudio').map((f) => f.kind + ' ' + f.sc + ' ' + f.desc) }; })()`);
    // The branch ran at all: this is what no fixture reached before.
    assert.ok(r.ran.includes('media'), `the media checks ran: ${JSON.stringify(r.ran)}`);
    // One video has no captions track, the other has one; sound starts by itself in one player, not in the other.
    assert.equal(r.found.filter((d) => d.startsWith('captions')).length, 1, JSON.stringify(r.found));
    assert.match(r.found.find((d) => d.startsWith('captions')), /captions 1\.2\.2 .*no captions track/);
    assert.equal(r.found.filter((d) => d.startsWith('autoaudio')).length, 1, JSON.stringify(r.found));
    assert.match(r.found.find((d) => d.startsWith('autoaudio')), /autoaudio 1\.4\.2 .*plays sound by itself/);
    // A component that plays nothing never runs these checks, which is why the branch stayed unreached.
    const none = await ev(`(() => { const d = document.createElement('div'); d.innerHTML = '<p>Words only.</p>'; document.body.appendChild(d); const a = window.__wcag21.check(d, { name: 'x' }); d.remove(); return a.ran; })()`);
    assert.ok(!none.includes('media'), JSON.stringify(none));
  } finally { close(); chrome.kill(); }
});

test('the whole run on a page that plays something: both findings reported with their criterion', { skip: HAS_CHROME ? false : 'no Chrome available', timeout: budget(300000) }, () => {
  const dir = makeFixture({ 'media.html': readFileSync(FIXTURE, 'utf8') });
  try {
    let out = '';
    try { out = execFileSync(process.execPath, [join(ENGINE, 'lib', 'a11y-check.mjs'), '--url', pathToFileURL(join(dir, 'media.html')).href, '--json', '--no-axe', '--no-states'], { cwd: dir, encoding: 'utf8', timeout: budget(280000), env: { ...process.env, CHROME_PATH: CHROME } }); } catch (e) { out = String(e.stdout ?? ''); }
    const d = JSON.parse(out.slice(out.indexOf('{')));
    assert.ok((d.ran ?? []).includes('media'), `the media checks ran: ${JSON.stringify(d.ran)}`);
    const of = (k) => (d.issues ?? []).filter((i) => i.issue === k);
    assert.equal(of('captions').length, 1, JSON.stringify((d.issues ?? []).map((i) => i.issue)));
    assert.equal(of('captions')[0].wcag, '1.2.2');
    assert.equal(of('captions')[0].severity, 'blocker');
    assert.match(of('captions')[0].fix, /track kind="captions"/);
    assert.equal(of('autoaudio').length, 1);
    assert.equal(of('autoaudio')[0].wcag, '1.4.2');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

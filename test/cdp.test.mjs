// cdp.mjs — the shared headless-Chrome plumbing. Pins the browser lookup order (so adopting the
// module changes no gate's behaviour) and, when a browser is available, that a page opens, loads
// and evaluates end to end.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { budget, tempDir } from './helpers.mjs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { findChrome, playwrightChromium, launchChrome, connectCDP, openPage, waitForTrue, FILE_PAGE_LOADED } from '../cdp.mjs';

const none = () => null;

test('findChrome: CHROME_PATH wins, then PATH binaries; Playwright only when opted in', () => {
  const exists = (p) => p === '/x/chrome' || p === '/pw/chromium-1200/chrome-linux/chrome';
  assert.equal(findChrome({ env: { CHROME_PATH: '/x/chrome' }, exists, which: none }), '/x/chrome');
  assert.equal(findChrome({ env: {}, exists: () => false, which: (n) => (n === 'chromium' ? '/usr/bin/chromium' : null) }), '/usr/bin/chromium');
  // A Playwright install is ignored by default, so no gate starts running where it skipped before.
  const env = { PLAYWRIGHT_BROWSERS_PATH: '/pw' };
  assert.equal(findChrome({ env, exists, which: none }), null);
});

test('findChrome: DESIGN_SYSTEM_ENGINE_CHROME=none finds none, even a Mac\'s Chrome in /Applications', () => {
  const mac = (p) => p === '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  assert.equal(findChrome({ env: {}, exists: mac, which: none }), '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', 'found without the PATH');
  assert.equal(findChrome({ env: { DESIGN_SYSTEM_ENGINE_CHROME: 'none' }, exists: mac, which: () => '/usr/bin/chromium', playwright: true }), null);
});

test('playwrightChromium: picks the newest chromium-N build that has a binary', () => {
  const list = () => ['chromium-1100', 'chromium_headless_shell-1200', 'chromium-1200', 'ffmpeg-1'];
  const exists = (p) => p.endsWith('chrome-linux/chrome');
  assert.equal(playwrightChromium({ env: { PLAYWRIGHT_BROWSERS_PATH: '/pw' }, exists, list }), '/pw/chromium-1200/chrome-linux/chrome');
  assert.equal(playwrightChromium({ env: {}, exists: () => false, list: () => { throw new Error('none'); } }), null);
});

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const CHROME = findChrome({ playwright: true });
test('launch, open a file:// page, wait for load and evaluate', { skip: !CHROME || typeof WebSocket === 'undefined' ? 'no Chrome available' : false }, async () => {
  const dir = tempDir('cdp-test-');
  const page = join(dir, 'p.html');
  writeFileSync(page, '<!doctype html><style>:root{--gap-s:8px}</style><div id="x" style="padding:var(--gap-s)"></div>');
  const browser = await launchChrome(CHROME, { tmpPrefix: 'cdp-test-' });
  try {
    const { send, close } = await connectCDP(browser.wsUrl);
    const { targetId, sessionId } = await openPage(send, pathToFileURL(page).href);
    assert.equal(await waitForTrue(send, sessionId, FILE_PAGE_LOADED), true);
    const r = await send('Runtime.evaluate', { expression: 'getComputedStyle(document.getElementById("x")).paddingTop', returnByValue: true }, sessionId);
    assert.equal(r.result.value, '8px');
    await assert.rejects(() => send('No.suchMethod'), /No\.suchMethod/);
    await send('Target.closeTarget', { targetId });
    close();
    // A call on a closed socket fails at once, never waits out its timeout (a huge answer closes the socket).
    await new Promise((r) => setTimeout(r, 200));
    const t0 = Date.now();
    await assert.rejects(() => send('Runtime.evaluate', { expression: '1' }, sessionId), /connection closed/);
    assert.ok(Date.now() - t0 < 1000);
  } finally { browser.kill(); }
});

// A browser that outlives its run is how a machine comes to look like a failing engine: after a day of runs there
// were forty headless Chromes holding three gigabytes, and every later run read as slow for it. Two halves: the run
// A browser that outlives its run is how a machine comes to look like a failing engine: after a day of runs there
// were forty headless Chromes holding three gigabytes, and every later run read as slow for it. Two halves: the run
// must be able to end while a browser is open, and the browser must not survive the run that opened it.
//
// Watched by the one process this test started, never by counting the machine's browsers: the suite runs many files
// at once, each with browsers of its own, and a global count would read theirs as this one's leak. A test that
// asserts on what it does not control is the very fault this one exists to catch.
test('a browser never outlives the run that opened it, and never holds it open', { skip: CHROME ? false : 'no Chrome available', timeout: budget(120000) }, async () => {
  const { execFileSync } = await import('node:child_process');
  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

  const began = Date.now();
  // A run that opens a browser and ends without closing it: the forgetful caller this guards against. It prints the
  // browser's own process id, which is what this test then follows.
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { launchChrome } from ${JSON.stringify(pathToFileURL(join(ENGINE, 'cdp.mjs')).href)};
    const r = await launchChrome(${JSON.stringify(CHROME)});
    if (!r.wsUrl.startsWith('ws://')) throw new Error('no socket');
    console.log(r.chrome.pid);
  `], { encoding: 'utf8', timeout: 90000 });
  const took = Date.now() - began;
  const pid = Number(String(out).trim().split('\n').pop());
  assert.ok(Number.isInteger(pid) && pid > 0, `no browser process id printed: ${out}`);

  // It ended on its own: before this, a child with a pipe kept Node's loop alive and the run waited for a browser
  // nobody was using. Generous, because the launch itself is a real Chrome start.
  assert.ok(took < 60000, `the run took ${Math.round(took / 1000)}s to end while a browser was open`);

  // And it took that browser with it. Given time, and scaled: the kill is sent as the run exits, and a browser on a
  // machine running the rest of the suite takes longer to go than one on a quiet machine. Five fixed seconds was
  // enough alone and not under a full run — the same wrong assumption this suite keeps being taught out of.
  const gone = Date.now() + budget(15000);
  while (alive(pid) && Date.now() < gone) await new Promise((r) => setTimeout(r, 100));
  assert.equal(alive(pid), false, `the browser this run opened (pid ${pid}) outlived it`);
});

// Chrome writes its profile until it has shut down, so a profile deleted at once was written again: a folder left per
// browser, and the folder Chrome keeps its socket in, until a disk filled with them.
test('a browser killed leaves neither its profile nor its socket folder behind', { skip: !CHROME || typeof WebSocket === 'undefined' ? 'no Chrome available' : false, timeout: budget(60000) }, async () => {
  const { readlinkSync, existsSync } = await import('node:fs');
  const browser = await launchChrome(CHROME, { tmpPrefix: 'cdp-kill-' });
  const socketDir = dirname(readlinkSync(join(browser.userDataDir, 'SingletonSocket')));
  browser.kill();
  await new Promise((r) => setTimeout(r, 1000));
  assert.equal(existsSync(browser.userDataDir), false, 'the profile was left behind');
  assert.equal(existsSync(socketDir), false, 'the socket folder was left behind');
});

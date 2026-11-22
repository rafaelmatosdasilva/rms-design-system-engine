// The same measurements in Firefox and WebKit, and only what differs from Chrome said. The drivers need nothing
// installed but the browser: Firefox through WebDriver BiDi over Node's own WebSocket, Safari through the WebDriver
// macOS ships, over plain HTTP.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { writeFileSync, rmSync, mkdirSync, readFileSync } from 'node:fs';
import { tempDir } from './helpers.mjs';
import { join, dirname } from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { measureExpr, crossBrowsers, differences, untried, schemeNeeds, crossPass } from '../lib/cross-browser.mjs';
import { fromRemote, userJs, launchFirefox } from '../lib/bidi.mjs';
import { launchSafari, webdriverSession, webdriverPage, whySafariRefused, automationSafaris } from '../lib/webdriver.mjs';
import { openBrowser } from '../lib/page-driver.mjs';
import { findFirefox } from '../lib/browsers.mjs';
import { findChrome } from '../lib/cdp.mjs';

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), '..');

test('only what differs from Chrome is said, set beside what Chrome draws', () => {
  const asserts = [
    { plugin: 'app', selector: '.toolbar', prop: 'height' },
    { plugin: 'app', selector: '.btn', prop: 'paddingLeft' },
    { plugin: 'app', selector: '.chip', prop: 'color' },
    { plugin: 'app', selector: '.gone', prop: 'height' },
  ];
  const lines = differences({ asserts, chrome: ['56px', '6px', 'rgb(0, 0, 0)', '(selector not found)'], other: ['56px', '4px', 'rgb(0, 0, 0)', '(selector not found)'], label: 'Firefox' });
  assert.deepEqual(lines, ['in Firefox, app .btn → paddingLeft is 4px (Chrome draws 6px)']);
  // A colour is compared by its value, as the contract is.
  assert.deepEqual(differences({ asserts: [asserts[2]], chrome: ['rgb(173, 173, 173)'], other: ['rgb(173, 173, 173)'] }), []);
});

test('Firefox whenever it is here, WebKit only when the project asks, since Safari opens a window', () => {
  const found = { chrome: 'c', firefox: '/ff', webkit: '/usr/bin/safaridriver' };
  assert.deepEqual(crossBrowsers(found, {}).map((b) => b.name), ['firefox']);
  assert.deepEqual(crossBrowsers(found, { rendered: { browsers: ['firefox', 'webkit'] } }).map((b) => b.name), ['firefox', 'webkit']);
  assert.deepEqual(crossBrowsers(found, { rendered: { browsers: [] } }), [], 'an empty list turns the pass off');
  assert.deepEqual(crossBrowsers({ chrome: 'c', firefox: null, webkit: null }, { rendered: { browsers: ['webkit'] } }), [], 'one not here is not tried');
});

test('what a scheme asks of a browser beyond JavaScript, and what is left untried', () => {
  assert.deepEqual(schemeNeeds({ media: [{ name: 'prefers-color-scheme', value: 'dark' }, { name: 'prefers-contrast', value: 'no-preference' }] }), { color: 'dark', chromeOnly: null, viewport: null });
  assert.equal(schemeNeeds({ media: [{ name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-contrast', value: 'more' }] }).chromeOnly, 'prefers-contrast: more');
  assert.equal(schemeNeeds({ media: [], viewport: 600 }).viewport, 600);
  assert.match(untried([{}, {}], 'dark', 'WebKit')[0], /^in WebKit, 2 values in the dark scheme not tried: Safari draws in the Mac's own appearance/);
  assert.deepEqual(untried([], 'dark'), []);
});

test('the pass opens one browser a scheme, measures each group and closes everything', async () => {
  const opened = [], closed = [];
  const drawn = { light: { '.a': '10px', '.b': 'rgb(0, 0, 0)' }, dark: { '.b': 'rgb(255, 255, 255)' } };
  const open = async (name, path, { scheme }) => {
    opened.push(scheme);
    return {
      label: 'Firefox', scheme,
      page: async () => ({
        evaluate: async (expr) => { const m = expr.match(/const asserts = (\[.*?\]);/s); return m ? JSON.parse(m[1]).map((a) => (a.selector === '.a' ? '12px' : drawn[scheme][a.selector])) : null; },
        close: async () => {},
      }),
      close: async () => { closed.push(scheme); },
    };
  };
  const asserts = [{ plugin: 'app', selector: '.a', prop: 'height' }, { plugin: 'app', selector: '.b', prop: 'color' }, { plugin: 'app', selector: '.b', prop: 'color', colorScheme: 'dark' }];
  const r = await crossPass({
    byPlugin: { app: asserts }, chromeGot: { app: ['10px', 'rgb(0, 0, 0)', 'rgb(255, 255, 255)'] },
    urlOf: () => 'file:///x', browsers: [{ name: 'firefox', path: '/ff' }], open,
    switchOf: (a) => ({ media: [{ name: 'prefers-color-scheme', value: a.colorScheme ?? 'light' }] }),
  });
  assert.deepEqual(r.lines, ['in Firefox, app .a → height is 12px (Chrome draws 10px)']);
  assert.deepEqual(r.tried, ['Firefox']);
  assert.deepEqual(opened, ['light', 'dark']);
  assert.deepEqual(closed.sort(), ['dark', 'light']);
  // A browser that cannot be reached is said and passed over, never the gate's failure.
  const bad = await crossPass({ byPlugin: { app: asserts }, chromeGot: { app: [] }, urlOf: () => 'x', switchOf: () => ({ media: [] }), browsers: [{ name: 'webkit', path: '/sd' }], open: async () => { throw new Error('Safari\'s remote automation is off'); } });
  assert.deepEqual(bad.lines, []);
  assert.match(bad.refused[0], /^WebKit: Safari's remote automation is off/);
});

// Found on a test run: Firefox opened its WebDriver BiDi port and never answered session.new. The error was thrown,
// but Firefox and its socket were left open, and the run waited on them for five hours. Here a stand-in Firefox does
// the same: it says where it listens, takes the connection and answers nothing.
test('a Firefox that never answers is given up on and closed, leaving nothing running', { skip: process.platform === 'win32' ? 'the stand-in is a shell script' : false, timeout: 120000 }, async () => {
  const { createHash } = await import('node:crypto');
  const server = createServer();
  const sockets = [], closing = [];
  server.on('upgrade', (req, sock) => {
    sockets.push(sock);
    const accept = createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    // A frame whose opcode is 8 is the client closing the connection.
    sock.on('data', (d) => { if ((d[0] & 0x0f) === 8) closing.push(sock); });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const dir = tempDir('ff-silent-'), pidFile = join(dir, 'pid'), ff = join(dir, 'firefox');
  writeFileSync(ff, `#!/bin/sh\necho $$ > "${pidFile}"\necho "WebDriver BiDi listening on ws://127.0.0.1:${server.address().port}" >&2\nexec sleep 600\n`, { mode: 0o755 });
  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  try {
    await assert.rejects(openBrowser('firefox', ff), /session\.new: no answer/);
    const pid = Number(readFileSync(pidFile, 'utf8'));
    for (let i = 0; i < 40 && alive(pid); i++) await new Promise((r) => setTimeout(r, 50));
    assert.equal(alive(pid), false, 'the stand-in Firefox was stopped');
    for (let i = 0; i < 40 && closing.length < sockets.length; i++) await new Promise((r) => setTimeout(r, 50));
    assert.ok(sockets.length && closing.length === sockets.length, 'its socket was closed');
  } finally { for (const s of sockets) s.destroy(); server.close(); }
});

test('one measuring script for every browser: plain JavaScript, no protocol of its own', () => {
  const expr = measureExpr([{ selector: '.x', prop: 'height', probe: '<i class="x"></i>' }]);
  assert.doesNotMatch(expr, /Runtime\.|Emulation\.|browsingContext|send\(/);
  assert.match(expr, /getComputedStyle\(el, a\.pseudo\)\[a\.prop\]/);
  // Chrome's own pass runs the same script.
  assert.match(readFileSync(join(ENGINE, 'lib', 'rendered-check.mjs'), 'utf8'), /measureExpr\(group\.map\(\(x\) => x\.a\)\)/);
});

test('BiDi values come back as plain JSON, and Firefox starts with nothing it did not ask for', () => {
  assert.deepEqual(fromRemote({ type: 'array', value: [{ type: 'string', value: '8px' }, { type: 'number', value: 768 }, { type: 'null' }] }), ['8px', 768, null]);
  assert.deepEqual(fromRemote({ type: 'object', value: [['a', { type: 'boolean', value: true }]] }), { a: true });
  const js = userJs();
  assert.match(js, /user_pref\("app\.update\.disabledForTesting", true\);/);
  assert.match(js, /user_pref\("datareporting\.policy\.dataSubmissionEnabled", false\);/);
});

// A stand-in safaridriver: the W3C WebDriver endpoints the driver uses, answered as Safari answers them.
async function fakeSafari({ refuse = null } = {}) {
  const calls = [];
  let inner = [1280 - 0, 800 - 0];
  const server = createServer(async (req, res) => {
    let body = ''; for await (const c of req) body += c;
    const j = body ? JSON.parse(body) : null;
    calls.push([req.method, req.url, j]);
    const send = (code, value) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ value })); };
    if (req.url === '/status') return send(200, { ready: true });
    if (req.method === 'POST' && req.url === '/session') return refuse ? send(500, { error: 'session not created', message: refuse }) : send(200, { sessionId: 's1', capabilities: {} });
    if (req.url.endsWith('/window/rect')) { inner = [j.width - 16, j.height - 80]; return send(200, { width: j.width, height: j.height }); }
    if (req.url.endsWith('/execute/sync')) return send(200, inner);
    if (req.url.endsWith('/execute/async')) return send(200, /readyState/.test(j.script) ? true : ['8px']);
    return send(200, null);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { base: `http://127.0.0.1:${server.address().port}`, calls, close: () => new Promise((r) => server.close(r)) };
}

test('Safari through its WebDriver: a session, the page drawn at the width asked for, a script, closed', async () => {
  const fake = await fakeSafari();
  try {
    const session = await webdriverSession(fake.base);
    const page = await webdriverPage(session, 'file:///x.html', { width: 768, height: 600 });
    assert.deepEqual(await page.evaluate('[1]'), ['8px']);
    await page.close();
    // The window is grown by what its frame takes, so the page itself is 768 wide.
    const rects = fake.calls.filter(([, u]) => u.endsWith('/window/rect')).map(([, , b]) => b.width);
    assert.deepEqual(rects, [768, 784]);
    assert.ok(fake.calls.some(([m, u]) => m === 'POST' && u === '/session/s1/url'));
    assert.ok(fake.calls.some(([m, u]) => m === 'DELETE' && u === '/session/s1'));
  } finally { await fake.close(); }
  // Turned off, it says what the person does about it.
  const off = await fakeSafari({ refuse: 'You must enable \'Allow Remote Automation\' in the Develop menu of Safari' });
  try { await assert.rejects(webdriverSession(off.base), /safaridriver --enable/); } finally { await off.close(); }
  assert.match(whySafariRefused('Could not create a session: The Safari instance is already paired with another WebDriver session.'), /already being driven/);
});

test('safaridriver is waited for until it answers, and given up on with a reason', { skip: process.platform === 'win32' ? 'Safari and its safaridriver are macOS only' : false }, async () => {
  const fake = await fakeSafari();
  try {
    const sh = join(tempDir('fake-sd-'), 'safaridriver');
    writeFileSync(sh, '#!/bin/sh\nsleep 30\n', { mode: 0o755 });
    const port = Number(new URL(fake.base).port);
    const b = await launchSafari(sh, { port, timeoutMs: 3000 });
    assert.equal(b.base, fake.base);
    b.kill();
  } finally { await fake.close(); }
  const sh = join(tempDir('fake-sd-'), 'safaridriver');
  writeFileSync(sh, '#!/bin/sh\nsleep 30\n', { mode: 0o755 });
  await assert.rejects(launchSafari(sh, { timeoutMs: 600 }), /did not answer within/);
});

const FIREFOX = findFirefox();
const CHROME = findChrome();

test('in Firefox and Chrome alike: one page opened, measured in each scheme, and the difference said', { skip: !FIREFOX && 'Firefox not installed', timeout: 180000 }, async () => {
  const dir = tempDir('cross-browser-');
  try {
    mkdirSync(join(dir, 'app'));
    // A rule only Firefox follows, so the two browsers draw it differently whatever their versions.
    writeFileSync(join(dir, 'app', 'ui.html'), '<!doctype html><html><head><style>.toolbar{height:56px;color:#111}@media (prefers-color-scheme: dark){.toolbar{color:#eee}}.x{width:10px}@supports (-moz-orient:inline){.x{width:12px}}</style></head><body><div class="toolbar">T</div><i class="x"></i></body></html>');
    const url = pathToFileURL(join(dir, 'app', 'ui.html')).href;
    for (const scheme of ['light', 'dark']) {
      const b = await openBrowser('firefox', FIREFOX, { scheme });
      try {
        const p = await b.page(url, { width: 768, height: 600 });
        assert.deepEqual(await p.evaluate('[innerWidth, getComputedStyle(document.querySelector(".toolbar")).color]'), [768, scheme === 'dark' ? 'rgb(238, 238, 238)' : 'rgb(17, 17, 17)']);
        await p.close();
      } finally { await b.close(); }
    }
    // The gate itself: Chrome holds the contract, Firefox is set beside it.
    if (!CHROME) return;
    writeFileSync(join(dir, 'ds-config.json'), JSON.stringify({ paths: { plugins: ['app'], pluginCSS: ['app/ui.src.html'] } }));
    writeFileSync(join(dir, 'structure-contract.mjs'), `export const RENDERED_ASSERTIONS = [
      { plugin: 'app', selector: '.toolbar', prop: 'height', expected: '56px' },
      { plugin: 'app', selector: '.toolbar', prop: 'color', expected: 'rgb(238, 238, 238)', colorScheme: 'dark' },
      { plugin: 'app', selector: '.x', prop: 'width', expected: '10px' },
    ];`);
    const r = spawnSync(process.execPath, [join(ENGINE, 'lib', 'rendered-check.mjs')], { cwd: dir, encoding: 'utf8', env: { ...process.env, CHROME_PATH: CHROME, FIREFOX_PATH: FIREFOX }, timeout: 170000 });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /✅ PASS {2}3\/3 rendered assertions/);
    assert.match(r.stdout, /⚠️ {2}BROWSERS 1 .*tried in Firefox/);
    assert.match(r.stdout, /in Firefox, app \.x → width is 12px \(Chrome draws 10px\)/);
    // Gone with nothing to compare.
    const off = spawnSync(process.execPath, [join(ENGINE, 'lib', 'rendered-check.mjs')], { cwd: dir, encoding: 'utf8', env: { ...process.env, CHROME_PATH: CHROME, DESIGN_SYSTEM_ENGINE_FIREFOX: 'none' }, timeout: 170000 });
    assert.doesNotMatch(off.stdout, /BROWSERS/);
    // Windows holds a page's files for a moment after the browser that opened them has ended.
  } finally { rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }); }
});

test('the Safari a session started is quit when it closes, and a person\'s own Safari is never touched', async () => {
  const ps = () => [
    '  101 /Applications/Safari.app/Contents/MacOS/Safari',
    '  202 /System/Volumes/Preboot/Cryptexes/App/System/Applications/Safari.app/Contents/MacOS/Safari -ApplePersistenceIgnoreStateQuietly YES --automation',
    '  303 /usr/bin/safaridriver -p 4444',
  ].join('\n');
  assert.deepEqual(automationSafaris({ ps }), [202], 'only the automation copy');
  // A stand-in for the Safari a session brings up: it has to be gone once the session closes.
  const stand = spawn('sleep', ['30'], { stdio: 'ignore' });
  const fake = await fakeSafari();
  let calls = 0;
  try {
    const session = await webdriverSession(fake.base, { safaris: () => (calls++ === 0 ? [] : [stand.pid]) });
    assert.deepEqual(session.safaris, [stand.pid]);
    const gone = new Promise((r) => stand.on('exit', () => r(true)));
    await session.close();
    assert.equal(await Promise.race([gone, new Promise((r) => setTimeout(() => r(false), 3000))]), true, 'the session\'s Safari is quit');
  } finally { try { stand.kill(); } catch {} await fake.close(); }
});

// Found on the suite's own runners: two runs that began in the same minute each waited 30s for Firefox and failed,
// while the runs before and after passed on the same code. A slow start is tried once more after a pause, as Chrome's
// is; a Firefox that cannot be started at all is not, since trying again only gives the same answer later.
test('a Firefox slow to start is given a second try, and one that cannot start is not', { skip: process.platform === 'win32' ? 'the stand-in is a shell script' : false, timeout: 60000 }, async () => {
  const dir = tempDir('ff-slow-'), ff = join(dir, 'firefox'), tries = join(dir, 'tries');
  writeFileSync(tries, '');
  // The first start says nothing; the second says where it listens.
  writeFileSync(ff, `#!/bin/sh\necho x >> "${tries}"\nif [ "$(wc -l < "${tries}")" -ge 2 ]; then echo "WebDriver BiDi listening on ws://127.0.0.1:9" >&2; fi\nexec sleep 30\n`, { mode: 0o755 });
  const b = await launchFirefox(ff, { timeoutMs: 1500, retryAfterMs: 50 });
  try {
    assert.equal(b.wsUrl, 'ws://127.0.0.1:9');
    assert.equal(readFileSync(tries, 'utf8').trim().split('\n').length, 2, 'tried twice');
  } finally { b.kill(); }
  writeFileSync(tries, '');
  writeFileSync(ff, `#!/bin/sh\necho x >> "${tries}"\nexec sleep 30\n`, { mode: 0o755 });
  await assert.rejects(launchFirefox(ff, { timeoutMs: 800, retryAfterMs: 50 }), /did not open WebDriver BiDi within/);
  assert.equal(readFileSync(tries, 'utf8').trim().split('\n').length, 2, 'two tries, then the answer');
  await assert.rejects(launchFirefox(join(dir, 'no-such-firefox'), { timeoutMs: 800, retryAfterMs: 50 }), /could not be started/);
});

// Playwright drives the browsers when it is here, the engine's own drivers when it is not, and the two give the same
// answers: a check one path has and the other lacks fails here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { tempDir } from './helpers.mjs';

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), '..');
import {
  PW_VERSION, PW_INTEGRITY, intact, pwCacheDir, findPlaywright, pwBrowsersRoot, revisionOf, pwBrowser, drivenBy,
  extractTgz, fetchPlaywright, playwrightHere, playwrightLine,
} from '../lib/playwright.mjs';
import { openBrowser } from '../lib/page-driver.mjs';
import { altTabIn, untriedIn, browserRows } from '../lib/a11y-browsers.mjs';
import { findChrome } from '../lib/cdp.mjs';
import { findFirefox } from '../lib/browsers.mjs';

// A tar entry as npm writes one: a 512-byte ustar header, then the body padded to 512.
function entry(name, body = '', { type = '0', mode = 0o644, prefix = '' } = {}) {
  const h = Buffer.alloc(512);
  h.write(name, 0, 100);
  h.write(mode.toString(8).padStart(7, '0') + '\0', 100);
  h.write('0000000\0', 108); h.write('0000000\0', 116);
  const data = Buffer.from(body);
  h.write(data.length.toString(8).padStart(11, '0') + '\0', 124);
  h.write('00000000000\0', 136);
  h.write('        ', 148);
  h.write(type, 156);
  h.write('ustar\0' + '00', 257);
  if (prefix) h.write(prefix, 345, 155);
  let sum = 0; for (const b of h) sum += b;
  h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
  return Buffer.concat([h, data, Buffer.alloc((512 - (data.length % 512)) % 512)]);
}
const tgz = (...entries) => gzipSync(Buffer.concat([...entries, Buffer.alloc(1024)]));

test('a package is unpacked whole, its long names and pax paths kept, and a path outside it refused', () => {
  const dir = tempDir('pw-tgz-');
  try {
    const pax = '30 path=package/lib/a-very-long.js\n';
    extractTgz(tgz(
      entry('package/package.json', '{"version":"1.0.0"}'),
      entry('cli.js', '#!/usr/bin/env node', { prefix: 'package', mode: 0o755 }),
      entry('PaxHeader', pax, { type: 'x' }),
      entry('package/lib/short.js', 'export default 1'),
    ), dir);
    assert.equal(readFileSync(join(dir, 'package.json'), 'utf8'), '{"version":"1.0.0"}', 'package/ is dropped, as npm does');
    assert.ok(existsSync(join(dir, 'cli.js')), 'the ustar prefix is read');
    assert.ok(existsSync(join(dir, 'lib', 'a-very-long.js')), 'a pax path names the file after it');
    assert.throws(() => extractTgz(tgz(entry('package/../../escape.js', 'x')), join(dir, 'in')), /outside the package/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('only the pinned package is kept: one that does not match its SHA-512 is never unpacked', async () => {
  const home = tempDir('pw-home-');
  try {
    assert.match(PW_INTEGRITY, /^sha512-/);
    assert.equal(intact(Buffer.from('not it')), false);
    assert.equal(await fetchPlaywright({ home, get: async () => tgz(entry('package/package.json', `{"version":"${PW_VERSION}"}`)) }), null);
    assert.equal(existsSync(pwCacheDir(home)), false, 'nothing is left in the cache');
    assert.equal(await fetchPlaywright({ home, get: async () => { throw new Error('offline'); } }), null, 'offline is no copy, not a failure');
  } finally { rmSync(home, { recursive: true, force: true }); }
});

// A stand-in Playwright: its package, its browsers' revisions, and where it keeps them.
function standInPlaywright(dir, version = PW_VERSION) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'playwright-core', version }));
  writeFileSync(join(dir, 'index.mjs'), 'export const chromium = {};');
  writeFileSync(join(dir, 'browsers.json'), JSON.stringify({ browsers: [
    { name: 'firefox', revision: '1572' },
    { name: 'webkit', revision: '2388', revisionOverrides: { mac14: '2251', 'mac14-arm64': '2251' } },
  ] }));
}

test('Playwright is found in the project first, then in the engine\'s cache, and never when it is turned off', () => {
  const root = tempDir('pw-root-'), home = tempDir('pw-home-');
  try {
    assert.equal(findPlaywright({ root, home, env: {} }), null, 'none here');
    // The engine's cache counts only once its copy is whole.
    standInPlaywright(pwCacheDir(home));
    assert.equal(findPlaywright({ root, home, env: {} }), null, 'half a download is never loaded');
    writeFileSync(join(pwCacheDir(home), '.engine-intact'), PW_INTEGRITY);
    assert.deepEqual(findPlaywright({ root, home, env: {} }), { dir: pwCacheDir(home), version: PW_VERSION, from: 'cache' });
    // The project's own wins, at its own version, found through playwright too.
    writeFileSync(join(root, 'package.json'), '{}');
    standInPlaywright(join(root, 'node_modules', 'playwright', 'node_modules', 'playwright-core'), '1.60.0');
    writeFileSync(join(root, 'node_modules', 'playwright', 'package.json'), '{"name":"playwright"}');
    const found = findPlaywright({ root, home, env: {} });
    assert.equal(found.from, 'project'); assert.equal(found.version, '1.60.0');
    assert.equal(findPlaywright({ root, home, env: { DESIGN_SYSTEM_ENGINE_PLAYWRIGHT: 'none' } }), null);
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(home, { recursive: true, force: true }); }
});

test('a browser is Playwright\'s only when its build for that Playwright is installed whole, on every system', () => {
  const dir = tempDir('pw-browsers-');
  try {
    standInPlaywright(join(dir, 'pw'));
    const found = { dir: join(dir, 'pw') };
    assert.equal(pwBrowsersRoot(found.dir, { env: {}, home: '/h', platform: 'linux' }), join('/h', '.cache', 'ms-playwright'));
    assert.equal(pwBrowsersRoot(found.dir, { env: {}, home: '/h', platform: 'darwin' }), join('/h', 'Library', 'Caches', 'ms-playwright'));
    assert.equal(pwBrowsersRoot(found.dir, { env: { LOCALAPPDATA: 'C:\\L' }, home: '/h', platform: 'win32' }), join('C:\\L', 'ms-playwright'));
    assert.equal(pwBrowsersRoot(found.dir, { env: { PLAYWRIGHT_BROWSERS_PATH: '0' } }), join(found.dir, '.local-browsers'));
    // macOS 14 takes another WebKit, by Playwright's own name for it.
    assert.equal(revisionOf(found.dir, 'webkit', { platform: 'darwin', osRelease: '23.6.0', cpu: 'arm64' }), '2251');
    assert.equal(revisionOf(found.dir, 'webkit', { platform: 'darwin', osRelease: '25.6.0', cpu: 'arm64' }), '2388');
    assert.equal(revisionOf(found.dir, 'webkit', { platform: 'linux' }), '2388');
    const opts = { env: { PLAYWRIGHT_BROWSERS_PATH: join(dir, 'ms') }, platform: 'linux' };
    mkdirSync(join(dir, 'ms', 'firefox-1572'), { recursive: true });
    assert.equal(pwBrowser('firefox', found, opts), null, 'a build still downloading is not one');
    writeFileSync(join(dir, 'ms', 'firefox-1572', 'INSTALLATION_COMPLETE'), '');
    assert.equal(pwBrowser('firefox', found, opts), join(dir, 'ms', 'firefox-1572'));
    mkdirSync(join(dir, 'ms', 'webkit-2000'), { recursive: true });
    writeFileSync(join(dir, 'ms', 'webkit-2000', 'INSTALLATION_COMPLETE'), '');
    assert.equal(pwBrowser('webkit', found, opts), null, 'another Playwright\'s build is not this one\'s');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('Option-Tab in WebKit, and Tab\'s criteria left untried in WebKit on Windows, never counted as passing there', () => {
  assert.equal(altTabIn('webkit'), true);
  assert.equal(altTabIn('firefox'), false);
  assert.deepEqual(untriedIn('webkit', 'win32'), ['2.1.1', '2.4.7']);
  assert.deepEqual(untriedIn('webkit', 'linux'), []);
  assert.deepEqual(untriedIn('firefox', 'win32'), []);
  const run = { browsers: [{ label: 'Chrome' }, { label: 'WebKit', altTab: true, untried: ['2.1.1', '2.4.7'] }],
    components: { chip: { Chrome: [], WebKit: [{ kind: 'target', sc: '2.5.8', desc: 'a.x' }] } } };
  const rows = browserRows(run, 'chip');
  assert.deepEqual(rows['2.1.1'].by, { Chrome: 'pass' }, 'untried in WebKit: Chrome alone answers it');
  assert.deepEqual(rows['2.4.7'].by, { Chrome: 'pass' });
  assert.deepEqual(rows['2.5.8'].by, { Chrome: 'pass', WebKit: 'fail' }, 'the rest are tried there as anywhere');
});

test('which driver opens each browser: Playwright for what it has, the engine\'s own for the rest', () => {
  assert.equal(drivenBy('chrome', { here: null, env: {} }), 'engine');
  const here = { dir: '/pw', version: PW_VERSION, from: 'cache', firefox: '/ms/firefox-1', webkit: null };
  assert.equal(drivenBy('chrome', { here, env: {} }), 'playwright', 'Chrome is the one on the computer, opened by Playwright');
  assert.equal(drivenBy('firefox', { here, env: {} }), 'playwright');
  assert.equal(drivenBy('webkit', { here, env: {} }), 'engine', 'no WebKit build: Safari\'s own WebDriver');
  assert.equal(drivenBy('firefox', { here, env: { FIREFOX_PATH: '/ff' } }), 'engine', 'a Firefox named by its setting is that one');
  assert.equal(drivenBy('firefox', { here, env: { FIREFOX_PATH: '/ms/firefox-1' } }), 'playwright', 'its own build, named, is still its own');
  assert.equal(drivenBy('firefox', { here, env: {}, path: '/tmp/stand-in/firefox' }), 'engine', 'a Firefox handed over is the one opened');
  assert.equal(drivenBy('firefox', { here, env: {}, path: '/ms/firefox-1' }), 'playwright', 'Playwright\'s own Firefox, handed over, is its own');
  assert.equal(drivenBy('webkit', { here: { ...here, webkit: '/ms/webkit-1' }, env: {}, path: '/usr/bin/safaridriver' }), 'engine', 'Safari\'s WebDriver handed over is Safari');
  assert.equal(drivenBy('chrome', { here, env: {}, path: '/any/chrome' }), 'playwright', 'Chrome\'s path is handed to Playwright itself');
  assert.match(playwrightLine(here), /drives Chrome, Firefox, and the engine's own drivers open WebKit/);
  assert.match(playwrightLine(null), /engine's own drivers open every browser/);
});

// The two paths, held to one answer: the same page measured through each, in each scheme and at two widths, with the
// focus moved by a real key press. A value one path gives and the other does not fails here.
const HERE = playwrightHere();
const CHROME = findChrome();
// Playwright left out by `here`, never by a copy of the environment: Windows reads process.env without regard to case and
// a copy with it, so a copy missed the Program Files folder Git Bash names in capitals.
const FIREFOX_OWN = findFirefox({ here: null });
const PAGE = '<!doctype html><style>.t{height:56px;padding:4px 6px;color:#111;font:16px/1.5 serif}@media (prefers-color-scheme: dark){.t{color:#eee}}@media (max-width:400px){.t{height:40px}}</style><div class="t">T</div><button>a</button><input>';
const MEASURE = '(() => { const s = getComputedStyle(document.querySelector(".t")); return [innerWidth, s.height, s.paddingLeft, s.color, matchMedia("(prefers-color-scheme: dark)").matches]; })()';

async function measured(name, path, driver, url) {
  const out = [];
  for (const scheme of ['light', 'dark']) {
    const b = await openBrowser(name, path, { scheme, driver });
    try {
      assert.equal(b.driver, driver);
      const p = await b.page(url, { width: 768, height: 600 });
      assert.deepEqual(Object.keys(p).sort(), ['close', 'evaluate', 'press', 'setViewport', 'shot'], 'one page API on both paths');
      out.push(await p.evaluate(MEASURE));
      await p.setViewport(360, 600);
      out.push(await p.evaluate(MEASURE));
      await p.press('Tab');
      out.push(await p.evaluate('document.activeElement && document.activeElement.tagName'));
      out.push(await p.evaluate('undefined'), await p.evaluate('Promise.resolve(7)'));
      await assert.rejects(p.evaluate('(() => { throw new Error("in the page") })()'), /in the page/);
      await p.close();
    } finally { await b.close(); }
  }
  return out;
}

test('Chrome through Playwright and through the engine\'s own driver: the same answers', { skip: (!HERE && 'Playwright not here') || (!CHROME && 'Chrome not found'), timeout: 180000 }, async () => {
  const dir = tempDir('pw-both-');
  try {
    writeFileSync(join(dir, 'p.html'), PAGE);
    const url = pathToFileURL(join(dir, 'p.html')).href;
    const pw = await measured('chrome', CHROME, 'playwright', url);
    assert.deepEqual(pw.slice(0, 2), [[768, '56px', '6px', 'rgb(17, 17, 17)', false], [360, '40px', '6px', 'rgb(17, 17, 17)', false]]);
    assert.deepEqual(pw, await measured('chrome', CHROME, 'engine', url));
  } finally { rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }); }
});

test('Firefox through Playwright and through the engine\'s own driver: the same answers', { skip: (!HERE?.firefox && 'Playwright\'s Firefox not here') || (!FIREFOX_OWN && 'no Firefox of its own for the engine\'s driver'), timeout: 180000 }, async () => {
  const dir = tempDir('pw-both-');
  try {
    writeFileSync(join(dir, 'p.html'), PAGE);
    const url = pathToFileURL(join(dir, 'p.html')).href;
    assert.deepEqual(await measured('firefox', HERE.firefox, 'playwright', url), await measured('firefox', FIREFOX_OWN, 'engine', url));
  } finally { rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }); }
});

test('WebKit through Playwright, headless on any system: every scheme set, and Tab reaching what Safari\'s reaches', { skip: !HERE?.webkit && 'Playwright\'s WebKit not here', timeout: 180000 }, async () => {
  const dir = tempDir('pw-webkit-');
  try {
    writeFileSync(join(dir, 'p.html'), '<!doctype html><style>.t{color:#111}@media (prefers-color-scheme: dark){.t{color:#eee}}</style><p class="t">T</p><button>a</button><a href="#x">b</a>');
    const url = pathToFileURL(join(dir, 'p.html')).href;
    for (const [scheme, color] of [['light', 'rgb(17, 17, 17)'], ['dark', 'rgb(238, 238, 238)']]) {
      const b = await openBrowser('webkit', HERE.webkit, { scheme, driver: 'playwright' });
      try {
        assert.equal(b.scheme, scheme, 'not the Mac\'s appearance: the scheme asked');
        const p = await b.page(url);
        assert.equal(await p.evaluate('getComputedStyle(document.querySelector(".t")).color'), color);
        const seen = [];
        for (let i = 0; i < 2; i++) { await p.press('Tab', { alt: altTabIn('webkit') }); seen.push(await p.evaluate('document.activeElement.tagName')); }
        // Its WebKit on Windows skips every link, with Option or without: there the pass leaves Tab's criteria untried.
        if (process.platform === 'win32') assert.equal(seen[1], 'BODY', 'WebKit on Windows still skips links: if it reaches them now, try Tab there again (a11y-browsers.mjs untriedIn)');
        else assert.deepEqual(seen, ['BUTTON', 'A'], 'Option-Tab reaches buttons and links, as in Safari');
        await p.close();
      } finally { await b.close(); }
    }
  } finally { rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }); }
});

// Nothing changes for a run without it: Firefox and WebKit are found and opened by the engine's own drivers.
test('with Playwright turned off the engine\'s own drivers open every browser, and nothing points at its builds', () => {
  const code = `import('./lib/browsers.mjs').then(async (b) => { const p = await import('./lib/playwright.mjs'); console.log(JSON.stringify({ here: p.playwrightHere(), by: ['chrome', 'firefox', 'webkit'].map((n) => p.drivenBy(n)), webkit: b.findWebKit() })); })`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: ENGINE, encoding: 'utf8', env: { ...process.env, DESIGN_SYSTEM_ENGINE_PLAYWRIGHT: 'none' } });
  const got = JSON.parse(r.stdout);
  assert.equal(got.here, null);
  assert.deepEqual(got.by, ['engine', 'engine', 'engine']);
  assert.ok(!String(got.webkit ?? '').includes('ms-playwright'), 'WebKit is Safari\'s own WebDriver, or none');
});

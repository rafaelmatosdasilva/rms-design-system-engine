// playwright.mjs - Playwright drives the browsers when it is here, the engine's own drivers when it is not.
//
// The engine drives Chrome, Firefox and Safari with its own small clients (cdp.mjs, bidi.mjs, webdriver.mjs), which
// need nothing installed but the browser. Playwright (Apache-2.0, free and open source) is built and tested for driving
// exactly those three engines on macOS, Linux and Windows, and it brings WebKit where Safari is not: Linux and Windows.
// So the multi-browser layer (page-driver.mjs) takes it when it is here, and the engine's own drivers stay a whole
// path: the same checks and the same answers, never a reduced run. Nothing is required, and "No dependencies" holds.
//
// Where it is found, in order:
//   1. the project's own (`playwright-core`, or `playwright`, which holds it, in the project's node_modules);
//   2. the pinned copy the engine keeps in its own cache, as axe-core is kept: downloaded once from the npm registry,
//      checked against its pinned SHA-512, never put in the project (`node lib/playwright.mjs --fetch`).
// DESIGN_SYSTEM_ENGINE_PLAYWRIGHT=none turns it off, so a run uses the engine's own drivers wherever Playwright is.
//
// A browser is Playwright's to drive only when its build for this Playwright is installed (Firefox and WebKit are
// Playwright's own builds, matched to its version; `--fetch --browsers` installs them). Chrome is the one found on the
// computer, as for the engine's own driver, so Chrome is Playwright's whenever Playwright is here.
//
// The pin moves only through a pull request that says what passed (pinned-standards.mjs watches it). The version and
// the hash move together: `node -e "import('./lib/playwright.mjs').then(async (m) => console.log(await m.integrityOf('<v>')))"`
//
//   PW_VERSION, PW_INTEGRITY
//   pwCacheDir(home)                 → where the pinned copy is kept
//   findPlaywright(opts)             → { dir, version, from: 'project' | 'cache' } or null
//   pwBrowsersRoot(dir, opts)        → where that Playwright keeps its browsers
//   pwBrowser(name, found, opts)     → the folder of its installed build of firefox / webkit, or null
//   playwrightHere(opts)             → { dir, version, from, firefox, webkit } or null (one look, kept for the run)
//   drivenBy(name, opts)             → 'playwright' | 'engine'
//   loadPlaywright(found)            → the module
//   fetchPlaywright(opts)            → the cache folder, or null
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, rmSync, chmodSync } from 'node:fs';
import { join, dirname, resolve, sep } from 'node:path';
import { homedir, release, arch } from 'node:os';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const PW_VERSION = '1.65.1';
export const PW_INTEGRITY = 'sha512-hqPpz7blSMPxWVdoeE1yiBSzXsKiVOd2k+kjCvmUywD2GPO2Dd9HfcWnq9NN0GHbNZDFgZ9JfBFr+X5/BLo0qw==';

const tarball = (version) => `https://registry.npmjs.org/playwright-core/-/playwright-core-${version}.tgz`;
export const intact = (buf) => Buffer.isBuffer(buf) && `sha512-${createHash('sha512').update(buf).digest('base64')}` === PW_INTEGRITY;
export const pwCacheDir = (home = homedir()) => join(home, '.cache', 'rms-design-system-engine', `playwright-core-${PW_VERSION}`);
// Written last, once every file is in place: a copy without it is half a download and is never loaded.
const WHOLE = '.engine-intact';

const versionAt = (dir) => { try { return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version ?? null; } catch { return null; } };

export function findPlaywright({ root = process.cwd(), home = homedir(), env = process.env } = {}) {
  if (env.DESIGN_SYSTEM_ENGINE_PLAYWRIGHT === 'none') return null;
  // The project's own: playwright-core itself, or found through playwright, which depends on it.
  const req = createRequire(join(resolve(root), 'package.json'));
  for (const from of [null, 'playwright']) {
    try {
      const base = from ? dirname(req.resolve(`${from}/package.json`)) : null;
      const pkg = (base ? createRequire(join(base, 'package.json')) : req).resolve('playwright-core/package.json');
      const dir = dirname(pkg);
      if (existsSync(join(dir, 'index.mjs'))) return { dir, version: versionAt(dir), from: 'project' };
    } catch { /* not this way */ }
  }
  const cached = pwCacheDir(home);
  if (existsSync(join(cached, WHOLE)) && versionAt(cached) === PW_VERSION) return { dir: cached, version: PW_VERSION, from: 'cache' };
  return null;
}

// Where Playwright keeps its browsers: PLAYWRIGHT_BROWSERS_PATH ("0" is inside the package), else each system's own.
export function pwBrowsersRoot(dir, { env = process.env, home = homedir(), platform = process.platform } = {}) {
  const set = env.PLAYWRIGHT_BROWSERS_PATH;
  if (set === '0') return join(dir, '.local-browsers');
  if (set) return resolve(set);
  if (platform === 'darwin') return join(home, 'Library', 'Caches', 'ms-playwright');
  if (platform === 'win32') return join(env.LOCALAPPDATA || join(home, 'AppData', 'Local'), 'ms-playwright');
  return join(env.XDG_CACHE_HOME || join(home, '.cache'), 'ms-playwright');
}

// The revision this Playwright expects for a browser. A build is pinned per Playwright version, and a few systems take
// another (macOS 14's WebKit): the override is read for this computer, by Playwright's own names for it.
export function revisionOf(dir, name, { platform = process.platform, osRelease = release(), cpu = arch() } = {}) {
  let entry;
  try { entry = JSON.parse(readFileSync(join(dir, 'browsers.json'), 'utf8')).browsers.find((b) => b.name === name); } catch { return null; }
  if (!entry) return null;
  if (platform === 'darwin' && entry.revisionOverrides) {
    const darwin = Number(String(osRelease).split('.')[0]);
    const mac = darwin >= 25 ? darwin + 1 : darwin - 9;   // Darwin 23 is macOS 14, Darwin 25 is macOS 26
    const key = `mac${mac}${cpu === 'arm64' ? '-arm64' : ''}`;
    if (entry.revisionOverrides[key]) return entry.revisionOverrides[key];
  }
  return entry.revision;
}

// Its build of a browser, when it is installed whole (Playwright writes INSTALLATION_COMPLETE last).
export function pwBrowser(name, found, opts = {}) {
  if (!found) return null;
  const rev = revisionOf(found.dir, name, opts);
  if (!rev) return null;
  const at = join(pwBrowsersRoot(found.dir, opts), `${name}-${rev}`);
  return existsSync(join(at, 'INSTALLATION_COMPLETE')) ? at : null;
}

let seen;
export function playwrightHere(opts = {}) {
  const fresh = Object.keys(opts).length > 0;
  if (!fresh && seen !== undefined) return seen;
  const found = findPlaywright(opts);
  const here = found ? { ...found, firefox: pwBrowser('firefox', found, opts), webkit: pwBrowser('webkit', found, opts) } : null;
  if (!fresh) seen = here;
  return here;
}

// Which driver opens a browser: Playwright's when it is here and has that browser, the engine's own otherwise.
// A browser named by its own setting (FIREFOX_PATH, WEBKIT_PATH) is that browser, which only the engine's own driver
// opens: Playwright drives its own builds.
// `path`: the browser a caller is about to open. A Firefox or WebKit that is not Playwright's own build is that browser,
// opened by the engine's own driver: Playwright would open its own instead and leave the one asked for untried (a test's
// stand-in Firefox was, and the real one Playwright opened in its place was never closed).
export function drivenBy(name, { here = playwrightHere(), env = process.env, path = null } = {}) {
  if (!here) return 'engine';
  const own = (p) => Boolean(here[name]) && resolve(p).startsWith(resolve(here[name]));   // its own build named is still its own
  const named = name === 'firefox' ? env.FIREFOX_PATH : name === 'webkit' ? env.WEBKIT_PATH : null;
  if (named && !own(named)) return 'engine';
  if (path && name !== 'chrome' && !own(path)) return 'engine';
  if (name === 'chrome') return 'playwright';
  return here[name] ? 'playwright' : 'engine';
}

const loaded = new Map();
export async function loadPlaywright(found = playwrightHere()) {
  if (!found) throw new Error('Playwright is not here');
  if (!loaded.has(found.dir)) loaded.set(found.dir, import(pathToFileURL(join(found.dir, 'index.mjs')).href));
  return loaded.get(found.dir);
}

// Every file out of an npm .tgz into `into` (gzip + ustar, with the long-name prefix and pax paths npm writes).
// `package/` is dropped, as npm does, and a path that would land outside `into` is refused.
export function extractTgz(buf, into) {
  const tar = gunzipSync(buf);
  const str = (a, b) => tar.subarray(a, b).toString('utf8').replace(/\0.*$/s, '');
  let paxPath = null;
  for (let off = 0; off + 512 <= tar.length;) {
    const name = str(off, off + 100);
    if (!name) break;
    const size = parseInt(str(off + 124, off + 136).trim() || '0', 8);
    const mode = parseInt(str(off + 100, off + 108).trim() || '644', 8);
    const type = String.fromCharCode(tar[off + 156] || 48);
    const prefix = str(off + 345, off + 500);
    const body = tar.subarray(off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;
    if (type === 'x') { const m = /\d+ path=([^\n]+)\n/.exec(body.toString('utf8')); paxPath = m ? m[1] : null; continue; }
    if (type === 'g') continue;
    const full = (paxPath ?? (prefix ? `${prefix}/${name}` : name)).replace(/^package\//, '');
    paxPath = null;
    const out = resolve(into, full);
    if (out !== resolve(into) && !out.startsWith(resolve(into) + sep)) throw new Error(`a path outside the package: ${full}`);
    if (type === '5') { mkdirSync(out, { recursive: true }); continue; }
    if (type !== '0' && type !== '\0' && type !== '7') continue;   // links and devices: npm packages hold none
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, body);
    if (process.platform !== 'win32') chmodSync(out, mode & 0o755);
  }
}

// get: how the package is downloaded (the registry by default; a test hands its own).
export async function fetchPlaywright({ home = homedir(), get = null } = {}) {
  const at = pwCacheDir(home);
  if (existsSync(join(at, WHOLE)) && versionAt(at) === PW_VERSION) return at;
  let buf;
  try { buf = get ? await get(tarball(PW_VERSION)) : Buffer.from(await (await fetch(tarball(PW_VERSION), { signal: AbortSignal.timeout(120000) })).arrayBuffer()); } catch { return null; }
  if (!intact(buf)) return null;   // not the pinned package: never load it
  // Unpacked beside it, then moved into place: a run at the same time never loads half a package.
  const tmp = `${at}.${process.pid}.tmp`;
  try {
    rmSync(tmp, { recursive: true, force: true });
    extractTgz(buf, tmp);
    writeFileSync(join(tmp, WHOLE), PW_INTEGRITY);
    rmSync(at, { recursive: true, force: true });
    mkdirSync(dirname(at), { recursive: true });
    renameSync(tmp, at);
    return at;
  } catch { rmSync(tmp, { recursive: true, force: true }); return null; }
}

export async function integrityOf(version) {
  const buf = Buffer.from(await (await fetch(tarball(version))).arrayBuffer());
  return `sha512-${createHash('sha512').update(buf).digest('base64')}`;
}

// The browsers it drives that are its own builds, installed by its own command (`--with-deps` on Linux, for the
// system libraries WebKit needs). Chrome is not among them: the one on the computer is used.
export function installBrowsers(found, { withDeps = false, names = ['firefox', 'webkit'] } = {}) {
  return spawnSync(process.execPath, [join(found.dir, 'cli.js'), 'install', ...(withDeps ? ['--with-deps'] : []), ...names], { stdio: 'inherit' }).status === 0;
}

// What a run says about it, in one line.
export function playwrightLine(here = playwrightHere()) {
  if (!here) return 'Playwright: not here, so the engine\'s own drivers open every browser';
  const has = ['firefox', 'webkit'].filter((n) => here[n]).map((n) => (n === 'firefox' ? 'Firefox' : 'WebKit'));
  return `Playwright ${here.version} (${here.from === 'project' ? 'the project\'s' : 'the engine\'s pinned copy'}): drives Chrome${has.length ? `, ${has.join(' and ')}` : ''}${has.length < 2 ? `, and the engine's own drivers open ${['Firefox', 'WebKit'].filter((n) => !has.includes(n)).join(' and ')}` : ''}`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes('--fetch')) {
    const at = await fetchPlaywright();
    if (!at) { console.log(`⚠️  Playwright ${PW_VERSION} could not be fetched now (offline or blocked). The engine's own drivers open every browser.`); process.exit(0); }
    console.log(`✅ Playwright ${PW_VERSION} is in the engine's cache (${at}).`);
    if (args.includes('--browsers')) {
      const ok = installBrowsers({ dir: at }, { withDeps: args.includes('--with-deps') });
      console.log(ok ? '✅ Its Firefox and WebKit are installed.' : '⚠️  Its browsers could not be installed. The engine\'s own drivers open Firefox and Safari where they are.');
      process.exit(ok ? 0 : 1);
    }
  } else {
    console.log(playwrightLine(playwrightHere({ root: process.cwd() })));
  }
}

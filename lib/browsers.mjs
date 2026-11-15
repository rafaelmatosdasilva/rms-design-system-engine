// browsers.mjs - which browsers this machine can run the checks in, and what is missing.
//
// Every browser check runs in Chrome today, through its DevTools protocol (cdp.mjs). Layout, fonts, form controls and
// focus rings differ between engines, so a criterion a browser decides - whether Tab reaches a control, whether the
// focus ring shows, whether the page reflows at 320px - is answered for Chrome and for nothing else. That is not
// wrong, it is narrow, and a run that does not say so reads as though it covered every browser.
//
// This says what is here: Chrome (cdp.mjs), Firefox (WebDriver BiDi, bidi.mjs) and WebKit, Safari's engine, through
// the WebDriver macOS ships (webdriver.mjs). Nothing is installed for any of them but the browser itself. Rendered
// parity is drawn in the other two as well (cross-browser.mjs); the accessibility criteria a browser decides are not
// tried there yet, and each criterion says what it depends on (wcag21.mjs `browser`). A browser that is not installed
// is named as missing rather than passed over.
//
//   findFirefox() / findWebKit()   → a path, or null
//   browsersHere()                 → { chrome, firefox, webkit }
//   browserLines(found)            → what a run says about them
//   triedIn(criterion, found)      → the one line a criterion's row shows
import { existsSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { findChrome } from './cdp.mjs';

const whichBin = (name) => { const r = spawnSync('which', [name], { encoding: 'utf8' }); return r.status === 0 && r.stdout.trim() ? r.stdout.trim() : null; };
// Playwright keeps its browsers in one cache, each in a folder named for the engine and its build.
function playwrightBin(prefix, inside, { exists = existsSync, home = homedir() } = {}) {
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH || join(home, 'Library', 'Caches', 'ms-playwright');
  let dirs = [];
  try { dirs = readdirSync(cache).filter((d) => d.startsWith(prefix)); } catch { return null; }
  for (const d of dirs.sort().reverse()) { const p = join(cache, d, ...inside); if (exists(p)) return p; }
  return null;
}

export function findFirefox({ env = process.env, exists = existsSync, which = whichBin } = {}) {
  if (env.DESIGN_SYSTEM_ENGINE_FIREFOX === 'none') return null;
  for (const p of [env.FIREFOX_PATH, '/Applications/Firefox.app/Contents/MacOS/firefox'].filter(Boolean)) if (exists(p)) return p;
  for (const name of ['firefox', 'firefox-esr']) { const p = which(name); if (p) return p; }
  return playwrightBin('firefox-', ['firefox', 'Nightly.app', 'Contents', 'MacOS', 'firefox']) ?? playwrightBin('firefox-', ['firefox', 'firefox']);
}

export function findWebKit({ env = process.env, exists = existsSync, which = whichBin } = {}) {
  if (env.DESIGN_SYSTEM_ENGINE_WEBKIT === 'none') return null;
  if (env.WEBKIT_PATH && exists(env.WEBKIT_PATH)) return env.WEBKIT_PATH;
  // Safari drives through the WebDriver macOS ships, once the person has turned remote automation on themselves.
  return which('safaridriver');
}

export function browsersHere(opts = {}) {
  return { chrome: findChrome({ playwright: true, ...opts }), firefox: findFirefox(opts), webkit: findWebKit(opts) };
}

// Why a browser is not used, in words a person can act on. Never "not supported": what is missing is the browser.
export const WHY_MISSING = {
  firefox: 'Firefox is not installed here',
  webkit: 'WebKit is not here (Safari\'s WebDriver, safaridriver, comes with macOS)',
};
export function browserLines(found = browsersHere()) {
  const out = [];
  out.push(found.chrome ? `Chrome: ${found.chrome}` : 'Chrome: none found, so no browser check runs at all');
  for (const name of ['firefox', 'webkit']) {
    out.push(found[name]
      ? `${name === 'firefox' ? 'Firefox' : 'WebKit'}: ${found[name]} (rendered parity and the accessibility criteria a browser decides are tried in it${name === 'webkit' ? ' when ds-config.json names webkit (rendered.browsers, a11y.browsers)' : ''})`
      : `${name === 'firefox' ? 'Firefox' : 'WebKit'}: ${WHY_MISSING[name]}`);
  }
  return out;
}

// What a run says when the other browsers did not try anything (no style guide to try, none of them here, or turned
// off): the same words on every machine, with no path in it. A run that did try them says which, and what differed
// (a11y-check.mjs, a11y-browsers.mjs).
export const BROWSER_RUN_LINE = 'The criteria a browser decides (what Tab reaches, where the focus shows, reflow, zoom, text spacing, target size) were answered for Chrome alone this run. Firefox and WebKit try them on the style guide\'s components when a run has them.';

// The one line a criterion's row shows about where it was tried, when no pass in the other browsers answered it for
// that component. `browser` says what the criterion depends on (wcag21.mjs): what the code or the design's values
// decide is the same everywhere and is read once; what a browser decides is tried in each, Firefox and WebKit through
// a11y-browsers.mjs for the criteria that pass covers (`pass`) and in Chrome alone for the rest; what a screen reader
// hears is Chrome's alone, since the other engines expose no accessibility tree to read and a tool that computes one
// itself reads the same everywhere. A row a pass did answer shows each browser's result instead.
export function triedIn(criterion = {}) {
  const kind = criterion.browser ?? 'same';
  if (kind === 'same') return 'Same in every browser: it is read from the code or the system\'s own values.';
  if (kind === 'chrome') return 'Chrome only: the other engines expose nothing of what a screen reader hears, and a tool that works it out itself reads the same everywhere. The pairs people really use are checked by hand.';
  if (criterion.pass) return 'Tried in Chrome. This is one a browser decides: Firefox and WebKit try it on the style guide\'s components when a run has them, and none has here yet.';
  return 'Tried in Chrome alone. This is one a browser decides, so Firefox and WebKit can differ, and the pass in them does not try it yet.';
}

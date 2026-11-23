// A theme of light-dark() values, which follows the page's colour scheme (as Angular Material's themes do): read as a
// mode of its own, switched by setting the colour scheme, and drawn in dark on the style guide's Dark switch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFileSync, rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { modeOverrides, detectModes, modeSwitchFor, impliedSchemeMode } from '../lib/mode-resolver.mjs';
import { deriveModeCSS } from '../lib/styleguide-gen.mjs';
import { findChrome, launchChrome, connectCDP, openPage, waitForTrue, FILE_PAGE_LOADED } from '../lib/cdp.mjs';
import { budget, tempDir } from './helpers.mjs';

const THEME = ':root { color-scheme: light; --fg: light-dark(#111111, #eeeeee); --bg: light-dark(#ffffff, #111111); }\np { color: var(--fg); background: var(--bg); }';

test('light-dark() values are a dark mode of their own, and a class that only switches the colour scheme is a mode', () => {
  assert.deepEqual(modeOverrides(THEME).map((o) => o.selector), ['color-scheme']);
  assert.equal(detectModes(THEME).modes[1].cssSelector, 'color-scheme');
  assert.deepEqual(modeOverrides('.dark-theme { color-scheme: dark; }').map((o) => o.selector), ['class:dark-theme']);
  // A media query that already gives the dark mode is that mode, never a second one.
  assert.deepEqual(modeOverrides(THEME + '\n@media (prefers-color-scheme: dark) { :root { --x: #000; } }').map((o) => o.selector), ['dark-media']);
});

test('a system that declares no dark mode has its colour-scheme dark implied, and one that declares it does not', () => {
  assert.deepEqual(impliedSchemeMode(THEME, [{ name: 'Light', cssSelector: 'root' }]), { name: 'Dark', snapshotKey: 'dark', cssSelector: 'color-scheme', implied: true });
  assert.equal(impliedSchemeMode(THEME, [{ name: 'Light', cssSelector: 'root' }, { name: 'Dark', cssSelector: 'dark-media' }]), null);
  assert.equal(impliedSchemeMode(':root { --x: #000; }', []), null, 'no light-dark(), nothing implied');
  const sw = modeSwitchFor({ cssSelector: 'color-scheme' });
  assert.match(sw.apply, /color-scheme', 'dark'/);
  assert.deepEqual(sw.media[0], { name: 'prefers-color-scheme', value: 'dark' });
});

test('the style guide\'s colour scopes set the colour scheme, so a Dark preview draws the dark values', () => {
  const css = deriveModeCSS(THEME);
  assert.match(css, /\[data-color="dark"\] \{ color-scheme: dark; \}/);
  assert.match(deriveModeCSS('html { --fg: light-dark(#111, #eee); }'), /\[data-color="dark"\] \{ color-scheme: dark; \}/, 'with no :root block too');
  assert.doesNotMatch(deriveModeCSS(':root { --fg: #111; }'), /color-scheme/);
});

const CHROME = findChrome({ playwright: true });
test('in a real browser: switched by the colour scheme, the text draws in its dark colours, and back in light after', { skip: CHROME && typeof WebSocket !== 'undefined' ? false : 'no Chrome available', timeout: budget(120000) }, async () => {
  const dir = tempDir('color-scheme-');
  const page = join(dir, 'p.html');
  writeFileSync(page, `<!doctype html><html><head><style>${THEME}</style></head><body><p>Words</p><div data-color="dark"><p id="scoped">Scoped</p></div><style>${deriveModeCSS(THEME).replace(THEME, '')}</style></body></html>`);
  const chrome = await launchChrome(CHROME);
  const { send, close } = await connectCDP(chrome.wsUrl);
  try {
    const { sessionId } = await openPage(send, pathToFileURL(page).href);
    await waitForTrue(send, sessionId, FILE_PAGE_LOADED, { attempts: 200 });
    const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true }, sessionId)).result.value;
    const colour = `getComputedStyle(document.querySelector('p')).color`;
    assert.equal(await ev(colour), 'rgb(17, 17, 17)', 'light at rest');
    const sw = modeSwitchFor({ cssSelector: 'color-scheme' });
    await send('Emulation.setEmulatedMedia', { features: sw.media }, sessionId);
    await ev(sw.apply);
    assert.equal(await ev(colour), 'rgb(238, 238, 238)', 'dark once the colour scheme is dark');
    await ev(sw.undo);
    assert.equal(await ev(colour), 'rgb(17, 17, 17)', 'light again after');
    assert.equal(await ev(`getComputedStyle(document.getElementById('scoped')).color`), 'rgb(238, 238, 238)', 'the style guide\'s Dark scope draws dark');
  } finally { close(); chrome.kill(); rmSync(dir, { recursive: true, force: true }); }
});

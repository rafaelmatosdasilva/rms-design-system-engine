// A design system's Lit components drawn with the project's own Lit, in a real browser.
//
// The Lit tests use the build a Lit project has installed, laid in a gitignored folder as CI does:
//   npm ci --prefix test/.lit-tools
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, symlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startLitHarness, renderedLit, litBuild, harnessModule, registeredTag, kebab } from '../lib/lit-harness.mjs';
import { codeComponents } from '../lib/component-source.mjs';
import { findChrome, launchChrome, connectCDP, openPage, waitForTrue } from '../lib/cdp.mjs';
import { budget, tempDir } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const FIXTURE = join(ENGINE, 'test', 'fixtures', 'acme-lit');
const TOOLS = join(ENGINE, 'test', '.lit-tools', 'node_modules');
const CHROME = findChrome({ playwright: true });
const READY = CHROME && typeof WebSocket !== 'undefined' && existsSync(join(TOOLS, 'vite')) && existsSync(join(TOOLS, 'lit'))
  ? false : 'no Chrome, or no Lit build tools (npm ci --prefix test/.lit-tools)';

// Acme, an invented Lit system, with its packages installed.
const acme = (prefix) => {
  const dir = tempDir(prefix);
  cpSync(FIXTURE, dir, { recursive: true });
  symlinkSync(TOOLS, join(dir, 'node_modules'), 'dir');
  return dir;
};
const CFG = { name: 'Acme', paths: { themeCSS: 'src/styles/tokens.css' } };
const FILES = { 'acme-button': 'acme-button.ts', 'acme-chip': 'acme-chip.js', 'acme-switch': 'acme-switch.component.ts' };
const locate = (dir) => (n) => (FILES[n] ? join(dir, 'src', 'components', FILES[n]) : null);

test('a project with no Lit of its own is said so, and nothing is drawn by the engine', async () => {
  const r = await litBuild(tempDir('lit-none-'));
  assert.match(r.why, /no Lit installed|packages are not installed/);
  assert.equal(r.vite, undefined);
});

test('the page carries the markers every check already reads, and sets each value as a property', () => {
  const mod = harnessModule([{ name: 'chip', slug: 'chip', file: '/src/chip.ts', exportName: 'Chip', tag: 'acme-chip', cases: [{ label: 'default', props: { selected: true } }] }], ['/src/styles/tokens.css']);
  assert.doesNotThrow(() => new Function(mod.replace(/^import .*$/gm, '').replace(/\bawait\b/g, '')), 'the page module parses');
  for (const m of [/data-dse-component/, /data-dse-case/, /window\.__dseHarnessReady = true/, /window\.__dseHarnessFailed/, /import "\/src\/styles\/tokens\.css"/, /el\[k\] = v/]) assert.match(mod, m);
  assert.equal(kebab('IconButton'), 'icon-button');
});

test('a tag another file registers is the one it is drawn as', () => {
  assert.equal(registeredTag(join(FIXTURE, 'src', 'components', 'acme-switch.component.ts'), 'acme-switch.component'), 'acme-switch');
  assert.equal(registeredTag(join(FIXTURE, 'src', 'components', 'acme-button.ts'), 'acme-button'), null);
});

test('every way a Lit library writes a component is drawn by its own Lit: decorators, static properties, a tag defined elsewhere', { skip: READY, timeout: budget(300000) }, async () => {
  const dir = acme('lit-real-');
  const names = codeComponents(dir, CFG).map((c) => c.name).sort();
  assert.deepEqual(names, ['acme-button', 'acme-chip', 'acme-switch']);
  const h = await startLitHarness(dir, CFG, names, { locate: locate(dir) });
  assert.ok(h.url, h.why);
  const browser = await launchChrome(CHROME, { tmpPrefix: 'dse-lit-' });
  try {
    const { send } = await connectCDP(browser.wsUrl);
    const { sessionId } = await openPage(send, h.url);
    assert.ok(await waitForTrue(send, sessionId, 'window.__dseHarnessReady === true', { attempts: 1200, intervalMs: 50, tolerateErrors: true }), 'the page settled');
    const inPage = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)).result?.value;
    assert.deepEqual(JSON.parse(await inPage('JSON.stringify(window.__dseHarnessFailed)')), [], 'every component drew');
    assert.deepEqual(JSON.parse(await inPage(`JSON.stringify([...document.querySelectorAll('[data-dse-component]')].map((s) => s.getAttribute('data-dse-component')))`)), names);
    // Each case is the code's own options: tone loud and quiet, set as a property and reflected by Lit.
    const tones = JSON.parse(await inPage(`JSON.stringify([...document.querySelectorAll('[data-dse-component="acme-button"] acme-button')].map((b) => b.getAttribute('tone')))`));
    assert.ok(tones.includes('loud') && tones.includes('quiet'), `both tones drawn: ${tones}`);
    // The project's own token, through the shadow root, as the browser resolves it: what parity reads.
    assert.equal(await inPage(`getComputedStyle(document.querySelector('acme-button').shadowRoot.querySelector('.acmeButton')).height`), '36px');
    // What a person puts in it: the button says its name.
    assert.equal(await inPage(`document.querySelector('acme-button').textContent.trim()`), 'Acme Button');
    // The switch's tag was defined in another file, and the component behaves: a click switches it.
    assert.equal(await inPage(`(async () => { const s = document.querySelector('acme-switch'); const b = s.shadowRoot.querySelector('button'); b.click(); await s.updateComplete; return b.getAttribute('aria-checked'); })()`), 'true');
  } finally { browser.kill(); await h.close(); }
});

test('the style guide gets each case as Lit drew it: a declarative shadow root with its styles inside', { skip: READY, timeout: budget(300000) }, async () => {
  const dir = acme('lit-rendered-');
  const r = await renderedLit(dir, CFG, ['acme-button', 'acme-chip'], { locate: locate(dir), max: 4 });
  assert.equal(r.why, undefined, r.why);
  assert.deepEqual(r.failed, []);
  const button = r.markup['acme-button'];
  assert.match(button, /^<acme-button\b/);
  assert.match(button, /<template shadowrootmode="open">/, 'its shadow root kept, so a page draws it without running Lit');
  assert.match(button, /<style data-dse-adopted="">[^<]*\.acmeButton/, 'the styles Lit adopted are inside it');
  assert.ok((r.cases['acme-button'] ?? []).length >= 2, 'each case is kept');
});

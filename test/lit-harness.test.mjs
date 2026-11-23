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

test('the style guide attaches a declarative shadow root wherever it puts one, which innerHTML alone leaves inert', { skip: CHROME && typeof WebSocket !== 'undefined' ? false : 'no Chrome', timeout: budget(120000) }, async () => {
  const { readFileSync } = await import('node:fs');
  const start = readFileSync(join(ENGINE, 'templates', 'styleguide', 'js', '00-start.js'), 'utf8');
  const fn = /function attachShadows\(root\) \{[\s\S]*?\n {2}\}\n/.exec(start)?.[0];
  assert.ok(fn, 'the page attaches them itself');
  const browser = await launchChrome(CHROME, { tmpPrefix: 'dse-lit-dsd-' });
  try {
    const { send } = await connectCDP(browser.wsUrl);
    const { sessionId } = await openPage(send, 'about:blank');
    const r = (await send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
      ${fn}
      const box = document.createElement('div'); document.body.append(box);
      box.innerHTML = '<acme-chip><template shadowrootmode="open"><style>span{color:rgb(1, 2, 3)}</style><span>in</span></template>out</acme-chip>';
      const before = !!box.firstChild.shadowRoot;
      attachShadows(box);
      const host = box.firstChild;
      return JSON.stringify({ before, after: !!host.shadowRoot, color: host.shadowRoot && getComputedStyle(host.shadowRoot.querySelector('span')).color, light: host.textContent });
    })()` }, sessionId)).result.value;
    const v = JSON.parse(r);
    assert.equal(v.before, false, 'innerHTML leaves it inert');
    assert.equal(v.after, true);
    assert.equal(v.color, 'rgb(1, 2, 3)', 'its styles apply inside it');
    assert.equal(v.light, 'out', 'and what a person put in stays in its light');
  } finally { browser.kill(); }
});

// A Web Component written with no library: watched attributes set by their own name, a class found by its tag.
test('a plain Web Component\'s watched attributes are set as attributes, under their own names', () => {
  const mod = harnessModule([{ name: 'tag', slug: 'tag', kind: 'web component', file: '/src/tag.js', exportName: 'Tag', tag: 'acme-tag', attrs: { tone: 'tone', closeLabel: 'close-label' }, cases: [{ label: 'loud', props: { tone: 'loud', closeLabel: 'Close' } }] }]);
  assert.match(mod, /const k = \(g\.attrs && g\.attrs\[k0\]\) \|\| k0/);
  assert.match(mod, /customElements\.get\(g\.tag\)/, 'a class it exports nothing of is found by its tag');
});

test('a Web Component written with no library is drawn by the project\'s own Vite, with no Lit needed', { skip: READY, timeout: budget(300000) }, async () => {
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const dir = tempDir('wc-real-');
  mkdirSync(join(dir, 'src', 'components'), { recursive: true });
  symlinkSync(TOOLS, join(dir, 'node_modules'), 'dir');
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'acme-wc', private: true, type: 'module' }));
  writeFileSync(join(dir, 'src', 'components', 'acme-tag.js'), `class AcmeTag extends HTMLElement {
  static get observedAttributes() { return ['tone']; }
  constructor() { super(); this.attachShadow({ mode: 'open' }); }
  connectedCallback() { this.render(); }
  attributeChangedCallback() { this.render(); }
  render() { this.shadowRoot.innerHTML = \`<style>:host { display: inline-block } .tag { padding: 4px 8px }</style><span class="tag" data-tone="\${this.getAttribute('tone') ?? 'quiet'}"><slot></slot></span>\`; }
}
customElements.define('acme-tag', AcmeTag);`);
  const names = codeComponents(dir, {}).map((c) => c.name);
  assert.deepEqual(names, ['acme-tag'], 'read as a component, though nothing imports a library');
  const h = await startLitHarness(dir, {}, names, { locate: (n) => (n === 'acme-tag' ? join(dir, 'src', 'components', 'acme-tag.js') : null) });
  assert.ok(h.url, h.why);
  const browser = await launchChrome(CHROME, { tmpPrefix: 'dse-wc-' });
  try {
    const { send } = await connectCDP(browser.wsUrl);
    const { sessionId } = await openPage(send, h.url);
    assert.ok(await waitForTrue(send, sessionId, 'window.__dseHarnessReady === true', { attempts: 1200, intervalMs: 50, tolerateErrors: true }), 'the page settled');
    const inPage = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)).result?.value;
    assert.deepEqual(JSON.parse(await inPage('JSON.stringify(window.__dseHarnessFailed)')), [], 'it drew');
    assert.equal(await inPage(`document.querySelector('acme-tag').shadowRoot.querySelector('.tag') ? 'drawn' : 'empty'`), 'drawn');
  } finally { browser.kill(); await h.close(); }
});

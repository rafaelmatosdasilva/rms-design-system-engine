// A design system's Svelte components drawn with the project's own Svelte, in a real browser (svelte-harness.mjs).
//
// The Svelte tests use the build a Svelte project has installed (Vite, Svelte and its plugin for Vite), laid in a
// gitignored folder as CI does:
//   npm ci --prefix test/.svelte-tools
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, symlinkSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { startSvelteHarness, renderedSvelte, svelteBuild, harnessModule } from '../lib/svelte-harness.mjs';
import { codeComponents, textComponentApi } from '../lib/component-source.mjs';
import { findChrome, launchChrome, connectCDP, openPage, waitForTrue } from '../lib/cdp.mjs';
import { budget, tempDir } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const FIXTURE = join(ENGINE, 'test', 'fixtures', 'acme-svelte');
const TOOLS = join(ENGINE, 'test', '.svelte-tools', 'node_modules');
const CHROME = findChrome({ playwright: true });
const READY = CHROME && typeof WebSocket !== 'undefined' && existsSync(join(TOOLS, 'vite')) && existsSync(join(TOOLS, 'svelte')) && existsSync(join(TOOLS, '@sveltejs', 'vite-plugin-svelte'))
  ? false : 'no Chrome, or no Svelte build tools (npm ci --prefix test/.svelte-tools)';

// Acme, an invented Svelte system, with its packages installed.
const acme = (prefix) => {
  const dir = tempDir(prefix);
  cpSync(FIXTURE, dir, { recursive: true });
  symlinkSync(TOOLS, join(dir, 'node_modules'), 'dir');
  return dir;
};
const CFG = { name: 'Acme', paths: { themeCSS: 'src/styles/tokens.css' } };
const filesOf = (dir) => Object.fromEntries(codeComponents(dir, CFG).map((k) => [k.name, join(dir, k.file)]));

test('a project with no Svelte of its own is said so, and nothing is drawn by the engine', async () => {
  const r = await svelteBuild(tempDir('svelte-none-'));
  assert.match(r.why, /no Svelte installed|packages are not installed/);
  assert.equal(r.vite, undefined);
});

test('the page carries the markers every check already reads, and mounts as the project\'s own Svelte does', () => {
  const mod = harnessModule([{ name: 'Badge', slug: 'badge', file: '/src/Badge.svelte', cases: [{ label: 'default', props: { tone: 'danger' } }] }], ['/src/styles/tokens.css']);
  for (const m of [/data-dse-component/, /data-dse-case/, /window\.__dseHarnessReady = true/, /window\.__dseHarnessFailed/, /import "\/src\/styles\/tokens\.css"/, /import \* as Svelte from 'svelte'/]) assert.match(mod, m);
  assert.match(mod, /typeof Svelte\.mount === 'function' \? Svelte\.mount\(C, \{ target, props \}\) : new C\(\{ target, props \}\)/, 'Svelte 5 mounts, Svelte 3 and 4 construct');
});

test('a Svelte 5 component\'s props are read from $props(), its content from what it renders, and never from its styles', () => {
  const api = textComponentApi('Toggle.svelte', readFileSync(join(FIXTURE, 'src', 'components', 'AcmeToggle.svelte'), 'utf8'));
  assert.deepEqual(api.props, { pressed: { default: false }, label: { default: 'Bold' } }, "[aria-pressed='true'] in its styles is no default");
  const button = textComponentApi('Button.svelte', readFileSync(join(FIXTURE, 'src', 'components', 'AcmeButton.svelte'), 'utf8'));
  assert.deepEqual(Object.keys(button.props), ['size', 'disabled', 'onclick'], 'children is its content, not a prop');
  assert.equal(button.slots.default, true, '{@render children()} is its default content');
  const named = textComponentApi('Card.svelte', '<script>\n  let { title, footer, ...rest } = $props();\n</script>\n<div {...rest}>{title}{@render footer?.()}</div>');
  assert.deepEqual([Object.keys(named.props), named.slots.named], [['title', 'footer'], ['footer']], 'what it passes on is no prop');
  const legacy = textComponentApi('Badge.svelte', readFileSync(join(FIXTURE, 'src', 'components', 'AcmeBadge.svelte'), 'utf8'));
  assert.deepEqual(Object.keys(legacy.props), ['tone', 'label'], 'Svelte 4\'s export let, as before');
});

test('each component drawn by the project\'s own Svelte: Svelte 5 and 4, its content, its scoped styles, and it behaves', { skip: READY, timeout: budget(300000) }, async () => {
  const dir = acme('svelte-real-');
  const files = filesOf(dir);
  const names = Object.keys(files).sort();
  assert.deepEqual(names, ['AcmeBadge', 'AcmeButton', 'AcmeToggle']);
  const h = await startSvelteHarness(dir, CFG, names, { locate: (n) => files[n] });
  assert.ok(h.url, h.why);
  const browser = await launchChrome(CHROME, { tmpPrefix: 'dse-svelte-' });
  try {
    const { send } = await connectCDP(browser.wsUrl);
    const { sessionId } = await openPage(send, h.url);
    assert.ok(await waitForTrue(send, sessionId, 'window.__dseHarnessReady === true', { attempts: 1200, intervalMs: 50, tolerateErrors: true }), 'the page settled');
    const inPage = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)).result?.value;
    assert.deepEqual(JSON.parse(await inPage('JSON.stringify(window.__dseHarnessFailed)')), [], 'every component drew');
    assert.deepEqual(JSON.parse(await inPage(`JSON.stringify([...document.querySelectorAll('[data-dse-component]')].map((s) => s.getAttribute('data-dse-component')))`)), names);
    // Svelte 4's export let, drawn by Svelte 5 as the project's own pages would.
    assert.equal(await inPage(`document.querySelector('[data-dse-component="AcmeBadge"] .acme-badge').textContent`), 'New');
    // What a person puts in it, as a snippet: the button says its name.
    assert.equal(await inPage(`document.querySelector('[data-dse-component="AcmeButton"] button').textContent.trim()`), 'Acme Button');
    // The project's own token, through Svelte's scoped styles, as the browser resolves it: what parity reads.
    assert.equal(await inPage(`getComputedStyle(document.querySelector('[data-dse-component="AcmeButton"] button')).backgroundColor`), 'rgb(31, 95, 214)');
    // Each case: the disabled one is disabled.
    assert.ok(await inPage(`[...document.querySelectorAll('[data-dse-component="AcmeButton"] button')].some((b) => b.disabled)`));
    // Its state runs: a click presses the toggle.
    assert.equal(await inPage(`(async () => { const b = document.querySelector('[data-dse-case="default"] .acme-toggle'); const was = b.getAttribute('aria-pressed'); b.click(); await new Promise((r) => setTimeout(r, 50)); return was + '>' + b.getAttribute('aria-pressed'); })()`), 'false>true');
  } finally { browser.kill(); await h.close(); }
});

test('the style guide gets each case as Svelte drew it, with the styles Svelte scoped to it', { skip: READY, timeout: budget(300000) }, async () => {
  const dir = acme('svelte-rendered-');
  const files = filesOf(dir);
  const r = await renderedSvelte(dir, CFG, ['AcmeButton', 'AcmeToggle'], { locate: (n) => files[n], max: 4 });
  assert.equal(r.why, undefined, r.why);
  assert.deepEqual(r.failed, []);
  assert.match(r.markup.AcmeButton, /^<button type="button" class="acme-button acme-button--m svelte-[a-z0-9]+">/);
  assert.match(r.css, /\.acme-button\.svelte-[a-z0-9]+\s*\{/, 'its scoped styles, as Svelte wrote them');
  assert.deepEqual(r.cases.AcmeToggle.map((c) => c.label), ['default', 'pressed=true', 'label=""']);
  assert.match(r.cases.AcmeToggle[1].markup, /aria-pressed="true"/);
});

test('the accessibility check draws a Svelte system with its own Svelte and checks what is drawn', { skip: READY, timeout: budget(400000) }, () => {
  const dir = acme('svelte-a11y-');
  writeFileSync(join(dir, 'ds-config.json'), JSON.stringify(CFG));
  const r = spawnSync(process.execPath, [join(ENGINE, 'lib', 'a11y-check.mjs'), '--json-out', join(dir, 'a11y.json')], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', CHROME_PATH: CHROME }, timeout: budget(380000) });
  assert.match(r.stdout, /the components are drawn with the project's own Svelte \(3 of them\)/, (r.stdout + r.stderr).slice(-1500));
  const out = JSON.parse(readFileSync(join(dir, 'a11y.json'), 'utf8'));
  assert.deepEqual(out.target, ['the components, rendered from their code'], 'the drawn components are what was checked');
  assert.match(r.stdout, /smaller than a comfortable touch target/, 'what is drawn is measured: the small controls are found');
});

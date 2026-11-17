// A design system's React components drawn with the project's own React, not a stand-in for it.
//
// The React tests use the build a React project has installed, laid in a gitignored folder as CI does:
//   npm ci --prefix test/.react-tools
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, symlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startReactHarness, reactBuild, harnessModule } from '../lib/react-harness.mjs';
import { findChrome, launchChrome, connectCDP, openPage, waitForTrue } from '../lib/cdp.mjs';
import { budget, tempDir } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const FIXTURE = join(ENGINE, 'test', 'fixtures', 'beacon-react');
const TOOLS = join(ENGINE, 'test', '.react-tools', 'node_modules');
const CHROME = findChrome({ playwright: true });
const READY = CHROME && typeof WebSocket !== 'undefined' && existsSync(join(TOOLS, 'vite')) && existsSync(join(TOOLS, 'react'))
  ? false : 'no Chrome, or no React build tools (npm ci --prefix test/.react-tools)';

// Beacon, an invented React system whose components need real React, with its packages installed.
const beacon = (prefix) => {
  const dir = tempDir(prefix);
  cpSync(FIXTURE, dir, { recursive: true });
  symlinkSync(TOOLS, join(dir, 'node_modules'), 'dir');
  return dir;
};
const NAMES = ['Disclosure', 'FieldSize', 'MenuSheet'];
const locate = (dir) => (n) => join(dir, 'src', 'components', `${n}.jsx`);

test('a project with no React of its own is said so, and keeps the stand-in', async () => {
  const bare = tempDir('react-none-');
  const r = await reactBuild(bare);
  assert.match(r.why, /no React installed|packages are not installed/);
  assert.equal(r.vite, undefined, 'nothing of the engine\'s own is used to draw');
});

test('the page carries the markers every check already reads, so nothing downstream changes', () => {
  const mod = harnessModule([{ name: 'Chip', file: '/src/Chip.jsx', exportName: 'Chip', cases: [{ label: 'default', props: {} }] }], ['/src/styles/tokens.css']);
  assert.match(mod, /data-dse-component/);
  assert.match(mod, /data-dse-case/);
  assert.match(mod, /window\.__dseHarnessReady = true/);
  assert.match(mod, /window\.__dseHarnessFailed/);
  assert.match(mod, /from 'react-dom\/client'/, 'drawn by the project\'s React, never by a stand-in');
  assert.match(mod, /import "\/src\/styles\/tokens\.css"/, 'with the project\'s own stylesheets');
});

// The three things the stand-in cannot do, and the reason a React system was only partly checked until now.
test('state, context and a portal all run: the component behaves as it does in the product', { skip: READY, timeout: budget(300000) }, async () => {
  const dir = beacon('react-real-');
  const h = await startReactHarness(dir, { name: 'Beacon', paths: { themeCSS: 'src/styles/tokens.css' } }, NAMES, { locate: locate(dir) });
  assert.ok(h.url, h.why);
  const browser = await launchChrome(CHROME, { tmpPrefix: 'dse-react-' });
  try {
    const { send } = await connectCDP(browser.wsUrl);
    const { sessionId } = await openPage(send, h.url);
    await waitForTrue(send, sessionId, 'window.__dseHarnessReady === true', { attempts: 1200, intervalMs: 50, tolerateErrors: true });
    const inPage = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)).result?.value;

    assert.deepEqual(JSON.parse(await inPage(`JSON.stringify([...document.querySelectorAll('[data-dse-component]')].map((s) => s.getAttribute('data-dse-component')))`)), NAMES);
    assert.deepEqual(JSON.parse(await inPage('JSON.stringify(window.__dseHarnessFailed)')), [], 'every component drew');

    // The project's own token, resolved by the browser: what parity reads.
    assert.equal(await inPage(`getComputedStyle(document.querySelector('.bc-disclosure__summary')).height`), '36px');

    // useState: the stand-in renders once and never sees it open.
    assert.equal(await inPage(`(async () => { const b = document.querySelector('.bc-disclosure__summary'); b.click(); await new Promise((r) => setTimeout(r, 200)); return b.getAttribute('aria-expanded') + ' ' + Boolean(document.querySelector('.bc-disclosure__panel')); })()`),
      'true true', 'it opens, and its panel is there');

    // createPortal: the sheet is drawn into the page's own body, outside the component's box.
    assert.equal(await inPage(`(async () => { const b = document.querySelector('.bc-menu__button'); b.click(); await new Promise((r) => setTimeout(r, 200)); const s = document.querySelector('.bc-menu__sheet'); return s ? s.parentElement.tagName + ':' + s.children.length : 'no sheet'; })()`),
      'BODY:3', 'the portal ran');

    // useContext: a field reads its default where no form says otherwise, and draws at that size.
    assert.equal(await inPage(`getComputedStyle(document.querySelector('.bc-field__input')).height`), '36px');
  } finally { browser.kill(); await h.close?.(); }
});

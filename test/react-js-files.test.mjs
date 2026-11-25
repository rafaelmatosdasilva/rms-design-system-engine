// A React system that writes its components in .js files, read and drawn as one that writes .jsx (reactFile in
// component-source.mjs). Drawn with Create React App's build, which compiles JSX in .js files, as most such systems are built:
//   npm ci --prefix test/.cra-tools
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, readdirSync, renameSync, writeFileSync, symlinkSync, rmSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeComponents, reactFile } from '../lib/component-source.mjs';
import { startReactHarness } from '../lib/react-harness.mjs';
import { findChrome, launchChrome, connectCDP, openPage, waitForTrue } from '../lib/cdp.mjs';
import { budget, tempDir } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const TOOLS = join(ENGINE, 'test', '.cra-tools', 'node_modules');
const CHROME = findChrome({ playwright: true });
const READY = CHROME && typeof WebSocket !== 'undefined' && existsSync(join(TOOLS, 'react-scripts')) ? false : 'no Chrome, or no Create React App tools (npm ci --prefix test/.cra-tools)';

test('a .js file is React\'s when it returns JSX and is no class component', () => {
  assert.equal(reactFile('Button.js', 'export function Button() { return <button className="b" />; }'), true);
  assert.equal(reactFile('Button.js', 'export const Button = () => (\n  <button />\n);'), true);
  assert.equal(reactFile('math.js', 'export const less = (a, b) => { if (a < b) return a; };'), false, 'a comparison is no JSX');
  assert.equal(reactFile('acme-button.js', 'import { LitElement, html } from "lit"; export class AcmeButton extends LitElement { render() { return html`<button></button>`; } }'), false, 'a Lit component is not React');
  assert.equal(reactFile('Button.test.js', 'it("x", () => <Button />);'), false, 'a test file is no component');
  assert.equal(reactFile('Card.tsx'), true);
});

// Beacon, the React fixture, with its components in .js files, built as a Create React App app.
function beaconJs() {
  const dir = tempDir('react-js-');
  cpSync(join(ENGINE, 'test', 'fixtures', 'beacon-react'), dir, { recursive: true });
  rmSync(join(dir, 'vite.config.js'), { force: true });
  for (const f of readdirSync(join(dir, 'src', 'components')).filter((f) => f.endsWith('.jsx'))) renameSync(join(dir, 'src', 'components', f), join(dir, 'src', 'components', f.replace(/\.jsx$/, '.js')));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'beacon-react', private: true, dependencies: { react: '18', 'react-dom': '18', 'react-scripts': '5.0.1' }, browserslist: ['last 1 chrome version'] }));
  mkdirSync(join(dir, 'public'), { recursive: true });
  writeFileSync(join(dir, 'public', 'index.html'), '<!doctype html><div id="root"></div>\n');
  writeFileSync(join(dir, 'src', 'index.js'), 'export {};\n');
  return dir;
}

test('its components are found in .js files, as in .jsx', () => {
  const dir = beaconJs();
  const names = codeComponents(dir, {}).map((k) => k.name).sort();
  assert.deepEqual(names, ['CardTile', 'Disclosure', 'FieldSize', 'MenuSheet']);
});

test('and drawn by its own React, with their state', { skip: READY, timeout: budget(300000) }, async () => {
  const dir = beaconJs();
  symlinkSync(TOOLS, join(dir, 'node_modules'), 'dir');
  const names = ['Disclosure', 'FieldSize', 'MenuSheet', 'CardTile'];
  const h = await startReactHarness(dir, { name: 'Beacon', paths: { themeCSS: 'src/styles/tokens.css' } }, names, { locate: (n) => join(dir, 'src', 'components', `${n}.js`) });
  assert.ok(h.url, h.why);
  assert.equal(h.groups.length, 4);
  const browser = await launchChrome(CHROME, { tmpPrefix: 'dse-reactjs-' });
  try {
    const { send } = await connectCDP(browser.wsUrl);
    const { sessionId } = await openPage(send, h.url);
    await waitForTrue(send, sessionId, 'window.__dseHarnessReady === true', { attempts: 1200, intervalMs: 50, tolerateErrors: true });
    const inPage = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }, sessionId)).result?.value;
    assert.deepEqual(JSON.parse(await inPage('JSON.stringify(window.__dseHarnessFailed)')), []);
    assert.equal(await inPage(`(async () => { const b = document.querySelector('.bc-disclosure__summary'); b.click(); await new Promise((r) => setTimeout(r, 200)); return b.getAttribute('aria-expanded'); })()`), 'true');
  } finally { browser.kill(); await h.close?.(); }
});

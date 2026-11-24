// A React design system drawn as Vue's is (vue-builds.test.mjs): by the project's own build whichever it is, and checked in every variant
// beside its style guide, not only when it has none.
//
// The React tests use the builds a React project has installed, laid in a gitignored folder as CI does:
//   npm ci --prefix test/.react-tools
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startReactHarness, reactBuild, renderedReact } from '../lib/react-harness.mjs';
import { readsJsx } from '../lib/vue-harness.mjs';
import { findChrome, launchChrome, connectCDP, openPage, waitForTrue } from '../lib/cdp.mjs';
import { budget, tempDir } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const FIXTURE = join(ENGINE, 'test', 'fixtures', 'beacon-react');
const TOOLS = join(ENGINE, 'test', '.react-tools', 'node_modules');
const CHROME = findChrome({ playwright: true });
const HAS = (m) => existsSync(join(TOOLS, m));
const READY = CHROME && typeof WebSocket !== 'undefined' && HAS('vite') && HAS('react') && HAS('webpack') && HAS('babel-loader')
  ? false : 'no Chrome, or no React build tools (npm ci --prefix test/.react-tools)';
const NAMES = ['Disclosure', 'FieldSize', 'MenuSheet', 'CardTile'];
const CFG = { name: 'Beacon', paths: { themeCSS: 'src/styles/tokens.css' } };
const locate = (dir) => (n) => join(dir, 'src', 'components', `${n}.jsx`);

// Beacon, the invented React system, with its packages installed.
const beacon = (prefix) => {
  const dir = tempDir(prefix);
  cpSync(FIXTURE, dir, { recursive: true });
  symlinkSync(TOOLS, join(dir, 'node_modules'), 'dir');
  return dir;
};

// The same system built the way a React app without Vite is: its own webpack config, JSX compiled by Babel, each
// component's CSS imported and put on the page by style-loader.
const WEBPACK_CONFIG = `module.exports = {
  module: { rules: [
    { test: /\\.jsx?$/, exclude: /node_modules/, use: { loader: 'babel-loader', options: { presets: [['@babel/preset-react', { runtime: 'automatic' }]] } } },
    { test: /\\.css$/, use: ['style-loader', 'css-loader'] },
  ] },
  resolve: { extensions: ['.js', '.jsx'] },
};
`;
const beaconWebpack = (prefix) => {
  const dir = beacon(prefix);
  rmSync(join(dir, 'vite.config.js'));
  writeFileSync(join(dir, 'webpack.config.cjs'), WEBPACK_CONFIG);
  return dir;
};

test('a webpack config is read for a rule that compiles JSX, as Vue\'s is for vue-loader', () => {
  assert.equal(readsJsx({ module: { rules: [{ test: /\.jsx?$/, use: 'babel-loader' }] } }), true);
  assert.equal(readsJsx({ module: { rules: [{ test: /\.tsx?$/, loader: 'ts-loader' }] } }), true);
  assert.equal(readsJsx({ module: { rules: [{ test: /\.[jt]sx?$/, use: { loader: 'swc-loader' } }] } }), true);
  assert.equal(readsJsx({ module: { rules: [{ test: /\.css$/, use: ['style-loader', 'css-loader'] }] } }), false, 'a config that only styles cannot draw a component');
  assert.equal(readsJsx({ module: { rules: [{ test: /\.vue$/, use: 'vue-loader' }] } }), false);
});

test('a React project built with webpack is drawn by its webpack, and one without a JSX rule says so', { skip: READY, timeout: budget(60000) }, async () => {
  const dir = beaconWebpack('react-wp-build-');
  const pb = await reactBuild(dir);
  assert.equal(pb.kind, 'webpack', pb.why);
  assert.equal(pb.label, 'webpack');
  writeFileSync(join(dir, 'webpack.config.cjs'), 'module.exports = { module: { rules: [{ test: /\\.css$/, use: ["style-loader", "css-loader"] }] } };\n');
  assert.match((await reactBuild(dir)).why, /no rule that compiles its \.jsx or \.tsx files/);
  // A Vite config still comes first, as it does for Vue: the project builds with it.
  writeFileSync(join(dir, 'vite.config.js'), "import react from '@vitejs/plugin-react';\nexport default { plugins: [react()] };\n");
  assert.equal((await reactBuild(dir)).kind, 'vite');
});

test('state, context and a portal all run when webpack builds the components', { skip: READY, timeout: budget(300000) }, async () => {
  const dir = beaconWebpack('react-wp-real-');
  const h = await startReactHarness(dir, CFG, NAMES, { locate: locate(dir) });
  assert.ok(h.url, h.why);
  assert.equal(h.build, 'webpack');
  const browser = await launchChrome(CHROME, { tmpPrefix: 'dse-react-wp-' });
  try {
    const { send } = await connectCDP(browser.wsUrl);
    const { sessionId } = await openPage(send, h.url);
    assert.ok(await waitForTrue(send, sessionId, 'window.__dseHarnessReady === true', { attempts: 1200, intervalMs: 50, tolerateErrors: true }), 'the page finished');
    const inPage = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)).result?.value;
    assert.deepEqual(JSON.parse(await inPage(`JSON.stringify([...document.querySelectorAll('[data-dse-component]')].map((s) => s.getAttribute('data-dse-component')))`)), NAMES);
    assert.deepEqual(JSON.parse(await inPage('JSON.stringify(window.__dseHarnessFailed)')), [], 'every component drew');
    // The token CSS is the page's own stylesheet, linked, and resolved by the browser as parity reads it.
    assert.equal(await inPage(`getComputedStyle(document.querySelector('.bc-disclosure__summary')).height`), '36px');
    assert.equal(await inPage(`(async () => { const b = document.querySelector('.bc-disclosure__summary'); b.click(); await new Promise((r) => setTimeout(r, 200)); return b.getAttribute('aria-expanded'); })()`), 'true', 'useState runs');
    assert.equal(await inPage(`(async () => { const b = document.querySelector('.bc-menu__button'); b.click(); await new Promise((r) => setTimeout(r, 200)); const s = document.querySelector('.bc-menu__sheet'); return s ? s.parentElement.tagName : 'none'; })()`), 'BODY', 'createPortal runs');
    assert.equal(await inPage(`getComputedStyle(document.querySelector('.bc-field__input')).height`), '36px', 'useContext runs');
  } finally { browser.kill(); await h.close?.(); }
});

test('the style guide is given what webpack drew: each variant\'s markup and the CSS the build added', { skip: READY, timeout: budget(300000) }, async () => {
  const dir = beaconWebpack('react-wp-render-');
  const r = await renderedReact(dir, CFG, NAMES, { locate: locate(dir), chromePath: CHROME, max: 4 });
  assert.equal(r.why, undefined, r.why);
  assert.equal(r.build, 'webpack');
  assert.deepEqual(Object.keys(r.markup).sort(), [...NAMES].sort(), 'every component drew its default');
  assert.match(r.markup.Disclosure, /bc-disclosure__summary/);
  // style-loader's sheets carry no file name, so they are read as every sheet the page did not bring itself.
  assert.match(r.css, /\.bc-disclosure/, 'the components\' own CSS comes back');
  assert.doesNotMatch(r.css, /font:14px system-ui/, 'never the harness page\'s own style');
});

// A Vue system's components were checked in every variant beside its style guide; a React one's only when it had no
// style guide at all, so a React team with a style guide had its components checked only as the guide drew them.
test('a React system with a style guide has its components checked in every variant beside it, as Vue\'s are', { skip: READY, timeout: budget(300000) }, async () => {
  const dir = beacon('react-a11y-beside-');
  const sg = join(dir, '.design-system-engine-out', 'styleguide');
  mkdirSync(sg, { recursive: true });
  writeFileSync(join(sg, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Beacon</title></head><body><main><h1>Beacon</h1></main><script id="sg-data" type="application/json">${JSON.stringify({ components: NAMES.map((name) => ({ name })) })}</script></body></html>`);
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, [join(ENGINE, 'lib', 'a11y-check.mjs'), '--json'], {
    cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', CHROME_PATH: CHROME }, timeout: budget(280000),
  });
  const said = `${r.stdout}\n${r.stderr}`;
  assert.match(said, /target: 4 React component\(s\) rendered with the project's own Vite in each variant/, said.slice(0, 1500));
  assert.match(said, /Disclosure: \d+ from Figma/, 'its variants are Figma\'s, where Figma has them');
  assert.doesNotMatch(said, /drawn by the stand-in/, 'only the project\'s own React draws beside a style guide');
});

// With no component written yet, the code a system is written in comes from what it installs: a React project's new
// component was written as Vue.
test('a React project with no component yet is written in JSX, not Vue', async () => {
  const { codeBuildContext } = await import('../lib/code-build-context.mjs');
  const dir = tempDir('react-none-yet-');
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'acme', private: true, dependencies: { react: '19', 'react-dom': '19' } }));
  assert.equal((await codeBuildContext(dir, {})).framework, 'jsx');
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'acme', private: true, dependencies: { vue: '3' } }));
  assert.equal((await codeBuildContext(dir, {})).framework, 'vue');
});

// A React system built as a Next.js or a Create React App app, drawn by the webpack config its framework makes for it
// (react-apps.mjs), not by the stand-in. The tools such a project has are laid in gitignored folders, as CI does:
//   npm ci --prefix test/.next-tools      npm ci --prefix test/.cra-tools
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, rmSync, symlinkSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startReactHarness, reactBuild } from '../lib/react-harness.mjs';
import { findChrome, launchChrome, connectCDP, openPage, waitForTrue } from '../lib/cdp.mjs';
import { budget, tempDir } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const FIXTURE = join(ENGINE, 'test', 'fixtures', 'beacon-react');
const CHROME = findChrome({ playwright: true });
const NAMES = ['Disclosure', 'FieldSize', 'MenuSheet', 'CardTile'];

// Beacon, the invented React system, laid out as each framework lays out an app: no Vite or webpack config of its own.
const FRAMEWORKS = {
  next: {
    tools: 'next-tools', marker: 'next', label: /^Next\.js 15\./,
    pkg: { dependencies: { next: '15', react: '19', 'react-dom': '19' } },
    files: {
      'next.config.mjs': 'export default {};\n',
      'app/page.jsx': 'export default function Page() { return null; }\n',
      'app/layout.jsx': 'export default function Layout({ children }) { return <html><body>{children}</body></html>; }\n',
    },
  },
  cra: {
    tools: 'cra-tools', marker: 'react-scripts', label: /^Create React App$/,
    pkg: { dependencies: { react: '18', 'react-dom': '18', 'react-scripts': '5.0.1' }, browserslist: ['last 1 chrome version'] },
    files: { 'src/index.js': 'export {};\n', 'public/index.html': '<!doctype html><div id="root"></div>\n' },
  },
};
const ready = (k) => (CHROME && typeof WebSocket !== 'undefined' && existsSync(join(ENGINE, 'test', `.${FRAMEWORKS[k].tools}`, 'node_modules', FRAMEWORKS[k].marker))
  ? false : `no Chrome, or no ${k} tools (npm ci --prefix test/.${FRAMEWORKS[k].tools})`);
function app(k) {
  const f = FRAMEWORKS[k], dir = tempDir(`react-${k}-`);
  cpSync(FIXTURE, dir, { recursive: true });
  rmSync(join(dir, 'vite.config.js'), { force: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'beacon-react', private: true, ...f.pkg }, null, 2));
  for (const [file, text] of Object.entries(f.files)) { mkdirSync(dirname(join(dir, file)), { recursive: true }); writeFileSync(join(dir, file), text); }
  symlinkSync(join(ENGINE, 'test', `.${f.tools}`, 'node_modules'), join(dir, 'node_modules'), 'dir');
  return dir;
}

for (const k of Object.keys(FRAMEWORKS)) {
  test(`${k === 'next' ? 'Next.js' : 'Create React App'}: the build its framework makes draws the components, with state, context and a portal`, { skip: ready(k), timeout: budget(400000) }, async () => {
    const dir = app(k);
    const pb = await reactBuild(dir);
    assert.equal(pb.kind, 'webpack', pb.why);
    assert.match(pb.label, FRAMEWORKS[k].label);
    const h = await startReactHarness(dir, { name: 'Beacon', paths: { themeCSS: 'src/styles/tokens.css' } }, NAMES, { locate: (n) => join(dir, 'src', 'components', `${n}.jsx`) });
    assert.ok(h.url, h.why);
    assert.match(h.build, FRAMEWORKS[k].label);
    const browser = await launchChrome(CHROME, { tmpPrefix: `dse-${k}-` });
    try {
      const { send } = await connectCDP(browser.wsUrl);
      const { sessionId } = await openPage(send, h.url);
      await waitForTrue(send, sessionId, 'window.__dseHarnessReady === true', { attempts: 1200, intervalMs: 50, tolerateErrors: true });
      const inPage = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)).result?.value;
      assert.deepEqual(JSON.parse(await inPage('JSON.stringify(window.__dseHarnessFailed)')), [], 'every component drew');
      assert.equal(await inPage(`getComputedStyle(document.querySelector('.bc-disclosure__summary')).height`), '36px', 'the project\'s own token, resolved');
      // useState: it opens. createPortal: the sheet is drawn into the page's body.
      assert.equal(await inPage(`(async () => { const b = document.querySelector('.bc-disclosure__summary'); b.click(); await new Promise((r) => setTimeout(r, 200)); return b.getAttribute('aria-expanded'); })()`), 'true');
      assert.equal(await inPage(`(async () => { document.querySelector('.bc-menu__button').click(); await new Promise((r) => setTimeout(r, 200)); const s = document.querySelector('.bc-menu__sheet'); return s ? s.parentElement.tagName : 'none'; })()`), 'BODY');
      // useContext: a field reads its default size where no form says otherwise.
      assert.equal(await inPage(`getComputedStyle(document.querySelector('.bc-field__input')).height`), '36px');
    } finally { browser.kill(); await h.close?.(); }
  });
}

test('a Next.js or Create React App project with its framework missing is said, never drawn by a guess', async () => {
  const { appBuild } = await import('../lib/react-apps.mjs');
  const dir = tempDir('react-noframework-');
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { next: '15' } }));
  assert.match((await appBuild(dir)).why, /Next\.js app with no next package installed/);
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { 'react-scripts': '5.0.1' } }));
  assert.match((await appBuild(dir)).why, /Create React App app with no react-scripts installed/);
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { react: '19' } }));
  assert.equal(await appBuild(dir), null, 'neither framework: the other builds are asked');
});

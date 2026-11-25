// A React system's components given what its own app gives them (react-app-context.mjs): the providers its entry and
// its Storybook preview wrap it in, and the lists its own pages pass. Drawn with the project's own React:
//   npm ci --prefix test/.react-tools
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appProviders, reactPageSamples, wrappersIn } from '../lib/react-app-context.mjs';
import { startReactHarness } from '../lib/react-harness.mjs';
import { findChrome, launchChrome, connectCDP, openPage, waitForTrue } from '../lib/cdp.mjs';
import { budget, tempDir } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const TOOLS = join(ENGINE, 'test', '.react-tools', 'node_modules');
const CHROME = findChrome({ playwright: true });
const READY = CHROME && typeof WebSocket !== 'undefined' && existsSync(join(TOOLS, 'vite')) && existsSync(join(TOOLS, 'react')) ? false : 'no Chrome, or no React build tools (npm ci --prefix test/.react-tools)';

// Acme, an invented React system: a badge that needs its app's theme, a list that needs its page's rows, and a tag
// that needs the density its Storybook preview gives.
const FILES = {
  'package.json': JSON.stringify({ name: 'acme-react', private: true, type: 'module', dependencies: { react: '19', 'react-dom': '19' }, devDependencies: { vite: '8', '@vitejs/plugin-react': '6' } }),
  'src/theme.jsx': `import { createContext, useContext } from 'react';
const ThemeContext = createContext(null);
export function ThemeProvider({ theme, children }) { return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>; }
export function useTheme() { const t = useContext(ThemeContext); if (!t) throw new Error('useTheme outside ThemeProvider'); return t; }
`,
  'src/density.jsx': `import { createContext, useContext } from 'react';
const Density = createContext(null);
export const DensityProvider = ({ value, children }) => <Density.Provider value={value}>{children}</Density.Provider>;
export const useDensity = () => { const d = useContext(Density); if (!d) throw new Error('useDensity outside DensityProvider'); return d; };
`,
  'src/components/Badge.jsx': `import { useTheme } from '../theme.jsx';
export function Badge({ label = 'New' }) { const t = useTheme(); return <span className="acme-badge" style={{ color: t.accent }}>{label}</span>; }
`,
  'src/components/RowList.jsx': `export default function RowList({ rows }) { return <ul className="acme-rows">{rows.map((r) => <li key={r.title}>{r.title}</li>)}</ul>; }
`,
  'src/components/Tag.jsx': `import { useDensity } from '../density.jsx';
export function Tag() { const d = useDensity(); return <span className="acme-tag" data-density={d}>Tag</span>; }
`,
  'src/main.jsx': `import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from './theme.jsx';
import App from './App.jsx';
const brand = { accent: 'rgb(9, 8, 7)' };
createRoot(document.getElementById('root')).render(<StrictMode><ThemeProvider theme={brand}><App /></ThemeProvider></StrictMode>);
`,
  'src/App.jsx': 'export default function App() { return null; }\n',
  'src/pages/Rows.jsx': `import RowList from '../components/RowList.jsx';
const rows = [{ title: 'Row one' }, { title: 'Row two' }];
export default function Rows() { return <section><RowList rows={rows} /></section>; }
`,
  '.storybook/preview.jsx': `import { DensityProvider } from '../src/density.jsx';
export default { decorators: [(Story) => <DensityProvider value="compact"><Story /></DensityProvider>] };
`,
};
function acme() {
  const dir = tempDir('react-ctx-');
  for (const [f, text] of Object.entries(FILES)) { mkdirSync(dirname(join(dir, f)), { recursive: true }); writeFileSync(join(dir, f), text); }
  return dir;
}

test('the providers an entry and a Storybook preview wrap the app in, read as text, never page elements or StrictMode', () => {
  assert.deepEqual(wrappersIn(FILES['src/main.jsx']).map((w) => w.name), ['StrictMode', 'ThemeProvider']);
  assert.deepEqual(wrappersIn(FILES['src/main.jsx'])[1].attrs, [{ name: 'theme', value: 'brand' }]);
  assert.deepEqual(wrappersIn('<html><body><Providers session={s}>{children}</Providers></body></html>').map((w) => w.name), ['html', 'body', 'Providers']);
  const dir = acme();
  const app = appProviders(dir);
  assert.deepEqual(app.providers, [{ name: 'ThemeProvider', from: 'src/main.jsx' }, { name: 'DensityProvider', from: '.storybook/preview.jsx' }]);
  assert.deepEqual(app.left, []);
  // A provider whose props lean on a name nothing in its file binds is left out and said, never guessed at.
  writeFileSync(join(dir, 'src/main.jsx'), FILES['src/main.jsx'].replace('theme={brand}', 'theme={fromNowhere}'));
  const missing = appProviders(dir);
  assert.deepEqual(missing.left, [{ name: 'ThemeProvider', from: 'src/main.jsx', why: 'fromNowhere is not imported in src/main.jsx nor declared there' }]);
});

test('the lists a project\'s own pages pass a component, read as data and never run', () => {
  const dir = acme();
  assert.deepEqual(reactPageSamples(dir), { [join(dir, 'src/components/RowList.jsx')]: { rows: [{ title: 'Row one' }, { title: 'Row two' }] } });
  writeFileSync(join(dir, 'src/pages/Rows.jsx'), FILES['src/pages/Rows.jsx'].replace("const rows = [{ title: 'Row one' }, { title: 'Row two' }];", 'const rows = loadRows();'));
  assert.deepEqual(reactPageSamples(dir), {}, 'code is never run to get one');
});

test('drawn inside the app\'s providers and with its pages\' data, a component that needs them draws', { skip: READY, timeout: budget(300000) }, async () => {
  const dir = acme();
  symlinkSync(TOOLS, join(dir, 'node_modules'), 'dir');
  const names = ['Badge', 'RowList', 'Tag'];
  const h = await startReactHarness(dir, { name: 'Acme' }, names, { locate: (n) => join(dir, 'src', 'components', `${n}.jsx`) });
  assert.ok(h.url, h.why);
  assert.deepEqual(h.providers.map((p) => p.name), ['ThemeProvider', 'DensityProvider']);
  const browser = await launchChrome(CHROME, { tmpPrefix: 'dse-ctx-' });
  try {
    const { send } = await connectCDP(browser.wsUrl);
    const { sessionId } = await openPage(send, h.url);
    await waitForTrue(send, sessionId, 'window.__dseHarnessReady === true', { attempts: 1200, intervalMs: 50, tolerateErrors: true });
    const inPage = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }, sessionId)).result?.value;
    assert.deepEqual(JSON.parse(await inPage('JSON.stringify(window.__dseHarnessFailed)')), [], 'every component drew');
    assert.equal(await inPage(`getComputedStyle(document.querySelector('.acme-badge')).color`), 'rgb(9, 8, 7)', 'the theme its app gives it');
    assert.equal(await inPage(`document.querySelectorAll('.acme-rows li').length`), 2, 'the rows its page passes it');
    assert.equal(await inPage(`document.querySelector('.acme-tag').getAttribute('data-density')`), 'compact', 'the density its preview gives it');
  } finally { browser.kill(); await h.close?.(); }
});

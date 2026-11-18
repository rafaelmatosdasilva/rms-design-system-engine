// Parity in every mode and the Playground on a React system drawn with the project's own React, not a stand-in.
//
// Beacon (test/fixtures/beacon-react) with Figma's side laid over it (test/fixtures/beacon-react-parity): a dark mode,
// Figma's variables and structure. Its components need real React - state, a context, a portal, a ref - and are drawn
// with the React and Vite pinned here, the way CI installs them:
//   npm ci --prefix test/.react-tools
//
// Deliberate differences, and nothing else:
//   • the tile rounds its corners with --bc-radius-m (6px) where Figma says radius/l (8px)
//   • in the dark theme only, a rule of its own fills the menu button with the ink and writes it in the surface colour:
//     Figma keeps the surface fill and the ink text there. The base rule names Figma's variables, so only the dark
//     reading of what React drew can see it.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, symlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findChrome } from '../lib/cdp.mjs';
import { readPage } from '../lib/styleguide-files.mjs';
import { budget, fixtureProject } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const FIXTURE = join(ENGINE, 'test', 'fixtures', 'beacon-react');
const OVERLAY = join(ENGINE, 'test', 'fixtures', 'beacon-react-parity');
const TOOLS = join(ENGINE, 'test', '.react-tools', 'node_modules');
const CHROME = findChrome({ playwright: true });
const READY = CHROME && typeof WebSocket !== 'undefined' && existsSync(join(TOOLS, 'vite')) && existsSync(join(TOOLS, 'react'))
  ? false : 'no Chrome, or no React build tools (npm ci --prefix test/.react-tools)';

const beacon = (prefix) => {
  const dir = fixtureProject(FIXTURE, prefix, { overlay: OVERLAY });
  symlinkSync(TOOLS, join(dir, 'node_modules'), 'dir');
  return dir;
};
const run = (dir, script, args = []) => spawnSync(process.execPath, [join(ENGINE, 'lib', script), ...args], {
  cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', CHROME_PATH: CHROME }, timeout: budget(280000) });

// Captured and audited once, as a team's CI would, and read by the parity tests below.
let dir = null, captured = null, snap = null, audit = null;
before(() => {
  if (READY) return;
  dir = beacon('react-parity-');
  captured = run(dir, 'code-capture.mjs', ['--force']);
  snap = JSON.parse(readFileSync(join(dir, '.design-system-engine-out', 'code.snapshot.json'), 'utf8'));
  audit = run(dir, 'audit.mjs');
});

test('parity measures each React component as the project\'s own React draws it, in every mode', { skip: READY, timeout: budget(900000) }, () => {
  assert.equal(captured.status, 0, `${captured.stdout}\n${captured.stderr}`.slice(0, 1500));
  assert.doesNotMatch(captured.stdout, /browser reading failed/);
  for (const name of ['disclosure', 'fieldSize', 'menuSheet', 'cardTile']) assert.equal(snap.components[name].instance?.page, 'React · components', name);
  // The field's size comes from a context, which only React runs: drawn at Figma's height, the CSS and the browser agreeing.
  assert.equal(snap.components.fieldSize.props.height.value, '36px');
  assert.equal(snap.components.fieldSize.props.height.confidence, 'verified');
  // Both modes read on what React drew: the dark rule of the menu button is there only in dark.
  assert.equal(snap.components.menuSheet.colors.light.backgroundColor, 'rgb(255, 255, 255)');
  assert.equal(snap.components.menuSheet.colors.dark.backgroundColor, 'rgb(236, 240, 243)');
});

test('the parity check names exactly the deliberate differences: one in every mode, two only in dark', { skip: READY, timeout: budget(900000) }, () => {
  const said = audit.stdout;
  const measured = said.split('\n').filter((l) => /^\s+⚠️ {2}\w+ .*: Figma .*, rendered /.test(l)).map((l) => l.trim());
  // What gate 13 said, whole, when it is not what is asked: its measured part is read from the capture, so a failure
  // here is most often the capture, and the section says which.
  const gate13 = said.slice(said.indexOf('[13] Structure'), said.indexOf('[14] All states')).slice(0, 4000);
  assert.equal(measured.length, 3, `${measured.join('\n')}\n--- gate 13 ---\n${gate13}\n--- capture ---\n${captured.stdout.slice(0, 1500)}`);
  assert.match(measured.find((l) => l.includes('cardTile radius')) ?? '', /Figma radius\/l \(8px\), rendered 6px via --bc-radius-m .*→ set var\(--bc-radius-l\)/);
  assert.match(measured.find((l) => l.includes('menuSheet background [dark]')) ?? '', /Figma surface\/color \(#10161b\), rendered rgb\(236, 240, 243\) .*a rule for dark draws another colour over it: give that rule var\(--bc-surface\)/);
  assert.match(measured.find((l) => l.includes('menuSheet text colour [dark]')) ?? '', /Figma ink\/color \(#ecf0f3\), rendered rgb\(16, 22, 27\)/);
  assert.doesNotMatch(said, /⚠️ {2}(disclosure|fieldSize) /, 'the components that match Figma in both modes are not named');
});

// The Playground draws each variant as React drew it, read back from the page the project's own React drew, and a
// variant chosen there is the markup React gave for it.
test('the Playground draws React components with the project\'s own React, each variant as it drew', { skip: READY, timeout: budget(600000) }, async () => {
  const sg = beacon('react-playground-');
  writeFileSync(join(sg, 'src', 'components', 'Badge.jsx'), `export function Badge({ tone = 'Neutral', label = 'New' }) {
  return <span className={\`bc-badge bc-badge--\${tone.toLowerCase()}\`}>{tone === 'Danger' ? <span className="bc-badge__icon" aria-hidden="true">!</span> : null}{label}</span>;
}
`);
  const props = join(sg, 'figma', 'props.snapshot.json');
  writeFileSync(props, JSON.stringify({ ...JSON.parse(readFileSync(props, 'utf8')), badge: { nodeId: '1:5', properties: { tone: { type: 'VARIANT', defaultValue: 'Neutral', variantOptions: ['Neutral', 'Danger'] }, 'label#1:0': { type: 'TEXT', defaultValue: 'New' } } } }, null, 2));
  const cfgPath = join(sg, 'ds-config.json');
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
  writeFileSync(cfgPath, JSON.stringify({ ...cfg, componentFiles: { ...cfg.componentFiles, badge: 'src/components/Badge.jsx' }, componentSelectors: { ...cfg.componentSelectors, badge: '.bc-badge' } }, null, 2));

  const r = run(sg, 'audit.mjs', ['--styleguide', '--no-a11y-bake']);
  assert.equal(r.status === 0 || r.status === 1, true, `${r.stdout}\n${r.stderr}`.slice(-2000));
  assert.match(r.stdout, /5 of 5 React components drawn with the project's own React\./, r.stdout.slice(0, 2000));
  const file = join(sg, '.design-system-engine-out', 'styleguide', 'index.html');
  const data = JSON.parse(readPage(file).match(/id="sg-data">([\s\S]*?)<\/script>/)[1]);
  const badge = data.components.find((c) => c.name === 'badge');
  assert.ok(badge.renders?.some((x) => x.props.tone === 'Danger' && /bc-badge__icon/.test(x.markup)), JSON.stringify(badge.renders));

  const { launchChrome, connectCDP, openPage, waitForTrue, FILE_PAGE_LOADED } = await import('../lib/cdp.mjs');
  const c = await launchChrome(CHROME);
  try {
    const { send, close } = await connectCDP(c.wsUrl);
    const { sessionId } = await openPage(send, `file://${file}#c-badge?tone=Danger`);
    await waitForTrue(send, sessionId, FILE_PAGE_LOADED);
    const inPage = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true }, sessionId)).result.value;
    const drawn = async (name) => { let h = ''; for (let n = 0; n < 100 && !h; n++) { if (n) await new Promise((res) => setTimeout(res, 100)); h = await inPage(`(document.querySelector('#c-${name} .pg-preview') || {}).innerHTML || ''`); } return h; };
    assert.match(await drawn('badge'), /class="bc-badge__icon"/, 'Danger, as React drew it: with its icon');
    await inPage(`location.hash = '#c-badge?tone=Neutral'`); await new Promise((res) => setTimeout(res, 400));
    assert.doesNotMatch(await drawn('badge'), /bc-badge__icon/);
    // The field's size class is what its context gave it: only React runs a context, and its JSX alone says nothing.
    await inPage(`location.hash = '#c-fieldSize'`); await new Promise((res) => setTimeout(res, 400));
    assert.match(await drawn('fieldSize'), /class="bc-field bc-field--medium"/);
    close();
  } finally { c.kill(); }
});

// A design system's React components drawn with the project's own React, not a stand-in for it.
//
// The React tests use the build a React project has installed, laid in a gitignored folder as CI does:
//   npm ci --prefix test/.react-tools
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, readFileSync, symlinkSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startReactHarness, reactBuild, harnessModule, styleSpecifier, partOf, storyArgs } from '../lib/react-harness.mjs';
import { codeComponents, rendersNothingOfItsOwn } from '../lib/component-source.mjs';
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
const NAMES = ['Disclosure', 'FieldSize', 'MenuSheet', 'CardTile'];
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
  // The page's script is written as text: one stray quote in it and nothing at all draws, with no error to read.
  assert.doesNotThrow(() => new Function(mod.replace(/^import .*$/gm, '').replace(/\bawait\b/g, '')), 'the page module parses');
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
    // forwardRef gives an object, not a function: a reader that takes only functions calls this "no component
    // exported", which is most of a real system (found on one).
    assert.equal(await inPage(`Boolean(document.querySelector('[data-dse-component="CardTile"] .bc-card'))`), true, 'a component behind forwardRef draws like any other');

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

// Drawing with real React is only half of it: the checks have to be the ones reading it. This runs the accessibility
// check itself against the React fixture and asserts it drew with the project's own React, not the stand-in - the
// wiring, not the harness.
test('the accessibility check reads the components React drew, and says which drew them', { skip: READY, timeout: budget(300000) }, async () => {
  const dir = beacon('react-a11y-');
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, [join(ENGINE, 'lib', 'a11y-check.mjs'), '--json'], {
    cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', CHROME_PATH: CHROME }, timeout: budget(280000),
  });
  const said = `${r.stdout}\n${r.stderr}`;
  assert.match(said, /drawn with the project's own React/, said.slice(0, 600));
  assert.doesNotMatch(said, /drawn by the stand-in/, 'the stand-in is for a project with no React, and this one has React');
});

// Everything below was found by running this against a real public design system, and none of it could have been
// found on a fixture written by the same hand as the harness.
test("a stylesheet inside a package is asked for by the package's name, which is how a published system ships tokens", () => {
  assert.equal(styleSpecifier('/node_modules/@acme/primitives/dist/tokens.css'), '@acme/primitives/dist/tokens.css');
  assert.equal(styleSpecifier('node_modules/@acme/primitives/dist/tokens.css'), '@acme/primitives/dist/tokens.css');
  assert.equal(styleSpecifier('/src/styles/tokens.css'), '/src/styles/tokens.css', "the project's own keeps its path");
  assert.equal(styleSpecifier('/src/node_modules_notes.css'), '/src/node_modules_notes.css', 'and a path that merely reads like one is left alone');
});

test('the build is given what a real React system needs: its dependencies converted, and the flag they are written against', () => {
  const mod = harnessModule([], []);
  assert.ok(mod.includes("from 'react-dom/client'"));
  // __DEV__ and the dependency conversion live in the server options, not the module: asserted where they are set.
  const src = readFileSync(join(ENGINE, 'lib', 'react-harness.mjs'), 'utf8');
  assert.match(src, /define: \{ __DEV__/, 'a component that mentions __DEV__ throws before it draws without it');
  assert.match(src, /optimizeDeps: \{ include/, 'and a CommonJS dependency has no named exports until it is converted');
  assert.doesNotMatch(src, /noDiscovery: true/, 'a package a dependency imports is in no project source, so Vite finds those itself');
});

// A published React library names its components nowhere the engine used to read: no Figma capture, no structure
// contract, no selectors. Run against one, every browser check said "no render targets" about a system with hundreds
// of components. Its own code names them, and that is the layout React systems use.
test('a system that names its components nowhere else still names them in its code', () => {
  const dir = tempDir('react-list-');
  const put = (f, t) => { mkdirSync(dirname(join(dir, f)), { recursive: true }); writeFileSync(join(dir, f), t); };
  put('src/components/Button/Button.tsx', 'export function Button() { return <button className="ac-button" />; }');
  put('src/components/Button/Button.stories.tsx', 'export default { title: "Button" };');
  put('src/components/Banner/Banner.tsx', 'export const Banner = () => <div role="status" />;');
  put('src/components/Avatar/Avatar.jsx', 'export function Avatar() { return <img alt="" />; }');
  // Things that render nothing of their own: a context, a provider, a flag holder. Not components.
  put('src/components/Theme/ThemeProvider.tsx', 'const C = createContext(null);\nexport function ThemeProvider({ children }) { return <C.Provider value={1}>{children}</C.Provider>; }');
  put('src/components/Flags/FeatureFlags.tsx', 'export function FeatureFlags({ children }) { const f = useFlags(); return <>{children}</>; }');
  const names = codeComponents(dir, {}).map((k) => k.name);
  assert.deepEqual(names.sort(), ['Avatar', 'Banner', 'Button'],
    'its own components, never a story, a provider or a flag holder; one list for the pages and the browser checks alike, with no cap');
});

test('a file that draws nothing of its own is not a component, and one that draws anything is', () => {
  assert.equal(rendersNothingOfItsOwn('export const Ctx = createContext(null);'), true);
  assert.equal(rendersNothingOfItsOwn('export function P({ children }) { return <Ctx.Provider value={v}>{children}</Ctx.Provider>; }'), true);
  assert.equal(rendersNothingOfItsOwn('export function M({ children }) { return useMedia("(min-width: 1px)") ? children : null; }'), true);
  assert.equal(rendersNothingOfItsOwn('export function B() { return <button />; }'), false);
  assert.equal(rendersNothingOfItsOwn('export function Card() { return <Box><Heading /></Box>; }'), false, 'one made of other components is one');
  assert.equal(rendersNothingOfItsOwn('export const Link = styled.a`color: red`;'), false);
});

test('a part is drawn inside the component it belongs to, by the way compound parts are named', () => {
  assert.equal(partOf('ActionListItem', ['ActionList', 'Action', 'Item']), 'ActionList', 'the longest name it begins with');
  assert.equal(partOf('AutocompleteOption', ['Autocomplete']), 'Autocomplete');
  assert.equal(partOf('Buttonish', ['Button']), null, 'only at a word\'s start');
  assert.equal(partOf('Button', ['Button']), null);
});

// Found on a public system: a component that throws as React draws it, after render() has returned, left an empty
// box and no reason, and a part written for its parent's context threw outside it.
test('what React threw while drawing is said, a part is drawn inside its parent, and one that drew nothing says so', { skip: READY, timeout: budget(300000) }, async () => {
  const dir = beacon('react-why-');
  const put = (n, t) => writeFileSync(join(dir, 'src', 'components', `${n}.jsx`), t);
  put('ChoiceList', `import { createContext } from 'react';\nexport const ChoiceCtx = createContext(null);\nexport function ChoiceList({ children }) { return <ul className="bc-choices"><ChoiceCtx.Provider value="x">{children}</ChoiceCtx.Provider></ul>; }`);
  put('ChoiceListItem', `import { useContext } from 'react';\nimport { ChoiceCtx } from './ChoiceList.jsx';\nexport function ChoiceListItem() { if (!useContext(ChoiceCtx)) throw new Error('ChoiceListItem must be inside a ChoiceList'); return <li className="bc-choice">One</li>; }`);
  put('Broken', `export function Broken() { throw new Error('needs a value it was not given'); }`);
  put('Closed', `export function Closed({ open = false }) { return open ? <div role="dialog" /> : null; }`);
  // Draws nothing without the keys it shows; its story gives them.
  put('KeyHint', `export function KeyHint({ keys = [] }) { return keys.length ? <kbd className="bc-keys">{keys.join(' + ')}</kbd> : null; }`);
  writeFileSync(join(dir, 'src', 'components', 'KeyHint.stories.jsx'), "export default { title: 'KeyHint' };\nexport const Default = { args: { keys: ['Mod', 'K'] } };\n");
  const names = ['ChoiceList', 'ChoiceListItem', 'Broken', 'Closed', 'KeyHint'];
  const h = await startReactHarness(dir, { name: 'Beacon', paths: { themeCSS: 'src/styles/tokens.css' } }, names, { locate: locate(dir) });
  assert.ok(h.url, h.why);
  const browser = await launchChrome(CHROME, { tmpPrefix: 'dse-react-' });
  try {
    const { send } = await connectCDP(browser.wsUrl);
    const { sessionId } = await openPage(send, h.url);
    await waitForTrue(send, sessionId, 'window.__dseHarnessReady === true', { attempts: 1200, intervalMs: 50, tolerateErrors: true });
    const inPage = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true }, sessionId)).result?.value;
    const failed = JSON.parse(await inPage('JSON.stringify(window.__dseHarnessFailed)'));
    const of = (n) => failed.filter((f) => f.component === n);
    assert.equal(of('ChoiceListItem').length, 0, 'the part drew, inside its parent: ' + JSON.stringify(failed));
    assert.equal(await inPage(`document.querySelector('[data-dse-component="ChoiceListItem"] [data-dse-case]').getAttribute('data-dse-inside') + ':' + Boolean(document.querySelector('[data-dse-component="ChoiceListItem"] .bc-choices .bc-choice'))`), 'ChoiceList:true');
    assert.match(of('Broken')[0]?.why ?? '', /needs a value it was not given/, 'what it threw while React drew it is said');
    assert.match(of('Closed')[0]?.why ?? '', /drew nothing/, 'and one that drew nothing says so, not a blank box');
    assert.equal(of('Closed')[0]?.nothing, true);
    assert.equal(of('KeyHint').length, 0, 'one that needs content draws with its stories\' props');
    assert.equal(await inPage(`document.querySelector('[data-dse-component="KeyHint"] [data-dse-case]').getAttribute('data-dse-example') + ':' + document.querySelector('[data-dse-component="KeyHint"] .bc-keys')?.textContent`), 'Default:Mod + K');
  } finally { browser.kill(); await h.close?.(); }
});

test("a component's example props are its stories' args, read as text: the meta's under the first story's", () => {
  const dir = tempDir('story-args-');
  writeFileSync(join(dir, 'Hint.tsx'), '');
  writeFileSync(join(dir, 'Hint.stories.tsx'), "export default { component: Hint, args: { size: 'small' } };\nexport const Default = { args: { keys: ['Mod', 'K'], onPress: () => {} } };\nexport const Other = { args: { keys: ['X'] } };\n");
  assert.deepEqual(storyArgs(join(dir, 'Hint.tsx'), 'Hint'), { args: { size: 'small', keys: ['Mod', 'K'] }, story: 'Default' }, 'a handler is code, and left out');
  writeFileSync(join(dir, 'Hint.stories.tsx'), "export default { component: Hint };\nexport const Basic = Template.bind({});\nBasic.args = { keys: ['A'] };\n");
  assert.deepEqual(storyArgs(join(dir, 'Hint.tsx'), 'Hint'), { args: { keys: ['A'] }, story: 'Basic' }, 'and the older form, args given after');
  assert.equal(storyArgs(join(dir, 'None.tsx'), 'None'), null);
});

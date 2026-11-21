// A team's own stories as the pages the browser checks run on. Nothing here starts Storybook: the index is given in,
// which is the same shape whether it came from a static build or a running server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { componentOf, storiesByComponent, storyUrl, pagesFor, storyLines, spread, targetsFor, variantOf, figmaPropertiesOf, storyStateLines, staticBuild, serveStatic, STORY_READY, isDefaultVariant, sameComponent } from '../lib/storybook-stories.mjs';
import { tempDir } from './helpers.mjs';
import { slashed } from '../lib/shown-path.mjs';

// What Storybook 7 and later publishes as index.json. Each entry is one story: one component in one state.
const INDEX_JSON = { v: 5, entries: {
  'components-button--primary': { id: 'components-button--primary', title: 'Components/Button', name: 'Primary', type: 'story', componentPath: './src/Button.tsx' },
  'components-button--disabled': { id: 'components-button--disabled', title: 'Components/Button', name: 'Disabled', type: 'story', componentPath: './src/Button.tsx' },
  'components-button--docs': { id: 'components-button--docs', title: 'Components/Button', name: 'Docs', type: 'docs' },
  'forms-field--with-error': { id: 'forms-field--with-error', title: 'Components/Forms/Field', name: 'With error', type: 'story' },
} };
// What Storybook 6 published instead, with kind instead of title and no type.
const STORIES_JSON = { v: 3, stories: {
  'components-button--primary': { id: 'components-button--primary', kind: 'Components/Button', name: 'Primary' },
} };

test('the component a story is about is how Storybook itself groups it, never a name this invents', () => {
  assert.equal(componentOf({ title: 'Components/Forms/Field' }), 'Field');
  assert.equal(componentOf({ kind: 'Components/Button' }), 'Button', 'Storybook 6 wrote kind');
  assert.equal(componentOf({ title: 'Button' }), 'Button');
  assert.equal(componentOf({}), null);
});

// This is the whole reason stories beat the drawn canvas: the team has already said which states matter.
test('every state is its own page, kept under its component and named as the team named it', () => {
  const by = storiesByComponent(INDEX_JSON);
  assert.deepEqual(Object.keys(by).sort(), ['Button', 'Field']);
  assert.deepEqual(by.Button.map((s) => s.state), ['Primary', 'Disabled'], 'two states, not one component');
  assert.equal(by.Button.length, 2, 'the docs page is not a story');
  assert.equal(by.Field[0].state, 'With error');
  assert.match(slashed(by.Button[0].file), /src\/Button\.tsx$/);
  assert.deepEqual(storiesByComponent(STORIES_JSON).Button.map((s) => s.state), ['Primary'], 'stories.json reads the same');
  assert.deepEqual(storiesByComponent({}), {}, 'an index with nothing in it is nothing, never a crash');
});

test('the page of one story is its own iframe, with no Storybook furniture around it', () => {
  assert.equal(storyUrl('http://localhost:6006', 'components-button--primary'),
    'http://localhost:6006/iframe.html?id=components-button--primary&viewMode=story');
  assert.equal(storyUrl('http://localhost:6006/', 'a b'), 'http://localhost:6006/iframe.html?id=a%20b&viewMode=story', 'a trailing slash, and an id that needs escaping');
});

test('a component with no story is named, never dropped: the run checks it as it always did', () => {
  const { pages, without } = pagesFor(['Button', 'Chip', 'Field'], storiesByComponent(INDEX_JSON), 'http://localhost:6006');
  assert.deepEqual(without, ['Chip']);
  assert.deepEqual(pages.map((p) => `${p.component}/${p.state}`), ['Button/Primary', 'Button/Disabled', 'Field/With error']);
  assert.match(pages[0].url, /iframe\.html\?id=components-button--primary/);
});

test('what the run says, so "checked" is never read as "checked everywhere"', () => {
  const by = storiesByComponent(INDEX_JSON);
  const { pages, without } = pagesFor(['Button', 'Chip', 'Field'], by, 'http://localhost:6006');
  const lines = storyLines({ pages, without, base: 'http://localhost:6006' });
  assert.match(lines[0], /3 stories of 2 components read from Storybook \(http:\/\/localhost:6006\)/);
  assert.match(lines[1], /1 component has no story, and is checked on the page the engine draws: Chip/);
  assert.deepEqual(storyLines({ pages: [], without: ['Chip'] }), [], 'with no story at all it says nothing: the run is the one it always was');
});

// A cap that takes the first N of an index checks every state of the first few components and calls it 40 pages.
test('a cap covers as many components as it can, one state of each before a second of any', () => {
  const pages = [
    { component: 'Button', state: 'Primary' }, { component: 'Button', state: 'Disabled' }, { component: 'Button', state: 'Loading' },
    { component: 'Chip', state: 'On' }, { component: 'Chip', state: 'Off' },
    { component: 'Field', state: 'Empty' },
  ];
  assert.deepEqual(spread(pages, 3).map((p) => p.component), ['Button', 'Chip', 'Field'], 'three pages reach three components');
  assert.deepEqual(spread(pages, 4).map((p) => `${p.component}/${p.state}`), ['Button/Primary', 'Chip/On', 'Field/Empty', 'Button/Disabled']);
  assert.equal(spread(pages, 99).length, 6, 'a cap nothing reaches changes nothing');
  assert.deepEqual(spread(pages, 99), pages, 'and keeps the index\'s own order');
  assert.deepEqual(spread([], 5), []);
});

test('the pages a run opens: a story named by its component and state, a page found another way by its path', () => {
  const stories = [
    { url: 'http://localhost:6006/iframe.html?id=b--primary', component: 'Button', state: 'Primary' },
    { url: 'http://localhost:6006/iframe.html?id=c--on', component: 'Chip', state: 'On' },
    { url: 'http://localhost:6006/iframe.html?id=b--off', component: 'Button', state: 'Disabled' },
  ];
  const t = targetsFor(stories, 'http://localhost:6006', { stories: true, cap: 2 });
  assert.deepEqual(t.targets.map(({ label, url, page }) => ({ label, url, page })), [
    { label: 'Button · Primary', url: 'http://localhost:6006/iframe.html?id=b--primary', page: false },
    { label: 'Chip · On', url: 'http://localhost:6006/iframe.html?id=c--on', page: false },
  ], 'named as the team names them, and a story is one component rather than a whole page');
  assert.equal(t.reached, 2);
  assert.equal(t.of, 2, 'two of the two components, though a third story was cut');

  const routes = targetsFor([{ url: 'http://localhost:3000/cart' }, { url: 'http://localhost:3000' }], 'http://localhost:3000', { stories: false });
  assert.deepEqual(routes.targets, [
    { label: '/cart', url: 'http://localhost:3000/cart', page: true },
    { label: '/', url: 'http://localhost:3000', page: true },
  ], 'a page found another way is unchanged: its path, and a whole page');
});

// Found on a real public design system: its `storybook` script is the bare CLI, which prints its usage and exits,
// while the one that serves is `start:storybook`. Picking a script by its name alone left that project with no page
// to check at all, and the run said "no render targets" about a system with hundreds of components and a Storybook.
test('the script that serves is chosen by what it runs, never by what it is called', async () => {
  const { serveScript, servesPages } = await import('../lib/a11y-check.mjs');

  assert.equal(serveScript({
    'start:storybook': 'STORYBOOK=true storybook dev -p 6006 --no-open',
    'build:storybook': 'storybook build',
    storybook: 'storybook',
  }), 'start:storybook', 'the bare CLI serves nothing, whatever it is named');

  assert.equal(serveScript({ storybook: 'storybook dev -p 6006' }), 'storybook');
  assert.equal(serveScript({ storybook: 'start-storybook -p 9001' }), 'storybook', 'the older command still serves');
  assert.equal(serveScript({ dev: 'vite', build: 'vite build' }), 'dev');
  assert.equal(serveScript({ dev: 'vite', 'sb:dev': 'storybook dev' }), 'sb:dev', 'a Storybook is preferred: its pages are the components');
  assert.equal(serveScript({ test: 'node --test' }), null, 'nothing that serves is nothing, never a guess');
  assert.equal(serveScript({ start: 'some-tool-we-do-not-know' }), 'start', 'a command this does not know still answers by its name');

  assert.equal(servesPages('storybook build'), false, 'building is not serving');
  assert.equal(servesPages('storybook dev -p 6006'), true);
});

// Figma's properties as the props snapshot keeps them: a variant property lists its options, a boolean one carries
// Figma's own suffix on its name.
const BUTTON = {
  Size: { type: 'VARIANT', defaultValue: 'Medium', variantOptions: ['Small', 'Medium'] },
  State: { type: 'VARIANT', defaultValue: 'Default', variantOptions: ['Default', 'Hover', 'Disabled'] },
  'Icon#3:1': { type: 'BOOLEAN', defaultValue: false },
  'Label#3:0': { type: 'TEXT', defaultValue: 'Save' },
};

test("a story's args are the Figma variant they name, whichever way the code spells it", () => {
  assert.deepEqual(variantOf({ size: 'small', label: 'Save' }, BUTTON).variant, { Size: 'Small' }, 'small is Small; a label is content, not a state');
  assert.deepEqual(variantOf({ icon: true }, BUTTON).variant, { Icon: true }, "Figma's suffix is no part of the name");
  assert.deepEqual(variantOf({ isIcon: false }, BUTTON).variant, { Icon: false }, 'isIcon is the Icon property');
  assert.deepEqual(variantOf({ disabled: true }, BUTTON).variant, { State: 'Disabled' }, 'a flag that names an option is that option');
  assert.equal(variantOf({ size: 'Small', disabled: true }, BUTTON).label, 'Size=Small, State=Disabled');
  assert.deepEqual(variantOf({ disabled: false, onClick: null, count: 3 }, BUTTON), { variant: {}, label: '', missing: [] }, 'a flag set off, and an arg Figma has no property for, say nothing');
});

test("a state is matched to the option that is that state, as the project's states say or its name does", () => {
  const props = { Status: { type: 'VARIANT', variantOptions: ['Idle', 'Busy'] } };
  assert.deepEqual(variantOf({ loading: true }, props).variant, { Status: 'Busy' }, 'busy is loading by its name');
  const cfg = { states: { error: { prop: 'Tone', value: 'Critical' } } };
  assert.deepEqual(variantOf({ invalid: true }, { Tone: { type: 'VARIANT', variantOptions: ['Neutral', 'Critical'] } }, cfg).variant, { Tone: 'Critical' }, 'ds-config.json says Critical is the error');
});

test('what a story shows that Figma has no variant for is said, with what Figma does have', () => {
  const { missing } = variantOf({ size: 'xl', loading: true, label: 'Saving' }, BUTTON);
  assert.deepEqual(missing, [{ arg: 'size', value: 'xl', prop: 'Size', options: ['Small', 'Medium'] }, { arg: 'loading', value: true, concept: 'loading' }]);
  const lines = storyStateLines([{ component: 'Button', state: 'Saving', missing }, { component: 'Button', state: 'Primary', missing: [] }]);
  assert.equal(lines.length, 1, 'a story Figma covers says nothing');
  assert.match(lines[0], /Button · Saving shows Size=xl, which Figma's Size does not list \(it has Small, Medium\); and loading, a state Figma never draws for it/);
});

test("the component's Figma properties are found under its name however the snapshot writes it", () => {
  const snap = { _updated: 'x', iconButton: { properties: { Size: {} } }, 'Field size': { properties: { Tone: {} } } };
  assert.deepEqual(Object.keys(figmaPropertiesOf('IconButton', snap)), ['Size']);
  assert.deepEqual(Object.keys(figmaPropertiesOf('FieldSize', snap)), ['Tone']);
  assert.equal(figmaPropertiesOf('Card', snap), null);
});

test('a story page is checked once Storybook has drawn it, and carries its component and state', () => {
  const { targets } = targetsFor([{ url: 'http://x/iframe.html?id=b--p', component: 'Button', state: 'Primary', id: 'b--p' }], 'http://x', { stories: true });
  assert.equal(targets[0].ready, STORY_READY);
  assert.deepEqual(targets[0].story, { component: 'Button', state: 'Primary', id: 'b--p' });
  assert.equal(targetsFor([{ url: 'http://x/about' }], 'http://x').targets[0].ready, undefined, 'a page found another way waits for nothing more');
});

test('a static build is a folder with its page and its index, served without anything outside it', async () => {
  const root = tempDir('storybook-static-');
  assert.equal(staticBuild(root), null, 'no build');
  mkdirSync(join(root, 'storybook-static'));
  writeFileSync(join(root, 'storybook-static', 'iframe.html'), '<!doctype html><p>story');
  assert.equal(staticBuild(root), null, 'a page with no index is not a build');
  writeFileSync(join(root, 'storybook-static', 'index.json'), '{"v":5,"entries":{}}');
  writeFileSync(join(root, 'secret.txt'), 'not served');
  assert.equal(staticBuild(root), join(root, 'storybook-static'));
  assert.equal(staticBuild(root, { storybook: { static: 'elsewhere' } }), null, 'the folder the config names');
  const s = await serveStatic(staticBuild(root));
  try {
    const page = await fetch(s.url + '/iframe.html');
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /text\/html/);
    assert.equal((await fetch(s.url + '/index.json')).headers.get('content-type'), 'application/json');
    for (const out of ['/../secret.txt', '/%2e%2e/secret.txt']) assert.notEqual((await fetch(s.url + out)).status, 200, out);
    assert.equal((await fetch(s.url + '/missing.js')).status, 404);
  } finally { await s.close(); }
});

// Parity holds a component's base values to Figma's default variant, so they are measured on a story that shows it.
test("a story shows Figma's default variant when every property it names is at Figma's default", () => {
  const props = { Size: { type: 'VARIANT', defaultValue: 'Medium' }, 'Icon#3:1': { type: 'BOOLEAN', defaultValue: false } };
  assert.equal(isDefaultVariant({}, props), true, 'a story that names nothing shows the default');
  assert.equal(isDefaultVariant({ Size: 'Medium', Icon: false }, props), true);
  assert.equal(isDefaultVariant({ Size: 'medium' }, props), true, 'spelled either way');
  assert.equal(isDefaultVariant({ Size: 'Small' }, props), false);
  assert.equal(isDefaultVariant({ Icon: true }, props), false);
  assert.equal(isDefaultVariant({ Tone: 'Danger' }, props), false, 'a property Figma has no default for is not the default');
});

test('a component and the component a story is about, however each spells its name', () => {
  assert.equal(sameComponent('iconButton', 'IconButton'), true);
  assert.equal(sameComponent('field-size', 'FieldSize'), true);
  assert.equal(sameComponent('button', 'IconButton'), false);
  assert.equal(sameComponent('', 'Button'), false);
});

// Found on the Storybook fixture's own run: the codebase lint read storybook-static/assets/*.js as the team's code and
// failed Storybook's own outline colours. A Storybook build is Storybook's bundle, passed over as dist is.
test("a Storybook build is never read as the team's code, wherever ds-config.json says it is", async () => {
  const { sourceFiles, storybookBuildDirs } = await import('../lib/code-roots.mjs');
  assert.deepEqual(storybookBuildDirs(), ['storybook-static']);
  assert.deepEqual(storybookBuildDirs({ storybook: { static: 'docs/sb' } }), ['storybook-static', 'sb']);
  const root = tempDir('storybook-not-code-');
  for (const d of ['src', 'storybook-static/assets', 'sb']) mkdirSync(join(root, d), { recursive: true });
  writeFileSync(join(root, 'src', 'button.css'), '.b { color: red; }');
  writeFileSync(join(root, 'storybook-static', 'assets', 'iframe.js'), 'a{outline:1px solid #2980b9}');
  writeFileSync(join(root, 'sb', 'iframe.js'), 'a{outline:1px solid #2980b9}');
  assert.deepEqual(sourceFiles(root).map((f) => f.file).sort(), ['sb/iframe.js', 'src/button.css']);
  assert.deepEqual(sourceFiles(root, { storybook: { static: 'sb' } }).map((f) => f.file), ['src/button.css']);
});

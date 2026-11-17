// A team's own stories as the pages the browser checks run on. Nothing here starts Storybook: the index is given in,
// which is the same shape whether it came from a static build or a running server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { componentOf, storiesByComponent, storyUrl, pagesFor, storyLines, spread, targetsFor } from '../lib/storybook-stories.mjs';

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
  assert.match(by.Button[0].file, /src\/Button\.tsx$/);
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
  assert.deepEqual(t.targets, [
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

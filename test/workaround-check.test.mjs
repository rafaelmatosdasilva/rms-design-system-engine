// a workaround built around a component is a missing API. What counts, and the look-alikes that do not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workaroundFindings, workaroundLines, projectWorkarounds, missingApis } from '../workaround-check.mjs';
import { makeFixture } from './helpers.mjs';

const ds = new Map([['row', 'listRow'], ['menu', 'menu'], ['field', 'input']]);
const run = (markup, styles) => workaroundFindings({ styles: [styles], markup: [{ file: 'screen.html', text: markup }], dsClasses: ds })
  .map((f) => `${f.host.kind}:${f.host.name}:${f.action}`);

test('a control laid over a text field, and over a component (its selector, or the class it is named after)', () => {
  assert.deepEqual(run('<div class="search"><input class="search-input" type="text"><button class="search-clear">x</button></div>', '.search-clear { position: absolute; right: 4px; }'),
    ['field:search-input:search-clear']);
  assert.deepEqual(run('<div class="row item"><span>Name</span><button class="item-go">Go</button></div>', '.item .item-go { position: absolute; }'),
    ['component:listRow:item-go']);
  // Markup built in JavaScript: the class list sits in a string, the control is named after it.
  assert.deepEqual(run("var cls = 'row entry';\nvar b = '<span class=\"entry-focus-btn\">f</span>';", '.entry-focus-btn { position: absolute; }'),
    ['component:listRow:entry-focus-btn']);
});

test('not a workaround: a component placed in another, a control in the flow, a decoration, a component\'s own source', () => {
  assert.deepEqual(run('<div class="row"><button class="menu">…</button></div>', '.row .menu { position: absolute; }'), []);   // the system's own composition
  assert.deepEqual(run('<div class="row"><button class="row-go">Go</button></div>', '.row-go { margin-left: auto; }'), []);      // not laid over anything
  assert.deepEqual(run('<div class="row"><svg class="row-icon"></svg></div>', '.row-icon { position: absolute; }'), []);         // not an action
  assert.deepEqual(workaroundFindings({ styles: ['.row-go { position: absolute; }'], markup: [{ file: 'Row.vue', text: '<div class="row"><button class="row-go">Go</button></div>' }], dsClasses: ds, ownFiles: new Set(['Row.vue']) }), []);
});

test('one line per host, sent to the design system', () => {
  const lines = workaroundLines([
    { file: 'a.html', line: 3, action: 'row-go', host: { kind: 'component', name: 'listRow' } },
    { file: 'a.html', line: 9, action: 'row-pin', host: { kind: 'component', name: 'listRow' } },
    { file: 'a.html', line: 12, action: 'search-clear', host: { kind: 'field', name: 'search-input' } },
  ]);
  assert.deepEqual(lines, [
    'listRow: .row-go, .row-pin laid over it (a.html:3). The component may be missing a slot or prop for these actions.',
    "a text field (.search-input): .search-clear laid over it (a.html:12). The design system's field may be missing this action.",
  ]);
});

test('the project: a built file is read once, from its source; excluded folders are skipped', () => {
  const page = '<div class="row x"><button class="x-go">Go</button></div>';
  const dir = makeFixture({ 'ui.src.html': page, 'ui.html': page, 'demo/page.html': page, 'style.css': '.x .x-go { position: absolute; }' });
  const f = projectWorkarounds(dir, { names: ['listRow'], classFor: () => '.row', excludeDirs: ['demo'] });
  assert.deepEqual(f.map((x) => `${x.file}:${x.host.name}`), ['ui.src.html:listRow']);
});

test('the project: component files (.jsx, .vue) are read, not only HTML', () => {
  const dir = makeFixture({ 'src/Row.jsx': 'export const R = () => <div className="row x"><button className="x-go">Go</button></div>;', 'src/Field.vue': '<template><div class="row x"><button class="x-pin">Pin</button></div></template>', 'style.css': '.x .x-go, .x .x-pin { position: absolute; }' });
  const f = projectWorkarounds(dir, { names: ['listRow'], classFor: () => '.row' });
  assert.deepEqual(f.map((x) => x.file).sort(), ['src/Field.vue', 'src/Row.jsx']);
});

test('the same thing built around the same component in several files is a piece the component lacks', () => {
  const f = (file, name, action, kind = 'component') => ({ file, line: 1, action, host: { kind, name } });
  const found = [
    // One need, met by hand in three places, one of them a prototype: that is the component's gap.
    f('screens/Login.vue', 'field', 'reveal'), f('prototypes/Signup.vue', 'field', 'reveal'), f('screens/Reset.vue', 'field', 'reveal'),
    // Once only: one screen's oddity, not the system's gap.
    f('screens/List.vue', 'row', 'menu'),
    // Twice in the same file: the same file says it once.
    f('screens/One.vue', 'card', 'close'), f('screens/One.vue', 'card', 'close'),
  ];
  const gaps = missingApis(found);
  assert.equal(gaps.length, 1, JSON.stringify(gaps));
  assert.equal(gaps[0].component, 'field');
  assert.equal(gaps[0].action, 'reveal');
  assert.deepEqual(gaps[0].files, ['screens/Login.vue', 'prototypes/Signup.vue', 'screens/Reset.vue']);
  assert.equal(gaps[0].places, 3);

  // Most-built first, so what the system lacks most reads first.
  const many = [...found, f('a.vue', 'row', 'menu'), f('b.vue', 'row', 'menu'), f('c.vue', 'row', 'menu'), f('d.vue', 'row', 'menu')];
  assert.deepEqual(missingApis(many).map((g) => g.component), ['row', 'field']);
  // What counts as "more than one" can be raised for a system that wants a stronger signal.
  assert.deepEqual(missingApis(found, { least: 4 }), []);
});

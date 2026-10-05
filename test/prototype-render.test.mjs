// prototype-render.mjs: a drawn prototype in the browser, against the product's designed screens.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { fixtureProject } from './helpers.mjs';
import { findChrome } from '../cdp.mjs';
import { screenBoxes, screenInstances, screenFor, compareWithScreen, compositionPaths, owedFromScreen, interactionLines } from '../prototype-render.mjs';

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const TIDEPOOL = join(ENGINE, 'test', 'fixtures', 'tidepool-figma');
const capture = JSON.parse(readFileSync(join(TIDEPOOL, 'src', 'figma', 'figma-screen-layout.snapshot.json'), 'utf8'));
const settings = capture.screens[0];
const catalog = { components: { button: {}, chip: {}, field: {}, tag: {} } };
const CHROME = findChrome({ playwright: true });

test('an older capture is placed by Figma\'s auto layout rules: padding, spacing, rows', () => {
  const boxes = screenBoxes(settings.tree);
  const at = (name) => boxes.find((b) => b.node.name === name);
  assert.deepEqual([at('Title').x, at('Title').y], [12, 12]);
  assert.deepEqual([at('Name field').x, at('Name field').y], [12, 44], '12 padding, 20 title, 12 spacing');
  const inst = screenInstances(settings.tree, catalog);
  assert.deepEqual(inst.map((i) => `${i.component}@${i.x},${i.y}`), ['field@12,44', 'chip@12,92', 'chip@100,92', 'tag@188,92', 'button@12,136']);
});

test('a capture with x and y uses them; a frame without auto layout leaves its children unplaced', () => {
  const tree = { kind: 'frame', w: 300, h: 200, children: [{ kind: 'instance', component: 'button', w: 80, h: 32, x: 40, y: 50 }, { kind: 'frame', w: 100, h: 50, children: [{ kind: 'instance', component: 'tag', w: 40, h: 20 }] }] };
  const b = screenBoxes(tree);
  assert.deepEqual([b[1].x, b[1].y], [40, 50]);
  assert.ok(Number.isNaN(b[3].x));
});

test('the screen to compare with: the one it redraws, the one it started from, else the one sharing the most components', () => {
  const tree = { component: 'Page', children: [{ component: 'chip' }, { component: 'button' }] };
  const other = { name: 'Profile', tree: { kind: 'frame', children: [{ kind: 'instance', component: 'tag', w: 1, h: 1 }] } };
  const slug = (s) => s.toLowerCase();
  assert.deepEqual(screenFor('settings', {}, tree, [other, settings], catalog, slug)?.mode, 'redraw');
  assert.equal(screenFor('notify', { $note: 'Starting point read from the screen "Profile" in Figma (1:2).' }, tree, [settings, other], catalog, slug)?.screen.name, 'Profile');
  const near = screenFor('notify', {}, tree, [other, settings], catalog, slug);
  assert.equal(near.screen.name, 'Settings');
  assert.equal(near.mode, 'sibling');
  assert.equal(screenFor('notify', {}, tree, [], catalog, slug), null);
});

// What the browser measured, for a composition drawn as the screen is (sizes and places from screenBoxes).
const redraw = { component: 'Page', props: {}, children: [
  { component: 'Text', props: { text: 'Settings' } },
  { component: 'field', props: {} },
  { component: 'Row', props: {}, children: [{ component: 'chip', props: { Label: 'Filter' } }, { component: 'chip', props: { Label: 'Filter' } }, { component: 'tag', props: { Label: 'New' } }] },
  { component: 'button', props: { Label: 'Save' } },
] };
const asDesigned = () => [
  { path: '0', x: 0, y: 0, w: 360, h: 180, pad: [12, 12, 12, 12], gaps: [12, 12, 12] },
  { path: '0.0', x: 12, y: 12, w: 56, h: 20, fontSize: 14 },
  { path: '0.1', x: 12, y: 44, w: 200, h: 36 },
  { path: '0.2', x: 12, y: 92, w: 256, h: 32, gaps: [8, 8] },
  { path: '0.2.0', x: 12, y: 92, w: 80, h: 24 }, { path: '0.2.1', x: 100, y: 92, w: 80, h: 32 }, { path: '0.2.2', x: 188, y: 92, w: 80, h: 20 },
  { path: '0.3', x: 12, y: 136, w: 80, h: 32 },
];

test('a page drawn as designed has no difference', () => {
  assert.deepEqual(compareWithScreen(redraw, asDesigned(), settings, { mode: 'redraw', catalog }), []);
});

test('the page\'s padding and spacing, a part placed elsewhere, and a component drawn at another size are each named', () => {
  const r = asDesigned();
  const at = (p) => r.find((x) => x.path === p);
  Object.assign(at('0'), { pad: [8, 8, 8, 8], gaps: [12, 20, 12] });
  at('0.1').h = 40;                         // the field taller than Figma: what follows moves down 4px with it
  for (const p of ['0.2', '0.2.0', '0.2.1', '0.2.2']) at(p).y += 4;
  at('0.3').y = 148;                        // and the button 8px more
  at('0.2.0').w = 43;                       // a chip narrower: moves nothing after it into a finding
  at('0.2.1').x = 63; at('0.2.2').x = 151;
  at('0.0').fontSize = 16;
  const d = compareWithScreen(redraw, r, settings, { mode: 'redraw', catalog });
  const by = (k) => d.filter((x) => x.kind === k).map((x) => x.message);
  assert.deepEqual(by('page').sort(), ['the page\'s padding is 8 8 8 8px, "Settings" uses 12 12 12 12px', 'the space between the page\'s sections is 12, 20px, "Settings" spaces them 12px']);
  assert.deepEqual(by('place'), ['the space between the row above it and the button "Save" is 20px, 12px in "Settings"']);
  assert.deepEqual(by('text'), ['the text "Settings" is 16px, 14px in Figma']);
  assert.match(by('size').join('\n'), /the field is drawn 40px tall, 36px in Figma \(the component's own size/);
  assert.match(by('size').join('\n'), /the chip "Filter" is drawn 43px wide, 80px on the screen in Figma/);
  assert.deepEqual(owedFromScreen(d).map((x) => x.kind), ['page', 'page', 'place'], 'only the page\'s own arrangement is owed to the person');
});

test('a new page is compared on what it shares with the screen: the page, and the same components with the same options', () => {
  const page = { component: 'Page', props: {}, children: [{ component: 'chip', props: { Label: 'Email', Size: 'L' } }, { component: 'button', props: { Label: 'Save' } }] };
  const r = [{ path: '0', x: 0, y: 0, w: 360, h: 100, pad: [12, 12, 12, 12], gaps: [12] }, { path: '0.0', x: 12, y: 12, w: 80, h: 32 }, { path: '0.1', x: 12, y: 56, w: 80, h: 40 }];
  const d = compareWithScreen(page, r, settings, { mode: 'sibling', catalog });
  assert.deepEqual(d.map((x) => x.message), ['the button "Save" is drawn 40px tall, 32px in Figma (the component\'s own size: a difference in its code, for the audit)']);
  assert.deepEqual(compositionPaths(page).map((p) => p.path), ['0', '0.0', '0.1']);
});

test('--prototype measures the drawn page against the designed screen, saves its picture and owes the page\'s differences', { skip: CHROME ? false : 'no Chrome available', timeout: 600000 }, () => {
  const dir = fixtureProject(TIDEPOOL, 'tp-render-');
  const ref = join(ENGINE, 'test', 'skill-evals', 'build-reference');
  for (const p of ['src/styles/tokens.css', 'src/components/button.css', 'src/components/Button.jsx', 'src/components/chip.css', 'src/components/Chip.jsx', 'src/components/field.css', 'src/components/Field.jsx', 'src/components/tag.css', 'src/components/Tag.jsx']) {
    mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), readFileSync(join(ref, p), 'utf8'));
  }
  const run = (...args) => spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', CHROME_PATH: CHROME }, timeout: 300000 });
  let r = run('--prototype', '--from-screens', 'src/figma/figma-screen-layout.snapshot.json');
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /📏 AGAINST THE DESIGNED SCREEN "Settings" \(this prototype redraws it\)/);
  assert.match(r.stdout, /% of pixels differ from the Figma image of "Settings"/, 'the fixture holds the Figma image of the screen');
  assert.ok(existsSync(join(dir, '.design-system-engine-out', 'prototypes', 'settings.png')));
  mkdirSync(join(dir, 'prototypes'), { recursive: true });
  writeFileSync(join(dir, 'prototypes', 'notify.json'), JSON.stringify({ component: 'Page', props: { padding: 'padding/s', gap: 'padding/m', width: '360' }, children: [
    { component: 'chip', props: { Label: 'Email', Size: 'L' } }, { component: 'button', props: { Label: 'Save' } }] }));
  r = run('--prototype', 'prototypes/notify.json');
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /the closest of the product's designed screens/);
  assert.match(r.stdout, /⚠️  the page's padding is 8 8 8 8px, "Settings" uses 12 12 12 12px/);
  assert.match(r.stdout, /Look at \.design-system-engine-out\/prototypes\/notify\.png before you answer/);
  const last = JSON.parse(readFileSync(join(dir, '.design-system-engine-out', 'prototypes', 'last.json'), 'utf8'));
  assert.ok(last.gaps.some((g) => g.kind === 'screen' && /padding/.test(g.line)));
  r = run('--prototype', 'prototypes/notify.json', '--no-browser');
  assert.doesNotMatch(r.stdout, /📏/);
});

test('a part that opens another opens it in the browser, with the focus inside; Escape closes it and gives the focus back; a field takes typing', { skip: CHROME ? false : 'no Chrome available', timeout: 600000 }, () => {
  const dir = fixtureProject(TIDEPOOL, 'tp-interact-');
  const ref = join(ENGINE, 'test', 'skill-evals', 'build-reference');
  for (const p of ['src/styles/tokens.css', 'src/components/button.css', 'src/components/Button.jsx', 'src/components/chip.css', 'src/components/Chip.jsx', 'src/components/field.css', 'src/components/Field.jsx', 'src/components/tag.css', 'src/components/Tag.jsx']) {
    mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), readFileSync(join(ref, p), 'utf8'));
  }
  const run = (...args) => spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', CHROME_PATH: CHROME }, timeout: 300000 });
  mkdirSync(join(dir, 'prototypes'), { recursive: true });
  writeFileSync(join(dir, 'prototypes', 'filters.json'), JSON.stringify({ component: 'Page', props: { padding: 'padding/m' }, children: [
    { component: 'button', props: { Label: 'Rename', opens: 'rename' } },
    { id: 'rename', component: 'Stack', props: { padding: 'padding/m', gap: 'padding/s' }, children: [{ component: 'field', props: {} }, { component: 'button', props: { Label: 'Save' } }] },
  ] }));
  let r = run('--prototype', 'prototypes/filters.json');
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /🖱  HOW IT WORKS {2}2 tried in the browser, all as in a product/, r.stdout);
  const page = readFileSync(join(dir, '.design-system-engine-out', 'prototypes', 'filters.html'), 'utf8');
  assert.match(page, /"opens":"rename"/);

  writeFileSync(join(dir, 'prototypes', 'nowhere.json'), JSON.stringify({ component: 'Page', children: [{ component: 'button', props: { Label: 'Rename', opens: 'dialog' } }] }));
  r = run('--prototype', 'prototypes/nowhere.json', '--no-browser');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /button\.opens names "dialog", and no part has that id/);
});

test('what did not work in the browser is named: nothing opened, the focus left outside, no Escape, a field that takes no typing', () => {
  assert.deepEqual(interactionLines([
    { kind: 'opens', id: 'menu', by: 'More', opened: false },
    { kind: 'opens', id: 'rename', by: 'Rename', opened: true, focusInside: false, closed: true, focusBack: false },
    { kind: 'opens', id: 'help', by: 'Help', opened: true, focusInside: true, closed: false },
    { kind: 'opens', id: 'ok', by: 'Ok', opened: true, focusInside: true, closed: true, focusBack: true },
    { kind: 'field', path: '0.2', where: 'rename', takes: false }, { kind: 'field', path: '0.3', takes: true },
  ]), [
    '⚠️  "More" does not open menu',
    '⚠️  rename opens without the focus inside it',
    '⚠️  closing rename does not give the focus back to "Rename"',
    '⚠️  help does not close with Escape',
    '⚠️  the field at 0.2 in rename takes no typing',
  ]);
});

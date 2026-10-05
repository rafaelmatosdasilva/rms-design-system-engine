// A prototype's other states (empty, error, loading…) and the ones its page owes; every screen width and longer words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { splitStates, applyState, statesOwed, stateFindings, kindOf } from '../prototype-states.mjs';
import { fitFindings, fitLines, screenWidths } from '../prototype-render.mjs';
import { fixtureProject } from './helpers.mjs';
import { findChrome } from '../cdp.mjs';

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = findChrome({ playwright: true });

const page = { component: 'Page', children: [
  { id: 'list', component: 'Stack', children: [{ component: 'card', props: {} }, { component: 'card', props: {} }] },
  { id: 'email', component: 'field', props: { Label: 'Email' } },
  { component: 'button', props: { Label: 'Save' } }] };
const catalog = { components: { card: { props: {} }, field: { props: {} }, button: { props: {} }, emptyState: { props: {} } } };
const context = { components: { field: { role: 'textbox', notes: [] }, button: { role: 'button', notes: [] }, card: { notes: [], guidelines: 'Every card list shows a loading state while it waits.' } }, rules: [] };

test('a composition\'s states come off it, in the composition or beside it; each is the composition with the parts that differ', () => {
  const s = splitStates({ ...page, states: { empty: { list: { component: 'emptyState' } }, error: { email: { component: 'field', props: { Label: 'Email', Error: 'Not an address' } } } } });
  assert.equal('states' in s.ui, false);
  assert.deepEqual(s.states.map((x) => x.name), ['empty', 'error']);
  assert.deepEqual(splitStates({ prototype: page, states: { loading: {} } }).states.map((x) => x.name), ['loading']);
  assert.match(splitStates({ ...page, states: ['empty'] }).findings[0].message, /states is an object/);
  const empty = applyState(s.ui, s.states[0].overrides);
  assert.deepEqual(empty.ui.children[0], { id: 'list', component: 'emptyState' });
  assert.deepEqual(empty.unknown, []);
  const gone = applyState(s.ui, { email: null, nowhere: { component: 'x' } });
  assert.equal(gone.ui.children.length, 2, 'null leaves the part out');
  assert.deepEqual(gone.unknown, ['nowhere']);
  const flat = applyState({ root: 'p', components: [{ id: 'p', component: 'Page', children: ['a', 'b'] }, { id: 'a', component: 'card' }, { id: 'b', component: 'card' }] }, { b: null, a: { component: 'emptyState' } });
  assert.deepEqual(flat.ui.components, [{ id: 'p', component: 'Page', children: ['a'] }, { id: 'a', component: 'emptyState' }]);
});

test('the states a page owes: empty for a list, error for input, and what the guidelines and the request name', () => {
  const owed = statesOwed(page, { context, catalog, request: 'a profile page with a loading state' });
  assert.deepEqual(owed.map((o) => o.state), ['empty', 'error', 'loading']);
  assert.match(owed[0].why, /a list of card/);
  assert.match(owed[1].why, /takes input \(field\) and sends it \(button\)/);
  assert.equal(statesOwed(page, { context, catalog }).find((o) => o.state === 'loading').why, 'card\'s guidelines: "Every card list shows a loading state while it waits."');
  assert.deepEqual(statesOwed({ component: 'Page', children: [{ component: 'button', props: { Label: 'Go' } }] }, { context: { components: {}, rules: [] }, catalog }), [], 'a page with one button owes nothing');
  assert.equal(kindOf('No results'), 'empty');
  assert.equal(kindOf('validation failed'), 'error');
  const f = stateFindings(owed, [{ name: 'Nothing yet' }, { name: 'loading' }]);
  assert.deepEqual(f.map((x) => x.state), ['error'], 'a state named in other words counts');
  assert.match(f[0].message, /no error state, and the page owes one/);
});

test('what does not fit is one line per part, with the widths and states it happens at, and whether only longer words cause it', () => {
  assert.deepEqual(screenWidths([]).map((w) => w.px), [375, 768, 1280]);
  assert.deepEqual(screenWidths([{ name: 'Desktop', px: 1440 }, { name: 'Mobile', px: 360 }]).map((w) => w.name), ['Mobile', 'Desktop']);
  const runs = [
    { state: 'default', width: 'Phone', longer: false, issues: [{ kind: 'wide', path: '0.3', component: 'button', text: 'Apply', over: 40 }] },
    { state: 'default', width: 'Phone', longer: true, issues: [{ kind: 'wide', path: '0.3', component: 'button', text: 'Apply', over: 90 }, { kind: 'wraps', path: '0.1', component: 'chip', text: 'Email' }] },
    { state: 'empty', width: 'Phone', longer: false, issues: [{ kind: 'target', path: '0.2', component: 'chip', text: 'x', w: 20, h: 18 }] },
  ];
  const f = fitFindings(runs);
  assert.equal(f.length, 3);
  assert.deepEqual(fitLines(f, { states: ['default', 'empty'] }), [
    '⚠️  button "Apply" runs 90px past the screen\'s edge at Phone, in the default state',
    '⚠️  chip "x" is 20×18px, smaller than 24px to tap at Phone, in the empty state',
    '⚠️  "Email" in chip wraps onto two lines at Phone, in the default state, with the words 40% longer (as a translation makes them)',
  ]);
});

test('--prototype draws each state, owes the states the page lacks, and tries every width with longer words', { skip: CHROME ? false : 'no Chrome available', timeout: 600000 }, () => {
  const dir = fixtureProject(join(ENGINE, 'test', 'fixtures', 'tidepool-figma'), 'tp-states-');
  const ref = join(ENGINE, 'test', 'skill-evals', 'build-reference');
  for (const p of ['src/styles/tokens.css', 'src/components/button.css', 'src/components/Button.jsx', 'src/components/chip.css', 'src/components/Chip.jsx', 'src/components/field.css', 'src/components/Field.jsx', 'src/components/tag.css', 'src/components/Tag.jsx']) {
    mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), readFileSync(join(ref, p), 'utf8'));
  }
  const run = (...args) => spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', CHROME_PATH: CHROME }, timeout: 300000 });
  mkdirSync(join(dir, 'prototypes'), { recursive: true });
  writeFileSync(join(dir, 'prototypes', 'filters.json'), JSON.stringify({ component: 'Page', props: { padding: 'padding/m', gap: 'padding/m' }, children: [
    { component: 'Text', props: { as: 'h1', text: 'Filters' } },
    { id: 'chips', component: 'Row', props: { gap: 'padding/s' }, children: ['Every notification by email', 'Weekly summary of your account', 'Product news and updates'].map((Label) => ({ component: 'chip', props: { Label } })) },
    { component: 'field', props: {} }, { component: 'button', props: { Label: 'Save' } }],
    states: { empty: { chips: { component: 'Text', props: { text: 'No filters yet' } } } } }));
  let r = run('--prototype', 'prototypes/filters.json');
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /⚠️ {2}no error state, and the page owes one \(it takes input \(field\) and sends it \(button\)\)/);
  assert.match(r.stdout, /🎨 DESIGN REVIEW {2}\d+\/10/, 'the page is reviewed as drawn');
  assert.match(r.stdout, /📱 EVERY SIZE AND STATE {2}Phone 375, Tablet 768, Desktop 1280 · 2 states \(default, empty\)/);
  assert.match(r.stdout, /⚠️ {2}"Weekly summary of your account" in chip wraps onto two lines at Phone, Tablet, in the default state\n/, 'a chip\'s label on two lines on a narrow screen');
  for (const f of ['filters@phone.png', 'filters@desktop.png', 'filters.empty.png']) assert.ok(existsSync(join(dir, '.design-system-engine-out', 'prototypes', f)), f);
  const last = JSON.parse(readFileSync(join(dir, '.design-system-engine-out', 'prototypes', 'last.json'), 'utf8'));
  assert.ok(last.gaps.some((g) => g.kind === 'state' && g.need === 'error state'));
  assert.ok(last.gaps.some((g) => g.kind === 'fit' && /Weekly summary/.test(g.line)));
  assert.match(readFileSync(join(dir, '.design-system-engine-out', 'prototypes', 'filters.html'), 'utf8'), /"states":\[\{"name":"empty"/);

  writeFileSync(join(dir, 'prototypes', 'wrong.json'), JSON.stringify({ component: 'Page', children: [{ component: 'button', props: { Label: 'Go' } }], states: { empty: { nowhere: null } } }));
  r = run('--prototype', 'prototypes/wrong.json', '--no-browser');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /state "empty" names "nowhere", and no part has that id/);
});

test('a value as the person writes it is read as the system writes it; a state that names no component changes the part', async () => {
  const { normaliseValues, applyState } = await import('../prototype-states.mjs');
  const catalog = { components: { button: { props: { Disabled: { type: 'enum', values: ['False', 'True'] }, Label: { type: 'text' } } }, chip: { props: { Selected: { type: 'boolean' } } } } };
  const raw = { component: 'Page', children: [{ id: 'go', component: 'button', props: { Label: 'Save', Disabled: false } }, { component: 'chip', props: { Selected: 'true' } }], states: { busy: { go: { props: { Disabled: 'true' } } } } };
  const notes = normaliseValues(raw, catalog);
  assert.equal(raw.children[0].props.Disabled, 'False');
  assert.equal(raw.children[1].props.Selected, true);
  assert.equal(raw.states.busy.go.props.Disabled, 'True', 'in every state too');
  assert.equal(notes.length, 3);
  const { ui } = applyState({ component: 'Page', children: [{ id: 'go', component: 'button', props: { Label: 'Save', Disabled: 'False' } }] }, { go: { props: { Disabled: 'True' } } });
  assert.deepEqual(ui.children[0], { id: 'go', component: 'button', props: { Label: 'Save', Disabled: 'True' } }, 'the part kept, its prop changed');
});

test('a list owes an empty state: rows alike or the request saying list; fields, buttons and chips side by side are not one', async () => {
  const { statesOwed } = await import('../prototype-states.mjs');
  const catalog = { components: { tag: {}, button: {}, field: {}, chip: {} } };
  const context = { components: { chip: { role: 'togglebutton' }, button: { role: 'button' }, field: { role: 'textbox' }, tag: {} } };
  const row = (name, tone) => ({ component: 'Row', children: [{ component: 'Text', props: { text: name } }, { component: 'tag', props: { Label: tone } }] });
  const list = { component: 'Page', children: [{ id: 'projects', component: 'Stack', children: [row('A', 'Active'), row('B', 'Done'), row('C', 'Active')] }] };
  assert.deepEqual(statesOwed(list, { catalog, context }).map((o) => o.state), ['empty']);
  const form = { component: 'Page', children: [{ component: 'field' }, { component: 'field' }, { component: 'button', props: { Label: 'Continue' } }] };
  assert.deepEqual(statesOwed(form, { catalog, context }).map((o) => o.state), ['error'], 'a form owes an error state, not an empty one');
  const chips = { component: 'Page', children: [{ component: 'Stack', children: [{ component: 'chip' }, { component: 'chip' }, { component: 'chip' }] }] };
  assert.deepEqual(statesOwed(chips, { catalog, context }), []);
  assert.deepEqual(statesOwed({ component: 'Page', children: [{ component: 'Text', props: { text: 'Projects' } }] }, { catalog, context, request: 'a projects list page' }).map((o) => o.state), ['empty']);
});

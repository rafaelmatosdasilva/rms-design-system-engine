// intent-truth.mjs - whether what an intent-layer page says is true of the system: names it writes as code, props it
// sets and their values, what it says of accessibility, its code file and status, whether its component changed since
// it was written, and pages that say the same. An invented system (Acme): tileOne, listMain, a few tokens and files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { factsFrom, checkPage, twins, checkLayer, componentChanges, report, CHANGES_FILE } from '../intent-truth.mjs';
import { useReport, componentIntent, matchComponents, ACTIONS } from '../intent-layer.mjs';
const ENGINE = fileURLToPath(new URL('..', import.meta.url));

const FACTS = () => factsFrom({
  components: {
    tileOne: { file: 'src/tiles/TileOne.vue', props: { tone: { type: 'string', options: ['calm', 'loud'], from: 'the code' }, dense: { type: 'boolean', from: 'the code' }, title: { type: 'string' } } },
    listMain: { file: 'src/lists/ListMain.vue', props: { rows: { type: 'array' }, emptyLabel: { type: 'string' } }, status: 'deprecated' },
  },
  tokens: ['--acme-tile-background-color'],
  text: 'export default { name: "TileOne", data() { return { isOpen: false } } } .tile-header {}',
  files: ['src/tiles/TileOne.vue', 'src/lists/ListMain.vue', 'src/assets/icons/check.svg'],
  aliases: { TileOne: 'tileOne', ListMain: 'listMain' },
  a11y: { tileOne: [{ wcag: '2.1.1', fix: 'Make it reachable with Tab.' }] },
});
const page = (name, lines = {}, extra = {}) => ({ kind: 'component', layer: 'components', name, id: `component-${name}`, file: `components/${name}.dsds.json`,
  purpose: [], whenToUse: [], whenNotToUse: [], mistakes: [], limitations: [], rules: [], sections: [], facts: [], repeated: 0, ...lines, ...extra });

test('a name written as code is one the system has: a component, a prop, a token, an icon, a file or a word of its code', () => {
  const f = checkPage(page('tileOne', { whenToUse: [
    'Use `tileOne` with `dense` inside `ListMain`, coloured by `--acme-tile-background-color`.',
    'Its icon is `icons/check`; its file `src/tiles/TileOne.vue`; it keeps `isOpen` and the `tile-header` class.',
    'Set `showBadgeCount` to show a count, and colour it with `--acme-tile-ink`.',
    'Give it `aria-label`, as a `Save` button would, never `icons/check-big` nor a component named `tileTwo`.',
  ] }), FACTS(), { component: 'tileOne' });
  assert.deepEqual(f.map((x) => [x.kind, x.says]), [['name', '`showBadgeCount`'], ['name', '`--acme-tile-ink`']]);
  assert.match(f[0].line, /^Set `showBadgeCount`/);
  assert.match(f[0].fix, /name the system uses/);
});

test('a near miss of a name the system has is said, with the name it has', () => {
  const [f] = checkPage(page('tileOne', { rules: [{ text: 'Fill `emptyLabl` when there are no rows.' }] }), FACTS(), { component: 'tileOne' });
  assert.match(f.truth, /The system has `emptyLabel`/);
  assert.match(f.fix, /^Write `emptyLabel`/);
});

test('a prop set to a value takes that value; a prop no component has is not in the system; another component\'s prop is not held to this one', () => {
  const f = checkPage(page('tileOne', { whenToUse: [
    'Use `tone="loud"` for alerts and `tone="shouty"` for nothing.',
    'Set `dense=maybe` in tables.',
    'Inside a list, `emptyLabel="None"` on `ListMain`.',
    'Set `glowing=true`.',
    'Use `tone=calm/loud` as the tone.',
  ] }), FACTS(), { component: 'tileOne' });
  assert.deepEqual(f.map((x) => [x.kind, x.says]), [
    ['claim', '`tone` = `shouty` on tileOne'], ['claim', '`dense` = `maybe` on tileOne'], ['name', '`glowing`'],
  ]);
  assert.match(f[0].truth, /`tone` takes `calm`, `loud`/);
  assert.match(f[1].truth, /on or off/);
});

test('the values a page lists for a prop are its values', () => {
  const [f] = checkPage(page('tileOne', { rules: [{ text: 'Choose the tone through `tone`: `calm`, `loud` or `bright`.' }] }), FACTS(), { component: 'tileOne' });
  assert.equal(f.kind, 'claim');
  assert.match(f.says, /`tone` takes `bright`/);
});

test('what it says the component does for accessibility is held to the accessibility check; an instruction is not', () => {
  const f = checkPage(page('tileOne', { purpose: ['A tile that is fully keyboard accessible.'], rules: [{ text: 'The parent owns keyboard focus; do not make it keyboard accessible yourself.' }] }), FACTS(), { component: 'tileOne' });
  assert.equal(f.length, 1);
  assert.equal(f[0].source, 'the accessibility check');
  assert.match(f[0].truth, /1 problem with keyboard use in tileOne \(WCAG 2\.1\.1\): Make it reachable with Tab\./);
});

test('its code file is the component\'s, and a deprecated component is not called stable', () => {
  const f = checkPage(page('listMain', {}, { code: 'src/lists/OldList.vue', status: 'stable' }), FACTS(), { component: 'listMain' });
  assert.deepEqual(f.map((x) => x.where), ['Code', 'Status']);
  assert.match(f[0].truth, /listMain is in src\/lists\/ListMain\.vue/);
  assert.match(f[1].truth, /listMain is deprecated/);
});

test('a page is out of date when its component changed after it was last edited', () => {
  const facts = FACTS();
  facts.changed.tileOne = { at: '2026-03-02T10:00:00Z', added: ['glow'], removed: ['dense'], how: 'props' };
  const [f] = checkPage(page('tileOne', {}, { updatedAt: '2026-03-01T10:00:00Z' }), facts, { component: 'tileOne' });
  assert.equal(f.kind, 'stale');
  assert.match(f.truth, /tileOne changed on 2 Mar 2026: new props `glow`; props removed `dense`, after this page was last edited\./);
  assert.equal(checkPage(page('tileOne', {}, { updatedAt: '2026-03-03T10:00:00Z' }), facts, { component: 'tileOne' }).length, 0);
});

test('the engine keeps each component\'s props between runs and dates the run that saw them change', () => {
  const root = mkdtempSync(join(tmpdir(), 'truth-'));
  const v1 = { tileOne: { props: { tone: { options: ['calm'] }, dense: {} } } };
  assert.deepEqual(componentChanges(root, v1, { now: '2026-01-01T00:00:00Z' }), {});
  assert.deepEqual(componentChanges(root, v1, { now: '2026-01-02T00:00:00Z' }), {});
  const v2 = { tileOne: { props: { tone: { options: ['calm', 'loud'] }, glow: {} } } };
  assert.deepEqual(componentChanges(root, v2, { now: '2026-01-03T00:00:00Z' }).tileOne, { at: '2026-01-03T00:00:00Z', added: ['glow'], removed: ['dense'], how: 'props' });
  // Unchanged since: the date of the change is kept.
  assert.equal(componentChanges(root, v2, { now: '2026-01-04T00:00:00Z' }).tileOne.at, '2026-01-03T00:00:00Z');
  assert.ok(JSON.parse(readFileSync(join(root, CHANGES_FILE), 'utf8')).tileOne.sig);
});

test('two components\' pages that say the same are twins; lines a template writes everywhere are not counted', () => {
  const same = ['Use it to show one subject at a glance.', 'Keep its title to one line.', 'Do not nest it in another tile.'];
  const tpl = 'This component is part of the Acme library and follows its rules.';
  const a = page('tileOne', { whenToUse: [...same, tpl] }), b = page('tileTwo', { whenToUse: [...same, tpl] }), c = page('listMain', { whenToUse: [tpl, 'Use it for rows of one kind.'] });
  const t = twins([[a, 'tileOne'], [b, 'tileTwo'], [c, 'listMain']]);
  assert.deepEqual([...t.keys()].map((e) => e.name), ['tileOne', 'tileTwo']);
  assert.match(t.get(a)[0].truth, /tileTwo's page \(components\/tileTwo\.dsds\.json\) says the same/);
});

test('a page with a finding is Fix, above Write and Improve, its findings first in what to do', () => {
  assert.ok(ACTIONS.findIndex(([k]) => k === 'fix') < ACTIONS.findIndex(([k]) => k === 'write'));
  const e = page('tileOne', { purpose: ['A tile for one subject.'], whenToUse: ['Set `showBadgeCount` to show a count.'] });
  const snap = { _source: {}, entities: [e] };
  const matched = matchComponents(['tileOne'], snap.entities, {});
  const found = checkLayer(snap, matched, FACTS());
  const rep = useReport(snap, matched, { names: ['tileOne'], wrongOf: (x) => found.get(x) ?? [] });
  assert.equal(rep.pages[0].action, 'fix');
  assert.equal(rep.actions.fix, 1);
  assert.match(rep.pages[0].todo[0], /^`showBadgeCount`: Write the name the system uses/);
  assert.equal(rep.pages[0].wrong[0].kind, 'name');
  // What the agents get leaves the wrong sentence out, and lists it.
  const ci = componentIntent(e, {}, found.get(e));
  assert.deepEqual(ci.whenToUse, null);
  assert.deepEqual(ci.purpose, 'A tile for one subject.');
  assert.equal(ci.wrong[0].line, 'Set `showBadgeCount` to show a count.');
});

test('the report says each finding with the sentence, what the system has and what to do', () => {
  const { n, text } = report([['tileOne (components/tileOne.dsds.json)', checkPage(page('tileOne', { whenToUse: ['Set `showBadgeCount`.'] }), FACTS(), { component: 'tileOne' })]]);
  assert.equal(n, 1);
  assert.match(text, /✗ Not in the system: When to use · "Set `showBadgeCount`\."\n {5}No component, prop or name/);
});

test('--check-intent checks a page before it is written, and exits 1 on a finding', () => {
  const root = mkdtempSync(join(tmpdir(), 'truth-cli-'));
  writeFileSync(join(root, 'ds-config.json'), JSON.stringify({ name: 'Acme' }));
  mkdirSync(join(root, '.design-system-engine-out'), { recursive: true });
  writeFileSync(join(root, '.design-system-engine-out', 'code.snapshot.json'), JSON.stringify({ api: { tileOne: { file: 'src/TileOne.vue', props: { tone: { type: 'string', options: ['calm', 'loud'] } } } }, tokens: {} }));
  mkdirSync(join(root, 'src')); writeFileSync(join(root, 'src', 'TileOne.vue'), '<template><div class="tile" /></template>');
  mkdirSync(join(root, 'draft', 'components'), { recursive: true });
  const draft = (statement) => writeFileSync(join(root, 'draft', 'components', 'tile.dsds.json'), JSON.stringify({ kind: 'component', id: 'component-tile-one', name: 'Tile One', sections: [{ kind: 'guidelines', title: 'When to use', items: [{ statement }] }] }));
  draft('Use `tone="bright"` for alerts.');
  const bad = spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--check-intent', 'draft'], { cwd: root, encoding: 'utf8' });
  assert.equal(bad.status, 1, bad.stdout + bad.stderr);
  assert.match(bad.stdout, /`tone` takes `calm`, `loud`/);
  assert.match(bad.stdout, /NEXT: fix each finding in the page/);
  draft('Use `tone="loud"` for alerts.');
  const ok = spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--check-intent', 'draft'], { cwd: root, encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /1 page checked: nothing on it is contradicted by the system/);
});

test('the same wrong name in two sentences is two findings, one for each sentence to fix', () => {
  const f = checkPage(page('tileOne', { whenToUse: ['Set `showBadgeCount` to show a count.'], rules: [{ text: 'With `showBadgeCount` the count shows.' }] }), FACTS(), { component: 'tileOne' });
  assert.equal(f.length, 2);
  assert.deepEqual(f.map((x) => x.where), ['When to use', 'Rules']);
});

test('a value only Figma lists the options of is right when the component\'s own code takes it (Figma\'s positive is the code\'s success)', () => {
  const facts = factsFrom({ components: { toastOne: { file: 'src/Toast.vue', props: { status: { type: 'variant', options: ['positive', 'info'], from: 'Figma' } }, codeWords: ['info', 'success'] } } });
  assert.equal(checkPage(page('toastOne', { rules: [{ text: 'Use `status="success"` when an action completed.' }] }), facts, { component: 'toastOne' }).length, 0);
  assert.equal(checkPage(page('toastOne', { rules: [{ text: 'Use `status="shiny"` when it shines.' }] }), facts, { component: 'toastOne' }).length, 1);
});

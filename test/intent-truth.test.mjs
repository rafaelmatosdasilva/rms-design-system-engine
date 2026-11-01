// intent-truth.mjs - whether what an intent-layer page says is true of the system: names it writes as code, props it
// sets and their values, what it says of accessibility, its code file and status, whether its component changed since
// it was written, and pages that say the same. An invented system (Acme): tileOne, listMain, a few tokens and files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { factsFrom, checkPage, twins, checkLayer, componentChanges, report, CHANGES_FILE, changesSince, changeWords } from '../lib/intent-truth.mjs';
import { useReport, componentIntent, agentText, matchComponents, ACTIONS } from '../lib/intent-layer.mjs';
import { intentLayerOf } from '../lib/prototype-context.mjs';
import { tempDir } from './helpers.mjs';
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
  const root = tempDir('truth-');
  const v1 = { tileOne: { props: { tone: { options: ['calm'] }, dense: {} } } };
  assert.deepEqual(componentChanges(root, v1, { now: '2026-01-01T00:00:00Z' }), {});
  assert.deepEqual(componentChanges(root, v1, { now: '2026-01-02T00:00:00Z' }), {});
  const v2 = { tileOne: { props: { tone: { options: ['calm', 'loud'] }, glow: {} } } };
  const { log, ...last } = componentChanges(root, v2, { now: '2026-01-03T00:00:00Z' }).tileOne;
  assert.deepEqual(last, { at: '2026-01-03T00:00:00Z', added: ['glow'], removed: ['dense'], how: 'props' });
  assert.deepEqual(log[0].values, [{ prop: 'tone', added: ['loud'], removed: [] }]);
  // Unchanged since: the date of the change is kept.
  assert.equal(componentChanges(root, v2, { now: '2026-01-04T00:00:00Z' }).tileOne.at, '2026-01-03T00:00:00Z');
  assert.ok(JSON.parse(readFileSync(join(root, CHANGES_FILE), 'utf8')).tileOne.sig);
});

test('the engine keeps each component\'s tokens and the values its props take, and says which changed', () => {
  const root = tempDir('truth-tokens-');
  // A record kept before tokens were: today's tokens are where they start, never a change of their own.
  mkdirSync(join(root, CHANGES_FILE, '..'), { recursive: true });
  writeFileSync(join(root, CHANGES_FILE), JSON.stringify({ tileOne: { sig: 'tone:calm', props: ['tone'], since: null } }));
  const v1 = { tileOne: { props: { tone: { options: ['calm'] } }, tokens: ['--acme-tile-bg'] } };
  assert.deepEqual(componentChanges(root, v1, { now: '2026-02-01T00:00:00Z' }), {});
  const v2 = { tileOne: { props: { tone: { options: ['calm'] } }, tokens: ['--acme-tile-ink'] } };
  const ch = componentChanges(root, v2, { now: '2026-02-02T00:00:00Z' }).tileOne;
  assert.equal(ch.how, 'tokens');
  assert.deepEqual([ch.log[0].tokensAdded, ch.log[0].tokensRemoved], [['--acme-tile-ink'], ['--acme-tile-bg']]);
  const v3 = { tileOne: { props: { tone: { options: ['loud'] } }, tokens: ['--acme-tile-ink'] } };
  const ch3 = componentChanges(root, v3, { now: '2026-02-03T00:00:00Z' }).tileOne;
  assert.equal(ch3.log.length, 2, 'every change is kept, not only the last');
  assert.deepEqual(changeWords(ch3.log), ['new tokens `--acme-tile-ink`; tokens removed `--acme-tile-bg`', '`tone` takes `loud` now and no longer takes `calm`']);
  assert.deepEqual(changesSince(ch3, '2026-02-02T12:00:00Z').map((e) => e.at), ['2026-02-03T00:00:00Z']);
});

test('a read of Figma that changed the component is dated from the snapshots store\'s history, never fetched', () => {
  const root = tempDir('truth-figma-');
  const ch = componentChanges(root, { tileOne: { props: {} } }, { now: '2026-02-01T00:00:00Z', figma: { tileOne: [{ date: '2026-02-05T09:00:00Z', changed: ['property size added'] }], gone: [{ date: '2026-02-05T09:00:00Z', changed: ['x'] }] } });
  assert.deepEqual(Object.keys(ch), ['tileOne']);
  assert.equal(ch.tileOne.how, 'figma');
  assert.deepEqual(changeWords(ch.tileOne.log), ['Figma: property size added']);
});

test('a page whose component changed is marked to review again, with what changed and since when, until a person confirms it', () => {
  const facts = FACTS();
  facts.changed.tileOne = { at: '2026-03-05T10:00:00Z', added: [], removed: [], how: 'props', log: [
    { at: '2026-03-02T10:00:00Z', how: 'props', added: ['glow'], removed: ['dense'] },
    { at: '2026-03-05T10:00:00Z', how: 'tokens', added: [], removed: [], tokensRemoved: ['--acme-tile-bg'] },
  ] };
  const e = page('tileOne', { whenToUse: ['Set `dense` in tables.'] }, { updatedAt: '2026-03-01T10:00:00Z' });
  const [f] = checkPage(e, facts, { component: 'tileOne' }).filter((x) => x.kind === 'stale');
  assert.match(f.truth, /^tileOne changed on 5 Mar 2026: new props `glow`; props removed `dense`; tokens removed `--acme-tile-bg`, after this page was last edited\. The page still names `dense`\.$/);
  assert.deepEqual([f.at, f.since, f.gone], ['2026-03-05T10:00:00Z', '2026-03-01T10:00:00Z', ['dense']]);
  // Confirmed after the first change: only the later one is said.
  const [g] = checkPage(e, facts, { component: 'tileOne', reviewedAt: '2026-03-03T10:00:00Z' }).filter((x) => x.kind === 'stale');
  assert.match(g.truth, /changed on 5 Mar 2026: tokens removed `--acme-tile-bg`, after this page was last confirmed\.$/);
  assert.match(g.says, /^confirmed on 3 Mar 2026/);
  // Confirmed after both: nothing to review until it changes again.
  assert.equal(checkPage(e, facts, { component: 'tileOne', reviewedAt: '2026-03-06T10:00:00Z' }).filter((x) => x.kind === 'stale').length, 0);
  // The layer's check takes the confirmation for each page.
  const snap = { _source: {}, entities: [e] };
  const found = checkLayer(snap, matchComponents(['tileOne'], snap.entities, {}), facts, { reviewedOf: () => '2026-03-06T10:00:00Z' });
  assert.ok(!(found.get(e) ?? []).some((x) => x.kind === 'stale'));
});

test('a page to review again is a note beside it for agents, never taken out, and its decision is Review', () => {
  const facts = FACTS();
  facts.changed.tileOne = { at: '2026-03-02T10:00:00Z', added: ['glow'], removed: [], how: 'props' };
  const e = page('tileOne', { purpose: ['A tile for one subject.'], whenToUse: ['Use it for one subject.'] }, { updatedAt: '2026-03-01T10:00:00Z' });
  const wrong = checkPage(e, facts, { component: 'tileOne' });
  const ci = componentIntent(e, {}, wrong);
  assert.deepEqual(ci.whenToUse, ['Use it for one subject.'], 'every line still reaches the agents');
  assert.match(ci.review.note, /^To review again: tileOne changed on 2 Mar 2026: new props `glow`.*follow the contract\.$/);
  assert.deepEqual(agentText(e, {}, wrong).review, [ci.review.note]);
  assert.equal(intentLayerOf(ci).review, ci.review.note);
  const snap = { _source: {}, entities: [e] };
  const rep = useReport(snap, matchComponents(['tileOne'], snap.entities, {}), { names: ['tileOne'], wrongOf: () => wrong });
  assert.equal(rep.pages[0].action, 'review');
  assert.match(rep.pages[0].todo[0], /^Review it again: tileOne changed on 2 Mar 2026/);
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
  assert.match(rep.pages[0].todo[0], /^`showBadgeCount` is not a name the system has\. Write the name the system uses/);
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
  const root = tempDir('truth-cli-');
  writeFileSync(join(root, 'ds-config.json'), JSON.stringify({ name: 'Acme' }));
  mkdirSync(join(root, '.design-system-engine-out'), { recursive: true });
  writeFileSync(join(root, '.design-system-engine-out', 'code.snapshot.json'), JSON.stringify({ api: { tileOne: { file: 'src/TileOne.vue', props: { tone: { type: 'string', options: ['calm', 'loud'] } } } }, tokens: {} }));
  mkdirSync(join(root, 'src')); writeFileSync(join(root, 'src', 'TileOne.vue'), '<template><div class="tile" /></template>');
  mkdirSync(join(root, 'draft', 'components'), { recursive: true });
  const draft = (statement) => writeFileSync(join(root, 'draft', 'components', 'tile.dsds.json'), JSON.stringify({ kind: 'component', id: 'component-tile-one', name: 'Tile One', sections: [{ kind: 'guidelines', title: 'When to use', items: [{ statement }] }] }));
  draft('Use `tone="bright"` for alerts.');
  const bad = spawnSync(process.execPath, [join(ENGINE, 'lib', 'audit.mjs'), '--check-intent', 'draft'], { cwd: root, encoding: 'utf8' });
  assert.equal(bad.status, 1, bad.stdout + bad.stderr);
  assert.match(bad.stdout, /`tone` takes `calm`, `loud`/);
  assert.match(bad.stdout, /NEXT: fix each finding in the page/);
  draft('Use `tone="loud"` for alerts.');
  const ok = spawnSync(process.execPath, [join(ENGINE, 'lib', 'audit.mjs'), '--check-intent', 'draft'], { cwd: root, encoding: 'utf8' });
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

test('a name in a list under "Incorrect:" is an example not to follow, not a finding', () => {
  const f = checkPage(page('tileOne', { sections: [{ title: 'Naming', text: 'Correct:\n- `tileOne`\n\nIncorrect:\n- `tile-one-old`\n- `tileOneOld`' }] }), FACTS(), { component: 'tileOne' });
  assert.equal(f.length, 0);
});

test('a name is in the system when the code, Figma or the project has it: the documentation rating asks the same', async () => {
  const { inSystem } = await import('../lib/intent-truth.mjs');
  const f = factsFrom({ components: { tileOne: { props: { size: {} } } }, tokens: ['--acme-space-s'], text: 'props: { errorMessage: String }', files: ['src/tiles/Tile.vue'], layerFiles: ['specs/guide.md'] });
  for (const n of ['tileOne', 'size', '--acme-space-s', 'errorMessage', 'src/tiles/Tile.vue', 'specs/guide.md', 'aria-label', 'button', '<TileOne size="s" />']) assert.equal(inSystem(f, n), true, n);
  for (const n of ['tileTwo', 'warningMessage', 'src/tiles/Gone.vue']) assert.equal(inSystem(f, n), false, n);
});

test('a project that commits its Figma snapshots: each read of Figma that changed a component dates it, its first read does not', async () => {
  const { systemFacts } = await import('../lib/intent-truth.mjs');
  const dir = tempDir('truth-figma-git-');
  const env = (at) => ({ ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', GIT_AUTHOR_DATE: at, GIT_COMMITTER_DATE: at });
  const git = (at, ...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8', env: env(at) });
  git('2026-03-01T00:00:00Z', 'init', '-q', '-b', 'main');
  const snap = (opts) => JSON.stringify({ cardTile: { properties: { 'Size#1:0': { type: 'VARIANT', variantOptions: opts, defaultValue: opts[0] } } } });
  writeFileSync(join(dir, 'figma-component-props.snapshot.json'), snap(['S']));
  git('2026-03-01T00:00:00Z', 'add', '-A'); git('2026-03-01T00:00:00Z', 'commit', '-qm', 'Figma read');
  assert.equal(systemFacts(dir, {}, { record: false }).changed.cardTile, undefined, 'the first read is not a change');
  writeFileSync(join(dir, 'figma-component-props.snapshot.json'), snap(['S', 'M']));
  git('2026-03-04T00:00:00Z', 'commit', '-qam', 'Figma read again');
  const ch = systemFacts(dir, {}, { record: false }).changed.cardTile;
  assert.equal(ch.how, 'figma');
  assert.equal(new Date(ch.at).toISOString(), '2026-03-04T00:00:00.000Z');
  assert.match(changeWords(changesSince(ch, '2026-03-02T00:00:00Z'))[0], /^Figma: property Size/);
});

test('a decision is dated like a page: its component is found from its key, and a change after it (or after its confirmation) marks it', async () => {
  const { decisionComponent, decisionsToReview } = await import('../lib/intent-truth.mjs');
  const pages = { 'Tile One': 'tileOne', Picker: 'datePicker' };
  const pc = (p) => pages[p] ?? null;
  assert.deepEqual(['add:cardTile', 'fix:Tile One:tileRow', 'move:Picker', 'review:Tile One', 'recheck:add:cardTile', 'other:x'].map((k) => decisionComponent(k, pc)), ['cardTile', 'tileOne', 'datePicker', null, null, null]);
  const changed = { datePicker: { at: '2026-04-02T00:00:00Z', how: 'file', file: 'src/date/Picker.vue', added: [], removed: [] } };
  const d = { 'move:Picker': { answer: 'yes', at: '2026-04-01T00:00:00Z' }, 'add:cardTile': { answer: 'no', at: '2026-04-01T00:00:00Z' } };
  const r = decisionsToReview(d, changed, { pageComponent: pc });
  assert.deepEqual(Object.keys(r), ['move:Picker'], 'a component that never changed has nothing to review');
  assert.equal(r['move:Picker'].truth, 'Picker.vue changed on 2 Apr 2026, after this decision was recorded.');
  assert.match(r['move:Picker'].note, /^To review again: Picker\.vue changed/);
  assert.deepEqual(decisionsToReview({ ...d, 'recheck:move:Picker': { answer: 'yes', at: '2026-04-03T00:00:00Z' } }, changed, { pageComponent: pc }), {}, 'confirmed after the change');
  assert.deepEqual(decisionsToReview(d, changed, { pageComponent: pc, only: (k) => k !== 'move:Picker' }), {});
});

// The engine writes a component's Data line from its code facts, which take a list prop's item fields from its doc
// comment; the content check reads the code without its comments. It now knows those fields too, so the engine's own
// line is never called wrong, in a Vue file or a TS one, and a field no one wrote is still flagged.
test('a list prop\'s item fields that only its doc comment names are in the system, as the Data line the engine writes says', async () => {
  const { systemFacts } = await import('../lib/intent-truth.mjs');
  const { factLines } = await import('../lib/intent-changes.mjs');
  const { codeSnapshotPath, OUT_DIR } = await import('../lib/names.mjs');
  const { docFields } = await import('../lib/prop-shapes.mjs');
  const dir = tempDir('truth-item-fields-');
  mkdirSync(join(dir, 'src', 'tiles'), { recursive: true });
  mkdirSync(join(dir, 'src', 'cards'), { recursive: true });
  const vue = `<template><ul class="acme-tiles"><li v-for="t in tileData" :key="t.id">{{ t.id }}</li></ul></template>
<script setup>
/**
 * @tileData {Array} the tiles it shows
 *   - tileHeading {String} what each tile says
 *   - tileState {Object} how it is, with:
 *     - stateTone {String} its colour
 */
defineProps({ tileData: Array })
</script>`;
  const ts = `import React from 'react';
interface CardListProps {
  /**
   * @cardRows {Array} the rows
   *   - rowCaption {String} what the row says
   *   - rowWeight [Number]: how much it counts
   */
  cardRows: Array<Record<string, unknown>>;
}
export function CardList({ cardRows }: CardListProps) { return <ol className="acme-cards">{cardRows.length}</ol>; }`;
  writeFileSync(join(dir, 'src', 'tiles', 'TileGrid.vue'), vue);
  writeFileSync(join(dir, 'src', 'cards', 'CardList.tsx'), ts);
  const api = {
    tileGrid: { file: 'src/tiles/TileGrid.vue', props: { tileData: { type: 'array' } } },
    cardList: { file: 'src/cards/CardList.tsx', props: { cardRows: { type: 'array' } } },
  };
  mkdirSync(join(dir, codeSnapshotPath({}), '..'), { recursive: true });
  writeFileSync(join(dir, codeSnapshotPath({})), JSON.stringify({ api, tokens: {} }));
  const page = (name, text) => ({ kind: 'component', layer: 'components', name, file: `components/${name}.dsds.json`, rules: [{ text }] });
  const says = (facts, name, text) => checkPage(page(name, text), facts, { component: name }).filter((f) => f.kind === 'name').map((f) => f.says);
  // Before any prototype check kept the code facts: read from the doc comment itself.
  let facts = systemFacts(dir, {}, { record: false });
  assert.deepEqual(says(facts, 'tileGrid', 'Data: `tileData` holds a list of items, each with `tileHeading`, `tileState`. Its `stateTone` sets the colour.'), []);
  assert.deepEqual(says(facts, 'cardList', 'Data: `cardRows` holds a list of items, each with `rowCaption`, `rowWeight`.'), []);
  assert.deepEqual(says(facts, 'tileGrid', 'Each item has a `tileHeadline`.'), ['`tileHeadline`'], 'a field no comment or code names is still not in the system');
  // With the code facts the prototype check keeps (the same the Data line is written from), and a key only the
  // product's own use gives: the line the engine writes from them passes its own check.
  const comps = Object.fromEntries(Object.entries(api).map(([n, a]) => [n, { name: n, file: a.file, props: a.props, fields: docFields(n === 'tileGrid' ? vue : ts) }]));
  mkdirSync(join(dir, OUT_DIR, 'prototypes'), { recursive: true });
  writeFileSync(join(dir, OUT_DIR, 'prototypes', 'page-system.json'), JSON.stringify({ components: comps, uses: { 'tileGrid\u0000tileData': { values: [[{ tileHeading: 'A', tileBadge: 'new' }]] } } }));
  facts = systemFacts(dir, {}, { record: false });
  const { codeFactsFor } = await import('../lib/intent-changes.mjs');
  const k = codeFactsFor(dir, facts).get('src/tiles/TileGrid.vue');
  const [line] = factLines(k);
  assert.equal(line.text, '`tileData` holds a list of items, each with `tileHeading`, `tileState`, `tileBadge`.');
  assert.deepEqual(says(facts, 'tileGrid', `Data: ${line.text}`), [], 'the engine\'s own Data line is true of the system');
  assert.deepEqual(says(facts, 'cardList', `Data: ${factLines(codeFactsFor(dir, facts).get('src/cards/CardList.tsx'))[0].text}`), []);
});

// A part is a component only ever placed inside another (its root): found when its Figma path, or its name and the
// root's nesting, agree; asked about when only one says so; the team's answer wins.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { partsOf, partAnswers } from '../component-parts.mjs';

const NAMES = ['tileList', 'tileListRow', 'tileListAlt', 'tileCardRow', 'tileCardBank', 'chipGroup', 'chip', 'grid', 'grid/Row', 'grid/Cell/text',
  'searchField', 'pillBackground', 'pill', 'orderRow', 'buttonQuiet', 'buttonPromo'];
const USES = {
  tileList: ['tileListRow'], searchField: ['tileListRow', 'tileCardRow'], tileCardBank: ['tileCardRow'], tileCardRow: ['tileCardBank'],
  chipGroup: ['chip'], buttonPromo: ['buttonQuiet'],
};

test('a part: under another component\'s Figma path, or named after the root that holds it', () => {
  const { partOf, partsByRoot } = partsOf({ names: NAMES, uses: USES });
  assert.deepEqual(partOf.tileListRow, { root: 'tileList', by: 'name and nesting' }, 'another component holding it too changes nothing');
  assert.deepEqual(partOf['grid/Row'], { root: 'grid', by: 'its Figma path' });
  assert.deepEqual(partOf['grid/Cell/text'], { root: 'grid', by: 'its Figma path' }, 'the nearest component above it');
  assert.deepEqual(partsByRoot, { tileList: ['tileListRow'], grid: ['grid/Cell/text', 'grid/Row'] });
});

test('never from one thing alone: a shared first word, nesting alone or a group of it are components', () => {
  const { partOf } = partsOf({ names: NAMES, uses: USES });
  assert.equal(partOf.buttonQuiet, undefined, 'button alone is no stem: buttonPromo holding it makes nothing');
  assert.equal(partOf.chip, undefined, 'chipGroup holds chip: a group of chips, not chip\'s part');
  assert.equal(partOf.chipGroup, undefined);
  assert.equal(partOf.tileListAlt, undefined, 'the name only: tileList does not hold it');
});

test('one signal only is a question, asked once; a group of a component asks nothing', () => {
  const { questions } = partsOf({ names: NAMES, uses: USES });
  const q = Object.fromEntries(questions.map((x) => [x.part, x]));
  assert.deepEqual(q.tileCardRow.roots, ['tileCardBank'], 'each holds the other: which one is the root');
  assert.equal(q.tileCardBank, undefined, 'the pair asked once');
  assert.deepEqual(q.tileListAlt.roots, ['tileList']);
  assert.deepEqual(q.pillBackground.roots, ['pill']);
  assert.deepEqual(q.orderRow.roots, [], 'named as a piece, held by nothing: is its root missing?');
  assert.equal(q.chipGroup, undefined);
});

test('the team\'s answer wins: Part of: in Figma, a heading under the root\'s Parts, a component of its own', () => {
  const said = partAnswers({ descriptions: { tileCardRow: 'A row.\nPart of: tileCardBank' }, rootParts: { pill: ['pillBackground'] }, ownComponents: ['tileListRow'] });
  assert.deepEqual(said, { tileCardRow: 'tileCardBank', pillBackground: 'pill', tileListRow: null });
  const { partOf, questions } = partsOf({ names: NAMES, uses: USES, said });
  assert.deepEqual(partOf.tileCardRow, { root: 'tileCardBank', by: 'the team' });
  assert.deepEqual(partOf.pillBackground, { root: 'pill', by: 'the team' });
  assert.equal(partOf.tileListRow, undefined, 'kept a component of its own');
  assert.ok(!questions.some((x) => ['tileCardRow', 'pillBackground', 'tileListRow'].includes(x.part)), 'an answer is never asked again');
});

test('a part is documented in its root\'s page: ### its name under Parts, read from the spec and the page alike', async () => {
  const { mdParts, entityView } = await import('../doc-source-dsds.mjs');
  assert.deepEqual(mdParts('# Tile list\n\n## Usage\n\n- For lists.\n\n## Parts\n\n### tileListRow\n\nPart of tileList, placed only inside it.\n\n- One line a row.\n\n### `tileListHead`\n\nPart of tileList, placed only inside it.\n\n## API\n\n- size'),
    { tileListRow: ['One line a row.'], tileListHead: [] }, 'the line that makes it a part is not its documentation');
  const v = entityView({ kind: 'component', name: 'tileList', sections: [{ kind: 'section', title: 'Parts', freeform: [{ title: 'tileListRow', body: '- One line a row.' }] }, { kind: 'section', title: 'Usage', body: '- For lists.' }] }, 'a.json');
  assert.deepEqual(v.parts, { tileListRow: ['One line a row.'] });
  assert.deepEqual(v.whenToUse, ['For lists.'], 'nothing of the part is read as the root\'s own');
});

test('an answer is written in the intent layer: the part under its root\'s Parts and a decision; or a component of its own', async () => {
  const { partPlan, mdAddPart } = await import('../intent-changes.mjs');
  const md = '# Tile list\n\n## Purpose\n\nA list.\n\n## API\n\n- size\n';
  assert.equal(mdAddPart(md, 'tileListRow', 'Part of tileList, placed only inside it.'), md.replace(/\s*$/, '\n\n') + '## Parts\n\n### tileListRow\n\nPart of tileList, placed only inside it.\n');
  const once = mdAddPart('# T\n\n## Parts\n\n### a\n\nPart of T.\n\n## Decisions\n\n- x\n', 'b', 'Part of T.');
  assert.match(once, /### a\n\nPart of T\.\n\n### b\n\nPart of T\.\n\n## Decisions/, 'beside the others, before Decisions');
  assert.equal(mdAddPart(once, 'b', 'Part of T.'), once, 'never twice');
  const snap = { entities: [{ kind: 'component', name: 'tileList', file: 'specs/dsds/components/tile-list.dsds.json' }, { kind: 'component', name: 'tileListRow', file: 'specs/dsds/components/tile-list-row.dsds.json' }] };
  const files = new Map([['specs/components/tile-list.md', md], ['specs/dsds/components/tile-list.dsds.json', '{"name":"tileList"}'], ['specs/dsds/components/tile-list-row.dsds.json', '{"name":"tileListRow"}']]);
  const yes = partPlan(snap, 'tileListRow', 'tileList', files);
  assert.equal(yes.file, 'specs/components/tile-list.md');
  assert.match(yes.files.get(yes.file), /## Parts\n\n### tileListRow\n\nPart of tileList, placed only inside it\.\n\n## Decisions\n\n- tileListRow is a part of tileList, placed only inside it\.\n/);
  const no = partPlan(snap, 'tileListRow', null, files);
  assert.equal(no.file, 'specs/dsds/components/tile-list-row.dsds.json', 'on its own page');
  assert.match(no.files.get(no.file), /tileListRow is a component of its own, placed on its own\./);
  assert.match(partPlan(snap, 'orderRow', null, files).error, /no page in the intent layer is about orderRow/);
});

test('agents place the root: llms.txt lists a part under it, never as a component to choose', async () => {
  const { buildLlms } = await import('../contract-gen.mjs');
  const built = [{ name: 'tileList', contract: { description: 'A list.', props: [] } }, { name: 'tileListRow', contract: { description: 'A row.', props: [] } }];
  const txt = buildLlms(built, {}, 0, null, { partOf: { tileListRow: { root: 'tileList', docs: ['One line a row.'] } } });
  assert.match(txt, /\[tileList\]/);
  assert.doesNotMatch(txt, /\[tileListRow\]/);
  assert.match(txt, /- parts \(placed only inside it, never on their own\): tileListRow\n\s+- tileListRow: One line a row\./);
});

test('asked in words, a part goes to --part: the one named before "part of" is the part, the one after its root', async () => {
  const { route } = await import('../route.mjs');
  const P = { hasConfig: true, components: ['tileList', 'tileListRow'] };
  assert.deepEqual(route('tileListRow is a part of tileList', P).run, ['rms-design-system-engine --part tileListRow tileList']);
  assert.deepEqual(route('tileListRow is its own component', P).run, ['rms-design-system-engine --part tileListRow none']);
  const vague = route('the row is a part of the tile list', P);
  assert.deepEqual(vague.run, ['rms-design-system-engine --part <part> tileList']);
  assert.ok(vague.ask, 'the part it does not name is asked');
});

// intent-answers.mjs - what each of the team's answers to the engine's proposals changes in the intent layer's files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answersFor, markPart, addRow, applyMerges, startPage } from '../intent-answers.mjs';
import { planOf } from '../intent-changes.mjs';

const ent = (name, code, extra = {}) => ({ kind: 'component', layer: 'components', name, file: `specs/dsds/tiles/${name.toLowerCase().replace(/ /g, '-')}.dsds.json`, code, purpose: [], whenToUse: [], whenNotToUse: [], mistakes: [], limitations: [], rules: [], sections: [], ...extra });
const grip = ent('Tile Grip', 'src/tiles/Grip.vue', { purpose: ['Lets a person drag a tile.'], whenNotToUse: ['Not for lists.', 'Another component owns it more specifically.'], repeatedLines: ['Another component owns it more specifically.'] });
const one = ent('Tile One', 'src/tiles/TileOne.vue', { whenNotToUse: ['Not for lists.'] });
const snap = { _source: {}, entities: [grip, one] };
const TABLE = '| Name | Source | Note |\n| --- | --- | --- |\n| `tileOne` | `src/tiles/TileOne.vue` | A tile. |\n| `tileGrip` | `src/tiles/Grip.vue` | The grip. |\n| `listMain` | `src/lists/Main.vue` | A list. |\n';
const page = (e) => JSON.stringify({ kind: 'component', id: `component-${e.name}`, name: e.name, description: 'x', metadata: { status: { status: 'stable' }, tags: ['component'] }, sections: [] }, null, 2) + '\n';
const files = () => new Map([
  ['specs/governance/manifest.md', TABLE],
  ['specs/components/tile-grip.md', '# Tile Grip\n\n- Source: `src/tiles/Grip.vue`\n\n## When not to use\n\n- Not for lists.\n'],
  ['specs/components/tile-one.md', '# Tile One\n\n- Source: `src/tiles/TileOne.vue`\n\n## When not to use\n\n- Not for lists.\n'],
  [grip.file, page(grip)], [one.file, page(one)]
]);

test('each answer asks its own change: a fix waits until answered, a no to a move merges, a page to write is started', () => {
  const proposals = new Map([
    ['fix:Tile One:tileGrap', { kind: 'fix', page: 'Tile One', subject: 'tileGrap' }],
    ['move:Tile Grip', { kind: 'move', page: 'Tile Grip', by: ['src/tiles/TileOne.vue'] }],
    ['add:tileTwo', { kind: 'add', subject: 'tileTwo', effect: 'write' }],
    ['add:tileRow', { kind: 'add', subject: 'tileRow', effect: 'documented' }]
  ]);
  const a = answersFor({ snap, report: { pages: [] }, proposals, decisions: { 'move:Tile Grip': { answer: 'no' }, 'add:tileTwo': { answer: 'yes' }, 'add:tileRow': { answer: 'yes' } }, codeFiles: { tileTwo: 'src/tiles/TileTwo.vue' } });
  assert.deepEqual([...a.hold], ['fix:Tile One:tileGrap']);
  assert.deepEqual(a.merges.map((m) => [m.part.name, m.into.name]), [['Tile Grip', 'Tile One']]);
  assert.deepEqual(a.creates, [{ name: 'tileTwo', code: 'src/tiles/TileTwo.vue' }], 'a yes to "documented elsewhere" starts no page');
  const b = answersFor({ snap, report: { pages: [] }, proposals, decisions: { 'fix:Tile One:tileGrap': { answer: 'no' }, 'move:Tile Grip': { answer: 'yes' }, 'add:tileRow': { answer: 'no' } }, codeFiles: { tileRow: 'src/tiles/Row.vue' } });
  assert.equal(b.hold.size, 0); assert.equal(b.merges.length, 0);
  assert.deepEqual(b.creates.map((c) => c.name), ['tileRow'], 'a no to "documented elsewhere" starts its page');
});

test('a fix the team has not answered is not written again until it is', () => {
  const e = ent('Tile One', 'src/tiles/TileOne.vue', { whenToUse: ['Pair it with `tileGrap`.'] });
  const report = { pages: [{ name: 'Tile One', file: e.file, action: 'fix', wrong: [{ kind: 'name', says: '`tileGrap`', line: 'Pair it with `tileGrap`.' }] }] };
  const s = { _source: {}, entities: [e] };
  assert.equal(planOf(s, report, { hold: new Set(['fix:Tile One:tileGrap']) }).length ? planOf(s, report, { hold: new Set(['fix:Tile One:tileGrap']) })[0].rewrite.length : 0, 0);
  assert.equal(planOf(s, report)[0].rewrite.length, 1, 'answered no: written again');
});

test('the layer\'s table of code files: a part noted as one, a new row beside its siblings', () => {
  const t = markPart(TABLE, 'src/tiles/Grip.vue', 'Tile One');
  assert.match(t, /\| `tileGrip` \| `src\/tiles\/Grip.vue` \| Part of `Tile One`\. The grip\. \|/);
  assert.equal(markPart(t, 'src/tiles/Grip.vue', 'Tile One'), t, 'noted once');
  const r = addRow(TABLE, 'tileTwo', 'src/tiles/TileTwo.vue', 'Started from the code.');
  assert.deepEqual(r.split('\n').slice(3, 6), ['| `tileGrip` | `src/tiles/Grip.vue` | The grip. |', '| `tileTwo` | `src/tiles/TileTwo.vue` | Started from the code. |', '| `listMain` | `src/lists/Main.vue` | A list. |']);
  assert.equal(addRow(r, 'tileTwo', 'src/tiles/TileTwo.vue', 'x'), r);
});

test('a no to keeping a part\'s page: what only it says drafted on its parent\'s, its page taken out, noted as a part', () => {
  const f = files(), next = new Map();
  const [m] = applyMerges([{ part: grip, into: one }], f, next);
  assert.deepEqual(m.moved, [{ where: 'When to use', text: 'Tile Grip: Lets a person drag a tile.' }], 'what its parent already says, and what every page says alike, is not moved');
  assert.match(next.get('specs/components/tile-one.md'), /## When to use\n\n- \*\*Draft:\*\* Tile Grip: Lets a person drag a tile\./);
  assert.match(next.get(one.file), /\*\*Draft:\*\* Tile Grip: Lets a person drag a tile\./);
  assert.ok(!next.has('specs/components/tile-grip.md'), 'its spec stays, as a part\'s spec does');
  assert.equal(next.get(grip.file), null);
  assert.match(next.get('specs/governance/manifest.md'), /`src\/tiles\/Grip.vue` \| Part of `Tile One`\./);
});

test('a page to write is started beside its siblings, in the layer\'s own shape', () => {
  const f = files();
  const s = startPage({ name: 'tileTwo', code: 'src/tiles/TileTwo.vue' }, snap, f);
  assert.equal(s.spec, 'specs/components/tile-two.md');
  assert.equal(s.file, 'specs/dsds/tiles/tile-two.dsds.json');
  assert.match(s.files.get(s.spec), /^# Tile Two\n\n## Metadata\n\n- Name: Tile Two\n[\s\S]*- Status: Draft\n- Source: `src\/tiles\/TileTwo.vue`\n$/);
  const doc = JSON.parse(s.files.get(s.file));
  assert.deepEqual([doc.kind, doc.id, doc.name, doc.metadata.status.status, doc.metadata.aliases], ['component', 'component-tile-two', 'Tile Two', 'draft', ['tileTwo']]);
  assert.equal(startPage({ name: 'tileOne', code: 'src/tiles/TileOne.vue' }, snap, new Map([...f, ['specs/dsds/tiles/tile-one.dsds.json', '{}']])), null, 'never over a page that is there');
});

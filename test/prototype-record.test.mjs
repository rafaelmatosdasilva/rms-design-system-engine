// prototype-record.mjs - each prototype's own evaluation, kept beside it.
//
// A prototype is a part of its own: read from the team's store into prototypes/ and sent back from it. The page
// travelled, its handoff travelled, what people said about it travelled - and nothing about whether it holds up
// did. Somebody opening a prototype from the store saw the page and not one thing about it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { checkRecord, writeCheck, readChecks, byComponent, checkLine, checkFile } from '../lib/prototype-record.mjs';
import { tempDir } from './helpers.mjs';

const items = [
  { component: 'Field', kind: 'prop', message: 'Field has no prop "hint"', gap: true, why: 'its page shows no example of it in use' },
  { component: 'Button', kind: 'event', message: 'Button emits no "press"', gap: false, why: 'its page has an example; the agent wrote it otherwise' },
];

test('what was found, never a verdict of its own', () => {
  const r = checkRecord({ name: 'SignIn', file: 'prototypes/SignIn.jsx', used: { Button: 1, Field: 3 }, items, gaps: [{ need: 'a switch', searched: 'chip, toggle', why: 'neither turns on and off' }], owed: [{ kind: 'error' }] });
  assert.equal(r.name, 'SignIn');
  assert.equal(r.mistakes, 2);
  // The half a person can act on, told from the half the agent owes, as every other count of these is told.
  assert.equal(r.gapsInDocumentation, 1);
  assert.deepEqual(r.owes, ['error']);
  assert.deepEqual(r.lacked, [{ need: 'a switch', searched: 'chip, toggle', why: 'neither turns on and off' }]);
  // Most used first, so a reader sees what the page leans on.
  assert.deepEqual(Object.keys(r.used), ['Field', 'Button']);
  assert.deepEqual(r.kinds, { prop: 1, event: 1 });
  // Nothing wrong and nothing owed is the only way to be ok, and it is worked out rather than asserted.
  assert.equal(r.ok, false);
  assert.equal(checkRecord({ name: 'Ok', file: 'x', used: { Button: 1 } }).ok, true);
});

test('a check that never worked out whose fault each mistake was says nothing, rather than zero', () => {
  // The composition check does not classify its findings; the page check does. A zero here would read as "the
  // documentation owed none of them", which is a different thing from nobody having worked it out.
  const plain = checkRecord({ name: 'Filters', file: 'prototypes/Filters.json', items: [{ component: 'chip', kind: 'prop', message: 'chip has no prop "x"' }] });
  assert.equal('gapsInDocumentation' in plain, false);
  assert.equal('gap' in plain.items[0], false);
  assert.equal('gapsInDocumentation' in checkRecord({ name: 'SignIn', file: 'x', items }), true);
});

test('kept beside the page, read back by name, and only ours', () => {
  const dir = tempDir('proto-record-');
  mkdirSync(join(dir, 'prototypes'), { recursive: true });
  const rec = checkRecord({ name: 'SignIn', file: 'prototypes/SignIn.jsx', used: { Button: 1 }, items });
  const at = writeCheck(dir, 'prototypes', rec);
  assert.match(at, /prototypes\/SignIn\.check\.json$/);
  assert.equal(checkFile('SignIn'), 'SignIn.check.json');
  assert.match(JSON.parse(readFileSync(at, 'utf8')).$description, /carried with it wherever the prototype goes/);
  // A file that is not one of ours is left alone, and a folder with none gives none: a prototype nobody has
  // checked is not a prototype that passed.
  writeFileSync(join(dir, 'prototypes', 'notes.check.json'), 'not json at all');
  writeFileSync(join(dir, 'prototypes', 'SignIn.jsx'), 'x');
  assert.deepEqual(Object.keys(readChecks(dir)), ['SignIn']);
  assert.deepEqual(readChecks(tempDir('empty-')), {});
});

test('which prototypes used each component, newest first', () => {
  const a = checkRecord({ name: 'SignIn', file: 'a', used: { Button: 2, Field: 1 }, items: [], at: '2026-11-01T00:00:00Z' });
  const b = checkRecord({ name: 'Filters', file: 'b', used: { Button: 1 }, items, at: '2026-11-02T00:00:00Z' });
  const by = byComponent({ SignIn: a, Filters: b });
  assert.deepEqual(by.Button.map((x) => x.name), ['Filters', 'SignIn'], 'newest first');
  assert.deepEqual(by.Button.map((x) => x.ok), [false, true]);
  assert.equal(by.Button[0].mistakes, 2);
  assert.deepEqual(by.Field.map((x) => `${x.name}×${x.times}`), ['SignIn×1']);
  assert.deepEqual(byComponent({}), {});
});

test('the line a person reads says what was kept and where', () => {
  const r = checkRecord({ name: 'SignIn', file: 'x', used: { Button: 1, Field: 1 }, items, owed: [{ kind: 'error' }] });
  const line = checkLine(r, 'prototypes/SignIn.check.json');
  assert.match(line, /2 components used, 2 mistakes, 1 state owed → prototypes\/SignIn\.check\.json/);
  assert.match(checkLine(checkRecord({ name: 'A', file: 'x', used: { B: 1 } }), 'p'), /1 component used, 0 mistakes →/);
});

test("a prototype's own files travel with it, and nothing else in the folder does", async () => {
  const src = readFileSync(new URL('../lib/stores.mjs', import.meta.url), 'utf8');
  const takes = new Function('rel', `return ${/prototypes: \(rel\) => (.*),\n/.exec(src)[1]}`);
  for (const f of ['SignIn.jsx', 'Filters.json', 'SignIn.comments.json', 'SignIn.check.json', 'SignIn.handoff.md']) assert.equal(takes(f), true, f);
  // The check record travelled only because it happens to be JSON, and the handoff did not travel at all. Named
  // now, so neither is an accident of the extension.
  for (const f of ['notes.txt', 'random.md', 'screenshot.png', 'sub/Deep.vue']) assert.equal(takes(f), false, f);
});

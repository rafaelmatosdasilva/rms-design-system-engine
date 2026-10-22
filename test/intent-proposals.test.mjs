// intent-proposals.mjs - the engine's proposed answer to each of the team's decisions on the Intent layer page (Fix,
// Add, Move), what it rests on, and the team's yes or no, kept and acted on. An invented system (Acme).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { proposalsFor, applyDecisions, decide, readDecisions } from '../intent-proposals.mjs';

const ROOT = mkdtempSync(join(tmpdir(), 'proposals-'));
const file = (p, t) => { mkdirSync(join(ROOT, p, '..'), { recursive: true }); writeFileSync(join(ROOT, p), t); };
file('src/lists/List.vue', "import Row from './Row'\n");
file('src/lists/Row.vue', '<template><li /></template>');
file('src/tiles/Tile.vue', '<template><div /></template>');
file('src/search/Search.vue', "import Row from '@/search/Row'\n");
file('src/search/Row.vue', '<template><li /></template>');
file('src/calendar/General.vue', "import Picker from '@/calendar/Picker'\n");
file('src/calendar/Picker.vue', '<template><div /></template>');
const codeFiles = { listMain: 'src/lists/List.vue', 'listMain/Row': 'src/lists/Row.vue', tileOne: 'src/tiles/Tile.vue', tileTwo: 'src/tiles/Tile.vue', searchMain: 'src/search/Search.vue', calendar: 'src/calendar/General.vue', newThing: 'src/new/Thing.vue' };
const page = (name, component, extra = {}) => ({ name, component, file: `${name}.dsds.json`, action: 'keep', wrong: [], ...extra });
const report = { pages: [
  page('List Main', 'listMain'), page('Tile One', 'tileOne'), page('Search', 'searchMain', { action: 'fix', wrong: [{ kind: 'name', says: '`searchRow`', line: 'Use `searchRow` for a row.' }] }),
  page('Patrimony', null, { action: 'fix', wrong: [{ kind: 'name', says: '`tabGroupV2`', line: 'Use `tabGroupV2`.' }] }),
  page('Consult', null, { action: 'fix', wrong: [{ kind: 'name', says: '`ListSimple`', line: 'Pick `ListSimple` or `ListDrop`.' }] }),
  page('Picker', null, { action: 'move', code: 'src/calendar/Picker.vue' }),
] };
const entity = (name, lines) => ({ name, file: `${name}.dsds.json`, purpose: [], whenToUse: lines, whenNotToUse: [], mistakes: [], limitations: [], rules: [], sections: [] });
const snap = { entities: [entity('Consult', ['Pick `ListSimple` or `ListDrop`.', 'Treat the Figma label `ListDrop` as it is.']), entity('Patrimony', ['Use `tabGroupV2`.']), entity('Search', ['Use `searchRow` for a row.'])] };
const facts = { text: '"tabGroup (deprecated, removal planned)"', files: ['src/search/Row', 'src/search/Search', 'src/lists/Row'] };

test('a proposal for each of the team\'s decisions, with what it rests on', () => {
  const P = proposalsFor({ ROOT, report, snap, names: ['listMain', 'tileOne', 'tileTwo', 'tabGroup', 'listMain/Row', 'newThing'], codeFiles, facts, noPage: ['listMain/Row', 'tileTwo', 'newThing'] });
  assert.match(P.get('add:listMain/Row').proposal, /^Document it in List Main's page, as a part of listMain/);
  assert.match(P.get('add:listMain/Row').evidence.join(' '), /Only List\.vue uses it/);
  assert.match(P.get('add:tileTwo').proposal, /^Its page is Tile One/);
  assert.equal(P.get('add:newThing').effect, 'write');
  assert.match(P.get('fix:Patrimony:tabGroupV2').proposal, /replaces tabGroup/);
  assert.match(P.get('fix:Patrimony:tabGroupV2').evidence[0], /Figma marks deprecated/);
  assert.match(P.get('fix:Consult:ListSimple').proposal, /Figma's own/);
  assert.match(P.get('fix:Search:searchRow').proposal, /src\/search\/Row/);
  assert.match(P.get('move:Picker').evidence[0], /used only by General/);
});

test('a yes is kept and acted on; a no keeps the decision on the page', () => {
  const P = proposalsFor({ ROOT, report, snap, names: ['listMain', 'tileOne', 'tileTwo', 'tabGroup'], codeFiles, facts, noPage: ['listMain/Row', 'tileTwo', 'newThing'] });
  decide(ROOT, ['add:listMain/Row', 'fix:Patrimony:tabGroupV2', 'move:Picker'], 'yes', Object.fromEntries(P), { now: '2026-01-01' });
  decide(ROOT, ['add:tileTwo'], 'no', Object.fromEntries(P));
  const d = readDecisions(ROOT);
  assert.equal(d['add:listMain/Row'].answer, 'yes');
  assert.match(d['add:listMain/Row'].proposal, /Document it in List Main's page/);
  const r = applyDecisions({ report, noPage: ['listMain/Row', 'tileTwo', 'newThing'], proposals: P, decisions: d });
  assert.deepEqual(r.noPage, ['tileTwo', 'newThing']);
  assert.equal(r.addProposals.tileTwo.answer, 'no');
  const pg = (n) => r.pages.find((p) => p.name === n);
  assert.equal(pg('Patrimony').action, 'keep');
  assert.equal(pg('Picker').action, 'keep');
  assert.equal(pg('Search').action, 'fix');
  assert.equal(pg('Search').proposals[0].key, 'fix:Search:searchRow');
  assert.ok(JSON.parse(readFileSync(join(ROOT, 'design-system-engine-intent-decisions.json'), 'utf8'))['move:Picker']);
});

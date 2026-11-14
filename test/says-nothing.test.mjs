// A description that is there and says nothing: the words a system's every description shares read from the system
// itself, a sentence that only restates the name, and what is left alone (an empty field, and a real sentence).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saysNothing, sayNothing, commonWords, sayNothingLines, SMALLEST } from '../lib/says-nothing.mjs';

// A system whose descriptions all open the same way, so its own boilerplate is there to be found.
const house = (n, tail) => ({ purpose: `${n} is a Vue design system component of the Acme library${tail ? `, ${tail}` : ''}.` });
const system = () => {
  const c = { cardTile: house('Card Tile'), fileWell: house('File Well'), sieveDrawer: house('Sieve Drawer') };
  for (let i = 0; i < SMALLEST; i++) c[`piece${i}`] = house(`Piece ${i}`);
  c.oneTimeField = { purpose: 'Takes the six-digit code sent by text, and moves on by itself once it is complete.' };
  c.gridOfRows = { purpose: 'Shows many records at once, sorted and filtered, one row each.' };
  c.quiet = { purpose: '' };
  c.unwritten = { purpose: '(no description yet)' };
  return c;
};

test('the words a system shares across its descriptions are read from the system, not configured', () => {
  const shared = commonWords(Object.values(system()).map((k) => k.purpose));
  assert.ok(shared.has('acme'), 'the library name is boilerplate here, and nothing outside the system knows it');
  assert.ok(!shared.has('code'), 'a word one component uses is what that component is for');
});

test('a run of descriptions too short to show a pattern takes nothing away', () => {
  assert.equal(commonWords(['Acme card.', 'Acme well.']).size, 0);
});

test('a description made of the name and the house phrasing says nothing', () => {
  const found = sayNothing(system()).map((f) => f.name);
  assert.deepEqual(found.sort(), ['cardTile', 'fileWell', 'piece0', 'piece1', 'piece2', 'piece3', 'piece4', 'piece5',
    'piece6', 'piece7', 'sieveDrawer'].sort());
});

test('a sentence saying what a component is for is left alone', () => {
  const found = sayNothing(system()).map((f) => f.name);
  assert.ok(!found.includes('oneTimeField'));
  assert.ok(!found.includes('gridOfRows'));
});

test('a field with nothing in it is the catalog\'s to show, not this', () => {
  const found = sayNothing(system()).map((f) => f.name);
  assert.ok(!found.includes('quiet'), 'an empty field is visibly empty and is already shown as such');
  assert.ok(!found.includes('unwritten'));
});

test('the component\'s own name is not content, however it is spelled', () => {
  assert.ok(saysNothing('A sieve drawer.', 'sieveDrawer'));
  assert.ok(!saysNothing('Collects the files a person drags in, one list, before anything is sent.', 'fileWell'));
});

// The shape the engine found on a real system: every description opens "Use for ... content", so "use" and
// "content" are the house phrasing and what is left of the sentence is the component's own name.
test('a sentence that says nothing only in its own system is read in that system', () => {
  const c = { fileWell: { purpose: 'Use for file well content.' }, cardTile: { purpose: 'Use for card tile content.' } };
  const TAILS = ['sorted newest first', 'scrolls on its own', 'holds a single choice', 'collapses on a phone',
    'carries a running total', 'repeats until dismissed', 'anchors the page heading', 'groups related filters'];
  TAILS.forEach((tail, i) => { c[`piece${i}`] = { purpose: `Use for piece ${i} content: ${tail}.` }; });
  const found = sayNothing(c).map((f) => f.name);
  assert.ok(found.includes('fileWell'), 'the house opening carries nothing where every description shares it');
  assert.ok(found.includes('cardTile'));
  for (let i = 0; i < 8; i++) assert.ok(!found.includes(`piece${i}`), 'the same opening plus a sentence of its own does say something');
  assert.ok(!saysNothing('Use for file well content.', 'fileWell'), 'and outside that system it is not read that way');
});

test('two words of its own is the least that carries a meaning', () => {
  assert.ok(saysNothing('A tile.', 'cardTile'), 'one word is the name said again');
  assert.ok(!saysNothing('Holds ordered events.', 'cardTile'));
});

test('what a person is told names a few and counts the rest', () => {
  const lines = sayNothingLines(sayNothing(system()), { total: Object.keys(system()).length });
  assert.ok(lines.some((l) => l.includes('11 of 15 component(s)')), lines.join('\n'));
  assert.ok(lines.some((l) => l.includes('and 5 more')), lines.join('\n'));
  assert.equal(sayNothingLines([]).length, 0, 'a system that writes its documentation is told nothing');
});

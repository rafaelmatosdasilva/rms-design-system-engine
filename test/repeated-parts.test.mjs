// The same part built by hand in prototype after prototype: gathered by what the needs say rather than by how
// they are spelled, counted, and handed to a person. Nothing here creates or names a component.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jobOf, sameJob, clearest, byJob, builtAgain, repeatedLines, AGAIN, NOISE } from '../lib/repeated-parts.mjs';

const gap = (need, prototypes, extra = {}) => ({ kind: 'component', need, prototypes, closest: null, ...extra });

test('a need written another way is the same need', () => {
  assert.ok(sameJob('a top bar', 'the bar at the top'), 'the words about the part are the same two');
  assert.ok(sameJob('an empty state', 'empty states'), 'singular and plural are one word');
  assert.ok(sameJob('a media tile built in code', 'media tiles'), '"built in code" says nothing about the part');
});

test('a need about a different part stays its own', () => {
  assert.ok(!sameJob('a top bar', 'a filter bar'), 'filter is a word one says of the part and the other does not');
  assert.ok(!sameJob('a date picker', 'a colour picker'));
  assert.ok(!sameJob('a top bar', 'page header bar'), 'a renaming is not a rewording: grouping these would need a guess');
});

test('a need with nothing left to say of the part matches nothing', () => {
  assert.equal(jobOf('a component').size, 0, 'every word of it is a word every gap uses');
  assert.ok(!sameJob('a component', 'a component'), 'two empty needs are not evidence of one part');
});

test('what a gap says about being a gap is not what it says about the part', () => {
  for (const w of ['built', 'code', 'component', 'missing']) assert.ok(NOISE.has(w), w);
  assert.deepEqual([...jobOf('a tile built in code')], ['tile']);
});

test('the wording shown is the one most prototypes wrote', () => {
  assert.equal(clearest(['the bar at the top', 'a top bar', 'a top bar']), 'a top bar');
  assert.equal(clearest(['an empty state', 'empty states']), 'empty states', 'a tie goes to the shorter');
  assert.equal(clearest([]), '');
});

test('needs that say the same thing are gathered, and their prototypes add up', () => {
  const g = byJob([gap('a top bar', ['Orders', 'Settings']), gap('the bar at the top', ['Billing'])]);
  assert.equal(g.length, 1);
  assert.deepEqual(g[0].prototypes, ['Orders', 'Settings', 'Billing']);
  assert.deepEqual(g[0].wordings, ['a top bar', 'the bar at the top']);
});

test('a prototype counted twice is counted once', () => {
  const g = byJob([gap('a top bar', ['Orders']), gap('top bars', ['Orders', 'Billing'])]);
  assert.deepEqual(g[0].prototypes, ['Orders', 'Billing']);
});

test('a layout piece and a component are never one need', () => {
  const g = byJob([gap('a row', ['Orders']), { kind: 'layout', need: 'a row', prototypes: ['Settings'], closest: null }]);
  assert.equal(g.length, 2, 'the kind is part of what a need is');
});

test('a need matching nothing else is still listed, as a group of one', () => {
  const g = byJob([gap('a filter bar', ['Orders'])]);
  assert.equal(g.length, 1);
  assert.deepEqual(g[0].prototypes, ['Orders']);
  assert.equal(builtAgain(g).length, 0, 'but it is not what a person is asked about');
});

test('built by hand again means more than one prototype', () => {
  const g = byJob([gap('a top bar', ['Orders', 'Billing']), gap('a filter bar', ['Orders'])]);
  assert.deepEqual(builtAgain(g).map((x) => x.need), ['a top bar']);
  assert.equal(AGAIN, 2, 'one is the prototype that needed it, and the team has that gap already');
});

test('what a person is told names the prototypes and every wording gathered', () => {
  const lines = repeatedLines(byJob([
    gap('a top bar', ['Orders', 'Settings']),
    gap('the bar at the top', ['Billing'], { closest: 'pageHeader' }),
  ])).join('\n');
  assert.ok(lines.includes('built by hand in 3 prototypes: Orders, Settings, Billing'), lines);
  assert.ok(lines.includes('also written as: the bar at the top'), 'so a reader can say it was gathered wrongly');
  assert.ok(lines.includes('closest in the system: pageHeader'), lines);
  assert.ok(lines.includes("the design team's to decide"), 'it decides nothing itself');
});

test('nothing repeated is nothing said', () => {
  assert.deepEqual(repeatedLines(byJob([gap('a filter bar', ['Orders'])])), []);
  assert.deepEqual(repeatedLines([]), []);
});

test('it proposes no component: no name is invented anywhere in what it says', () => {
  const groups = byJob([gap('a top bar', ['Orders', 'Billing'])]);
  const said = repeatedLines(groups).join('\n');
  // Every word of the need comes from the team; the engine adds no name of its own.
  assert.ok(said.includes('a top bar'));
  assert.ok(!/\b[a-z]+[A-Z][a-zA-Z]*\b/.test(said.replace('pageHeader', '')), 'no component-shaped name is coined');
});

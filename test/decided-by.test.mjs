// decided-by.mjs - who made a decision, and who is to make one: ds-config.json owners, each component, area or glob to
// the one it waits on. An invented system (Acme).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerOf, notTheOwner, waitingOn, waitingLine } from '../lib/decided-by.mjs';

const OWNERS = { 'tile*': 'Tiles team', tileCard: { team: 'Cards team', decides: 'QA lead' }, 'patterns/': 'Patterns team', '*': 'Design system team' };

test('what waits is the owner\'s: its own name first, then a glob, then an area, then the default', () => {
  assert.deepEqual(ownerOf(OWNERS, 'tileCard'), { name: 'QA lead', team: 'Cards team', key: 'tileCard' }, 'the longest key that fits, the person who decides');
  assert.equal(ownerOf(OWNERS, 'tileOne').name, 'Tiles team');
  assert.equal(ownerOf(OWNERS, 'Checkout', 'patterns/Checkout').name, 'Patterns team');
  assert.equal(ownerOf(OWNERS, 'listMain').key, '*');
  assert.equal(ownerOf({ tileOne: 'Tiles team' }, 'listMain'), null, 'no default: nobody named');
  assert.equal(ownerOf(undefined, 'tileOne'), null);
});

test('an answer by someone else than the owner is said; the owner, however written, is not', () => {
  const o = ownerOf(OWNERS, 'tileCard');
  assert.equal(notTheOwner('Developer', o), true);
  assert.equal(notTheOwner('qa lead', o), false);
  assert.equal(notTheOwner('Cards team', o), false, 'the team that owns it counts as its owner');
  assert.equal(notTheOwner(null, o), false, 'nobody recorded: nothing to say');
});

test('how many wait on each, most first', () => {
  const on = waitingOn([{ decider: { name: 'Tiles team' } }, { decider: { name: 'QA lead' } }, { decider: { name: 'Tiles team' } }, { decider: null }]);
  assert.deepEqual(on, [{ name: 'Tiles team', n: 2 }, { name: 'QA lead', n: 1 }]);
  assert.equal(waitingLine(on), '2 waiting on Tiles team, 1 waiting on QA lead');
});

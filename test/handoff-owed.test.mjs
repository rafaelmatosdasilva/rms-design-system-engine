// What a prototype still owes before a development team can take it forward. The prototypes are meant to reach
// production - the designer hands one over as a starting point, not a picture to rebuild - and what that needs
// was written down nowhere, so the handoff was a conversation each time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conventionsOf, owedFor, handoffLines, HARDCODED } from '../lib/handoff-owed.mjs';

const pkg = (deps) => JSON.stringify({ dependencies: deps });
const conv = (deps) => conventionsOf('/nowhere', { pkg: pkg(deps) });
const FULL = conv({ 'vue-router': '4', pinia: '2', 'vue-i18n': '9', vitest: '1' });
const plain = (text) => ({ name: 'Orders', text });

test('what the product does is read from the product', () => {
  assert.equal(FULL.router, 'a router');
  assert.equal(FULL.store, 'a store');
  assert.equal(FULL.i18n, 'translated words');
  assert.equal(FULL.tests, 'tests');
  // A framework that routes by its folders is routing all the same.
  assert.equal(conv({ next: '14' }).router, 'file-based routes');
  assert.equal(conv({ 'react-router-dom': '6' }).router, 'a router');
  assert.equal(conv({ '@reduxjs/toolkit': '2' }).store, 'a store');
});

test('a project that does none of these is told none of them', () => {
  // A list of good practice the project never adopted would be noise, and would read as the team's own rules.
  const none = conv({ vue: '3' });
  assert.deepEqual([none.router, none.store, none.i18n, none.tests], [null, null, null, null]);
  assert.deepEqual(owedFor(plain('label="Hello there" title="Orders"'), none), []);
  assert.deepEqual(handoffLines('Orders', [], none), []);
  // Nothing readable at all is the same answer, never a crash.
  assert.deepEqual(owedFor(plain('x'), conventionsOf('/nowhere', { pkg: 'not json' })), []);
});

test('a page that already does what the product does owes nothing for it', () => {
  const owed = (t) => owedFor(plain(t), FULL).map((o) => o.owes);
  assert.ok(!owed('const route = { path: "/orders" }; const s = useStore(); $t("orders.title")').includes('a route'));
  assert.ok(!owed('useStore()').includes('its data from the store'), 'it reads the store');
  assert.ok(!owed('$t("orders.title")').includes('its words as translations'));
  // A test is owed whatever the page says: a page cannot hold its own test.
  assert.ok(owed('everything else').includes('a test'));
});

test('a store and translations are owed only where the page actually carries words of its own', () => {
  // A page with no hardcoded words has nothing to move into the store or the translations yet, and saying so
  // would be asking for work that does not exist.
  const bare = owedFor(plain('<template><DataTable /></template>'), FULL).map((o) => o.owes);
  assert.deepEqual(bare, ['a route', 'a test']);
  assert.match('label="Orders this month"', HARDCODED);
  assert.doesNotMatch('<DataTable />', HARDCODED);
  const typed = owedFor(plain('<DataTable title="Orders this month" />'), FULL).map((o) => o.owes);
  assert.deepEqual(typed, ['a route', 'its data from the store', 'its words as translations', 'a test']);
});

test('what a person reads says what the product does, and that the engine will not do it', () => {
  const said = handoffLines('Orders', owedFor(plain('<DataTable title="Orders" />'), FULL), FULL).join('\n');
  assert.match(said, /BEFORE A DEVELOPER TAKES "Orders" FORWARD {2}4 of 4 thing\(s\) the product does/);
  assert.match(said, /a route — the product declares its pages with a router/);
  assert.match(said, /they would ship in one language/);
  // The engine does not write the product's code: these are what a person does next, in their own project.
  assert.match(said, /The engine says these, never does them/);
  assert.match(said, /a convention it does not use is never asked for/);
});

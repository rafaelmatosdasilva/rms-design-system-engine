// What moves inside one page, not only what leads between pages. Ask for "a page with a tab for each section of
// the account" and the page comes back with a tab strip, four tabs and one panel, and every check calls it whole.
// In a user test the second tab does nothing, and the person running the test finds it, not the engine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NAVIGATORS, spaced, choicesOf, navigatorsIn, switchesSomething, navigationFindings, allNavigationFindings } from '../lib/page-navigation.mjs';

const ui = (parts) => ({ root: 'r', components: [{ id: 'r', component: 'Page' }, ...parts.map((p) => ({ parent: 'r', ...p }))] });
const tabs = (n) => Array.from({ length: n }, (_, i) => ({ id: `t${i}`, label: `Section ${i}` }));

test('what counts as navigating inside a page', () => {
  // A component's name is written the way code writes one: read as words, or the check is blind to every
  // component named in camel case, which is most of them.
  for (const w of ['TabStrip', 'Tabs', 'SegmentedControl', 'Stepper', 'SideRail', 'Accordion', 'Pagination', 'separadores']) assert.match(spaced(w), NAVIGATORS, w);
  assert.equal(spaced('SegmentedControl'), 'Segmented Control');
  // What leads somewhere else, or draws, is not navigation inside the page.
  for (const w of ['Button', 'DataTable', 'Card', 'Field', 'Banner']) assert.doesNotMatch(spaced(w), NAVIGATORS, w);
});

test('a navigator offers more than one choice, counted as the composition says', () => {
  assert.equal(choicesOf({ props: { tabs: tabs(3) } }), 3);
  assert.equal(choicesOf({ props: { steps: ['a', 'b'] } }), 2);
  assert.equal(choicesOf({ props: {} }, [{}, {}, {}]), 3, 'else the parts inside it');
  // One choice is not navigation, and saying so would be noise.
  assert.deepEqual(navigatorsIn(ui([{ id: 't', component: 'TabStrip', tabs: tabs(1) }])), []);
  assert.deepEqual(navigatorsIn(ui([{ id: 't', component: 'TabStrip', tabs: tabs(3) }])).map((n) => n.choices), [3]);
});

test('a page whose navigator switches nothing is named', () => {
  const dead = ui([{ id: 't', component: 'TabStrip', tabs: tabs(3) }, { id: 'p', component: 'Card', title: 'Profile' }]);
  assert.equal(switchesSomething(dead), false);
  const [f] = navigationFindings('account', dead);
  assert.equal(f.level, 'warning', 'a question for whoever drew it, never a failure');
  assert.match(f.message, /"account" has TabStrip \(3 choices\) and nothing on the page opens anything/);
  assert.match(f.message, /in a user test the second choice does nothing/);
  assert.match(f.message, /Give each choice "opens" with the id of the part it shows/);
  assert.match(f.message, /or say the page is one view and the choices lead elsewhere/, 'the other honest answer');
});

test('a page that switches something says nothing, and nor does a page that never tried', () => {
  // `opens` is how a composition says a click shows a part: that is the whole test.
  const live = ui([{ id: 't', component: 'TabStrip', tabs: tabs(3), opens: 'p' }, { id: 'p', component: 'Card' }]);
  assert.equal(switchesSomething(live), true);
  assert.deepEqual(navigationFindings('account', live), []);
  // A page with no navigator is the ordinary case.
  assert.deepEqual(navigationFindings('orders', ui([{ id: 'd', component: 'DataTable' }])), []);
  assert.deepEqual(navigationFindings('empty', ui([])), []);
});

test('whether the right panel sits behind the right tab is not asked', () => {
  // A composition does not say which choice shows which part, so one `opens` anywhere is enough. Guessing the
  // pairing would be an opinion with nothing under it, which is the thing this check exists to avoid.
  const one = ui([{ id: 't', component: 'TabStrip', tabs: tabs(4), opens: 'a' }, { id: 'a', component: 'Card' }, { id: 'b', component: 'Card' }]);
  assert.deepEqual(navigationFindings('account', one), [], 'four tabs and one opens: not this check\'s question');
});

test('every page of a prototype, each named on its own', () => {
  const pages = {
    account: ui([{ id: 't', component: 'TabStrip', tabs: tabs(3) }]),
    orders: ui([{ id: 'd', component: 'DataTable' }]),
    settings: ui([{ id: 's', component: 'Stepper', steps: ['one', 'two'] }]),
  };
  assert.deepEqual(allNavigationFindings(pages).map((f) => f.message.match(/^"(\w+)"/)[1]), ['account', 'settings']);
  // And a camel-cased component is seen, which it was not before.
  assert.equal(allNavigationFindings({ a: ui([{ id: 's', component: 'SegmentedControl', options: ['x', 'y'] }]) }).length, 1);
  assert.deepEqual(allNavigationFindings({}), []);
});

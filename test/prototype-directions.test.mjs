// Several directions for one request, each one the system's own. A request gets one answer today: whoever reads
// the catalog first picks a shell, and a reviewer never sees what else the system already supported.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { directionsFor, directionLines, shellsFor, purposeOf, OVER, MOST } from '../lib/prototype-directions.mjs';

const ctx = {
  components: { ListPage: {}, BoardPage: {}, CalendarPage: {}, FiltersPanel: {}, DetailDrawer: {}, DataTable: {}, Button: {} },
  templates: ['ListPage', 'BoardPage', 'CalendarPage', 'FiltersPanel', 'DetailDrawer'],
  rules: [
    { title: 'List page (templates, intent layer)', text: 'A list of records starts here. Rows open a detail.', layer: 'templates' },
    { title: 'Board page (templates, intent layer)', text: 'Records in columns by status, dragged between them.', layer: 'templates' },
    { title: 'Filters panel (templates, intent layer)', text: 'The panel a list is narrowed with.', layer: 'templates' },
  ],
};
const focus = (over = {}) => ({ request: 'a page to browse orders', components: [{ name: 'DataTable', score: 9 }, { name: 'Button', score: 3 }], sections: [], ...over });

test('a template laid over a page is not a direction for one', () => {
  const names = shellsFor(ctx, focus()).map((s) => s.name);
  assert.ok(names.includes('ListPage') && names.includes('BoardPage'));
  // A panel and a drawer live inside a page; offering them as a way to build one would be a wrong answer, not a
  // thin one. Read from the name and from what the documentation says it is.
  assert.ok(!names.includes('FiltersPanel'), `a panel is not a page shell: ${names.join(', ')}`);
  assert.ok(!names.includes('DetailDrawer'), 'nor a drawer');
  for (const w of ['Filters panel', 'a drawer', 'side panel', 'modal', 'Toast']) assert.match(w, OVER, w);
  for (const w of ['List page', 'Board page', 'Calendar']) assert.doesNotMatch(w, OVER, w);
});

test('each direction says what it is for, in the documentation\'s own words', () => {
  assert.equal(purposeOf(ctx, { name: 'ListPage' }), 'A list of records starts here.', 'the first sentence, not the whole page');
  assert.equal(purposeOf(ctx, { name: 'BoardPage' }), 'Records in columns by status, dragged between them.');
  // A shell nothing is written about says so rather than being dressed up.
  assert.equal(purposeOf(ctx, { name: 'CalendarPage' }), null);
  assert.equal(purposeOf({ components: { X: { purpose: 'What X is for. And more.' } } }, { name: 'X' }), 'What X is for.');
});

test('the request\'s own shell comes first, and every direction is built from the same components', () => {
  const ds = directionsFor(ctx, focus({ components: [{ name: 'BoardPage', score: 20 }, { name: 'DataTable', score: 9 }] }));
  assert.equal(ds[0].shell, 'BoardPage', 'the one the request names');
  assert.equal(ds[0].why, 'the request names it');
  // A shell nothing in the request points to says so, rather than reading as a weighed alternative.
  assert.match(ds[1].why, /another shell the documentation offers|its own words answer the request/);
  // What differs between directions is the shell, never whether the page is the system's.
  for (const d of ds) assert.deepEqual(d.uses, ds[0].uses);
});

test('never more directions than the system has, and never more than are worth reading', () => {
  assert.ok(directionsFor(ctx, focus()).length <= MOST);
  assert.equal(directionsFor(ctx, focus(), { most: 2 }).length, 2);
  // Nothing read is no directions, as everywhere else the documentation is read.
  assert.deepEqual(directionsFor(null, focus()), []);
  assert.deepEqual(directionsFor(ctx, null), []);
  assert.deepEqual(directionsFor({ components: {}, templates: [], rules: [] }, focus()), []);
});

test('one documented shell is one direction, said as one rather than dressed as a choice', () => {
  const only = { components: { ListPage: {}, DataTable: {} }, templates: ['ListPage'], rules: ctx.rules.slice(0, 1) };
  const ds = directionsFor(only, focus());
  assert.equal(ds.length, 1);
  const said = directionLines(ds).join('\n');
  assert.match(said, /ONE DIRECTION/);
  assert.match(said, /Another direction would be invented, not the system's/);
  // Padding to three would put two things in front of a reviewer that nobody decided.
  assert.doesNotMatch(said, /DIRECTIONS/);
  assert.deepEqual(directionLines([]), []);
});

test('what a person reads: each direction numbered, with its shell, its purpose and what it is built from', () => {
  const said = directionLines(directionsFor(ctx, focus())).join('\n');
  // Named or scored, it is a comparison; otherwise it says plainly that the choice is the reader's.
  assert.match(said, /^\n?\d (DIRECTIONS {2}each built on the system, to compare|SHELLS {2}the documentation offers these)/m);
  // The reason is on the line only where the heading did not already give it.
  assert.match(said, /1\. \w+ — .+/);
  const named = directionLines(directionsFor(ctx, focus({ components: [{ name: 'BoardPage', score: 20 }] }))).join('\n');
  assert.match(named, /1\. BoardPage — .+ \(the request names it\)/);
  assert.match(said, /built from: DataTable, Button/);
  assert.match(said, /components are the same/);
  // A shell with no documentation still appears, and says it has none.
  const ds = directionsFor({ ...ctx, rules: [] }, focus());
  assert.match(directionLines(ds).join('\n'), /the documentation says nothing about what it is for/);
});

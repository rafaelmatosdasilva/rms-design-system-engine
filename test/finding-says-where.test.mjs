// Every finding says which part it is about.
//
// Watched in a measured run: an agent was told `"undefined" is not in the catalog` and could not tell which of the
// page's parts it meant. It ran the check again, and again - seventeen identical answers, forty-one turns - searched
// the project for a schema, deleted the page, started over, and ran out of turns with the task unfinished.
//
// Both halves of that were the engine's. The finding carried the part's `id` all along and the report never printed
// it; and a part the author gave no `id` was keyed `node-7`, a number in walk order that is findable in nothing. A
// part with no component at all was quoted as though `undefined` were a name somebody could look up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkUi } from '../lib/ui-catalog.mjs';

const catalog = { components: { Page: { props: {} }, Row: { props: {} }, chip: { props: { Label: { type: 'text' } } } } };
const where = (findings, re) => findings.find((f) => re.test(f.message))?.at ?? null;

test('a part with no id is named by the route to it through the file', () => {
  const ui = { component: 'Page', children: [{ component: 'chip', props: { Label: 'A' } }, { component: 'Row', children: [{ component: 'chipp', props: {} }] }] };
  const { findings } = checkUi(ui, catalog);
  // Not node-7: a number in walk order is findable in nothing. The path is what a person can follow with the file open.
  assert.equal(where(findings, /not in the catalog/), 'Page › children[1] › children[0]');
  assert.equal(findings.every((f) => !/^node-\d+$/.test(String(f.at ?? ''))), true);
});

test("a part the author named keeps its name, and says where it is too", () => {
  const ui = { component: 'Page', children: [{ id: 'actions', component: 'Row', children: [{ component: 'chipp', props: {} }] }] };
  const { findings } = checkUi(ui, catalog);
  const at = where(findings, /not in the catalog/);
  assert.match(at, /^Page › children\[0\] › children\[0\]$/, at);
  // The one the author named is given by name, with the route in brackets: the name is what they search for.
  const named = checkUi({ component: 'Page', children: [{ id: 'actions', component: 'Row', props: { gap: 1 } }] }, catalog);
  assert.match(where(named.findings, /has no prop/), /^"actions" \(Page › children\[0\]\)$/);
});

test('a part with no component is not a component called undefined', () => {
  const { findings } = checkUi({ component: 'Page', children: [{ props: {} }] }, catalog);
  const f = findings.find((x) => x.rule === 1);
  assert.match(f.message, /a part here has no "component": give it the name of one from the catalog/);
  assert.doesNotMatch(f.message, /undefined/, 'quoting the missing value sent an agent looking through the catalog for it');
  assert.equal(f.at, 'Page › children[0]');
  // A name that is simply wrong still reads as a name, with the nearest one offered.
  const typo = checkUi({ component: 'Page', children: [{ component: 'chipp', props: {} }] }, catalog);
  assert.match(typo.findings.find((x) => x.rule === 1).message, /"chipp" is not in the catalog \(did you mean chip\?\)/);
});

test('a part keeps the shape it had: where it is never reads as a prop it does not have', () => {
  // The route was first put on the node itself, and the prop check read it as a prop: every part gained a finding
  // saying it has no prop "path". A fix that breaks every page is not a fix.
  const { findings } = checkUi({ component: 'Page', children: [{ component: 'chip', props: { Label: 'A' } }] }, catalog);
  assert.deepEqual(findings.filter((f) => /no prop "(path|at)"/.test(f.message)), []);
  assert.deepEqual(findings.filter((f) => f.level === 'error'), []);
});

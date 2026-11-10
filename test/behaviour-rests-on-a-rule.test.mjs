// A request asked for nested rows that select with their parent. The agent built exactly that: no rule covered it,
// the system's own helper did otherwise, and the prototype taught the team a pattern nobody had decided. A review
// request is a question about the documentation, not an instruction — so a wired behaviour with no rule behind it is
// reported, and left as the code does it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BEHAVIOURS, ruledBehaviours, unruledBehaviours } from '../lib/prototype-context.mjs';

const ctx = (components = {}, rules = []) => ({ components, rules });
const node = (system, attrs) => ({ system, line: 7, attrs: attrs.map(([kind, name]) => ({ kind, name, line: 7 })) });

test('the four behaviours a page wires, each known by what it is called in code', () => {
  assert.deepEqual(Object.keys(BEHAVIOURS), ['selection', 'sorting', 'expansion', 'filters']);
  const hits = (attr) => Object.entries(BEHAVIOURS).filter(([, b]) => b.attrs.test(attr)).map(([k]) => k);
  assert.deepEqual(hits('update:selected'), ['selection']);
  assert.deepEqual(hits('modelValue'), ['selection']);
  assert.deepEqual(hits('sortBy'), ['sorting']);
  assert.deepEqual(hits('update:expanded'), ['expansion']);
  assert.deepEqual(hits('filters'), ['filters']);
  assert.deepEqual(hits('click'), [], 'an ordinary event is not one of these behaviours');
});

test('a behaviour the documentation describes is never reported', () => {
  const c = ctx({ Table: { purpose: 'A table of records.', notes: ['Rows can be sorted by any column.'] } });
  assert.deepEqual([...ruledBehaviours(c, 'Table')], ['sorting']);
  assert.deepEqual(unruledBehaviours([node('Table', [['event', 'sort']])], c), []);
});

test('a behaviour no rule describes is named, once per component', () => {
  const c = ctx({ Table: { purpose: 'A table of records.' } });
  const nodes = [node('Table', [['event', 'update:selected'], ['model', 'selected']]), node('Table', [['event', 'select']])];
  const out = unruledBehaviours(nodes, c);
  assert.equal(out.length, 1, 'three wirings of one behaviour on one component is one question, not three');
  assert.equal(out[0].component, 'Table');
  assert.equal(out[0].behaviour, 'selection');
});

test('each behaviour is asked about separately', () => {
  const c = ctx({ Table: { notes: ['Rows can be sorted.'] } });
  const out = unruledBehaviours([node('Table', [['event', 'sort'], ['event', 'update:expanded'], ['model', 'selected']])], c);
  assert.deepEqual(out.map((x) => x.behaviour).sort(), ['expansion', 'selection'], 'sorting is documented; the other two are not');
});

test('a product rule counts only where it names the component', () => {
  const about = ctx({ Table: {} }, [{ title: 'Lists', text: 'A Table may be sorted by any column.' }]);
  assert.deepEqual([...ruledBehaviours(about, 'Table')], ['sorting']);
  // The same sentence about something else does not license the behaviour here.
  const elsewhere = ctx({ Table: {} }, [{ title: 'Lists', text: 'A gallery may be sorted by date.' }]);
  assert.deepEqual([...ruledBehaviours(elsewhere, 'Table')], []);
});

test('with no documentation read, nothing is held to a rule', () => {
  // The worst outcome would be every behaviour on every page reported because nothing was loaded.
  assert.deepEqual(unruledBehaviours([node('Table', [['model', 'selected']])], null), []);
  assert.deepEqual([...ruledBehaviours(ctx({ Table: {} }), 'Table')], []);
});

test('an element that is not a system component is not the system\'s to rule', () => {
  assert.deepEqual(unruledBehaviours([{ system: null, line: 1, attrs: [{ kind: 'model', name: 'selected' }] }], ctx()), []);
});

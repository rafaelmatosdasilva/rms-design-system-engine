// Q6 and Q7: what the request leaves the system unable to decide is asked before a page is written, and a line the team
// left open ([open], TBD) is never guidance. An invented system (Acme): two page shells, a side panel, a few components.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entityView, isOpen } from '../doc-source-dsds.mjs';
import { componentIntent, useReport } from '../intent-layer.mjs';
import { contextFrom, requestFocus, focusLines, askFirst } from '../prototype-context.mjs';

const page = (name, purpose, more = {}) => ({ kind: 'component', name, description: purpose, sections: [{ kind: 'guidelines', title: 'When to use', items: (more.when ?? []).map((statement) => ({ statement })) }, ...(more.rules ? [{ kind: 'guidelines', title: 'Rules', items: more.rules.map((statement) => ({ statement })) }] : [])] });
const view = (e, group = 'components') => entityView(e, `${group}/${e.name}.json`, group);

test('an open line is set apart: never guidance, listed for a person to settle', () => {
  assert.equal(isOpen('[open] Should the chip wrap on narrow screens?'), true);
  assert.equal(isOpen('Max rows TBD'), true);
  assert.equal(isOpen('Open question: one per page?'), true);
  assert.equal(isOpen('Open: the menu shows its items'), false, 'a state called Open is not a question');
  assert.equal(isOpen('const label = name ?? fallback'), false, 'code is not a question');
  const v = view(page('acmeChip', 'A compact choice.', { when: ['Filter a list by one value.'], rules: ['[open] Can two be selected at once?', 'At most five in a row.'] }));
  assert.deepEqual(v.rules.map((r) => r.text), ['At most five in a row.']);
  assert.deepEqual(v.open, [{ where: 'Rules', text: 'Can two be selected at once?' }]);
  const r = useReport({ entities: [v] }, new Map([['acmeChip', v]]), { names: ['acmeChip'] });
  assert.equal(r.pages[0].action, 'review');
  assert.match(r.pages[0].todo[0], /^Answer the open question under Rules "Can two be selected at once\?"\. Write the answer in its place and remove the \[open\] or TBD marker\./);
});

test('a code example keeps a line that only looks open', () => {
  const v = entityView({ kind: 'pattern', name: 'Acme forms', sections: [{ kind: 'section', title: 'Example', body: '```js\n// TODO: wire the API\nconst x = a ?? b;\n```' }] }, 'patterns/forms.json', 'patterns');
  assert.equal((v.open ?? []).length, 0);
});

// The context a request is read against: two page shells, a side panel, components for lists and forms.
function acme() {
  const names = ['AcmeList', 'AcmeTask', 'AcmeDrawer', 'dataTable', 'searchField', 'textField', 'chip'];
  const purposes = {
    AcmeList: 'AcmeList is a page shell for browsing and finding records.', AcmeTask: 'AcmeTask is a page shell for a transaction people complete in steps.',
    AcmeDrawer: 'AcmeDrawer is the side panel template laid over a page.', dataTable: 'Shows records in rows people can sort.', searchField: 'Finds records by typing.',
    textField: 'Takes one line of typed text in a form.', chip: 'Filters a list by one value.',
  };
  const intent = { components: {} };
  for (const n of names) intent.components[n] = { intentLayer: componentIntent({ ...view(page(n, purposes[n], n === 'chip' ? { rules: ['[open] Can two be selected at once?'] } : {})), name: n }) };
  const ctx = contextFrom({ components: Object.fromEntries(names.map((n) => [n, { description: '', props: {} }])) }, intent, []);
  return { ...ctx, templates: ['AcmeList', 'AcmeTask', 'AcmeDrawer'] };
}

test('a request that names no kind of page asks which, offering only page shells, and what the page is for', () => {
  const f = requestFocus(acme(), 'a page to manage subscriptions');
  assert.deepEqual(f.ask.map((q) => q.kind), ['template', 'purpose']);
  assert.deepEqual(f.ask[0].options, ['AcmeList', 'AcmeTask'], 'a side panel is not a kind of page');
  const lines = focusLines(f).join('\n');
  assert.match(lines, /ASK FIRST/);
  assert.match(lines, /With no one to answer \(a run nobody watches\), take the first option/);
});

test('a request that names its page, or whose words point to one shell, asks nothing about the shell', () => {
  assert.deepEqual(requestFocus(acme(), 'an AcmeList page of records people search and sort').ask.filter((q) => q.kind === 'template'), []);
  assert.deepEqual(requestFocus(acme(), 'a page for browsing and finding records in rows people sort').ask.filter((q) => q.kind === 'template'), []);
});

test('a question the documentation leaves open on what the request touches is asked; --answered asks nothing', () => {
  const f = requestFocus(acme(), 'an AcmeList page to filter records by one value with a chip');
  assert.ok(f.ask.some((q) => q.kind === 'open' && /chip.*Can two be selected at once\?/.test(q.text)), JSON.stringify(f.ask));
  assert.deepEqual(requestFocus(acme(), 'an AcmeList page to filter records by one value with a chip', [], { answered: true }).ask, []);
  assert.ok(!acme().components.chip.intentLayer.rules.some((r) => /two be selected/.test(r)), 'never given to the agent as a rule');
});

test('without templates anywhere, only what the page is for is asked', () => {
  const ctx = { ...acme(), templates: [], rules: [] };
  assert.deepEqual(requestFocus(ctx, 'a page to manage subscriptions').ask.map((q) => q.kind), ['purpose']);
  assert.deepEqual(askFirst(ctx, null), []);
});

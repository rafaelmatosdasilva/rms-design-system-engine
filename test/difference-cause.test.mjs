import { test } from 'node:test';
import assert from 'node:assert/strict';
import { causeOf, sortByCause, causeLine, causesSummary } from '../lib/difference-cause.mjs';
import { differencesMarkdown } from '../lib/run-diff.mjs';
import { compareVersions } from '../lib/releases.mjs';

const opts = { products: [{ name: 'Checkout', uses: '2.1.0' }, { name: 'Admin', uses: '3.0.0' }], latest: '3.0.0', compare: compareVersions };

test('a cause is given only where the engine keeps what says it', () => {
  assert.deepEqual(causeOf({ what: 'chip padding 8px, Figma says 6px  [code moved, Figma is behind]' }, opts).cause, 'code');
  assert.match(causeOf({ what: 'x  [Figma moved, code is behind]' }, opts).why, /the code has not followed/);
  // A product behind the system's version: moving it up may settle it, whatever else is said.
  const old = causeOf({ what: 'x  [code moved, Figma is behind]', product: 'Checkout' }, opts);
  assert.deepEqual([old.cause, old.who], ['older', 'Checkout\'s team']);
  assert.match(old.why, /Checkout uses 2\.1\.0 of the system, which is at 3\.0\.0/);
  assert.equal(causeOf({ what: 'x', product: 'Admin' }, opts).cause, 'unsorted', 'a product on the latest version is no cause');
  // Never a guess: both moved, or nothing kept, is unsorted with the question that would settle it.
  assert.match(causeOf({ what: 'x  [both moved since they agreed]' }, opts).question, /which one is right/);
  assert.match(causeOf({ what: 'a difference', side: 'decide' }, opts).question, /did the code get it wrong, or did the spec never say/);
  assert.match(causeOf({ what: 'a difference', side: 'figma' }, opts).question, /does the system disagree with itself/);
  assert.equal(causeOf({ what: 'x', product: 'Checkout' }, {}).cause, 'unsorted', 'no versions known: not said');
});

test('the list says why each difference is there, and counts the causes', () => {
  const d = { total: 3, fresh: 0, groups: [{ component: 'chip', items: [
    { check: 'Structure', what: 'chip height 36px, Figma says 32px  [code moved, Figma is behind]', side: 'decide', new: false },
    { check: 'Props', what: 'chip has a "tone" Figma does not', side: 'decide', new: false, product: 'Checkout' },
    { check: 'Props', what: 'chip size option missing', side: 'decide', new: true },
  ] }], kept: [{ component: 'chip', check: 'Tokens', what: 'x', reason: 'brand', by: 'QA' }] };
  sortByCause(d, opts);
  assert.deepEqual(d.causes, { code: 1, older: 1, kept: 1, unsorted: 1 });
  assert.equal(causesSummary(d.causes), '1 the code got it wrong · 1 a product is on an older version · 1 kept on purpose · 1 not sorted yet');
  assert.match(causeLine(d.groups[0].items[0].cause), /^the code got it wrong \(the code changed since .*\) · the code acts$/);
  const md = differencesMarkdown(d);
  assert.match(md, /Why each is there, where the engine can read it: 1 the code got it wrong · 1 a product is on an older version/);
  assert.match(md, /chip size option missing · _not sorted: did the code get it wrong, or did the spec never say\?/);
  // A list written before causes were read reads as it always did.
  assert.doesNotMatch(differencesMarkdown({ total: 1, groups: [{ component: 'chip', items: [{ check: 'x', what: 'y' }] }] }), /Why each is there|·  _/);
});

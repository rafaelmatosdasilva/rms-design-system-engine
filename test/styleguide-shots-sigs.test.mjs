import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageSignatures } from '../lib/styleguide-shots.mjs';

// A component's page is pictured again only when what it is drawn from changed: its own data, the data every page
// shares, or the page's shell; never for a date, the build's own record or another component.
test('a component page is signed by its own data, the shared data and the shell; dates and other components leave it', () => {
  const page = (data, css = '.a{color:red}') => `<html><head><style>${css}</style><link href="assets/styleguide.0123456789.css"></head><body><script type="application/json" id="sg-data">${JSON.stringify(data)}</script></body></html>`;
  const base = { builtAt: '2026-11-02T08:00:00Z', tokens: { brand: '#00f' }, differences: [1], components: [{ name: 'chip', markup: '<span>a</span>', checked: '2026-11-01T10:00:00Z' }, { name: 'table/Cell', markup: '<td>b</td>' }] };
  const one = pageSignatures(page(base));
  assert.deepEqual(Object.keys(one.pages), ['c-chip', 'c-table-Cell']);
  const later = pageSignatures(page({ ...base, builtAt: '2026-11-02T09:00:00Z', differences: [1, 2], components: [{ ...base.components[0], checked: '2026-11-02T09:00:00Z' }, base.components[1]] }).replace('0123456789', 'abcdefabcd'));
  assert.deepEqual(later.pages, one.pages, 'a new date, the build record, a hashed file name: nothing redrawn');
  const chip = pageSignatures(page({ ...base, components: [{ ...base.components[0], markup: '<span>z</span>' }, base.components[1]] }));
  assert.notEqual(chip.pages['c-chip'], one.pages['c-chip']);
  assert.equal(chip.pages['c-table-Cell'], one.pages['c-table-Cell'], 'only the component that changed');
  const token = pageSignatures(page({ ...base, tokens: { brand: '#f00' } }));
  assert.ok(Object.keys(one.pages).every((k) => token.pages[k] !== one.pages[k]), 'shared data: every page');
  const css = pageSignatures(page(base, '.a{color:blue}'));
  assert.ok(Object.keys(one.pages).every((k) => css.pages[k] !== one.pages[k]), 'the shell: every page');
  assert.equal(pageSignatures('<script id="sg-data">{bad</script>'), null);
});

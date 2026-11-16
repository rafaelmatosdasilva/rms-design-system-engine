// What a page's browser tried is kept for that page alone: every page opened from a disk shares one browser storage, and
// two guides with the same component names (a team's and a copy of it) wrote over each other's results.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const part = readFileSync(new URL('../templates/styleguide/js/32-a-component-s-state-in-parity.js', import.meta.url), 'utf8');

test('the accessibility a browser tried is kept under the page\'s own address, then its theme', () => {
  const m = /var A11Y_BASE = ([^,]+), A11Y_KEY = A11Y_BASE \+ ':' \+ A11Y_THEME;/.exec(part);
  assert.ok(m, 'one key for what is kept, made once');
  assert.match(m[1], /location\.pathname/, 'the page\'s own address is in it');
  // Two pages, one storage: their keys differ for the same theme.
  const keyOf = (pathname, theme) => new Function('location', `return ${m[1]} + ':' + ${JSON.stringify(theme)};`)({ pathname });
  assert.notEqual(keyOf('/guides/acme/index.html', 'default'), keyOf('/guides/acme-demo/index.html', 'default'));
  assert.equal(keyOf('/guides/acme/index.html', 'default'), keyOf('/guides/acme/index.html', 'default'), 'the same page finds what it kept');
});

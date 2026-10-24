// The style guide builds selectors from the system's own class names: a name with a bracket, a space or a date in it
// (an invented "card (2026)") must never become an invalid selector that stops the page's accessibility pass.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../templates/styleguide.template.html', import.meta.url), 'utf8');
const src = /function clsSel\(cls\) \{[^\n]*\}/.exec(html)[0];
const clsSel = new Function('window', `${src}; return clsSel;`)({});

test('a class with a bracket, a space or a date is escaped, one class at a time', () => {
  assert.equal(clsSel('chip'), '.chip');
  assert.equal(clsSel('card (2026)'), '.card.\\(2026\\)');
  assert.equal(clsSel('tile-one  tile--big'), '.tile-one.tile--big');
  assert.equal(clsSel(''), '');
});

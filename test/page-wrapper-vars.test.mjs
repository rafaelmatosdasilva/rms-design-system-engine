// What the page's own wrapper may use, shown in the catalog.
//
// Read from the transcripts of twelve measured prototype runs: every value an agent invented was in the page's own
// wrapper, never in a component. A page width written as 400px, a line between rows as #e0e0e0, an empty state as an
// <svg> drawn by hand - each of them two characters away from a `var(--padding-m)` the same agent had written
// correctly in the same tag. It used a token wherever it had been shown one, and invented wherever it had not.
//
// The catalog showed spacing and nothing else. The system had --stroke-default and --surface-page all along.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { themePageVars } from '../lib/prototype.mjs';

const theme = `:root {
  --surface-page: #ffffff;
  --text-primary: #1b2433;
  --stroke-default: 1px;
  --radii-button: 6px;
  --button-background: #1b55d4;
  --chip-text: #1b2433;
  --field-border: #c9d2e3;
  --padding-m: 12px;
}`;

test('the theme\'s own variables a wrapper may need, and not one component\'s', () => {
  const v = themePageVars(theme, ['Button', 'Chip', 'Field']);
  assert.deepEqual(v, ['var(--surface-page) (#ffffff)', 'var(--text-primary) (#1b2433)', 'var(--stroke-default) (1px)']);
});

test('a variable holding a component\'s name is that component\'s, whatever it is called', () => {
  // --radii-button reads as a radius and is the button's: a wrapper reaching for it borrows a look it was not given.
  assert.deepEqual(themePageVars('--radii-button: 6px;', ['Button']), []);
  assert.deepEqual(themePageVars('--radii-button: 6px;', []), ['var(--radii-button) (6px)']);   // no catalog: nothing to match against
  // Case does not decide it either way.
  assert.deepEqual(themePageVars('--surface-CARD: #fff;', ['card']), []);
});

test('spacing is not listed here: it has its own line, and listing it twice invites a wrapper to space itself', () => {
  assert.deepEqual(themePageVars('--padding-m: 12px; --gap-s: 4px;', []), []);
});

test('a theme with nothing of its own says so, rather than an empty list', () => {
  assert.deepEqual(themePageVars('', []), []);
  assert.deepEqual(themePageVars(':root { --button-background: #000; }', ['Button']), []);
});

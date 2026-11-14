// A score of 90 on a run that read a third of the components is not a score of 90 on the system: each Health card says
// what its number was measured on, beside it, and never one without the other.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../templates/styleguide/js/32-a-component-s-state-in-parity.js', import.meta.url), 'utf8');

test('every Health card is measured on the components its check applied to and tried, said under its number', () => {
  assert.match(js, /readN = mx\.length - countOf\(x\[1\], 'N\/A'\) - countOf\(x\[1\], 'Untested'\)/, 'N/A and Untested are left out of what was measured');
  assert.match(js, /\[\[pT, parP\], \[iT, codeP\], \[aT, accP\], \[dT, docP\]\]\.forEach/, 'on all four cards');
  // Drawn in the same card as the number, right under it.
  assert.match(js, /\+ count \+ read \+ barHTML/);
  assert.match(js, /Measured on <b>' \+ o\.readN \+ '<\/b> of ' \+ o\.total/);
});

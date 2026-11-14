// Where nobody is named to decide (decided-by.mjs undecided): listed so an empty approver is seen before a change
// waits on it, and said once when owners names nobody.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { undecided } from '../lib/decided-by.mjs';

test('the components, areas and token prefixes no entry of owners covers; all of it said once when owners names nobody', () => {
  const owners = { 'tile*': 'Cards team', 'patterns/': { team: 'Design system team', decides: 'Lead' }, 'color/': 'Brand' };
  assert.deepEqual(undecided(owners, { components: ['tileMedia', 'button', 'chip', 'button'], areas: ['patterns/Checkout', 'templates/Settings'], tokenPrefixes: ['color', 'spacing', 'color'] }),
    { nobody: false, components: ['button', 'chip'], areas: ['templates/Settings'], tokenPrefixes: ['spacing'] });
  // A "*" covers the rest: nothing is undecided.
  assert.deepEqual(undecided({ ...owners, '*': 'Product teams' }, { components: ['button'], areas: ['templates/Settings'], tokenPrefixes: ['spacing'] }), { nobody: false, components: [], areas: [], tokenPrefixes: [] });
  assert.deepEqual(undecided(undefined, { components: ['button'] }), { nobody: true, components: [], areas: [], tokenPrefixes: [] });
  assert.deepEqual(undecided({}, {}).nobody, true);
});

test('the guard refusal says when nobody is named to decide, and the Status page lists it under its numbers', () => {
  const guard = readFileSync(new URL('../lib/guard.mjs', import.meta.url), 'utf8');
  assert.match(guard, /nobody is named to decide for it \(ds-config\.json owners covers it with no entry\), so name one there/);
  assert.match(guard, /ds-config\.json owners names nobody yet/);
  const page = readFileSync(new URL('../templates/styleguide/js/32-a-component-s-state-in-parity.js', import.meta.url), 'utf8');
  assert.match(page, /Nobody is named to decide for any part of the system\./);
  assert.match(page, /Name who decides in owners, in ds-config\.json, so a change does not wait on nobody\./);
  assert.doesNotMatch(page.match(/var U = DATA\.undecided[\s\S]*?var html/)[0], /;\s*'\)/, 'no semicolon in the page\'s words');
});

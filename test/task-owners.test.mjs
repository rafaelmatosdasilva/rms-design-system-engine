// The Tasks list names the team that owns what a task is about (ds-config.json owners).
import { test } from 'node:test';
import { templateText } from '../lib/styleguide-template.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const page = templateText();
const teamNoteWith = (owners) => { const i = page.indexOf('function teamNote'), j = page.indexOf('\n  }', i) + 4; return new Function('OWNERS', `${page.slice(i, j)}; return teamNote;`)(owners); };

test('a task names its owning team: the component\'s, else the layer of a token it names, else the default', () => {
  const note = teamNoteWith({ 'primitives/': 'Brand team', 'kit/tile/': 'Tiles team', tileCard: 'Cards team', '*': 'Product teams' });
  assert.equal(note('tileCard'), ' · Cards team');
  assert.equal(note('The token primitives/blue500 has no description'), ' · Brand team');
  assert.equal(note('kit/tile/border/color is under 3:1'), ' · Tiles team', 'the longest key first');
  assert.equal(note('badgeNote'), ' · Product teams');
  assert.equal(teamNoteWith({})('tileCard'), '', 'none set: nothing said');
  assert.equal(note('Acme shop is still on 1.2.0', 'Checkout team'), ' · Checkout team', 'a task that knows its team (a late product\'s) says it');
});

test('an owner\'s key may be a glob, and its value a team with the person who decides', () => {
  const note = teamNoteWith({ 'tile*': 'Tiles team', listMain: { team: 'Lists team', decides: 'QA lead' }, '*': { decides: 'Design lead' } });
  assert.equal(note('tileCard'), ' · Tiles team');
  assert.equal(note('listMain'), ' · Lists team', 'the team is said, not the person');
  assert.equal(note('badgeNote'), ' · Design lead', 'a default with only who decides');
});

test('every who-acts label on the Tasks list carries the owning team', () => {
  assert.equal((page.match(/\+ teamNote\(/g) ?? []).length, 5, 'the four it had, and an accessibility task\'s own profile');
  assert.doesNotMatch(page, /WHO\[[tx]\.who\] \|\| WHO\.both(?!\) \+ teamNote)/, 'no label left without it');
  assert.equal((page.match(/teamNote\(t\.say, t\.team\)/g) ?? []).length, 2, 'a system task carries the team it knows');
  assert.match(page, /DATA\.systemTodo[^\n]*team: t\.team/);
});

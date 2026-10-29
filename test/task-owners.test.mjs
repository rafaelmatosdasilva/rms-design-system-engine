// The Tasks list names the team that owns what a task is about (ds-config.json owners).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const page = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'styleguide.template.html'), 'utf8');
const teamNoteWith = (owners) => { const i = page.indexOf('function teamNote'), j = page.indexOf('\n  }', i) + 4; return new Function('OWNERS', `${page.slice(i, j)}; return teamNote;`)(owners); };

test('a task names its owning team: the component\'s, else the layer of a token it names, else the default', () => {
  const note = teamNoteWith({ 'primitives/': 'Brand team', 'kit/tile/': 'Tiles team', tileCard: 'Cards team', '*': 'Product teams' });
  assert.equal(note('tileCard'), ' · Cards team');
  assert.equal(note('The token primitives/blue500 has no description'), ' · Brand team');
  assert.equal(note('kit/tile/border/color is under 3:1'), ' · Tiles team', 'the longest key first');
  assert.equal(note('badgeNote'), ' · Product teams');
  assert.equal(teamNoteWith({})('tileCard'), '', 'none set: nothing said');
});

test('every who-acts label on the Tasks list carries the owning team', () => {
  assert.equal((page.match(/\+ teamNote\(/g) ?? []).length, 4);
  assert.doesNotMatch(page, /WHO\[[tx]\.who\] \|\| WHO\.both(?!\) \+ teamNote)/, 'no label left without it');
});

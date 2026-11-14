// Colours a person cannot tell apart, offered as merges: twenty doing the work of eleven is eleven choices too many.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { colourTokens, colourMerges, mergeLines, lookApart } from '../lib/colour-merges.mjs';

const css = `:root {
  --text-strong: #1a1a1a; --text-heading: #1b1b1b; --text-title: #191a1a;
  --surface: #ffffff; --surface-card: #fefefe;
  --brand: #0055cc; --link: #0056cc;
  --gray-100: #f5f5f5; --gray-150: #f0f0f0; --gray-200: #ebebeb;
  --text-alias: var(--text-strong);
  --overlay: rgba(0, 0, 0, 0.5); --scrim: rgba(0, 0, 0, 0.6);
}
[data-theme="dark"] { --brand: #6aa1ff; --link: #4d8dff; }`;

test('tokens that look the same in every mode they share are one group, the most used kept', () => {
  const tokens = colourTokens([{ file: 'theme.css', text: css }]);
  const uses = { '--text-heading': { direct: ['cardTile', 'dialog'] }, '--text-title': { direct: ['cardTile', 'pageHeader'] }, '--text-strong': { direct: ['cardTile', 'dialog', 'menu'], via: [{ name: 'listRow' }] } };
  const g = colourMerges(tokens, { uses });
  assert.deepEqual(g.map(({ keep, merge }) => [keep, merge]), [
    ['--text-strong', ['--text-heading', '--text-title']],
    ['--surface', ['--surface-card']],
  ]);
  assert.deepEqual(g[0].reaches, ['cardTile', 'dialog', 'pageHeader'], 'what the merge reaches: the components of the ones that would move');
  // Alike in light and apart in dark is two colours; a scale's steps are apart; a pointer is already one colour;
  // a different see-through is another colour.
  const all = g.flatMap((x) => [x.keep, ...x.merge]);
  for (const n of ['--brand', '--link', '--gray-100', '--gray-150', '--text-alias', '--overlay', '--scrim']) assert.ok(!all.includes(n), n);
});

test('a chain of small steps is never one colour, and the line says what to do', () => {
  assert.ok(lookApart([255, 255, 255, 1], [254, 254, 254, 1]) < 1);
  assert.ok(lookApart([0, 85, 204, 1], [0, 86, 204, 1]) < 1);
  assert.ok(lookApart([245, 245, 245, 1], [240, 240, 240, 1]) > 1, 'two neighbouring grey steps stay apart');
  const steps = colourMerges(colourTokens([{ text: ':root{--a:#808080;--b:#828282;--c:#848484;--d:#868686}' }]));
  for (const g of steps) assert.ok(![g.keep, ...g.merge].includes('--a') || ![g.keep, ...g.merge].includes('--d'), 'the two ends never merge');
  const lines = mergeLines(colourMerges(colourTokens([{ file: 'theme.css', text: css }])));
  assert.match(lines[0], /^5 colour tokens look the same as another in every mode they share, in 2 groups/);
  assert.equal(lines[1], '   · keep --text-title, point --text-heading, --text-strong at it', 'with no record of use, the shortest name stays');
  assert.ok(!lines.join('\n').includes(';'), 'no semicolons in its words');
  assert.deepEqual(mergeLines([]), []);
});

// A component's example in use, written per component (contract.authored.json guidance.examples, as the engine drafts
// one): read with the rest of its guidance, shown for agents, and a draft said to be one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { guidanceView } from '../lib/styleguide-data.mjs';
import { contextFrom, purposeLines } from '../lib/prototype-context.mjs';

const draft = '**Draft:** a severity next to an item\'s name.';

test('a component\'s examples are read with its guidance, from the authored contract', () => {
  const g = guidanceView({ authored: { examples: [draft] } });
  const s = g.sections.find((x) => x.key === 'examples');
  assert.ok(s, 'an Examples section');
  assert.deepEqual(s.text, [draft]);
  assert.equal(s.from, 'contract.authored.json');
});

test('agents read each example, a draft named as one', () => {
  const ctx = contextFrom({ components: { badge: {} } }, null, null, { authored: { components: { badge: { guidance: { examples: [draft] } } } } });
  const lines = purposeLines(ctx, ['badge']).join('\n');
  assert.match(lines, /example \(draft\) a severity next to an item's name\./);
  assert.doesNotMatch(lines, /\*\*Draft/, 'the mark is said in words, never left as markup');
});

test('on the Documentation page, a drafted example is to review, never done', () => {
  const src = readFileSync(join(dirname(dirname(fileURLToPath(import.meta.url))), 'templates', 'styleguide', 'js', '08-each-kind-once.js'), 'utf8');
  assert.match(src, /guideKind\('examples', 'Examples'\)/);
  assert.match(src, /st: !has \? 'todo' : weak \|\| drafted \? 'check' : 'done'/);
});

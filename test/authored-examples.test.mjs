// A component's example in use, written per component (contract.authored.json guidance.examples, as the engine drafts
// one): read with the rest of its guidance, shown for agents, and a draft said to be one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextFrom, purposeLines } from '../lib/prototype-context.mjs';

const draft = '**Draft:** a severity next to an item\'s name.';

test('agents read each example, a draft named as one', () => {
  const ctx = contextFrom({ components: { badge: {} } }, null, null, { authored: { components: { badge: { guidance: { examples: [draft] } } } } });
  const lines = purposeLines(ctx, ['badge']).join('\n');
  assert.match(lines, /example \(draft\) a severity next to an item's name\./);
  assert.doesNotMatch(lines, /\*\*Draft/, 'the mark is said in words, never left as markup');
});

test('on the Documentation page, a drafted example is to review, never done, and the rating reads it', () => {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const tpl = readFileSync(join(root, 'templates', 'styleguide', 'js', '08-each-kind-once.js'), 'utf8');
  assert.match(tpl, /ex \? \(exDraft \? 'check' : 'done'\) : 'todo'/, 'drafted: to check; written: done; none: to write');
  const gen = readFileSync(join(root, 'lib', 'styleguide-gen.mjs'), 'utf8');
  assert.match(gen, /guidance\?\.examples/, 'the authored examples are read for the rating');
  assert.match(gen, /exampleDraft: true/);
});

// The construction check for CI (audit.mjs --construction-check): each finding with a severity, an error for a rule the
// team decided and a warning for the rest, as data (--json) or as annotations a pull request shows (--github), and a
// ready-made GitHub Action that runs it in one line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSeverities, checkEntry, annotationsOf } from '../lib/construction-grammar.mjs';

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const g = { figma: { rules: [
  { id: 'description', says: 'Every component carries a description in Figma', by: 'team', status: 'fix', follows: 3, of: 4, toFix: [{ component: 'acmeChip', value: '' }] },
  { id: 'layer-name-case', says: 'A layer is named in camelCase', by: 'majority', status: 'decide', follows: 2, of: 4, toFix: [{ component: 'acmeTag', value: 'Label Text' }] },
] }, code: { rules: [
  { id: 'code-boolean-prop-case', says: 'A yes/no prop is named in camelCase', by: 'team', status: 'fix', follows: 9, of: 10, decidedIn: { file: 'eslint.config.js', line: 72 }, toFix: [{ component: 'acmeChip', value: 'is_on' }] },
] } };

test('each place that breaks a rule as an annotation a pull request shows, an error or a warning as its rule is', () => {
  const { errors, warnings } = checkSeverities(g);
  const lines = annotationsOf([...errors.map((r) => checkEntry(r, 'error')), ...warnings.map((r) => checkEntry(r, 'warning'))]);
  assert.deepEqual(lines, [
    '::error title=Figma rule%3A Every component carries a description in Figma::acmeChip → Write its description in Figma',
    '::error title=Code rule%3A A yes/no prop is named in camelCase::acmeChip: is_on',
    '::warning title=Figma rule%3A A layer is named in camelCase::acmeTag: Label Text → Rename the layer Label Text to labelText',
  ]);
});

test('the ready-made Action runs the engine from its own checkout, in one line of a team\'s workflow', () => {
  const dir = join(ENGINE, 'templates', 'actions', 'construction-check');
  const yml = readFileSync(join(dir, 'action.yml'), 'utf8');
  assert.match(yml, /using: composite/);
  const run = /run: node "\$\{\{ github\.action_path \}\}\/(.+?)" --construction-check --github/.exec(yml);
  assert.ok(run, 'it runs the construction check with annotations');
  assert.ok(existsSync(resolve(dir, run[1])), 'the path it runs is the engine\'s own audit.mjs');
});

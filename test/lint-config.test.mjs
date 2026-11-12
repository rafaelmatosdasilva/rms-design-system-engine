// A rule a team already wrote into its own linter is a decision it has made (lint-config.mjs): the engine counts it as
// the team's and says where, instead of asking the same question again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decisionsIn, lintDecisions, readConfig, textRules, yamlRules, caseNamed, isOn } from '../lib/lint-config.mjs';
import { tempDir } from './helpers.mjs';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

test('a setting that says what a rule says makes that rule the team\'s, and says where', () => {
  const { answers, from } = decisionsIn([{ file: '.eslintrc.json', data: { rules: { 'vue/prop-name-casing': ['error', 'camelCase'] } } }]);
  assert.equal(answers['code-boolean-prop-case'], true);
  assert.equal(answers['code-text-prop-case'], true);
  assert.equal(from['code-boolean-prop-case'], '.eslintrc.json (vue/prop-name-casing)');
});

test('a setting that is off decides nothing, and so does one the engine does not read', () => {
  const off = decisionsIn([{ file: '.eslintrc.json', data: { rules: { 'vue/prop-name-casing': 'off', 'vue/attribute-hyphenation': 'error', semi: ['error', 'always'] } } }]);
  assert.deepEqual(off.answers, {});
  assert.deepEqual(decisionsIn([{ file: 'x', data: { rules: { 'vue/prop-name-casing': 0 } } }]).answers, {});
  assert.equal(isOn(['error', 'camelCase']), true);
  assert.equal(isOn(0), false);
});

test('a class pattern decides how parts and variants are named; strict values decide the token rules', () => {
  const { answers, from } = decisionsIn([{ file: '.stylelintrc.json', data: { rules: {
    'selector-class-pattern': '^([a-z][a-z0-9]*)(-[a-z0-9]+)*$',
    'scale-unlimited/declaration-strict-value': ['error', ['color', 'padding', 'border-radius', 'box-shadow']],
  } } }]);
  assert.equal(answers['code-part-class'], true);
  assert.equal(answers['code-variant-class'], true);
  assert.equal(answers['code-spacing-token'], true);
  assert.equal(answers['code-radius-token'], true);
  assert.equal(answers['code-shadow-token'], true);
  assert.equal(answers['code-border-token'], true);
  assert.ok(!('code-opacity-token' in answers), 'a property the config does not name decides nothing');
  assert.match(from['code-spacing-token'], /stylelintrc.*strict-value/);
});

test('a config written as JavaScript is read as text, never run', () => {
  const dir = tempDir('lint-config-');
  // Running a project's own config to read a setting is not a check's business, so this must work without executing.
  writeFileSync(join(dir, 'eslint.config.js'), "import x from 'nowhere-this-would-throw';\nexport default [{ rules: { 'vue/prop-name-casing': ['error', 'camelCase'] } }];\n");
  const d = lintDecisions(dir, {});
  assert.deepEqual(d.files, ['eslint.config.js']);
  assert.equal(d.answers['code-text-prop-case'], true);
  assert.match(d.from['code-text-prop-case'], /^eslint\.config\.js \(vue\/prop-name-casing\)$/);
});

test('a config in package.json, and one written as YAML, are read too', () => {
  const dir = tempDir('lint-pkg-');
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'acme', stylelint: { rules: { 'selector-class-pattern': '^[a-z]' } } }));
  const d = lintDecisions(dir, {});
  assert.equal(d.answers['code-part-class'], true);
  assert.match(d.from['code-part-class'], /package\.json/);
  assert.deepEqual(yamlRules('rules:\n  vue/prop-name-casing: error\n  semi: off\n').rules, { 'vue/prop-name-casing': 'error', semi: 'off' });
  assert.deepEqual(textRules("{ rules: { 'color-no-hex': 'error' } }").rules, { 'color-no-hex': 'error' });
});

test('no config is no decision, and nothing throws', () => {
  const dir = tempDir('lint-none-');
  const d = lintDecisions(dir, {});
  assert.deepEqual(d, { answers: {}, from: {}, files: [] });
  assert.equal(readConfig(join(dir, 'nothing.json')), null);
  assert.equal(caseNamed('nonsense'), null);
});

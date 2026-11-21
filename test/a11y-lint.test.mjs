// The accessibility lint a team runs in its editor (eslint-plugin-jsx-a11y, eslint-plugin-vuejs-accessibility),
// counted beside the engine's own checks, and proposed, never installed, where a team has neither.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { a11yLintSetup, a11yLintFindings, a11yLintLines, frameworkOf } from '../lib/a11y-lint.mjs';
import { tempDir } from './helpers.mjs';
import { slashed } from '../lib/shown-path.mjs';

const project = (files) => {
  const dir = tempDir('a11y-lint-');
  for (const [f, t] of Object.entries(files)) { mkdirSync(dirname(join(dir, f)), { recursive: true }); writeFileSync(join(dir, f), t); }
  return dir;
};
const REACT_PKG = JSON.stringify({ name: 'acme-ui', dependencies: { react: '19.0.0' } });

test('a team whose ESLint uses jsx-a11y has it found, by its rules or by its name', () => {
  const byName = project({ 'package.json': REACT_PKG, 'eslint.config.mjs': "import jsxA11y from 'eslint-plugin-jsx-a11y';\nexport default [jsxA11y.flatConfigs.recommended];\n",
    'node_modules/eslint-plugin-jsx-a11y/package.json': '{}' });
  const s = a11yLintSetup(byName);
  assert.deepEqual(s.plugins.map((p) => [p.id, p.installed]), [['eslint-plugin-jsx-a11y', true]]);
  assert.equal(s.propose, null, 'nothing is proposed to a team that has one');
  const byRule = project({ 'package.json': JSON.stringify({ dependencies: { vue: '3' } }), '.eslintrc.json': JSON.stringify({ rules: { 'vuejs-accessibility/alt-text': 'error' } }) });
  const v = a11yLintSetup(byRule);
  assert.deepEqual(v.plugins.map((p) => [p.id, p.installed]), [['eslint-plugin-vuejs-accessibility', false]], 'named in the config, not installed');
});

test('a team with neither is proposed the one for its framework, and nothing is installed', () => {
  const dir = project({ 'package.json': REACT_PKG, 'eslint.config.mjs': 'export default [];' });
  const s = a11yLintSetup(dir);
  assert.deepEqual(s.propose, { id: 'eslint-plugin-jsx-a11y', framework: 'react' });
  assert.match(a11yLintLines(a11yLintFindings(dir, ['src/Button.jsx'], s), s).join('\n'), /Proposed, never installed/);
  assert.equal(frameworkOf(project({ 'package.json': JSON.stringify({ devDependencies: { nuxt: '3' } }) })), 'vue');
  assert.equal(a11yLintSetup(project({ 'package.json': '{}' })).propose, null, 'no framework, nothing to propose');
});

test("its findings are the team's ESLint's own, kept to the accessibility plugin's rules, with file and line", () => {
  const dir = project({ 'package.json': REACT_PKG, 'eslint.config.mjs': "import jsxA11y from 'eslint-plugin-jsx-a11y';",
    'node_modules/eslint-plugin-jsx-a11y/package.json': '{}', 'node_modules/.bin/eslint': '' });
  const report = [
    { filePath: join(dir, 'src/Avatar.jsx'), messages: [
      { ruleId: 'jsx-a11y/alt-text', line: 3, severity: 2, message: 'img elements must have an alt prop' },
      { ruleId: 'no-unused-vars', line: 1, severity: 1, message: 'x is unused' }] },
    { filePath: join(dir, 'src/Card.jsx'), messages: [{ ruleId: 'jsx-a11y/click-events-have-key-events', line: 8, severity: 1, message: 'A click handler needs a keyboard listener too' }] },
  ];
  let asked = null;
  const run = (bin, args) => { asked = { bin, args }; const e = new Error('exit 1'); e.stdout = JSON.stringify(report); throw e; };
  const r = a11yLintFindings(dir, ['src/Avatar.jsx', 'src/Card.jsx', 'src/card.css'], undefined, { run });
  assert.match(slashed(asked.bin), /node_modules\/\.bin\/eslint$/, "the project's own ESLint, never one fetched");
  assert.deepEqual(asked.args, ['--format', 'json', 'src/Avatar.jsx', 'src/Card.jsx'], 'a stylesheet is not linted by it');
  assert.equal(r.ran, true);
  assert.deepEqual(r.findings.map((f) => `${f.file}:${f.line} ${f.rule} ${f.severity}`),
    ['src/Avatar.jsx:3 jsx-a11y/alt-text error', 'src/Card.jsx:8 jsx-a11y/click-events-have-key-events warning'], 'another rule is not an accessibility finding');
  assert.deepEqual(r.byRule, { 'jsx-a11y/alt-text': 1, 'jsx-a11y/click-events-have-key-events': 1 });
  assert.match(a11yLintLines(r).join('\n'), /reports 2: .*src\/Avatar\.jsx:3 {2}jsx-a11y\/alt-text/s);
});

test('a plugin named but not installed, or no ESLint to run it, is said so and nothing runs', () => {
  const run = () => { throw new Error('should not run'); };
  const named = project({ 'package.json': REACT_PKG, 'eslint.config.mjs': "import jsxA11y from 'eslint-plugin-jsx-a11y';" });
  assert.match(a11yLintFindings(named, ['src/A.jsx'], undefined, { run }).why, /not installed/);
  const noBin = project({ 'package.json': REACT_PKG, 'eslint.config.mjs': "import jsxA11y from 'eslint-plugin-jsx-a11y';", 'node_modules/eslint-plugin-jsx-a11y/package.json': '{}' });
  assert.match(a11yLintFindings(noBin, ['src/A.jsx'], undefined, { run }).why, /no ESLint installed/);
});

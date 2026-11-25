// The accessibility lint a team runs in its editor (eslint-plugin-jsx-a11y, eslint-plugin-vuejs-accessibility,
// angular-eslint's template rules, eslint-plugin-lit-a11y),
// counted beside the engine's own checks, and proposed, never installed, where a team has neither.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, existsSync, symlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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

test('Angular and Lit have their own accessibility lint found and proposed; plain custom elements are told the browser checks answer', () => {
  const ang = project({ 'package.json': JSON.stringify({ dependencies: { '@angular/core': '20' } }), 'eslint.config.js': "const angular = require('angular-eslint');\nmodule.exports = [{ files: ['**/*.html'], extends: [angular.configs.templateAccessibility] }];\n",
    'node_modules/@angular-eslint/eslint-plugin-template/package.json': '{}' });
  assert.deepEqual(a11yLintSetup(ang).plugins.map((p) => [p.id, p.installed]), [['@angular-eslint/eslint-plugin-template', true]]);
  assert.deepEqual(a11yLintSetup(project({ 'package.json': JSON.stringify({ dependencies: { '@angular/core': '20' } }) })).propose, { id: '@angular-eslint/eslint-plugin-template', framework: 'angular' });
  const lit = project({ 'package.json': JSON.stringify({ dependencies: { lit: '3' } }), 'eslint.config.mjs': 'export default [];' });
  const s = a11yLintSetup(lit);
  assert.deepEqual(s.propose, { id: 'eslint-plugin-lit-a11y', framework: 'lit' });
  assert.match(a11yLintLines({}, s).join('\n'), /eslint-plugin-lit-a11y \(ISC\)/, 'its own licence is named');
  assert.deepEqual(a11yLintSetup(project({ 'package.json': JSON.stringify({ dependencies: { lit: '3' } }), '.eslintrc.json': JSON.stringify({ rules: { 'lit-a11y/alt-text': 'error' } }) })).plugins.map((p) => p.id), ['eslint-plugin-lit-a11y']);
  const plain = project({ 'package.json': JSON.stringify({ name: 'acme-elements', customElements: 'custom-elements.json' }) });
  const ps = a11yLintSetup(plain);
  assert.equal(ps.framework, 'web-components');
  assert.equal(ps.propose, null, 'no lint reads plain custom elements, so none is proposed');
  assert.match(a11yLintLines({}, ps).join('\n'), /plain custom elements .* the engine's checks in the browser are the whole answer/);
});

test("Angular's templates are linted, and only its plugin's accessibility rules count", () => {
  const dir = project({ 'package.json': JSON.stringify({ dependencies: { '@angular/core': '20' } }), 'eslint.config.js': 'angular.configs.templateAccessibility',
    'node_modules/@angular-eslint/eslint-plugin-template/package.json': '{}', 'node_modules/.bin/eslint': '' });
  const report = [{ filePath: join(dir, 'src/button/button.component.html'), messages: [
    { ruleId: '@angular-eslint/template/alt-text', line: 2, severity: 2, message: '<img/> element must have a text alternative.' },
    { ruleId: '@angular-eslint/template/eqeqeq', line: 4, severity: 2, message: 'Expected `===`' },
    { ruleId: '@angular-eslint/template/no-positive-tabindex', line: 5, severity: 2, message: 'The tabindex attribute should not be positive' }] }];
  let asked = null;
  const run = (bin, args) => { asked = args; const e = new Error('exit 1'); e.stdout = JSON.stringify(report); throw e; };
  const r = a11yLintFindings(dir, ['src/button/button.component.ts', 'src/button/button.component.html', 'src/button/button.component.scss'], undefined, { run });
  assert.deepEqual(asked, ['--format', 'json', 'src/button/button.component.ts', 'src/button/button.component.html'], "the component's template is linted, its stylesheet is not");
  assert.deepEqual(r.findings.map((f) => f.rule), ['@angular-eslint/template/alt-text', '@angular-eslint/template/no-positive-tabindex'], 'eqeqeq is not an accessibility rule');
  // The engine's file list holds code only: the template is found from the component's templateUrl.
  writeFileSync(join(dir, 'card.component.ts'), "@Component({ selector: 'acme-card', templateUrl: './card.component.html' })\nexport class Card {}\n");
  writeFileSync(join(dir, 'card.component.html'), '<img src="a.png">');
  a11yLintFindings(dir, ['card.component.ts'], undefined, { run });
  assert.deepEqual(asked, ['--format', 'json', 'card.component.ts', 'card.component.html'], 'the template its component names is linted with it');
});

// The real thing: the team's own ESLint 10 with the Vue, Angular and Lit plugins (test/.lint-tools), run on a component
// of each, the Angular one's template found from its templateUrl.
const TOOLS = join(dirname(fileURLToPath(import.meta.url)), '.lint-tools', 'node_modules');
const realReady = existsSync(join(TOOLS, 'eslint-plugin-lit-a11y', 'package.json')) && existsSync(join(TOOLS, '@angular-eslint', 'eslint-plugin-template', 'package.json'))
  ? false : 'the accessibility plugins are not installed (npm ci --prefix test/.lint-tools)';
test("the real ESLint reports each framework's accessibility problem, with its file and line", { skip: realReady }, () => {
  const dir = project({
    'package.json': JSON.stringify({ name: 'acme-ui', type: 'module', dependencies: { '@angular/core': '22', lit: '3', vue: '3' } }),
    'eslint.config.mjs': [
      "import vueA11y from 'eslint-plugin-vuejs-accessibility';", "import vueParser from 'vue-eslint-parser';",
      "import tpl from '@angular-eslint/eslint-plugin-template';", "import tplParser from '@angular-eslint/template-parser';",
      "import litA11y from 'eslint-plugin-lit-a11y';",
      'export default [',
      "  { files: ['**/*.vue'], languageOptions: { parser: vueParser }, plugins: { 'vuejs-accessibility': vueA11y }, rules: { 'vuejs-accessibility/alt-text': 'error' } },",
      "  { files: ['**/*.html'], languageOptions: { parser: tplParser }, plugins: { '@angular-eslint/template': tpl }, rules: { '@angular-eslint/template/alt-text': 'error', '@angular-eslint/template/eqeqeq': 'error' } },",
      "  { files: ['**/*.js'], plugins: { 'lit-a11y': litA11y }, rules: { 'lit-a11y/alt-text': 'error' } },",
      '];'].join('\n'),
    'src/Avatar.vue': '<template>\n  <img src="a.png">\n</template>\n',
    'src/card/card.component.ts': "@Component({ selector: 'acme-card', templateUrl: './card.component.html' })\nexport class Card {}\n",
    'src/card/card.component.html': '<div>\n  <img src="a.png">\n  <span *ngIf="a == b">x</span>\n</div>\n',
    'src/acme-badge.js': "import { html } from 'lit';\nexport const badge = () => html`\n  <img src=\"a.png\">`;\n",
  });
  symlinkSync(TOOLS, join(dir, 'node_modules'), 'junction');
  const s = a11yLintSetup(dir);
  assert.deepEqual(s.plugins.map((p) => [p.id, p.installed]).sort(), [['@angular-eslint/eslint-plugin-template', true], ['eslint-plugin-lit-a11y', true], ['eslint-plugin-vuejs-accessibility', true]]);
  const r = a11yLintFindings(dir, ['src/Avatar.vue', 'src/card/card.component.ts', 'src/acme-badge.js'], s);
  assert.equal(r.ran, true, r.why);
  assert.deepEqual(r.findings.map((f) => `${f.file}:${f.line} ${f.rule}`).sort(), [
    'src/acme-badge.js:3 lit-a11y/alt-text', 'src/card/card.component.html:2 @angular-eslint/template/alt-text', 'src/Avatar.vue:2 vuejs-accessibility/alt-text'].sort(),
  "each framework's own rule, and Angular's eqeqeq is not counted");
});

// In build mode, each component still to build written as a starting file from what is exact in Figma
// (scaffold.mjs), handed back as a patch, and checked by the engine once it is applied.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tempDir } from './helpers.mjs';
import { scaffoldOf, scaffoldPatch } from '../lib/scaffold.mjs';

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const TIDEPOOL = join(ENGINE, 'test', 'fixtures', 'tidepool-figma');

const rules = {
  sel: '.chip', base: [{ prop: 'height', value: '24px' }, { prop: 'background-color', value: 'var(--chip-background)' }], border: false, stroke: false,
  text: { named: 's', vals: ['font-size 12px', 'font-weight 500'], size: null, weight: null },
  variants: [{ prop: 'Size', value: 'L', selector: '.chip.chip--l', decls: [{ prop: 'height', value: '32px' }], raw: [] }, { prop: 'Disabled', value: 'True', selector: '.chip:disabled', decls: [{ prop: 'opacity', value: '0.5' }], raw: [] }],
  raw: [],
};
const entry = { description: 'A filter. */ alert(1)', props: { Size: { type: 'enum', values: ['M', 'L'], default: 'M' }, Disabled: { type: 'enum', values: ['False', 'True'], default: 'False' }, Label: { type: 'text', default: 'Filter' } } };

test('a component written from its build sheet: its element, its props, a class for each value, and every rule as CSS', () => {
  const vue = scaffoldOf('chip', { entry, rules, role: 'togglebutton', owed: ['a click and Space flip aria-pressed'], framework: 'vue', file: 'src/components/Chip.vue' });
  assert.deepEqual(vue.files.map((f) => f.file), ['src/components/Chip.vue', 'src/components/chip.css']);
  assert.match(vue.text, /<button type="button" :class="\['chip', Size === 'L' && 'chip--l'\]" :disabled="Disabled">/);
  assert.match(vue.text, /<span class="chip__label">\{\{ Label \}\}<\/span>/);
  assert.match(vue.text, /Disabled: \{ type: Boolean, default: false \}/, 'a True and False variant is a boolean');
  assert.match(vue.text, /Size: \{ type: String, default: "M", validator/);
  assert.match(vue.text, /<style src="\.\/chip\.css"><\/style>/);
  const css = vue.files[1].text;
  assert.match(css, /\.chip \{\n  box-sizing: border-box;\n  height: 24px;\n  background-color: var\(--chip-background\);\n  font-size: 12px;\n  font-weight: 500;\n\}/);
  assert.match(css, /\.chip\.chip--l \{\n  height: 32px;\n\}/);
  assert.match(css, /\.chip:disabled \{\n  opacity: 0\.5;\n\}/);
  // What Figma does not give is listed, never filled in; the description cannot end its comment.
  assert.match(vue.text, /Still yours to write[\s\S]*with aria-pressed[\s\S]*a click and Space flip aria-pressed/);
  assert.doesNotMatch(vue.text, /\*\/ alert/);
  const jsx = scaffoldOf('chip', { entry, rules, role: 'togglebutton', framework: 'react', file: 'src/components/Chip.jsx' });
  assert.match(jsx.text, /^import '\.\/chip\.css';/);
  assert.match(jsx.text, /export function Chip\(\{ Size = "M", Disabled = false, Label = "Filter", \.\.\.rest \}\)/);
  assert.match(jsx.text, /className=\{\['chip', Size === "L" && 'chip--l'\]\.filter\(Boolean\)\.join\(' '\)\} disabled=\{Disabled\} \{\.\.\.rest\}/);
  assert.match(scaffoldPatch(jsx.files), /^diff --git a\/src\/components\/Chip\.jsx b\/src\/components\/Chip\.jsx\nnew file mode 100644/);
  assert.equal(scaffoldOf('x', { rules: null }).file, null);
});

test('--scaffold in build mode: asks what it cannot tell, hands back a patch, and once applied the engine checks every file', { timeout: 600000 }, () => {
  const root = tempDir('scaffold-');
  cpSync(TIDEPOOL, root, { recursive: true });
  const cli = (...args) => spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, CI: '1', NO_COLOR: '1' } });
  cli();
  mkdirSync(join(root, 'src/styles'), { recursive: true });
  writeFileSync(join(root, 'src/styles/tokens.css'), readFileSync(join(root, '.design-system-engine-out/handback/tokens-to-build.css'), 'utf8'));
  assert.match(cli('--scaffold').stdout, /needs what the components are written in \(vue or react\) and the folder they go in[\s\S]*NEXT: ask the person/);
  const out = cli('--scaffold', '--framework', 'vue', '--folder', 'src/components').stdout;
  assert.match(out, /🧱 10 files written from what is exact in Figma \(vue\), in build order/);
  assert.match(out, /• button → src\/components\/Button\.vue \+ src\/components\/button\.css/);
  assert.ok(!existsSync(join(root, 'src/components')), 'nothing is written to the code');
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['apply', '.design-system-engine-out/handback/scaffold.patch'], { cwd: root });
  // Once applied, nothing is left to build and every check runs on the files: only what each file lists as still the
  // person's (a border whose width the capture does not hold) is left.
  const after = cli().stdout + cli('--summary').stdout;
  assert.doesNotMatch(after, /TO BUILD/);
  const fails = [...after.matchAll(/^\s+❌ (\S+\/[\w=-]+)/gm)].map((m) => m[1]);
  assert.deepEqual([...new Set(fails)].sort(), ['field/stroke-sides', 'stepper/stroke-sides']);
  assert.match(readFileSync(join(root, 'src/components/Field.vue'), 'utf8'), /a border on every side, as the border shorthand \(border: <width> solid var\(--field-border\)\)/);
  // A file already there is left out; outside build mode there is nothing to scaffold.
  assert.match(cli('--scaffold', 'button', '--framework', 'vue', '--folder', 'src/components').stdout, /button: not on the build list|button: src\/components\/Button\.vue is already there/);
});

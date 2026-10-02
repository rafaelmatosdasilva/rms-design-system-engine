// Build mode: a project that has only Figma. What Figma has and the code does not yet is listed as to build, in
// order (tokens first, then each component after the ones it nests), never as a failure; once built it is compared.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { tokenCss, modeBlock, buildOrder, buildLine, TOKENS_TO_BUILD } from '../build-list.mjs';
import { inProgressList, inProgressNames } from '../in-progress.mjs';
import { nextStep, buildSummary } from '../next-step.mjs';
import { fixtureProject } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const DEMO = join(ENGINE, 'test', 'fixtures', 'demo-ds');

// The demo with its code taken away and build mode on: only the Figma snapshots are left.
function figmaOnly() {
  const dir = fixtureProject(DEMO, 'build-');
  for (const p of ['src/theme.css', 'src/components', 'apps', 'structure-contract.mjs', '.design-system-engine-refs']) rmSync(join(dir, p), { recursive: true, force: true });
  const cfgPath = join(dir, 'ds-config.json');
  writeFileSync(cfgPath, JSON.stringify({ ...JSON.parse(readFileSync(cfgPath, 'utf8')), build: true }, null, 2));
  return dir;
}
const cfgOf = (dir) => JSON.parse(readFileSync(join(dir, 'ds-config.json'), 'utf8'));

test('each mode goes in the block ds-config says the theme switches it with', () => {
  assert.equal(modeBlock('root').open, ':root {');
  assert.match(modeBlock('dark-media').open, /prefers-color-scheme: dark/);
  assert.equal(modeBlock('class:dark').open, ':root.dark {');
  assert.equal(modeBlock('data:theme=dark').open, ':root[data-theme="dark"] {');
  const css = tokenCss([
    { cssVar: '--a', value: '#fff', modeIdx: 0 }, { cssVar: '--a', value: '#000', modeIdx: 1 },
    { cssVar: '--gap', value: '4px' }, { cssVar: '--bp', value: '24px', media: '(min-width: 768px)' },
  ], [{ name: 'Light', cssSelector: 'root' }, { name: 'Dark', cssSelector: 'data:theme=dark' }]);
  assert.match(css, /:root \{\n {2}--a: #fff;\n {2}--gap: 4px;\n\}/);
  assert.match(css, /:root\[data-theme="dark"\] \{\n {2}--a: #000;\n\}/);
  assert.match(css, /@media \(min-width: 768px\) \{\n {2}:root \{\n {4}--bp: 24px;/);
});

test('a component is built after every component it nests, and ties stay alphabetical', () => {
  assert.deepEqual(buildOrder(['card', 'button', 'icon', 'avatar'], { card: ['button', 'avatar'], button: ['icon'] }), ['avatar', 'icon', 'button', 'card']);
  assert.deepEqual(buildOrder(['b', 'a'], { a: ['a'] }), ['a', 'b']);
});

test('in build mode a Figma component with no code is to build, and every gate skips it', async () => {
  const dir = figmaOnly();
  const list = await inProgressList(dir, cfgOf(dir));
  const toBuild = list.filter((x) => x.why === 'to build').map((x) => x.name).sort();
  assert.deepEqual(toBuild, ['button', 'chip', 'field']);
  assert.ok((await inProgressNames(dir, cfgOf(dir))).has('button'));
  // Outside build mode the same project lists nothing as to build.
  const { build, ...plain } = cfgOf(dir);
  assert.equal((await inProgressList(dir, plain)).filter((x) => x.why === 'to build').length, 0);
});

test('the token check lists the tokens to build, exactly, and does not fail; a wrong value still fails', () => {
  const dir = figmaOnly();
  let r = spawnSync(process.execPath, [join(ENGINE, 'parity-check.mjs')], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /TO BUILD {2}17 token\(s\)/);
  const css = readFileSync(join(dir, TOKENS_TO_BUILD), 'utf8');
  assert.match(css, /--radii-chip: 16px;/);
  assert.match(css, /:root\[data-theme="dark"\] \{[^}]*--button-background: #5b8def;/);
  // Built as listed, every token matches; one value changed by hand fails as usual.
  writeFileSync(join(dir, 'src/theme.css'), css.replace(/^\/\*.*\*\/\n/, '').replace('--radii-chip: 16px;', '--radii-chip: 12px;'));
  r = spawnSync(process.execPath, [join(ENGINE, 'parity-check.mjs')], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.doesNotMatch(r.stdout, /TO BUILD/);
  assert.match(r.stdout, /--radii-chip/);
});

test('the next step builds the tokens first, then one component at a time', () => {
  const failing = [{ label: 'Token values', lines: ['❌ x'] }];
  const toBuild = { tokens: 3, file: TOKENS_TO_BUILD, theme: 'src/styles/tokens.css', components: ['button', 'card'] };
  assert.match(nextStep({ failing, toBuild }), /^NEXT: tell the user what fails/);
  assert.match(nextStep({ toBuild }), /copy the declarations in .*tokens-to-build\.css into src\/styles\/tokens\.css/);
  assert.match(nextStep({ toBuild: { ...toBuild, tokens: 0 } }), /build button: run rms-design-system-engine --query button .* --component button until it passes/);
  const line = buildLine({ tokens: 0, components: ['button'] });
  assert.match(buildSummary({ verdict: 'pass', gates: [], toBuild: line, next: 'NEXT: x' }), /What is built matches Figma[\s\S]*TO BUILD/);
  assert.equal(buildLine({ tokens: 0, components: [] }), null);
});

test('setup on a project with no CSS at all starts in build mode', { timeout: 120000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'build-init-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  const r = spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--init', '--figma-url=https://www.figma.com/design/AbCdEf123456XyZ/Tidepool', '--no-hooks'], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const cfg = cfgOf(dir);
  assert.equal(cfg.build, true);
  assert.equal(cfg.paths.themeCSS, 'src/styles/tokens.css');
  assert.match(r.stdout, /Build mode/);
  assert.ok(!existsSync(join(dir, 'src/styles/tokens.css')), 'the engine writes no theme itself');
});

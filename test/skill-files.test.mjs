// I55: recipes and reference printed by the engine, the install doctor, and the classic guide for rollback.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, symlinkSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { listDocs, readDoc, printDoc, doctor, classicGuide, writeClassicGuide, fetchClassic, GUIDE, logUsage } from '../skill-files.mjs';
import { makeFixture } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const engine = () => makeFixture({
  [GUIDE]: '# guide\nRead a recipe with `rms-figma-code-parity --recipe <name>`.\n',
  'cookbook/audit-component.md': '# Audit one component\n\n**Use when.** the person names a component.\n\nsteps\n',
  'cookbook/first-setup.md': '# First setup\n\n**Use when.** there is no ds-config.json.\n',
  'reference/config.md': '# Project config\n\nfields\n',
});

test('recipes and reference: listed with their "use when", printed by name, never a path outside', () => {
  const dir = engine();
  assert.deepEqual(listDocs(dir, 'recipe'), [{ name: 'audit-component', when: 'the person names a component.' }, { name: 'first-setup', when: 'there is no ds-config.json.' }]);
  assert.deepEqual(listDocs(dir, 'reference'), [{ name: 'config', when: 'Project config' }]);
  assert.match(readDoc(dir, 'recipe', 'audit-component'), /^# Audit one component/);
  assert.equal(readDoc(dir, 'recipe', '../reference/config'), null);
  assert.equal(readDoc(dir, 'recipe', 'nope'), null);
  const out = []; const log = (l) => out.push(l);
  assert.equal(printDoc(dir, 'recipe', null, log), 0);
  assert.match(out.join('\n'), /audit-component {7,}the person names a component\./);
  assert.equal(printDoc(dir, 'recipe', 'nope', log), 2);
  assert.match(out.at(-1), /Known: audit-component, first-setup\./);
  assert.equal(printDoc(makeFixture({}), 'recipe', null, log), 2);   // a version without recipes says so
});

test('through the audit command, from any folder', () => {
  const r = spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--recipe', 'nope'], { cwd: makeFixture({}), encoding: 'utf8' });
  assert.equal(r.status, 2);
});

test('doctor: the command link, a stale copy, recipes, Chrome and the project hooks', () => {
  const dir = engine();
  const home = makeFixture({});
  mkdirSync(join(home, '.claude', 'commands'), { recursive: true });
  const rows = (extra = {}) => doctor({ engineDir: dir, home, nodeVersion: '22.1.0', findChrome: () => '/bin/chrome', ...extra });
  assert.match(rows().find((r) => /command/.test(r.what)).fix, /--link-command/);   // not installed
  symlinkSync(join(dir, GUIDE), join(home, '.claude', 'commands', GUIDE));
  assert.equal(rows().every((r) => r.ok), true);
  const home2 = makeFixture({ [`.claude/commands/${GUIDE}`]: 'an old copy' });
  assert.match(doctor({ engineDir: dir, home: home2, nodeVersion: '22.1.0', findChrome: () => '/bin/chrome' }).find((r) => /command/.test(r.what)).what, /differs/);
  assert.equal(rows({ nodeVersion: '20.5.0' }).find((r) => /Node/.test(r.what)).ok, false);
  const project = makeFixture({ 'ds-config.json': {} });
  assert.match(rows({ projectDir: project, hooksStatus: () => ({ installed: false }) }).at(-1).fix, /--install-hooks/);
  assert.equal(rows({ projectDir: makeFixture({ 'ds-config.json': { hooks: false } }) }).at(-1).ok, true);
  const noRecipes = makeFixture({ [GUIDE]: 'read a recipe with --recipe' });
  assert.equal(doctor({ engineDir: noRecipes, home, nodeVersion: '22.1.0', findChrome: () => 'x' }).find((r) => /recipes/.test(r.what)).ok, false);
});

test('classic guide: the monolith from its git tag, for rollback', () => {
  const dir = makeFixture({ [GUIDE]: 'the one big guide\n' });
  const git = (...a) => execFileSync('git', a, { cwd: dir, env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@e', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@e' } });
  git('init', '-q'); git('add', '-A'); git('commit', '-qm', 'monolith');
  assert.equal(classicGuide(dir), null);   // no tag yet
  git('tag', 'guide-monolith');
  writeFileSync(join(dir, GUIDE), 'the short guide\n'); git('commit', '-qam', 'split');
  assert.equal(classicGuide(dir), 'the one big guide\n');
  assert.equal(readFileSync(writeClassicGuide(dir), 'utf8'), 'the one big guide\n');
  // A real install is a shallow clone without the tag: it is fetched from the remote when asked for.
  const install = join(makeFixture({}), 'skill');
  execFileSync('git', ['clone', '-q', '--depth', '1', `file://${dir}`, install]);
  assert.equal(classicGuide(install), null);
  assert.equal(fetchClassic(install), true);
  assert.equal(classicGuide(install), 'the one big guide\n');
});

test('the usage log: off unless PARITY_USAGE_LOG=1, local, keeps the route and never the request text', () => {
  const dir = makeFixture({});
  const file = join(dir, '.parity-out', 'skill-usage.json');
  assert.equal(logUsage(dir, { kind: 'route', recipe: 'audit-component' }, { env: {} }), false);
  assert.equal(existsSync(file), false);
  const now = () => new Date('2026-03-01T10:00:00Z');
  assert.equal(logUsage(dir, { kind: 'route', recipe: 'audit-component', run: ['rms-figma-code-parity --component chip'] }, { env: { PARITY_USAGE_LOG: '1' }, now }), true);
  logUsage(dir, { kind: 'recipe', name: 'fix-a-difference' }, { env: { PARITY_USAGE_LOG: '1' }, now });
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), [
    { at: '2026-03-01T10:00:00.000Z', kind: 'route', recipe: 'audit-component', run: ['rms-figma-code-parity --component chip'] },
    { at: '2026-03-01T10:00:00.000Z', kind: 'recipe', name: 'fix-a-difference' },
  ]);
});

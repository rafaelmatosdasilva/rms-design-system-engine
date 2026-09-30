// names.mjs: the new project names first, the old ones read as a fallback, and an old install moved once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, lstatSync, readlinkSync, statSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { PROJECT, projectPath, newPath, codeSnapshotPath, moveOutDir, oldNameLines, gitignoreNewNames, envVar, ENGINE_DIRS, SKILL, OLD_SKILL } from '../names.mjs';
import { migrateInstall } from '../self-update.mjs';
import { writeBaseline } from '../baseline.mjs';
import { loadAgreed, recordAgreed } from '../agreed.mjs';

const tmp = () => mkdtempSync(join(tmpdir(), 'names-'));

test('projectPath reads the new name, and the old one only when it is the only one there', () => {
  const dir = tmp();
  assert.equal(projectPath(dir, 'map'), 'design-system-engine-map.mjs');
  writeFileSync(join(dir, 'parity-map.mjs'), '');
  assert.equal(projectPath(dir, 'map'), 'parity-map.mjs');
  writeFileSync(join(dir, 'design-system-engine-map.mjs'), '');
  assert.equal(projectPath(dir, 'map'), 'design-system-engine-map.mjs');
  assert.equal(newPath('baseline'), 'design-system-engine-baseline.json');
  assert.throws(() => projectPath(dir, 'nope'));
});

test('every project name has a new form under design-system-engine and an old one under parity', () => {
  for (const n of Object.values(PROJECT)) {
    assert.match(n.now, /design-system-engine/);
    assert.match(n.old, /parity/);
  }
  assert.deepEqual(ENGINE_DIRS.sort(), ['.design-system-engine-out', '.design-system-engine-refs', '.parity-out', '.parity-refs']);
});

test('a config that names the old output folder is read as the new one', () => {
  assert.equal(codeSnapshotPath({}), '.design-system-engine-out/code.snapshot.json');
  assert.equal(codeSnapshotPath({ codeReading: { out: '.parity-out/code.snapshot.json' } }), '.design-system-engine-out/code.snapshot.json');
  assert.equal(codeSnapshotPath({ codeReading: { out: 'build/capture.json' } }), 'build/capture.json');
});

test('the old output folder is moved once, and never over a new one', () => {
  const dir = tmp();
  assert.equal(moveOutDir(dir), null);
  mkdirSync(join(dir, '.parity-out'));
  writeFileSync(join(dir, '.parity-out', 'summary.md'), 'x');
  assert.match(moveOutDir(dir), /Moved \.parity-out to \.design-system-engine-out/);
  assert.equal(readFileSync(join(dir, '.design-system-engine-out', 'summary.md'), 'utf8'), 'x');
  assert.equal(existsSync(join(dir, '.parity-out')), false);
  mkdirSync(join(dir, '.parity-out'));
  assert.equal(moveOutDir(dir), null);
  assert.equal(existsSync(join(dir, '.parity-out')), true);
});

test('each old file still in the project is said with its rename, or with the delete when both are there', () => {
  const dir = tmp();
  assert.deepEqual(oldNameLines(dir), []);
  writeFileSync(join(dir, 'parity-baseline.json'), '{}');
  writeFileSync(join(dir, 'parity-agreed.json'), '{}');
  writeFileSync(join(dir, 'design-system-engine-agreed.json'), '{}');
  writeFileSync(join(dir, 'parity-check-result.json'), '{}');   // output, rewritten each run: never said
  const lines = oldNameLines(dir);
  assert.equal(lines.length, 2);
  assert.ok(lines.some((l) => l.includes('parity-baseline.json is the old name: rename it to design-system-engine-baseline.json.')));
  assert.ok(lines.some((l) => l.includes('delete parity-agreed.json.')));
});

test('a .gitignore with the old ignored names gets the new ones, once', () => {
  const dir = tmp();
  assert.deepEqual(gitignoreNewNames(dir), []);
  writeFileSync(join(dir, '.gitignore'), 'node_modules\n.parity-out/\nparity-check-result.json');
  assert.deepEqual(gitignoreNewNames(dir), ['.design-system-engine-out/', 'design-system-engine-check-result.json']);
  assert.deepEqual(gitignoreNewNames(dir), []);
  assert.equal(readFileSync(join(dir, '.gitignore'), 'utf8'), 'node_modules\n.parity-out/\nparity-check-result.json\n.design-system-engine-out/\ndesign-system-engine-check-result.json\n');
});

test('environment variables: the new name first, then the old PARITY_ one', () => {
  assert.equal(envVar({ PARITY_NO_AUTO_UPDATE: '1' }, 'NO_AUTO_UPDATE'), '1');
  assert.equal(envVar({ PARITY_NO_AUTO_UPDATE: '1', DESIGN_SYSTEM_ENGINE_NO_AUTO_UPDATE: '0' }, 'NO_AUTO_UPDATE'), '0');
  assert.equal(envVar({}, 'NO_AUTO_UPDATE'), undefined);
});

test('a baseline and an agreed record under the old name are read, and written under the new one', () => {
  const dir = tmp();
  const oldBase = join(dir, 'parity-baseline.json');
  writeFileSync(oldBase, JSON.stringify({ gates: ['[1] Old gate'] }));
  const gates = [{ label: '[2] New gate', pass: false, lines: [] }];
  writeBaseline(join(dir, newPath('baseline')), gates, { merge: true, from: oldBase });
  assert.deepEqual(JSON.parse(readFileSync(join(dir, newPath('baseline')), 'utf8')).gates, ['[1] Old gate', '[2] New gate']);

  writeFileSync(join(dir, 'parity-agreed.json'), JSON.stringify({ version: 1, facts: { k: { figma: 'a', code: 'a' } }, seen: {} }));
  assert.ok(loadAgreed(dir).facts.k);
  recordAgreed(dir, [{ key: 'j', figma: 'b', code: 'b', same: true }], { commit: null });
  const now = JSON.parse(readFileSync(join(dir, 'design-system-engine-agreed.json'), 'utf8'));
  assert.ok(now.facts.k && now.facts.j);
});

test('an install under the old name moves to the new one, with the command and the terminal command', () => {
  const home = tmp();
  const from = join(home, '.claude', 'skills', OLD_SKILL);
  mkdirSync(from, { recursive: true });
  spawnSync('git', ['init', '-q', from]);
  spawnSync('git', ['-C', from, 'remote', 'add', 'origin', `https://github.com/rafaelmatosdasilva/${OLD_SKILL}`]);
  writeFileSync(join(from, `${SKILL}.md`), '# guide');
  writeFileSync(join(from, 'audit.mjs'), '');
  mkdirSync(join(home, '.claude', 'commands'), { recursive: true });
  writeFileSync(join(home, '.claude', 'commands', `${OLD_SKILL}.md`), 'old');
  mkdirSync(join(home, '.local', 'bin'), { recursive: true });
  writeFileSync(join(home, '.local', 'bin', OLD_SKILL), 'old');
  symlinkSync(join(home, '.local', 'bin', 'gone'), join(home, '.local', 'bin', 'rms-parity'));   // a link whose target is gone

  // Somewhere else, or with the new folder already there: nothing moves.
  assert.equal(migrateInstall(join(home, 'elsewhere'), { home, reachable: () => true }), null);

  const r = migrateInstall(from, { home, reachable: () => true });
  const to = join(home, '.claude', 'skills', SKILL);
  assert.equal(r.to, to);
  assert.match(r.line, /Open a new Claude Code session/);
  assert.equal(existsSync(from), false);
  assert.equal(existsSync(join(to, `${SKILL}.md`)), true);
  const url = spawnSync('git', ['-C', to, 'remote', 'get-url', 'origin'], { encoding: 'utf8' }).stdout.trim();
  assert.equal(url, `https://github.com/rafaelmatosdasilva/${SKILL}`);
  const link = join(home, '.claude', 'commands', `${SKILL}.md`);
  assert.ok(lstatSync(link).isSymbolicLink());
  assert.equal(readlinkSync(link), join(to, `${SKILL}.md`));
  assert.equal(existsSync(join(home, '.claude', 'commands', `${OLD_SKILL}.md`)), false);
  const bin = join(home, '.local', 'bin');
  assert.equal(existsSync(join(bin, OLD_SKILL)), false);
  assert.throws(() => lstatSync(join(bin, 'rms-parity')));
  assert.match(readFileSync(join(bin, SKILL), 'utf8'), new RegExp(`exec node ".*${SKILL}/audit\\.mjs"`));
  assert.ok(statSync(join(bin, SKILL)).mode & 0o100);
  assert.equal(migrateInstall(from, { home }), null);
});

test('the remote keeps the old address while the new one does not answer (it redirects after the rename)', () => {
  const home = tmp();
  const from = join(home, '.claude', 'skills', OLD_SKILL);
  mkdirSync(from, { recursive: true });
  spawnSync('git', ['init', '-q', from]);
  spawnSync('git', ['-C', from, 'remote', 'add', 'origin', `https://github.com/rafaelmatosdasilva/${OLD_SKILL}`]);
  const r = migrateInstall(from, { home, reachable: () => false });
  const url = spawnSync('git', ['-C', r.to, 'remote', 'get-url', 'origin'], { encoding: 'utf8' }).stdout.trim();
  assert.equal(url, `https://github.com/rafaelmatosdasilva/${OLD_SKILL}`);
});

// One name everywhere: the old ones live only where an old install or project is recognised and moved, in the
// README section for people coming from the old name, and in the record of past evaluations.
const OLD = /rms-figma-code-parity|rms-parity\b|\.parity-out|\.parity-refs|parity-map|parity-baseline|parity-agreed|parity-history|parity-check-result|com\.rms\.parity|\bPARITY_[A-Z]/;
const OLD_ALLOWED = new Set(['names.mjs', 'install.sh', 'self-update.mjs', 'skill-files.mjs', 'query.mjs', 'edit-check.mjs', 'audit.mjs',
  'README.md', 'test/names.test.mjs', 'test/demo-ds.test.mjs', 'test/skill-evals/lib.mjs', 'test/skill-evals/RESULTS.md']);
test('the old names appear only where the move from them is handled', () => {
  const ROOT = join(import.meta.dirname, '..');
  const files = spawnSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).stdout.split('\n').filter(Boolean)
    .filter((f) => !f.startsWith('test/skill-evals/results/') && !/\.(png|jpe?g|gif|webp|ico)$/.test(f) && existsSync(join(ROOT, f)));
  const stray = files.filter((f) => !OLD_ALLOWED.has(f) && OLD.test(readFileSync(join(ROOT, f), 'utf8')));
  assert.deepEqual(stray, []);
});

test('project hooks that point at the old install point at the new one on the next run', async () => {
  const { installHooks, upgradeHooks, hooksStatus } = await import('../hooks-install.mjs');
  const dir = tmp();
  const gone = join(tmp(), OLD_SKILL);
  installHooks(dir, { engineDir: gone });
  assert.equal(hooksStatus(dir).exists, false);
  assert.equal(upgradeHooks(dir, {}, { env: {} }), true);
  const h = hooksStatus(dir);
  assert.equal(h.exists, true);
  assert.equal(h.command.includes(gone), false);
  assert.equal(upgradeHooks(dir, {}, { env: {} }), false);
});

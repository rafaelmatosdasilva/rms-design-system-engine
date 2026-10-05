// Where the project is: the folder the engine runs in, or one it is told (a folder or a git link), remembered there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { hasCode, projectFor, POINTER } from '../project-dir.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));

test('a folder holds code when it has a manifest or a stylesheet, page or script of its own', () => {
  const d = mkdtempSync(join(tmpdir(), 'pd-'));
  assert.equal(hasCode(d), false);
  mkdirSync(join(d, 'node_modules', 'x'), { recursive: true }); writeFileSync(join(d, 'node_modules', 'x', 'a.css'), '');
  writeFileSync(join(d, 'notes.md'), '# notes');
  assert.equal(hasCode(d), false, 'a dependency or a note is not the project\'s code');
  mkdirSync(join(d, 'src', 'styles'), { recursive: true }); writeFileSync(join(d, 'src', 'styles', 'theme.css'), ':root{}');
  assert.equal(hasCode(d), true);
});

test('a git link is cloned beside where the engine runs, once; owner/repo is GitHub; a folder is itself', () => {
  const from = mkdtempSync(join(tmpdir(), 'pd-from-'));
  const calls = [];
  const git = (args) => { calls.push(args); mkdirSync(join(args[2], '.git'), { recursive: true }); return { status: 0 }; };
  assert.deepEqual(projectFor('acme/ui-kit', from, { git }), { dir: join(from, 'ui-kit'), url: 'https://github.com/acme/ui-kit.git', cloned: true });
  assert.deepEqual(calls, [['clone', 'https://github.com/acme/ui-kit.git', join(from, 'ui-kit')]]);
  assert.deepEqual(projectFor('https://github.com/acme/ui-kit.git', from, { git }), { dir: join(from, 'ui-kit'), url: 'https://github.com/acme/ui-kit.git' }, 'already cloned: used as it is');
  assert.equal(calls.length, 1);
  assert.deepEqual(projectFor('../elsewhere', from), { dir: join(dirname(from), 'elsewhere') });
  assert.equal(projectFor('git@x.example:a/b.git', from, { git: () => ({ status: 128 }) }).error, 'could not clone git@x.example:a/b.git');
});

test('told where the project is, the engine works there and remembers it for the next run from the same folder', { timeout: 120000 }, () => {
  const from = mkdtempSync(join(tmpdir(), 'pd-run-'));
  const project = mkdtempSync(join(tmpdir(), 'pd-proj-'));
  execFileSync('git', ['init', '-q'], { cwd: project });
  mkdirSync(join(project, 'src'), { recursive: true }); writeFileSync(join(project, 'src', 'theme.css'), ':root { --a: #fff; }');
  const r = spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--init', '--figma-url=https://www.figma.com/design/AbCdEf123456XyZ/X', '--no-hooks', `--project=${project}`], { cwd: from, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(existsSync(join(project, 'ds-config.json')), 'set up in the project');
  assert.ok(!existsSync(join(from, 'ds-config.json')), 'not where it ran from');
  assert.equal(readFileSync(join(from, POINTER), 'utf8').trim(), project);
  const again = spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--version'], { cwd: from, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  assert.match(again.stderr, new RegExp(`Project: ${project.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
});

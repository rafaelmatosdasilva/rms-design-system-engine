// The folders tests make are deleted when the test process ends, and a run stopped before that is swept by the next.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { tempDir, sweepTempRoots } from './helpers.mjs';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));

test('a test folder sits under one root named for its process', () => {
  const a = tempDir('one-'), b = tempDir('two-');
  assert.equal(dirname(a), dirname(b));
  assert.match(basename(dirname(a)), new RegExp(`^rms-test-${process.pid}-`));
  assert.equal(dirname(dirname(a)), tmpdir());
});

test('the root is deleted when the process ends', () => {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e',
    `import { tempDir } from ${JSON.stringify(pathToFileURL(join(TEST_DIR, 'helpers.mjs')).href)}; const d = tempDir('gone-'); console.log(d);`], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const made = r.stdout.trim();
  assert.ok(made, 'the child printed its folder');
  assert.ok(!existsSync(made) && !existsSync(dirname(made)), `${dirname(made)} was left behind`);
});

test('a root left by a process that is gone is swept; a live one and folders of other kinds are kept', () => {
  const base = tempDir('sweep-');
  const gone = spawnSync(process.execPath, ['-e', 'console.log(process.pid)'], { encoding: 'utf8' }).stdout.trim();
  for (const n of [`rms-test-${gone}-abc123`, `rms-test-${process.pid}-def456`, 'rms-test-notapid', 'gate-ghi789']) {
    mkdirSync(join(base, n, 'fixture'), { recursive: true });
    writeFileSync(join(base, n, 'fixture', 'a.json'), '{}');
  }
  assert.equal(sweepTempRoots(base), 1);
  assert.deepEqual(readdirSync(base).sort(), ['gate-ghi789', `rms-test-${process.pid}-def456`, 'rms-test-notapid']);
});

test('no test makes a folder in the system temp folder itself, only through tempDir', () => {
  const offenders = readdirSync(TEST_DIR).filter((f) => f.endsWith('.test.mjs'))
    .filter((f) => /mkdtemp(Sync)?\([^;]*tmpdir\(\)/.test(readFileSync(join(TEST_DIR, f), 'utf8')));
  assert.deepEqual(offenders, [], 'use tempDir() from helpers.mjs, so the folder is deleted when the test ends');
});

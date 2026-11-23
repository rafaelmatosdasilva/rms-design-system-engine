// A project's tools and the PATH's commands, found the same way on every system (project-bin.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tempDir } from './helpers.mjs';
import { binIn, onPath } from '../lib/project-bin.mjs';

test('a command on the PATH is found by the engine itself: each folder in order, and Windows\' extensions there', () => {
  const have = new Set([join('/a', 'tsc'), join('/b', 'tsc'), join('C:\\tools', 'claude.CMD')]);
  const exists = (f) => have.has(f);
  assert.equal(onPath('tsc', { env: { PATH: '/x:/a:/b' }, exists, win: false }), join('/a', 'tsc'), 'the first folder that has it');
  assert.equal(onPath('nope', { env: { PATH: '/a:/b' }, exists, win: false }), null);
  assert.equal(onPath('claude', { env: { PATH: 'C:\\none;C:\\tools', PATHEXT: '.EXE;.CMD' }, exists, win: true }), join('C:\\tools', 'claude.CMD'), 'a .cmd on Windows, by PATHEXT');
  assert.equal(onPath('claude', { env: { PATH: 'C:\\tools' }, exists, win: false }), null, 'no extension is tried off Windows');
});

test('a package\'s own script is run through node, whatever node_modules/.bin holds', () => {
  const dir = tempDir('project-bin-');
  mkdirSync(join(dir, 'node_modules', 'acme-lint', 'bin'), { recursive: true });
  writeFileSync(join(dir, 'node_modules', 'acme-lint', 'package.json'), JSON.stringify({ name: 'acme-lint', bin: { 'acme-lint': 'bin/cli.js' } }));
  writeFileSync(join(dir, 'node_modules', 'acme-lint', 'bin', 'cli.js'), '');
  assert.deepEqual(binIn(join(dir, 'node_modules'), 'acme-lint'), { file: process.execPath, args: [join(dir, 'node_modules', 'acme-lint', 'bin', 'cli.js')] });
  assert.equal(binIn(join(dir, 'node_modules'), 'missing'), null);
});

test('Firefox is found where Windows installs it, as Chrome is, with nothing on the PATH', async () => {
  const { findFirefox } = await import('../lib/browsers.mjs');
  const at = join('C:\\Program Files', 'Mozilla Firefox', 'firefox.exe');
  assert.equal(findFirefox({ env: { ProgramFiles: 'C:\\Program Files' }, exists: (f) => f === at, which: () => null, here: null }), at);
  assert.equal(findFirefox({ env: { DESIGN_SYSTEM_ENGINE_FIREFOX: 'none', ProgramFiles: 'C:\\Program Files' }, exists: () => true, which: () => null }), null, 'switched off is off');
});

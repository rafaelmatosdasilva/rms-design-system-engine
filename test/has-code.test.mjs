// Whether a folder holds code: the one answer setup and the router both read (has-code.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { hasCode, POINTER } from '../lib/has-code.mjs';
import { hasCode as setupsOwn } from '../lib/project-dir.mjs';
import { tempDir } from './helpers.mjs';

test('a folder holds code when it has a package manifest or a stylesheet, page or script of its own', () => {
  const dir = tempDir('has-code-');
  assert.equal(hasCode(dir), false, 'an empty folder');
  writeFileSync(join(dir, POINTER), '../elsewhere'); writeFileSync(join(dir, 'README.md'), '# Acme');
  mkdirSync(join(dir, '.claude')); writeFileSync(join(dir, '.claude', 'hook.mjs'), '');
  assert.equal(hasCode(dir), false, 'a pointer, a readme and what a hidden folder holds are no code');
  mkdirSync(join(dir, 'src', 'styles'), { recursive: true }); writeFileSync(join(dir, 'src', 'styles', 'tokens.css'), ':root{}');
  assert.equal(hasCode(dir), true);
  assert.equal(setupsOwn, hasCode, 'setup asks the very same function');
});

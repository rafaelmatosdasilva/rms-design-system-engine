// This repository is public, and the engine gets run on it.
//
// The engine reads a GITLAB_TOKEN or a FIGMA_TOKEN from a .env beside the project it is run on. This repository is
// one of those projects. A .env appeared at its root during a day's work, `git add -A` staged it, and the privacy
// hook refused the commit - which is the last line, not the first, and only ever runs on a machine that has the
// hook installed.
//
// So the repository ignores it, and this makes sure it goes on ignoring it. An ignore rule is one line that
// anyone can tidy away while cleaning up, on the day it stops looking necessary.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const ignored = (path) => {
  try { execFileSync('git', ['check-ignore', '-q', path], { cwd: ROOT, stdio: 'ignore' }); return true; } catch { return false; }
};

test('a .env is never committable here, whatever it is called', () => {
  for (const f of ['.env', '.env.local', '.env.production', 'test/.env']) {
    assert.ok(ignored(f), `${f} would be committed: this repository is public and a .env holds tokens`);
  }
});

test('and no .env is tracked already', () => {
  const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n');
  const found = tracked.filter((f) => /(^|\/)\.env($|\.)/.test(f) && !/\.env\.example$/.test(f));
  assert.deepEqual(found, [], 'a .env is in the repository');
});

test('an example .env is still allowed, since it holds no secret', () => {
  // The ignore rule must not be so wide that a project cannot show people the shape of the file they need.
  assert.ok(!ignored('.env.example'), '.env.example is ignored, so nobody can commit the one file that is safe');
  if (existsSync(join(ROOT, '.env.example'))) {
    assert.doesNotMatch(readFileSync(join(ROOT, '.env.example'), 'utf8'), /=\s*\S/, 'the example .env has a value in it');
  }
});

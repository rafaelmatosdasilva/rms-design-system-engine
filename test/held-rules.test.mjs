// The rules a run holds, read wherever the run is: the file on disk, else its last committed version, and said when
// neither exists (held-rules.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { tempDir } from './helpers.mjs';
import { readHeld, heldLine } from '../lib/held-rules.mjs';

const doc = { _built: { at: '2026-11-01T00:00:00Z' }, code: { rules: [{ id: 'code-x', status: 'rule', toFix: [] }] } };
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 'QA', GIT_AUTHOR_EMAIL: 'qa@example.com', GIT_COMMITTER_NAME: 'QA', GIT_COMMITTER_EMAIL: 'qa@example.com' } });

test('on disk it is read from the file; gone from disk, from the history; in neither, it says so', () => {
  const root = tempDir('held-');
  mkdirSync(join(root, 'contracts'));
  writeFileSync(join(root, 'contracts/construction.json'), JSON.stringify(doc));
  assert.equal(readHeld(root, 'contracts/construction.json').from, 'file');
  git(root, 'init', '-q'); git(root, 'add', '.'); git(root, 'commit', '-qm', 'contracts');
  rmSync(join(root, 'contracts/construction.json'));
  const r = readHeld(root, 'contracts/construction.json');
  assert.equal(r.from, 'history');
  assert.deepEqual(r.doc, doc);
  assert.match(heldLine(r), /read from contracts\/construction\.json as the repository last committed it \([0-9a-f]{8}, \d{4}-\d{2}-\d{2}\): it is not on disk here\./);
  const none = readHeld(tempDir('held-none-'), 'contracts/construction.json');
  assert.deepEqual(none, { doc: null, from: null });
  assert.match(heldLine(none), /^ℹ️  No record of the rules held before .* Commit contracts\/construction\.json so every run holds the same rules\.$/);
  assert.equal(heldLine({ from: 'file' }), null, 'nothing to say when it is on disk');
});

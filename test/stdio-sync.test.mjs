// A report read through a pipe is never cut off at exit: the audit makes its own writes blocking first thing,
// and every gate it runs through a pipe starts the same way. Seen as reports that stopped mid-summary under load.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));

test('the audit imports stdio-sync before anything else, and passes it to every gate', () => {
  const audit = readFileSync(join(ENGINE, 'audit.mjs'), 'utf8');
  assert.match(audit.slice(audit.indexOf('import ')), /^import '\.\/stdio-sync\.mjs';/);
  assert.match(audit, /spawn\(process\.execPath, \['--import', pathToFileURL\(join\(SCRIPT_DIR, 'stdio-sync\.mjs'\)\)\.href, abs, \.\.\.args\]/);
});

test('with stdio-sync, a large write then an immediate exit reaches a pipe whole', () => {
  const script = `process.stdout.write('x'.repeat(2_000_000) + '\\nEND\\n'); process.exit(0);`;
  const r = spawnSync(process.execPath, ['--import', join(ENGINE, 'stdio-sync.mjs'), '-e', script], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  assert.equal(r.status, 0);
  assert.equal(r.stdout.length, 2_000_000 + 5);
  assert.match(r.stdout, /END\n$/);
});

// The engine's modules live in lib/, so its page on GitHub shows the README after a short list. Four entries stay at
// the root because people's setups name them (the command, the project hooks, MCP configs, the teams' publishing jobs),
// and each only loads its module from lib/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const ENTRIES = ['audit.mjs', 'guard.mjs', 'mcp.mjs', 'styleguide-files.mjs'];

test('a module goes in lib/: the root holds only the four entries people\'s setups name', () => {
  const root = readdirSync(ENGINE).filter((f) => /\.(mjs|js|cjs)$/.test(f)).sort();
  assert.deepEqual(root, ENTRIES, `move ${root.filter((f) => !ENTRIES.includes(f)).join(', ') || 'nothing'} into lib/ (git mv), and import it as ./lib/<name> from tests`);
});

test('each root entry only loads its module from lib/', () => {
  for (const f of ENTRIES) {
    const code = readFileSync(join(ENGINE, f), 'utf8').split('\n').filter((l) => l.trim() && !l.trim().startsWith('//'));
    assert.deepEqual(code, [`import './lib/${f}';`], f);
    assert.ok(existsSync(join(ENGINE, 'lib', f)), `lib/${f}`);
  }
});

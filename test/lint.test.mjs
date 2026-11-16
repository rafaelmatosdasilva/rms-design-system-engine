// The engine's own code held to its coding standards (docs/development.md#coding-standards): ESLint's recommended
// rules, with the engine's deliberate patterns stated once in test/.lint-tools/eslint.config.mjs. ESLint is a test tool
// in a folder of its own, as TypeScript is, so the engine itself keeps no dependency. CI installs it; on a computer,
// install it once with the command the skip names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { budget } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const ESLINT = join(ENGINE, 'test', '.lint-tools', 'node_modules', 'eslint', 'bin', 'eslint.js');
const ready = existsSync(ESLINT) ? false : 'ESLint is not installed (npm ci --prefix test/.lint-tools)';

test('the engine\'s code follows its written coding standards, as ESLint checks them', { skip: ready, timeout: budget(180000) }, () => {
  const r = spawnSync(process.execPath, [ESLINT, '-c', 'test/.lint-tools/eslint.config.mjs', '--max-warnings', '0', '.'], { cwd: ENGINE, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  assert.equal(r.status, 0, `ESLint found what the coding standards do not allow:\n${(r.stdout || r.stderr).trim()}`);
});

test('a line that turns a rule off names that rule: nothing is switched off wholesale', () => {
  const files = [...readdirSync(join(ENGINE, 'lib')).filter((f) => /\.(mjs|js)$/.test(f)).map((f) => join('lib', f)),
    ...readdirSync(ENGINE).filter((f) => f.endsWith('.mjs')), ...readdirSync(join(ENGINE, '.githooks')).filter((f) => f.endsWith('.mjs')).map((f) => join('.githooks', f))];
  const blanket = [];
  for (const f of files) {
    readFileSync(join(ENGINE, f), 'utf8').split('\n').forEach((line, i) => {
      const m = /(?:\/\/|\/\*)\s*eslint-disable(?:-next-line|-line)?(?=\s|\*\/|$)(.*)$/.exec(line);
      if (m && !/[a-z]/.test(m[1].replace(/\*\/.*$/, ''))) blanket.push(`${f}:${i + 1}`);
    });
  }
  assert.deepEqual(blanket, [], 'name the rule a line turns off, and say why on the line above');
});

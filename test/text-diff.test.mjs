// A whole file before and after, as a patch git itself applies: every case ends with git apply turning the one into the
// other, since a patch that reads right and does not apply is no patch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { unifiedDiff } from '../lib/text-diff.mjs';
import { tempDir } from './helpers.mjs';

const applies = (file, before, after) => {
  const dir = tempDir('text-diff-');
  if (before != null) { mkdirSync(dirname(join(dir, file)), { recursive: true }); writeFileSync(join(dir, file), before); }
  const patch = unifiedDiff(file, before, after);
  writeFileSync(join(dir, 'p.diff'), patch);
  execFileSync('git', ['apply', '--check', 'p.diff'], { cwd: dir });
  execFileSync('git', ['apply', 'p.diff'], { cwd: dir });
  assert.equal(readFileSync(join(dir, file), 'utf8'), after);
  return patch;
};

test('the same text is no patch', () => {
  assert.equal(unifiedDiff('a.json', 'x\ny\n', 'x\ny\n'), '');
});

test('a changed line, lines added and lines gone, each applied by git', () => {
  const before = Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n') + '\n';
  const lines = before.split('\n');
  lines[3] = 'line three changed'; lines.splice(20, 2); lines.splice(30, 0, 'new a', 'new b');
  const patch = applies('theme.json', before, lines.join('\n'));
  assert.match(patch, /^diff --git a\/theme\.json b\/theme\.json\n--- a\/theme\.json\n\+\+\+ b\/theme\.json\n@@ /);
  assert.match(patch, /-line 3\n\+line three changed/, 'what goes comes before what replaces it');
  assert.ok(patch.split('\n').length < 40, 'only the changes and their context, not the whole file');
});

test('a change at the very start and at the very end', () => {
  applies('a.txt', 'a\nb\nc\nd\n', 'z\nb\nc\nd\ne\n');
  applies('a.txt', 'a\nb\n', '');
});

test('a file with no last newline, and a newline added or taken away', () => {
  applies('a.txt', 'a\nb\nc', 'a\nb\nx');
  applies('a.txt', 'a\nb\nc', 'a\nb\nc\n');
  applies('a.txt', 'a\nb\nc\n', 'a\nb\nc');
});

test('a file that was not there is added', () => {
  const patch = applies('styles/dark.json', null, '{\n\t"title": "Dark"\n}\n');
  assert.match(patch, /new file mode 100644\n--- \/dev\/null\n\+\+\+ b\/styles\/dark\.json/);
});

test('many random edits, each applied by git', () => {
  let seed = 7;
  const rand = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  for (let round = 0; round < 25; round++) {
    const a = Array.from({ length: 5 + rand(60) }, () => `v${rand(8)}`);
    const b = [...a];
    for (let k = rand(6); k >= 0; k--) {
      const at = rand(b.length + 1), kind = rand(3);
      if (kind === 0) b.splice(at, 0, `n${rand(8)}`); else if (kind === 1 && b.length) b.splice(Math.min(at, b.length - 1), 1); else if (b.length) b[Math.min(at, b.length - 1)] = `c${rand(8)}`;
    }
    applies('f.txt', a.join('\n') + '\n', b.join('\n') + (b.length ? '\n' : ''));
  }
});

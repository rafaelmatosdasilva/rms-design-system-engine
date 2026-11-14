// The style guide never writes a ";" in its own words: a description, a task, a suggestion (the owner's rule,
// 12 November 2026). Two sentences are two sentences, or one joined by "and" or "but"; a list is joined by " · ". What a
// team wrote (its intent layer, its commit messages) is shown as written, never rewritten.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// The quoted strings of a file's code (comments left out), each with its line.
function strings(file) {
  const out = [];
  readFileSync(file, 'utf8').split('\n').forEach((l, i) => {
    if (/^\s*(\/\/|\/?\*)/.test(l)) return;
    const code = l.replace(/(?<![:'"`\\])\/\/\s.*$/, '');
    for (const m of code.matchAll(/'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)) out.push({ line: i + 1, text: m[1] ?? m[2] });
  });
  return out;
}
// A sentence with a ";" in it: words, a semicolon, more words. Code and CSS (a declaration, a style) are not words.
const SENTENCE = /(^|[A-Za-z0-9)\]'"’])\s*; [a-z]/;
const NOT_WORDS = /px;|var\(--|^\s*[a-z-]+: [^;]+;|\{|=>|\bfunction\b|\breturn\b|\bif \(|\s=\s|\.className\b/;

test('no sentence the style guide template writes has a ";" in it', () => {
  const dir = join(ROOT, 'templates', 'styleguide', 'js'), found = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    for (const s of strings(join(dir, f))) if (SENTENCE.test(s.text) && !NOT_WORDS.test(s.text)) found.push(`${f}:${s.line}: ${s.text.slice(0, 90)}`);
  }
  assert.deepEqual(found, [], 'write it as two sentences, or join it with "and" or "but"');
});

test('the engine\'s own words on the page carry none either: a shared or local reason, a rule kept, a fix, an anatomy difference', () => {
  const files = ['lib/local-shared.mjs', 'lib/rule-checks.mjs', 'lib/construction-grammar.mjs', 'lib/build-rules.mjs', 'lib/library-rules.mjs', 'lib/run-diff.mjs'];
  const found = [];
  for (const f of files) for (const s of strings(join(ROOT, f))) {
    if (s.text === '; ') found.push(`${f}:${s.line}: a list joined with "; "`);
    else if (SENTENCE.test(s.text) && !NOT_WORDS.test(s.text) && !/^\s*[-#|]/.test(s.text)) found.push(`${f}:${s.line}: ${s.text.slice(0, 90)}`);
  }
  assert.deepEqual(found, []);
});

// Looking at a project without leaving anything in it. Somebody deciding whether to use the engine runs it on
// their own system to see what it says, and on a real project that read put three files in the project's root -
// the check's result, the prop check's result, the GitLab history - before printing a word.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from './helpers.mjs';
import { FLAG, readOnly, setReadOnly, writeInProject, removeInProject, readOnlyLines, skippedWrites, forgetSkipped } from '../lib/read-only.mjs';

const ON = [FLAG];
const off = () => { setReadOnly(false); forgetSkipped(); };
const on = () => { setReadOnly(true); forgetSkipped(); };

test('a run that is only looking writes nothing into the project', () => {
  on();
  const dir = tempDir('read-only-');
  assert.equal(writeInProject(dir, 'component-prop-result.json', '{}', { argv: ON }), false);
  assert.equal(existsSync(join(dir, 'component-prop-result.json')), false, 'the file is not there');
  // A folder it would have had to make is not made either.
  assert.equal(writeInProject(dir, 'deep/down/here.json', '{}', { argv: ON }), false);
  assert.equal(existsSync(join(dir, 'deep')), false);
  assert.deepEqual(skippedWrites(), ['component-prop-result.json', 'deep/down/here.json']);
});

test('without the flag it writes, which is the ordinary run', () => {
  off();
  const dir = tempDir('read-only-off-');
  assert.equal(writeInProject(dir, 'a/b.json', '{"x":1}', { argv: [] }), true);
  assert.equal(readFileSync(join(dir, 'a', 'b.json'), 'utf8'), '{"x":1}');
  assert.deepEqual(skippedWrites(), [], 'nothing was skipped, so nothing is reported');
  assert.deepEqual(readOnlyLines({ argv: [] }), []);
});

test('what is outside the project is written either way', () => {
  on();
  const dir = tempDir('read-only-outside-');
  const other = join(tempDir('read-only-elsewhere-'), 'cache.json');
  // The thing being protected is the person's project. A cache rebuilt on every look would make looking slow
  // enough that nobody does it twice.
  assert.equal(writeInProject(dir, other, '{}', { argv: ON }), true);
  assert.equal(existsSync(other), true);
  assert.deepEqual(skippedWrites(), [], 'and it is not reported as skipped');
});

test('what a full run would have written is said, never silently not-done', () => {
  on();
  const dir = tempDir('read-only-said-');
  for (const f of ['one.json', 'two.json', 'three.json']) writeInProject(dir, f, '{}', { argv: ON });
  const said = readOnlyLines({ argv: ON }).join('\n');
  assert.match(said, /READ ONLY {2}nothing was written into this project/);
  assert.match(said, /would have written 3 file\(s\)/);
  for (const f of ['one.json', 'two.json', 'three.json']) assert.match(said, new RegExp(f.replace('.', '\\.')));
  assert.match(said, /Run it again without --read-only to let it write them/);
  // The same file asked for twice is one line, not two.
  writeInProject(dir, 'one.json', '{}', { argv: ON });
  assert.equal(skippedWrites().filter((f) => f === 'one.json').length, 1);
});

test('a long list is counted rather than printed whole', () => {
  on();
  const dir = tempDir('read-only-many-');
  for (let i = 0; i < 12; i++) writeInProject(dir, `f${i}.json`, '{}', { argv: ON });
  assert.match(readOnlyLines({ argv: ON }).join('\n'), /… and 4 more/);
});

test('nothing skipped says nothing at all', () => {
  on();
  // A run that wrote nothing because it had nothing to write is not news.
  assert.deepEqual(readOnlyLines({ argv: ON }), []);
  assert.equal(readOnly(ON), true);
  off();
  assert.equal(readOnly([]), false);
});

test('every result file a look used to leave behind now goes through it', () => {
  // The three that appeared in a real project's root from a read, with the call each one now makes.
  const routed = [
    ['lib/component-prop-check.mjs', "writeInProject(ROOT, 'component-prop-result.json'", "writeFileSync(join(ROOT, 'component-prop-result.json'"],
    ['lib/gitlab-history.mjs', 'writeInProject(root, HISTORY_FILE', 'writeFileSync(join(root, HISTORY_FILE'],
    ['lib/parity-check.mjs', "writeInProject(ROOT, newPath('checkResult')", "writeFileSync(join(ROOT, newPath('checkResult')"],
  ];
  for (const [file, now, before] of routed) {
    const src = readFileSync(file, 'utf8');
    assert.match(src, /from '\.\/read-only\.mjs'/, `${file} does not know about it`);
    assert.ok(src.includes(now), `${file} does not route its result file`);
    assert.ok(!src.includes(before), `${file} still writes straight to disk as well`);
  }
  // And the run says what it skipped, rather than a person finding out later.
  assert.match(readFileSync('lib/audit.mjs', 'utf8'), /for \(const l of readOnlyLines\(\)\) console\.log\(l\);/);
});

test('a run that only looks does not take the person\'s files away either', () => {
  // The worse half: the audit clears its last results before the gates run, so without this a look would have
  // removed two of the person's files and, being read-only, put nothing back.
  on();
  const dir = tempDir('read-only-rm-');
  const f = join(dir, 'component-prop-result.json');
  writeFileSync(f, '{"kept":true}');
  assert.equal(removeInProject(dir, 'component-prop-result.json', { argv: ON }), false);
  assert.equal(readFileSync(f, 'utf8'), '{"kept":true}', 'still there, untouched');
  // An ordinary run clears it, which is what it is for.
  off();
  assert.equal(removeInProject(dir, 'component-prop-result.json', { argv: [] }), true);
  assert.equal(existsSync(f), false);
  // Outside the project it goes either way, like a write.
  on();
  const other = join(tempDir('read-only-rm-out-'), 'cache.json');
  writeFileSync(other, 'x');
  assert.equal(removeInProject(dir, other, { argv: ON }), true);
});

test('the audit clears its last results through it, not straight off disk', () => {
  const src = readFileSync('lib/audit.mjs', 'utf8');
  assert.match(src, /for \(const f of \['component-prop-result\.json', PROJECT\.checkResult\.now\]\) removeInProject\(ROOT, f\);/);
  assert.doesNotMatch(src, /unlinkSync\(join\(ROOT, f\)\)/, 'the old straight-to-disk delete is gone');
});

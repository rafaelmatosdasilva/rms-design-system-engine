// The engine must stay generic and this repository is public: it is exercised against private projects and built
// from private notes while it is built, and nothing from them (app names, repo names, their design system's
// component or class names, people's names, personal addresses, the private backlog and its item codes) may end up
// in the engine's code, tests, examples, docs or commit messages. This guard fails the moment one does; the
// pre-commit and commit-msg hooks in .githooks run the same check before anything is committed.
// The forbidden names are stored ONLY as hashes, so neither this file nor the check leaks them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { forbiddenHits, privateFindings, messageFindings, repoFindings, PUBLIC_EXAMPLE, ROOT } from '../.githooks/private-check.mjs';

export { forbiddenHits };

test('nothing private anywhere in the engine repo', () => {
  const found = repoFindings();
  assert.deepEqual(found, [], 'private content found: ' + found.map((x) => `${x.file}:${x.line} ${x.kind} ${x.what}`).join('; '));
});

test('the matcher normalises spacing, case and separators', () => {
  assert.equal(forbiddenHits('a perfectly generic sentence about buttons and tokens'), 0);
});

test('the public example page is the only address of the owner\'s design system allowed', () => {
  assert.equal(forbiddenHits(PUBLIC_EXAMPLE), 0);
  assert.ok(forbiddenHits(PUBLIC_EXAMPLE.replace('.github.io', '.example.com')) > 0, 'the same name anywhere else is still found');
});

// Each planted case is built from parts, so this file does not carry what it plants.
const kinds = (text) => privateFindings(text).map((x) => x.kind);
const code = (letter, n) => letter + String(n);

test('a person, a personal address, the backlog and its codes are refused', () => {
  assert.ok(kinds(['by', 'Jo' + 'hn', 'Sm' + 'ith', 'on tokens'].join(' ')).includes('a person credited'));
  assert.ok(kinds(`(${'Ja' + 'ne'} ${'Ro' + 'e'}, "Tokens at scale")`).includes('a person credited'));
  assert.ok(kinds(`${'Some' + 'one'}'s article on tokens`).includes('a person credited'));
  assert.ok(kinds(`write to ${'some.one'}@${'mail'}.com`).includes('email address'));
  assert.ok(kinds(`// the reviewer is ${'A' + 'na'}`).includes('a person\'s first name'));
  assert.ok(kinds(`the fix (${code('I', 42)}) lands`).includes('backlog item code'));
  assert.ok(kinds(`test('[${code('E', 7)}] a title'`).includes('backlog item code'));
  assert.ok(kinds(`// ${code('G', 5)}: a reason`).includes('backlog item code'));
  assert.ok(kinds(`idea ${code('I', 56)} moves it`).includes('backlog item code'));
  assert.ok(kinds(`what changed: ${code('K', 17)}, the guidance rated`).includes('backlog item code'));
  assert.ok(kinds(['the', 'design', 'system', 'engine', [...'golkcab'].reverse().join('')].join('-')).includes('private name'));
});

test('placeholders, no-reply addresses, colour spaces and products are not private', () => {
  assert.deepEqual(kinds('demo@example.com, git@gitlab.example.com, noreply@anthropic.com, user:secret@gitlab.com'), []);
  assert.deepEqual(kinds('icon@1x.png; Display P3 (D65); a heading H2; fonts from Google Fonts; by the design team'), []);
  assert.deepEqual(kinds('valuesByMode: { S1: 12, S2: 8 }'), []);
  assert.deepEqual(messageFindings('Clean the docs\n\n# a comment git adds\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n'), []);
});

test('the commit hooks refuse a private change and let a clean one through', () => {
  const dir = mkdtempSync(join(tmpdir(), 'private-check-'));
  try {
    const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' });
    git('init', '-q'); git('config', 'user.email', 'demo@example.com'); git('config', 'user.name', 'Demo');
    const check = (...a) => spawnSync(process.execPath, [join(ROOT, '.githooks', 'private-check.mjs'), ...a], { cwd: dir, encoding: 'utf8' });
    // The check reads the staged diff of the repository it runs in: run it from a copy of itself there.
    execFileSync('mkdir', ['-p', join(dir, '.githooks')]);
    execFileSync('cp', [join(ROOT, '.githooks', 'private-check.mjs'), join(dir, '.githooks', 'private-check.mjs')]);
    const staged = () => spawnSync(process.execPath, [join(dir, '.githooks', 'private-check.mjs'), '--staged'], { cwd: dir, encoding: 'utf8' });
    writeFileSync(join(dir, 'a.md'), 'A clean line about tokens.\n'); git('add', 'a.md');
    assert.equal(staged().status, 0, staged().stderr);
    writeFileSync(join(dir, 'b.md'), `Mail ${'some.one'}@${'mail'}.com about it (${code('I', 42)}).\n`); git('add', 'b.md');
    const r = staged();
    assert.equal(r.status, 1);
    assert.match(r.stderr, /b\.md:1 {2}email address/);
    assert.match(r.stderr, /backlog item code/);
    const msg = join(dir, 'MSG'); writeFileSync(msg, `Fix it, ${code('E', 7)}: done\n\n// ${code('G', 5)}: why\n`);
    assert.equal(check('--message', msg).status, 1);
    writeFileSync(msg, 'Fix the chip radius\n');
    assert.equal(check('--message', msg).status, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

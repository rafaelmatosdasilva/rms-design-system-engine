// What a person does to see a release, gathered from its pull requests. A release listed what it carried and never
// said whether anybody had to do anything: most ask nothing, and the few that do read exactly like the rest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { AFTER, AFTER_LABELS, AFTER_KEYS, afterOf, afterFor, afterSection, notesWith, HEADING, NOTHING_LINE } from '../lib/release-after.mjs';

const pr = (number, ...labels) => ({ number, labels });

test('a pull request says what to do once, as a label beside its release label', () => {
  assert.equal(afterOf(['release: minor', AFTER_LABELS.figma]).key, 'figma');
  assert.equal(afterOf([AFTER_LABELS.styleguide]).key, 'styleguide');
  // Almost every pull request asks nothing: that is the default, and the one that wants something says so.
  assert.equal(afterOf([]).key, 'nothing');
  assert.equal(afterOf(['release: patch']).key, 'nothing');
  assert.equal(afterOf(undefined).key, 'nothing');
  assert.equal(afterOf([AFTER_LABELS.nothing]).key, 'nothing');
  // Two on one pull request is nobody's intention: the first wins and the other is handed back, never guessed at.
  const both = afterOf([AFTER_LABELS.setup, AFTER_LABELS.figma]);
  assert.equal(both.key, 'figma', 'the first in the order the notes print');
  assert.deepEqual(both.also, ['setup']);
});

test('one entry a thing to do, naming every pull request that asks it', () => {
  const want = afterFor([pr(7, AFTER_LABELS.figma), pr(9), pr(11, AFTER_LABELS.figma), pr(4, AFTER_LABELS.styleguide)]);
  assert.deepEqual(want.map((w) => [w.key, w.prs]), [['figma', [7, 11]], ['styleguide', [4]]]);
  assert.match(want[0].line, /Refresh Figma/);
  // Nothing to do is the absence of a thing to do, never a row saying so.
  assert.deepEqual(afterFor([pr(1), pr(2, 'release: patch')]), []);
  assert.deepEqual(afterFor([]), []);
});

test('a release that asks nothing says so, rather than leaving it to be worked out', () => {
  const quiet = afterSection([pr(1), pr(2)]);
  assert.match(quiet, new RegExp(`^${HEADING}`));
  assert.match(quiet, new RegExp(NOTHING_LINE.replace(/[.:]/g, '\\$&')));
  // Silence would read as nobody having written it down, which is the thing this replaces.
  assert.notEqual(quiet.trim(), HEADING);
});

test('the section lists each thing once, with the pull requests that ask it', () => {
  const said = afterSection([pr(12, AFTER_LABELS.setup), pr(3, AFTER_LABELS.figma), pr(8, AFTER_LABELS.setup)]);
  const lines = said.trim().split('\n').filter((l) => l.startsWith('- '));
  assert.equal(lines.length, 2);
  assert.match(lines[0], /Refresh Figma.*\(#3\)$/, 'in the order the notes declare, not the order they were merged');
  assert.match(lines[1], /Run setup again.*\(#8, #12\)$/, 'the pull requests in order');
});

test('what is published is this section and then what GitHub generated', () => {
  const out = notesWith(afterSection([pr(5, AFTER_LABELS.figma)]), "## What's Changed\n* A thing by @someone in #5\n");
  assert.ok(out.startsWith(HEADING), 'the first thing read is whether the release wants anything');
  assert.ok(out.indexOf('Refresh Figma') < out.indexOf("What's Changed"));
  assert.match(out, /A thing by @someone in #5/);
  // Nothing generated (a first release with no notes) still publishes the section alone, never a stray blank body.
  assert.equal(notesWith('## What to do\n\n- x\n', ''), '## What to do\n\n- x\n');
  assert.equal(notesWith('## What to do\n\n- x\n', '   \n'), '## What to do\n\n- x\n');
});

test('run from the command line it prints the section, and a broken argument is not a broken release', () => {
  const run = (arg) => execFileSync(process.execPath, ['lib/release-after.mjs', arg], { encoding: 'utf8' });
  assert.match(run(JSON.stringify([pr(2, AFTER_LABELS.figma)])), /Refresh Figma.*\(#2\)/);
  // The workflow builds that argument in shell: a release must not fail because the string came out wrong.
  assert.match(run('not json at all'), new RegExp(NOTHING_LINE.replace(/[.:]/g, '\\$&')));
  assert.match(execFileSync(process.execPath, ['lib/release-after.mjs'], { encoding: 'utf8' }), /What to do/);
});

test('the workflow reads each pull request once and publishes these notes', () => {
  const yml = readFileSync('.github/workflows/release.yml', 'utf8');
  assert.match(yml, /node lib\/release-after\.mjs "\$prs"/, 'the section is built from the merged pull requests');
  assert.match(yml, /--notes-file/, 'the notes are the file, so the section is above them');
  assert.doesNotMatch(yml, /--generate-notes/, 'generated notes now come through the API, to be prepended to');
  assert.equal((yml.match(/gh pr view "\$n" --json labels/g) ?? []).length, 1, 'one read a pull request, for both labels');
  // Every label the module names is one a person can actually put on a pull request.
  for (const k of AFTER_KEYS) assert.match(AFTER[k].label, /^after: [a-z ]+$/, k);
});

// release-version - the next tag the release workflow publishes, and how big the step is.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nextVersion, bumpFor, RELEASE_LABELS } from '../lib/release-version.mjs';

test('the first release takes the package.json version', () => {
  assert.equal(nextVersion('', 'minor', '1.0.0'), 'v1.0.0');
});

test('patch, minor and major steps', () => {
  assert.equal(nextVersion('v1.4.2', 'patch', '1.0.0'), 'v1.4.3');
  assert.equal(nextVersion('v1.4.2', 'minor', '1.0.0'), 'v1.5.0');
  assert.equal(nextVersion('v1.4.2', 'major', '1.0.0'), 'v2.0.0');
});

test('the biggest step among the merged pull requests wins', () => {
  assert.equal(bumpFor([[RELEASE_LABELS.patch], [RELEASE_LABELS.patch]]), 'patch');
  assert.equal(bumpFor([[RELEASE_LABELS.patch], [RELEASE_LABELS.minor]]), 'minor');
  assert.equal(bumpFor([[RELEASE_LABELS.minor], ['bug', RELEASE_LABELS.major]]), 'major');
});

test('a pull request with no release label counts as minor', () => {
  assert.equal(bumpFor([[RELEASE_LABELS.patch], ['documentation']]), 'minor');
  assert.equal(bumpFor([[]]), 'minor');
});

test('commits with no pull request are a patch', () => {
  assert.equal(bumpFor([]), 'patch');
});

test('a malformed tag, bump or version stops the release', () => {
  assert.throws(() => nextVersion('guide-monolith', 'minor', '1.0.0'), /not vX\.Y\.Z/);
  assert.throws(() => nextVersion('v1.0.0', 'huge', '1.0.0'), /unknown bump/);
  assert.throws(() => nextVersion('', 'minor', 'one'), /not x\.y\.z/);
});

test('the workflow is asked once a day, reads version tags and pull request labels, and publishes generated notes', () => {
  const wf = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
  assert.match(wf, /workflow_dispatch:/);
  // A version covers a set amount of work, never a date. Asked daily, so a group that filled today goes out
  // tomorrow morning and two versions never land the same day.
  assert.match(wf, /cron: '0 7 \* \* \*'/, 'asked once a day');
  assert.doesNotMatch(wf, /cron: '[^']* 1'/, 'no weekly cadence: the dates said nothing about what a version held');
  // The highest version, not the nearest tag by ancestry: `git describe` picks a lower version whenever tags do not
  // land in version order, and a run that computes a version below the one already published is refused by npm.
  assert.match(wf, /git tag --list 'v\[0-9\]\*' --merged HEAD --sort=-v:refname \| head -1/);
  // In a command, not in the comment above it that explains why it is gone.
  assert.doesNotMatch(wf, /^(?!\s*#).*git describe/m, 'the nearest tag by ancestry is not the highest version');
  assert.match(wf, /gh pr view/);
  assert.match(wf, /release-version\.mjs/);
  assert.match(wf, /--generate-notes/);
  assert.doesNotMatch(wf, /git push origin main/);
});

test('a version goes out only once the group is full, and a fix that stops people never waits for it', () => {
  const wf = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
  // One question, and the number behind it lives in one place (lib/release-due.mjs).
  assert.match(wf, /verdict=\$\(node lib\/release-due\.mjs due\)/);
  assert.match(wf, /\[ "\$\{GITHUB_EVENT_NAME:-schedule\}" != workflow_dispatch \] && \[ "\$\{verdict%% \*\}" != yes \]/, 'the gate holds a scheduled run back and lets a hand-started one through');
  // The gate comes before anything is written, and writes nothing of its own.
  const gate = wf.indexOf('release-due.mjs due');
  assert.ok(gate > 0 && gate < wf.indexOf('git tag "$next"'), 'the gate is read before the tag is written');
});

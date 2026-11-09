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

test('the workflow runs once a week and can be started by hand, reads version tags and pull request labels, and publishes generated notes', () => {
  const wf = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
  assert.match(wf, /workflow_dispatch:/);
  assert.match(wf, /cron: '0 7 \* \* 1'/, 'a release every Monday: the week\'s record');
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

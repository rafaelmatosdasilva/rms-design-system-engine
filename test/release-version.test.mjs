// release-version - the next tag the weekly release workflow publishes, and how big the step is.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nextVersion, bumpFor, RELEASE_LABELS } from '../release-version.mjs';

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

test('the workflow runs weekly, reads version tags and pull request labels, and publishes generated notes', () => {
  const wf = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
  assert.match(wf, /schedule:/);
  assert.match(wf, /--match 'v\[0-9\]\*'/);
  assert.match(wf, /gh pr view/);
  assert.match(wf, /release-version\.mjs/);
  assert.match(wf, /--generate-notes/);
  assert.doesNotMatch(wf, /git push origin main/);
});

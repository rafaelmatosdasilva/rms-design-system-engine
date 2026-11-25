// A Dependabot pull request's description cut to Dependabot's own words (dependabot-body.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ownWords } from '../lib/dependabot-body.mjs';

// The shape of the bump of 25 November 2026, with a contributor credited in the quoted notes.
const BODY = `Bumps the react-tools group in /test/.react-tools with 2 updates: [@babel/core](https://example.com) and [@babel/preset-react](https://example.com).

Updates \`@babel/core\` from 7.29.13 to 8.1.3
<details>
<summary>Release notes</summary>
<p>Thanks to <a href="https://example.com/someone">a maintainer</a></p>
<details><summary>Nested</summary>more</details>
</details>
<details>
<summary>Commits</summary>
<ul><li>a commit by a maintainer</li></ul>
</details>
<br />

Updates \`@babel/preset-react\` from 7.29.7 to 8.0.1
<details>
<summary>Changelog</summary>
notes
</details>`;

test('the quoted notes, changelogs and commits go, and what is bumped to which version stays', () => {
  const out = ownWords(BODY);
  assert.doesNotMatch(out, /maintainer|<details>|Release notes|Commits|Changelog/);
  assert.match(out, /^Bumps the react-tools group/);
  assert.match(out, /Updates `@babel\/core` from 7\.29\.13 to 8\.1\.3/);
  assert.match(out, /Updates `@babel\/preset-react` from 7\.29\.7 to 8\.0\.1/);
  assert.equal(ownWords(out), out, 'trimming twice changes nothing');
  assert.equal(ownWords('Bumps x from 1.0.0 to 1.0.1.'), 'Bumps x from 1.0.0 to 1.0.1.');
});

test('the auto-merge workflow trims the description before it turns auto-merge on', () => {
  const wf = readFileSync(new URL('../.github/workflows/dependabot-auto-merge.yml', import.meta.url), 'utf8');
  assert.ok(wf.indexOf('lib/dependabot-body.mjs') > 0 && wf.indexOf('lib/dependabot-body.mjs') < wf.indexOf('gh pr merge'));
  assert.match(wf, /gh pr edit "\$PR" --repo "\$REPO" --body-file/);
  assert.match(wf, /persist-credentials: false/);
});

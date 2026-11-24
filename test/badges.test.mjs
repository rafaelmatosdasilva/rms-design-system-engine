// badges.mjs and badges.yml - the README's live badges are written by the runs that produce their numbers, and
// somebody is told when one stops being written.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BRANCH, SCORECARD, STALE_DAYS, TESTS, scorecardScore } from '../lib/badges.mjs';

const wf = readFileSync(new URL('../.github/workflows/badges.yml', import.meta.url), 'utf8');
const scorecardWf = readFileSync(new URL('../.github/workflows/scorecard.yml', import.meta.url), 'utf8');
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

const withFetch = async (answer, run) => {
  const real = globalThis.fetch;
  globalThis.fetch = async () => answer;
  try { return await run(); } finally { globalThis.fetch = real; }
};

test('the score is read from the API and said the one way the badge has always said it', async () => {
  const said = await withFetch({ ok: true, json: async () => ({ score: 7 }) },
    () => scorecardScore('owner/repo'));
  assert.equal(said, '7.0', 'a whole number still shows its decimal, so the badge never changes width for nothing');
  assert.equal(await withFetch({ ok: true, json: async () => ({ score: 7.84 }) },
    () => scorecardScore('owner/repo')), '7.8');
});

test('a score that cannot be read stops the run instead of drawing a badge that invents one', async () => {
  await assert.rejects(() => withFetch({ ok: false, status: 503 }, () => scorecardScore('owner/repo')), /503/);
  await assert.rejects(() => withFetch({ ok: true, json: async () => ({}) }, () => scorecardScore('owner/repo')),
    /no score/);
});

test('both badges live on one branch of their own, which holds nothing else', () => {
  assert.equal(BRANCH, 'badges');
  assert.equal(TESTS, 'tests.svg');
  assert.equal(SCORECARD, 'scorecard.svg');
});

test('the Scorecard badge is drawn when the score is published, and again daily', () => {
  // The score is published by this repository's own Scorecard run, so the badge follows that run rather than guessing.
  assert.match(wf, /workflow_run:\n {4}workflows: \[Scorecard\]/);
  assert.match(scorecardWf, /^name: Scorecard$/m, 'the name this waits on is the name that workflow has');
  assert.match(scorecardWf, /publish_results: true/, 'there is a published score for the badge to read');
  // Publishing is not instant, and a run that went red would otherwise be the end of it.
  assert.match(wf, /schedule:\n(?: *#.*\n)* *- cron: '\d+ \d+ \* \* \*'/);
  assert.match(wf, /workflow_dispatch:/);
  assert.match(wf, /run: node lib\/badges\.mjs scorecard/);
});

test('writing a badge is the only thing allowed to write, and the check only to open an issue', () => {
  assert.match(wf, /^permissions:\n {2}contents: read$/m, 'nothing is granted to the whole workflow');
  const scorecard = wf.slice(wf.indexOf('  scorecard:'), wf.indexOf('  fresh:'));
  const fresh = wf.slice(wf.indexOf('  fresh:'));
  assert.match(scorecard, /permissions:\n {6}contents: write/);
  assert.match(fresh, /permissions:\n {6}contents: read\n {6}issues: write/);
  assert.equal(fresh.includes('contents: write'), false, 'the check writes no badge');
  for (const job of [scorecard, fresh]) {
    assert.match(job, /uses: actions\/checkout@[0-9a-f]{40} #/, 'every action is pinned by digest');
    assert.match(job, /persist-credentials: false/);
  }
});

test('the check is asked even when the badge could not be written, because that is the case worth hearing about', () => {
  const fresh = wf.slice(wf.indexOf('  fresh:'));
  assert.match(fresh, /needs: scorecard\n(?: *#.*\n)* *if: always\(\)/);
  assert.match(fresh, /run: node lib\/badges\.mjs check/);
});

// A renderer that fails shows a broken image, which anybody can see. A writer that fails leaves the last badge
// sitting there, still a badge, quietly out of date - so the gap has to be asked after rather than waited for.
test('a badge may fall behind for a few days before it is worth an issue, not weeks', () => {
  assert.ok(STALE_DAYS >= 2 && STALE_DAYS <= 7, `${STALE_DAYS} days`);
});

test('the README reads both badges from the branch, and nothing in it is drawn by an outside renderer', () => {
  for (const file of [TESTS, SCORECARD]) {
    assert.ok(readme.includes(`/rms-design-system-engine/${BRANCH}/${file}`), `the README shows ${file}`);
  }
  // raw.githubusercontent.com is served as it is; every other host is fetched through GitHub's proxy, which is what
  // broke the badges in the first place. The host is read from the parsed address rather than looked for inside the
  // string: a host only has meaning where the URL says it is, and naming the one host allowed covers every outside
  // renderer at once, not whichever one happened to break.
  const images = [...readme.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(images.length > 0, 'the README\'s images are read');
  for (const src of images) {
    // A relative address resolves against github.com and fails here, as it should: it would be proxied too.
    assert.equal(new URL(src, 'https://github.com/').host, 'raw.githubusercontent.com',
      `${src} would be fetched through the proxy`);
  }
});

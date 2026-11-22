// The requests answered on GitHub and GitLab by the engine itself (request-issues.mjs, issues-github.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { tempDir } from './helpers.mjs';
import { requestIssue, trackerAnswers, requestPlan, requestIssueKey } from '../lib/request-issues.mjs';
import { keyIn, sendIssues } from '../lib/issues.mjs';
import { openIssues, githubSender, issuesProject } from '../lib/issues-github.mjs';
import { readAnswers, TRACKER_ANSWERS } from '../lib/requests.mjs';
import { plainGet } from '../lib/gitlab-source.mjs';

const rows = [
  { key: 'component|date picker', need: 'date picker', kind: 'component', asked: ['Orders'], status: 'new' },
  { key: 'icon|truck', need: 'truck', kind: 'icon', asked: ['Orders', 'Home'], status: 'decided', decision: 'system', by: 'QA' },
  { key: 'token|space 7', need: 'space 7', kind: 'token', asked: [], status: 'built' },
  { key: 'component|map', need: 'map', kind: 'component', asked: ['Home'], status: 'new' },
];
const own = (key, extra = {}) => ({ iid: 7, title: 'Request: x', body: `…\n${requestIssue({ key, need: 'x' }).body.split('\n').at(-1)}`, state: 'opened', url: 'https://example.com/7', ...extra });

test('a request opens one issue, carrying its key, what it is and who asked', () => {
  const i = requestIssue(rows[1]);
  assert.equal(i.title, 'Request: truck');
  assert.equal(keyIn(i.body), requestIssueKey('icon|truck'));
  assert.match(i.body, /Asked for by 2 prototypes: Orders · Home\./);
  assert.match(i.body, /Decided: brought into the system \(QA\)\./);
});

test('never twice: an issue a person opened for the same need is taken as the request\'s, and nothing is opened beside it', () => {
  const issues = [{ iid: 4, title: 'We need a Date Picker!', body: 'pls', state: 'opened', url: 'https://example.com/4' }];
  const { answers, adopted } = trackerAnswers(rows, issues);
  assert.deepEqual(answers['component|date picker'], { state: 'open', link: 'https://example.com/4' });
  assert.deepEqual(adopted, [{ key: 'component|date picker', iid: 4, title: 'We need a Date Picker!' }]);
  const plan = requestPlan(rows, issues);
  assert.deepEqual(plan.open.map((i) => i.title), ['Request: truck', 'Request: map'], 'only the open requests with no issue yet');
  assert.equal(plan.already, 1);
});

test('the issue\'s state is the answer: closed, declined as not planned, a duplicate', () => {
  const issues = [own('icon|truck', { state: 'closed', reason: 'completed' }), own('component|map', { iid: 8, state: 'closed', reason: 'not_planned' }), own('component|date picker', { iid: 9, state: 'closed', reason: 'duplicate' })];
  const { answers } = trackerAnswers(rows, issues);
  assert.equal(answers['icon|truck'].state, 'closed');
  assert.deepEqual(answers['component|map'], { state: 'declined', reason: 'declined in the team\'s tracker', link: 'https://example.com/7' });
  assert.equal(answers['component|date picker'].reason, 'a duplicate in the team\'s tracker');
  // GitLab says a decline by its label.
  assert.equal(trackerAnswers(rows, [own('component|map', { state: 'closed', labels: ["Won't fix"] })]).answers['component|map'].state, 'declined');
});

test('the engine\'s own issue is closed once its request is built, or gone with nobody deciding it', () => {
  const issues = [own('token|space 7', { iid: 3 }), own('component|gone', { iid: 5 }), own('icon|truck', { iid: 6 })];
  const plan = requestPlan(rows, issues);
  assert.deepEqual(plan.close.map((c) => c.iid), [3, 5]);
  assert.match(plan.close[0].note, /it is built/);
  assert.match(plan.close[1].note, /no prototype asks for it any more/);
});

test('what the engine read from the tracker is the style guide\'s answer too, the team\'s own file first', () => {
  const root = tempDir('req-answers-');
  mkdirSync(join(root, '.design-system-engine-out', 'requests'), { recursive: true });
  writeFileSync(join(root, TRACKER_ANSWERS), JSON.stringify({ answers: { a: { state: 'open', link: 'L1' }, b: { state: 'closed' } } }));
  writeFileSync(join(root, 'design-system-engine-requests.answers.json'), JSON.stringify({ answers: { b: { state: 'declined', reason: 'theirs' } } }));
  assert.deepEqual(readAnswers(root), { a: { state: 'open', link: 'L1' }, b: { state: 'declined', reason: 'theirs' } });
});

test('on GitHub: issues read without pull requests, opened and closed with the engine\'s note', async () => {
  const get = async (url) => ({ ok: true, json: async () => (/page=1/.test(url) ? [{ number: 1, title: 'A', body: 'b', state: 'closed', state_reason: 'not_planned', html_url: 'h1' }, { number: 2, title: 'PR', pull_request: {}, state: 'open' }] : []) });
  assert.deepEqual(await openIssues('https://api.github.com/repos/acme/ds', {}, { get, state: 'all' }), [{ iid: 1, title: 'A', body: 'b', state: 'closed', reason: 'not_planned', url: 'h1' }]);
  const calls = [];
  const send = async (url, o) => { calls.push([o.method, url.replace('https://api.github.com/repos/acme/ds', ''), o.body]); return { ok: true, status: 200 }; };
  const sent = await sendIssues({ open: [{ title: 'Request: map', body: 'x' }], close: [{ iid: 3, title: 't', note: 'Closed: built' }] }, githubSender('https://api.github.com/repos/acme/ds', {}, { send }));
  assert.deepEqual(sent, { opened: 1, closed: 1, failed: [] });
  assert.deepEqual(calls, [['POST', '/issues', { title: 'Request: map', body: 'x' }], ['POST', '/issues/3/comments', { body: 'Closed: built' }], ['PATCH', '/issues/3', { state: 'closed', state_reason: 'completed' }]]);
});

test('a GitHub token goes only to GitHub, or to a host the person named', () => {
  assert.match(issuesProject('https://github.com/acme/ds', { ROOT: tempDir('gh-'), env: {} }).why, /no GitHub token/);
  const p = issuesProject('https://github.com/acme/ds', { ROOT: tempDir('gh-'), env: { GITHUB_TOKEN: 't' } });
  assert.equal(p.base, 'https://api.github.com/repos/acme/ds');
  assert.equal(p.headers.Authorization, 'Bearer t');
  assert.match(issuesProject('https://git.example.com/acme/ds', { ROOT: tempDir('gh-'), env: { GITHUB_TOKEN: 't' } }).why, /not a GitHub link/);
});

test('a redirect to another host never carries the token there', async () => {
  const seen = [];
  const other = createServer((req, res) => { seen.push(req.headers.authorization ?? null); res.end('[]'); });
  await new Promise((r) => other.listen(0, '127.0.0.1', r));
  const first = createServer((req, res) => { res.writeHead(302, { location: `http://127.0.0.1:${other.address().port}/x` }); res.end(); });
  await new Promise((r) => first.listen(0, '127.0.0.1', r));
  try {
    await plainGet(`http://127.0.0.1:${first.address().port}/`, { headers: { Authorization: 'Bearer secret' } });
    assert.deepEqual(seen, [null]);
  } finally { other.close(); first.close(); }
});

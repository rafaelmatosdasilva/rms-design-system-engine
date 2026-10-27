// issues-gitlab.mjs - the plan carried out on GitLab, and nowhere else. Every test here runs against a fake host:
// the engine never needs a real project to know what it would send.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openIssues, gitlabSender, issuesProject } from '../issues-gitlab.mjs';
import { issuesFor, issuePlan, sendIssues, keyLine } from '../issues.mjs';

const answer = (json, ok = true, status = 200) => ({ ok, status, json: async () => json });

test('every open issue is read, page after page, and nothing else is', async () => {
  const asked = [];
  const page = (n) => Array.from({ length: n }, (_, i) => ({ iid: i + 1, title: `t${i}`, description: 'd', state: 'opened' }));
  const get = async (url) => { asked.push(url); return answer(/[?&]page=1(&|$)/.test(url) ? page(100) : page(3)); };
  const list = await openIssues('https://gl/api/v4/projects/9', { 'PRIVATE-TOKEN': 'x' }, { get });
  assert.equal(list.length, 103);
  assert.equal(asked.length, 2, 'a short page is the last page');
  assert.match(asked[0], /state=opened/);
  assert.deepEqual(list[0], { iid: 1, title: 't0', body: 'd', state: 'opened' });
  // A host that refuses gives nothing rather than throwing: the plan is still written, and says it was not sent.
  assert.deepEqual(await openIssues('https://gl/api/v4/projects/9', {}, { get: async () => answer(null, false, 403) }), []);
});

test('the sender opens, comments why, then closes; a refusal is said with the status', async () => {
  const calls = [];
  const send = async (url, opts) => { calls.push(`${opts.method} ${url.replace('https://gl/api/v4/projects/9', '')}`); return answer({}, true); };
  const want = issuesFor([{ check: 'Structure', evidence: 'chip height: 36 vs 32', component: 'chip', difference: true }]);
  const plan = issuePlan(want, [{ iid: 4, title: 'gone', body: keyLine('Structure :: gone'), state: 'opened' }]);
  const out = await sendIssues(plan, gitlabSender('https://gl/api/v4/projects/9', { 'PRIVATE-TOKEN': 'x' }, { send }));
  assert.deepEqual(out, { opened: 1, closed: 1, failed: [] });
  assert.deepEqual(calls, ['POST /issues', 'POST /issues/4/notes', 'PUT /issues/4?state_event=close']);
  // What GitLab refuses is said with its status, and never with the token.
  const refused = await sendIssues(plan, gitlabSender('https://gl/api/v4/projects/9', { 'PRIVATE-TOKEN': 'secret' }, { send: async () => answer(null, false, 403) }));
  assert.equal(refused.opened, 0);
  assert.match(refused.failed[0].why, /GitLab answered 403/);
  assert.equal(JSON.stringify(refused).includes('secret'), false);
});

test('with no token nothing is sent, and the reason never asks for one in the chat', async () => {
  const r = await issuesProject('https://gitlab.example.com/acme/ux-issues', { env: {}, ROOT: '/nowhere' });
  assert.match(r.why, /no GitLab token here, so nothing was sent/);
  assert.match(r.why, /never in the chat/);
  assert.equal(r.base, undefined);
  // A link that is not a GitLab project says so rather than guessing.
  assert.match((await issuesProject('not a link', { env: {} })).why, /not a GitLab link/);
});

// The privacy check opens a pull request once its words are read (--pr): by gh pr create, and where GitHub's GraphQL is
// refused (a session in the cloud), by GitHub's REST route, so the one documented way to open one works in both places.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPullRequest } from '../.githooks/private-check.mjs';

// GitHub stood in for: each call recorded, gh pr create answering as the case says.
const github = ({ graphql = true, rest = true } = {}) => {
  const calls = [];
  const run = (cmd, args) => {
    calls.push([cmd, ...args]);
    if (cmd === 'git' && args[0] === 'remote') return 'git@github.com:acme/acme-ui.git\n';
    if (cmd === 'git' && args[0] === 'rev-parse') return 'feat/pill\n';
    if (args[0] === 'pr' && args[1] === 'create') { if (graphql) return 'https://github.com/acme/acme-ui/pull/7\n'; const e = new Error('exit 1'); e.stderr = 'GraphQL: Resource not accessible by integration (createPullRequest)\n'; throw e; }
    if (args[0] === 'api' && args.includes('repos/acme/acme-ui/pulls')) { if (rest) return '{"url":"https://github.com/acme/acme-ui/pull/8","number":8}'; const e = new Error('exit 1'); e.stderr = 'HTTP 403\n'; throw e; }
    return '';
  };
  return { run, calls };
};
const quiet = () => { const said = []; return { log: (l) => said.push(l), said }; };

test('where gh pr create answers, it opens the pull request, and nothing else is asked', () => {
  const g = github(), q = quiet();
  const r = openPullRequest({ title: 'A pill', bodyFile: '/tmp/body.md', rest: ['--base', 'main'], run: g.run, log: q.log });
  assert.deepEqual([r.ok, r.route, r.url], [true, 'gh', 'https://github.com/acme/acme-ui/pull/7']);
  assert.equal(g.calls.length, 1);
  assert.deepEqual(q.said, []);
});

test("where GitHub's GraphQL is refused, the same pull request opens through the REST route, its base, draft and labels kept", () => {
  const g = github({ graphql: false }), q = quiet();
  const r = openPullRequest({ title: 'A pill', bodyFile: '/tmp/body.md', rest: ['--base', 'next', '--draft', '--label', 'release: patch,after: nothing', '--reviewer', 'qa'], run: g.run, log: q.log });
  assert.deepEqual([r.ok, r.route, r.url, r.number], [true, 'rest', 'https://github.com/acme/acme-ui/pull/8', 8]);
  const post = g.calls.find((c) => c.includes('repos/acme/acme-ui/pulls'));
  assert.ok(post.includes('title=A pill') && post.includes('head=feat/pill') && post.includes('base=next') && post.includes('body=@/tmp/body.md'), post.join(' '));
  assert.ok(post.includes('draft=true'), 'a draft stays a draft');
  const labels = g.calls.find((c) => c.includes('repos/acme/acme-ui/issues/8/labels'));
  assert.deepEqual(labels.filter((x) => x.startsWith('labels[]=')), ['labels[]=release: patch', 'labels[]=after: nothing']);
  const said = q.said.join('\n');
  assert.match(said, /gh pr create could not open it \(GraphQL: Resource not accessible by integration/);
  assert.match(said, /Not carried over by the REST route: --reviewer/, 'what the REST route does not take is said, never dropped');
  assert.match(said, /auto-merge has no REST route: once its checks pass, merge it with gh api -X PUT repos\/acme\/acme-ui\/pulls\/8\/merge -f merge_method=squash/);
});

test('when both routes refuse, it says so and reports nothing opened', () => {
  const g = github({ graphql: false, rest: false }), q = quiet();
  const r = openPullRequest({ title: 'A pill', bodyFile: '/tmp/body.md', run: g.run, log: q.log });
  assert.equal(r.ok, false);
  assert.match(q.said.join('\n'), /Nothing was opened: GitHub's REST route refused it too/);
});

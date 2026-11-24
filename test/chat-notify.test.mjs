// One short message to the team's chat when a run finishes. Nothing here reaches the network: the post is given in,
// so what is tested is what would be sent, where, and when nothing is.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENV, FORMAT_ENV, bodyFor, canPostTo, runMessage, jobUrl, notify } from '../lib/chat-notify.mjs';

const HOOK = 'https://chat.example.com/hooks/abc';
const sent = () => { const calls = []; return { calls, post: async (url, opts) => { calls.push({ url, body: JSON.parse(opts.body), headers: opts.headers }); return { ok: true }; } }; };

test('the run in one line: what failed, what is open, and where to read the whole of it', () => {
  assert.equal(runMessage({ project: 'Acme', failed: 3, checks: 25, differences: 11, findings: 36, report: 'out/differences.md' }),
    'Acme: 3 of 25 checks fail · 11 differences open · 36 findings · out/differences.md');
  assert.equal(runMessage({ project: 'Acme', failed: 0, checks: 25 }), 'Acme: all 25 checks pass');
  assert.equal(runMessage({ failed: 0, checks: 1, differences: 1 }), 'all 1 checks pass · 1 difference open', 'one of a thing reads as one');
  assert.equal(runMessage({}), 'the run finished');
});

// The engine keeps no list of which service is at which address: a list of vendors' hostnames ages, and a team whose
// chat is its own would be refused by one for no reason. The team names the field its own service reads.
test('one field of JSON, { text } unless the team said its service reads another', () => {
  assert.deepEqual(bodyFor('hi', undefined), { text: 'hi' });
  assert.deepEqual(bodyFor('hi', 'content'), { content: 'hi' });
  assert.deepEqual(bodyFor('hi', ' CONTENT '), { content: 'hi' }, 'said any way round');
  assert.deepEqual(bodyFor('hi', 'anything else'), { text: 'hi' }, 'and no field the engine made up');
});

test('an address that is not https is refused, and the run says why', async () => {
  for (const url of ['http://chat.example.com/hooks/abc', 'ftp://chat.example.com/x', '.design-system-engine-out/post.json', 'not a url']) {
    assert.equal(canPostTo(url), false, url);
    const { calls, post } = sent();
    const r = await notify('a run finished', { url, post });
    assert.equal(r.sent, false);
    assert.equal(calls.length, 0, 'nothing of the run is sent there');
    assert.match(r.why, /not an https address/);
  }
  assert.equal(canPostTo(HOOK), true);
});

test('with no address set, the flag says what to set and nothing is sent', async () => {
  const { calls, post } = sent();
  const r = await notify('a run finished', { url: null, post });
  assert.equal(r.sent, false);
  assert.equal(calls.length, 0);
  assert.match(r.why, new RegExp(`set ${ENV}`));
});

test('what is posted: the line, as JSON, to the address given', async () => {
  const { calls, post } = sent();
  const r = await notify('Acme: 3 of 25 checks fail', { url: HOOK, post });
  assert.equal(r.sent, true);
  assert.deepEqual(calls, [{ url: HOOK, body: { text: 'Acme: 3 of 25 checks fail' }, headers: { 'content-type': 'application/json' } }]);

  const other = sent();
  await notify('x', { url: HOOK, format: 'content', post: other.post });
  assert.deepEqual(other.calls[0].body, { content: 'x' }, `${FORMAT_ENV} decides the field`);
});

test('a service that refuses is said as what it answered, and one that cannot be reached as that', async () => {
  const refused = await notify('x', { url: HOOK, post: async () => ({ ok: false, status: 404, statusText: 'Not Found' }) });
  assert.deepEqual(refused, { sent: false, why: 'the chat service answered 404 Not Found' });
  const down = await notify('x', { url: HOOK, post: async () => { throw new Error('getaddrinfo ENOTFOUND chat.example.com'); } });
  assert.equal(down.sent, false);
  assert.match(down.why, /could not be reached: getaddrinfo ENOTFOUND/);
});

test('the page of the run that is posting, as each host gives it', () => {
  assert.equal(jobUrl({ CI_JOB_URL: 'https://git.example.com/acme/ds/-/jobs/42' }), 'https://git.example.com/acme/ds/-/jobs/42');
  assert.equal(jobUrl({ GITHUB_SERVER_URL: 'https://github.com', GITHUB_REPOSITORY: 'acme/ds', GITHUB_RUN_ID: '7' }), 'https://github.com/acme/ds/actions/runs/7');
  assert.equal(jobUrl({ GITHUB_SERVER_URL: 'https://github.com' }), null, 'half of it is no link');
  assert.equal(jobUrl({}), null);
});

test('what changed since the run before: what got worse first, then what was fixed, from the parity history', async () => {
  const { sinceLast, runMessage } = await import('../lib/chat-notify.mjs');
  const run = (gates) => ({ gates: Object.entries(gates).map(([label, pass]) => ({ label, pass })) });
  const hist = [run({ 'Token values': true, Icons: false, Shadows: true }), run({ 'Token values': false, Icons: true, Shadows: true, 'A new check': false })];
  // A check the run before had no word for is neither worse nor fixed: it is new.
  assert.deepEqual(sinceLast(hist), { worse: ['Token values'], better: ['Icons'] });
  assert.equal(runMessage({ project: 'Acme', failed: 2, checks: 26, since: sinceLast(hist) }), 'Acme: 2 of 26 checks fail · worse since the last run: Token values · fixed since the last run: Icons');
  assert.equal(runMessage({ failed: 1, checks: 3, since: sinceLast([run({ a: false }), run({ a: false })]) }), '1 of 3 checks fail · no check changed since the last run', 'an old failure is said as old');
  // A check the Figma plan held back moved for no reason in the code: never said as worse.
  assert.deepEqual(sinceLast([{ gates: [{ label: 'Frame', pass: true }] }, { gates: [{ label: 'Frame', pass: false, planLimited: true }] }]), { worse: [], better: [] });
  assert.equal(sinceLast([run({ a: true })]), null, 'the first run has nothing to compare with');
  assert.equal(runMessage({ failed: 0, checks: 3, since: null }), 'all 3 checks pass');
});

test('a style guide build in one line: built or not, what it holds, its page check, and whether it was published', async () => {
  const { buildMessage } = await import('../lib/chat-notify.mjs');
  assert.equal(buildMessage({ project: 'Acme', components: '12 components agreed', published: true, url: 'https://ci.example.com/1' }), 'Acme: style guide built · 12 components agreed · published to the page the team opens · https://ci.example.com/1');
  assert.equal(buildMessage({ components: '12 components agreed', published: false }), 'style guide built · 12 components agreed · not published: the team\'s page is behind it');
  assert.equal(buildMessage({ components: '12 components agreed', problems: 2, published: false }), 'style guide built · 12 components agreed · its page check found 2 problems, so it was not published');
  assert.equal(buildMessage({ components: '12 components agreed' }), 'style guide built · 12 components agreed', 'already the page the team opens: nothing to add');
  assert.equal(buildMessage({ built: false, why: 'its script stopped' }), 'the style guide was not built: its script stopped');
});

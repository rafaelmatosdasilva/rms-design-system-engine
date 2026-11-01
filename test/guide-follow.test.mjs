// A change the engine made in the intent layer, followed to the style guide the team opens: the guide built again from
// the layer as it is now, checked for the pages the change was about, and published where the team's guide lives (its
// store, else the system's own publish job started on GitHub or GitLab), each step said.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from './helpers.mjs';
import { guideFollow, publishTarget, startJob, guideLayer, GUIDE_OUT } from '../lib/guide-follow.mjs';
import { committedThisRun } from '../lib/intent-changes.mjs';

function project(remote, files = {}) {
  const d = tempDir('follow-');
  mkdirSync(join(d, '.git'), { recursive: true });
  if (remote) writeFileSync(join(d, '.git', 'config'), `[remote "origin"]\n\turl = ${remote}\n`);
  writeFileSync(join(d, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  for (const [f, t] of Object.entries(files)) { mkdirSync(join(d, f, '..'), { recursive: true }); writeFileSync(join(d, f), t); }
  return d;
}
// The page a build writes: its data names the layer's commit and its pages.
const pageWith = (dir, sha, pages) => {
  const page = join(dir, GUIDE_OUT);
  mkdirSync(join(page, '..'), { recursive: true });
  writeFileSync(page, `<!doctype html><html><body><script type="application/json" id="sg-data">${JSON.stringify({ intentLayer: { source: { sha }, pages: pages.map((name) => ({ name })) } })}</script></body></html>`);
};
const builder = (sha, pages, { status = 0 } = {}) => (dir) => { if (!status) pageWith(dir, sha, pages); return { status, stdout: `🖼  Style guide → ${GUIDE_OUT}\n🧭 Intent layer: gitlab.acme.io/docs @ main ${sha.slice(0, 8)} - 12 pages, read\n   Changed since the last read: 1 page (Button), checked again in this build\nsomething else\n` }; };
const sender = (status = 204, json = {}) => { const calls = []; return { calls, send: async (url, o) => { calls.push({ url, ...o }); return { ok: status < 300, status, json: async () => json }; } }; };

test('where the team\'s guide is published: its store first, else the system\'s own publish job, else nowhere yet', () => {
  assert.equal(publishTarget(project('https://github.com/acme/ds.git'), {}, { stores: { styleguide: { write: { gitlab: 'x' } } } }).kind, 'store');
  const gh = publishTarget(project('https://github.com/acme/ds.git', { '.github/workflows/style-guide.yml': 'name: style guide\n' }), {}, { stores: {} });
  assert.deepEqual([gh.kind, gh.path, gh.branch, gh.job], ['github', 'acme/ds', 'main', '.github/workflows/style-guide.yml']);
  const gl = publishTarget(project('git@gitlab.acme.io:design/ds.git', { '.gitlab/style-guide.gitlab-ci.yml': 'pages:\n  script: []\n' }), {}, { stores: {} });
  assert.deepEqual([gl.kind, gl.origin, gl.path], ['gitlab', 'https://gitlab.acme.io', 'design/ds']);
  assert.equal(publishTarget(project('git@gitlab.acme.io:design/ds.git', { '.gitlab-ci.yml': 'test:\n  script: []\n' }), {}, { stores: {} }).kind, null, 'a pipeline with no pages job publishes nothing');
  assert.equal(publishTarget(project(null), {}, { stores: {} }).kind, null);
});

test('the system\'s publish job started with the person\'s token, on GitHub and on GitLab; without one, the link to start it by hand', async () => {
  const gh = { kind: 'github', path: 'acme/ds', branch: 'main', job: '.github/workflows/style-guide.yml' };
  const s = sender(204);
  const r = await startJob(gh, { env: { GITHUB_TOKEN: 'gh0' }, send: s.send });
  assert.equal(r.ok, true);
  assert.equal(s.calls[0].url, 'https://api.github.com/repos/acme/ds/actions/workflows/style-guide.yml/dispatches');
  assert.deepEqual([s.calls[0].method, s.calls[0].headers.Authorization, s.calls[0].body], ['POST', 'Bearer gh0', { ref: 'main' }]);
  assert.match(r.line, /^🚀 The style guide job started on GitHub \(main\)/);
  assert.match((await startJob(gh, { env: {}, send: s.send })).line, /no GITHUB_TOKEN here\. Start it by hand \(Run workflow\): https:\/\/github\.com\/acme\/ds\/actions\/workflows\/style-guide\.yml/);
  assert.match((await startJob(gh, { env: { GITHUB_TOKEN: 'gh0' }, send: sender(403).send })).line, /GitHub answered 403: the token needs to run workflows in acme\/ds/);
  const gl = { kind: 'gitlab', origin: 'https://gitlab.acme.io', path: 'design/ds', branch: 'trunk' };
  const g = sender(201, { web_url: 'https://gitlab.acme.io/design/ds/-/pipelines/7' });
  const t = await startJob(gl, { env: { GITLAB_WRITE_TOKEN: 'glw' }, send: g.send });
  assert.equal(g.calls[0].url, 'https://gitlab.acme.io/api/v4/projects/design%2Fds/pipeline?ref=trunk');
  assert.equal(g.calls[0].headers['PRIVATE-TOKEN'], 'glw');
  assert.match(t.line, /started on GitLab \(trunk\).*pipelines\/7$/);
  assert.match((await startJob(gl, { env: {}, send: g.send })).line, /no GITLAB_WRITE_TOKEN here\. Start a pipeline on trunk by hand: https:\/\/gitlab\.acme\.io\/design\/ds\/-\/pipelines\/new/);
});

test('after a change: built again, checked for the pages it was about, and published by the system\'s job', async () => {
  const dir = project('https://github.com/acme/ds.git', { '.github/workflows/style-guide.yml': 'name: style guide\n' });
  const s = sender(204);
  const lines = await guideFollow(dir, {}, { pages: ['Button', 'Saving'], sha: 'abc1234def5678', stores: {}, build: builder('abc1234def5678', ['Button', 'Card']), env: { GITHUB_TOKEN: 'gh0' }, send: s.send });
  const text = lines.join('\n');
  assert.match(text, /^🔁 Building the style guide again with the change\.\.\./);
  assert.match(text, /🧭 Intent layer: gitlab\.acme\.io\/docs @ main abc1234d/);
  assert.match(text, /Changed since the last read: 1 page \(Button\)/);
  assert.doesNotMatch(text, /something else/, 'only the build\'s own lines about the guide and the layer');
  assert.match(text, /✅ The style guide is built from the layer at abc1234d, with the change on Button; not found as a page of the layer: Saving\./);
  assert.match(text, /🚀 The style guide job started on GitHub/);
  assert.equal(s.calls.length, 1);
  assert.deepEqual(guideLayer(join(dir, GUIDE_OUT)), { sha: 'abc1234def5678', pages: ['Button', 'Card'] });
});

test('to the team\'s store when it has one; a build that failed publishes nothing; a page read before the commit is said', async () => {
  const dir = project('https://github.com/acme/ds.git', { '.github/workflows/style-guide.yml': 'name: style guide\n' });
  const sent = [];
  const store = await guideFollow(dir, {}, { pages: ['Button'], sha: 'abc1234def5678', stores: { styleguide: { write: { gitlab: 'https://gitlab.acme.io/design/guide' } } }, build: builder('abc1234def5678', ['Button']), publish: async (page) => { sent.push(page); return { ok: true, line: '📤 Style guide sent to design/guide.' }; }, send: sender().send });
  assert.deepEqual(sent, [join(dir, GUIDE_OUT)]);
  assert.match(store.join('\n'), /📤 Style guide sent to design\/guide\./);
  const s = sender(204);
  const failed = await guideFollow(project('https://github.com/acme/ds.git', { '.github/workflows/style-guide.yml': 'x' }), {}, { pages: ['Button'], sha: 'abc', stores: {}, build: builder('abc', [], { status: 1 }), env: { GITHUB_TOKEN: 'gh0' }, send: s.send });
  assert.match(failed.join('\n'), /❌ The style guide was not built again \(exit 1\): the change is in the layer, the published page does not show it yet/);
  assert.equal(s.calls.length, 0, 'nothing published');
  const behind = await guideFollow(project(null), {}, { pages: ['Button'], sha: 'fff9999aaa0000', stores: {}, build: builder('abc1234def5678', ['Button']) });
  assert.match(behind.join('\n'), /⚠️ {2}The style guide read the layer at abc1234d, not at the commit just made \(fff9999a\)/);
  assert.match(behind.join('\n'), /No published copy is set up for the team: rms-design-system-engine --publish-styleguide writes the job/);
  // A style guide build that made the change has just built the page: published without building it again.
  const again = sender(204), noBuild = () => { throw new Error('built again'); };
  const dir2 = project('https://github.com/acme/ds.git', { '.github/workflows/style-guide.yml': 'x' });
  pageWith(dir2, 'abc1234def5678', ['Button']);
  const quick = await guideFollow(dir2, {}, { sha: 'abc1234def5678', stores: {}, rebuild: false, build: noBuild, env: { GITHUB_TOKEN: 'gh0' }, send: again.send });
  assert.doesNotMatch(quick.join('\n'), /Building the style guide again/);
  assert.equal(again.calls.length, 1);
});

test('nothing committed to the layer in this run: nothing to follow', () => {
  assert.deepEqual(committedThisRun(), []);
});

test('a layer in a folder of the project: the guide here is built again, and the published one waits for the push that carries the change', async () => {
  const s = sender(204);
  const dir = project('https://github.com/acme/ds.git', { '.github/workflows/style-guide.yml': 'x' });
  const lines = await guideFollow(dir, {}, { pages: ['Button'], sha: null, local: true, stores: {}, build: builder('abc1234def5678', ['Button']), env: { GITHUB_TOKEN: 'gh0' }, send: s.send });
  assert.match(lines.join('\n'), /written in the project's folder, not committed: the style guide here shows it, and the published one follows once it is committed and pushed/);
  assert.equal(s.calls.length, 0, 'the job is not started: it would build without the change');
});

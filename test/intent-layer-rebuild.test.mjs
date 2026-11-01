// A change to the intent layer reaches the published style guide on its own. A layer kept in another repository starts
// the style guide's job from a small job of its own (repository_dispatch on GitHub, a pipeline trigger on GitLab), and the
// job also runs every hour, stopping in seconds when nothing it is built from moved (--ci-changed, which now asks GitHub
// too). A job written before, which builds only on a push here, is said to miss the layer's changes. Each build names
// the layer pages changed since the last read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { makeFixture, tempDir } from './helpers.mjs';
import { sourcesOf, sourcesNow, changes } from '../ci-changed.mjs';
import { githubJob, gitlabJob, layerJob, writePublishJob, remoteOf, LAYER_EVENT } from '../publish-job.mjs';
import { syncIntentLayer, describeSync, readIntentLayer } from '../intent-layer.mjs';

const LAYER = 'https://github.com/acme/guidelines';
const PAGES = {
  'docs/components/button-main.md': '---\ntitle: Button Main\n---\n\nThe next step the person is expected to take.\n\n## When to use\n\n- To submit a form.\n',
  'docs/patterns/saving.md': '# Saving\n\nSave a long form as a draft.\n\n## Rules\n\n- Say when it was saved.\n',
};

// GitHub as the layer's reader asks it: the branch's commit, its tree, each file, and what changed between two commits.
function fakeGithub({ sha = 'abc1234def5678', changed = ['docs/patterns/saving.md'] } = {}) {
  const calls = [];
  const fetchImpl = async (url, o = {}) => {
    calls.push(url);
    const json = (j) => ({ ok: true, status: 200, json: async () => j });
    const u = new URL(url);
    if (u.host === 'raw.githubusercontent.com') {
      const path = decodeURIComponent(u.pathname.split('/').slice(4).join('/'));
      const b = Buffer.from(PAGES[path] ?? '');
      return PAGES[path] == null ? { ok: false, status: 404 } : { ok: true, status: 200, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
    }
    if (/\/git\/trees\//.test(u.pathname)) return json({ tree: Object.keys(PAGES).map((path) => ({ path, type: 'blob', size: 10 })) });
    if (/\/compare\//.test(u.pathname)) return json({ files: changed.map((filename) => ({ filename, status: 'modified' })) });
    if (/\/commits\/[^/]+$/.test(u.pathname)) return json({ sha, commit: { committer: { date: '2026-11-01T10:00:00Z' } } });
    if (/\/commits$/.test(u.pathname)) return json([{ commit: { committer: { date: '2026-10-15T08:30:00Z' } } }]);
    return json({ default_branch: 'main' });
  };
  return { fetchImpl, calls };
}

test('--ci-changed asks GitHub for an intent layer kept there, as the build reads it, and a new commit there is a change', async () => {
  for (const cfg of [{ intentLayer: `${LAYER}/tree/main/docs` }, { intentLayer: { github: LAYER } }, { stores: { intentLayer: { read: { github: LAYER } } } }]) {
    const layer = sourcesOf('/tmp', cfg).find((s) => s.what === 'intentLayer');
    assert.equal(layer?.layer?.host, 'github', JSON.stringify(cfg));
  }
  const sources = sourcesOf('/tmp', { intentLayer: LAYER });
  const now = await sourcesNow(sources, { env: {}, fetchImpl: fakeGithub({ sha: 'fff9999aaa0000' }).fetchImpl });
  assert.equal(now.intentLayer, 'fff9999aaa0000');
  assert.deepEqual(changes(now, { intentLayer: 'abc1234def5678' }).map((c) => c.what), ['intentLayer'], 'a new commit in the layer: build');
  assert.deepEqual(changes(now, { intentLayer: 'fff9999aaa0000' }), [], 'the same commit: nothing to build');
  // A layer in the system's own folder is the code itself: a push here builds it already.
  assert.equal(sourcesOf('/tmp', { intentLayer: 'docs/guidelines' }).some((s) => s.what === 'intentLayer'), false);
});

test('the GitHub job builds on a push, on the layer\'s event and every hour, and an hour with nothing new builds nothing', () => {
  const gh = githubJob({ out: 'apps/sg/index.html', products: [] });
  for (const want of ['repository_dispatch:', `types: [${LAYER_EVENT}]`, "cron: '41 * * * *'", 'node ../engine/audit.mjs --ci-changed;', 'if [ "$code" = 3 ]; then echo "build=false"', 'node ../engine/audit.mjs --ci-changed --record', 'actions/cache/restore@v4', 'actions/cache/save@v4', '.design-system-engine-out/ci-last-build.json', "if: needs.build.outputs.build == 'true'", 'INTENT_LAYER_TOKEN']) assert.ok(gh.includes(want), want);
  assert.ok(gh.indexOf('--ci-changed;') < gh.indexOf('--styleguide --no-a11y-bake'), 'the check comes first');
  assert.ok(gh.indexOf('--styleguide-check') < gh.indexOf('--ci-changed --record'), 'only a build that passed is recorded');
  assert.match(gh, /if \[ "\$GITHUB_EVENT_NAME" != schedule \]; then echo "build=true"/, 'a push, the layer\'s event or a run by hand always builds');
  const gl = gitlabJob({ out: 'public/index.html', products: [] });
  for (const want of ['if [ "$CI_PIPELINE_SOURCE" = schedule ]; then node ../engine/audit.mjs --ci-changed; fi', 'exit_codes: [3]', 'key: style-guide-last-build', '.design-system-engine-out/ci-last-build.json', 'node ../engine/audit.mjs --ci-changed --record']) assert.ok(gl.includes(want), want);
  assert.ok(gl.indexOf('--ci-changed; fi') < gl.indexOf('apt-get install'), 'a run with nothing new stops before installing the browser');
});

test('the layer\'s own job, for each host it and the system are on; none for a layer in the system\'s own repository', () => {
  const sysGh = { host: 'github', origin: 'https://github.com', path: 'acme/ds', branch: 'main' };
  const sysGl = { host: 'gitlab', origin: 'https://gitlab.acme.io', path: 'design/ds', branch: 'trunk' };
  const a = layerJob({ host: 'github', url: LAYER }, sysGh);
  assert.equal(a.file, '.github/workflows/style-guide-notify.yml');
  assert.match(a.text, /https:\/\/api\.github\.com\/repos\/acme\/ds\/dispatches/);
  assert.match(a.text, new RegExp(`"event_type":"${LAYER_EVENT}"`));
  assert.match(a.text, /secrets\.STYLE_GUIDE_TOKEN/);
  const b = layerJob({ host: 'gitlab', url: 'https://gitlab.acme.io/docs/guidelines' }, sysGl);
  assert.match(b.text, /https:\/\/gitlab\.acme\.io\/api\/v4\/projects\/design%2Fds\/trigger\/pipeline/);
  assert.match(b.text, /-F "ref=trunk"/);
  assert.match(b.needs[0], /STYLE_GUIDE_TRIGGER_TOKEN CI\/CD variable/);
  assert.match(layerJob({ host: 'github', url: LAYER }, sysGl).text, /trigger\/pipeline/);
  assert.match(layerJob({ host: 'gitlab', url: 'https://gitlab.acme.io/docs/guidelines' }, sysGh).text, /dispatches/);
  assert.equal(layerJob({ host: 'folder', url: 'docs' }, sysGh), null);
  assert.equal(layerJob({ host: 'github', url: LAYER }, null), null);
});

function project(remote, files = {}) {
  const d = tempDir('layer-job-');
  mkdirSync(join(d, '.git'), { recursive: true });
  writeFileSync(join(d, '.git', 'config'), `[remote "origin"]\n\turl = ${remote}\n`);
  writeFileSync(join(d, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  for (const [f, t] of Object.entries(files)) { mkdirSync(join(d, f, '..'), { recursive: true }); writeFileSync(join(d, f), typeof t === 'string' ? t : JSON.stringify(t)); }
  return d;
}

test('--publish-styleguide writes the layer\'s job to the engine\'s folder and says what to set; a job of before is said to miss the layer', () => {
  assert.deepEqual(remoteOf(project('git@gitlab.acme.io:design/ds.git')), { host: 'gitlab', origin: 'https://gitlab.acme.io', path: 'design/ds', branch: 'main' });
  assert.deepEqual(remoteOf(project('https://github.com/acme/ds.git')), { host: 'github', origin: 'https://github.com', path: 'acme/ds', branch: 'main' });
  const dir = project('https://github.com/acme/ds.git');
  const cfg = { intentLayer: LAYER };
  const r = writePublishJob(dir, cfg);
  assert.equal(r.wrote, true);
  assert.match(r.lines[0], /on every push to the default branch, when the intent layer's repository says it changed, and every hour/);
  assert.match(r.lines.join('\n'), /The intent layer lives in https:\/\/github\.com\/acme\/guidelines: so a change there is published at once, add the job in \.design-system-engine-out\/intent-layer-job\.yml to that repository \(\.github\/workflows\/style-guide-notify\.yml\), with a STYLE_GUIDE_TOKEN secret/);
  assert.match(readFileSync(join(dir, '.design-system-engine-out', 'intent-layer-job.yml'), 'utf8'), /repos\/acme\/ds\/dispatches/);
  // A job written before: on a push here only.
  const old = project('https://github.com/acme/ds.git', { '.github/workflows/style-guide.yml': 'name: style guide\non:\n  push:\n    branches: [main]\n' });
  const o = writePublishJob(old, cfg);
  assert.equal(o.wrote, false);
  assert.match(o.lines.join('\n'), /It builds only on a push to this repository, so a change to the intent layer \(https:\/\/github\.com\/acme\/guidelines\) is not on the page until something else is pushed here\./);
  assert.equal(readFileSync(join(old, '.github/workflows/style-guide.yml'), 'utf8'), 'name: style guide\non:\n  push:\n    branches: [main]\n', 'left as it is');
  // No layer, or one in the system's own folder: nothing about it.
  const plain = writePublishJob(project('https://github.com/acme/ds.git'), { intentLayer: 'docs' });
  assert.doesNotMatch(plain.lines.join('\n'), /intent layer lives/);
  assert.ok(!existsSync(join(dir, 'docs')));
  // On GitLab: the schedule to add once.
  assert.match(writePublishJob(project('https://gitlab.com/acme/ds.git'), {}).lines.join('\n'), /Add a schedule once: Build → Pipeline schedules, every hour on the default branch/);
});

test('a build names the layer pages changed since the last read', async () => {
  const dir = makeFixture({});
  const cfg = { intentLayer: `${LAYER}/tree/main/docs` };
  const first = await syncIntentLayer(dir, cfg, { env: {}, fetchImpl: fakeGithub().fetchImpl });
  assert.equal(first.ok, true);
  assert.equal(first.lastChange, undefined, 'the first read has nothing to compare with');
  assert.doesNotMatch(describeSync(first), /Changed since the last read/);
  const moved = await syncIntentLayer(dir, cfg, { env: {}, fetchImpl: fakeGithub({ sha: 'fff9999aaa0000' }).fetchImpl });
  assert.deepEqual(moved.lastChange.pages, ['Saving']);
  assert.match(describeSync(moved), /\n {3}Changed since the last read: 1 page \(Saving\), checked again in this build$/);
  assert.deepEqual(readIntentLayer(dir, cfg) && JSON.parse(readFileSync(join(dir, 'intent-layer.snapshot.json'), 'utf8')).lastChange.files, ['docs/patterns/saving.md'], 'kept in the snapshot');
  const notAPage = await syncIntentLayer(dir, cfg, { env: {}, fetchImpl: fakeGithub({ sha: '0001112223334', changed: ['README.txt'] }).fetchImpl });
  assert.match(describeSync(notAPage), /Changed since the last read: 1 file, none of them a page/);
});

test('a team published to a store: the store\'s own job builds from the profile, hourly and when the layer\'s job starts it, never on its own pushes', async () => {
  const { storeJob, storeTarget, writeStoreJobs } = await import('../publish-job.mjs');
  assert.deepEqual(storeTarget({ gitlab: 'https://gitlab.acme.io/design/guide/-/tree/pages', path: 'site' }), { host: 'gitlab', origin: 'https://gitlab.acme.io', path: 'design/guide', branch: 'pages' });
  assert.deepEqual(storeTarget({ gitlab: 'https://gitlab.acme.io/design/guide', branch: 'trunk' }).branch, 'trunk');
  assert.equal(storeTarget({ folder: 'site' }), null);
  const job = storeJob({ profile: 'https://gitlab.acme.io/acme/setup/-/blob/main/profile.json' });
  for (const want of ["$CI_PIPELINE_SOURCE =~ /^(schedule|trigger|pipeline|web|api)$/", "--profile 'https://gitlab.acme.io/acme/setup/-/blob/main/profile.json' --ci-changed", 'exit_codes: [3]', '- .dse/', '--styleguide --no-publish', '--styleguide-check', '--publish-styleguide', '--ci-changed --record', 'GITLAB_WRITE_TOKEN', 'Pipeline schedules']) assert.ok(job.includes(want), want);
  assert.doesNotMatch(job, /CI_PIPELINE_SOURCE[^\n]*push/, 'never on a push to the store: the page it sends is one');
  assert.ok(job.indexOf('audit.mjs --styleguide-check') < job.indexOf('audit.mjs --publish-styleguide'), 'a page that fails its check is never sent');
  // With the profile's link: the job, and the layer's job pointed at the store's project.
  const dir = project('https://gitlab.acme.io/design/ds.git');
  const place = { gitlab: 'https://gitlab.acme.io/design/guide', branch: 'main' };
  const lines = writeStoreJobs(dir, { profile: { source: 'https://gitlab.acme.io/acme/setup/-/blob/main/profile.json' }, intentLayer: LAYER }, place);
  assert.match(lines[0], /add the job in \.design-system-engine-out\/style-guide-store-job\.yml to design\/guide \(its \.gitlab-ci\.yml\)/);
  assert.match(readFileSync(join(dir, '.design-system-engine-out', 'intent-layer-job.yml'), 'utf8'), /projects\/design%2Fguide\/trigger\/pipeline/, 'the layer\'s job starts the store\'s');
  // With no profile: the setup written as one beside the job, when the code is read from GitLab; else said.
  const mirror = project('https://gitlab.acme.io/design/ds.git', { '.gitlab-source.json': JSON.stringify({ source: 'https://gitlab.acme.io/design/ds' }) });
  const own = writeStoreJobs(mirror, { figmaFileKey: 'AbC123', stores: { styleguide: { write: place } } }, place);
  assert.match(own.join('\n'), /No company profile is set up, so the setup is written as one/);
  const prof = JSON.parse(readFileSync(join(mirror, '.design-system-engine-out', 'design-system-engine-profile.json'), 'utf8'));
  assert.deepEqual([prof.project, prof.config.figmaFileKey], ['https://gitlab.acme.io/design/ds', 'AbC123']);
  assert.match(readFileSync(join(mirror, '.design-system-engine-out', 'style-guide-store-job.yml'), 'utf8'), /--profile '\.\.\/design-system-engine-profile\.json'/);
  assert.match(writeStoreJobs(project(null), {}, place)[0], /The code is not read from GitLab here/);
  assert.match(writeStoreJobs(project(null), {}, { folder: 'site' })[0], /not a GitLab project/);
});

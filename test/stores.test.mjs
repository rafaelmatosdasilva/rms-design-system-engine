// stores.mjs - where each part of the engine's files lives, and whether this person may write it there: GitLab answers,
// never the setup. A fake GitLab for an invented company (Acme): a token's role in a project, a protected branch, a
// branch that moves.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { placeOf, storesOf, writeAccess, forgetAccess, pullStore, pushStore, localFiles, accessLines, gitStoreFiles, gitPlaceOf } from '../stores.mjs';
import { execFileSync } from 'node:child_process';
import { mayWrite } from '../intent-changes.mjs';

const HOST = 'gitlab.acme.test';
const env = { GITLAB_TOKEN: 'read-token', GITLAB_WRITE_TOKEN: 'write-token', GITLAB_HOST: HOST };
const LINK = `https://${HOST}/design/snapshots`;

// One project, its branches and files; each token's role in it.
// readOnly: tokens whose user has a role but which may only read (their scopes).
function fakeGitlab({ roles = { 'read-token': 20, 'write-token': 30 }, readOnly = [], branch = { name: 'main', can_push: true }, files = {} } = {}) {
  let n = 1;
  const g = { head: 'a'.repeat(40), files: { ...files }, calls: [], mrs: [], branches: { [branch.name]: true } };
  const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, arrayBuffer: async () => { const b = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); } });
  const base = `https://${HOST}/api/v4/projects/${encodeURIComponent('design/snapshots')}`;
  g.get = async (url, { headers = {} } = {}) => {
    g.calls.push(['GET', url, headers['PRIVATE-TOKEN'] ?? null]);
    const level = roles[headers['PRIVATE-TOKEN']];
    if (level == null) return res(404, { message: '404 Project Not Found' });
    if (!url.startsWith(base)) return res(404, {});
    const u = new URL(url), path = decodeURIComponent(url.slice(base.length).split('?')[0]);
    if (path === '') return res(200, { default_branch: branch.name, permissions: { project_access: { access_level: level }, group_access: null } });
    if (path.startsWith('/repository/branches/')) return path.endsWith(branch.name) ? res(200, { name: branch.name, can_push: level >= 30 && branch.can_push, protected: !branch.can_push }) : res(404, {});
    if (path.startsWith('/repository/commits/')) return res(200, { id: g.head });
    if (path === '/repository/tree') {
      const pre = u.searchParams.get('path');
      return res(200, Object.keys(g.files).filter((f) => !pre || f.startsWith(pre + '/')).map((f) => ({ type: 'blob', path: f })));
    }
    const raw = /^\/repository\/files\/(.+)\/raw$/.exec(path);
    if (raw) return g.files[raw[1]] != null ? res(200, g.files[raw[1]]) : res(404, {});
    return res(404, {});
  };
  g.send = async (url, { method, headers = {}, body } = {}) => {
    g.calls.push([method, url, headers['PRIVATE-TOKEN'] ?? null, body]);
    const level = roles[headers['PRIVATE-TOKEN']] ?? 0;
    const path = url.slice(base.length).split('?')[0];
    if (level < 30 || readOnly.includes(headers['PRIVATE-TOKEN'])) return res(403, { error: 'insufficient_granular_scope', error_description: 'Access denied: needs Repository: Write' });
    if (path === '/repository/commits' && !body?.branch) return res(400, { error: 'branch is missing' });
    if (path === '/repository/branches') { g.branches[new URL(url).searchParams.get('branch')] = true; return res(201, {}); }
    if (path === '/repository/commits') {
      if (body.branch === branch.name && !branch.can_push) return res(403, { message: 'protected' });
      for (const a of body.actions) g.files[a.file_path] = Buffer.from(a.content, 'base64').toString('utf8');
      if (body.branch === branch.name) g.head = String(++n).padStart(40, '0');
      return res(201, { id: g.head, web_url: `https://${HOST}/design/snapshots/-/commit/${g.head}` });
    }
    if (path === '/merge_requests') { g.mrs.push(body); return res(201, { web_url: `https://${HOST}/design/snapshots/-/merge_requests/${g.mrs.length}` }); }
    return res(404, {});
  };
  g.http = { get: g.get, send: g.send };
  // What could change something: every request but a read and the empty commit that asks whether a token may write.
  g.writes = () => g.calls.filter((c) => c[0] !== 'GET' && !(c[1].endsWith('/repository/commits') && !c[3]?.branch));
  g.probes = () => g.calls.filter((c) => c[0] === 'POST' && c[1].endsWith('/repository/commits') && !c[3]?.branch);
  return g;
}
const project = () => { const d = mkdtempSync(join(tmpdir(), 'stores-')); return d; };
const cfgWith = (stores) => ({ stores });
beforeEach(() => forgetAccess());

test('a place: a link or a folder alone, a branch from the link, nowhere', () => {
  assert.deepEqual(placeOf(`${LINK}/-/tree/release`), { gitlab: `${LINK}/-/tree/release`, branch: 'release', path: '', tokenEnv: null, writeTokenEnv: null });
  assert.deepEqual(placeOf('../shared'), { folder: '../shared', path: '' });
  assert.equal(placeOf('nowhere'), null);
  const s = storesOf({ stores: { snapshots: { read: LINK }, styleguide: { read: null, write: { folder: 'public', path: '/guide/' } }, contracts: { read: LINK, write: null } }, intentLayer: { gitlab: `https://${HOST}/design/intent`, autoFix: 'commit' } });
  assert.equal(s.snapshots.write.gitlab, LINK, 'written where it is read, when not said');
  assert.equal(s.contracts.write, null);
  assert.equal(s.styleguide.write.path, 'guide');
  assert.equal(s.intentLayer.read.gitlab, `https://${HOST}/design/intent`, 'the intent layer named the old way');
  assert.equal(s.intentLayer.mode, 'commit');
  assert.equal(s.decisions.read, null);
});

test('a Reporter never writes, even when the setup names a write place', async () => {
  const g = fakeGitlab({ roles: { 'read-token': 20, 'write-token': 20 } });
  const ROOT = project();
  const cfg = cfgWith({ snapshots: { read: LINK, write: LINK } });
  const a = await writeAccess(ROOT, cfg, 'snapshots', { env, http: g.http });
  assert.equal(a.mode, null);
  assert.match(a.why, /Reporter on design\/snapshots; writing needs Developer/);
  const r = await pushStore(ROOT, cfg, 'snapshots', new Map([['figma-vars.snapshot.json', '{}']]), 'm', { env, http: g.http });
  assert.equal(r.ok, false);
  assert.match(r.line, /not sent: GitLab gives the token/);
  assert.deepEqual(g.writes(), [], 'nothing was sent to GitLab');
});

test('a Maintainer\'s token that may only read is read only: GitLab is asked with a commit of nothing', async () => {
  const g = fakeGitlab({ roles: { 'read-token': 40, 'write-token': 40 }, readOnly: ['write-token'] });
  const ROOT = project();
  const a = await writeAccess(ROOT, cfgWith({ snapshots: { read: LINK } }), 'snapshots', { env, http: g.http });
  assert.equal(a.mode, null);
  assert.match(a.why, /may only read design\/snapshots \(GitLab: Access denied/);
  assert.deepEqual(g.writes(), []);
  assert.deepEqual(g.probes().map((c) => c[3]), [{}], 'the only request that could write had nothing in it');
});

test('no write token: read only, and the line says which variable to add', async () => {
  const g = fakeGitlab();
  const a = await writeAccess(project(), cfgWith({ snapshots: { read: { gitlab: LINK, tokenEnv: 'ACME_SNAPSHOTS_TOKEN' } } }), 'snapshots', { env: { GITLAB_HOST: HOST }, http: g.http });
  assert.equal(a.mode, null);
  assert.match(a.why, /add ACME_SNAPSHOTS_TOKEN to \.env/);
});

test('a place\'s own write token: the pipeline\'s where it is set, else GITLAB_WRITE_TOKEN, else the one that reads', async () => {
  const g = fakeGitlab({ roles: { 'read-token': 30, 'write-token': 30, 'guide-token': 30 } });
  const cfg = cfgWith({ snapshots: { read: { gitlab: LINK, writeTokenEnv: 'ACME_GUIDE_TOKEN' } } });
  const sent = async (env) => { forgetAccess(); g.calls.length = 0; await pushStore(project(), cfg, 'snapshots', new Map([['figma-vars.snapshot.json', `{"n":${Math.random()}}`]]), 'm', { env, http: g.http }); return g.calls.filter((c) => c[0] === 'POST' && c[3]?.branch).map((c) => c[2]); };
  assert.deepEqual(await sent({ ...env, ACME_GUIDE_TOKEN: 'guide-token' }), ['guide-token'], 'the pipeline: its own token');
  assert.deepEqual(await sent(env), ['write-token'], 'a computer without it: GITLAB_WRITE_TOKEN');
  assert.deepEqual(await sent({ GITLAB_TOKEN: 'read-token', GITLAB_HOST: HOST }), ['read-token'], 'only one token: the person\'s own');
});

test('a protected branch this token cannot push: a merge request, never a commit on it', async () => {
  const g = fakeGitlab({ branch: { name: 'main', can_push: false } });
  const ROOT = project();
  const cfg = cfgWith({ snapshots: { read: LINK } });
  const r = await pushStore(ROOT, cfg, 'snapshots', new Map([['src/figma-vars.snapshot.json', '{"a":1}']]), 'Snapshots refreshed', { env, http: g.http });
  assert.equal(r.ok, true, r.line);
  assert.match(r.line, /merge request into main/);
  assert.equal(g.mrs.length, 1);
  assert.equal(g.mrs[0].target_branch, 'main');
  assert.ok(!g.writes().some((c) => c[0] === 'POST' && c[3]?.branch === 'main'), 'no commit on main');
  assert.equal(await (await mayWrite(ROOT, { stores: { intentLayer: { read: LINK } } }, 'commit', { env, http: g.http })).ok, false, 'the intent layer is not committed there either');
});

test('Developer on a branch it may push: one commit, files created or updated', async () => {
  const g = fakeGitlab({ files: { 'snaps/src/figma-vars.snapshot.json': '{"old":1}' } });
  const ROOT = project();
  const cfg = cfgWith({ snapshots: { read: { gitlab: LINK, path: 'snaps' } } });
  const r = await pushStore(ROOT, cfg, 'snapshots', new Map([['src/figma-vars.snapshot.json', '{"new":1}'], ['src/figma-structure.snapshot.json', '{}'], ['.env', 'X=1']]), 'Snapshots refreshed', { env, http: g.http });
  assert.equal(r.ok, true, r.line);
  const commit = g.writes().find((c) => c[1].endsWith('/repository/commits'));
  assert.equal(commit[2], 'write-token', 'written with the write token');
  assert.deepEqual(commit[3].actions.map((a) => [a.action, a.file_path]), [['update', 'snaps/src/figma-vars.snapshot.json'], ['create', 'snaps/src/figma-structure.snapshot.json']], 'a file that is not a snapshot is never sent');
  assert.equal(g.files['snaps/src/figma-vars.snapshot.json'], '{"new":1}');
  assert.equal((await mayWrite(ROOT, { stores: { intentLayer: { read: LINK } } }, 'commit', { env, http: g.http })).ok, true);
});

test('read from the store: only its kind of file, a change made here is kept, and a moved branch refuses a write', async () => {
  const g = fakeGitlab({ files: { 'src/figma-vars.snapshot.json': '{"v":1}', '.env': 'GITLAB_TOKEN=x', 'notes.md': 'hi' } });
  const ROOT = project();
  const cfg = cfgWith({ snapshots: { read: LINK } });
  const r1 = await pullStore(ROOT, cfg, 'snapshots', { env, http: g.http });
  assert.deepEqual(r1.written, ['src/figma-vars.snapshot.json']);
  assert.ok(!existsSync(join(ROOT, '.env')) && !existsSync(join(ROOT, 'notes.md')), 'only snapshots come in');
  assert.deepEqual((await pullStore(ROOT, cfg, 'snapshots', { env, http: g.http })).written, [], 'the same commit is not read again');
  // Changed here, and then in the store: this computer's is kept.
  writeFileSync(join(ROOT, 'src/figma-vars.snapshot.json'), '{"v":"mine"}');
  g.files['src/figma-vars.snapshot.json'] = '{"v":2}'; g.head = 'b'.repeat(40);
  const r2 = await pullStore(ROOT, cfg, 'snapshots', { env, http: g.http });
  assert.deepEqual(r2.kept, ['src/figma-vars.snapshot.json']);
  assert.equal(readFileSync(join(ROOT, 'src/figma-vars.snapshot.json'), 'utf8'), '{"v":"mine"}');
  // Someone else writes after this run read it: sending now is refused.
  g.head = 'c'.repeat(40);
  const r3 = await pushStore(ROOT, cfg, 'snapshots', localFiles(ROOT, cfg, 'snapshots'), 'm', { env, http: g.http });
  assert.equal(r3.ok, false);
  assert.match(r3.line, /moved since it was read/);
  assert.ok(!g.writes().length);
});

test('a folder store: read and written on this computer; the lines say what each person may do', async () => {
  const ROOT = project(), shared = project();
  mkdirSync(join(shared, 'team'), { recursive: true });
  writeFileSync(join(shared, 'team', 'design-system-engine-kept.json'), '[]');
  const cfg = cfgWith({ decisions: { read: { folder: shared, path: 'team' } }, styleguide: { write: { folder: join(shared, 'site') } }, snapshots: { read: LINK, write: null } });
  assert.deepEqual((await pullStore(ROOT, cfg, 'kept')).written, ['design-system-engine-kept.json'], 'kept with the decisions: the setup names no place of their own');
  writeFileSync(join(ROOT, 'design-system-engine-kept.json'), '[{"reason":"brand"}]');
  const sent = await pushStore(ROOT, cfg, 'kept', localFiles(ROOT, cfg, 'kept'), 'm');
  assert.equal(sent.ok, true);
  assert.equal(readFileSync(join(shared, 'team', 'design-system-engine-kept.json'), 'utf8'), '[{"reason":"brand"}]');
  const lines = (await accessLines(ROOT, cfg, { env, offline: true })).join('\n');
  assert.match(lines, /Snapshots: lives in design\/snapshots; you can only read it: this setup reads snapshots from design\/snapshots and writes it nowhere/);
  assert.match(lines, /Style guide: lives in the folder .*site; you can change it/);
});

test('the differences kept on purpose are a part of their own, kept with the decisions when the setup names no place', () => {
  const both = storesOf({ stores: { decisions: { read: LINK, }, kept: { read: { gitlab: `https://${HOST}/design/intent`, path: 'decisions' } } } });
  assert.equal(both.kept.read.path, 'decisions');
  assert.equal(both.decisions.read.gitlab, LINK);
  assert.equal(storesOf({ stores: { decisions: { read: LINK } } }).kept.read.gitlab, LINK);
  const ROOT = project();
  writeFileSync(join(ROOT, 'design-system-engine-kept.json'), '{}');
  writeFileSync(join(ROOT, 'design-system-engine-checked.json'), '{}');
  assert.deepEqual([...localFiles(ROOT, {}, 'kept').keys()], ['design-system-engine-kept.json']);
  assert.deepEqual([...localFiles(ROOT, {}, 'decisions').keys()], ['design-system-engine-checked.json']);
});

test('publishing the style guide sends the page and what it links to, never the rest of its folder', async () => {
  const { pageFiles } = await import('../stores.mjs');
  const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const d = mkdtempSync(join(tmpdir(), 'sg-pub-'));
  mkdirSync(join(d, 'img'));
  writeFileSync(join(d, 'index.html'), '<a href="chip.html#top">Chip</a><img src="img/logo.svg"><a href="https://acme.example/x.html">x</a><a href="#status">s</a>');
  writeFileSync(join(d, 'chip.html'), '<img src="img/logo.svg"><a href="index.html">back</a>');
  writeFileSync(join(d, 'img', 'logo.svg'), '<svg/>');
  writeFileSync(join(d, 'my.theme.json'), '{}');
  writeFileSync(join(d, 'notes.txt'), 'mine');
  assert.deepEqual([...pageFiles(join(d, 'index.html')).keys()].sort(), ['chip.html', 'img/logo.svg', 'index.html']);
});

test('the team\'s themes: read into the engine\'s own folder, never the project\'s; only theme files go either way', async () => {
  const { THEMES_DIR } = await import('../stores.mjs');
  const ROOT = project(), shared = project();
  mkdirSync(join(shared, 'themes', 'acme'), { recursive: true });
  writeFileSync(join(shared, 'themes', 'ocean.theme.json'), '{"id":"t1","name":"Ocean"}');
  writeFileSync(join(shared, 'themes', 'acme', 'old.theme.json'), '{"id":"t9","name":"Old"}');   // a folder of its own: not this store's
  writeFileSync(join(shared, 'themes', 'notes.md'), 'not a theme');
  const cfg = cfgWith({ themes: { read: { folder: shared, path: 'themes' }, write: { folder: shared, path: 'themes' } } });
  assert.deepEqual((await pullStore(ROOT, cfg, 'themes')).written, ['ocean.theme.json']);
  assert.ok(existsSync(join(ROOT, THEMES_DIR, 'ocean.theme.json')));
  assert.equal(existsSync(join(ROOT, 'ocean.theme.json')), false, 'nothing in the project folder');
  const sent = await pushStore(ROOT, cfg, 'themes', new Map([['sunset.theme.json', Buffer.from('{"id":"t2","name":"Sunset"}')], ['.env', Buffer.from('X=1')]]), 'm');
  assert.equal(sent.ok, true);
  assert.ok(existsSync(join(shared, 'themes', 'sunset.theme.json')));
  assert.equal(existsSync(join(shared, 'themes', '.env')), false, 'only theme files are sent');
});

test('a style guide build shares the themes the store lacks, or holds older; a colleague\'s newer one is kept', async () => {
  const { themesToShare, THEMES_DIR } = await import('../stores.mjs');
  const ROOT = project(), mine = project();
  mkdirSync(join(ROOT, THEMES_DIR), { recursive: true });
  writeFileSync(join(ROOT, THEMES_DIR, 'ocean.theme.json'), '{"id":"t1","name":"Ocean","changed":"2026-02-01"}');
  writeFileSync(join(ROOT, THEMES_DIR, 'sand.theme.json'), '{"id":"t3","name":"Sand","changed":"2026-01-01"}');
  writeFileSync(join(mine, 'ocean.theme.json'), '{"id":"t1","name":"Ocean","changed":"2026-01-15"}');   // older than the store's: kept there
  writeFileSync(join(mine, 'sand.theme.json'), '{"id":"t3","name":"Sand","changed":"2026-03-01"}');    // newer: sent
  writeFileSync(join(mine, 'sunset.theme.json'), '{"id":"t2","name":"Sunset"}');                       // new: sent
  writeFileSync(join(mine, 'notes.json'), '{"a":1}');                                                  // not a theme
  assert.deepEqual([...themesToShare(ROOT, [mine], 'acme').keys()].sort(), ['sand.theme.json', 'sunset.theme.json']);
});

// ── Reading a store with the person's own git access, for a computer with no token ──────────────────────────────
// A real repository, read the real way: git init, fetch, ls-tree and cat-file, with only the address swapped for a
// local one. What is proved is the reading and the parsing, which is where this can go wrong.
test('no token: a store is read with the person\'s own git access, under its path, and git is never asked for a password', () => {
  const home = mkdtempSync(join(tmpdir(), 'git-store-home-'));
  const src = mkdtempSync(join(tmpdir(), 'git-store-src-'));
  const run = (args, o = {}) => execFileSync('git', args, { cwd: src, stdio: ['pipe', 'pipe', 'ignore'], ...o });
  run(['init', '-q', '-b', 'main']);
  run(['config', 'user.email', 'demo@example.com']); run(['config', 'user.name', 'Demo']);
  mkdirSync(join(src, 'snapshots'), { recursive: true });
  writeFileSync(join(src, 'snapshots', 'figma-vars.snapshot.json'), '{"a":1}\n');
  writeFileSync(join(src, 'snapshots', 'deep', 'x.snapshot.json').replace('deep/', 'deep-'), '{"b":2}\n');
  writeFileSync(join(src, 'README.md'), 'outside the path\n');
  run(['add', '-A']); run(['commit', '-qm', 'one']);

  // Every address the reader tries resolves to this repository; everything else is the real git.
  const asked = [];
  const git = (args, input) => {
    asked.push(args);
    return execFileSync('git', args.map((a) => (/^(git@|https?:\/\/)/.test(a) ? src : a)), { input, maxBuffer: 1 << 28, stdio: ['pipe', 'pipe', 'ignore'] });
  };
  const p = { host: 'gitlab.example.com', path: 'team/design', origin: 'https://gitlab.example.com' };
  const got = gitStoreFiles(p, { branch: 'main', path: 'snapshots' }, { git, home });
  assert.ok(got, 'the store was read');
  assert.match(got.sha, /^[0-9a-f]{40}$/);
  assert.deepEqual([...got.files.keys()].sort(), ['deep-x.snapshot.json', 'figma-vars.snapshot.json']);
  assert.equal(String(got.files.get('figma-vars.snapshot.json')), '{"a":1}\n');   // the file itself, not its listing
  assert.equal(got.files.has('README.md'), false, 'only what the place\'s path holds');

  // The mirror is kept per repository, so a second run fetches only what moved.
  assert.ok(existsSync(join(home, '.cache', 'rms-engine', 'git', 'gitlab.example.com', 'team-design.git', 'HEAD')));
  // SSH is tried first: it is the access a person already has.
  assert.match(asked.find((a) => a.includes('fetch')).join(' '), /git@gitlab\.example\.com:team\/design\.git/);

  // Nothing reachable: null, so the run falls back to what it always said instead of hanging on a password prompt.
  assert.equal(gitStoreFiles(p, { branch: 'main', path: '' }, { git: () => { throw new Error('no'); }, home }), null);
});

// ── Who ran it ──────────────────────────────────────────────────────────────────────────────────────────────────
test('a commit says whose run made it; a checkout with no identity of its own sends no author', async () => {
  const g = fakeGitlab();
  const dir = project();
  const cfg = cfgWith({ snapshots: { read: LINK } });
  const files = new Map([['figma-vars.snapshot.json', '{"a":1}']]);

  await pushStore(dir, cfg, 'snapshots', files, 'Snapshots', { env, http: g.http, runBy: { name: 'Acme Runner', email: 'runner@example.com' } });
  const body = g.calls.find((c) => c[0] === 'POST' && c[1].endsWith('/repository/commits') && c[3]?.branch)?.[3];
  assert.equal(body.author_name, 'Acme Runner');
  assert.equal(body.author_email, 'runner@example.com');

  // Nobody to name (a checkout with no git identity of its own, a pipeline's): the commit goes as it always did, as
  // the token's owner. Said here rather than left to this computer's git settings, which differ from machine to
  // machine and would make this test read them instead of the engine.
  forgetAccess();
  const g2 = fakeGitlab();
  await pushStore(project(), cfg, 'snapshots', new Map([['figma-vars.snapshot.json', '{"b":2}']]), 'Snapshots', { env, http: g2.http, runBy: null });
  const body2 = g2.calls.find((c) => c[0] === 'POST' && c[1].endsWith('/repository/commits') && c[3]?.branch)?.[3];
  assert.equal('author_name' in body2, false, JSON.stringify(body2 && Object.keys(body2)));
  assert.equal('author_email' in body2, false);
});

// ── A store on GitHub ───────────────────────────────────────────────────────────────────────────────────────────
test('a store on GitHub is read with git, the same way as one on GitLab; writing there still says it is not built', async () => {
  // The link a person pastes, in the shapes GitHub and GitLab give them.
  assert.deepEqual(gitPlaceOf({ github: 'https://github.com/acme/design-store' }), { host: 'github.com', path: 'acme/design-store', origin: 'https://github.com' });
  assert.deepEqual(gitPlaceOf({ github: 'https://github.com/acme/design-store/tree/main/snapshots' }), { host: 'github.com', path: 'acme/design-store', origin: 'https://github.com' });
  assert.deepEqual(gitPlaceOf({ gitlab: 'https://gitlab.acme.test/team/design/-/blob/main/x.json' }), { host: 'gitlab.acme.test', path: 'team/design', origin: 'https://gitlab.acme.test' });
  assert.equal(gitPlaceOf({ github: 'https://github.com/acme' }), null, 'an owner is not a repository');
  assert.equal(gitPlaceOf({ github: 'not a link' }), null);

  const dir = project();
  const cfg = cfgWith({ snapshots: { read: { github: 'https://github.com/acme/design-store' }, write: { github: 'https://github.com/acme/design-store' } } });
  const gitStore = (p, place) => {
    assert.equal(p.host, 'github.com');
    assert.equal(p.path, 'acme/design-store');
    return { sha: 'b'.repeat(40), files: new Map([['figma-vars.snapshot.json', Buffer.from('{"a":1}')]]) };
  };
  const r = await pullStore(dir, cfg, 'snapshots', { env, gitStore });
  assert.deepEqual(r.written, ['figma-vars.snapshot.json']);
  assert.equal(readFileSync(join(dir, 'figma-vars.snapshot.json'), 'utf8'), '{"a":1}');

  // Nothing reachable: said in one line, never thrown at the run.
  forgetAccess();
  const none = await pullStore(project(), cfg, 'snapshots', { env, gitStore: () => null });
  assert.match(none.line, /git could not reach it with this computer's own access/);

  // Writing to GitHub is still not built: it says so instead of pretending.
  forgetAccess();
  const w = await pushStore(project(), cfg, 'snapshots', new Map([['figma-vars.snapshot.json', '{"a":1}']]), 'Snapshots', { env });
  assert.equal(w.ok, false);
  assert.match(w.line, /not built yet/);
});

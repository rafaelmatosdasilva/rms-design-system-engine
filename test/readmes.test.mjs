// readmes.mjs - each repository the setup names says what is there: the profile's whole README and command, a
// section of the engine's in each store's README, written only where GitLab lets the person running it write. A fake
// GitLab for an invented company (Acme), with several projects.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { withSection, storeRepos, profileRepo, clientOf, profileReadme, storeSection, syncReadmes, START, END } from '../readmes.mjs';
import { forgetAccess } from '../stores.mjs';

const HOST = 'gitlab.acme.test';
const env = { GITLAB_TOKEN: 'read-token', GITLAB_WRITE_TOKEN: 'write-token', GITLAB_HOST: HOST };
const PROFILE = `https://${HOST}/design/acme-profile/-/blob/main/design-system-engine-profile.json`;
const GUIDE = `https://${HOST}/design/acme-guide`;
const LAYER = `https://${HOST}/design/acme-layer`;
const STORES = {
  snapshots: { read: { gitlab: GUIDE, path: 'snapshots' } },
  styleguide: { write: { gitlab: GUIDE } },
  intentLayer: { read: { gitlab: LAYER } },
  contracts: { read: { gitlab: LAYER, path: 'specs/contracts' } },
};
const PROFILE_JSON = JSON.stringify({ profile: 1, name: 'Acme DS', client: 'acme', project: `https://${HOST}/web/acme-ui`, stores: STORES, config: {} });
const cfg = { profile: { source: PROFILE, sha: 'x', name: 'Acme DS' }, project: `https://${HOST}/web/acme-ui`, stores: STORES };

// Projects by path: their files, head, whether the branch takes a push; each token's role (the same in every project
// unless a project says).
function fakeGitlab({ roles = { 'read-token': 20, 'write-token': 30 }, projects = {} } = {}) {
  const g = { calls: [], mrs: [], projects: {} };
  let n = 1;
  for (const [path, p] of Object.entries(projects)) g.projects[path] = { files: { ...(p.files ?? {}) }, head: String(n++).padStart(40, '0'), branch: 'main', can_push: p.can_push ?? true, roles: p.roles ?? roles, branches: { main: true } };
  const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, arrayBuffer: async () => { const b = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); } });
  const find = (url) => {
    const m = new RegExp(`^https://${HOST.replace(/\./g, '\\.')}/api/v4/projects/([^/?]+)(.*)$`).exec(url);
    if (!m) return null;
    const path = decodeURIComponent(m[1]);
    return g.projects[path] ? { p: g.projects[path], rest: decodeURIComponent(m[2].split('?')[0]), query: new URL(url).searchParams } : null;
  };
  g.get = async (url, { headers = {} } = {}) => {
    g.calls.push(['GET', url]);
    const f = find(url); if (!f) return res(404, {});
    const level = f.p.roles[headers['PRIVATE-TOKEN']];
    if (level == null) return res(404, {});
    const { p, rest, query } = f;
    if (rest === '') return res(200, { default_branch: p.branch, permissions: { project_access: { access_level: level } } });
    if (rest.startsWith('/repository/branches/')) { const b = rest.slice('/repository/branches/'.length); return p.branches[b] ? res(200, { name: b, can_push: b === p.branch ? level >= 30 && p.can_push : level >= 30 }) : res(404, {}); }
    if (rest.startsWith('/repository/commits/')) return res(200, { id: p.head });
    if (rest === '/repository/tree') return res(200, Object.keys(p.files).map((x) => ({ type: 'blob', path: x })));
    if (rest === '/merge_requests') return res(200, g.mrs.filter((m) => m.p === p && m.source_branch === query.get('source_branch')));
    const raw = /^\/repository\/files\/(.+)\/raw$/.exec(rest);
    if (raw) return p.files[raw[1]] != null ? res(200, p.files[raw[1]]) : res(404, {});
    return res(404, {});
  };
  g.send = async (url, { method, headers = {}, body } = {}) => {
    g.calls.push([method, url, body]);
    const f = find(url); if (!f) return res(404, {});
    const { p, rest } = f;
    if ((p.roles[headers['PRIVATE-TOKEN']] ?? 0) < 30) return res(403, { message: 'forbidden' });
    if (rest === '/repository/commits' && !body?.branch) return res(400, { error: 'branch is missing' });
    if (rest === '/repository/commits') {
      if (body.branch === p.branch && !p.can_push) return res(403, { message: 'protected' });
      p.branches[body.branch] = true;
      for (const a of body.actions) p.files[a.file_path] = Buffer.from(a.content, 'base64').toString('utf8');
      if (body.branch === p.branch) p.head = String(n++).padStart(40, '0');
      return res(201, { id: p.head, web_url: `https://${HOST}/commit/${p.head}` });
    }
    if (rest === '/merge_requests') { g.mrs.push({ ...body, p, web_url: `https://${HOST}/mr/${g.mrs.length + 1}` }); return res(201, { web_url: `https://${HOST}/mr/${g.mrs.length}` }); }
    return res(404, {});
  };
  g.http = { get: g.get, send: g.send };
  g.commits = () => g.calls.filter((c) => c[0] === 'POST' && c[1].endsWith('/repository/commits') && c[2]?.branch);
  return g;
}
const projects = () => ({
  'design/acme-profile': { files: { 'design-system-engine-profile.json': PROFILE_JSON } },
  'design/acme-guide': { files: { 'README.md': '# Acme guide\n\nThe team\'s own words.\n', 'snapshots/src/figma-vars.snapshot.json': '{}', 'snapshots/open-since.snapshot.json': '{}', '.gitlab-ci.yml': '# CI/CD variables:\n#   GITLAB_TOKEN    reads everything\n#   FIGMA_TOKEN     optional: the Figma file\nbuild:\n  script:\n    - node /engine/audit.mjs --ci-changed\n  rules:\n    - if: \'$CI_PIPELINE_SOURCE == "schedule"\'\n' } },
  'design/acme-layer': { files: { 'specs/button.md': '# Button' } },
});
const dir = () => mkdtempSync(join(tmpdir(), 'readmes-'));
beforeEach(() => forgetAccess());

test('the section: in place of the last one wherever it was moved, after the team\'s text, or a new README', () => {
  const block = (t) => `${START}\n${t}\n${END}`;
  assert.equal(withSection('', 'Hi', { title: 'Acme guide' }), `# Acme guide\n\n${block('Hi')}\n`);
  assert.equal(withSection('# T\n\nTeam text.\n', 'Hi'), `# T\n\nTeam text.\n\n${block('Hi')}\n`, 'after the team\'s text, which is kept');
  const moved = `# T\n\n${block('Hi')}\n\nTeam text.\n`;
  assert.equal(withSection(moved, 'Again'), moved.replace('Hi', 'Again'), 'the old section replaced where the team put it, nothing else');
});

test('the repositories: the profile\'s from its link, each store\'s with its parts, the client\'s name', () => {
  const p = profileRepo(cfg);
  assert.equal(p.path, 'design/acme-profile'); assert.equal(p.branch, 'main'); assert.equal(p.file, 'design-system-engine-profile.json');
  const r = storeRepos(cfg);
  assert.deepEqual(r.map((e) => e.repo.path), ['design/acme-guide', 'design/acme-layer']);
  assert.deepEqual(r[0].parts.map((e) => [e.part, e.path, e.read, e.write]), [['snapshots', 'snapshots', true, true], ['styleguide', '', false, true]]);
  assert.equal(clientOf({ name: 'Acme DS' }), 'acme');
  assert.equal(clientOf({ name: 'Northwind' }, ['rms-design-system-engine-nw/SKILL.md']), 'nw', 'the command folder its repository holds');
  assert.equal(clientOf({ client: 'Ocean', name: 'x' }), 'ocean');
});

test('the profile\'s README: the install line first, where each part lives, from the profile itself', () => {
  const t = profileReadme(JSON.parse(PROFILE_JSON), profileRepo(cfg));
  assert.match(t, /^# Acme DS profile/);
  assert.match(t, /install\.sh \| bash -s -- --client acme --profile 'https:\/\/gitlab\.acme\.test\/design\/acme-profile\/-\/blob\/main\/design-system-engine-profile\.json'/);
  assert.ok(t.indexOf('install.sh') < t.indexOf('Paste your GitLab token'), 'installing is the first step');
  assert.match(t, /https:\/\/gitlab\.acme\.test\/-\/user_settings\/personal_access_tokens/);
  assert.match(t, /\| Snapshots \| `design\/acme-guide`, `snapshots\/` \|/);
  const own = JSON.parse(PROFILE_JSON); own.stores.snapshots.write = { ...own.stores.snapshots.read, writeTokenEnv: 'ACME_GUIDE_TOKEN' };
  assert.match(profileReadme(own, profileRepo(cfg)), /\| Snapshots \| `design\/acme-guide`, `snapshots\/` \|/, 'the same place, whatever token writes it');
  assert.match(t, /\| The code \| `web\/acme-ui` \|/);
  assert.match(t, /`\/rms-design-system-engine-acme`/);
});

test('a store\'s section: its parts, its snapshots, its pipeline\'s variables, the related projects', () => {
  const r = storeRepos(cfg);
  const ps = projects()['design/acme-guide'].files;
  const t = storeSection(r[0], { name: 'Acme DS', tree: Object.keys(ps), ci: ps['.gitlab-ci.yml'], others: r, prof: profileRepo(cfg), project: cfg.project });
  assert.match(t, /\| `src\/figma-vars\.snapshot\.json` \| Every Figma variable/);
  assert.match(t, /\| `GITLAB_TOKEN` \| reads everything \|/);
  assert.match(t, /interval `0 \* \* \* \*`/);
  assert.doesNotMatch(t, /DOC_STRESS/, 'no weekly schedule the pipeline does not have');
  assert.match(t, /- `design\/acme-layer`: the intent layer and contracts/);
  assert.match(t, /- `web\/acme-ui`: the code/);
  assert.match(t, /\*\*Open it:\*\* `index\.html`/);
});

test('a run writes what differs where GitLab lets it, keeps the team\'s text, and asks again only when something moved', async () => {
  const g = fakeGitlab({ projects: projects() });
  const ROOT = dir();
  const lines = await syncReadmes(ROOT, cfg, { env, http: g.http });
  assert.equal(lines.length, 3, lines.join('\n'));
  const prof = g.projects['design/acme-profile'].files, guide = g.projects['design/acme-guide'].files;
  assert.match(prof['README.md'], /--client acme/);
  assert.match(prof['rms-design-system-engine-acme/SKILL.md'], /--profile 'https:\/\/gitlab\.acme\.test\/design\/acme-profile/);
  assert.match(guide['README.md'], /^# Acme guide\n\nThe team's own words\.\n\n<!-- rms-design-system-engine:start/, 'what the team wrote stays, first');
  assert.match(g.projects['design/acme-layer'].files['README.md'], /^# Acme DS intent layer and contracts/);

  const before = g.calls.length, commits = g.commits().length;
  assert.deepEqual(await syncReadmes(ROOT, cfg, { env, http: g.http }), [], 'nothing moved: nothing said');
  assert.equal(g.commits().length, commits, 'nothing written again');
  assert.ok(g.calls.slice(before).every((c) => c[0] === 'GET' && /\/repository\/commits\/|\/projects\/[^/]+$/.test(c[1].split('?')[0])), 'only each branch\'s head asked');

  g.projects['design/acme-guide'].files['README.md'] = guide['README.md'].replace('Every Figma variable', 'Edited by hand');
  g.projects['design/acme-guide'].head = 'f'.repeat(40);
  const again = await syncReadmes(ROOT, cfg, { env, http: g.http });
  assert.equal(again.length, 1, 'the branch moved: the section put back');
  assert.match(g.projects['design/acme-guide'].files['README.md'], /Every Figma variable/);
});

test('a person who may only read: nothing written, nothing said, and not asked again on the next run', async () => {
  const g = fakeGitlab({ roles: { 'read-token': 20, 'write-token': 20 }, projects: projects() });
  const ROOT = dir();
  assert.deepEqual(await syncReadmes(ROOT, cfg, { env, http: g.http }), []);
  assert.equal(g.commits().length, 0);
  const before = g.calls.length;
  await syncReadmes(ROOT, cfg, { env, http: g.http });
  assert.ok(g.calls.slice(before).every((c) => !/\/repository\/tree/.test(c[1])), 'the files are not read again');
  forgetAccess();
  const said = await syncReadmes(ROOT, cfg, { env, http: g.http, verbose: true, force: true });
  assert.ok(said.some((l) => /README of design\/acme-guide not written: GitLab gives the token/.test(l)), said.join('\n'));
});

test('a protected branch: one merge request the engine keeps open, and turned off by the setup', async () => {
  const ps = projects(); ps['design/acme-guide'].can_push = false;
  const g = fakeGitlab({ projects: ps });
  const ROOT = dir();
  const lines = await syncReadmes(ROOT, cfg, { env, http: g.http });
  assert.ok(lines.some((l) => /design\/acme-guide brought up to date: sent as a merge request/.test(l)), lines.join('\n'));
  assert.equal(g.mrs.length, 1);
  assert.equal(g.mrs[0].source_branch, 'design-system-engine/readme');
  forgetAccess();
  g.projects['design/acme-guide'].files['snapshots/a11y-results.snapshot.json'] = '{}';
  g.projects['design/acme-guide'].head = 'e'.repeat(40);
  const again = await syncReadmes(ROOT, cfg, { env, http: g.http });
  assert.ok(again.some((l) => /added to the merge request/.test(l)), again.join('\n'));
  assert.equal(g.mrs.length, 1, 'the same merge request, not a new one');
  assert.deepEqual(await syncReadmes(dir(), { ...cfg, readmes: false }, { env, http: g.http }), []);
});

test('a later run where only a store moved keeps the code\'s line, read from the profile file', async () => {
  const g = fakeGitlab({ projects: projects() });
  const ROOT = dir();
  const noProject = { profile: cfg.profile, stores: STORES };   // the code's link only in the profile file, as a setup from a profile has it
  await syncReadmes(ROOT, noProject, { env, http: g.http });
  assert.match(g.projects['design/acme-guide'].files['README.md'], /- `web\/acme-ui`: the code/);
  const commits = g.commits().length;
  g.projects['design/acme-guide'].files['snapshots/open-since.snapshot.json'] = '{"a":1}';
  g.projects['design/acme-guide'].head = 'd'.repeat(40);
  forgetAccess();
  assert.deepEqual(await syncReadmes(ROOT, noProject, { env, http: g.http }), [], 'nothing to write: the section is the same');
  assert.equal(g.commits().length, commits);
});

// The project read straight from GitHub, as it is from GitLab. Nothing here reaches the network: every answer is
// given in, which is how the GitLab reader's own tests work.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
const gunzipOf = (b) => gunzipSync(b);
import { parseGithubProject, syncGithub, tokenAllowedFor, describe as saidAbout, STATE_FILE } from '../lib/github-source.mjs';
import { untar } from '../lib/gitlab-source.mjs';
import { tempDir } from './helpers.mjs';

test('a GitHub link, and never one that is not', () => {
  assert.deepEqual(parseGithubProject('https://github.com/acme/ds'), { origin: 'https://github.com', host: 'github.com', path: 'acme/ds', ref: null, apiBase: 'https://api.github.com' });
  assert.equal(parseGithubProject('https://github.com/acme/ds.git').path, 'acme/ds', 'with or without .git');
  assert.equal(parseGithubProject('https://github.com/acme/ds/tree/feature/new-tokens').ref, 'feature/new-tokens', 'a branch with slashes keeps them');
  assert.equal(parseGithubProject('https://gitlab.com/acme/ds'), null, 'GitLab keeps its own links');
  assert.equal(parseGithubProject('https://example.com/acme/ds'), null);
  assert.equal(parseGithubProject('https://github.com/acme'), null, 'a user is not a project');
  assert.equal(parseGithubProject('https://user:pw@github.com/acme/ds'), null, 'credentials in a link are never followed');
  const ghe = parseGithubProject('https://git.acme.test/acme/ds', { GITHUB_HOST: 'git.acme.test' });
  assert.equal(ghe.apiBase, 'https://git.acme.test/api/v3', 'a GitHub Enterprise Server has its API under /api/v3');
});

// The token is the one thing that must never go to a host the person did not name.
test('the token goes to GitHub and to a host the person named, and nowhere else', () => {
  assert.equal(tokenAllowedFor('github.com', {}), true);
  assert.equal(tokenAllowedFor('git.acme.test', {}), false);
  assert.equal(tokenAllowedFor('git.acme.test', { GITHUB_HOST: 'git.acme.test' }), true);
  assert.equal(tokenAllowedFor('evil.test', { GITHUB_HOST: 'git.acme.test' }), false);
});

// GitHub's archive wraps the project in a folder named for the repository and the commit, exactly as GitLab's does,
// and the reader they share already drops it. A second strip here removed the file itself when a commit held one.
test("the archive's own wrapper folder is dropped once, by the reader both hosts share", () => {
  assert.deepEqual(untar(gunzipOf(tarball({ 'package.json': '{}' }))).map((f) => f.path), ['package.json'], 'one file keeps its name');
  assert.deepEqual(untar(gunzipOf(tarball({ 'package.json': '{}', 'src/a.css': ':root{}' }))).map((f) => f.path), ['package.json', 'src/a.css']);
});

// A tar of two files, as GitHub sends one: a wrapper folder, gzipped.
function tarball(files, root = 'acme-ds-9f3a') {
  const blocks = [];
  for (const [name, body] of Object.entries(files)) {
    const head = Buffer.alloc(512);
    Buffer.from(`${root}/${name}`).copy(head, 0);
    Buffer.from('0000644\0').copy(head, 100);
    Buffer.from(`${body.length.toString(8).padStart(11, '0')}\0`).copy(head, 124);
    Buffer.from('00000000000\0').copy(head, 136);
    Buffer.from('ustar\0').copy(head, 257);
    head.fill(' ', 148, 156);
    let sum = 0; for (const b of head) sum += b;
    Buffer.from(`${sum.toString(8).padStart(6, '0')}\0 `).copy(head, 148);
    const data = Buffer.alloc(Math.ceil(body.length / 512) * 512);
    Buffer.from(body).copy(data);
    blocks.push(head, data);
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}

const answers = (over = {}) => async (url) => {
  const give = (body) => ({ ok: true, status: 200, json: async () => body });
  if (over[url]) return over[url];
  if (/\/repos\/acme\/ds$/.test(url)) return give({ default_branch: 'main' });
  if (/\/commits\//.test(url)) return give({ sha: '9f3a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a', commit: { message: 'A change\n\nand its body', committer: { date: '2026-11-17T09:00:00Z' } } });
  if (/\/tarball\//.test(url)) return { ok: true, status: 200, arrayBuffer: async () => tarball({ 'package.json': '{"name":"ds"}', 'src/tokens.css': ':root{}' }) };
  return { ok: false, status: 404 };
};

test('the branch\'s latest commit is mirrored, and fetched again only when it moved', async () => {
  const dir = tempDir('gh-');
  const p = parseGithubProject('https://github.com/acme/ds');
  const first = await syncGithub(p, { dir, env: {}, fetchImpl: answers() });
  assert.equal(first.changed, true);
  assert.equal(first.ref, 'main');
  assert.equal(first.title, 'A change', 'the commit\'s first line, never its body');
  assert.equal(readFileSync(join(dir, 'package.json'), 'utf8'), '{"name":"ds"}');
  assert.ok(existsSync(join(dir, 'src', 'tokens.css')), 'nested files keep their place');
  assert.ok(!existsSync(join(dir, 'acme-ds-9f3a')), 'and the archive\'s wrapper is not one of them');

  const again = await syncGithub(p, { dir, env: {}, fetchImpl: answers() });
  assert.equal(again.changed, false, 'the same commit is not fetched twice');
  assert.equal(again.sha, first.sha);
});

test('a file gone on GitHub goes from the mirror, and what the engine wrote there stays', async () => {
  const dir = tempDir('gh-gone-');
  const p = parseGithubProject('https://github.com/acme/ds');
  await syncGithub(p, { dir, env: {}, fetchImpl: answers() });
  writeFileSync(join(dir, 'ds-config.json'), '{}');                       // the engine's own, not GitHub's
  const moved = { ...answers(), };
  const next = async (url) => (/\/commits\//.test(url)
    ? { ok: true, status: 200, json: async () => ({ sha: 'aaaaaaa1111111111111111111111111111111b2', commit: { message: 'Later', committer: { date: '2026-11-17T10:00:00Z' } } }) }
    : /\/tarball\//.test(url) ? { ok: true, status: 200, arrayBuffer: async () => tarball({ 'package.json': '{"name":"ds"}' }) } : answers()(url));
  const after = await syncGithub(p, { dir, env: {}, fetchImpl: next });
  assert.equal(after.changed, true, JSON.stringify(after));
  assert.equal(existsSync(join(dir, 'src', 'tokens.css')), false, 'removed on GitHub, removed here');
  assert.equal(existsSync(join(dir, 'ds-config.json')), true, 'the engine\'s own file is not GitHub\'s to remove');
  assert.ok(JSON.parse(readFileSync(join(dir, STATE_FILE), 'utf8')).files.includes('package.json'));
});

// Silence is never a pass: a run that could not reach GitHub says which commit it is reading instead.
test('GitHub unreachable reads the mirror already there, and says so', async () => {
  const dir = tempDir('gh-off-');
  const p = parseGithubProject('https://github.com/acme/ds');
  await syncGithub(p, { dir, env: {}, fetchImpl: answers() });
  const down = await syncGithub(p, { dir, env: {}, fetchImpl: async () => { throw new Error('getaddrinfo ENOTFOUND api.github.com'); } });
  assert.equal(down.stale, true);
  assert.equal(down.changed, false);
  assert.match(down.warning, /could not reach github\.com/, 'a host that cannot be reached says so, and names it');
  assert.match(saidAbout(down), /GitHub: acme\/ds@9f3a1b2 \(main\), could not reach/, 'and the run says which commit it is reading instead');

  const offline = await syncGithub(p, { dir, env: {}, fetchImpl: answers(), offline: true });
  assert.equal(offline.warning, 'not checked against GitHub this run');

  const nothing = await syncGithub(p, { dir: tempDir('gh-none-'), env: {}, fetchImpl: async () => ({ ok: false, status: 404 }) });
  assert.equal(nothing.dir, null, 'with no mirror there is nothing to read');
  assert.match(nothing.error, /a private repository needs GITHUB_TOKEN/);
});

test('what the run says names the commit it checked', async () => {
  const dir = tempDir('gh-said-');
  const r = await syncGithub(parseGithubProject('https://github.com/acme/ds'), { dir, env: {}, fetchImpl: answers() });
  assert.equal(saidAbout(r), 'GitHub: acme/ds@9f3a1b2 (main), fetched — A change');
  assert.equal(saidAbout({ ...r, changed: false }), 'GitHub: acme/ds@9f3a1b2 (main), unchanged since the last run — A change');
  assert.equal(saidAbout(null), null);
});

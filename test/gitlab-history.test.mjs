// P2: a project read from GitLab has no .git in its mirror, so its history comes through the GitLab API: each
// component's changelog (with its release and merge request), the commit behind a line, and the commit an agreement
// records. Kept per commit: nothing is asked twice, and when the branch moves only the files that moved are.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { fillHistory, blameOf, commitsOf, readHistory, missing, HISTORY_FILE } from '../gitlab-history.mjs';
import { STATE_FILE } from '../gitlab-source.mjs';
import { codeReason, reasonLine } from '../change-reason.mjs';
import { changelogs, repoUrl, defaultBranch, ruleChanges } from '../component-changelog.mjs';
import { recordAgreed } from '../agreed.mjs';

const A = 'a'.repeat(40), B = 'b'.repeat(40), C = 'c'.repeat(40), HEAD = 'd'.repeat(40), NEXT = 'e'.repeat(40);
const commit = (id, title, date, parents = 1) => ({ id, short_id: id.slice(0, 8), title, authored_date: date, author_name: 'Ana', parent_ids: Array.from({ length: parents }, (_, i) => String(i).repeat(40)) });
const ROUTES = {
  [`/repository/files/${encodeURIComponent('src/theme.css')}/blame`]: [
    { commit: commit(A, 'Add the tokens', '2026-01-01T10:00:00Z'), lines: [':root {', '  --x: 1px;'] },
    { commit: commit(B, 'Card radius from Figma', '2026-02-01T10:00:00Z'), lines: ['.card {', '  border-radius: var(--radius-m);', '}'] },
  ],
  [`/repository/files/${encodeURIComponent('src/Button.vue')}/blame`]: [{ commit: commit(C, 'Button', '2026-03-01T10:00:00Z'), lines: ['<template>', '</template>'] }],
  '/repository/commits?path=src/theme.css': [commit(B, 'Card radius from Figma', '2026-02-01T10:00:00Z'), commit(HEAD, 'Merge branch x', '2026-02-02T10:00:00Z', 2), commit(A, 'Add the tokens', '2026-01-01T10:00:00Z')],
  '/repository/commits?path=src/Button.vue': [commit(C, 'Button', '2026-03-01T10:00:00Z')],
  [`/repository/commits/${A}/diff`]: [{ old_path: 'src/theme.css', new_path: 'src/theme.css', diff: '@@ -0,0 +1,2 @@\n+:root {\n+  --x: 1px;\n' }],
  [`/repository/commits/${B}/diff`]: [{ old_path: 'src/theme.css', new_path: 'src/theme.css', diff: '@@ -3,3 +3,3 @@\n .card {\n-  border-radius: 4px;\n+  border-radius: var(--radius-m);\n }\n' }],
  [`/repository/commits/${B}/refs`]: [{ type: 'tag', name: 'v1.10.0' }, { type: 'tag', name: 'v1.2.0' }],
  [`/repository/commits/${B}/merge_requests`]: [{ iid: 12, state: 'merged' }],
  [`/repository/commits/${C}/refs`]: [],
  [`/repository/commits/${C}/merge_requests`]: [],
  [`/repository/commits/${A}/refs`]: [{ type: 'tag', name: 'v1.0.0' }],
  [`/repository/commits/${A}/merge_requests`]: [],
  '/repository/compare': { diffs: [{ old_path: 'src/Button.vue', new_path: 'src/Button.vue' }] },
};
// One stand-in GitLab: answers ROUTES, records what it was asked and with which token.
function standIn() {
  const calls = [];
  const answer = (url, token) => {
    const u = new URL(url);
    const p = u.pathname.replace(/^\/api\/v4\/projects\/[^/]+/, '');
    const key = p + (u.searchParams.get('path') ? `?path=${u.searchParams.get('path')}` : '');
    calls.push({ path: key, token });
    const route = ROUTES[key] ?? ROUTES[p];
    return route !== undefined ? { status: 200, body: route } : { status: 404, body: { message: '404 Not Found' } };
  };
  return { calls, answer };
}
const mirror = (origin, host, sha = HEAD) => {
  const dir = mkdtempSync(join(tmpdir(), 'gl-history-'));
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, STATE_FILE), JSON.stringify({ source: `${origin}/acme/ui-kit`, origin, host, path: 'acme/ui-kit', branch: null, ref: 'main', sha }));
  writeFileSync(join(dir, 'src', 'theme.css'), ':root {\n  --x: 1px;\n.card {\n  border-radius: var(--radius-m);\n}\n');
  return dir;
};

test('P2: blame, the commits of a file with a pattern, their releases and merge requests, asked once per commit', async () => {
  const gl = standIn();
  const fetchImpl = async (url, init) => { const r = gl.answer(url, init.headers?.['PRIVATE-TOKEN'] ?? null); return { ok: r.status === 200, status: r.status, json: async () => r.body }; };
  const env = { GITLAB_TOKEN: 'secret', GITLAB_HOST: 'code.acme.example' };
  const dir = mirror('https://code.acme.example', 'code.acme.example');
  const req = { blame: ['src/theme.css', 'ds-config.json'], paths: [{ path: 'src/theme.css', pattern: '\\.card[^a-zA-Z0-9_-]' }, { path: 'src/Button.vue' }] };
  await fillHistory(dir, req, { fetchImpl, env });
  assert.ok(gl.calls.every((c) => c.token === 'secret'), 'the token goes to the host GITLAB_HOST names');
  const h = readHistory(dir);
  assert.deepEqual(h.blame['src/theme.css'], [[1, 2, A], [3, 3, B]]);
  assert.equal(h.blame['ds-config.json'], null, 'not on GitLab: a file the engine wrote');
  assert.deepEqual(h.commits['src/theme.css'], [B, A], 'a merge is left out');
  assert.equal(missing(dir, req), null, 'all of it is kept');
  const before = gl.calls.length;
  await fillHistory(dir, req, { fetchImpl, env });
  assert.equal(gl.calls.length, before, 'the same commit: nothing is asked again');
  // The commits that changed the card's own rule, with what changed, its earliest release and its merge request.
  assert.deepEqual(commitsOf(dir, ['src/theme.css'], { pattern: '\\.card[^a-zA-Z0-9_-]', ruleChanges }), [
    { sha: B, short: B.slice(0, 7), date: '2026-02-01T10:00:00Z', subject: 'Card radius from Figma', release: 'v1.2.0', pr: '12', changed: ['border-radius 4px → --radius-m'] },
  ]);
  assert.deepEqual(commitsOf(dir, ['src/Button.vue']).map((r) => [r.short, r.release, r.pr]), [[C.slice(0, 7), null, null]]);
  const b = blameOf(dir, 'src/theme.css');
  assert.equal(b.get(3).subject, 'Card radius from Figma');
  assert.equal(b.get(1).date, '2026-01-01');
  assert.deepEqual(blameOf(dir, 'ds-config.json'), { uncommitted: true });
  // The branch moves: only the file GitLab says moved is asked again.
  writeFileSync(join(dir, STATE_FILE), JSON.stringify({ source: 'https://code.acme.example/acme/ui-kit', origin: 'https://code.acme.example', host: 'code.acme.example', path: 'acme/ui-kit', ref: 'main', sha: NEXT }));
  gl.calls.length = 0;
  await fillHistory(dir, req, { fetchImpl, env });
  const asked = gl.calls.map((c) => c.path);
  assert.ok(asked.some((p) => p.startsWith('/repository/compare')));
  assert.ok(asked.includes('/repository/commits?path=src/Button.vue'), 'the file that moved is asked again');
  assert.ok(!asked.some((p) => p.includes('theme.css')), 'the theme did not move: kept');
  assert.ok(!asked.some((p) => p.includes(`${B}/diff`)), 'a diff never changes: kept');
  assert.equal(readHistory(dir).sha, NEXT);
});

test('P2: the readers the engine already has read GitLab in a mirror (changelog, reason, repository, branch, agreed commit)', { timeout: 120000 }, async () => {
  // The readers are synchronous and ask GitLab from a child process, so the stand-in GitLab runs in a process of its own.
  const work = mkdtempSync(join(tmpdir(), 'gl-server-'));
  writeFileSync(join(work, 'routes.json'), JSON.stringify(ROUTES));
  writeFileSync(join(work, 'server.mjs'), `import { createServer } from 'node:http'; import { readFileSync, appendFileSync } from 'node:fs';
    const routes = JSON.parse(readFileSync(${JSON.stringify(join(work, 'routes.json'))}, 'utf8'));
    const s = createServer((req, res) => { const u = new URL(req.url, 'http://x'); const p = u.pathname.replace(/^\\/api\\/v4\\/projects\\/[^/]+/, ''); const key = p + (u.searchParams.get('path') ? '?path=' + u.searchParams.get('path') : '');
      appendFileSync(${JSON.stringify(join(work, 'calls.txt'))}, key + ' ' + (req.headers['private-token'] ?? '-') + '\\n');
      const r = routes[key] ?? routes[p]; res.writeHead(r === undefined ? 404 : 200, { 'content-type': 'application/json' }); res.end(JSON.stringify(r ?? {})); });
    s.listen(0, '127.0.0.1', () => console.log(s.address().port));`);
  const child = spawn(process.execPath, [join(work, 'server.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
  const port = await new Promise((ok) => child.stdout.once('data', (d) => ok(String(d).trim())));
  const host = `127.0.0.1:${port}`;
  const server = { close: () => child.kill() };
  const keep = { t: process.env.GITLAB_TOKEN, h: process.env.GITLAB_HOST };
  process.env.GITLAB_TOKEN = 'secret'; process.env.GITLAB_HOST = host;
  try {
    const dir = mirror(`http://${host}`, host);
    assert.equal(repoUrl(dir), `http://${host}/acme/ui-kit`);
    assert.equal(defaultBranch(dir), 'main');
    // The reason a line changed, as a finding gives it.
    assert.equal(reasonLine(codeReason(dir, 'src/theme.css:4')), 'last changed 2026-02-01 by Ana: "Card radius from Figma" (bbbbbbb)');
    // The style guide's changelog, from GitLab.
    const logs = changelogs(dir, [{ name: 'card', files: ['src/theme.css'], pattern: '\\.card[^a-zA-Z0-9_-]' }, { name: 'button', files: ['src/Button.vue'] }]);
    assert.deepEqual(logs.card.map((r) => [r.short, r.release, r.pr, r.changed]), [[B.slice(0, 7), 'v1.2.0', '12', ['border-radius 4px → --radius-m']]]);
    assert.deepEqual(logs.button.map((r) => r.subject), ['Button']);
    // The commit an agreement records: the mirror's own.
    const { agreed } = recordAgreed(dir, [{ key: 'card · radius', figma: '8px', code: '8px', same: true }]);
    assert.equal(agreed.facts['card · radius'].commit, HEAD.slice(0, 7));
    const { readdirSync, readFileSync } = await import('node:fs');
    assert.ok(readFileSync(join(work, 'calls.txt'), 'utf8').trim().split('\n').every((l) => l.endsWith(' secret')), 'every call carries the token');
    assert.ok(readdirSync(dir).includes(HISTORY_FILE));
  } finally {
    server.close();
    if (keep.t === undefined) delete process.env.GITLAB_TOKEN; else process.env.GITLAB_TOKEN = keep.t;
    if (keep.h === undefined) delete process.env.GITLAB_HOST; else process.env.GITLAB_HOST = keep.h;
  }
});

test('P2: a project that is not a GitLab mirror is never asked', () => {
  const dir = mkdtempSync(join(tmpdir(), 'not-mirror-'));
  assert.equal(blameOf(dir, 'a.css'), undefined);
  assert.equal(commitsOf(dir, ['a.css']), null);
  assert.equal(missing(dir, { blame: ['a.css'] }), null);
});

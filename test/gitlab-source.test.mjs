// The project read straight from GitLab (gitlab-source.mjs): any GitLab host, the branch's latest commit on every
// run, the token only to gitlab.com or GITLAB_HOST, the mirror kept when GitLab cannot be reached.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseGitlabProject, untar, syncGitlab, describe, mirrorDir, projectFromState, STATE_FILE } from '../gitlab-source.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));

// A minimal ustar archive, as GitLab sends it: a pax global header, then every file under "<project>-<ref>-<sha>/".
function tarOf(files, top = 'ui-kit-main-abc') {
  const blocks = [];
  const header = (name, size, type = '0') => {
    const h = Buffer.alloc(512);
    h.write(name.slice(0, 100), 0, 'utf8');
    h.write('0000644\0', 100); h.write('0000000\0', 108); h.write('0000000\0', 116);
    h.write(size.toString(8).padStart(11, '0') + '\0', 124); h.write('00000000000\0', 136);
    h.write('        ', 148); h.write(type, 156); h.write('ustar\0', 257); h.write('00', 263);
    let sum = 0; for (const b of h) sum += b;
    h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
    return h;
  };
  const pad = (b) => Buffer.concat([b, Buffer.alloc((512 - (b.length % 512)) % 512)]);
  const g = Buffer.from('52 comment=abc0000000000000000000000000000000000000\n');
  blocks.push(header('pax_global_header', g.length, 'g'), pad(g));
  for (const [name, content, type] of files) {
    const full = `${top}/${name}`;
    const data = Buffer.from(content ?? '');
    if (full.length > 100) { const body = ` path=${full}\n`; let n = body.length + 1; while (String(n).length + body.length !== n) n = String(n).length + body.length; const x = Buffer.from(`${n}${body}`); blocks.push(header('././@PaxHeader', x.length, 'x'), pad(x)); }
    blocks.push(header(full, type === '2' ? 0 : data.length, type ?? '0'));
    if (type !== '2') blocks.push(pad(data));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}

// A fake GitLab API: one project, its default branch, the head commit, the archive. Records what it was asked.
function fakeGitlab({ branch = 'main', commits, archives, status = {} }) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, token: init.headers?.['PRIVATE-TOKEN'] ?? null });
    const u = new URL(url);
    const key = Object.keys(status).find((k) => u.pathname.includes(k));
    if (key) return { ok: false, status: status[key] };
    if (/\/repository\/archive\.tar\.gz$/.test(u.pathname)) { const buf = archives[u.searchParams.get('sha')]; return { ok: true, status: 200, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) }; }
    if (/\/repository\/commits\//.test(u.pathname)) return { ok: true, status: 200, json: async () => commits[decodeURIComponent(u.pathname.split('/commits/')[1])] };
    return { ok: true, status: 200, json: async () => ({ default_branch: branch }) };
  };
  return { fetchImpl, calls };
}

test('a GitLab project link on any host: gitlab.com, a host named in GITLAB_HOST, gitlab.<domain>, or a /-/ link', () => {
  assert.deepEqual(parseGitlabProject('https://gitlab.com/acme/design/ui-kit.git', {}), { origin: 'https://gitlab.com', host: 'gitlab.com', path: 'acme/design/ui-kit', ref: null });
  assert.deepEqual(parseGitlabProject('https://code.acme.example/web/ui-kit', { GITLAB_HOST: 'https://code.acme.example/' }), { origin: 'https://code.acme.example', host: 'code.acme.example', path: 'web/ui-kit', ref: null });
  assert.equal(parseGitlabProject('https://gitlab.acme.example/web/ui-kit', {}).path, 'web/ui-kit');
  assert.deepEqual(parseGitlabProject('https://code.acme.example/web/ui-kit/-/tree/feature/new-tokens', {}), { origin: 'https://code.acme.example', host: 'code.acme.example', path: 'web/ui-kit', ref: 'feature/new-tokens' });
  assert.equal(parseGitlabProject('https://github.com/acme/ui-kit', {}), null, 'GitHub stays with git clone');
  assert.equal(parseGitlabProject('https://code.acme.example/web/ui-kit', {}), null, 'an unknown host without a GitLab sign is a plain git link');
  assert.equal(parseGitlabProject('git@gitlab.com:acme/ui-kit.git', {}), null, 'SSH stays with git clone');
  assert.equal(parseGitlabProject('https://user:secret@gitlab.com/acme/ui-kit', {}), null, 'a link carrying credentials is never used');
  assert.equal(parseGitlabProject('https://gitlab.com/acme', {}), null, 'a group is not a project');
});

test('the archive: the top folder dropped, long names kept, links and paths leaving the folder skipped', () => {
  const long = `src/${'deep/'.repeat(22)}theme.css`;
  const files = untar(Buffer.from(gunzipSync(tarOf([['package.json', '{}'], [long, ':root{}'], ['link.css', '', '2'], ['../escape.txt', 'x']]))));
  assert.deepEqual(files.map((f) => f.path), ['package.json', long]);
  assert.equal(files[1].data.toString(), ':root{}');
});

test('first run: the default branch\'s latest commit is fetched into a mirror beside where the engine runs', async () => {
  const from = mkdtempSync(join(tmpdir(), 'gl-from-'));
  const p = parseGitlabProject('https://gitlab.com/acme/ui-kit', {});
  const gl = fakeGitlab({ commits: { main: { id: 'a'.repeat(40), title: 'Release 2', committed_date: '2026-01-02T10:00:00Z' } }, archives: { ['a'.repeat(40)]: tarOf([['package.json', '{"name":"ui-kit"}'], ['src/theme.css', ':root { --a: #fff; }'], [STATE_FILE, '{"origin":"https://evil.example","host":"evil.example","path":"x/y"}']]) } });
  const r = await syncGitlab(p, { from, env: { GITLAB_TOKEN: 'glpat-test' }, fetchImpl: gl.fetchImpl });
  assert.equal(r.dir, mirrorDir(from, p));
  assert.equal(r.changed, true);
  assert.equal(readFileSync(join(r.dir, 'src', 'theme.css'), 'utf8'), ':root { --a: #fff; }');
  const st = JSON.parse(readFileSync(join(r.dir, STATE_FILE), 'utf8'));
  assert.equal(st.sha, 'a'.repeat(40)); assert.equal(st.ref, 'main'); assert.equal(st.branch, null);
  assert.ok(!JSON.stringify(st).includes('glpat-test'), 'the token is never written');
  assert.ok(gl.calls.every((c) => c.token === 'glpat-test'), 'gitlab.com gets the token');
  assert.match(describe(r), /acme\/ui-kit @ main aaaaaaaa \(2026-01-02\) - fetched/);
  assert.deepEqual(projectFromState(r.dir), p, 'a record committed in the project never replaces the mirror\'s own');
});

test('every later run asks for the latest commit: unchanged, nothing is downloaded; moved, the mirror follows it', async () => {
  const from = mkdtempSync(join(tmpdir(), 'gl-from-'));
  const p = parseGitlabProject('https://gitlab.com/acme/ui-kit', {});
  const A = 'a'.repeat(40), B = 'b'.repeat(40);
  const commits = { main: { id: A, title: 'one' } };
  const gl = fakeGitlab({ commits, archives: { [A]: tarOf([['package.json', '{}'], ['src/old.css', 'a{}'], ['src/keep.css', 'b{}']]), [B]: tarOf([['package.json', '{}'], ['src/keep.css', 'b2{}']]) } });
  const first = await syncGitlab(p, { from, env: {}, fetchImpl: gl.fetchImpl });
  writeFileSync(join(first.dir, 'ds-config.json'), '{}');                    // written by the engine, not on GitLab
  gl.calls.length = 0;
  const same = await syncGitlab(p, { from, env: {}, fetchImpl: gl.fetchImpl });
  assert.equal(same.changed, false);
  assert.ok(!gl.calls.some((c) => c.url.includes('archive')), 'no download when the commit is the same');
  commits.main = { id: B, title: 'two' };
  const moved = await syncGitlab(p, { from, env: {}, fetchImpl: gl.fetchImpl });
  assert.equal(moved.changed, true); assert.equal(moved.previous, A);
  assert.ok(!existsSync(join(first.dir, 'src', 'old.css')), 'removed on GitLab, removed here');
  assert.equal(readFileSync(join(first.dir, 'src', 'keep.css'), 'utf8'), 'b2{}');
  assert.ok(existsSync(join(first.dir, 'ds-config.json')), 'the engine\'s own files are kept');
  assert.match(describe(moved), /fetched \(was aaaaaaaa\)/);
});

test('a branch in the link is followed instead of the default one', async () => {
  const from = mkdtempSync(join(tmpdir(), 'gl-from-'));
  const p = parseGitlabProject('https://gitlab.com/acme/ui-kit/-/tree/release/v2', {});
  const C = 'c'.repeat(40);
  const gl = fakeGitlab({ commits: { 'release/v2': { id: C } }, archives: { [C]: tarOf([['package.json', '{}']]) } });
  const r = await syncGitlab(p, { from, env: {}, fetchImpl: gl.fetchImpl });
  assert.equal(r.ref, 'release/v2');
  assert.ok(!gl.calls.some((c) => /\/projects\/[^/]+$/.test(new URL(c.url).pathname)), 'no need to ask for the default branch');
  assert.equal(projectFromState(r.dir).ref, 'release/v2');
});

test('the token goes only to gitlab.com or a host named in GITLAB_HOST, and is never in a message', async () => {
  const from = mkdtempSync(join(tmpdir(), 'gl-from-'));
  const p = parseGitlabProject('https://gitlab.acme.example/web/ui-kit', {});
  const gl = fakeGitlab({ commits: {}, archives: {}, status: { '/projects/': 404 } });
  const r = await syncGitlab(p, { from, env: { GITLAB_TOKEN: 'glpat-secret' }, fetchImpl: gl.fetchImpl });
  assert.ok(gl.calls.every((c) => c.token === null), 'not sent to a host nobody named');
  assert.match(r.error, /GITLAB_HOST=gitlab\.acme\.example/);
  assert.ok(!describe(r).includes('glpat-secret'));
  const allowed = fakeGitlab({ commits: {}, archives: {}, status: { '/projects/': 401 } });
  const r2 = await syncGitlab(p, { from, env: { GITLAB_TOKEN: 'glpat-secret', GITLAB_HOST: 'gitlab.acme.example' }, fetchImpl: allowed.fetchImpl });
  assert.ok(allowed.calls.every((c) => c.token === 'glpat-secret'));
  assert.match(r2.error, /401/); assert.ok(!r2.error.includes('glpat-secret'));
});

test('GITLAB_TOKEN and GITLAB_HOST are read from a .env beside the mirror or where the engine runs', async () => {
  const from = mkdtempSync(join(tmpdir(), 'gl-from-'));
  writeFileSync(join(from, '.env'), 'GITLAB_TOKEN="glpat-env" # read only\nGITLAB_HOST=code.acme.example\n');
  const p = parseGitlabProject('https://code.acme.example/web/ui-kit/-/tree/main', {});
  const D = 'd'.repeat(40);
  const gl = fakeGitlab({ commits: { main: { id: D } }, archives: { [D]: tarOf([['package.json', '{}']]) } });
  const r = await syncGitlab(p, { from, env: {}, fetchImpl: gl.fetchImpl });
  assert.equal(r.sha, D);
  assert.ok(gl.calls.every((c) => c.token === 'glpat-env'));
});

test('GitLab out of reach: the mirror already there is checked, and the run says which commit it is', async () => {
  const from = mkdtempSync(join(tmpdir(), 'gl-from-'));
  const p = parseGitlabProject('https://gitlab.com/acme/ui-kit', {});
  const E = 'e'.repeat(40);
  const gl = fakeGitlab({ commits: { main: { id: E, committed_date: '2026-03-04T00:00:00Z' } }, archives: { [E]: tarOf([['package.json', '{}']]) } });
  await syncGitlab(p, { from, env: {}, fetchImpl: gl.fetchImpl });
  const down = await syncGitlab(p, { from, env: {}, fetchImpl: async () => { throw new Error('getaddrinfo ENOTFOUND'); } });
  assert.equal(down.stale, true); assert.equal(down.sha, E);
  assert.match(describe(down), /could not reach gitlab\.com - checking the copy of acme\/ui-kit @ main eeeeeeee/);
  const none = await syncGitlab(p, { from: mkdtempSync(join(tmpdir(), 'gl-none-')), env: {}, fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal(none.dir, null); assert.match(none.error, /could not reach/);
});

test('the engine run end to end: --project=<GitLab link> sets up the mirror, remembers it, and every run refreshes it', { timeout: 120000 }, async () => {
  const F = 'f'.repeat(40);
  let head = F;
  const archives = { [F]: tarOf([['package.json', '{"name":"ui-kit"}'], ['src/theme.css', ':root { --a: #fff; }']]) };
  const seen = [];
  const server = createServer((req, res) => {
    seen.push({ url: req.url, token: req.headers['private-token'] ?? null });
    const u = new URL(req.url, 'http://x');
    if (u.pathname.endsWith('/repository/archive.tar.gz')) { res.end(archives[u.searchParams.get('sha')]); return; }
    res.setHeader('content-type', 'application/json');
    if (u.pathname.includes('/repository/commits/')) { res.end(JSON.stringify({ id: head, title: 'Release', committed_date: '2026-05-06T07:08:09Z' })); return; }
    res.end(JSON.stringify({ default_branch: 'main' }));
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const host = `127.0.0.1:${server.address().port}`;
  const from = mkdtempSync(join(tmpdir(), 'gl-run-'));
  writeFileSync(join(from, '.env'), `GITLAB_TOKEN=glpat-run\nGITLAB_HOST=${host}\n`);
  const run = (args) => new Promise((ok) => { const p = spawn(process.execPath, [join(ENGINE, 'audit.mjs'), ...args], { cwd: from, env: { ...process.env, NO_COLOR: '1', GITLAB_TOKEN: '', GITLAB_HOST: '', DESIGN_SYSTEM_ENGINE_NO_AUTO_UPDATE: '1' } }); let out = ''; p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; }); p.on('close', (code) => ok({ code, out })); });
  try {
    const r = await run(['--init', '--figma-url=https://www.figma.com/design/AbCdEf123456XyZ/X', '--no-hooks', `--project=http://${host}/acme/ui-kit`]);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /🦊 GitLab: acme\/ui-kit @ main ffffffff \(2026-05-06\) - fetched/);
    assert.ok(existsSync(join(from, 'ui-kit', 'ds-config.json')), 'set up in the mirror');
    assert.ok(seen.every((s) => s.token === 'glpat-run'), 'the token from .env, sent to the host it names');
    assert.ok(!r.out.includes('glpat-run'), 'the token is never printed');
    const quick = await run(['--version']);
    assert.match(quick.out, /not checked against GitLab this run - checking the copy of acme\/ui-kit @ main ffffffff/, 'a print-only command does not call GitLab');
    head = '1'.repeat(40); archives[head] = tarOf([['package.json', '{"name":"ui-kit"}'], ['src/theme.css', ':root { --a: #000; }']]);
    const again = await run(['--init', '--figma-url=https://www.figma.com/design/AbCdEf123456XyZ/X', '--no-hooks']);
    assert.match(again.out, /fetched \(was ffffffff\)/, 'a remembered GitLab project is brought up to date before the run');
    assert.equal(readFileSync(join(from, 'ui-kit', 'src', 'theme.css'), 'utf8'), ':root { --a: #000; }');
  } finally { server.close(); }
});

// guide-freshness.mjs: is the style guide the team opens behind what it is built from? An invented company (Acme): its
// style guide store, its code and a snapshots store on a fake GitLab.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { freshness, builtFrom, BUILT_FROM } from '../guide-freshness.mjs';
import { forgetAccess } from '../stores.mjs';
import { tempDir } from './helpers.mjs';

const HOST = 'gitlab.acme.test';
const env = { GITLAB_TOKEN: 'read-token', GITLAB_HOST: HOST };
const GUIDE = `https://${HOST}/design/acme-guide`;
const cfg = { stores: { styleguide: { write: { gitlab: GUIDE } }, snapshots: { read: { gitlab: GUIDE, path: 'snapshots' } } } };

function fakeGitlab({ record = null, heads = { snapshots: 'a'.repeat(40) }, pipelines = null, publishes = [] } = {}) {
  const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, arrayBuffer: async () => { const b = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); } });
  const base = `https://${HOST}/api/v4/projects/${encodeURIComponent('design/acme-guide')}`;
  const get = async (url) => {
    if (!url.startsWith(base)) return res(404, {});
    const u = new URL(url), path = decodeURIComponent(url.slice(base.length).split('?')[0]);
    if (path === '') return res(200, { default_branch: 'main' });
    if (path === `/repository/files/${BUILT_FROM}/raw`) return record ? res(200, JSON.stringify(record)) : res(404, {});
    if (path === '/repository/commits') return u.searchParams.get('path') === 'snapshots' ? res(200, [{ id: heads.snapshots }]) : res(200, publishes);
    if (path === '/pipelines') return pipelines ? res(200, pipelines) : res(403, {});
    return res(404, {});
  };
  return { http: { get, send: async () => res(404, {}) }, get: (url) => get(url) };
}
const dir = () => tempDir('freshness-');

test('published from what is there now: up to date, nothing said', async () => {
  forgetAccess();
  const g = fakeGitlab({ record: builtFrom({ 'snapshots:snapshots': 'a'.repeat(40), 'the engine': 'e1' }) });
  const r = await freshness(dir(), cfg, { ...g, env, engine: 'e1', force: true });
  assert.equal(r.behind, false);
  assert.deepEqual(r.lines, []);
});

test('a new engine and a snapshot refreshed since: behind, said with what moved and when it was published', async () => {
  forgetAccess();
  const g = fakeGitlab({ record: { publishedAt: '2026-10-20T10:00:00Z', sources: { 'snapshots:snapshots': 'b'.repeat(40), 'the engine': 'e1' } } });
  const r = await freshness(dir(), cfg, { ...g, env, engine: 'e2', force: true });
  assert.equal(r.behind, true);
  assert.deepEqual(r.moved.map((m) => m.what).sort(), ['snapshots:snapshots', 'the engine']);
  assert.match(r.lines[0], /is behind, published 2026-10-20: .*the engine e1 → e2/);
});

test('published before the record existed: behind, dated by its last publish commit', async () => {
  forgetAccess();
  const g = fakeGitlab({ publishes: [{ title: 'Readme', created_at: '2026-10-25T09:00:00Z' }, { title: 'Style guide published with rms-design-system-engine', created_at: '2026-10-24T09:00:00Z' }] });
  const r = await freshness(dir(), cfg, { ...g, env, engine: 'e1', force: true });
  assert.equal(r.behind, true);
  assert.match(r.lines[0], /published 2026-10-24: it was published before the engine kept what it was built from/);
});

test('a pipeline waiting for a runner, or failing, is said where the token may read it', async () => {
  forgetAccess();
  const old = new Date(Date.now() - 80 * 60e3).toISOString();
  const g = fakeGitlab({ record: builtFrom({ 'snapshots:snapshots': 'a'.repeat(40), 'the engine': 'e1' }), pipelines: [{ iid: 900, status: 'pending', created_at: old, updated_at: old }] });
  const r = await freshness(dir(), cfg, { ...g, env, engine: 'e1', force: true });
  assert.match(r.lines[0], /up to date, but its last pipeline \(#900\) has waited 8\d minutes for a runner/);
});

test('asked at most every few hours, unless forced; nothing without a style guide store', async () => {
  forgetAccess();
  const root = dir();
  const g = fakeGitlab({ record: builtFrom({ 'snapshots:snapshots': 'a'.repeat(40) }) });
  await freshness(root, cfg, { ...g, env, force: true });
  assert.equal((await freshness(root, cfg, { ...g, env })).why, 'asked recently');
  assert.ok((await freshness(root, cfg, { ...g, env, force: true })).lines);
  assert.match((await freshness(dir(), { stores: {} }, { ...g, env })).why, /no style guide store/);
});

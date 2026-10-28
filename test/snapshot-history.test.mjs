// snapshot-history.mjs: each read of Figma a team sent to its snapshots store, as each component's Figma history,
// read from the store's commits when the project has no git history of its snapshots.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fillSnapshotHistory, storeFigmaChangelogs } from '../snapshot-history.mjs';
import { tempDir } from './helpers.mjs';

const HOST = 'gitlab.acme.test';
const env = { GITLAB_TOKEN: 'read-token', GITLAB_HOST: HOST };
const cfg = { stores: { snapshots: { read: { gitlab: `https://${HOST}/design/snapshots`, path: 'snapshots' } } } };
const props = (opts) => JSON.stringify({ tile: { properties: { 'Size#1:0': { type: 'VARIANT', variantOptions: opts, defaultValue: opts[0] } } } });
const vars = (c) => JSON.stringify({ light: { 'tile/background': c } });

// A store with three refreshes: the first read, one that changed the tile, one that changed nothing of it.
function fakeStore() {
  const base = `https://${HOST}/api/v4/projects/${encodeURIComponent('design/snapshots')}`;
  const P = 'snapshots/src/props.json', V = 'snapshots/src/vars.json';
  const at = {
    c1: { [P]: props(['S']), [V]: vars('#fff') },
    c2: { [P]: props(['S', 'M']), [V]: vars('#f7f7f7') },
    c3: { [P]: props(['S', 'M']), [V]: vars('#f7f7f7') },
  };
  const commits = [['c3', '2026-10-27T10:00:00Z', 'Snapshots refreshed (a11y)'], ['c2', '2026-10-26T10:00:00Z', 'Snapshots refreshed'], ['c1', '2026-10-24T10:00:00Z', 'Snapshots refreshed']];
  const calls = [];
  const res = (status, body) => ({ ok: status < 300, status, json: async () => body, arrayBuffer: async () => { const b = Buffer.from(body); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); } });
  const get = async (url, { headers = {} } = {}) => {
    calls.push(url);
    if (headers['PRIVATE-TOKEN'] !== 'read-token' || !url.startsWith(base)) return res(404, {});
    const u = new URL(url), path = decodeURIComponent(url.slice(base.length).split('?')[0]);
    if (path === '') return res(200, { default_branch: 'main' });
    if (path === '/repository/commits') {
      // The props file changed in every commit; the vars file only in the first two.
      const file = u.searchParams.get('path');
      return res(200, commits.filter(([sha]) => file === P || sha !== 'c3').map(([id, d, title]) => ({ id, short_id: id, committed_date: d, title, web_url: `https://${HOST}/design/snapshots/-/commit/${id}` })));
    }
    const raw = /^\/repository\/files\/(.+)\/raw$/.exec(path);
    if (raw) { const f = at[u.searchParams.get('ref')]?.[raw[1]]; return f ? res(200, f) : res(404, {}); }
    return res(404, {});
  };
  return { calls, http: { get, send: async () => res(404, {}) } };
}

test('a store\'s refreshes become each component\'s Figma history, newest first, linked to the store\'s commit', async () => {
  const ROOT = tempDir('snap-history-');
  const g = fakeStore();
  const r = await fillSnapshotHistory(ROOT, cfg, { props: 'src/props.json', vars: 'src/vars.json' }, { env, http: g.http });
  assert.deepEqual(r, { read: 3, line: null });
  const log = storeFigmaChangelogs(ROOT, ['tile', 'gone']).tile;
  assert.deepEqual(log.map((x) => [x.sha, x.changed]), [
    ['c2', ['property Size VARIANT · S · S → VARIANT · S, M · S', 'tile/background light #fff → #f7f7f7']],
    ['c1', ['read from Figma for the first time']],
  ], 'a refresh that changed nothing of it is not in its history');
  assert.equal(log[0].url, `https://${HOST}/design/snapshots/-/commit/c2`);
  assert.equal(log[0].subject, 'Snapshots refreshed');
  assert.equal(storeFigmaChangelogs(ROOT, ['gone']).gone, undefined, 'a component Figma never had has none');
  // A commit is read once: the next run asks for the list of commits only.
  g.calls.length = 0;
  assert.deepEqual(await fillSnapshotHistory(ROOT, cfg, { props: 'src/props.json', vars: 'src/vars.json' }, { env, http: g.http }), { read: 0, line: null });
  assert.equal(g.calls.filter((u) => u.includes('/raw')).length, 0);
});

test('no store, offline or GitLab refusing: no history and nothing thrown', async () => {
  const ROOT = tempDir('snap-history-');
  const g = fakeStore();
  assert.deepEqual(await fillSnapshotHistory(ROOT, {}, { props: 'src/props.json' }, { env, http: g.http }), { read: 0, line: null });
  assert.deepEqual(await fillSnapshotHistory(ROOT, cfg, { props: 'src/props.json' }, { env, http: g.http, offline: true }), { read: 0, line: null });
  assert.equal(g.calls.length, 0, 'offline, GitLab is never asked');
  const r = await fillSnapshotHistory(ROOT, cfg, { props: 'src/props.json' }, { env: { ...env, GITLAB_TOKEN: 'other' }, http: g.http });
  assert.match(r.line, /^Figma history not read from https:\/\/gitlab\.acme\.test\/design\/snapshots/);
  assert.deepEqual(storeFigmaChangelogs(ROOT, ['tile']), {});
});

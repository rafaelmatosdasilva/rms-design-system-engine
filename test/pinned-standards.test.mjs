// Every outside fact the engine pins, and whether anything asks if it moved. Nothing here reaches the network: each
// source is given in. One test does read the engine's own files, because a list of pins that no longer match the
// repository is the failure this whole thing exists to prevent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PINNED, pinnedNow, newestOf, askAll, staleLines, issueBody, isNewer, monthsSince, ISSUE_TITLE } from '../lib/pinned-standards.mjs';
import { tempDir } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const answering = (by) => async (url) => { const hit = Object.entries(by).find(([k]) => url.includes(k)); return hit ? { ok: true, json: async () => hit[1] } : { ok: false, status: 404 }; };

test('every pin in the list is read from the engine as it is now', () => {
  const now = pinnedNow(ENGINE);
  assert.equal(now.length, PINNED.length);
  const unread = now.filter((p) => p.pinned === null);
  assert.deepEqual(unread, [], unread.map((p) => `${p.id}: ${p.why}`).join('\n'));
});

test('a pin whose line was renamed is said, never passed over as up to date', () => {
  const dir = tempDir('pins-');
  mkdirSync(join(dir, 'lib'), { recursive: true });
  writeFileSync(join(dir, 'lib', 'thing.mjs'), "export const RENAMED = '1.0.0';\n");
  const list = [{ id: 'thing', what: 'a thing', file: 'lib/thing.mjs', reads: /^export const THING = '([^']+)';$/m, ask: { kind: 'npm', name: 'thing' } }];
  const [read] = pinnedNow(dir, list);
  assert.equal(read.pinned, null);
  assert.match(read.why, /no longer has the line this reads the pin from/);
  assert.deepEqual(pinnedNow(dir, [{ ...list[0], file: 'lib/gone.mjs' }])[0].why, 'lib/gone.mjs is not there');
});

test('one version is newer than another by its numbers, never by its text', () => {
  assert.equal(isNewer('4.14.1', '4.10.2'), true, '14 is after 10, though "4.14.1" sorts before "4.10.2" as text');
  assert.equal(isNewer('v0.24.0', '0.23.1'), true, 'a tag written with a v');
  assert.equal(isNewer('2.1.0', '2.1.0'), false);
  assert.equal(isNewer('1.9.0', '1.10.0'), false);
});

test('a source is asked and the answer is the pin\'s own verdict', async (t) => {
  const list = [{ id: 'axe', what: 'rules', file: 'lib/a.mjs', reads: /x/, ask: { kind: 'npm', name: 'axe-core' } }];
  const behind = await newestOf({ ...list[0], pinned: '4.10.2' }, { fetchImpl: answering({ 'registry.npmjs.org': { version: '4.14.1' } }) });
  assert.deepEqual(behind, { latest: '4.14.1', behind: true, why: null });

  const level = await newestOf({ ...list[0], pinned: '4.14.1' }, { fetchImpl: answering({ 'registry.npmjs.org': { version: '4.14.1' } }) });
  assert.equal(level.behind, false);

  const tags = await newestOf({ id: 'd', pinned: '0.23.1', ask: { kind: 'github-tags', repo: 'acme/spec' } },
    { fetchImpl: answering({ 'api.github.com': [{ name: 'v0.9.0' }, { name: 'v0.24.0' }, { name: 'nightly' }] }) });
  assert.deepEqual(tags, { latest: '0.24.0', behind: true, why: null }, 'the newest tag that is a version, and never one that is not');
});

test('a source that cannot be reached, or answers badly, is said and never read as up to date', async () => {
  const down = await newestOf({ id: 'a', pinned: '1.0.0', ask: { kind: 'npm', name: 'a' } }, { fetchImpl: async () => { throw new Error('getaddrinfo ENOTFOUND registry.npmjs.org'); } });
  assert.equal(down.behind, false);
  assert.match(down.why, /could not be reached: getaddrinfo ENOTFOUND/);
  const bad = await newestOf({ id: 'a', pinned: '1.0.0', ask: { kind: 'npm', name: 'a' } }, { fetchImpl: async () => ({ ok: false, status: 503 }) });
  assert.equal(bad.why, 'the registry answered 503');
});

// A curated table has no version at all, only the month it was read. Left out of the list it would be the one thing
// nothing ever revisited.
test('a pin that is a date is behind by its age, counted in whole months', () => {
  assert.equal(monthsSince('November 2026', new Date('2027-05-02T00:00:00Z')), 6);
  assert.equal(monthsSince('November 2026', new Date('2026-11-30T00:00:00Z')), 0);
  assert.equal(monthsSince('not a month', new Date()), null);
  assert.equal(monthsSince('December 2026', new Date('2027-01-15T00:00:00Z')), 1, 'across a year');
});

test('a date pin that is old enough is behind, and one that is not says how long it has', async () => {
  const entry = { id: 'table', pinned: 'November 2026', ask: { kind: 'age', months: 6 } };
  const fresh = await newestOf(entry, { now: new Date('2026-12-01T00:00:00Z') });
  assert.equal(fresh.behind, false);
  assert.equal(fresh.why, 'read 1 month ago, and it is read again every 6');
  const old = await newestOf(entry, { now: new Date('2027-06-01T00:00:00Z') });
  assert.equal(old.behind, true);
  assert.equal(old.why, 'read 7 months ago, and it is read again every 6');
});

test('a pin with no source to ask is kept and reported as unwatched, never dropped from the list', async () => {
  const dir = tempDir('pins-none-');
  mkdirSync(join(dir, 'lib'), { recursive: true });
  writeFileSync(join(dir, 'lib', 'f.mjs'), "export const F = '0.39.0';\n");
  const list = [{ id: 'frozen', what: 'a format', file: 'lib/f.mjs', reads: /^export const F = '([^']+)';$/m, ask: { kind: 'none', why: 'the engine records no source for it' } }];
  const state = await askAll(dir, { list, fetchImpl: async () => { throw new Error('nothing is asked'); } });
  assert.equal(state[0].behind, false);
  const said = staleLines(state).join('\n');
  assert.match(said, /1 pinned standard nothing can ask about/);
  assert.match(said, /\*\*frozen\*\*.*`0\.39\.0`.*the engine records no source for it/);
});

test('what it says: the ones behind first, then the ones nothing can ask about, then the rest in one line', () => {
  const state = [
    { id: 'axe', what: 'rules', file: 'lib/a.mjs', pinned: '4.10.2', latest: '4.14.1', behind: true, why: null, ask: { kind: 'npm' } },
    { id: 'spec', what: 'a format', file: 'lib/s.mjs', pinned: '0.39.0', latest: null, behind: false, why: 'no source', ask: { kind: 'none', why: 'no source' } },
    { id: 'dsds', what: 'a schema', file: 'lib/d.mjs', pinned: '0.23.1', latest: '0.23.1', behind: false, why: null, ask: { kind: 'github-tags' } },
  ];
  assert.deepEqual(staleLines(state), [
    '1 pinned standard is behind:',
    '- **axe** (rules): pinned at `4.10.2`, newest is `4.14.1` · lib/a.mjs',
    '1 pinned standard nothing can ask about:',
    '- **spec** (a format): pinned at `0.39.0` · lib/s.mjs · no source',
    '1 other up to date: dsds `0.23.1`',
  ]);
  assert.deepEqual(staleLines([state[2]]), ['1 other up to date: dsds `0.23.1`'], 'nothing behind says only that');

  const body = issueBody(state, 'acme/engine');
  assert.match(body, /1 of the 3 outside standards this engine pins has moved/);
  assert.match(body, /a pull request that says what passed/);
  assert.ok(ISSUE_TITLE.length < 60, 'one issue, found again by its title');
});

// A new major of what the suite proves the engine against, found every week rather than bumped every day. Nothing here
// reaches the network: the registry is given in. The tests that read the engine's own files hold Dependabot's file and
// the watch to one list, since a folder left out of one is a major nobody sees, or a bump that fails.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WATCHED, NOT_ASKED, majorOf, pinsOf, majorsLeftOut, newestMajor, askAll, lines, issueBody, ISSUE_TITLE } from '../lib/test-tool-majors.mjs';
import { tempDir } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const DEPENDABOT = readFileSync(join(ENGINE, '.github', 'dependabot.yml'), 'utf8');
const registry = (versions) => async (url) => {
  const name = decodeURIComponent(url.split('registry.npmjs.org/')[1].replace(/\/latest$/, ''));
  return name in versions ? { ok: true, json: async () => ({ version: versions[name] }) } : { ok: false, status: 404 };
};

test('every test tool folder with a lockfile is one Dependabot keeps up to date', () => {
  const folders = readdirSync(join(ENGINE, 'test')).filter((d) => /^\.[\w-]+-tools$/.test(d) && existsSync(join(ENGINE, 'test', d, 'package-lock.json')));
  const watched = [...DEPENDABOT.matchAll(/^    directory: (\S+)$/gm)].map((m) => m[1]);
  const missing = folders.filter((d) => !watched.includes(`/test/${d}`));
  assert.deepEqual(missing, [], `no Dependabot entry for ${missing.join(', ')}: its fixes never come`);
});

test('the folders whose majors Dependabot leaves out are exactly the ones the watch asks about, or say why not', () => {
  const left = majorsLeftOut(DEPENDABOT);
  const asked = [...WATCHED, ...NOT_ASKED].map((f) => `/${f.folder}`).sort();
  assert.deepEqual(Object.keys(left).sort(), asked, 'a major left out with nothing asking about it is never seen, and one asked about but still bumped fails');
  for (const f of WATCHED) {
    const out = left[`/${f.folder}`];
    assert.deepEqual(out === '*' ? null : out, f.only ?? null, `${f.folder}: the watch asks about what Dependabot leaves out, no more and no less`);
  }
});

test('every watched folder has dependencies the watch can read a major from', () => {
  for (const f of WATCHED) {
    const pins = pinsOf(ENGINE, f);
    assert.ok(pins.length, `${f.folder} has nothing to watch`);
    const unread = pins.filter((p) => p.pinned === null);
    assert.deepEqual(unread, [], unread.map((p) => `${p.folder} ${p.name}: ${p.why ?? p.range}`).join('\n'));
  }
});

test('a major is read from every way a range is written', () => {
  assert.equal(majorOf('15'), 15);
  assert.equal(majorOf('^4.6.4'), 4);
  assert.equal(majorOf('~2.1.0'), 2);
  assert.equal(majorOf('5.0.1'), 5);
  assert.equal(majorOf('0.7'), 0);
  assert.equal(majorOf('latest'), null);
});

test('only a newer major is behind: a minor or a patch is Dependabot\'s, and an older major is nothing', async () => {
  const pin = { folder: 'test/.next-tools', name: 'next', range: '15', pinned: 15 };
  assert.deepEqual(await newestMajor(pin, { fetchImpl: registry({ next: '16.4.6' }) }), { latest: '16.4.6', behind: true, why: null });
  assert.equal((await newestMajor(pin, { fetchImpl: registry({ next: '15.9.0' }) })).behind, false);
  assert.equal((await newestMajor({ ...pin, name: '@angular/core' }, { fetchImpl: registry({ '@angular/core': '14.0.0' }) })).behind, false);
});

test('a registry that cannot be reached, or answers badly, is said and never read as up to date', async () => {
  const pin = { folder: 'test/.vue-tools', name: 'vue', range: '3', pinned: 3 };
  const down = await newestMajor(pin, { fetchImpl: async () => { throw new Error('getaddrinfo ENOTFOUND registry.npmjs.org'); } });
  assert.equal(down.behind, false);
  assert.match(down.why, /could not be reached: getaddrinfo ENOTFOUND/);
  assert.equal((await newestMajor(pin, { fetchImpl: registry({}) })).why, 'the registry answered 404');
});

test('a folder\'s every dependency is asked, or only the ones named', async () => {
  const dir = tempDir('majors-');
  mkdirSync(join(dir, 'test', '.acme-tools'), { recursive: true });
  writeFileSync(join(dir, 'test', '.acme-tools', 'package.json'), JSON.stringify({ dependencies: { acme: '2', helper: '^1.4.0' }, devDependencies: { checker: '6' } }));
  const list = [{ folder: 'test/.acme-tools', what: 'the Acme app' }];
  const state = await askAll(dir, { list, fetchImpl: registry({ acme: '3.0.1', helper: '1.9.0', checker: '6.2.0' }) });
  assert.deepEqual(state.map((s) => [s.name, s.behind]), [['acme', true], ['helper', false], ['checker', false]]);
  const one = await askAll(dir, { list: [{ ...list[0], only: ['checker'] }], fetchImpl: registry({ checker: '7.0.0' }) });
  assert.deepEqual(one.map((s) => [s.name, s.behind]), [['checker', true]]);
  assert.match(pinsOf(dir, { folder: 'test/.gone-tools' })[0].why, /cannot be read/);
});

test('what it says: the new majors by folder, then what could not be asked, then a count', () => {
  const state = [
    { folder: 'test/.next-tools', name: 'next', pinned: 15, latest: '16.4.6', behind: true, why: null, what: 'the Next.js app' },
    { folder: 'test/.vue-tools', name: 'vue', pinned: 3, latest: null, behind: false, why: 'the registry answered 503', what: 'the Vue app' },
    { folder: 'test/.vue-tools', name: 'vite', pinned: 8, latest: '8.1.0', behind: false, why: null, what: 'the Vue app' },
  ];
  assert.deepEqual(lines(state), [
    '1 new major the suite does not prove:',
    '- **next 16** (newest `16.4.6`) · test/.next-tools pins 15, for the Next.js app',
    '1 that could not be asked:',
    '- **vue** · test/.vue-tools · the registry answered 503',
    '1 other on the newest major.',
  ]);
  const body = issueBody(state, 'acme/engine');
  assert.match(body, /proven beside the one before/);
  assert.match(body, /never a bump/);
  assert.ok(ISSUE_TITLE.length < 60, 'one issue, found again by its title');
});

test('the weekly job asks it, apart from the pinned standards, so one behind never stops the other', () => {
  const wf = readFileSync(join(ENGINE, '.github', 'workflows', 'pinned-standards.yml'), 'utf8');
  assert.match(wf, /node lib\/test-tool-majors\.mjs check/);
  const jobs = wf.split(/\n  (?=[\w-]+:\n    runs-on)/).filter((j) => /runs-on/.test(j));
  assert.equal(jobs.length, 2, 'two jobs, since each exits 1 when something is behind');
});

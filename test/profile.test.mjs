// profile.mjs - a company's setup, kept by its maintainers and read by everyone: where each part lives, never a token,
// never what one person set for themself, never whether they may write. And the command a team installs. An invented
// company (Acme).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { exportProfile, applyProfile, readProfile, refreshProfile, writeCommand, commandName, validate, PROFILE_FILE } from '../profile.mjs';

const HOST = 'gitlab.acme.test';
const mine = {
  name: 'Acme DS', figmaFileKey: 'KEY1', paths: { snapshotVars: 'src/figma-vars.snapshot.json' },
  intentLayer: { gitlab: `https://${HOST}/design/intent`, autoFix: 'commit', draftModel: 'small' },
  codeRoots: ['/Users/someone/acme'], styleguide: { out: 'site/index.html', modules: [{ path: '~/mod' }] },
  webhook: { url: 'https://hooks.acme.test/x', secret: 's3' }, figma: { token: 'figd_x', apiKey: 'k' },
  stores: { snapshots: { read: { gitlab: `https://${HOST}/design/snapshots`, tokenEnv: 'ACME_SNAPSHOTS_TOKEN' } } },
};

test('an exported profile holds the shared setup and the stores: no token, nothing one person set', () => {
  const p = exportProfile(mine, { name: 'Acme', project: `https://${HOST}/web/library` });
  const text = JSON.stringify(p);
  assert.equal(p.profile, 1);
  assert.equal(p.project, `https://${HOST}/web/library`);
  assert.equal(p.stores.snapshots.read.tokenEnv, 'ACME_SNAPSHOTS_TOKEN', 'the name of a token variable stays; never its value');
  assert.equal(p.config.figmaFileKey, 'KEY1');
  assert.equal(p.config.styleguide.out, 'site/index.html');
  for (const gone of ['figd_x', 'secret', 's3', 'apiKey', 'autoFix', 'draftModel', 'codeRoots', '/Users/someone', 'webhook', 'modules']) assert.ok(!text.includes(gone), `${gone} is not in the profile`);
  assert.doesNotThrow(() => validate(p));
});

test('a profile written in: its shared keys and stores win, what the person set stays', () => {
  const profile = { profile: 1, name: 'Acme', stores: { intentLayer: { read: `https://${HOST}/design/intent`, mode: 'merge-request' } },
    config: { figmaFileKey: 'KEY2', paths: { snapshotStructure: 'src/s.snapshot.json' }, codeRoots: ['/elsewhere'], intentLayer: { gitlab: `https://${HOST}/design/intent`, autoFix: 'commit' } } };
  const before = { figmaFileKey: 'OLD', knownUnusedVars: ['--x'], paths: { snapshotVars: 'v.json' }, codeRoots: ['/mine'], stores: { snapshots: { read: 'x' } } };
  const next = applyProfile(before, profile, { source: 'p.json', sha: 'abc', now: '2026-10-24' });
  assert.equal(next.figmaFileKey, 'KEY2');
  assert.deepEqual(next.paths, { snapshotVars: 'v.json', snapshotStructure: 'src/s.snapshot.json' });
  assert.deepEqual(next.knownUnusedVars, ['--x'], 'a key the profile does not name stays');
  assert.deepEqual(next.codeRoots, ['/mine'], 'a personal key is never taken from a profile');
  assert.equal(next.intentLayer.autoFix, undefined, 'nor turned on by one');
  assert.deepEqual(Object.keys(next.stores), ['intentLayer'], 'the stores are the profile\'s');
  assert.deepEqual(next.profile, { source: 'p.json', sha: 'abc', name: 'Acme', readAt: '2026-10-24' });
});

test('read from a file or a GitLab link (with the person\'s own token); a file that is not a profile is said', async () => {
  const d = mkdtempSync(join(tmpdir(), 'profile-'));
  writeFileSync(join(d, PROFILE_FILE), JSON.stringify({ profile: 1, name: 'Acme', config: {} }));
  writeFileSync(join(d, 'other.json'), '{"name":"x"}');
  assert.equal((await readProfile(PROFILE_FILE, { from: d })).profile.name, 'Acme');
  assert.match((await readProfile('other.json', { from: d })).error, /not an rms-design-system-engine profile/);
  assert.match((await readProfile('../nope.json', { from: d })).error, /no file at/);
  const seen = [];
  const http = { get: async (url, { headers }) => { seen.push([url, headers['PRIVATE-TOKEN']]); const ok = url.includes('/repository/files/setup%2Fprofile.json/raw?ref=main'); const b = Buffer.from(JSON.stringify({ profile: 1, name: 'Acme' })); return { ok, status: ok ? 200 : 404, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }; } };
  const r = await readProfile(`https://${HOST}/design/intent/-/blob/main/setup/profile.json`, { from: d, env: { GITLAB_TOKEN: 'mine', GITLAB_HOST: HOST }, http });
  assert.equal(r.profile.name, 'Acme');
  assert.equal(seen[0][1], 'mine');
});

test('remembered in ds-config.json: read again each run, written in only when its maintainers changed it', async () => {
  const d = mkdtempSync(join(tmpdir(), 'profile-'));
  const write = (name) => writeFileSync(join(d, 'p.json'), JSON.stringify({ profile: 1, name, config: { figmaFileKey: name } }));
  write('Acme');
  writeFileSync(join(d, 'ds-config.json'), JSON.stringify({ codeRoots: ['/mine'] }, null, 2));
  const a = await refreshProfile(d, { given: 'p.json' });
  assert.equal(a.applied, true);
  assert.match(a.lines[0], /Set up from Acme's profile/);
  const cfg = JSON.parse(readFileSync(join(d, 'ds-config.json'), 'utf8'));
  assert.equal(cfg.figmaFileKey, 'Acme');
  assert.deepEqual(cfg.codeRoots, ['/mine']);
  assert.equal((await refreshProfile(d)).applied, false, 'the same profile: nothing written');
  write('Acme2');
  const b = await refreshProfile(d);
  assert.equal(b.applied, true);
  assert.match(b.lines[0], /changed: ds-config\.json updated/);
  assert.equal((await refreshProfile(d, { offline: true })).applied, false, 'offline: not read');
});

test('the command a team installs is named after the engine', () => {
  const home = mkdtempSync(join(tmpdir(), 'home-'));
  assert.equal(commandName('Acme'), 'rms-design-system-engine-acme');
  assert.equal(commandName('rms-design-system-engine-Acme Corp'), 'rms-design-system-engine-acme-corp');
  const f = writeCommand('Acme', `https://${HOST}/design/intent/-/blob/main/profile.json`, { home, name: 'Acme' });
  assert.equal(f, join(home, '.claude', 'skills', 'rms-design-system-engine-acme', 'SKILL.md'));
  const text = readFileSync(f, 'utf8');
  assert.match(text, /^---\nname: rms-design-system-engine-acme\n/);
  assert.match(text, /rms-design-system-engine --profile 'https:\/\/gitlab\.acme\.test\/design\/intent\/-\/blob\/main\/profile\.json' \$ARGUMENTS/);
  assert.ok(!/token\s*[:=]/i.test(text));
  assert.throws(() => writeCommand('', 'p.json', { home }), /client's name/);
  assert.ok(!existsSync(join(home, '.claude', 'skills', 'rms-design-system-engine-')));
});

test('a part this engine does not know yet is left unused and named, never a refusal of the whole profile', async () => {
  const d = mkdtempSync(join(tmpdir(), 'profile-'));
  writeFileSync(join(d, 'p.json'), JSON.stringify({ profile: 1, name: 'Acme', stores: { snapshots: { read: 'x' }, futurePart: { read: 'y' } }, config: {} }));
  const r = await refreshProfile(d, { given: 'p.json' });
  assert.equal(r.applied, true);
  assert.match(r.lines.join('\n'), /names a part this engine does not know yet \(futurePart\)/);
  assert.ok(JSON.parse(readFileSync(join(d, 'ds-config.json'), 'utf8')).stores.futurePart, 'kept for a newer engine');
});

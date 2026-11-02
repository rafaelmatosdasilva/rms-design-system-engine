// profile.mjs - a company's setup, kept by its maintainers and read by everyone: where each part lives, never a token,
// never what one person set for themself, never whether they may write. And the command a team installs. An invented
// company (Acme).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { exportProfile, applyProfile, readProfile, refreshProfile, writeCommand, commandName, validate, PROFILE_FILE } from '../lib/profile.mjs';
import { tempDir } from './helpers.mjs';

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
  const d = tempDir('profile-');
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
  const d = tempDir('profile-');
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
  const home = tempDir('home-');
  assert.equal(commandName('Acme'), 'rms-design-system-engine-acme');
  assert.equal(commandName('rms-design-system-engine-Acme Corp'), 'rms-design-system-engine-acme-corp');
  const f = writeCommand('Acme', `https://${HOST}/design/intent/-/blob/main/profile.json`, { home, name: 'Acme' });
  assert.equal(f, join(home, '.claude', 'skills', 'rms-design-system-engine-acme', 'SKILL.md'));
  const text = readFileSync(f, 'utf8');
  assert.match(text, /^---\nname: rms-design-system-engine-acme\n/);
  assert.match(text, /rms-design-system-engine --profile 'https:\/\/gitlab\.acme\.test\/design\/intent\/-\/blob\/main\/profile\.json' --route "\$ARGUMENTS"/, 'the request is routed first');
  assert.ok(!/token\s*[:=]/i.test(text));
  assert.throws(() => writeCommand('', 'p.json', { home }), /client's name/);
  assert.ok(!existsSync(join(home, '.claude', 'skills', 'rms-design-system-engine-')));
});

test('a part this engine does not know yet is left unused and named, never a refusal of the whole profile', async () => {
  const d = tempDir('profile-');
  writeFileSync(join(d, 'p.json'), JSON.stringify({ profile: 1, name: 'Acme', stores: { snapshots: { read: 'x' }, futurePart: { read: 'y' } }, config: {} }));
  const r = await refreshProfile(d, { given: 'p.json' });
  assert.equal(r.applied, true);
  assert.match(r.lines.join('\n'), /names a part this engine does not know yet \(futurePart\)/);
  assert.ok(JSON.parse(readFileSync(join(d, 'ds-config.json'), 'utf8')).stores.futurePart, 'kept for a newer engine');
});

test('a store\'s notify survives a profile: the CI to tell and the name of its variable, never a credential', () => {
  const profile = { profile: 1, name: 'Acme', stores: { styleguide: { write: `https://${HOST}/design/site`, notify: [{ url: 'https://ci.acme.test/job/site/build', authEnv: 'ACME_CI_AUTH', token: 'x' }, 'https://hooks.acme.test/site'] } } };
  const next = applyProfile({}, profile, { source: 'p.json', sha: 'abc', now: '2026-10-24' });
  assert.deepEqual(next.stores.styleguide.notify, [{ url: 'https://ci.acme.test/job/site/build', authEnv: 'ACME_CI_AUTH' }, 'https://hooks.acme.test/site']);
  assert.deepEqual(exportProfile(next).stores.styleguide.notify, next.stores.styleguide.notify);
});

test('a run with no token where it stands says the folder first, never that the token lacks access; the team\'s command says where to run it', async () => {
  const away = tempDir('acme-elsewhere-');
  const http = { get: async () => ({ ok: false, status: 404 }) };
  const link = `https://${HOST}/design/intent/-/blob/main/setup/profile.json`;
  const r = await readProfile(link, { from: away, env: { GITLAB_HOST: HOST }, http });
  assert.match(r.error, /^no GITLAB_TOKEN to read it: none in this run's environment nor in a \.env in .+acme-elsewhere-.+\. That folder is not a project \(no ds-config\.json, no \.env\): run from your project's folder, where its \.env is$/);
  assert.doesNotMatch(r.error, /must read/, 'never sends anyone to widen a token');
  assert.equal(r.project, false);
  // A project without a token: told there is none, and not told to move.
  const proj = tempDir('acme-project-');
  writeFileSync(join(proj, 'ds-config.json'), '{}');
  const p = await readProfile(link, { from: proj, env: { GITLAB_HOST: HOST }, http });
  assert.match(p.error, /^no GITLAB_TOKEN to read it/);
  assert.doesNotMatch(p.error, /not a project/);
  // With a token that cannot read it, the token is still what is said.
  assert.match((await readProfile(link, { from: away, env: { GITLAB_TOKEN: 'mine', GITLAB_HOST: HOST }, http })).error, /GITLAB_TOKEN in \.env must read design\/intent/);
  // The command a team installs says to run it from the project's folder.
  const dir = tempDir('acme-cmd-');
  const out = writeCommand('acme', link, { dir });
  assert.match(readFileSync(out, 'utf8'), /Run it from your project's folder, the one with your \.env: the profile is read with the\nGITLAB_TOKEN there\./);
});

// A scheduled pipeline no webhook starts builds only when something it is made from moved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { sourcesOf, sourcesNow, changes } from '../ci-changed.mjs';

test('the sources of a build: the code, each store read from GitLab, the intent layer, the profile and the Figma file; never what it only writes', () => {
  const root = mkdtempSync(join(tmpdir(), 'acme-ci-'));
  writeFileSync(join(root, '.gitlab-source.json'), JSON.stringify({ source: 'https://gitlab.acme.test/web/ui-kit', ref: 'main' }));
  const s = sourcesOf(root, {
    figmaFileKey: 'AcmeFileKey',
    stores: { snapshots: { read: { gitlab: 'https://gitlab.acme.test/ux/site', path: 'snapshots' }, write: { gitlab: 'https://gitlab.acme.test/ux/site', path: 'snapshots' } }, styleguide: { write: { gitlab: 'https://gitlab.acme.test/ux/site' } }, intentLayer: { read: { gitlab: 'https://gitlab.acme.test/ux/intent' } } },
    profile: { source: 'https://gitlab.acme.test/ux/profile/-/blob/main/design-system-engine-profile.json' },
  });
  assert.deepEqual(s.map((x) => x.what), ['the code', 'snapshots', 'intentLayer', 'the profile', 'Figma']);
  assert.deepEqual(s.find((x) => x.what === 'the profile'), { what: 'the profile', gitlab: 'https://gitlab.acme.test/ux/profile', ref: 'main', path: 'design-system-engine-profile.json' });
});

test('each source\'s latest commit and the Figma version; what moved, and a source that cannot be read counts as moved', async () => {
  const asked = [];
  const get = async (url, headers) => {
    asked.push([url, headers]);
    if (url.startsWith('https://api.figma.com/')) return { ok: true, json: async () => ({ version: '42' }) };
    if (/projects\/ux%2Fsite$/.test(url)) return { ok: true, json: async () => ({ default_branch: 'main' }) };
    if (/ux%2Fsite\/repository\/commits/.test(url)) return { ok: true, json: async () => [{ id: 'aaaaaaaaaaaaaaaa' }] };
    if (/ux%2Fempty\/repository\/commits/.test(url)) return { ok: true, json: async () => [] };
    return { ok: false, json: async () => null };
  };
  const now = await sourcesNow([{ what: 'snapshots', gitlab: 'https://gitlab.acme.test/ux/site', path: 'snapshots' }, { what: 'decisions', gitlab: 'https://gitlab.acme.test/ux/empty', ref: 'main', path: 'decisions' }, { what: 'the code', gitlab: 'https://gitlab.acme.test/web/gone', ref: 'main' }, { what: 'Figma', figma: 'AcmeFileKey' }], { get, env: { GITLAB_TOKEN: 't', FIGMA_TOKEN: 'f', GITLAB_HOSTS: 'gitlab.acme.test' } });
  assert.deepEqual(now, { 'snapshots:snapshots': 'aaaaaaaaaaaaaaaa', 'decisions:decisions': 'none yet', 'the code': null, Figma: '42' });
  assert.ok(asked.some(([u]) => /ref_name=main&path=snapshots/.test(u)), 'its default branch, for its path');
  assert.deepEqual(asked.find(([u]) => u.includes('figma'))[1], { 'X-Figma-Token': 'f' });
  assert.deepEqual(changes(now, { 'snapshots:snapshots': 'aaaaaaaaaaaaaaaa', 'decisions:decisions': 'none yet', 'the code': 'c1', Figma: '41' }).map((c) => c.what), ['the code', 'Figma']);
  assert.deepEqual(changes({ Figma: 'not read (no FIGMA_TOKEN)', a: 'x' }, { a: 'x' }), [], 'a source never read is no change');
});

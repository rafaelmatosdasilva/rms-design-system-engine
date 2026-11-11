// The Figma file's own history (figma-versions.mjs), against a fake of Figma's REST API: who saved the versions since
// the last read, what changed in a component between two versions, and the version that brought in a property.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { versionsSince, editorsOf, editorsLine, componentDiff, versionDiff, introducedIn, historyCommand, blameCommand } from '../lib/figma-versions.mjs';

// Acme's file: eight versions, newest first, two pages of four. A chip gains a Size property at v5 and a Badge layer at
// v7; v3 is named.
const V = Array.from({ length: 8 }, (_, i) => ({ id: `v${8 - i}`, created_at: `2026-11-0${8 - i}T10:00:00Z`, user: { handle: ['Ada', 'Ben', 'Ada', 'Cy', 'Ben', 'Ada', 'Ben', 'Cy'][i] }, label: 8 - i === 3 ? 'Spring cleanup' : '', description: '' }));
const chipAt = (n) => ({ type: 'COMPONENT_SET', name: 'chipTag', description: n >= 6 ? 'A tag.' : '',
  componentPropertyDefinitions: { State: { type: 'VARIANT', variantOptions: ['Default', 'Selected'], defaultValue: 'Default' }, ...(n >= 5 ? { 'Size#12:3': { type: 'VARIANT', variantOptions: ['s', 'm'], defaultValue: 's' } } : {}) },
  children: ['State=Default', 'State=Selected'].map((v) => ({ type: 'COMPONENT', name: v, children: [{ type: 'TEXT', name: 'Label' }, ...(n >= 7 ? [{ type: 'FRAME', name: 'Badge', children: [] }] : [])] })) });
function fakeFigma() {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const u = new URL(url);
    let body;
    if (u.pathname.endsWith('/versions')) {
      const page = u.searchParams.get('before') ? 1 : 0;
      body = { versions: V.slice(page * 4, page * 4 + 4), pagination: page ? {} : { next_page: `${u.origin}${u.pathname}?page_size=4&before=v5` } };
    } else {
      const v = u.searchParams.get('version'), n = v ? Number(v.slice(1)) : 8;
      body = { nodes: { '1:2': { document: chipAt(n) } } };
    }
    return { ok: true, status: 200, json: async () => body };
  };
  return { fetchImpl, calls };
}

test('the versions saved since the last read, followed across pages, and who saved them', async () => {
  const { fetchImpl } = fakeFigma();
  const since = await versionsSince('KEY', 'tok', '2026-11-03T10:00:00Z', { fetchImpl, pageSize: 4 });
  assert.deepEqual(since.map((v) => v.id), ['v8', 'v7', 'v6', 'v5', 'v4']);
  assert.equal(since.base.id, 'v3', 'the version they are compared with');
  const eds = editorsOf(since);
  assert.deepEqual(eds.map((e) => [e.by, e.versions]), [['Ada', 2], ['Ben', 2], ['Cy', 1]]);
  assert.match(editorsLine(eds, { since: '2026-11-03T10:00:00Z' }), /^Figma: changed since the last read \(2026-11-03\) by Ada \(2 versions, last 2026-11-08\), Ben/);
  assert.equal(await versionsSince('KEY', null), null, 'no token, nobody named');
});

test('what changed in a component between two versions: its properties, variants, layers and description', () => {
  assert.deepEqual(componentDiff(chipAt(4), chipAt(8)), ['description added', 'property Size added', 'layer State=Default/Badge added', 'layer State=Selected/Badge added']);
  assert.deepEqual(componentDiff(chipAt(8), chipAt(8)), []);
  assert.deepEqual(componentDiff(null, chipAt(8)), ['added to the file']);
});

test('the version that brought in a property or a layer, read at about log2 of the versions', async () => {
  const { fetchImpl } = fakeFigma();
  const vs = await versionsSince('KEY', 'tok', '1970-01-01T00:00:00Z', { fetchImpl, pageSize: 4 });
  const size = await introducedIn('KEY', 'tok', '1:2', { property: 'Size' }, vs, { fetchImpl });
  assert.equal(size.id, 'v5');
  assert.equal(size.by, 'Cy');
  assert.ok(size.read <= 5, `${size.read} versions read of 8`);
  assert.equal((await introducedIn('KEY', 'tok', '1:2', { layer: 'Badge' }, vs, { fetchImpl })).id, 'v7');
  assert.equal((await introducedIn('KEY', 'tok', '1:2', { property: 'State' }, vs, { fetchImpl })).before, true, 'older than every version read');
  assert.equal((await introducedIn('KEY', 'tok', '1:2', { property: 'Tone' }, vs, { fetchImpl })).never, true);
});

test('the commands: the history between two days, with who saved it, and who brought in a property', async () => {
  const { fetchImpl } = fakeFigma();
  const props = { chipTag: { nodeId: '1:2' } };
  const h = await historyCommand({ fileKey: 'KEY', token: 'tok', props, names: ['chipTag'], from: '2026-11-04', fetchImpl });
  assert.deepEqual(h.lines, ['Figma versions since 2026-11-04: 4, saved by Ada (2), Ben (1), Cy (1).', 'chipTag: description added; property Size added; layer State=Default/Badge added; layer State=Selected/Badge added']);
  const b = await blameCommand({ fileKey: 'KEY', token: 'tok', props, name: 'chipTag', property: 'Size', fetchImpl });
  assert.match(b.lines[0], /^chipTag: property Size came in with the version of 2026-11-05 by Cy/);
  assert.match((await historyCommand({ fileKey: 'KEY', token: null, props, names: ['chipTag'] })).error, /needs a token/);
  assert.match((await historyCommand({ fileKey: 'KEY', token: 'tok', props, names: ['nope'] })).error, /Not in the props snapshot/);
});

test('a read that kept who changed the file carries them to its rows on History; one that did not names nobody', async () => {
  const { figmaDigestOf } = await import('../lib/component-changelog.mjs');
  const props = { chipTag: { properties: {} }, _editors: { since: '2026-11-03T10:00:00Z', editors: [{ by: 'Ada', versions: 2, last: '2026-11-08' }] } };
  assert.deepEqual(figmaDigestOf(props, {}, ['chipTag'])._editors.map((e) => e.by), ['Ada']);
  assert.ok(!('_editors' in figmaDigestOf({ chipTag: { properties: {} } }, {}, ['chipTag'])));
});

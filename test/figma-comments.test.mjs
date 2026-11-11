// The comments people leave in the Figma file (figma-comments.mjs): read with a token, tied to the component each is
// pinned on through any of its layers, and kept as threads with their replies, open or resolved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readComments, componentOf, threadsByComponent } from '../lib/figma-comments.mjs';

const RAW = { comments: [
  { id: '1', message: 'Should the label wrap?', created_at: '2026-11-03T10:00:00Z', user: { handle: 'Ada' }, client_meta: { node_id: '9:3' } },
  { id: '2', parent_id: '1', message: 'No: it truncates.', created_at: '2026-11-03T11:00:00Z', user: { handle: 'Ben' } },
  { id: '3', message: 'Use the new icon', created_at: '2026-11-05T09:00:00Z', user: { handle: 'Cy' }, client_meta: { node_id: '9:1' }, resolved_at: '2026-11-06T09:00:00Z' },
  { id: '4', message: 'A note on the cover page', created_at: '2026-11-04T09:00:00Z', user: { handle: 'Ada' }, client_meta: { node_id: '0:1' } },
] };

test('comments read with a token, threads tied to their component through any of its layers, replies under them', async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => RAW });
  const comments = await readComments('KEY', 'tok', { fetchImpl });
  assert.equal(comments.length, 4);
  assert.equal(await readComments('KEY', null), null, 'no token, nothing read');
  const skeleton = { chipTag: { trees: [{ t: 'COMPONENT', n: 'x', c: [{ t: 'FRAME', n: 'Body', id: '9:2', c: [{ t: 'TEXT', n: 'Label', id: '9:3' }] }] }] } };
  const props = { chipTag: { nodeId: '9:1' } };
  const threads = threadsByComponent(comments, componentOf(skeleton, props));
  assert.deepEqual(Object.keys(threads), ['chipTag'], 'a comment on the cover page belongs to no component');
  assert.deepEqual(threads.chipTag.map((t) => [t.text, t.resolved, t.replies.map((r) => r.by)]), [['Use the new icon', true, []], ['Should the label wrap?', false, ['Ben']]], 'newest thread first');
});

test('a token Figma refuses for comments says which scope it needs', async () => {
  const fetchImpl = async () => ({ ok: false, status: 403, json: async () => ({}) });
  await assert.rejects(readComments('KEY', 'tok', { fetchImpl }), /File comments \(read\)/);
});

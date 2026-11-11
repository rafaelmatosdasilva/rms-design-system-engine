// figma-comments.mjs - the comments people leave in the Figma file, read with a token (REST /files/:key/comments), each
// tied to the component it is pinned on: a designer's question or a decision said on a component reaches its History
// on the style guide, beside the reads of Figma and the commits. Read only: the engine never posts or deletes one.
//
//   readComments(fileKey, token)        → [{ id, parent, node, by, at, text, resolved }] | null (no token)
//   componentOf(skeleton, props)        → (node id) → component name | null, every layer of every variant known
//   threadsByComponent(comments, find)  → { [component]: [{ at, by, text, resolved, replies: [{ at, by, text }], url? }] }
//   COMMENTS_FILE                       the file kept beside the snapshots, refreshed at each read with a token
import { makeFigmaFetch } from './figma-fetch.mjs';

export const COMMENTS_FILE = 'figma-comments.snapshot.json';
const FIGMA = makeFigmaFetch();

export async function readComments(fileKey, token, { fetchImpl = FIGMA } = {}) {
  if (!fileKey || !token) return null;
  const res = await fetchImpl(`https://api.figma.com/v1/files/${fileKey}/comments`, { headers: { 'X-Figma-Token': token } });
  // A token made without the comments scope is refused, and Figma says so with a 403 or a 404.
  if (res.status === 403 || res.status === 404) throw new Error(`Figma answered ${res.status} for the comments: the token needs the scope File comments (read)`);
  if (!res.ok) throw new Error(`Figma answered ${res.status} for the comments`);
  const j = await res.json();
  return (j?.comments ?? []).map((c) => ({ id: String(c.id), parent: c.parent_id ? String(c.parent_id) : null, node: c.client_meta?.node_id ?? null,
    by: c.user?.handle ?? null, at: String(c.created_at ?? ''), text: String(c.message ?? '').trim(), resolved: !!c.resolved_at }));
}

// Every node id the skeleton holds (each variant's layers, instances included) to its component; a component set's
// and each variant's own id from the props snapshot.
export function componentOf(skeleton = {}, props = {}) {
  const by = new Map();
  for (const [name, e] of Object.entries(props ?? {})) if (!name.startsWith('_') && e?.nodeId) by.set(String(e.nodeId), name);
  for (const [name, sk] of Object.entries(skeleton ?? {})) {
    if (name.startsWith('_')) continue;
    const walk = (t) => { if (!t || typeof t !== 'object') return; if (t.id) by.set(String(t.id), name); for (const c of t.c ?? []) walk(c); };
    for (const tree of sk?.trees ?? []) walk(tree);
  }
  return (node) => (node ? by.get(String(node)) ?? null : null);
}

// The comments as threads, by the component each is pinned on: the first comment and its replies, newest thread first.
// A comment on no component (a page, a frame of its own) is left out: History is a component's.
export function threadsByComponent(comments = [], find = () => null) {
  const roots = new Map(), out = {};
  for (const c of comments ?? []) if (!c.parent) roots.set(c.id, { ...c, replies: [] });
  for (const c of comments ?? []) if (c.parent && roots.has(c.parent)) roots.get(c.parent).replies.push({ at: c.at, by: c.by, text: c.text });
  for (const t of roots.values()) {
    const name = find(t.node);
    if (!name || !t.text) continue;
    t.replies.sort((a, b) => (a.at < b.at ? -1 : 1));
    (out[name] ??= []).push({ at: t.at, by: t.by, text: t.text, resolved: t.resolved, replies: t.replies, node: t.node });
  }
  for (const list of Object.values(out)) list.sort((a, b) => (a.at < b.at ? 1 : -1));
  return out;
}

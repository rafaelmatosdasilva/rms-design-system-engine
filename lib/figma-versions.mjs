// figma-versions.mjs - the Figma file's own history, read from its versions with a token (REST /files/:key/versions and
// /files/:key/nodes?version=): who changed the file since the last read, what changed in a component between any two
// versions, and the version that brought in a property or a layer, with its author and its day.
//
// Figma keeps a version per save of the file, autosaves included, each with its author; it never says which component
// one changed. So who changed a component is found by reading the component at versions and comparing them, never
// guessed from the file's list. A read through the session's Figma tool has no token: it names nobody.
//
//   versionsSince(fileKey, token, since)      → [{ id, at, by, label, description }], newest first, made after `since`
//   editorsOf(versions)                       → [{ by, versions, last }], who saved them, the most recent first
//   editorsLine(editors)                      → the line a read says ("changed in Figma since the last read by …")
//   componentAt(fileKey, token, id, version)  → the component's node as it was in that version (null: not there)
//   componentDiff(a, b)                       → what changed between two of those nodes, in words
//   versionDiff(fileKey, token, ids, from, to)→ { [name]: [changes] } for each component, between two versions
//   introducedIn(fileKey, token, id, target)  → the oldest version that holds a property or a layer, by binary search

const API = 'https://api.figma.com/v1';
const call = async (url, token, fetchImpl) => {
  const res = await fetchImpl(url, { headers: { 'X-Figma-Token': token }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Figma answered ${res.status} for ${url.replace(API, '')}`);
  return res.json();
};
const versionOf = (v) => ({ id: String(v.id), at: String(v.created_at ?? ''), by: v.user?.handle ?? null, label: v.label || null, description: v.description || null });

// The versions made after `since` (an ISO time; none: the newest page only), newest first, with the newest version at
// or before `since` as .base (what they are compared with). Figma lists them newest first in pages; the pages are
// followed until one reaches `since`, at most `pages` of them.
export async function versionsSince(fileKey, token, since = null, { fetchImpl = fetch, pages = 20, pageSize = 50 } = {}) {
  if (!fileKey || !token) return null;
  const out = [];
  let url = `${API}/files/${fileKey}/versions?page_size=${pageSize}`;
  for (let i = 0; url && i < pages; i++) {
    const j = await call(url, token, fetchImpl);
    for (const v of j?.versions ?? []) {
      const x = versionOf(v);
      if (since && x.at && x.at <= since) { out.base = x; return out; }   // the version the ones after it are compared with
      out.push(x);
    }
    if (!since) break;
    url = j?.pagination?.next_page ?? null;
  }
  return out;
}

// Who saved the versions, each once: how many versions and their last one, the most recent first.
export function editorsOf(versions = []) {
  const by = new Map();
  for (const v of versions ?? []) {
    if (!v?.by) continue;
    const e = by.get(v.by) ?? { by: v.by, versions: 0, last: v.at };
    e.versions++;
    if (v.at > e.last) e.last = v.at;
    by.set(v.by, e);
  }
  return [...by.values()].sort((a, b) => (a.last < b.last ? 1 : -1));
}

export function editorsLine(editors = [], { since = null } = {}) {
  if (!editors?.length) return null;
  const who = editors.map((e) => `${e.by} (${e.versions} version${e.versions === 1 ? '' : 's'}, last ${String(e.last).slice(0, 10)})`);
  return `Figma: changed ${since ? `since the last read (${String(since).slice(0, 10)})` : 'lately'} by ${who.join(', ')}`;
}

// The component's node in one version: its properties, its variants and their layers (to the depth asked).
export async function componentAt(fileKey, token, id, version = null, { fetchImpl = fetch, depth = 4 } = {}) {
  const q = new URLSearchParams({ ids: id, depth: String(depth) });
  if (version && version !== 'current') q.set('version', version);
  const j = await call(`${API}/files/${fileKey}/nodes?${q}`, token, fetchImpl);
  return j?.nodes?.[id]?.document ?? null;
}

// The layers of a node by their path (variant/Frame/Label), its own properties and what its layers bind.
function shapeOf(node) {
  const layers = new Set(), binds = new Set();
  const walk = (n, path) => {
    for (const [k, v] of Object.entries(n?.boundVariables ?? {})) for (const a of [].concat(v)) if (a?.id) binds.add(`${path} ${k}`);
    for (const k of ['fills', 'strokes']) for (const p of n?.[k] ?? []) if (p?.boundVariables?.color?.id) binds.add(`${path} ${k === 'fills' ? 'fill' : 'stroke'}`);
    if (n?.type === 'INSTANCE') return;   // what an instance holds is its own component's
    for (const c of n?.children ?? []) { const p = `${path}/${c.name}`; layers.add(p); walk(c, p); }
  };
  const variants = node?.type === 'COMPONENT_SET' ? (node.children ?? []) : node ? [node] : [];
  for (const v of variants) walk(v, v.name);
  const props = {};
  for (const [k, d] of Object.entries(node?.componentPropertyDefinitions ?? {})) props[k.replace(/#[\d:]+$/, '')] = [d?.type, (d?.variantOptions ?? []).join(', '), typeof d?.defaultValue === 'object' ? null : d?.defaultValue].filter((x) => x != null && x !== '').join(' · ');
  return { name: node?.name ?? null, description: String(node?.description ?? ''), variants: variants.map((v) => v.name), layers, binds, props };
}

// What changed between two versions of one component, in words; [] when nothing did.
export function componentDiff(a, b, { most = 12 } = {}) {
  if (!a && !b) return [];
  if (!a) return ['added to the file'];
  if (!b) return ['removed from the file'];
  const x = shapeOf(a), y = shapeOf(b), out = [];
  if (x.name !== y.name) out.push(`renamed ${x.name} → ${y.name}`);
  if (x.description !== y.description) out.push(y.description ? (x.description ? 'description changed' : 'description added') : 'description removed');
  const key = (k) => String(k).toLowerCase().replace(/[^a-z0-9]/g, '');
  const gone = Object.keys(x.props).filter((k) => !(k in y.props)), added = Object.keys(y.props).filter((k) => !(k in x.props));
  const renamed = new Map(gone.map((k) => [k, added.find((n) => key(n) === key(k))]).filter(([, n]) => n));
  for (const [k, n] of renamed) out.push(`property ${k} renamed ${n}`);
  for (const k of added) if (![...renamed.values()].includes(k)) out.push(`property ${k} added`);
  for (const k of gone) if (!renamed.has(k)) out.push(`property ${k} removed`);
  for (const [k, v] of Object.entries(y.props)) if (k in x.props && x.props[k] !== v) out.push(`property ${k} ${x.props[k]} → ${v}`);
  const was = new Set(x.variants), now = new Set(y.variants);
  for (const v of y.variants) if (!was.has(v)) out.push(`variant ${v} added`);
  for (const v of x.variants) if (!now.has(v)) out.push(`variant ${v} removed`);
  // A layer under a variant that is itself new or gone is that variant's change, said once.
  const inVariant = (p, set) => set.has(p.split('/')[0]);
  for (const p of y.layers) if (!x.layers.has(p) && inVariant(p, was)) out.push(`layer ${p} added`);
  for (const p of x.layers) if (!y.layers.has(p) && inVariant(p, now)) out.push(`layer ${p} removed`);
  const bound = [...y.binds].filter((k) => !x.binds.has(k)).length, unbound = [...x.binds].filter((k) => !y.binds.has(k)).length;
  if (bound) out.push(`${bound} value${bound === 1 ? '' : 's'} bound to a variable`);
  if (unbound) out.push(`${unbound} value${unbound === 1 ? '' : 's'} no longer bound to a variable`);
  return out.length > most ? [...out.slice(0, most), `and ${out.length - most} more`] : out;
}

// Each component (by node id) compared between two versions ('current' for the file as it is now).
export async function versionDiff(fileKey, token, ids = [], from, to = 'current', opts = {}) {
  const out = {};
  for (const id of ids) {
    const [a, b] = await Promise.all([componentAt(fileKey, token, id, from, opts), componentAt(fileKey, token, id, to, opts)]);
    const changed = componentDiff(a, b, opts);
    if (changed.length) out[(b ?? a)?.name ?? id] = changed;
  }
  return out;
}

// Whether a node holds what is looked for: a property (its name, without Figma's #id) or a layer (by its path inside a
// variant, or by its name anywhere).
function holds(node, target) {
  if (!node) return false;
  const s = shapeOf(node);
  if (target.property) return Object.keys(s.props).some((k) => k === String(target.property).replace(/#[\d:]+$/, ''));
  if (target.layer) { const t = String(target.layer); return [...s.layers].some((p) => p === t || p.endsWith(`/${t}`) || p.split('/').pop() === t); }
  return false;
}

// The version that brought in a property or a layer: the oldest of the versions (newest first, as versionsSince gives
// them) whose node holds it, the ones after it holding it too. A binary search reads the node at about log2(n)
// versions. → { version, at, by, label, read } | { never: true } (no version read holds it) | { before: true } (the
// oldest version read already holds it: it is older than the history read).
export async function introducedIn(fileKey, token, id, target, versions, opts = {}) {
  const list = (versions ?? []).filter((v) => v?.id);
  if (!list.length) return null;
  const cache = new Map();
  let read = 0;
  const has = async (i) => { if (!cache.has(i)) { cache.set(i, holds(await componentAt(fileKey, token, id, list[i].id, opts), target)); read++; } return cache.get(i); };
  if (!(await has(0))) return { never: true, read };
  if (await has(list.length - 1)) return { before: true, oldest: list[list.length - 1], read };
  let lo = 0, hi = list.length - 1;   // list[lo] holds it, list[hi] does not
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (await has(mid)) lo = mid; else hi = mid; }
  return { ...list[lo], read };
}

// ── The commands: --figma-history and --figma-blame ────────────────────────────────────────────────────────────────
// What a person asks for: what changed in some components between two versions and who saved the versions between, and
// the version that brought in a property or a layer. Components are named as the props snapshot names them; their node
// ids come from it. from/to: a version id, a day (YYYY-MM-DD: the last version saved before it ends) or 'current'.
// → { lines, error }
export async function historyCommand({ fileKey, token, props = {}, names = [], from = null, to = 'current', since = null, fetchImpl = fetch } = {}) {
  if (!token) return { error: 'Figma\'s version history needs a token: set FIGMA_TOKEN (.env or the environment). A read through the session\'s Figma tool has no history to read.' };
  if (!fileKey) return { error: 'No Figma file: set figmaFileKey in ds-config.json.' };
  const ids = names.map((n) => [n, props?.[n]?.nodeId]);
  const unknown = ids.filter(([, id]) => !id).map(([n]) => n);
  if (unknown.length) return { error: `Not in the props snapshot (or no node id): ${unknown.join(', ')}. Read Figma again, or name them as Figma does.` };
  // The versions read: back to `from` (or to the last read, else the newest page).
  const fromDay = /^\d{4}-\d{2}-\d{2}$/.test(String(from ?? '')) ? from : null;
  const versions = await versionsSince(fileKey, token, fromDay ? `${fromDay}T23:59:59Z` : since, { fetchImpl, pages: from || since ? 20 : 1 });
  if (!versions?.length) return { lines: ['No version of the Figma file was saved since then.'] };
  const fromId = from && !fromDay ? String(from) : null;
  const upto = (vs) => { const i = fromId ? vs.findIndex((v) => v.id === fromId) : -1; return i >= 0 ? vs.slice(0, i) : vs; };
  const between = upto(versions);
  // What they are compared with: the version asked for, else the last one saved before the day or the last read, else
  // the oldest version read.
  const base = fromId ?? versions.base?.id ?? versions[versions.length - 1].id;
  const lines = [`Figma versions ${fromId || fromDay ? 'since ' + (fromDay ?? fromId) : 'read'}: ${between.length}, saved by ${editorsOf(between).map((e) => `${e.by} (${e.versions})`).join(', ') || 'nobody named'}.`];
  for (const v of between.filter((x) => x.label).slice(0, 10)) lines.push(`  ${v.at.slice(0, 10)} "${v.label}"${v.description ? ` (${v.description})` : ''}${v.by ? ` by ${v.by}` : ''}`);
  const diff = await versionDiff(fileKey, token, ids.map(([, id]) => id), base, to, { fetchImpl });
  for (const [n] of ids) {
    const name = Object.keys(diff).find((k) => k === n) ?? null;
    lines.push(name ? `${n}: ${diff[name].join('; ')}` : `${n}: nothing changed`);
  }
  return { lines };
}

export async function blameCommand({ fileKey, token, props = {}, name, property = null, layer = null, fetchImpl = fetch } = {}) {
  if (!token) return { error: 'Figma\'s version history needs a token: set FIGMA_TOKEN (.env or the environment).' };
  const id = props?.[name]?.nodeId;
  if (!id) return { error: `Not in the props snapshot (or no node id): ${name}.` };
  if (!property && !layer) return { error: 'Say what to look for: --property <name> or --layer <name>.' };
  const versions = await versionsSince(fileKey, token, '1970-01-01T00:00:00Z', { fetchImpl, pages: 10 });
  const r = await introducedIn(fileKey, token, id, property ? { property } : { layer }, versions, { fetchImpl });
  const what = property ? `property ${property}` : `layer ${layer}`;
  if (!r) return { lines: ['No version of the Figma file to read.'] };
  if (r.never) return { lines: [`${name}: no version read holds ${what}.`] };
  if (r.before) return { lines: [`${name}: ${what} is older than the ${versions.length} versions read (the oldest, ${r.oldest.at.slice(0, 10)}, has it already).`] };
  return { lines: [`${name}: ${what} came in with the version of ${r.at.slice(0, 10)}${r.by ? ` by ${r.by}` : ''}${r.label ? ` "${r.label}"` : ''} (${r.read} versions read).`] };
}

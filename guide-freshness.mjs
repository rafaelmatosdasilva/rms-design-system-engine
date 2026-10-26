// guide-freshness.mjs - is the style guide the team opens behind what it is built from? The published page is what
// people see: an engine change merged, a snapshot refreshed or the code moved reaches them only when someone builds and
// publishes it again, and a pipeline that never runs (no runner, a failed job) leaves them on an old page for days.
//
// Each publish to the style guide store writes beside the page what it was built from (built-from.json: the engine's
// commit and each source's latest commit, as --ci-changed reads them). Any run, on any computer, can then compare it
// with the sources now and say what moved since, and how the store's pipeline is doing where the token may read it.
// With `"styleguide": { "publish": "auto" }`, a style guide build publishes when the published one is behind, where
// GitLab lets the person write it. Nothing here throws to the run.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { OUT_DIR } from './names.mjs';
import { sourcesOf, sourcesNow, changes, short } from './ci-changed.mjs';
import { storesOf, gitlabApi, describePlace } from './stores.mjs';

export const BUILT_FROM = 'built-from.json';
const STATE = `${OUT_DIR}/guide-freshness.json`;
const EVERY_MS = 6 * 3600e3;   // a run asks at most this often, unless asked (--guide-status, a style guide build)

// What a build is made from now: each source's latest commit (ci-changed.mjs), and the engine's own commit.
export async function sourcesFor(ROOT, cfg, { get, env, engine = null } = {}) {
  const now = await sourcesNow(sourcesOf(ROOT, cfg), { get, env });
  if (engine) now['the engine'] = engine;
  return now;
}

// The record a publish writes beside the page.
export const builtFrom = (sources, { at = new Date().toISOString() } = {}) => ({ $description: 'What this style guide was built from, written by rms-design-system-engine when it published it. Any run compares it with the sources now to tell whether the page is behind.', publishedAt: at, sources });

// The store's record, read from GitLab. → { record } | { why }
export async function readPublished(ROOT, cfg, opts = {}) {
  const place = storesOf(cfg).styleguide?.write;
  if (!place?.gitlab) return { why: 'no style guide store on GitLab' };
  const api = gitlabApi(ROOT, place, opts);
  if (api.error) return { why: api.error };
  const file = `${place.path ? place.path + '/' : ''}${BUILT_FROM}`;
  let ref = place.branch;
  if (!ref) { const r = await api.get(''); if (!r.ok) return { why: `GitLab answered ${r.status}` }; ref = (await r.json())?.default_branch ?? 'main'; }
  const r = await api.get(`/repository/files/${encodeURIComponent(file)}/raw?ref=${encodeURIComponent(ref)}`);
  if (r.status === 404) {
    // Published before the record existed: its last publish commit says when, at least.
    const c = await api.get(`/repository/commits?per_page=20&ref_name=${encodeURIComponent(ref)}`);
    const list = c.ok ? await c.json() : [];
    const last = (Array.isArray(list) ? list : []).find((x) => /^Style guide published/.test(x.title ?? ''));
    return { record: null, lastPublish: last ? last.created_at : null, place };
  }
  if (!r.ok) return { why: `GitLab answered ${r.status} for ${file}` };
  try { return { record: JSON.parse(Buffer.from(await r.arrayBuffer()).toString('utf8')), place }; } catch { return { why: `${file} is not JSON` }; }
}

// The store's pipeline, where the token may read it: its latest run, and whether it is stuck or failing.
// → { line } | null (not readable: nothing said)
export async function pipelineState(ROOT, cfg, opts = {}) {
  const place = storesOf(cfg).styleguide?.write;
  if (!place?.gitlab) return null;
  const api = gitlabApi(ROOT, place, opts);
  if (api.error) return null;
  const r = await api.get('/pipelines?per_page=5');
  if (!r.ok) return null;   // 403 without Pipeline: Read: the page is said behind or not without it
  const list = await r.json();
  if (!Array.isArray(list) || !list.length) return { line: 'its pipeline has never run' };
  const p = list[0], age = Date.now() - Date.parse(p.updated_at ?? p.created_at ?? '');
  const ok = list.find((x) => x.status === 'success');
  if (p.status === 'failed') return { line: `its last pipeline failed (#${p.iid ?? p.id}${ok ? `; the last that passed: ${String(ok.updated_at).slice(0, 10)}` : ', and none has passed'})` };
  if ((p.status === 'pending' || p.status === 'created') && age > 15 * 60e3) return { line: `its last pipeline (#${p.iid ?? p.id}) has waited ${Math.round(age / 60e3)} minutes for a runner to take it` };
  return null;
}

// Is the published guide behind? → { behind, moved: [{ what, from, to }], publishedAt, lines } | { why }
export async function freshness(ROOT, cfg, { get, env, engine, force = false, now: nowAt = Date.now(), http } = {}) {
  if (!storesOf(cfg).styleguide?.write?.gitlab) return { why: 'no style guide store on GitLab' };
  const stateFile = join(ROOT, STATE);
  let st = {}; try { st = JSON.parse(readFileSync(stateFile, 'utf8')); } catch { /* first time */ }
  if (!force && st.askedAt && nowAt - Date.parse(st.askedAt) < EVERY_MS) return { why: 'asked recently', cached: st.last ?? null };
  const pub = await readPublished(ROOT, cfg, { env, http });
  if (pub.why) return { why: pub.why };
  const now = await sourcesFor(ROOT, cfg, { get, env, engine });
  const moved = pub.record ? changes(now, pub.record.sources ?? {}) : [{ what: 'everything', from: null, to: null }];
  const pipe = await pipelineState(ROOT, cfg, { env, http });
  const where = describePlace(pub.place ?? storesOf(cfg).styleguide.write);
  const when = pub.record?.publishedAt ?? pub.lastPublish ?? null;
  const lines = [];
  if (moved.length) {
    const what = pub.record ? moved.map((m) => `${m.what} ${short(m.from)} → ${short(m.to)}`).join(' · ') : 'it was published before the engine kept what it was built from';
    lines.push(`📰 The style guide the team opens (${where}) is behind${when ? `, published ${String(when).slice(0, 10)}` : ''}: ${what}${pipe ? `; ${pipe.line}` : ''}.`);
  }
  else if (pipe) lines.push(`📰 The style guide the team opens (${where}) is up to date, but ${pipe.line}.`);
  const out = { behind: moved.length > 0, moved, publishedAt: when, lines };
  try { mkdirSync(dirname(stateFile), { recursive: true }); writeFileSync(stateFile, JSON.stringify({ askedAt: new Date(nowAt).toISOString(), last: out }, null, 1) + '\n'); } catch { /* the next run asks again */ }
  return out;
}

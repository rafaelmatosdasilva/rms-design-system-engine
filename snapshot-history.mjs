// snapshot-history.mjs - each read of Figma the team sent to its snapshots store, as each component's Figma history.
//
// A project that commits its snapshots has that history in git (component-changelog.mjs, figmaChangelogs). A team that
// keeps them in a store (ds-config.json → stores.snapshots, a GitLab project) has it there instead: every refresh sent
// with --refresh-snapshots is one commit of the store. This reads the store's commits that changed the component-props
// and variables snapshots, and what each said of every component, so the style guide's History shows each read of
// Figma that changed a component, linked to the store's commit, with no git in the project.
//
// What a commit holds never changes, so each one is read once and kept in its digest (what Figma said of each
// component then), beside the engine's other records: a later run asks GitLab only for the commits it has not seen.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { OUT_DIR } from './names.mjs';
import { storesOf, gitlabApi } from './stores.mjs';
import { figmaOf, figmaDiff } from './component-changelog.mjs';

export const SNAPSHOT_HISTORY = `${OUT_DIR}/snapshots-history.json`;
const PER_FILE = 30;   // the store's newest commits read per snapshot file
const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };

// The record, when it is the one of this store and these files (another store or other files start it again).
function recordOf(ROOT, key) {
  const r = readJson(join(ROOT, SNAPSHOT_HISTORY));
  return r?.key === key && Array.isArray(r.commits) && r.at && typeof r.at === 'object' ? r : { key, commits: [], at: {} };
}

// Read the store's commits that changed the snapshots (props, vars: their paths in the project) and what each said of
// every component. → { read, line } (read: commits read now; line: what went wrong, else null). Never throws.
export async function fillSnapshotHistory(ROOT, cfg, { props = null, vars = null } = {}, opts = {}) {
  const place = storesOf(cfg).snapshots?.read;
  const files = [props, vars].filter(Boolean);
  if (!place?.gitlab || !files.length || opts.offline) return { read: 0, line: null };
  const api = gitlabApi(ROOT, place, opts);
  if (api.error) return { read: 0, line: `Figma history: ${api.error}` };
  const inStore = (f) => [place.path, f].filter(Boolean).join('/').replace(/\/+/g, '/').replace(/^\//, '');
  const key = JSON.stringify([place.gitlab, place.path ?? '', place.branch ?? '', files]);
  const rec = recordOf(ROOT, key);
  try {
    const seen = new Map(rec.commits.map((c) => [c.sha, c]));
    for (const f of files) {
      const q = new URLSearchParams({ path: inStore(f), per_page: String(PER_FILE), ...(place.branch ? { ref_name: place.branch } : {}) });
      const r = await api.get(`/repository/commits?${q}`);
      if (!r.ok) return { read: 0, line: `Figma history not read from ${place.gitlab}: GitLab answered ${r.status}` };
      for (const c of await r.json()) if (c?.id && !seen.has(c.id)) seen.set(c.id, { sha: c.id, short: String(c.short_id ?? c.id.slice(0, 7)), date: c.committed_date ?? c.created_at ?? null, subject: String(c.title ?? ''), url: c.web_url ?? null });
    }
    const commits = [...seen.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    // What each commit said of every component: both snapshots as they were at it, whichever of them it changed.
    const at = async (sha, f) => {
      const r = await api.get(`/repository/files/${encodeURIComponent(inStore(f))}/raw?ref=${encodeURIComponent(sha)}`);
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`GitLab answered ${r.status}`);
      return JSON.parse(Buffer.from(await r.arrayBuffer()).toString('utf8'));
    };
    let read = 0;
    for (const c of commits) {
      if (rec.at[c.sha]) continue;
      const p = props ? await at(c.sha, props) : null, v = vars ? await at(c.sha, vars) : null;
      const names = Object.keys(p ?? {}).filter((n) => !n.startsWith('_'));
      rec.at[c.sha] = Object.fromEntries(names.map((n) => [n, figmaOf(p, v, n)]));
      read++;
    }
    rec.commits = commits;
    // Only what the commits still listed hold: one the store no longer lists is dropped with it.
    rec.at = Object.fromEntries(commits.filter((c) => rec.at[c.sha]).map((c) => [c.sha, rec.at[c.sha]]));
    mkdirSync(dirname(join(ROOT, SNAPSHOT_HISTORY)), { recursive: true });
    writeFileSync(join(ROOT, SNAPSHOT_HISTORY), JSON.stringify(rec));
    return { read, line: null };
  } catch (e) { return { read: 0, line: `Figma history not read from ${place.gitlab}: ${e.message}` }; }
}

// Each read of Figma the store holds that changed what Figma says of a component, newest first, as figmaChangelogs
// gives them from git: { name: [{ sha, short, date, subject, url, changed, release: null }] }.
export function storeFigmaChangelogs(ROOT, names = [], { max = 30 } = {}) {
  const rec = readJson(join(ROOT, SNAPSHOT_HISTORY));
  if (!rec?.commits?.length || !rec.at) return {};
  const none = { props: {}, vars: {}, known: false };
  const out = {};
  const list = rec.commits.filter((c) => rec.at[c.sha]);
  list.forEach((c, i) => {
    const before = i ? rec.at[list[i - 1].sha] : {}, after = rec.at[c.sha];
    for (const n of names) {
      const changed = figmaDiff(before[n] ?? none, after[n] ?? none);
      if (changed.length) (out[n] ??= []).unshift({ sha: c.sha, short: c.short, date: c.date, subject: c.subject, url: c.url, changed, release: null, releasedAt: null });
    }
  });
  for (const n of Object.keys(out)) out[n] = out[n].slice(0, max);
  return out;
}

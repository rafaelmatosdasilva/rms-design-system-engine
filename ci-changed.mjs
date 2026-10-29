// ci-changed.mjs - has anything a build is made from moved since the last build? For a scheduled pipeline that cannot
// be told by a webhook (a code repository the team may only read): it asks each source for its latest commit, and Figma
// for its file's version, and compares them with what the last build was made from.
//
//   sourcesOf(ROOT, cfg)            → [{ what, gitlab?, ref?, path?, figma? }]: the code, each store read from GitLab
//                                     (snapshots, decisions, themes, the intent layer), the profile, the Figma file
//   sourcesNow(sources, { get })    → { what: id } (the latest commit, or Figma's version; null when it cannot be read)
//   changes(now, last)              → [{ what, from, to }] (a source that cannot be read counts as changed)
//
// The engine's own version counts too: a new engine is a new build. Nothing is written but the record of the last build.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseGitlabProject } from './gitlab-source.mjs';

// Where a build reads from. A place written only (the style guide the build publishes) is left out: its own commits
// would start the next build.
export function sourcesOf(ROOT, cfg = {}) {
  const out = [];
  let mirror = null;
  try { mirror = JSON.parse(readFileSync(join(ROOT, '.gitlab-source.json'), 'utf8')); } catch { /* the code is a folder, or not from GitLab */ }
  if (mirror?.source) out.push({ what: 'the code', gitlab: mirror.source, ref: mirror.branch ?? mirror.ref ?? null });
  for (const [part, s] of Object.entries(cfg.stores ?? {})) {
    const r = s?.read;
    if (r?.gitlab) out.push({ what: part, gitlab: r.gitlab, ref: r.branch ?? r.ref ?? null, path: r.path ?? null });
  }
  // The intent layer, when it is a GitLab project (a GitHub one or a folder of the project is not asked of GitLab).
  const il = typeof cfg.intentLayer === 'string' ? (/^https?:\/\//i.test(cfg.intentLayer) && !/^https?:\/\/(www\.)?github\.com\//i.test(cfg.intentLayer) ? cfg.intentLayer : null) : cfg.intentLayer?.gitlab ?? (cfg.intentLayer?.url && !/github\.com\//i.test(cfg.intentLayer.url) ? cfg.intentLayer.url : null);
  if (il && !out.some((x) => x.what === 'intentLayer')) out.push({ what: 'intentLayer', gitlab: il, ref: null });
  // The profile: a file in a project (…/-/blob/<ref>/<path>).
  const prof = /^(https?:\/\/[^/]+\/.+?)\/-\/blob\/([^/]+)\/(.+)$/.exec(String(cfg.profile?.source ?? ''));
  if (prof) out.push({ what: 'the profile', gitlab: prof[1], ref: prof[2], path: decodeURIComponent(prof[3]) });
  if (cfg.figmaFileKey) out.push({ what: 'Figma', figma: cfg.figmaFileKey });
  return out;
}

// Each source's latest commit (for its path when it has one), and the Figma file's version. get(url, headers) → { ok,
// json() }. env: GITLAB_TOKEN, FIGMA_TOKEN.
export async function sourcesNow(sources, { get, env = process.env } = {}) {
  const out = {};
  for (const s of sources) {
    const key = s.what + (s.path ? `:${s.path}` : '');
    try {
      if (s.figma) {
        if (!env.FIGMA_TOKEN) { out[key] = 'not read (no FIGMA_TOKEN)'; continue; }
        const r = await get(`https://api.figma.com/v1/files/${encodeURIComponent(s.figma)}?depth=1`, { 'X-Figma-Token': env.FIGMA_TOKEN });
        const j = r.ok ? await r.json() : null;
        out[key] = j?.version ? String(j.version) : null;
        continue;
      }
      const p = parseGitlabProject(s.gitlab, env);
      if (!p) { out[key] = null; continue; }
      const api = `${p.origin}/api/v4/projects/${encodeURIComponent(p.path)}`;
      const headers = env.GITLAB_TOKEN ? { 'PRIVATE-TOKEN': env.GITLAB_TOKEN } : {};
      let ref = s.ref ?? p.ref;
      if (!ref) { const r = await get(api, headers); ref = r.ok ? (await r.json())?.default_branch ?? null : null; }
      const q = new URLSearchParams({ per_page: '1', ...(ref ? { ref_name: ref } : {}), ...(s.path ? { path: s.path } : {}) });
      const r = await get(`${api}/repository/commits?${q}`, headers);
      const list = r.ok ? await r.json() : null;
      // A path with no commit yet (a folder not made) is a state of its own, not one that cannot be read.
      out[key] = Array.isArray(list) ? (list[0]?.id ? String(list[0].id) : 'none yet') : null;
    } catch { out[key] = null; }
  }
  return out;
}

// What moved: a source whose id differs from the last build's, one the last build did not have, and one that cannot be
// read now (better a build too many than a change missed). A source that is never read (no FIGMA_TOKEN) is no change.
export function changes(now, last = {}) {
  const out = [];
  for (const [what, id] of Object.entries(now)) {
    if (typeof id === 'string' && id.startsWith('not read')) continue;
    if (id == null || last[what] !== id) out.push({ what, from: last[what] ?? null, to: id });
  }
  return out;
}

export const short = (x) => (x == null ? 'unread' : /^[0-9a-f]{12,}$/i.test(x) ? x.slice(0, 8) : String(x));
export function readLast(file) { try { return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null; } catch { return null; } }

// guide-follow.mjs - a change the engine made in the intent layer, followed all the way to the style guide the team opens.
//
// A decision copied from the style guide (a proposal answered, drafts approved or dropped, a part named, lines drafted)
// is pasted into Claude Code and committed to the layer by the engine. The person then opens the style guide to see it,
// and the page they open is the published one. So after a commit to the layer, the command that made it:
//   1. builds the style guide again here, from the layer as it is now (the build reads it where it lives);
//   2. checks the new page: built from the commit just made, and the pages the change was about are on it;
//   3. publishes it where the team's guide lives: the style guide store the setup or the team's profile names (its page
//      sent there), else the system's own publish job (started on GitHub or GitLab with the person's token), else it
//      says the guide here is the one updated and how to publish one for the team.
// Nothing is written but the style guide this engine builds; every line says what happened.
//
//   guideFollow(ROOT, cfg, { pages, sha, engine, publish, env, build, send }) → [line]
//   publishTarget(ROOT, cfg, { stores }) → { kind: 'store' | 'github' | 'gitlab' | null, ... }
//   startJob(target, { env, send, folders }) → { ok, line }

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { OUT_DIR } from './names.mjs';
import { readPage } from './styleguide-files.mjs';
import { remoteOf } from './publish-job.mjs';
import { envFrom, writeTokenFrom, plainSend } from './gitlab-source.mjs';

export const GUIDE_OUT = `${OUT_DIR}/styleguide/index.html`;
const JOB_GITHUB = '.github/workflows/style-guide.yml';
const JOBS_GITLAB = ['.gitlab/style-guide.gitlab-ci.yml', '.gitlab-ci.yml'];

// Where the team's style guide is published from. A store (stores.styleguide, from ds-config.json or the profile) wins:
// it is the page the team opens. Else the publish job in the system's own repository (--publish-styleguide wrote it).
export function publishTarget(ROOT, cfg = {}, { stores = null } = {}) {
  if (stores?.styleguide?.write) return { kind: 'store' };
  const remote = remoteOf(ROOT);
  if (remote?.host === 'github' && existsSync(join(ROOT, JOB_GITHUB))) return { kind: 'github', ...remote, job: JOB_GITHUB };
  const gl = JOBS_GITLAB.find((f) => { try { return /^pages:/m.test(readFileSync(join(ROOT, f), 'utf8')); } catch { return false; } });
  if (remote?.host === 'gitlab' && gl) return { kind: 'gitlab', ...remote, job: gl };
  return { kind: null, ...(remote ? { remote } : {}) };
}

// The system's publish job started now, on its default branch, with the person's own token: GitHub's workflow_dispatch
// (GITHUB_TOKEN or GH_TOKEN, allowed to run workflows), GitLab's new pipeline (GITLAB_WRITE_TOKEN, a developer of it).
export async function startJob(t, { env = process.env, send = plainSend, folders = [] } = {}) {
  if (t.kind === 'github') {
    const by = `https://github.com/${t.path}/actions/workflows/${t.job.split('/').pop()}`;
    const token = envFrom('GITHUB_TOKEN', env, folders) || envFrom('GH_TOKEN', env, folders);
    if (!token) return { ok: false, line: `   The style guide job was not started: no GITHUB_TOKEN here. Start it by hand (Run workflow): ${by}` };
    try {
      const r = await send(`https://api.github.com/repos/${t.path}/actions/workflows/${encodeURIComponent(t.job.split('/').pop())}/dispatches`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'rms-design-system-engine' }, body: { ref: t.branch } });
      return r.ok ? { ok: true, line: `🚀 The style guide job started on GitHub (${t.branch}): the published page follows in a few minutes. ${by}` }
        : { ok: false, line: `   The style guide job was not started (GitHub answered ${r.status}: the token needs to run workflows in ${t.path}). Start it by hand (Run workflow): ${by}` };
    } catch (e) { return { ok: false, line: `   The style guide job was not started (${String(e.message).split('\n')[0]}). Start it by hand (Run workflow): ${by}` }; }
  }
  if (t.kind === 'gitlab') {
    const by = `${t.origin}/${t.path}/-/pipelines/new`;
    const token = writeTokenFrom(env, folders);
    if (!token) return { ok: false, line: `   The style guide job was not started: no GITLAB_WRITE_TOKEN here. Start a pipeline on ${t.branch} by hand: ${by}` };
    try {
      const r = await send(`${t.origin}/api/v4/projects/${encodeURIComponent(t.path)}/pipeline?ref=${encodeURIComponent(t.branch)}`, { method: 'POST', headers: { 'PRIVATE-TOKEN': token } });
      const url = r.ok ? (await r.json().catch(() => null))?.web_url : null;
      return r.ok ? { ok: true, line: `🚀 The style guide job started on GitLab (${t.branch}): the published page follows in a few minutes. ${url ?? `${t.origin}/${t.path}/-/pipelines`}` }
        : { ok: false, line: `   The style guide job was not started (GitLab answered ${r.status}: the token needs to run pipelines in ${t.path}). Start one on ${t.branch} by hand: ${by}` };
    } catch (e) { return { ok: false, line: `   The style guide job was not started (${String(e.message).split('\n')[0]}). Start one on ${t.branch} by hand: ${by}` }; }
  }
  return { ok: false, line: '' };
}

// The built page's data: what the layer was read at, and its pages by name.
export function guideLayer(page) {
  let data = null;
  try { data = JSON.parse(readPage(page).match(/<script type="application\/json" id="sg-data">([\s\S]*?)<\/script>/)?.[1] ?? 'null'); } catch { return null; }
  const il = data?.intentLayer;
  if (!il) return null;
  return { sha: il.source?.sha ?? null, pages: (il.pages ?? []).map((p) => p.name).filter(Boolean) };
}

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const spawnBuild = (ROOT, engine, env) => spawnSync(process.execPath, [join(engine, 'audit.mjs'), '--styleguide'], { cwd: ROOT, encoding: 'utf8', env: { ...env, NO_COLOR: '1' }, maxBuffer: 64 * 1024 * 1024 });

// The page sent to the team's style guide store, with what it was built from beside it (built-from.json), as a build
// that publishes sends it. → the store's answer ({ ok, line })
export async function storePublish(ROOT, cfg, page, { env = process.env, offline = false } = {}) {
  const st = await import('./stores.mjs'), gf = await import('./guide-freshness.mjs');
  const files = st.pageFiles(page);
  try {
    const { plainGet } = await import('./gitlab-source.mjs');
    files.set(gf.BUILT_FROM, Buffer.from(JSON.stringify(gf.builtFrom(await gf.sourcesFor(ROOT, cfg, { get: (url, headers) => plainGet(url, { headers }), env })), null, 1) + '\n'));
  } catch { /* published without the record */ }
  return st.pushStore(ROOT, cfg, 'styleguide', files, 'Style guide published with rms-design-system-engine, after a change to the intent layer', { offline });
}

export async function guideFollow(ROOT, cfg = {}, { pages = [], sha = null, engine, stores = null, publish = null, env = process.env, build = spawnBuild, rebuild = true, send = plainSend, offline = false } = {}) {
  if (!stores) { try { stores = (await import('./stores.mjs')).storesOf(cfg); } catch { stores = {}; } }
  if (!publish) publish = (page) => storePublish(ROOT, cfg, page, { env, offline });
  const out = [];
  const page = resolve(ROOT, cfg.styleguide?.out ?? GUIDE_OUT);
  // 1. The guide built again here, from the layer as it is now (a style guide build that made the change has just built it).
  if (rebuild) {
    out.push('🔁 Building the style guide again with the change...');
    const b = build(ROOT, engine, env);
    const said = String(b.stdout ?? '').split('\n').filter((l) => /^\s*(🖼|🧭|❌)|Changed since the last read/.test(l)).map((l) => `   ${l.trim()}`);
    if (b.status !== 0 || !existsSync(page)) {
      out.push(...said, `❌ The style guide was not built again${b.status ? ` (exit ${b.status})` : ''}: the change is in the layer, the published page does not show it yet. Run rms-design-system-engine --styleguide to see why.`);
      return out;
    }
    out.push(...said);
  } else if (!existsSync(page)) return out;
  // 2. The new page checked: read at the commit just made, and showing the pages the change was about.
  const g = guideLayer(page);
  if (g) {
    const at = g.sha ? g.sha.slice(0, 8) : 'an unknown commit';
    const found = pages.filter((p) => g.pages.some((n) => norm(n) === norm(p)));
    const missing = pages.filter((p) => !found.includes(p));
    if (sha && g.sha && g.sha !== sha) out.push(`⚠️  The style guide read the layer at ${at}, not at the commit just made (${sha.slice(0, 8)}): the layer's host may not show it yet. The next build reads it.`);
    else out.push(`✅ The style guide is built from the layer at ${at}${found.length ? `, with the change on ${found.join(', ')}` : ''}${missing.length ? `; not found as a page of the layer: ${missing.join(', ')}` : ''}.`);
  }
  // 3. Published where the team's guide lives.
  const t = publishTarget(ROOT, cfg, { stores });
  if (t.kind === 'store') {
    const r = publish ? await publish(page) : null;
    out.push(r?.line ?? '   The style guide store was not written.');
  } else if (t.kind === 'github' || t.kind === 'gitlab') {
    out.push((await startJob(t, { env, send, folders: [ROOT, resolve(ROOT, '..')] })).line);
  } else {
    out.push(`   The style guide here is updated (${relative(ROOT, page)}). No published copy is set up for the team: rms-design-system-engine --publish-styleguide writes the job that publishes it, and a style guide store in the setup is published to at once.`);
  }
  return out;
}

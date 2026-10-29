// readmes.mjs - the README of each repository that holds something of the engine's, written from the setup, so what
// each one says is what is there today.
//
// The profile's repository: its whole README (how each person sets up, where each part lives) and the command each
// person installs (profile.mjs), both the engine's alone. Every other repository a store names: a section of the
// engine's, between two markers, saying what the engine keeps there, who writes it and how it stays current; what the
// team wrote around it stays. On every run each is generated, compared with what is there, and written only when it
// differs and GitLab lets the person running it write there (stores.mjs): a run without that access changes nothing
// and says nothing. A repository is asked again only when its branch moved, the setup changed or the engine did.
// `"readmes": false` in ds-config.json turns it off; --readmes writes them now and says what happened to each.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { SKILL, OUT_DIR } from './names.mjs';
import { parseGitlabUrl, refCandidates } from './gitlab-fetch.mjs';
import { parseGitlabProject } from './gitlab-source.mjs';
import { PARTS, LABEL, storesOf, describePlace, gitlabApi, placeAccess, samePlace } from './stores.mjs';
import { PROFILE_FILE, commandName, commandSkill } from './profile.mjs';
import { ENGINE_REPO } from './publish-job.mjs';

export const START = `<!-- ${SKILL}:start - written by the engine on every run: write around it, not in it -->`;
export const END = `<!-- ${SKILL}:end -->`;
const SECTION = new RegExp(`<!-- ${SKILL}:start[^>]*-->[\\s\\S]*?<!-- ${SKILL}:end -->`);
const STATE = `${OUT_DIR}/readmes.json`;
const README = 'README.md';
const MR_BRANCH = 'design-system-engine/readme';
const sha1 = (t) => createHash('sha1').update(t).digest('hex');
// The engine's own text: a new version of this file writes every README again.
const GEN = (() => { try { return sha1(readFileSync(fileURLToPath(import.meta.url))).slice(0, 12); } catch { return 'unknown'; } })();
const INSTALL = `${ENGINE_REPO.replace(/^https:\/\/github\.com\//, 'https://raw.githubusercontent.com/').replace(/\.git$/, '')}/main/install.sh`;
const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const list = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

// ── The section in a README ──────────────────────────────────────────────────────────────────────
// The engine's text between its markers, in place of the last (wherever the team moved them); a README without them
// gets it at its end, after what the team wrote.
export function withSection(text, section, { title = 'README' } = {}) {
  const block = `${START}\n${section.trim()}\n${END}`;
  const t = String(text ?? '');
  if (!t.trim()) return `# ${title}\n\n${block}\n`;
  if (SECTION.test(t)) return t.replace(SECTION, () => block);
  return `${t.replace(/\s*$/, '')}\n\n${block}\n`;
}

// ── Repositories ──────────────────────────────────────────────────────────────────────────────────────────
// A GitLab place's repository: { url, path, host, branch } (branch null: the project's default).
export function repoOf(place) {
  if (!place?.gitlab) return null;
  let host = ''; try { host = new URL(place.gitlab).host; } catch { return null; }
  const p = parseGitlabProject(place.gitlab, { GITLAB_HOST: host });
  if (!p) return null;
  return { url: `${p.origin}/${p.path}`, path: p.path, host: p.host, branch: place.branch ?? p.ref ?? null };
}
const keyOf = (r) => `${r.url}@${r.branch ?? ''}`;

// The profile's repository, from the link ds-config.json remembers (a GitLab file link): { …repo, file, source }.
export function profileRepo(cfg) {
  const source = cfg?.profile?.source;
  if (!source || !/^https?:\/\//i.test(source)) return null;
  const p = parseGitlabUrl(source);
  if (p?.kind !== 'file') return null;
  const c = refCandidates(p.refAndPath);
  const pick = c.find((x) => basename(x.file) === PROFILE_FILE) ?? c[0];
  return { url: `${p.origin}/${p.path}`, path: p.path, host: p.host, branch: pick?.ref ?? null, file: pick?.file ?? PROFILE_FILE, source };
}

// Each repository a store names, with the parts it holds there: [{ repo, parts: [{ part, path, read, write, mode, place }] }]
export function storeRepos(cfg) {
  const s = storesOf(cfg), out = new Map();
  for (const part of PARTS) {
    const { read, write, mode } = s[part];
    for (const [place, how] of [[read, 'read'], [write, 'write']]) {
      const repo = repoOf(place);
      if (!repo) continue;
      const k = keyOf(repo);
      if (!out.has(k)) out.set(k, { repo, parts: [] });
      const parts = out.get(k).parts;
      let e = parts.find((x) => x.part === part);
      if (!e) parts.push(e = { part, path: place.path || '', read: false, write: false, mode, place });
      e[how] = true;
      if (how === 'write') e.place = place;
    }
  }
  return [...out.values()];
}

// The client's short name: the profile's own (`client`), else the command folder its repository holds
// (rms-design-system-engine-<client>/), else its name without "DS" or "design system".
export function clientOf(profile, tree = []) {
  if (profile?.client) return String(profile.client).toLowerCase();
  const re = new RegExp(`^${SKILL}-([a-z0-9-]+)/SKILL\\.md$`);
  for (const f of tree) { const m = re.exec(f); if (m) return m[1]; }
  return String(profile?.name ?? '').toLowerCase().replace(/\b(ds|design[- ]system)\b/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'team';
}

// ── What each part is ─────────────────────────────────────────────────────────────────────────────
const PART_TEXT = {
  snapshots: ['Figma, captured as data, and what the engine measured', 'the engine, when someone refreshes from Figma (`--refresh-snapshots`)'],
  intentLayer: ['The written knowledge of the system: what each component, template and pattern is for, when to use it and when not to, its rules', 'the team; the engine corrects names that do not exist and drafts what is missing (a line it drafts starts with `**Draft:**` and reaches no agent until a person reviews it)'],
  contracts: ['One machine-readable contract per component, from the code and Figma', 'the engine (`--contracts-out`), never by hand'],
  kept: ['The differences between Figma and the code kept on purpose: which side is right, and why', 'the engine, when someone keeps one (`--keep`)'],
  styleguide: ['The style guide', 'the engine, when it publishes the guide (`--publish-styleguide`)'],
  decisions: ["The team's decisions: answers to the engine's proposals, criteria checked by hand, differences accepted as debt", 'the engine, when someone decides'],
  themes: ['The themes the team made in the style guide, one `<name>.theme.json` each', 'the engine, when someone saves a theme in the guide'],
};
const SNAPSHOT_TEXT = {
  'figma-vars': 'Every Figma variable (the tokens): its value in each mode and what it points to',
  'figma-structure': "Each component's layers as Figma draws them: sizes, spacing, radii and the variable each is bound to",
  'figma-component-props': "Each component's properties and variants, with the description written in Figma",
  'figma-examples': 'The example frames drawn in Figma (right and wrong use), for the guide\'s pictures',
  'figma-brands': 'The brands and what each one changes',
  'figma-effects': 'The effect styles (shadows)',
  'figma-motion': 'The motion variables (easing and duration)',
  'figma-icons': 'The icons as Figma draws them',
  'figma-icon-inventory': 'Every icon in the Figma file',
  'figma-templates': 'The templates and the components each one composes',
  'figma-screens': 'The screens drawn in Figma',
  'figma-screen-components': 'The components each screen uses',
  'figma-screen-layout': "Each screen's layout",
  'figma-screen-a11y': "Each screen's accessibility notes",
  'figma-frame-geometry': "The frames' sizes and positions",
  'figma-annotation-categories': 'The annotation categories used in Figma',
  'html-structure': "Each component's HTML structure as the code renders it, accepted by the team, so a change to it shows",
  'component-values': "Each component's values in every variant, as Figma draws them",
  'component-composition': 'Which components each component nests',
  'a11y-results': "Each component's accessibility results from the last build, so the next build tries only what changed",
  'open-since': 'When each open task was first found, so the guide says how long each one has been open',
  'health-history': "The Status page's numbers at each release, so each card shows its trend beside today's",
};
const snapshotText = (f) => SNAPSHOT_TEXT[basename(f).replace(/\.snapshot\.json$/i, '')] ?? 'A snapshot the engine reads';
// A place, for a table: the project, then its folder.
const placeText = (pl) => { const r = repoOf(pl); if (!r) return pl?.folder ? `the folder \`${pl.folder}${pl.path ? '/' + pl.path : ''}\`` : describePlace(pl); return `\`${r.path}\`${pl.path ? `, \`${pl.path}/\`` : ''}${r.branch ? ` (branch \`${r.branch}\`)` : ''}`; };
const whereIn = (e) => (e.path ? `\`${e.path}/\`` : e.part === 'styleguide' ? '`index.html`' : 'this repository');

// ── The profile's README ──────────────────────────────────────────────────────────────────────────────
// profile: the profile file as its repository holds it; repo: profileRepo(cfg).
export function profileReadme(profile, repo, { client } = {}) {
  const name = profile?.name || 'The design system';
  const slug = client ?? clientOf(profile);
  const cmd = commandName(slug);
  const s = storesOf({ stores: profile?.stores ?? {} });
  const rows = [];
  if (profile?.project) rows.push(`| The code | ${repoOf({ gitlab: profile.project })?.path ? `\`${repoOf({ gitlab: profile.project }).path}\`` : profile.project} |`);
  for (const part of PARTS) {
    const { read, write } = s[part];
    if (!read && !write) continue;
    const same = samePlace(read, write);
    rows.push(`| ${LABEL[part]} | ${same || !write ? placeText(read) : read ? `read from ${placeText(read)}, written to ${placeText(write)}` : placeText(write)} |`);
  }
  return `# ${name} profile

Where everything of ${name} lives, for ${SKILL}: one file every person's engine reads, so nobody sets up locations by hand. Only maintainers change this repository: whoever can change it can point everyone somewhere else.

## Set up (each person, once)

1. **Run this in a terminal:**

   \`\`\`bash
   curl -fsSL ${INSTALL} | bash -s -- --client ${slug} --profile '${repo.source}'
   \`\`\`

   It installs the engine and the \`/${cmd}\` command, sets up a work folder (\`~/${slug}-design-system\`; add \`--folder <path>\` for another) and asks for your GitLab token.

2. **Paste your GitLab token when it asks.** Nothing shows as you paste, and it is kept only in your work folder's \`.env\`. To make one: [Personal access tokens](https://${repo.host}/-/user_settings/personal_access_tokens) → Add new token, fine-grained, with Read on the design system's projects (and Commit and Merge request Create, to change them). What you may change is what GitLab lets your token do.

3. **Restart Claude Code** (or start a new session), open the work folder and run \`/${cmd}\`.

Running the same line again updates the engine and the command.

### If something is wrong

- **"/${cmd} isn't a command":** restart Claude Code. If it still is not there, the install could not read this profile: check that your token can read this repository, then run the line in step 1 again.
- **"command not found: ${SKILL}" in a terminal:** add \`export PATH="$HOME/.local/bin:$PATH"\` to \`~/.zshrc\` (or \`~/.bashrc\`) and open a new terminal.

## Where each part lives
${rows.length ? `
| Part | Where |
|---|---|
${rows.join('\n')}
` : '\nThis profile names no place yet: each person keeps every part in their own work folder.\n'}
## What is in it

| File | What it holds |
|---|---|
| \`${repo.file}\` | The shared setup: the Figma file, where the code is, and where each part lives. Never a token. |
| \`${cmd}/SKILL.md\` | The command the install writes for each person: \`/${cmd}\`, ${SKILL} with this profile. |
| \`README.md\` | This page. |

## For maintainers

A location that changes is changed here, in \`${repo.file}\`: everyone's next run takes it. This page and the command are written by ${SKILL} from that file, and a maintainer's next run brings them up to date: never edit them by hand.
`;
}

// ── A store's section ──────────────────────────────────────────────────────────────────────────────────
// entry: one of storeRepos(cfg); tree: the repository's files; ci: its .gitlab-ci.yml (or null); others: the other
// entries; prof: profileRepo(cfg); project: the code's link; publish: the setup's `styleguide.publish`.
export function storeSection(entry, { name = 'the design system', tree = [], ci = null, others = [], prof = null, project = null, publish = null } = {}) {
  const { repo, parts } = entry;
  const built = Boolean(ci && /audit\.mjs/.test(ci));   // a pipeline here runs the engine
  const out = [`## What ${SKILL} keeps here`, '', `| What | Where | Written by |`, '|---|---|---|'];
  for (const e of parts) out.push(`| ${PART_TEXT[e.part][0]} | ${whereIn(e)} | ${e.write ? PART_TEXT[e.part][1] : 'read here; written elsewhere'} |`);
  const read = parts.filter((e) => e.read).map((e) => lower(LABEL[e.part]));
  const written = parts.filter((e) => e.write).map((e) => lower(LABEL[e.part]));
  out.push('', [
    read.length ? `Everyone's engine reads the ${list(read)} from here.` : '',
    written.length ? `It writes the ${list(written)} only where GitLab lets the person running it write: Developer on this project and a push to ${repo.branch ? `\`${repo.branch}\`` : 'the default branch'}, or else a merge request.` : '',
  ].filter(Boolean).join(' '));

  if (parts.some((e) => e.part === 'styleguide' && e.write)) {
    const at = parts.find((e) => e.part === 'styleguide').path;
    out.push('', '### The style guide', '', `**Open it:** \`${at ? at + '/' : ''}index.html\` in this repository. On your computer: download \`index.html\` and the \`assets\` folder beside it (or the whole repository as a zip) and open \`index.html\`. Nothing in it is written by hand: the engine builds it from the code, Figma (through the snapshots), the intent layer and the team's decisions, so it always says what the system is today.`, '',
      ...(built ? [] : [`**How it is updated:** nothing here builds it on its own; whoever runs the engine does. \`--styleguide\` builds it${publish === 'auto' ? ' and sends it here when it is behind what it is built from' : ''}; \`--publish-styleguide\` sends it at any time.`, '']),
      '| Page | What it tells you |', '|---|---|',
      '| **Status** | How far the system is: parity with Figma, how much is built, accessibility, and documentation |',
      "| **Showroom** | The products' screens drawn with the system's components |",
      '| **Changelog** | What changed in each release, and the components it affected |',
      '| **Documentation** | Every component\'s documentation from every source, what agents read from it, and what a person must review or is still missing |',
      '| **Identity**, **Tokens**, **Icons** | The foundations: the identity, every token in every mode, the icons |',
      '| **Components** | Each component: its variants and states, its properties, its tokens, its accessibility, its documentation, and where the code and Figma still differ |');
  }

  const snaps = parts.find((e) => e.part === 'snapshots');
  if (snaps) {
    const pre = snaps.path ? snaps.path + '/' : '';
    const files = tree.filter((f) => f.startsWith(pre) && /\.snapshot\.json$/i.test(f)).map((f) => f.slice(pre.length)).sort();
    out.push('', '### The snapshots', '', 'Figma is not read on every build: it is captured once, as data, by whoever refreshes from it, and every build reads that capture. A change in Figma reaches what is built from it only when someone refreshes the snapshots.');
    if (files.some((f) => f.includes('/'))) out[out.length - 1] += ' A file in a folder keeps the path it has in the code\'s project, so the engine finds it where it expects.';
    if (files.length) out.push('', '| File | What it holds |', '|---|---|', ...files.map((f) => `| \`${f}\` | ${snapshotText(f)} |`));
  }

  if (built) {
    const vars = [...ci.matchAll(/^#\s+([A-Z][A-Z0-9_]{2,})\s{2,}(\S.*)$/gm)].map((m) => [m[1], m[2].trim()]);
    const hourly = /--ci-changed/.test(ci), weekly = /DOC_STRESS/.test(ci);
    // A rule that skips the build while a variable is unset (`- if: '$X == null'` then `when: never`): the team
    // publishes by hand until it sets that variable, so the steps below turn the automatic build on.
    const gate = ci.match(/-\s*if:\s*['"]?\$([A-Z][A-Z0-9_]*)\s*==\s*(?:null|""|'')['"]?\s*\n\s*when:\s*never/)?.[1];
    const runs = `\`.gitlab-ci.yml\` runs the engine here${hourly ? ': each hour it asks whether anything it is built from moved (the code, the stores, the profile, the Figma file, the engine) and stops in seconds when nothing did' : ''}`;
    out.push('', '### The pipeline', '', gate
      ? `The style guide is published by hand for now: \`.gitlab-ci.yml\` skips the build while \`${gate}\` is not set, and whoever runs the engine publishes it. Once these steps are done, ${runs.replace('`.gitlab-ci.yml` runs', 'it runs')}. To turn the automatic build on (a maintainer, once):`
      : `${runs}. To set it up (a maintainer, once):`, '');
    let n = 1;
    if (vars.length) out.push(`${n++}. **Settings → CI/CD → Variables**, each one masked and protected:`, '', '   | Key | What it is |', '   |---|---|', ...vars.map(([k, v]) => `   | \`${k}\` | ${v} |`), '');
    if (/CI_PIPELINE_SOURCE\s*==\s*"schedule"/.test(ci)) {
      out.push(`${n++}. **Build → Pipeline schedules → New schedule**, on the default branch${weekly ? ', twice' : ''}:`);
      out.push(`   - ${hourly ? 'interval `0 * * * *`, no variables' : 'the interval the team wants'};`);
      if (weekly) out.push('   - interval `0 6 * * 1` (Mondays at 06:00), variable `DOC_STRESS` = `1`: the documentation put under load.');
      out.push('');
    }
    out.push(`${n}. **Build → Pipelines → Run pipeline** once, to see the first build go through.`);
  }

  out.push('', '### Who can do what', '', '| Role on this project | What it lets them do |', '|---|---|',
    '| Reporter | Read it: their engine reads what it needs from here |',
    `| Developer | ${written.length ? `Send the ${list(written)} here through the engine` : 'Change it'} |`,
    '| Maintainer | Everything above, and give access |',
    '', 'GitLab gives access to a whole project, not to a folder: a Developer here can change all of it.');

  const related = [];
  if (prof) related.push(`- \`${prof.path}\`: the profile, where everything of ${name} lives; every engine reads it on every run`);
  const code = project ? repoOf({ gitlab: project })?.path : null;
  if (code) related.push(`- \`${code}\`: the code`);
  for (const o of others) if (keyOf(o.repo) !== keyOf(repo)) related.push(`- \`${o.repo.path}\`: the ${list(o.parts.map((e) => lower(LABEL[e.part])))}`);
  if (related.length) out.push('', '### Related projects', '', ...related);
  if (prof) out.push('', `To work with the system yourself, set up ${SKILL} as \`${prof.path}\`'s README says.`);
  out.push('', `_This section is written by ${SKILL} from the setup on every run; what is outside it is the team's._`);
  return out.join('\n');
}

// ── Reading and writing ─────────────────────────────────────────────────────────────────────────────────
function readState(ROOT) { try { return JSON.parse(readFileSync(resolve(ROOT, STATE), 'utf8')); } catch { return {}; } }
function writeState(ROOT, st) { const f = resolve(ROOT, STATE); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify(st, null, 1) + '\n'); }

async function reader(ROOT, repo, opts, known = null) {
  const api = gitlabApi(ROOT, { gitlab: repo.url, path: '' }, opts);
  if (api.error) return { error: api.error };
  let branch = repo.branch ?? known;   // the default branch, as it was last time: one call fewer on every run
  if (!branch) { const r = await api.get(''); if (!r.ok) return { error: `GitLab answered ${r.status}` }; branch = (await r.json())?.default_branch || 'main'; }
  const c = await api.get(`/repository/commits/${encodeURIComponent(branch)}`);
  if (!c.ok) return known && !repo.branch ? reader(ROOT, repo, opts) : { error: `GitLab answered ${c.status} for ${branch}` };
  const head = String((await c.json())?.id ?? '');
  const file = async (f) => { const r = await api.get(`/repository/files/${encodeURIComponent(f)}/raw?ref=${encodeURIComponent(head || branch)}`); return r.ok ? Buffer.from(await r.arrayBuffer()).toString('utf8') : null; };
  const tree = async () => {
    const all = [];
    for (let page = 1; page <= 50; page++) {
      const r = await api.get(`/repository/tree?ref=${encodeURIComponent(head || branch)}&recursive=true&per_page=100&page=${page}`);
      if (!r.ok) break;
      const items = await r.json();
      for (const it of items ?? []) if (it.type === 'blob') all.push(it.path);
      if (!items || items.length < 100) break;
    }
    return all;
  };
  return { api, branch, head, file, tree };
}

// Write the files that differ, where GitLab lets this person: a commit, or one merge request the engine keeps open.
async function send(ROOT, repo, place, mode, changed, there, message, opts) {
  const a = await placeAccess(ROOT, { ...place, gitlab: repo.url, branch: repo.branch, path: '' }, mode, opts);
  if (!a.mode || a.mode === 'folder') return { ok: false, why: a.why || 'not a GitLab project' };
  const api = a.api;
  const actions = changed.map(([f, text]) => ({ action: there.has(f) ? 'update' : 'create', file_path: f, content: Buffer.from(text).toString('base64'), encoding: 'base64' }));
  if (a.mode === 'commit') {
    const c = await api.send('POST', '/repository/commits', { branch: a.branch, commit_message: message, actions });
    if (!c.ok) return { ok: false, why: `GitLab answered ${c.status} to the commit` };
    const j = await c.json();
    return { ok: true, head: j?.id ?? null, how: `committed on ${a.branch}${j?.web_url ? ` (${j.web_url})` : ''}` };
  }
  const b = await api.get(`/repository/branches/${encodeURIComponent(MR_BRANCH)}`, { write: true });
  const c = await api.send('POST', '/repository/commits', { branch: MR_BRANCH, ...(b.ok ? {} : { start_branch: a.branch }), commit_message: message, actions });
  if (!c.ok) return { ok: false, why: `GitLab answered ${c.status} to the commit on ${MR_BRANCH}` };
  const open = await api.get(`/merge_requests?state=opened&source_branch=${encodeURIComponent(MR_BRANCH)}`, { write: true });
  const had = open.ok ? (await open.json())?.[0] : null;
  if (had) return { ok: true, head: null, how: `added to the merge request ${had.web_url ?? ''}`.trim() };
  const m = await api.send('POST', '/merge_requests', { source_branch: MR_BRANCH, target_branch: a.branch, title: message.split('\n')[0], description: message, remove_source_branch: true });
  const url = m.ok ? (await m.json())?.web_url : null;
  return m.ok ? { ok: true, head: null, how: `sent as a merge request${url ? ` (${url})` : ''}` } : { ok: false, why: `GitLab answered ${m.status} to the merge request` };
}

// → [line]. opts: { offline, verbose (say what was not written, and why), force (ask every repository again), dry (an
// array: what would be written is put in it, nothing is sent), env, http }
export async function syncReadmes(ROOT, cfg, opts = {}) {
  if (opts.offline || cfg?.readmes === false) return [];
  const lines = [], say = (l) => lines.push(l), note = (l) => { if (opts.verbose) lines.push(l); };
  const st = readState(ROOT), next = { ...st };
  const setup = sha1(JSON.stringify([cfg?.stores ?? null, cfg?.profile?.sha ?? null, cfg?.project ?? null, cfg?.styleguide?.publish ?? null, GEN]));
  const prof = profileRepo(cfg);
  const repos = storeRepos(cfg);
  let profile = null;

  const visit = async (repo, build, { place = {}, mode = 'commit', label }) => {
    const k = keyOf(repo);
    let r;
    try { r = await reader(ROOT, repo, opts, st[k]?.branch); } catch (e) { note(`ℹ️  README of ${repo.path}: not read (${e.message})`); return; }
    if (r.error) { note(`ℹ️  README of ${repo.path}: not read (${r.error})`); return; }
    if (!opts.force && st[k]?.head === r.head && st[k]?.setup === setup) return;
    const tree = await r.tree();
    const files = await build(r, tree);
    const there = new Set(tree), changed = [];
    for (const [f, text] of files) { const now = there.has(f) ? await r.file(f) : null; if (now !== text) changed.push([f, text]); }
    if (!changed.length) { next[k] = { head: r.head, branch: r.branch, setup }; note(`✅ README of ${repo.path}: up to date`); return; }
    if (opts.dry) { for (const [f, text] of changed) opts.dry.push({ repo: repo.path, file: f, now: there.has(f) ? await r.file(f) : null, text }); return; }
    const w = await send(ROOT, { ...repo, branch: r.branch }, place, mode, changed, there, `${label} brought up to date by ${SKILL}`, opts);
    // Not asked again until the branch, the setup or the engine moves: a person who may only read is not asked each run.
    if (!w.ok) { next[k] = { head: r.head, branch: r.branch, setup, unwritten: true }; note(`ℹ️  README of ${repo.path} not written: ${w.why}`); return; }
    next[k] = { head: w.head ?? r.head, branch: r.branch, setup };
    say(`📝 ${changed.map(([f]) => f).join(', ')} of ${repo.path} brought up to date: ${w.how}`);
  };

  if (prof) {
    await visit(prof, async (r, tree) => {
      try { profile = JSON.parse(await r.file(prof.file) ?? 'null'); } catch { profile = null; }
      if (!profile) return [];
      const client = clientOf(profile, tree);
      return [[README, profileReadme(profile, prof, { client })], [`${commandName(client)}/SKILL.md`, commandSkill(client, prof.source, { name: profile.name })]];
    }, { label: 'The profile\'s README and command' });
  }
  const name = cfg?.profile?.name ?? profile?.name ?? cfg?.name ?? 'the design system';
  // The profile file, read once when a store's README is built and the profile's own repository was not visited this
  // run: its project (the code) is in every store's section, so a section never loses it between runs.
  const profileFile = async () => {
    if (profile || !prof) return profile;
    try { const r = await reader(ROOT, prof, opts); if (!r.error) profile = JSON.parse(await r.file(prof.file) ?? 'null'); } catch { profile = null; }
    return profile;
  };
  for (const entry of repos) {
    if (prof && keyOf(entry.repo) === keyOf(prof)) continue;
    const w = entry.parts.find((e) => e.write) ?? entry.parts[0];
    const mode = entry.parts.some((e) => e.write && e.mode === 'commit') ? 'commit' : w.mode;
    await visit(entry.repo, async (r, tree) => {
      const ci = tree.includes('.gitlab-ci.yml') ? await r.file('.gitlab-ci.yml') : null;
      const now = tree.includes(README) ? await r.file(README) : '';
      const title = `${name} ${list(entry.parts.map((e) => lower(LABEL[e.part])))}`;
      const project = cfg?.project ?? (await profileFile())?.project;
      return [[README, withSection(now, storeSection(entry, { name, tree, ci, others: repos, prof, project, publish: cfg?.styleguide?.publish }), { title })]];
    }, { place: { tokenEnv: w.place?.tokenEnv ?? null, writeTokenEnv: w.place?.writeTokenEnv ?? null }, mode, label: 'README' });
  }
  if (JSON.stringify(next) !== JSON.stringify(st)) writeState(ROOT, next);
  return lines;
}

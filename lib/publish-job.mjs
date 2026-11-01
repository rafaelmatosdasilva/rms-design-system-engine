// publish-job.mjs - the CI job that publishes the style guide, one link the whole team shares, rebuilt from what is
// merged on every push (GitHub Pages or GitLab Pages, as the project's own git remote says). A local run of
// --styleguide stays a preview; this job is what the team opens.
//
// The job checks out the engine (its public repository), builds the page the audit measures on, runs the audit (a
// failing audit still publishes: the page shows the differences), builds the page again with them, checks it against
// the system (only the system's tokens and components, its own accessibility: a page that fails is not published),
// and publishes public/. The engine writes the file and says what to do next; it never commits, pushes or overwrites
// a job that is already there.
//
// It is built again when what it is built from moves, not only on a push here: every hour it asks each source
// (--ci-changed: the intent layer where it lives, the stores, the Figma file, the engine) and stops in seconds when
// nothing moved; and an intent layer kept in another repository starts it at once from a small job of its own
// (layerJob: written to the engine's output folder, for the person to add there), so a guideline changed there is on
// the page in minutes.
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { intentLayerConfig as layerConfig } from './doc-source-dsds.mjs';
import { exportProfile } from './profile.mjs';
import { OUT_DIR } from './names.mjs';

export const ENGINE_REPO = 'https://github.com/rafaelmatosdasilva/rms-design-system-engine.git';

// Where the project lives: 'github' or 'gitlab' from its git remote (or the CI folder it already has), else null.
export function hostOf(ROOT, { read = (f) => { try { return readFileSync(f, 'utf8'); } catch { return ''; } }, exists = existsSync } = {}) {
  const remote = /url\s*=\s*(\S+)/.exec(read(join(ROOT, '.git', 'config')))?.[1] ?? '';
  if (/github\.com[/:]/i.test(remote)) return 'github';
  if (/gitlab/i.test(remote)) return 'gitlab';
  if (exists(join(ROOT, '.gitlab-ci.yml'))) return 'gitlab';
  if (exists(join(ROOT, '.github'))) return 'github';
  return null;
}

// The project's own place on its host, from its git remote: { host, origin, path, branch } (path: owner/repo on GitHub,
// the project's path on GitLab; branch: the one checked out, the default a job runs on), else null.
export function remoteOf(ROOT, { read = (f) => { try { return readFileSync(f, 'utf8'); } catch { return ''; } } } = {}) {
  const remote = /url\s*=\s*(\S+)/.exec(read(join(ROOT, '.git', 'config')))?.[1] ?? '';
  const m = /^(?:https?:\/\/(?:[^@/]+@)?([^/]+)\/|[^@]+@([^:]+):)(.+?)(?:\.git)?\/?$/.exec(remote);
  if (!m) return null;
  const domain = m[1] ?? m[2], path = m[3];
  const host = /github\.com$/i.test(domain) ? 'github' : 'gitlab';
  const branch = /ref:\s*refs\/heads\/(\S+)/.exec(read(join(ROOT, '.git', 'HEAD')))?.[1] ?? 'main';
  return { host, origin: `https://${domain}`, path, branch };
}

// The products checked out beside the system (products.json), cloned the same way in the job so the page lists them.
export function productRepos(ROOT, read = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } }) {
  return (read(join(ROOT, 'products.json'))?.products ?? []).map((p) => String(p.repo ?? '')).filter((r) => /^[\w.-]+\/[\w.-]+$/.test(r));
}

const steps = (out, products, host) => {
  const clone = (r) => (host === 'github' ? `git clone --depth 1 "https://github.com/${r}.git" ../${r.split('/')[1]}` : `git clone --depth 1 "$CI_SERVER_URL/${r}.git" ../${r.split('/')[1]}`);
  return [
    ...products.map(clone),
    'node ../engine/audit.mjs --styleguide --no-a11y-bake   # the page the audit measures each component on',
    'node ../engine/audit.mjs || true                 # the differences the page shows; a failing audit still publishes',
    'node ../engine/audit.mjs --styleguide            # the page again, with them, its accessibility tried and kept in it',
    `node ../engine/audit.mjs --styleguide-check ${out}   # only the system on it, its own accessibility: else nothing is published`,
    `node ../engine/styleguide-files.mjs ${out} public   # the page and the files it links beside it (its styles, code, fonts, data)`,
    'cp .design-system-engine-out/differences.md public/differences.md 2>/dev/null || true',
  ];
};

// A project's own job that publishes the style guide by copying the page alone (cp <out> public/index.html: a job this
// engine wrote before the page had files beside it, or one written by hand). The page links its styles, code, fonts and
// data beside it (styleguide-files.mjs), so such a job publishes a page without them. → [{ file, line, text, fix }]
export function pageOnlyCopies(ROOT, out, { read = (f) => { try { return readFileSync(f, 'utf8'); } catch { return null; } } } = {}) {
  const files = [];
  const list = (dir) => { try { return readdirSync(join(ROOT, dir)).filter((f) => /\.ya?ml$/i.test(f)).map((f) => `${dir}/${f}`); } catch { return []; } };
  files.push(...list('.github/workflows'), '.gitlab-ci.yml', ...list('.gitlab'));
  const want = String(out).replace(/^\.\//, '');
  const found = [];
  for (const file of files) {
    const text = read(join(ROOT, file));
    if (text == null || /styleguide-files\.mjs/.test(text)) continue;   // it copies the page with its files already
    const engine = /(\S*?)\/audit\.mjs\b/.exec(text)?.[1] ?? '../engine';
    text.split('\n').forEach((l, i) => {
      for (const m of l.matchAll(/\bcp\s+(?:-\w+\s+)*["']?([^\s"';&|]+)["']?\s+["']?([^\s"';&|]+)["']?/g)) {
        const src = m[1].replace(/^\.\//, ''), dest = m[2];
        if (!/\.html?$/i.test(src) || !(src === want || src.endsWith('/' + want) || want.endsWith('/' + src) || src === '${out}')) continue;
        const to = /\.html?$/i.test(dest) ? (dest.includes('/') ? dest.slice(0, dest.lastIndexOf('/')) : '.') : dest;
        found.push({ file, line: i + 1, text: l.trim(), fix: `node ${engine}/styleguide-files.mjs ${src} ${to}` });
      }
    });
  }
  return found;
}
// stop: said by the check that runs before a job publishes (the job stops there: nothing published), else a warning.
export function pageOnlyLines(found, { stop = false } = {}) {
  return found.flatMap((f) => [`${stop ? '❌' : '⚠️ '} ${f.file}:${f.line} publishes the style guide's page alone (${f.text}): its styles, code, fonts and data are files beside it now, so the published page would be blank${stop ? '. Nothing is published until it copies them' : ''}.`,
    `   Replace that line with: ${f.fix}`]);
}

// GitHub Pages: built on every push to the default branch, when the intent layer's repository says it changed, and
// every hour when something it is built from moved (by hand too); deployed by GitHub's own Pages actions.
export const LAYER_EVENT = 'intent-layer-changed';
const LAST_BUILD = '.design-system-engine-out/ci-last-build.json';
export function githubJob({ out, products = [], branch = 'main' }) {
  const run = steps(out, products, 'github').map((l) => `          ${l}`).join('\n');
  const tokens = `          FIGMA_TOKEN: \${{ secrets.FIGMA_TOKEN }}
          GITLAB_TOKEN: \${{ secrets.GITLAB_TOKEN }}
          GITHUB_TOKEN: \${{ secrets.INTENT_LAYER_TOKEN || github.token }}`;
  return `name: style guide

# The design system's living style guide on GitHub Pages: one link the whole team shares, rebuilt from what is merged.
# Written by rms-design-system-engine --publish-styleguide. Turn Pages on once: Settings → Pages → Source: GitHub Actions.
# A FIGMA_TOKEN secret adds each component's Figma image beside the code; without it the page is built the same. An
# intent layer in a private repository needs an INTENT_LAYER_TOKEN secret that can read it (GITLAB_TOKEN on GitLab).
#
# Built again on every push here, at once when the intent layer's repository says it changed (its own job sends
# ${LAYER_EVENT}), and every hour when the intent layer, a store, the Figma file or the engine moved since the
# last build: an hour with nothing new stops in seconds.

on:
  push:
    branches: [${branch}]
  repository_dispatch:
    types: [${LAYER_EVENT}]
  schedule:
    - cron: '41 * * * *'
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    outputs:
      build: \${{ steps.changed.outputs.build }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0   # every commit and tag: each component's changelog and version
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - name: The engine
        run: git clone --depth 1 ${ENGINE_REPO} ../engine
      - name: What the last build was made from
        uses: actions/cache/restore@v4
        with:
          path: ${LAST_BUILD}
          key: style-guide-last-build-\${{ github.run_id }}
          restore-keys: style-guide-last-build-
      - name: Anything new since the last build
        id: changed
        env:
${tokens}
        run: |
          if [ "$GITHUB_EVENT_NAME" != schedule ]; then echo "build=true" >> "$GITHUB_OUTPUT"; exit 0; fi
          set +e; node ../engine/audit.mjs --ci-changed; code=$?; set -e
          if [ "$code" = 3 ]; then echo "build=false" >> "$GITHUB_OUTPUT"; else echo "build=true" >> "$GITHUB_OUTPUT"; fi
      - name: Build, audit and check the style guide
        if: steps.changed.outputs.build == 'true'
        env:
${tokens}
        run: |
${run}
      - name: Keep what this build was made from
        if: steps.changed.outputs.build == 'true'
        env:
${tokens}
        run: node ../engine/audit.mjs --ci-changed --record
      - uses: actions/cache/save@v4
        if: steps.changed.outputs.build == 'true'
        with:
          path: ${LAST_BUILD}
          key: style-guide-last-build-\${{ github.run_id }}
      - uses: actions/upload-pages-artifact@v3
        if: steps.changed.outputs.build == 'true'
        with:
          path: public

  deploy:
    needs: build
    if: needs.build.outputs.build == 'true'
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
`;
}

// GitLab Pages: the job must be named pages and publish public/; it runs on the default branch: a push, a schedule (every
// hour, set once in GitLab: it stops at once when nothing moved) or a trigger from the intent layer's own project.
export function gitlabJob({ out, products = [] }) {
  const run = steps(out, products, 'gitlab').map((l) => `    - ${l}`).join('\n');
  return `# The design system's living style guide on GitLab Pages: one link the whole team shares, rebuilt from what is merged.
# Written by rms-design-system-engine --publish-styleguide. Who can open it: Settings → General → Visibility → Pages
# (Only project members keeps it to the team). A FIGMA_TOKEN CI/CD variable adds each component's Figma image; a
# GITLAB_TOKEN that can read the intent layer's project, when it is private.
#
# Built again on every push to the default branch, at once when the intent layer's project triggers it (its own job,
# with a pipeline trigger token), and on a schedule (Build → Pipeline schedules, every hour): a scheduled run stops at
# once when nothing it is built from moved since the last build, marked as allowed to fail (exit code 3).
pages:
  image: node:24-bookworm
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
  variables:
    GIT_DEPTH: 0            # every commit and tag: each component's changelog and version
    CHROME_PATH: /usr/bin/chromium
  cache:
    key: style-guide-last-build
    paths:
      - ${LAST_BUILD}
  allow_failure:
    exit_codes: [3]         # a scheduled run with nothing new: stopped, nothing published
  before_script:
    - git clone --depth 1 ${ENGINE_REPO} ../engine
    - if [ "$CI_PIPELINE_SOURCE" = schedule ]; then node ../engine/audit.mjs --ci-changed; fi   # 3 when nothing moved
    - apt-get update -qq && apt-get install -y -qq chromium > /dev/null
  script:
${run}
    - node ../engine/audit.mjs --ci-changed --record   # what this build was made from, for the next scheduled run
  artifacts:
    paths:
      - public
`;
}

// The job for a team whose style guide is published to a store (stores.styleguide: a GitLab project of the team's), with
// the code in a repository it may only read, so no job can live beside the code. It lives in the store's own project and
// builds there from the company's profile (where the code, the intent layer, the stores and Figma are): every hour when
// something it is built from moved (--ci-changed), and at once when the intent layer's own job triggers it. It never
// runs on a push to the store, since the page it sends is one. What it may write is GitLab's answer for its token.
// profile: the profile's link (or a file kept beside the job in the store's project).
export function storeJob({ profile }) {
  const dse = 'node /opt/dse/audit.mjs';
  return `# Written by rms-design-system-engine --publish-styleguide for the style guide's own project: the guide built and
# published here by itself, from the company's profile, so a change to the intent layer, the code, Figma or the engine
# is on the page within the hour, and at once when the intent layer's own job triggers this one. It never runs on a
# push here: the page it sends is one. Set once in this project:
#   Settings → CI/CD → Variables (masked): GITLAB_TOKEN, a token that reads the code, the intent layer, the stores and
#   the profile; GITLAB_WRITE_TOKEN, this project's access token, which sends the page (GitLab decides what it may do);
#   FIGMA_TOKEN for each component's Figma image.
#   Build → Pipeline schedules: every hour, on the default branch.
style-guide-build:
  image: node:24-bookworm
  rules:
    - if: $CI_PIPELINE_SOURCE =~ /^(schedule|trigger|pipeline|web|api)$/
  variables:
    CHROME_PATH: /usr/bin/chromium
  cache:
    key: style-guide-build
    paths:
      - .dse/             # the code's mirror, the setup and what the last build was made from
  allow_failure:
    exit_codes: [3]       # a scheduled run with nothing new: stopped, nothing published
  before_script:
    - git clone --depth 1 ${ENGINE_REPO} /opt/dse
    - mkdir -p .dse && cd .dse
    - ${dse} --profile '${String(profile).replace(/'/g, "''")}' --ci-changed || { code=$?; if [ "$CI_PIPELINE_SOURCE" = schedule ] || [ "$code" != 3 ]; then exit $code; fi; }   # 3: nothing moved
    - apt-get update -qq && apt-get install -y -qq chromium > /dev/null
  script:
    - ${dse} --styleguide --no-a11y-bake --no-publish   # the page the audit measures each component on
    - ${dse} || true                                    # the differences the page shows; a failing audit still publishes
    - ${dse} --styleguide --no-publish                  # the page again, with them, its accessibility tried and kept in it
    - ${dse} --styleguide-check                         # only the system on it, its own accessibility: else nothing is published
    - ${dse} --publish-styleguide                       # sent to the style guide store, where GitLab lets the token write
    - ${dse} --ci-changed --record                      # what this build was made from, for the next scheduled run
`;
}

// Where the job that publishes the guide lives, for the intent layer's own job to start: the system's own repository
// (its remote), or the style guide store's project. → { host, origin, path, branch } | null
export function storeTarget(place) {
  if (!place?.gitlab) return null;
  try {
    const u = new URL(String(place.gitlab));
    const path = u.pathname.replace(/^\/+|\/+$/g, '').replace(/\/-\/.*$/, '').replace(/\.git$/, '');
    if (!path.includes('/')) return null;
    const branch = place.branch ?? (/\/-\/tree\/([^/]+)/.exec(u.pathname)?.[1] ?? 'main');
    return { host: 'gitlab', origin: `${u.protocol}//${u.host}`, path, branch };
  } catch { return null; }
}

// For a team published to a store: the store's job and the intent layer's own job (pointed at the store's project),
// written to the engine's output folder for the person to add, with what to set once. → [line]
export function writeStoreJobs(ROOT, cfg = {}, place) {
  const target = storeTarget(place);
  if (!target) return [`   The style guide store is not a GitLab project (${place?.folder ?? place?.github ?? 'nowhere'}): no job can build it there; whoever builds publishes it.`];
  const lines = [];
  let profile = cfg.profile?.source ?? null;
  const dir = join(ROOT, OUT_DIR);
  mkdirSync(dir, { recursive: true });
  if (!profile || !/^https?:\/\//i.test(profile)) {
    // No profile the pipeline can read: the setup as one (exportProfile: no token, nothing personal), kept beside the job
    // in the store's project (the job runs one folder down).
    let project = null; try { project = JSON.parse(readFileSync(join(ROOT, '.gitlab-source.json'), 'utf8')).source ?? null; } catch { /* the code is a folder */ }
    if (!project) return [`   The code is not read from GitLab here, so a job in ${target.path} could not reach it: whoever builds publishes the page (with "styleguide": { "publish": "auto" }, every build that is behind).`];
    writeFileSync(join(dir, 'design-system-engine-profile.json'), JSON.stringify(exportProfile(cfg, { project }), null, 2) + '\n');
    profile = '../design-system-engine-profile.json';
    lines.push(`   No company profile is set up, so the setup is written as one (${OUT_DIR}/design-system-engine-profile.json, no token in it): add it to ${target.path} beside the job.`);
  }
  writeFileSync(join(dir, 'style-guide-store-job.yml'), storeJob({ profile }));
  lines.unshift(`   So the page updates by itself, add the job in ${OUT_DIR}/style-guide-store-job.yml to ${target.path} (its .gitlab-ci.yml), with the variables and the hourly schedule its first lines name.`);
  const layer = layerConfig(cfg), lj = layerJob(layer, target);
  if (lj) {
    writeFileSync(join(dir, 'intent-layer-job.yml'), lj.text);
    lines.push(`   The intent layer lives in ${layer.url}: so a change there is published at once, add the job in ${OUT_DIR}/intent-layer-job.yml to that repository (${lj.file}), with ${lj.needs.join('; ')}.`);
  }
  return lines;
}

// The job for the intent layer's own repository: on every push to its default branch it tells the system's style guide
// job to build (GitHub: a repository_dispatch event; GitLab: a pipeline trigger), so a change there is published in
// minutes. layer: intentLayerConfig's { host, url }; system: remoteOf(ROOT). → { file, text, needs: [what to set once] }
// or null (a layer in the system's own repository: a push there already builds).
export function layerJob(layer, system) {
  if (!layer || layer.host === 'folder' || !system) return null;
  const sys = system.host === 'github' ? `${system.path}` : `${system.origin}/${system.path}`;
  const call = system.host === 'github'
    ? { secret: 'STYLE_GUIDE_TOKEN', cmd: `curl -fsS -X POST "https://api.github.com/repos/${system.path}/dispatches" -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" -d '{"event_type":"${LAYER_EVENT}"}'`,
      what: `a token that may start workflows in ${system.path} (fine-grained: Contents, read and write)` }
    : { secret: 'STYLE_GUIDE_TRIGGER_TOKEN', cmd: `curl -fsS -X POST -F "token=$TOKEN" -F "ref=${system.branch}" "${system.origin}/api/v4/projects/${encodeURIComponent(system.path)}/trigger/pipeline"`,
      what: `a pipeline trigger token of ${sys} (its Settings → CI/CD → Pipeline trigger tokens)` };
  const head = `Written by rms-design-system-engine --publish-styleguide for the intent layer's repository: every push to its
# default branch starts the style guide's job in ${sys}, so a change to the guidelines is on the page in minutes.
# Needs a ${call.secret} secret: ${call.what}.`;
  if (layer.host === 'github') {
    return { file: '.github/workflows/style-guide-notify.yml', needs: [`a ${call.secret} secret in the layer's repository: ${call.what}`], text: `name: tell the style guide

# ${head}

on:
  push:
    branches: [${layer.ref ?? 'main'}]

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - name: Tell the style guide the intent layer changed
        env:
          TOKEN: \${{ secrets.${call.secret} }}
        run: |
          ${call.cmd}
` };
  }
  return { file: '.gitlab-ci.yml (a job of its own)', needs: [`a ${call.secret} CI/CD variable in the layer's project (masked): ${call.what}`], text: `# ${head}
style-guide:
  image: curlimages/curl:latest
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
  variables:
    TOKEN: $${call.secret}
  script:
    - '${call.cmd.replace(/'/g, "''")}'
` };
}

// Write the job for the project's host. → { host, file, wrote, lines: [what to tell the person] }
export function writePublishJob(ROOT, cfg = {}, { host = null, outDefault = '.design-system-engine-out/styleguide/index.html' } = {}) {
  const h = host ?? hostOf(ROOT);
  const out = cfg.styleguide?.out ?? outDefault;
  const products = productRepos(ROOT);
  if (!h) return { host: null, file: null, wrote: false, lines: ['❌ The project\'s host is not known (no git remote on GitHub or GitLab). Run again with --host github or --host gitlab.'] };
  // On GitLab the job goes in a file of its own, included from .gitlab-ci.yml, so the project's pipeline is never rewritten.
  const file = h === 'github' ? '.github/workflows/style-guide.yml' : (existsSync(join(ROOT, '.gitlab-ci.yml')) ? '.gitlab/style-guide.gitlab-ci.yml' : '.gitlab-ci.yml');
  const abs = join(ROOT, file);
  const text = h === 'github' ? githubJob({ out, products }) : gitlabJob({ out, products });
  // An intent layer kept in another repository: its own job, written to the engine's output folder for the person to
  // add there (the engine never writes in another repository), and what it needs once.
  const layer = layerConfig(cfg), remote = remoteOf(ROOT);
  const lj = layerJob(layer, remote ? { ...remote, host: h } : null);
  const layerLines = [];
  if (lj) {
    const at = join(ROOT, OUT_DIR, 'intent-layer-job.yml');
    mkdirSync(dirname(at), { recursive: true });
    writeFileSync(at, lj.text);
    layerLines.push(`   The intent layer lives in ${layer.url}: so a change there is published at once, add the job in ${OUT_DIR}/intent-layer-job.yml to that repository (${lj.file}), with ${lj.needs.join('; ')}.`);
  }
  if (existsSync(abs)) {
    const now = readFileSync(abs, 'utf8'), same = now === text;
    const lines = [same ? `✅ ${file} is already the engine's job: nothing to change.` : `⚠️  ${file} is already there and differs from the engine's job: it is left as it is. Compare it with \`rms-design-system-engine --publish-styleguide --print\`.`];
    // A job of before: built on a push here only, so a change to an intent layer kept elsewhere never reaches the page.
    if (!same && layer && layer.host !== 'folder' && !now.includes(LAYER_EVENT) && !/--ci-changed/.test(now)) lines.push(`   It builds only on a push to this repository, so a change to the intent layer (${layer.url}) is not on the page until something else is pushed here. The engine's job also builds when the layer's repository says it changed, and every hour when something it is built from moved: take its triggers.`);
    return { host: h, file, wrote: false, lines: [...lines, ...layerLines] };
  }
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, text);
  const lines = [`✅ Wrote ${file}: the style guide built, audited, checked and published on every push to the default branch, when the intent layer's repository says it changed, and every hour when something it is built from moved.`];
  if (h === 'github') lines.push('   Turn Pages on once: Settings → Pages → Source: GitHub Actions. The link is https://<owner>.github.io/<repository>/. A GitHub Pages site is public, even from a private repository (only GitHub Enterprise Cloud keeps it private).');
  else {
    if (file !== '.gitlab-ci.yml') lines.push(`   Add it to .gitlab-ci.yml: include: [{ local: '${file}' }]`);
    lines.push('   The link is in Deploy → Pages after the first run. Keep it to the team: Settings → General → Visibility → Pages: Only project members.');
    lines.push('   Add a schedule once: Build → Pipeline schedules, every hour on the default branch. A run with nothing new stops at once.');
  }
  if (products.length) lines.push(`   It checks out ${products.length} product${products.length === 1 ? '' : 's'} beside the system (products.json), as a local run reads them.`);
  return { host: h, file, wrote: true, lines: [...lines, ...layerLines] };
}

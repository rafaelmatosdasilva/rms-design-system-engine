// publish-job.mjs - the CI job that publishes the style guide, one link the whole team shares, rebuilt from what is
// merged on every push (GitHub Pages or GitLab Pages, as the project's own git remote says). A local run of
// --styleguide stays a preview; this job is what the team opens.
//
// The job checks out the engine (its public repository), builds the page the audit measures on, runs the audit (a
// failing audit still publishes: the page shows the differences), builds the page again with them, checks it against
// the system (only the system's tokens and components, its own accessibility: a page that fails is not published),
// and publishes public/. The engine writes the file and says what to do next; it never commits, pushes or overwrites
// a job that is already there.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

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

// The products checked out beside the system (products.json), cloned the same way in the job so the page lists them.
export function productRepos(ROOT, read = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } }) {
  return (read(join(ROOT, 'products.json'))?.products ?? []).map((p) => String(p.repo ?? '')).filter((r) => /^[\w.-]+\/[\w.-]+$/.test(r));
}

const steps = (out, products, host) => {
  const clone = (r) => (host === 'github' ? `git clone --depth 1 "https://github.com/${r}.git" ../${r.split('/')[1]}` : `git clone --depth 1 "$CI_SERVER_URL/${r}.git" ../${r.split('/')[1]}`);
  return [
    ...products.map(clone),
    'node ../engine/audit.mjs --styleguide            # the page the audit measures each component on',
    'node ../engine/audit.mjs || true                 # the differences the page shows; a failing audit still publishes',
    'node ../engine/audit.mjs --styleguide            # the page again, with them',
    `node ../engine/audit.mjs --styleguide-check ${out}   # only the system on it, its own accessibility: else nothing is published`,
    `mkdir -p public && cp ${out} public/index.html`,
    'cp .design-system-engine-out/differences.md public/differences.md 2>/dev/null || true',
  ];
};

// GitHub Pages: built on every push to the default branch (and by hand), deployed by GitHub's own Pages actions.
export function githubJob({ out, products = [], branch = 'main' }) {
  const run = steps(out, products, 'github').map((l) => `          ${l}`).join('\n');
  return `name: style guide

# The design system's living style guide on GitHub Pages: one link the whole team shares, rebuilt from what is merged.
# Written by rms-design-system-engine --publish-styleguide. Turn Pages on once: Settings → Pages → Source: GitHub Actions.
# A FIGMA_TOKEN secret adds each component's Figma image beside the code; without it the page is built the same.

on:
  push:
    branches: [${branch}]
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
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0   # every commit and tag: each component's changelog and version
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - name: The engine
        run: git clone --depth 1 ${ENGINE_REPO} ../engine
      - name: Build, audit and check the style guide
        env:
          FIGMA_TOKEN: \${{ secrets.FIGMA_TOKEN }}
        run: |
${run}
      - uses: actions/upload-pages-artifact@v3
        with:
          path: public

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
`;
}

// GitLab Pages: the job must be named pages and publish public/; it runs on the default branch.
export function gitlabJob({ out, products = [] }) {
  const run = steps(out, products, 'gitlab').map((l) => `    - ${l}`).join('\n');
  return `# The design system's living style guide on GitLab Pages: one link the whole team shares, rebuilt from what is merged.
# Written by rms-design-system-engine --publish-styleguide. Who can open it: Settings → General → Visibility → Pages
# (Only project members keeps it to the team). A FIGMA_TOKEN CI/CD variable adds each component's Figma image.
pages:
  image: node:24-bookworm
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
  variables:
    GIT_DEPTH: 0            # every commit and tag: each component's changelog and version
    CHROME_PATH: /usr/bin/chromium
  before_script:
    - apt-get update -qq && apt-get install -y -qq chromium > /dev/null
    - git clone --depth 1 ${ENGINE_REPO} ../engine
  script:
${run}
  artifacts:
    paths:
      - public
`;
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
  if (existsSync(abs)) {
    const same = readFileSync(abs, 'utf8') === text;
    return { host: h, file, wrote: false, lines: [same ? `✅ ${file} is already the engine's job: nothing to change.` : `⚠️  ${file} is already there and differs from the engine's job: it is left as it is. Compare it with \`rms-design-system-engine --publish-styleguide --print\`.`] };
  }
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, text);
  const lines = [`✅ Wrote ${file}: the style guide built, audited, checked and published on every push to the default branch.`];
  if (h === 'github') lines.push('   Turn Pages on once: Settings → Pages → Source: GitHub Actions. The link is https://<owner>.github.io/<repository>/. A GitHub Pages site is public, even from a private repository (only GitHub Enterprise Cloud keeps it private).');
  else {
    if (file !== '.gitlab-ci.yml') lines.push(`   Add it to .gitlab-ci.yml: include: [{ local: '${file}' }]`);
    lines.push('   The link is in Deploy → Pages after the first run. Keep it to the team: Settings → General → Visibility → Pages: Only project members.');
  }
  if (products.length) lines.push(`   It checks out ${products.length} product${products.length === 1 ? '' : 's'} beside the system (products.json), as a local run reads them.`);
  return { host: h, file, wrote: true, lines };
}

// The style guide published from the system's CI (G7): one link the whole team shares, rebuilt on every push. The
// engine writes the job for the project's host (GitHub Pages or GitLab Pages), never overwrites one that is there,
// never commits, and says who can open the page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { hostOf, githubJob, gitlabJob, writePublishJob, productRepos, ENGINE_REPO } from '../publish-job.mjs';
import { route } from '../route.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const project = (remote, files = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'publish-'));
  mkdirSync(join(dir, '.git'), { recursive: true });
  if (remote) writeFileSync(join(dir, '.git', 'config'), `[remote "origin"]\n\turl = ${remote}\n`);
  writeFileSync(join(dir, 'ds-config.json'), JSON.stringify({ paths: { themeCSS: 'src/theme.css' } }));
  for (const [f, t] of Object.entries(files)) { mkdirSync(dirname(join(dir, f)), { recursive: true }); writeFileSync(join(dir, f), typeof t === 'string' ? t : JSON.stringify(t)); }
  return dir;
};

test('the host is read from the git remote, else from the CI folder the project has', () => {
  assert.equal(hostOf(project('https://github.com/acme/ds.git')), 'github');
  assert.equal(hostOf(project('git@gitlab.acme.io:design/ds.git')), 'gitlab');
  assert.equal(hostOf(project(null, { '.gitlab-ci.yml': 'stages: [test]\n' })), 'gitlab');
  assert.equal(hostOf(project(null)), null);
  assert.deepEqual(productRepos(project(null, { 'products.json': { products: [{ repo: 'acme/app-a' }, { repo: 'not a repo' }] } })), ['acme/app-a']);
});

test('each job builds, audits, checks and publishes public/; the products are checked out beside the system', () => {
  const gh = githubJob({ out: 'apps/style-guide/index.html', products: ['acme/app-a'] });
  for (const want of [`git clone --depth 1 ${ENGINE_REPO} ../engine`, 'git clone --depth 1 "https://github.com/acme/app-a.git" ../app-a', 'node ../engine/audit.mjs --styleguide --no-a11y-bake', 'node ../engine/audit.mjs --styleguide ', 'node ../engine/audit.mjs || true', 'node ../engine/audit.mjs --styleguide-check apps/style-guide/index.html', 'cp apps/style-guide/index.html public/index.html', 'actions/upload-pages-artifact@v3', 'actions/deploy-pages@v4', 'pages: write']) assert.ok(gh.includes(want), want);
  assert.ok(gh.indexOf('--styleguide-check') < gh.indexOf('upload-pages-artifact'), 'a page that fails its check is never uploaded');
  const gl = gitlabJob({ out: '.design-system-engine-out/styleguide/index.html', products: [] });
  for (const want of ['pages:', 'image: node:24-bookworm', '$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH', 'apt-get install -y -qq chromium', 'CHROME_PATH: /usr/bin/chromium', '      - public', 'Only project members']) assert.ok(gl.includes(want), want);
});

test('the job is written for the host, never over one that is there; on GitLab beside a pipeline it already has', () => {
  const gh = project('https://github.com/acme/ds.git', { 'products.json': { products: [{ repo: 'acme/app-a' }] } });
  const r = writePublishJob(gh, { styleguide: { out: 'apps/style-guide/index.html' } });
  assert.deepEqual([r.host, r.file, r.wrote], ['github', '.github/workflows/style-guide.yml', true]);
  assert.match(r.lines.join('\n'), /Settings → Pages → Source: GitHub Actions[\s\S]*public, even from a private repository[\s\S]*1 product beside the system/);
  writeFileSync(join(gh, '.github/workflows/style-guide.yml'), 'name: mine\n');
  const again = writePublishJob(gh, {});
  assert.equal(again.wrote, false);
  assert.match(again.lines[0], /already there and differs from the engine's job: it is left as it is/);
  assert.equal(readFileSync(join(gh, '.github/workflows/style-guide.yml'), 'utf8'), 'name: mine\n');
  const gl = project('https://gitlab.com/acme/ds.git', { '.gitlab-ci.yml': 'stages: [test]\n' });
  const g = writePublishJob(gl, {});
  assert.equal(g.file, '.gitlab/style-guide.gitlab-ci.yml');
  assert.equal(readFileSync(join(gl, '.gitlab-ci.yml'), 'utf8'), 'stages: [test]\n', 'the project\'s pipeline is not rewritten');
  assert.match(g.lines.join('\n'), /include: \[\{ local: '\.gitlab\/style-guide\.gitlab-ci\.yml' \}\][\s\S]*Only project members/);
  assert.equal(writePublishJob(project(null), {}).host, null);
});

test('a request to share the style guide writes the job; building it stays a build', () => {
  for (const t of ['publish the style guide for the team', 'share the styleguide on GitLab Pages', 'a link to the style guide everyone can open', 'publica o guia de estilo']) {
    const r = route(t, { components: ['button'] });
    assert.deepEqual([r.recipe, r.run], ['publish-styleguide', ['rms-design-system-engine --publish-styleguide']], t);
  }
  assert.deepEqual(route('build the style guide', { components: ['button'] }).run, ['rms-design-system-engine --styleguide']);
});

test('--publish-styleguide writes the job and says what to do next; --print only shows it', () => {
  const dir = project('https://github.com/acme/ds.git');
  const p = spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--publish-styleguide', '--print'], { cwd: dir, encoding: 'utf8' });
  assert.equal(p.status, 0, p.stderr);
  assert.match(p.stdout, /^name: style guide/);
  assert.ok(!existsSync(join(dir, '.github/workflows/style-guide.yml')), '--print writes nothing');
  const w = spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--publish-styleguide'], { cwd: dir, encoding: 'utf8' });
  assert.equal(w.status, 0, w.stderr);
  assert.match(w.stdout, /✅ Wrote \.github\/workflows\/style-guide\.yml[\s\S]*NEXT: tell the person the job is written/);
  const gl = spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--publish-styleguide', '--host', 'gitlab'], { cwd: project(null), encoding: 'utf8' });
  assert.match(gl.stdout, /✅ Wrote \.gitlab-ci\.yml/);
});

// A quick build of the style guide (--styleguide --quick), to see a change in seconds, and the same again on each
// change saved (--watch): what it leaves out, what it keeps, and that no store ever takes it for the team's page
// (styleguide-quick.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { QUICK_MARK, markQuick, isQuick, quickPage, ignored, watchPaths, watchGuide, keepShowroom, lastShowroom } from '../lib/styleguide-quick.mjs';
import { fixtureProject, tempDir, budget } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = '.design-system-engine-out';

test('a quick page carries its mark once, in its head', () => {
  const page = '<!doctype html><html><head><title>x</title></head><body></body></html>';
  const once = markQuick(page);
  assert.match(once, new RegExp(`<head>${QUICK_MARK}<title>`));
  assert.equal(markQuick(once), once, 'never twice');
  assert.ok(isQuick(once) && !isQuick(page));
  const dir = tempDir('sg-quick-');
  writeFileSync(join(dir, 'index.html'), once);
  assert.equal(quickPage(join(dir, 'index.html')), true);
  assert.equal(quickPage(join(dir, 'none.html')), false);
});

test('the Showroom as the last full build measured it is kept for a quick build', () => {
  const dir = tempDir('sg-quick-');
  assert.equal(lastShowroom(dir), null);
  keepShowroom(dir, { home: { title: 'Home', off: 2 } });
  const last = lastShowroom(dir);
  assert.deepEqual(last.results, { home: { title: 'Home', off: 2 } });
  assert.match(last.at, /^\d{4}-\d\d-\d\dT/);
});

test('a change the build writes itself, or nothing is built from, starts no build', () => {
  for (const p of [`${OUT}/styleguide/index.html`, 'node_modules/vue/index.js', '.git/index', 'design-system-engine-check-result.json', 'component-prop-result.json', 'src/.#Button.vue', 'src/Button.vue~', '.DS_Store'])
    assert.equal(ignored(p), true, p);
  for (const p of ['src/components/Button.vue', 'styles/tokens.css', 'ds-config.json', 'contract.authored.json', 'design-system-engine-map.mjs', 'figma/vars.snapshot.json'])
    assert.equal(ignored(p), false, p);
});

test('what a watch follows: the project, the engine\'s templates and code, never the folder the page is written to', () => {
  const root = tempDir('sg-watch-'), engine = tempDir('sg-engine-'), outside = tempDir('sg-tpl-');
  for (const d of ['templates', 'lib']) mkdirSync(join(engine, d));
  writeFileSync(join(outside, 'guide.html'), '<html></html>');
  const inPage = watchPaths(root, { styleguide: { out: 'public/guide/index.html', template: join(outside, 'guide.html') } }, engine);
  assert.deepEqual(inPage.map((w) => w.path), [root, join(engine, 'templates'), join(engine, 'lib'), outside]);
  assert.equal(inPage[0].page, join('public', 'guide'), 'the page\'s folder inside the project is left out of its watch');
  // A page written beside the project (../styleguide) is not watched at all.
  const beside = watchPaths(join(root), { styleguide: { out: '../styleguide/index.html' } }, engine);
  assert.deepEqual(beside.map((w) => w.path), [root, join(engine, 'templates'), join(engine, 'lib')]);
});

test('a watch builds once, then once per burst of changes; a change during a build starts one more', async () => {
  const handlers = [];
  const fakeWatch = (path, opts, fn) => { handlers.push(fn); return { close() {} }; };
  let builds = 0, release = null;
  const build = () => { builds++; return new Promise((r) => { release = r; }); };
  const w = watchGuide({ paths: [{ path: '/p', recursive: true, page: 'public/guide' }], build, debounceMs: 20, watch: fakeWatch, log: () => {} });
  const fire = (f) => handlers[0]('change', f);
  const tick = (ms) => new Promise((r) => setTimeout(r, ms));
  assert.equal(builds, 1, 'the first build at once');
  fire('src/Button.vue');   // during the first build
  release(); await tick(5);
  assert.equal(builds, 2, 'a change saved while it ran: built again when it ended');
  release(); await tick(40);
  assert.equal(builds, 2);
  for (const f of ['src/Button.vue', 'src/Button.css', 'src/Chip.vue']) fire(f);
  await tick(60);
  assert.equal(builds, 3, 'three files saved together: one build');
  release(); await tick(5);
  for (const f of [`${OUT}/timing.json`, 'public/guide/index.html', 'public/guide/assets/x.js', 'design-system-engine-check-result.json']) fire(f);
  await tick(60);
  assert.equal(builds, 3, 'its own output never starts a build');
  w.close();
  fire('src/Button.vue'); await tick(60);
  assert.equal(builds, 3, 'closed: nothing more');
});

test('no store takes a quick page for the team\'s, and says why', async () => {
  const { pushStore } = await import('../lib/stores.mjs');
  const site = join(tempDir('sg-quick-'), 'site');
  const cfg = { stores: { styleguide: { write: { folder: site } } } };
  const r = await pushStore(tempDir('sg-quick-'), cfg, 'styleguide', new Map([['index.html', markQuick('<html><head></head><body>hi</body></html>')]]), 'Style guide');
  assert.equal(r.ok, false);
  assert.match(r.line, /quick build \(--quick\)[^\n]*--styleguide/);
  assert.equal(existsSync(join(site, 'index.html')), false, 'nothing written');
  const full = await pushStore(tempDir('sg-quick-'), cfg, 'styleguide', new Map([['index.html', '<html><head></head><body>hi</body></html>']]), 'Style guide');
  assert.equal(full.ok, true, full.line);
});

test('the token answerer answers each token once, with the same answers', async () => {
  const { tokenAnswerer } = await import('../lib/layer-questions.mjs');
  const layer = { entities: [{ kind: 'token', name: 'semantic/link', purpose: ['Text links inside body copy, never buttons'] }, { kind: 'component', name: 'card', summary: 'Use --card-border-color for the outline that separates cards from the page' }] };
  let asked = 0;
  const describe = (t) => { asked++; return t === 'brand/primary' ? 'The main brand colour' : null; };
  const answer = tokenAnswerer({ layer, describe });
  const want = { 'brand/primary': 'Figma', 'semantic/link/color': 'its entry in the intent layer', 'card/border': 'the card page', 'chip/fill': null };
  for (let i = 0; i < 50; i++) for (const [t, a] of Object.entries(want)) assert.equal(answer(t), a, t);
  assert.equal(asked, 4, 'each token worked out once');
});

test('--styleguide --quick: the page in seconds, from the saved results, marked, nothing measured, pictured or sent; a full build after it is the team\'s again', { timeout: budget(300000) }, async () => {
  const { a11yFactsPath } = await import('../lib/contract-a11y.mjs');
  const dir = fixtureProject(join(ENGINE, 'test', 'fixtures', 'demo-ds'), 'sg-quick-');
  writeFileSync(join(dir, 'a11y-results.snapshot.json'), JSON.stringify({ at: '2026-01-01T00:00:00.000Z', themes: { default: { button: { sig: 'x.y', live: { ran: {}, facts: [{ f: { role: 'button', name: 'content', focusable: true }, when: [{ Size: 'M' }] }] }, items: [] } } } }));
  keepShowroom(dir, { home: { title: 'Home', off: 0, tol: 2, lines: [] } });
  const run = (...args) => spawnSync(process.execPath, [join(ENGINE, 'lib', 'audit.mjs'), '--styleguide', ...args], { cwd: dir, encoding: 'utf8', timeout: budget(240000), env: { ...process.env, NO_COLOR: '1' } });
  const q = run('--quick', '--timing');
  assert.equal(q.status, 0, q.stdout + q.stderr);
  const page = join(dir, OUT, 'styleguide', 'index.html');
  assert.ok(quickPage(page), 'marked as a quick build');
  assert.match(q.stdout, /Accessibility from the saved results/);
  assert.doesNotMatch(q.stdout, /Trying the accessibility|♿ Accessibility in the page/, 'nothing tried in a browser');
  assert.match(q.stdout, /📏 Showroom as measured by the last full build/);
  assert.match(readFileSync(page, 'utf8'), /window\.__dseShowroomMeasured = \{"home"/, 'the last measurement in the page');
  assert.match(q.stdout, /⚡ A quick build/);
  assert.equal(existsSync(join(dir, OUT, 'styleguide-shots')), false, 'no pictures of its own pages');
  assert.equal(existsSync(a11yFactsPath(dir)), false, 'the contracts keep what the last full build measured');
  const t = JSON.parse(readFileSync(join(dir, OUT, 'timing.json'), 'utf8'));
  assert.ok(t['styleguide --quick'] && !t.styleguide, 'its times kept apart from the full build\'s');
  // The full build (no browser here: --no-a11y-bake) writes the page without the mark.
  const f = run('--no-a11y-bake', '--no-publish');
  assert.equal(f.status, 0, f.stdout + f.stderr);
  assert.equal(quickPage(page), false);
  assert.equal(existsSync(a11yFactsPath(dir)), true, 'a full build writes the facts from the saved results, as before');
});

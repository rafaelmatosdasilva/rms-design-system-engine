// The style guide held to what a page owes its readers, beside the system's own rules: every file it links to is there
// (a missing one fails the check, so a page with a hole is never published), its weight is said, with a warning past the
// budget, and a build with the browser pictures its own pages and says which changed since the build before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { localFiles, pageWeight, pageFindings, checkLines, failures } from '../styleguide-check.mjs';
import { guideShots, shotLines, changedShare } from '../styleguide-shots.mjs';
import { budget, tempDir } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const HARBOR = join(ENGINE, 'test', 'fixtures', 'harbor-ds');

test('the files a page names: its scripts, styles and pictures, never an anchor, a data URL, a web address or the code inside a script', () => {
  const html = '<link rel="stylesheet" href="assets/page.1a.css?v=2"><script src="assets/page.2b.js"></script><script>var a = \'<img src="assets/not-a-file.png">\';</script>' +
    '<a href="#status">Status</a><a href="https://example.com/x">x</a><a href="mailto:qa@example.com">QA</a><img src="data:image/png;base64,AA"><img src="assets/logo%20mark.svg">';
  assert.deepEqual(localFiles(html), ['assets/page.1a.css', 'assets/page.2b.js', 'assets/logo mark.svg']);
});

test('a file the page links to that is not there fails the check; the weight is said, and warned past the budget', () => {
  const dir = tempDir('sg-own-');
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'assets', 'page.js'), 'x'.repeat(3000));
  writeFileSync(join(dir, 'index.html'), '<html><head><script src="assets/page.js"></script><link rel="stylesheet" href="assets/gone.css"></head><body></body></html>');
  const page = join(dir, 'index.html');
  const w = pageWeight(page);
  assert.deepEqual(w.files.map((f) => f.file), ['assets/page.js', 'index.html'], 'the largest first, only files that are there');
  const found = pageFindings(page);
  assert.deepEqual(failures(found).map((f) => [f.property, f.value]), [['file', 'assets/gone.css']]);
  const lines = checkLines(found);
  assert.match(lines[0], /^❌ Style guide check: 1 file the page links to not there$/);
  assert.match(lines.join('\n'), /a file the page links to is not there \(assets\/gone\.css\): publish the page with the files beside it, or build it again/);
  assert.match(lines.join('\n'), /ℹ️ {2}The page and its files weigh 0\.0 MB \(the largest: assets\/page\.js 0\.0 MB, index\.html 0\.0 MB\)\./);
  // Past the budget: a warning, never a failure.
  const heavy = pageFindings(page, { warnMB: 0.001 });
  const weight = heavy.find((f) => f.property === 'weight');
  assert.equal(weight.info, false);
  assert.equal(failures(heavy).length, 1, 'only the missing file fails');
  assert.match(checkLines(heavy).join('\n'), /⚠️ {2}The page and its files weigh 0\.0 MB, past 0\.001 MB, slow to open on a phone or a slow connection; the largest: assets\/page\.js/);
  // Every file there: the check passes, its weight said.
  writeFileSync(join(dir, 'assets', 'gone.css'), 'a{}');
  assert.match(checkLines(pageFindings(page))[0], /^✅ Style guide check/);
});

test('what a build says of its own pages: pictured the first time, unchanged, or which changed and by how much', () => {
  const dir = '/p/.design-system-engine-out/styleguide-shots';
  assert.equal(changedShare({ diff: 50, total: 1000 }), 0.05);
  assert.deepEqual(shotLines({ skipped: 'no Chrome' }, dir, '/p'), ['   The style guide\'s own pages not pictured (no Chrome).']);
  assert.deepEqual(shotLines({ pages: 9, compared: 0, changed: [], fresh: 9, left: 0 }, dir, '/p'), ['📸 The style guide\'s own pages pictured (9), for the next build to compare with: .design-system-engine-out/styleguide-shots/last.']);
  assert.deepEqual(shotLines({ pages: 9, compared: 9, changed: [], fresh: 0, left: 2 }, dir, '/p'), ['📸 The style guide\'s own pages: none of 9 changed since the last build; the other 2 pages are not pictured.']);
  const changed = shotLines({ pages: 9, compared: 8, changed: [{ id: 'status', title: 'Status', share: 0.031 }, { id: 'templates', title: 'Templates', share: 0.004 }], fresh: 1, left: 0 }, dir, '/p');
  assert.equal(changed[0], '📸 The style guide\'s own pages: 2 of 8 changed since the last build (Status 3%, Templates 0.4%), 1 new.');
  assert.match(changed[1], /What changed is marked in \.design-system-engine-out\/styleguide-shots\/diff\. A change nobody meant is a fault in the page/);
});

test('in the browser: the same page twice is unchanged; a page whose layout moved is said, with a picture of what changed', { timeout: budget(300000) }, async (t) => {
  const { findChrome } = await import('../cdp.mjs');
  if (!findChrome({ playwright: true }) || typeof WebSocket === 'undefined') { t.skip('no Chrome'); return; }
  const dir = tempDir('sg-shots-');
  cpSync(HARBOR, dir, { recursive: true });
  const r = spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--styleguide', '--no-a11y-bake'], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /📸/, 'a build without the browser pictures nothing');
  const page = join(dir, '.design-system-engine-out', 'styleguide', 'index.html'), shots = join(dir, 'shots');
  const first = await guideShots(page, shots);
  assert.equal(first.skipped, undefined, JSON.stringify(first));
  assert.ok(first.pages >= 5, `the menu's pages and each component's: ${first.pages}`);
  assert.deepEqual([first.compared, first.fresh], [0, first.pages]);
  assert.ok(existsSync(join(shots, 'last', 'status.png')) && existsSync(join(shots, 'last', 'c-button.png')));
  const again = await guideShots(page, shots);
  assert.deepEqual([again.compared, again.changed], [first.pages, []], 'nothing moved, nothing said');
  // The page's own layout moved: every page is pushed down.
  writeFileSync(page, readFileSync(page, 'utf8').replace('</head>', '<style>.sg-section > h2 { margin-top: 240px !important; }</style></head>'));
  const moved = await guideShots(page, shots);
  assert.ok(moved.changed.some((c) => c.id === 'status'), JSON.stringify(moved.changed.map((c) => c.id)));
  assert.ok(moved.changed.every((c) => c.share > 0.002 && existsSync(c.diff)));
  assert.deepEqual(readdirSync(join(shots, 'diff')).sort(), moved.changed.map((c) => c.diff.split('/').pop()).sort());
});

test('a build with the browser pictures the guide\'s own pages, and says so', { timeout: budget(300000) }, async (t) => {
  const { findChrome } = await import('../cdp.mjs');
  if (!findChrome({ playwright: true }) || typeof WebSocket === 'undefined') { t.skip('no Chrome'); return; }
  const dir = tempDir('sg-shots-build-');
  cpSync(HARBOR, dir, { recursive: true });
  const r = spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--styleguide'], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /📸 The style guide's own pages pictured \(\d+\), for the next build to compare with: \.design-system-engine-out\/styleguide-shots\/last\./);
  assert.match(r.stdout, /ℹ️ {2}The page and its files weigh [\d.]+ MB \(the largest: assets\//);
});

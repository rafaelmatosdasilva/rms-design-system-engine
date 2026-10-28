// The accessibility check keeps each page's results under its signature, and the next run puts back the ones whose
// page, configuration and check have not changed, instead of opening them again: a run where nothing changed opens no
// browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeFixture, budget } from './helpers.mjs';
import {
  stableJson, engineFiles, checkSignature, runSignature, styleguideSignatures, projectSignature,
  keptMark, keptDelta, keptApply, keptWhole, keptToWrite, readKept, KEPT_FILE,
} from '../a11y-check.mjs';
import { OUT_DIR } from '../names.mjs';
import { findChrome } from '../cdp.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const CHROME = findChrome({ playwright: true });
const HAS_CHROME = !!CHROME && typeof WebSocket !== 'undefined';

test('stableJson signs the same object the same, whatever the order of its keys', () => {
  assert.equal(stableJson({ b: 1, a: [2, { d: 3, c: 4 }] }), stableJson({ a: [2, { c: 4, d: 3 }], b: 1 }));
  assert.notEqual(stableJson({ a: 1 }), stableJson({ a: 2 }));
});

test('the check is signed by the engine files its results rest on: never the template, the browser\'s plumbing or the report', () => {
  const files = engineFiles(join(ENGINE, 'a11y-check.mjs')).map((f) => f.slice(ENGINE.length + 1));
  for (const f of ['a11y-check.mjs', 'cdp.mjs', 'mode-resolver.mjs', 'vue-harness.mjs']) assert.ok(files.includes(f), f);
  for (const f of ['figma-link.mjs', 'styleguide-gen.mjs', 'readmes.mjs']) assert.ok(!files.includes(f), f);
  const fake = { '/e/a11y-check.mjs': "import './x.mjs'; await import('./figma-link.mjs');", '/e/x.mjs': '1', '/e/templates/styleguide.template.html': 't', '/e/wcag-page.js': 'w' };
  const read = (f) => { if (!(f in fake)) throw new Error('none'); return fake[f]; };
  const before = checkSignature({ dir: '/e', read });
  fake['/e/x.mjs'] = '2';
  assert.notEqual(checkSignature({ dir: '/e', read }), before, 'a module the check imports changed');
  fake['/e/x.mjs'] = '1';
  assert.equal(checkSignature({ dir: '/e', read }), before);
  // The template is not part of it: each style guide part is signed by what its components draw (styleguideSignatures).
  fake['/e/templates/styleguide.template.html'] = 't2';
  assert.equal(checkSignature({ dir: '/e', read }), before, 'a new page in the style guide measures nothing differently');
  // The browser's plumbing neither; what renders the components from their code only for the pages rendered so.
  fake['/e/a11y-check.mjs'] = "import './x.mjs'; import './cdp.mjs'; import './vue-harness.mjs';";
  fake['/e/cdp.mjs'] = 'c'; fake['/e/vue-harness.mjs'] = 'v';
  const page = checkSignature({ dir: '/e', read }), rendered = checkSignature({ dir: '/e', read, kind: 'rendered' });
  fake['/e/cdp.mjs'] = 'c2';
  assert.equal(checkSignature({ dir: '/e', read }), page, 'the browser plumbing changed: nothing is measured differently');
  fake['/e/vue-harness.mjs'] = 'v2';
  assert.equal(checkSignature({ dir: '/e', read }), page, 'a page read from a file does not rest on the harness');
  assert.notEqual(checkSignature({ dir: '/e', read, kind: 'rendered' }), rendered, 'the components rendered from their code do');
});

test('a run is signed by what it was asked, never by where its report goes or when the profile was read', () => {
  const base = { check: 'c', cfg: { a11y: { axe: true }, profile: { readAt: '2026-01-01' } }, argv: ['--json-out', '/tmp/a.json'], roots: ['.cardTile'], modes: [{ name: 'Light', sw: {} }] };
  const sig = runSignature(base);
  assert.equal(runSignature({ ...base, cfg: { ...base.cfg, profile: { readAt: '2026-02-02' } }, argv: ['--json-out', '/tmp/b.json', '--time-limit', '60', '--json', '--fresh'] }), sig);
  assert.notEqual(runSignature({ ...base, argv: ['--no-axe'] }), sig, 'a part left out');
  assert.notEqual(runSignature({ ...base, cfg: { a11y: { axe: false } } }), sig, 'the configuration');
  assert.notEqual(runSignature({ ...base, roots: ['.cardTile', '.chip'] }), sig, 'the components looked for');
  assert.notEqual(runSignature({ ...base, modes: [{ name: 'Light', sw: {} }, { name: 'Dark', sw: { cls: 'dark' } }] }), sig, 'the colour modes');
  assert.notEqual(runSignature({ ...base, check: 'c2' }), sig, 'the check');
});

test('a style guide part is signed by its components as the page data gives them and the system CSS in any order', () => {
  const page = (comps, css = '.a{color:red}.b{color:blue}') => `<style data-system>${css}</style><script type="application/json" id="sg-data">${JSON.stringify({ components: comps, audit: { at: Date.now() } })}</script>`;
  const cardTile = { name: 'cardTile', cls: 'cardTile', markup: '<div class="cardTile" data-v-1a2b3c4d>x</div>', a11y: { role: 'group', checked: 'today' }, renders: [{ style: 'top: 120px; width: 10px' }] };
  const chip = { name: 'chip', cls: 'chip', markup: '<span class="chip">y</span>' };
  const one = styleguideSignatures(page([cardTile, chip]));
  // Where a render sat, when it was checked, a Vue scoped id and the order of the CSS rules are not the component.
  const same = styleguideSignatures(page([{ ...cardTile, markup: cardTile.markup.replace('1a2b3c4d', '9f9f9f9f'), a11y: { role: 'group', checked: 'later' }, renders: [{ style: 'top: 900px; width: 10px' }] }, chip], '.b{color:blue}.a{color:red}'));
  assert.deepEqual(same, one);
  const changed = styleguideSignatures(page([{ ...cardTile, markup: '<div class="cardTile">z</div>' }, chip]));
  assert.notEqual(changed.comp.cardTile, one.comp.cardTile);
  assert.equal(changed.comp.chip, one.comp.chip, 'only the component that changed');
  assert.equal(changed.base, one.base);
  assert.notEqual(styleguideSignatures(page([cardTile, chip], '.a{color:green}')).base, one.base, 'the system CSS changed');
  assert.equal(styleguideSignatures('<script id="sg-data">{not json</script>'), null);
});

test('the project is signed by its files, less the packages, what the engine writes and the configuration', () => {
  const dir = makeFixture({ 'src/Card.vue': '<template><div/></template>', 'package.json': '{}', 'ds-config.json': { a: 1 }, 'node_modules/x/index.js': '1', [`${OUT_DIR}/code.snapshot.json`]: '{}', 'a11y-results.snapshot.json': '{}', 'design-system-engine-check-result.json': '{}', 'src/figma-vars.snapshot.json': '{"v":1}' });
  const sig = projectSignature(dir);
  for (const f of ['node_modules/x/index.js', `${OUT_DIR}/code.snapshot.json`, 'a11y-results.snapshot.json', 'design-system-engine-check-result.json', 'ds-config.json']) {
    writeFileSync(join(dir, f), 'changed');
    assert.equal(projectSignature(dir), sig, f);
  }
  writeFileSync(join(dir, 'src/figma-vars.snapshot.json'), '{"v":2}');
  assert.notEqual(projectSignature(dir), sig, 'a snapshot the components are rendered from');
  const sig2 = projectSignature(dir);
  writeFileSync(join(dir, 'src/Card.vue'), '<template><span/></template>');
  assert.notEqual(projectSignature(dir), sig2, 'a component');
});

test('what one page adds to the run is kept and put back as it was', () => {
  const fresh = () => ({ findings: [], unread: [], heard: new Map(), instances: new Map(), ranChecks: new Set() });
  const acc = fresh();
  acc.findings.push({ kind: 'name', desc: 'first page' });
  acc.heard.set('.chip', ['chip, button']);
  acc.instances.set('.chip', { total: 2, checked: 2 });
  acc.ranChecks.add('zoom');
  const mark = keptMark(acc);
  acc.findings.push({ kind: 'contrast', desc: 'second page' });
  acc.heard.set('.cardTile', ['card, group']);
  acc.instances.set('.chip', { total: 5, checked: 4 });
  acc.ranChecks.add('zoom'); acc.ranChecks.add('reflow');
  const delta = JSON.parse(JSON.stringify(keptDelta(acc, mark)));   // as it is written and read back
  assert.deepEqual(delta.findings, [{ kind: 'contrast', desc: 'second page' }]);
  assert.deepEqual(delta.heard, [['.cardTile', ['card, group']]]);
  assert.deepEqual(delta.instances, [['.chip', { total: 3, checked: 2 }]]);
  assert.deepEqual(delta.ranChecks, ['reflow']);
  assert.ok(keptWhole(delta));
  const again = fresh();
  again.findings.push({ kind: 'name', desc: 'first page' });
  again.heard.set('.chip', ['chip, button']);
  again.instances.set('.chip', { total: 2, checked: 2 });
  again.ranChecks.add('zoom');
  keptApply(again, delta);
  assert.deepEqual(again.findings, acc.findings);
  assert.deepEqual([...again.heard], [...acc.heard]);
  assert.deepEqual([...again.instances], [...acc.instances]);
  assert.deepEqual([...again.ranChecks].sort(), [...acc.ranChecks].sort());
  assert.ok(!keptWhole({ ...delta, unread: ['page (did not load)'] }), 'a page not read is checked again next time');
});

test('the kept file holds this run\'s pages first, then the newest earlier ones, up to its cap', () => {
  const previous = { a: { at: '2026-01-01' }, b: { at: '2026-03-01' }, c: { at: '2026-02-01' } };
  const now = { d: { at: '2026-04-01' } };
  assert.deepEqual(Object.keys(keptToWrite(previous, now, 3)), ['d', 'b', 'c']);
  const dir = makeFixture({ 'k.json': '{"pages":{"x":{"at":"1"}}}', 'bad.json': '{' });
  assert.deepEqual(readKept(join(dir, 'k.json')), { x: { at: '1' } });
  assert.deepEqual(readKept(join(dir, 'bad.json')), {});
  assert.deepEqual(readKept(join(dir, 'none.json')), {});
});

const PAGE = `<!doctype html><html lang="en"><head><title>T</title><style>
  body { font: 14px sans-serif; margin: 16px; }
  button { padding: 8px; min-width: 44px; min-height: 44px; }
</style></head><body><main><h1>Page</h1>
  <button class="icon"><svg width="16" height="16"><rect width="16" height="16"/></svg></button>
  BODY
</main></body></html>`;
const run = (dir, args = [], env = {}) => {
  const t0 = Date.now();
  let out;
  try { out = execFileSync(process.execPath, [join(ENGINE, 'a11y-check.mjs'), '--url', pathToFileURL(join(dir, 'page.html')).href, '--json-out', join(dir, 'a11y.json'), ...args], { cwd: dir, encoding: 'utf8', timeout: budget(120000), env: { ...process.env, CHROME_PATH: CHROME, NO_COLOR: '1', ...env } }); }
  catch (e) { out = (e.stdout ?? '') + (e.stderr ?? ''); }
  return { out, ms: Date.now() - t0, json: JSON.parse(readFileSync(join(dir, 'a11y.json'), 'utf8')) };
};

test('a page unchanged since it was last checked is put back without a browser; a change or --fresh checks it again', { skip: HAS_CHROME ? false : 'no Chrome available', timeout: budget(600000) }, () => {
  const dir = makeFixture({ 'page.html': PAGE.replace('BODY', '') });
  const first = run(dir);
  assert.doesNotMatch(first.out, /put back/);
  assert.ok(existsSync(join(dir, OUT_DIR, KEPT_FILE)), 'the results are kept');
  assert.ok(first.json.issues.some((i) => i.issue === 'name'), first.out);

  // Nothing changed: the same results, no browser (a Chrome that cannot start is never needed).
  const second = run(dir, [], { CHROME_PATH: '/nonexistent/chrome' });
  assert.match(second.out, /1 of 1 page unchanged since it was last checked: its results are put back/);
  assert.deepEqual(second.json.issues, first.json.issues);
  assert.deepEqual(second.json.verdict, first.json.verdict);
  assert.deepEqual(second.json.ran, first.json.ran);
  assert.deepEqual(second.json.measured, first.json.measured);
  assert.equal(second.json.reused.length, 1);

  // --fresh checks it again.
  const fresh = run(dir, ['--fresh']);
  assert.doesNotMatch(fresh.out, /put back/);
  assert.deepEqual(fresh.json.issues, first.json.issues);

  // The page changed: checked again, and what it finds now is what is said.
  writeFileSync(join(dir, 'page.html'), PAGE.replace('<button class="icon"><svg width="16" height="16"><rect width="16" height="16"/></svg></button>', '<button class="icon" aria-label="Close"><svg width="16" height="16"><rect width="16" height="16"/></svg></button>').replace('BODY', ''));
  const changed = run(dir);
  assert.doesNotMatch(changed.out, /put back/);
  assert.ok(!changed.json.issues.some((i) => i.issue === 'name'), changed.out);
});

test('a component whose selector is not valid CSS leaves the page kept: said not checked once, on the first run and when put back', { skip: HAS_CHROME ? false : 'no Chrome available', timeout: budget(600000) }, () => {
  const dir = makeFixture({ 'page.html': PAGE.replace('BODY', '<span class="chip">Chip</span>'), 'ds-config.json': { componentSelectors: { Chip: '.chip', 'table/row': '.table/row' } } });
  const args = ['--component', 'Chip', '--component', 'table/row'];
  const said = ['table/row (its selector .table/row is not valid CSS, so it was not checked)'];
  const first = run(dir, args);
  assert.deepEqual(first.json.notRead, said, first.out);
  const second = run(dir, args, { CHROME_PATH: '/nonexistent/chrome' });
  assert.match(second.out, /1 of 1 page unchanged since it was last checked: its results are put back/, second.out);
  assert.deepEqual(second.json.notRead, said);
});

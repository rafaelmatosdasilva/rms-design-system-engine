// The accessibility check keeps each page's results under its signature, and the next run puts back the ones whose
// page, configuration and check have not changed, instead of opening them again: a run where nothing changed opens no
// browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeFixture, budget, tempDir } from './helpers.mjs';
import {
  stableJson, engineFiles, checkSignature, runSignature, styleguideSignatures, projectSignature,
  keptMark, keptDelta, keptApply, keptWhole, keptToWrite, readKept, KEPT_FILE, whyChecked, whyCheckedLine, cssRuleList, sharedOnly,
} from '../lib/a11y-check.mjs';
import { OUT_DIR } from '../lib/names.mjs';
import { findChrome } from '../lib/cdp.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const CHROME = findChrome({ playwright: true });
const HAS_CHROME = !!CHROME && typeof WebSocket !== 'undefined';

test('stableJson signs the same object the same, whatever the order of its keys', () => {
  assert.equal(stableJson({ b: 1, a: [2, { d: 3, c: 4 }] }), stableJson({ a: [2, { c: 4, d: 3 }], b: 1 }));
  assert.notEqual(stableJson({ a: 1 }), stableJson({ a: 2 }));
});

test('the check is signed by the engine files its results rest on: never the template, the browser\'s plumbing or the report', () => {
  const files = engineFiles(join(ENGINE, 'lib', 'a11y-check.mjs')).map((f) => f.slice(join(ENGINE, 'lib').length + 1));
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

// The engine finds its own folder through import.meta.url, which is a URL: read as a path with .pathname, a folder
// with a space in its name arrives percent-encoded, every read of an engine file throws, and the signature falls back
// to the file names alone - so a check whose own code changed would still put back the results it kept, silently.
// Measured from a copy under a folder with a space, because the engine sits wherever the person keeps it.
test('the check is signed by its files even when the engine sits under a path with a space', async () => {
  const lib = join(tempDir('engine folder-'), 'lib');
  assert.ok(lib.includes(' '), 'the copy sits under a path with a space');
  cpSync(join(ENGINE, 'lib'), lib, { recursive: true });
  const { checkSignature: signature } = await import(pathToFileURL(join(lib, 'a11y-check.mjs')).href);
  assert.equal(signature(), signature({ dir: lib }), 'the folder it reads is the one it sits in');
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
  const page = (comps, css = 'main{color:red}body{color:blue}') => `<style data-system>${css}</style><script type="application/json" id="sg-data">${JSON.stringify({ components: comps, audit: { at: Date.now() } })}</script>`;
  const cardTile = { name: 'cardTile', cls: 'cardTile', markup: '<div class="cardTile" data-v-1a2b3c4d>x</div>', a11y: { role: 'group', checked: 'today' }, renders: [{ style: 'top: 120px; width: 10px' }] };
  const chip = { name: 'chip', cls: 'chip', markup: '<span class="chip">y</span>' };
  const one = styleguideSignatures(page([cardTile, chip]));
  // Where a render sat, when it was checked, a Vue scoped id and the order of the CSS rules are not the component.
  const same = styleguideSignatures(page([{ ...cardTile, markup: cardTile.markup.replace('1a2b3c4d', '9f9f9f9f'), a11y: { role: 'group', checked: 'later' }, renders: [{ style: 'top: 900px; width: 10px' }] }, chip], 'body{color:blue}main{color:red}'));
  assert.deepEqual(same, one);
  const changed = styleguideSignatures(page([{ ...cardTile, markup: '<div class="cardTile">z</div>' }, chip]));
  assert.notEqual(changed.comp.cardTile, one.comp.cardTile);
  assert.equal(changed.comp.chip, one.comp.chip, 'only the component that changed');
  assert.equal(changed.base, one.base);
  assert.notEqual(styleguideSignatures(page([cardTile, chip], 'main{color:green}body{color:blue}')).base, one.base, 'the CSS every component shares changed');
  assert.equal(styleguideSignatures('<script id="sg-data">{not json</script>'), null);
  // A comment or the spacing of the CSS is not the CSS: an engine change that rewords the page's comments keeps every part.
  assert.equal(styleguideSignatures(page([cardTile, chip], '/* the page */ main { color: red }\n\nbody{ color:blue } /* why */')).base, one.base);
  assert.notEqual(styleguideSignatures(page([cardTile, chip], 'main :hover{color:red}body{color:blue}')).base, styleguideSignatures(page([cardTile, chip], 'main:hover{color:red}body{color:blue}')).base, 'a space that is a combinator still counts');
});

// A token that changes in Figma tries again only the components that resolve it: each is signed with the rules that
// name its classes and the custom properties they resolve, through var() and in every brand.
test('one token change re-signs only the components that resolve it, through var() and in every brand', () => {
  const css = `:root { --colour-accent: #0037fa; --colour-ink: #1a1a1a; --chip-bg: var(--colour-accent); --space-s: 8px }
    [data-brand="acme"] { --colour-accent: #00aa55 }
    body { margin: 0; color: var(--colour-ink) }
    .chip { background: var(--chip-bg); padding: var(--space-s) }
    @media (hover: hover) { .chip:hover { outline: 1px solid var(--colour-accent) } }
    .cardTile { padding: var(--space-s); border: 1px solid #ccc }
    .badge { color: var(--colour-ink) }
    .appShell .header { box-shadow: 0 1px var(--colour-accent) }
    .badge:not(.ghost) { font-weight: 600 }`;
  const page = (c, brands = { list: [{ key: 'acme', name: 'Acme' }], read: '2026-01-01' }) => `<style data-system>${c}</style><script type="application/json" id="sg-data">${JSON.stringify({ brands, components: [
    { name: 'chip', cls: 'chip', markup: '<span class="chip">y</span>' },
    { name: 'cardTile', cls: 'cardTile', markup: '<div class="cardTile">x</div>' },
    { name: 'badge', cls: 'badge', markup: '<span class="badge" style="border-color: var(--colour-line)">1</span>' },
  ] })}</script>`;
  const one = styleguideSignatures(page(css));
  assert.deepEqual(one.uses.chip, ['--chip-bg', '--colour-accent', '--space-s'], 'its own rules, followed through var()');
  assert.deepEqual(one.uses.badge, ['--colour-line'], 'what the shared CSS resolves is the base\'s, and a style in its markup counts');
  const changed = (a, b) => Object.keys(a.comp).filter((n) => a.comp[n] !== b.comp[n]);
  // The accent, in one brand only: the chip resolves it through --chip-bg; the card and the badge do not.
  const acme = styleguideSignatures(page(css.replace('#00aa55', '#ff0000')));
  assert.equal(acme.base, one.base);
  assert.deepEqual(changed(one, acme), ['chip']);
  // A token only the card uses.
  const space = styleguideSignatures(page(css.replace('--space-s: 8px', '--space-s: 12px')));
  assert.deepEqual(changed(one, space).sort(), ['cardTile', 'chip']);
  // A token the shared CSS resolves (the body's text) is every component's: the base changes.
  const ink = styleguideSignatures(page(css.replace('#1a1a1a', '#000')));
  assert.notEqual(ink.base, one.base);
  // A rule of the app no component carries (its shell) styles nothing here, so a token only it uses keeps everything.
  assert.deepEqual(styleguideSignatures(page(css.replace('0 1px var(--colour-accent)', '0 2px red'))), one);
  // A class only inside :not() is not needed: that rule is the badge's.
  assert.notDeepEqual(styleguideSignatures(page(css.replace('font-weight: 600', 'font-weight: 700'))).comp.badge, one.comp.badge);
  // When the brands were read, and the tokens they name that the system lacks, measure nothing.
  assert.deepEqual(styleguideSignatures(page(css, { list: [{ key: 'acme', name: 'Acme' }], read: '2026-02-02', unknown: ['x'] })), one);
  // A brand's own stylesheet is read the same way.
  const brandCss = (v) => ({ list: [{ key: 'acme', name: 'Acme' }], css: `[data-brand="acme"] :is(.sg-layout) { --space-s: ${v} }` });
  const b1 = styleguideSignatures(page(css, brandCss('10px'))), b2 = styleguideSignatures(page(css, brandCss('14px')));
  assert.equal(b2.base, b1.base);
  assert.deepEqual(changed(b1, b2).sort(), ['cardTile', 'chip']);
  // The run says which components were checked again, and the token that moved them.
  const part = (s) => ({ run: 'r', base: s.base, comp: { chip: s.comp.chip, cardTile: s.comp.cardTile }, tokens: Object.fromEntries([...s.uses.chip, ...s.uses.cardTile].map((v) => [v, s.tokens[v]])) });
  const w = whyChecked([{ parts: part(space), uses: { chip: space.uses.chip, cardTile: space.uses.cardTile } }], { k: { parts: part(one) } });
  assert.deepEqual(w.components.sort(), ['cardTile', 'chip']);
  assert.deepEqual(Object.fromEntries(Object.entries(w.tokens).map(([v, ns]) => [v, ns.sort()])), { '--space-s': ['cardTile', 'chip'] });
  assert.equal(whyCheckedLine(w), '1 part checked again: 2 components changed (cardTile, chip), by token --space-s (2)');
});

test('the CSS is read as its rules: at-rules, nesting, and strings or data URLs that hold braces and semicolons', () => {
  const rules = cssRuleList(`@font-face { font-family: "X"; src: url(data:font/woff2;base64,AA==) }
    @media (min-width: 600px) { .a { color: red } @supports (display: grid) { .b { display: grid } } }
    .c { content: "}"; color: blue; .d { color: green } @media print { color: black } }
    @keyframes spin { from { transform: rotate(0) } to { transform: rotate(1turn) } }
    @import url("x.css");`);
  const show = (r) => `${r.at.join('|')}§${r.sel}§${r.decls.map(([p, v]) => `${p}:${v}`).join(';')}`;
  assert.deepEqual(rules.map(show).sort(), [
    '@font-face§§font-family:"X";src:url(data:font/woff2;base64,AA==)',
    '@keyframes spin§from§transform:rotate(0)',
    '@keyframes spin§to§transform:rotate(1turn)',
    '@media (min-width: 600px)§.a§color:red',
    '@media (min-width: 600px)|@supports (display: grid)§.b§display:grid',
    '@media print§.c§color:black',
    '§.c§content:"}";color:blue',
    '§.c{.d§color:green',
    '§@import url("x.css")§',
  ].sort());
});

// A part checked again says why, from what it was signed with last time.
test('a part checked again says why: the check, the page CSS, a component by name, or never checked before', () => {
  const was = { k1: { parts: { run: 'r', base: 'b', comp: { chip: 'c1', cardTile: 't1' } } }, k2: { parts: { run: 'r', base: 'b', comp: { badge: 'g1' } } }, k3: { parts: { run: 'r', base: 'b', comp: { tab: 'x' } } } };
  const t = (comp, extra = {}) => ({ parts: { run: 'r', base: 'b', comp }, ...extra });
  const w = whyChecked([t({ chip: 'c1', cardTile: 't2' }), t({ badge: 'g1' }, { parts: { run: 'r', base: 'B', comp: { badge: 'g1' } } }), t({ tab: 'x' }, { parts: { run: 'R', base: 'b', comp: { tab: 'x' } } }), t({ menu: 'm' }), t({ chip: 'c1' }, { kept: {} })], was);
  assert.deepEqual(w, { checked: 4, run: 1, css: 1, components: ['cardTile'], tokens: {}, fresh: 1 });
  assert.equal(whyCheckedLine(w), "4 parts checked again: the check or its settings changed (1); the CSS every component shares changed (1); 1 component changed (cardTile); not checked before (1)");
  assert.equal(whyCheckedLine(whyChecked([], was)), '');
  // An older entry for the same components is not the one compared: the newest is.
  const older = { old: { at: '2026-01-01', parts: { run: 'r', base: 'b', comp: { chip: 'c0' } } }, now: { at: '2026-02-01', parts: { run: 'r', base: 'b', comp: { chip: 'c1' } } } };
  assert.deepEqual(whyChecked([t({ chip: 'c1' }, { parts: { run: 'r', base: 'B', comp: { chip: 'c1' } } })], older).css, 1);
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
  try { out = execFileSync(process.execPath, [join(ENGINE, 'lib', 'a11y-check.mjs'), '--url', pathToFileURL(join(dir, 'page.html')).href, '--json-out', join(dir, 'a11y.json'), ...args], { cwd: dir, encoding: 'utf8', timeout: budget(120000), env: { ...process.env, CHROME_PATH: CHROME, NO_COLOR: '1', ...env } }); }
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

// Several pages to check are shared out among copies of the check, each in a browser of its own; the report is the same
// as one run's, and the next run puts every page back.
test('pages shared out among copies of the check report what one run reports, and are all kept for the next', { skip: HAS_CHROME ? false : 'no Chrome available', timeout: budget(900000) }, () => {
  const pages = { 'p1.html': PAGE.replace('BODY', ''), 'p2.html': PAGE.replace('BODY', '<img src="x.png">'), 'p3.html': PAGE.replace('BODY', '<a href="#"></a>'), 'p4.html': PAGE.replace('BODY', '<p>ok</p>') };
  const runAll = (dir, env = {}) => {
    let out;
    const urls = Object.keys(pages).flatMap((f) => ['--url', pathToFileURL(join(dir, f)).href]);
    try { out = execFileSync(process.execPath, [join(ENGINE, 'lib', 'a11y-check.mjs'), ...urls, '--json-out', join(dir, 'a11y.json')], { cwd: dir, encoding: 'utf8', timeout: budget(300000), env: { ...process.env, ...env } }); }
    catch (e) { out = (e.stdout ?? '') + (e.stderr ?? ''); }
    return { out, json: JSON.parse(readFileSync(join(dir, 'a11y.json'), 'utf8')) };
  };
  const shared = makeFixture({ ...pages, 'ds-config.json': JSON.stringify({ a11y: { parallel: 2 } }) });
  const one = makeFixture({ ...pages, 'ds-config.json': JSON.stringify({ a11y: { parallel: 1 } }) });
  const a = runAll(shared), b = runAll(one);
  assert.match(a.out, /4 parts to check: 2 pages at once/);
  assert.doesNotMatch(b.out, /pages at once/);
  const issues = (j) => j.issues.map((i) => `${i.issue} ${i.page ?? ''}`).sort();
  assert.deepEqual(issues(a.json), issues(b.json));
  const again = runAll(shared, { CHROME_PATH: '/nonexistent/chrome' });
  assert.match(again.out, /4 of 4 pages unchanged since they were last checked/);
});

// The guide's own CSS is mostly its own screens (the Status table, a side panel): a change there reaches no component's
// stage, so it must not send every component to be checked again. What reaches the stages is signed apart (reachBase),
// from the classes read on the page around and inside them.
const guidePage = (guideCss = '', systemCss = '.chip { padding: 8px }') => `<!doctype html><html lang="en"><head><title>Guide</title><style data-system>${systemCss}</style>
<style>body { margin: 0 } .sg-page { padding: 16px } .sg-panel { color: #555 } ${guideCss}</style></head><body><main class="sg-page"><h1>Guide</h1>
<section id="c-chip" class="sg-comp"><div class="pg-preview"><button class="chip">Go</button></div></section><aside class="sg-panel">Panel</aside>
<script type="application/json" id="sg-data">${JSON.stringify({ components: [{ name: 'chip', cls: 'chip', markup: '<button class="chip">Go</button>' }] })}</script></main></body></html>`;
const REACH = ['chip', 'pg-preview', 'sg-comp', 'sg-page'];

test('what of the shared CSS reaches the stages is signed apart: the guide\'s own screens never move it', () => {
  const one = styleguideSignatures(guidePage(), { reach: REACH });
  assert.ok(one.reachBase);
  assert.equal(styleguideSignatures(guidePage()).reachBase, undefined, 'only with what the page showed');
  // The guide's side panel, its own buttons, a custom property only the panel sets: the base moves, what reaches does not.
  const panel = styleguideSignatures(guidePage('.sg-panel .sg-il-choice[aria-pressed="true"] .sg-mark { color: red } .sg-panel { --sg-hue: red }'), { reach: REACH });
  assert.notEqual(panel.base, one.base);
  assert.equal(panel.reachBase, one.reachBase);
  assert.equal(panel.comp.chip, one.comp.chip);
  // Around a stage, before one (a + or ~ reaches from there), with no class at all, or the system's own: it reaches.
  for (const css of ['.sg-comp { background: #000 }', 'main > section { color: red }', '.sg-page .pg-preview { outline: 1px solid }'])
    assert.notEqual(styleguideSignatures(guidePage(css), { reach: REACH }).reachBase, one.reachBase, css);
  assert.notEqual(styleguideSignatures(guidePage('', '.chip { padding: 8px } .sg-panel { color: red }'), { reach: REACH }).reachBase, one.reachBase, 'the system\'s CSS always counts');
});

test('a part takes the results of the one checked before only when its components and its check are the same, and only the shared CSS moved', () => {
  const parts = { run: 'r', base: 'b2', comp: { chip: 'c1' } };
  const was = { at: '2026-11-02T10:00:00Z', parts: { run: 'r', base: 'b1', comp: { chip: 'c1' }, reachBase: 'x' }, delta: {} };
  assert.equal(sharedOnly(parts, { a: was }), was);
  assert.equal(sharedOnly(parts, { a: { ...was, parts: { ...was.parts, reachBase: undefined } } }), null, 'one kept before what reaches was signed: checked');
  assert.equal(sharedOnly({ ...parts, comp: { chip: 'c2' } }, { a: was }), null, 'a component changed');
  assert.equal(sharedOnly({ ...parts, run: 'r2' }, { a: was }), null, 'the check changed');
  assert.equal(sharedOnly({ ...parts, base: 'b1' }, { a: was }), null, 'nothing shared moved: it would have been kept by its signature');
  const newer = { ...was, at: '2026-11-02T11:00:00Z', parts: { ...was.parts, comp: { chip: 'c0' } } };
  assert.equal(sharedOnly(parts, { a: was, b: newer }), null, 'the newest is the one that counts');
});

test('the style guide\'s own CSS changed outside every stage: its parts are put back after a look, never checked again', { skip: HAS_CHROME ? false : 'no Chrome available', timeout: budget(600000) }, () => {
  const dir = makeFixture({ 'ds-config.json': JSON.stringify({ name: 'Acme' }), [`${OUT_DIR}/styleguide/index.html`]: guidePage() });
  const page = join(dir, OUT_DIR, 'styleguide', 'index.html');
  const go = (env = {}) => {
    let out; try { out = execFileSync(process.execPath, [join(ENGINE, 'lib', 'a11y-check.mjs'), '--json-out', join(dir, 'a11y.json')], { cwd: dir, encoding: 'utf8', timeout: budget(120000), env: { ...process.env, ...env } }); } catch (e) { out = (e.stdout ?? '') + (e.stderr ?? ''); }
    return { out, json: JSON.parse(readFileSync(join(dir, 'a11y.json'), 'utf8')) };
  };
  const first = go();
  assert.ok(Object.values(readKept(join(dir, OUT_DIR, KEPT_FILE))).every((k) => k.parts?.reachBase), 'what reaches its stages is kept with it');
  writeFileSync(page, guidePage('.sg-panel .sg-il-choice { border: 1px solid red }'));
  const panel = go();
  assert.match(panel.out, /1 of them only after a look: the style guide's own CSS changed, and none of what changed reaches a component's stage/);
  assert.deepEqual(panel.json.issues, first.json.issues);
  assert.match(go({ CHROME_PATH: '/nonexistent/chrome' }).out, /1 of 1 page unchanged since it was last checked/, 'and from then on, no browser');
  writeFileSync(page, guidePage('.sg-panel .sg-il-choice { border: 1px solid red } .sg-comp { background: #000 }'));
  assert.match(go().out, /1 part checked again: the CSS every component shares changed/, 'a change around a stage is checked');
});

// What signs a result is what decides it. A finding's wording, who acts on it and a line of comment change nothing a
// browser measured, so they must not put every component of every system back in the queue; a threshold, a check or
// the page script must.
test('the signature follows what decides a result, not every line that lives near it', () => {
  const dir = join(ENGINE, 'lib');
  const source = (file) => readFileSync(join(dir, file), 'utf8');
  const edited = (file, change) => ({ read: (f) => (f.endsWith(`/${file}`) ? change(source(file)) : readFileSync(f, 'utf8')) });
  const base = { page: checkSignature({ dir, kind: 'page' }), component: checkSignature({ dir, kind: 'component' }) };
  const after = (file, change) => ({ page: checkSignature({ dir, kind: 'page', ...edited(file, change) }), component: checkSignature({ dir, kind: 'component', ...edited(file, change) }) });
  const same = (file, change, why) => { const a = after(file, change); assert.deepEqual(a, base, why); };
  const differs = (file, change, why) => { const a = after(file, change); assert.notDeepEqual(a, base, why); };

  // Words, and who acts on them: they say what was found, never whether it was found.
  same('a11y-words.mjs', (s) => s.replace('Add a visible outline (a focus ring)', 'Add a visible focus ring'), 'rewording a finding re-checks nothing');
  same('a11y-words.mjs', (s) => s.replace("who: 'designer'", "who: 'developer'"), 'moving a task to another person re-checks nothing');
  // A line that is only a comment cannot change what the code does.
  same('a11y-check.mjs', (s) => s.replace('// Structured record for --json', '// Structured record for the json output'), 'a whole-line comment re-checks nothing');
  // A comment after code is kept on purpose: finding where it really begins means reading the strings around it, and a
  // signature that guessed wrong would put back results the engine should have checked again.
  differs('a11y-check.mjs', (s) => s.replace("const WORDS = ['a11y-words.mjs'];", "const WORDS = ['a11y-words.mjs'];  // a note"), 'a trailing comment is kept: never guess where one starts');
  // What the check measures, and what it measures with: both decide, so both sign.
  differs('a11y-check.mjs', (s) => s.replace('AXE_VERSION', 'AXE_VERSION_CHANGED'), 'the rules it runs decide a result');
  differs('wcag-page.js', (s) => `${s}\n// a line of code\nconst nothing = 1;`, 'the page script decides a result');
  // The words module is not walked at all, so nothing it imports can sign a result either.
  assert.equal(engineFiles(join(dir, 'a11y-check.mjs'), { skip: ['a11y-words.mjs'] }).some((f) => f.endsWith('/a11y-words.mjs')), false);
});

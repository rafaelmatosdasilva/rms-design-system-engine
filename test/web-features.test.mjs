// web-features.test.mjs - the web features a component uses, against the browsers the team supports: the targets read
// where teams keep them, each feature not supported where it must be, the guarded ones left out, and each old pattern
// with what replaces it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readTargets, parseQueries, scanFile, scanFiles, supportLines, targetsSay, cmp, FEATURES, featuresFrom, DATA_KEYS } from '../lib/web-features.mjs';
import { fetchWebFeatures, cachedWebFeatures, WF_VERSION } from '../lib/web-features-data.mjs';
import { gzipSync } from 'node:zlib';
import { tempDir } from './helpers.mjs';

const reader = (files) => ({ read: (p) => { const k = Object.keys(files).find((f) => p.endsWith(join('/', f)) || p === f); return k ? files[k] : null; } });
const B = { chrome: '100', firefox: '113', safari: '15' };

test('versions compare by their parts', () => {
  assert.ok(cmp('16.4', '16.2') > 0);
  assert.ok(cmp('16', '16.0') === 0);
  assert.ok(cmp('9', '15.4') < 0);
});

test('the targets: explicit minimums read, the lowest kept, Safari on iOS read as Safari, and a query that needs usage data named as unread', () => {
  assert.deepEqual(parseQueries(['chrome >= 111', 'Firefox > 112', 'safari 16.4', 'ios_saf >= 15', 'not dead']), { browsers: { chrome: '111', firefox: '113', safari: '15' }, unread: [] });
  assert.deepEqual(parseQueries('last 2 versions, > 0.5%, edge >= 111'), { browsers: { edge: '111' }, unread: ['last 2 versions', '> 0.5%'] });
});

test('the targets are read where teams keep them: ds-config first, then package.json, then .browserslistrc, and none when there are none', () => {
  assert.deepEqual(readTargets('/p', { supportedBrowsers: { chrome: 111, safari: '16.4', opera: 90 } }, reader({})), { browsers: { chrome: '111', safari: '16.4' }, unread: ['opera: 90'], from: 'ds-config.json supportedBrowsers' });
  assert.deepEqual(readTargets('/p', { supportedBrowsers: 'chrome >= 105' }, reader({})).browsers, { chrome: '105' });
  const pkg = reader({ 'package.json': JSON.stringify({ browserslist: { production: ['firefox >= 115'], development: ['last 1 chrome version'] } }) });
  assert.deepEqual(readTargets('/p', {}, pkg), { browsers: { firefox: '115' }, unread: [], from: 'package.json browserslist' });
  const rc = reader({ '.browserslistrc': '# targets\nchrome >= 109\n[development]\nlast 1 chrome version\n[production staging]\nsafari >= 16\n' });
  assert.deepEqual(readTargets('/p', {}, rc), { browsers: { chrome: '109', safari: '16' }, unread: [], from: '.browserslistrc' });
  assert.equal(readTargets('/p', {}, reader({ 'package.json': '{"name":"acme"}' })), null);
  assert.equal(targetsSay({ browsers: { chrome: '111', safari: '16.4', firefox: '113' }, from: 'package.json browserslist' }), 'Chrome 111, Firefox 113 and Safari 16.4 (package.json browserslist)');
});

test('a feature the team\'s browsers do not all run is found, with its line and each browser it is missing in', () => {
  const css = '.cardTile { color: red; }\n.cardTile:has(img) { padding: 4px; }\n.cardTile { color: color-mix(in srgb, red 50%, blue); }\n';
  const r = scanFile({ file: 'src/card.css', text: css }, B);
  assert.deepEqual(r.features.map((f) => [f.id, f.line, f.missing.map((m) => `${m.browser} ${m.from}`)]), [
    ['has', 2, ['chrome 105', 'firefox 121', 'safari 15.4']],
    ['color-mix', 3, ['chrome 111', 'safari 16.2']],
  ]);
  // supported everywhere it must be: nothing
  assert.deepEqual(scanFile({ file: 'src/card.css', text: css }, { chrome: '120', firefox: '125', safari: '17' }).features, []);
});

test('a guarded feature is left out: inside @supports naming it, after a fallback declaration, behind a check in a script', () => {
  const css = [
    '@supports selector(:has(*)) { .cardTile:has(img) { gap: 4px; } }',
    '@supports not selector(:has(*)) { .cardTile:has(img) { color: red; } }',
    '.cardTile { color: #333; color: oklch(50% 0.1 200); }',
    '.cardTile { height: 100vh; height: 100dvh; }',
    '/* .cardTile:has(a) is in a comment */',
  ].join('\n');
  const r = scanFile({ file: 'src/card.css', text: css }, B);
  assert.deepEqual(r.features.map((f) => [f.id, f.line]), [['has', 2]]);
  const js = "if ('showPopover' in HTMLElement.prototype) el.showPopover();\nel.showModal();\n";
  assert.deepEqual(scanFile({ file: 'src/menu.ts', text: js }, { chrome: '100', firefox: '97', safari: '15' }).features.map((f) => f.id), ['dialog-js']);
  const vt = 'if (!document.startViewTransition) return update();\ndocument.startViewTransition(update);\n';
  assert.deepEqual(scanFile({ file: 'src/route.js', text: vt }, B).features, []);
  // :focus-visible beside a :focus style the older browsers still show
  assert.deepEqual(scanFile({ file: 'src/b.css', text: '.b:focus { outline: 2px solid; }\n.b:focus-visible { outline: 2px solid; }' }, B).features, []);
  assert.deepEqual(scanFile({ file: 'src/b.css', text: '.b:focus-visible { outline: 2px solid; }' }, B).features.map((f) => f.id), ['focus-visible']);
});

test('each kind of file is read for what it can hold: nesting only in plain CSS, markup in templates, scripts in scripts', () => {
  const nested = '.cardTile {\n  color: red;\n  & .title { font-weight: 600; }\n}\n';
  assert.deepEqual(scanFile({ file: 'src/card.css', text: nested }, B).features.map((f) => [f.id, f.line]), [['nesting', 3]]);
  assert.deepEqual(scanFile({ file: 'src/card.scss', text: nested }, B).features, []);
  const jsx = 'export const Menu = () => <div popover="auto" className="menu popover">x</div>;\n';
  assert.deepEqual(scanFile({ file: 'src/Menu.tsx', text: jsx }, B).features.map((f) => f.id), ['popover']);
  assert.deepEqual(scanFile({ file: 'src/Menu.tsx', text: '<div className="a popover b" />' }, B).features, []);
  const flex = '.row { display: flex; gap: 8px; }\n.grid { display: grid; gap: 8px; }\n';
  assert.deepEqual(scanFile({ file: 'src/row.css', text: flex }, { safari: '14' }).features.map((f) => [f.id, f.line]), [['flex-gap', 1]]);
  // a browser that runs it only from a later version than the one supported
  const fs = scanFile({ file: 'src/field.css', text: 'textarea { field-sizing: content; }' }, { firefox: '140' }).features;
  assert.deepEqual(fs[0].missing, [{ browser: 'firefox', from: '152' }]);
});

test('old patterns are named with what replaces them, the line-clamp idiom aside', () => {
  const css = '.a { display: -webkit-box; }\n.b { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }\n.c { -ms-flex: 1; zoom: 1; filter: alpha(opacity=50); }\n';
  assert.deepEqual(scanFile({ file: 'src/old.css', text: css }, B).old.map((o) => [o.id, o.line]), [['webkit-box', 1], ['ms-prefix', 3], ['filter-alpha', 3], ['zoom-hack', 3]]);
  const js = "input.addEventListener('keydown', (e) => { if (e.keyCode === 13) go(); });\ndocument.write('<p>');\n// e.keyCode in a comment\n";
  assert.deepEqual(scanFile({ file: 'src/field.js', text: js }, B).old.map((o) => [o.id, o.line]), [['document-write', 2], ['key-code', 1]]);
});

test('the lines: one per feature and file with how many more, each with the browsers and what to do, and no semicolon', () => {
  const files = [
    { file: 'src/card.css', text: '.a:has(b) {}\n.c:has(d) {}\n.e { display: -webkit-box; }\n' },
    { file: 'src/field.css', text: 'textarea { field-sizing: content; }' },
  ];
  const r = scanFiles(files, B);
  assert.equal(r.features.find((f) => f.id === 'has').more, 1);
  const lines = supportLines(r, B);
  assert.deepEqual(lines, [
    '2 features not supported in every browser the team supports:',
    '   · src/card.css:1 (and 1 more)  :has() runs from Chrome 105, Firefox 121 and Safari 15.4, and the team supports Chrome 100, Firefox 113 and Safari 15. Put it inside @supports selector(:has(*)), or raise the target.',
    '   · src/field.css:1  field-sizing runs from Chrome 123, Firefox 152 and Safari 26.2, and the team supports Chrome 100, Firefox 113 and Safari 15. Size the field another way where it does not run, or raise the target.',
    '1 old pattern the platform now replaces:',
    '   · src/card.css:3  display: -webkit-box, use display: flex',
  ]);
  for (const f of FEATURES) assert.doesNotMatch(f.hint, /;/);
  for (const l of lines) assert.doesNotMatch(l, /;/);
});

// The web platform's own data (web-features), in the shape its data.json has: each feature's support as a whole, and
// each of its compat keys' own.
const DATA = { features: {
  has: { kind: 'feature', name: ':has()', compat_features: ['css.selectors.has'], status: { support: { chrome: '105', edge: '105', firefox: '121', safari: '15.4' } } },
  'anchor-positioning': { kind: 'feature', name: 'Anchor positioning', compat_features: ['css.properties.anchor-name', 'css.properties.position-try'],
    status: { support: { chrome: '157', edge: '157', safari: '27' }, by_compat_key: { 'css.properties.anchor-name': { support: { chrome: '125', edge: '125', firefox: '147', safari: '26' } } } } },
  'text-box': { kind: 'feature', name: 'text-box', compat_features: ['css.properties.text-box-trim'], status: { support: { chrome: '133', edge: '133', safari: '18.2' } } },
  'target-text': { kind: 'feature', name: '::target-text', compat_features: ['css.selectors.target-text'], status: { support: { chrome: '89', edge: '89', firefox: '131', safari: '18.2' } } },
  'starting-style': { kind: 'feature', name: '@starting-style', compat_features: ['css.at-rules.starting-style'], status: { support: { chrome: '117', edge: '117', firefox: '129', safari: '17.5' } } },
  search: { kind: 'feature', name: '<search>', compat_features: ['html.elements.search'], status: { support: { chrome: '118', edge: '118', firefox: '118', safari: '17' } } },
  content: { kind: 'feature', name: 'content', compat_features: ['css.properties.content'], status: { support: { chrome: '200', edge: '200', firefox: '200', safari: '200' } } },
  moved: { kind: 'moved', redirect_target: 'has' },
} };
const TARGETS = { chrome: '120', edge: '120', firefox: '120', safari: '17' };

test('with the web platform\'s data: the table\'s versions are its, per key where an entry finds one thing', () => {
  const list = featuresFrom(DATA);
  assert.deepEqual(list.find((f) => f.id === 'anchor-positioning').need, { chrome: '125', edge: '125', firefox: '147', safari: '26' }, 'anchor-name\'s own key, not the whole feature\'s 157');
  assert.equal(list.find((f) => f.id === 'has').from, 'data');
  assert.equal(list.find((f) => f.id === 'dialog').from, undefined, 'a feature the data lacks keeps the table\'s versions');
  assert.ok(Object.keys(DATA_KEYS).every((id) => FEATURES.some((f) => f.id === id)), 'every key names a table entry');
  assert.equal(featuresFrom(null), FEATURES, 'with no data, the table');
});

test('with the data, a feature the table never listed is found: a property, a selector, an at-rule, an element', () => {
  const list = featuresFrom(DATA);
  const css = scanFile({ file: 'a.css', text: '.content:hover { color: red }\n.title { text-box-trim: trim-both }\n::target-text { color: red }\n@starting-style { .x { opacity: 0 } }' }, TARGETS, list);
  assert.deepEqual(css.features.map((f) => f.id).sort(), ['starting-style:starting-style', 'target-text:target-text', 'text-box:text-box-trim']);
  assert.deepEqual(css.features.find((f) => f.id === 'text-box:text-box-trim').missing.map((m) => m.browser), ['chrome', 'edge', 'firefox', 'safari'], 'Firefox runs it in no version');
  assert.ok(!css.features.some((f) => /content/.test(f.id)), 'a class in a selector is not a property');
  assert.deepEqual(scanFile({ file: 'a.vue', text: '<template><search><input></search></template>' }, { ...TARGETS, safari: '16' }, list).features.map((f) => f.id), ['search:search']);
  // A guard holds for them as for the table's.
  assert.deepEqual(scanFile({ file: 'b.css', text: '@supports (text-box-trim: trim-both) { .t { text-box-trim: trim-both } }' }, TARGETS, list).features, []);
  // The table alone finds none of them.
  assert.deepEqual(scanFile({ file: 'a.css', text: '.title { text-box-trim: trim-both }' }, TARGETS).features, []);
});

test('the data is the pinned file or nothing: a download that is not it is never read', async () => {
  const home = tempDir('wf-home-');
  assert.equal(cachedWebFeatures(home), null, 'nothing cached yet');
  // A package whose data.json is not the pinned one.
  const tar = (name, body) => { const h = Buffer.alloc(512); h.write(name); h.write((body.length).toString(8).padStart(11, '0'), 124); return Buffer.concat([h, Buffer.from(body), Buffer.alloc((512 - (body.length % 512)) % 512), Buffer.alloc(1024)]); };
  const fake = gzipSync(tar('package/data.json', JSON.stringify(DATA)));
  let asked = null;
  assert.equal(await fetchWebFeatures({ home, get: async (url) => { asked = url; return fake; } }), null);
  assert.match(asked, new RegExp(`web-features-${WF_VERSION.replace(/\./g, '\\.')}\\.tgz$`), 'the pinned version, from the registry');
  assert.equal(cachedWebFeatures(home), null, 'and nothing kept');
});

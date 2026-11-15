// web-features.test.mjs - the web features a component uses, against the browsers the team supports: the targets read
// where teams keep them, each feature not supported where it must be, the guarded ones left out, and each old pattern
// with what replaces it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readTargets, parseQueries, scanFile, scanFiles, supportLines, targetsSay, cmp, FEATURES } from '../lib/web-features.mjs';

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
  // a browser that never runs it
  const fs = scanFile({ file: 'src/field.css', text: 'textarea { field-sizing: content; }' }, { firefox: '140' }).features;
  assert.deepEqual(fs[0].missing, [{ browser: 'firefox', from: null }]);
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
    '   · src/field.css:1  field-sizing runs from Chrome 123 and Safari 26.2 and does not run in Firefox yet, and the team supports Chrome 100, Firefox 113 and Safari 15. Size the field another way where it does not run, or raise the target.',
    '1 old pattern the platform now replaces:',
    '   · src/card.css:3  display: -webkit-box, use display: flex',
  ]);
  for (const f of FEATURES) assert.doesNotMatch(f.hint, /;/);
  for (const l of lines) assert.doesNotMatch(l, /;/);
});

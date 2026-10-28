// The style guide as a page and the files beside it (styleguide-files.mjs): its styles, code, fonts and data each in a
// file named by what it holds; read back as one text; copied for publishing without the rest of its folder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { splitPage, writeStyleguide, readPage, pageData, copyPage, dataScript, dataOfScript } from '../styleguide-files.mjs';
import { pageFiles } from '../stores.mjs';
import { tempDir } from './helpers.mjs';

// Text a data file must carry exactly: a backtick, ${, a < the inline tag escaped, a backslash before each, a line separator.
const DATA = { title: 'Acme', components: [{ name: 'cardTile', markup: '<div class="cardTile">`${x}` \\` \\u003c </div> ', source: { text: 'a\\\\b' } }] };
const json = JSON.stringify(DATA).replace(/</g, '\\u003c');
const page = (data = json) => `<!doctype html><html><head>
<style data-font-from="https://fonts.example/css?family=Mono">@font-face { font-family: Mono; src: url(data:font/woff2;base64,AAAA); }</style>
<style data-system>.cardTile { color: var(--text); }</style>
<!--sg-file:styleguide-->
<style>.sg-page { margin: 0; }</style>
</head><body>
<script type="application/json" id="sg-data">${data}</script>
<script>/* wcag-page.js */</script>
<!--sg-file:styleguide-->
<script>
(function () { var DATA = JSON.parse(self.SG_DATA_JSON || document.getElementById('sg-data').textContent || '{}'); self.shown = DATA; })();
</script>
</body></html>`;

test('a page splits into its files, each named by what it holds; the system\'s CSS and the checks stay in the page', () => {
  const { html, files } = splitPage(page(), 'index');
  const names = [...files.keys()];
  assert.equal(names.length, 4);
  for (const re of [/^assets\/fonts\.[0-9a-f]{10}\.css$/, /^assets\/styleguide\.[0-9a-f]{10}\.css$/, /^assets\/styleguide\.[0-9a-f]{10}\.js$/, /^assets\/index\.data\.[0-9a-f]{10}\.js$/]) assert.ok(names.some((n) => re.test(n)), String(re));
  for (const n of names) assert.ok(html.includes(`"${n}"`), `${n} linked`);
  assert.match(html, /<style data-system>/);
  assert.match(html, /<script>\/\* wcag-page\.js \*\/<\/script>/);
  assert.doesNotMatch(html, /sg-file|application\/json/);
  // The same text, the same names: a rebuild that changes nothing keeps every file (and a browser's copy of it).
  assert.deepEqual([...splitPage(page(), 'index').files.keys()], names);
  // A page with no mark (a project's own template) stays whole.
  assert.equal(splitPage('<script type="application/json" id="sg-data">{}</script>').html, '<script type="application/json" id="sg-data">{}</script>');
});

test('the data file sets the same JSON the page tag held, every character kept', () => {
  const js = dataScript(json);
  const ctx = { self: {} };
  runInNewContext(js, ctx);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.self.SG_DATA)), DATA);
  assert.deepEqual(JSON.parse(dataOfScript(js)), DATA);
  // A key __proto__ stays a key: such data is kept as text the page parses.
  const odd = JSON.stringify({ components: [{ name: 'cardTile', props: { ['__proto__']: 1 } }] });
  const oddJs = dataScript(odd), oddCtx = { self: {} };
  runInNewContext(oddJs, oddCtx);
  assert.deepEqual(Object.keys(JSON.parse(oddCtx.self.SG_DATA_JSON).components[0].props), ['__proto__']);
  assert.equal(dataOfScript(oddJs).length > 0, true);
});

test('written: the page and its files; read back as one page, the same data; an older build\'s files removed, nothing else', () => {
  const d = tempDir('sg-files-');
  writeFileSync(join(d, 'my.theme.json'), '{}');
  writeFileSync(join(d, 'app.0123456789.js'), 'mine');
  const first = writeStyleguide(join(d, 'index.html'), page(json.replace('Acme', 'Northwind')));
  writeStyleguide(join(d, 'button.html'), page());   // a page of one component beside the whole system's
  const second = writeStyleguide(join(d, 'index.html'), page());
  assert.ok(!existsSync(join(d, first.files.find((f) => /\.data\./.test(f)))), 'the first build\'s data is gone');
  for (const f of [...second.files, 'my.theme.json', 'app.0123456789.js', 'button.html']) assert.ok(existsSync(join(d, f)), f);
  assert.ok(readdirSync(join(d, 'assets')).some((f) => /^button\.data\.[0-9a-f]{10}\.js$/.test(f)), 'the other page keeps its own data');
  assert.deepEqual(readdirSync(d).filter((f) => /\.(css|js)$/.test(f)), ['app.0123456789.js'], 'the page\'s files are in assets/, none loose beside it');
  // An earlier build's files beside the page (before they went in assets/) are removed once no page links them.
  writeFileSync(join(d, 'index.data.0123456789.js'), 'x'); writeFileSync(join(d, 'styleguide.0123456789.css'), 'x');
  writeStyleguide(join(d, 'index.html'), page());
  assert.ok(!existsSync(join(d, 'index.data.0123456789.js')) && !existsSync(join(d, 'styleguide.0123456789.css')));
  assert.deepEqual(pageData(join(d, 'index.html')), DATA);
  const one = readPage(join(d, 'index.html'));
  assert.match(one, /<style data-font-from="https:\/\/fonts\.example\/css\?family=Mono">@font-face/);
  assert.match(one, /<style>\.sg-page \{ margin: 0; \}<\/style>/);
  assert.match(one, /var DATA = JSON\.parse/);
  assert.ok(second.bytes > readFileSync(join(d, 'index.html')).length);
  // Written whole when asked (a private copy read through a <base> elsewhere).
  writeStyleguide(join(d, 'whole.html'), page(), { split: false });
  assert.equal(readFileSync(join(d, 'whole.html'), 'utf8'), page());
});

test('published: the page and what it links, never the rest of its folder', () => {
  const d = tempDir('sg-files-');
  const { files } = writeStyleguide(join(d, 'guide.html'), page());
  writeFileSync(join(d, 'notes.txt'), 'mine');
  // The style guide store follows its links.
  assert.deepEqual([...pageFiles(join(d, 'guide.html')).keys()].sort(), ['guide.html', ...files].sort());
  // The Pages job copies it into public/, the page as index.html.
  const pub = join(d, 'public');
  assert.deepEqual(copyPage(join(d, 'guide.html'), pub).sort(), ['index.html', ...files].sort());
  assert.ok(!existsSync(join(pub, 'notes.txt')));
  assert.deepEqual(pageData(join(pub, 'index.html')), DATA);
});

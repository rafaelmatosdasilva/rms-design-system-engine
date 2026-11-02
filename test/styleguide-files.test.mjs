// The style guide as a page and the files beside it (styleguide-files.mjs): its styles, code, fonts and data each in a
// file named by what it holds; read back as one text; copied for publishing without the rest of its folder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { splitPage, writeStyleguide, readPage, pageData, copyPage, dataScript, dataOfScript } from '../lib/styleguide-files.mjs';
import { pageFiles } from '../lib/stores.mjs';
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

// A picture's bytes as the data carries them: one large enough to go in a file of its own, one small enough to stay.
const bigPicture = (seed) => `data:image/png;base64,${Buffer.alloc(3000, seed).toString('base64')}`;
const smallPicture = `data:image/png;base64,${Buffer.alloc(40, 7).toString('base64')}`;
const withPictures = (seed = 1) => ({ ...DATA, components: [{ ...DATA.components[0], figmaShots: [{ src: bigPicture(seed), w: 10, h: 10 }, { src: bigPicture(seed), w: 10, h: 10 }], icon: smallPicture }] });
const pageWith = (data) => page(JSON.stringify(data).replace(/</g, '\\u003c'));

test('a picture in the data goes into a file of its own, named by its bytes; a small one stays; read back, the data is the same', () => {
  const { files } = splitPage(pageWith(withPictures()), 'index');
  const pictures = [...files.keys()].filter((f) => f.startsWith('assets/img/'));
  assert.equal(pictures.length, 1, 'the same picture twice is one file');
  assert.match(pictures[0], /^assets\/img\/[0-9a-f]{10}\.png$/);
  assert.deepEqual(files.get(pictures[0]), Buffer.alloc(3000, 1));
  const data = [...files.entries()].find(([f]) => /\.data\./.test(f))[1];
  assert.ok(!data.includes('data:image/png;base64,AQEB'), 'the large picture left the data');
  assert.ok(data.includes(smallPicture), 'the small one stayed');
  assert.equal(data.split(`"${pictures[0]}"`).length - 1, 2, 'the data names it where it was');
  const d = tempDir('sg-files-');
  writeStyleguide(join(d, 'index.html'), pageWith(withPictures()));
  assert.ok(existsSync(join(d, pictures[0])));
  assert.deepEqual(pageData(join(d, 'index.html')), withPictures(), 'whatever reads the page back gets the pictures written in');
});

test('pictures: published and copied with the page that names them; an older build\'s removed, never one a page may still name', () => {
  const d = tempDir('sg-files-');
  const first = writeStyleguide(join(d, 'index.html'), pageWith(withPictures(1)));
  const old = first.files.find((f) => f.startsWith('assets/img/'));
  writeStyleguide(join(d, 'button.html'), pageWith(withPictures(2)));   // a page of one component, with its own picture
  const second = writeStyleguide(join(d, 'index.html'), pageWith(withPictures(3)));
  const now = second.files.find((f) => f.startsWith('assets/img/'));
  assert.ok(!existsSync(join(d, old)), 'the first build\'s picture is gone');
  assert.ok(existsSync(join(d, now)));
  assert.equal(readdirSync(join(d, 'assets/img')).length, 2, 'the other page keeps its own picture');
  assert.ok([...pageFiles(join(d, 'index.html')).keys()].includes(now), 'the store is sent the picture');
  const pub = join(d, 'public');
  assert.ok(copyPage(join(d, 'index.html'), pub).includes(now), 'the Pages job copies it');
  assert.deepEqual(pageData(join(pub, 'index.html')), withPictures(3));
  // A page whose data cannot be read may still name a picture: none is removed then.
  const buttonData = readdirSync(join(d, 'assets')).find((f) => /^button\.data\./.test(f));
  writeFileSync(join(d, 'assets', buttonData + '.keep'), readFileSync(join(d, 'assets', buttonData)));
  writeFileSync(join(d, 'button.html'), readFileSync(join(d, 'button.html'), 'utf8').replace(buttonData, 'button.data.0123456789.js'));
  writeStyleguide(join(d, 'index.html'), pageWith(withPictures(4)));
  assert.equal(readdirSync(join(d, 'assets/img')).length, 3, 'nothing removed while a page\'s data is missing');
});

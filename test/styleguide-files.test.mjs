// The style guide as a page and the files beside it (styleguide-files.mjs): its styles, code, fonts and data each in a
// file named by what it holds; read back as one text; copied for publishing without the rest of its folder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, readdirSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { splitPage, writeStyleguide, readPage, pageData, copyPage, dataScript, dataOfScript, partOfScript, isOwnFile } from '../lib/styleguide-files.mjs';
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
  assert.equal(names.length, 5);
  for (const re of [/^assets\/fonts\.[0-9a-f]{10}\.css$/, /^assets\/styleguide\.[0-9a-f]{10}\.css$/, /^assets\/styleguide\.[0-9a-f]{10}\.js$/, /^assets\/index\.data\.[0-9a-f]{10}\.js$/, /^assets\/index\.part\.[0-9a-f]{10}\.js$/]) assert.ok(names.some((n) => re.test(n)), String(re));
  // The page links its files; the data names the component's part (its code), loaded when its page opens.
  for (const n of names) assert.ok(/\.part\./.test(n) ? files.get(names.find((x) => /\.data\./.test(x))).includes(`"${n}"`) : html.includes(`"${n}"`), `${n} linked`);
  assert.ok(names.every(isOwnFile));
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
  // Its function makes a new copy each time, as the data was: what the page's code changes in its own is not in it.
  ctx.self.SG_DATA.components[0].markup = 'changed by the page';
  assert.notEqual(ctx.self.SG_DATA_OF(), ctx.self.SG_DATA);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.self.SG_DATA_OF())), DATA);
  // An earlier build's data file is still read back.
  assert.deepEqual(JSON.parse(dataOfScript(`self.SG_DATA=${JSON.stringify(DATA)};\n`)), DATA);
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
  const data = [...files.entries()].find(([f]) => /\.data\./.test(f))[1], part = [...files.entries()].find(([f]) => /\.part\./.test(f))[1];
  assert.ok(!data.includes('data:image/png;base64,AQEB') && !part.includes('data:image/png;base64,AQEB'), 'the large picture left the data');
  assert.ok(data.includes(smallPicture), 'the small one stayed');
  assert.equal(part.split(`"${pictures[0]}"`).length - 1, 2, 'the component\'s part (its Figma images) names it where it was');
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

// A system whose components carry what only their own page reads: their code, their changes, their Code Connect.
const sfc = '<template>\n  <button class="cardTile">\n    <slot />\n  </button>\n</template>\n<script setup>\nconst a = 1 < 2;\n</script>\n';
const log = [{ sha: 'a1b2c3', short: 'a1b2c3', date: '2026-10-01T10:00:00Z', subject: 'Tile radius', release: 'v1.2.0', url: 'https://example.com/c/a1b2c3', says: 'Rounder' }, { sha: '', subject: 'Draft', date: '2026-09-01T10:00:00Z', release: '' }];
const SYSTEM = {
  title: 'Acme', releaseLog: [{ release: 'v1.2.0', commits: [{ sha: 'a1b2c3', subject: 'Tile radius' }] }],
  components: [
    { name: 'cardTile', markup: '<div class="cardTile"></div>', source: { file: 'src/CardTile.vue', text: sfc }, changelog: log, codeConnect: { url: 'https://example.com/cc' }, controls: [{ label: 'Size' }] },
    { name: 'headerQuokka', markup: '<header></header>', controls: [] },
  ],
};

test('what only a component\'s page reads goes into its part; the data keeps what the first screen reads; read back, the same data in the same order', () => {
  const { html, files } = splitPage(pageWith(SYSTEM), 'index');
  const [dataName, data] = [...files.entries()].find(([f]) => /\.data\./.test(f));
  const parts = [...files.entries()].filter(([f]) => /\.part\./.test(f));
  assert.equal(parts.length, 1, 'one part: the component with nothing only its page reads has none');
  const ctx = { self: {} };
  runInNewContext(data, ctx);
  const slim = JSON.parse(JSON.stringify(ctx.self.SG_DATA)), tile = slim.components[0];
  assert.deepEqual(slim.sgParts, { cardTile: parts[0][0] });
  assert.equal(tile.source.text, '<template>\n  <button', 'its code: only its template\'s root element, the role the first screen reads');
  assert.equal(tile.source.file, 'src/CardTile.vue');
  assert.deepEqual(tile.changelog, [{ sha: 'a1b2c3', date: '2026-10-01T10:00:00Z', release: 'v1.2.0' }, { sha: '', subject: 'Draft', date: '2026-09-01T10:00:00Z', release: '' }], 'each change\'s release and date, and how History finds it');
  assert.ok(!('codeConnect' in tile));
  assert.deepEqual(Object.keys(tile), ['name', 'markup', 'source', 'changelog', 'controls']);
  assert.deepEqual(slim.components[1], SYSTEM.components[1]);
  // The part: a function by the component's name that makes what was taken out, and the component's keys in order.
  runInNewContext(parts[0][1], ctx);
  const made = JSON.parse(JSON.stringify(ctx.self.SG_PARTS.cardTile()));
  assert.deepEqual(made.keys, Object.keys(SYSTEM.components[0]));
  assert.deepEqual(made.fields, { source: SYSTEM.components[0].source, changelog: log, codeConnect: SYSTEM.components[0].codeConnect });
  assert.deepEqual(partOfScript(parts[0][1]).name, 'cardTile');
  assert.ok(html.includes(`data-src="${dataName}"`));
  // Read back: the whole data, every key where it was, the page tag as before the split.
  const d = tempDir('sg-files-');
  writeStyleguide(join(d, 'index.html'), pageWith(SYSTEM));
  assert.equal(JSON.stringify(pageData(join(d, 'index.html'))), JSON.stringify(SYSTEM));
  assert.equal(readPage(join(d, 'index.html')), pageWith(SYSTEM).replace(/<!--sg-file:styleguide-->\n/g, ''), 'the page read back is the page as written, less its marks');
});

test('a component\'s changes stay whole without a release log (History lists them), and two components of one name keep theirs', () => {
  const noLog = { ...SYSTEM, releaseLog: undefined };
  const one = splitPage(pageWith(noLog), 'index');
  const ctx = { self: {} };
  runInNewContext([...one.files.entries()].find(([f]) => /\.data\./.test(f))[1], ctx);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.self.SG_DATA.components[0].changelog)), log);
  const twice = { ...SYSTEM, components: [SYSTEM.components[0], { ...SYSTEM.components[0], markup: '<div></div>' }] };
  assert.equal([...splitPage(pageWith(twice), 'index').files.keys()].filter((f) => /\.part\./.test(f)).length, 0);
  // A part that cannot be read leaves its component as the data has it, still named.
  const d = tempDir('sg-files-');
  const { files } = writeStyleguide(join(d, 'index.html'), pageWith(SYSTEM));
  unlinkSync(join(d, files.find((f) => /\.part\./.test(f))));
  const back = pageData(join(d, 'index.html'));
  assert.equal(back.components[0].source.text, '<template>\n  <button');
  assert.ok(back.sgParts.cardTile);
});

test('parts: published and copied with the page that names them; an older build\'s removed, never one a page may still name', () => {
  const d = tempDir('sg-files-');
  const sys = (n) => ({ ...SYSTEM, components: [{ ...SYSTEM.components[0], codeConnect: { url: `https://example.com/cc/${n}` } }] });
  const first = writeStyleguide(join(d, 'index.html'), pageWith(sys(1)));
  const old = first.files.find((f) => /\.part\./.test(f));
  const chip = writeStyleguide(join(d, 'chip.html'), pageWith(sys(2))).files.find((f) => /\.part\./.test(f));
  const second = writeStyleguide(join(d, 'index.html'), pageWith(sys(3)));
  const now = second.files.find((f) => /\.part\./.test(f));
  assert.ok(!existsSync(join(d, old)), 'the first build\'s part is gone');
  assert.ok(existsSync(join(d, now)) && existsSync(join(d, chip)), 'the other page keeps its own part');
  assert.ok([...pageFiles(join(d, 'index.html')).keys()].includes(now), 'the store is sent the part');
  const pub = join(d, 'public');
  assert.ok(copyPage(join(d, 'index.html'), pub).includes(now), 'the Pages job copies it');
  assert.deepEqual(pageData(join(pub, 'index.html')), sys(3));
  // A page whose data cannot be read may still name a part: none is removed then.
  const chipData = readdirSync(join(d, 'assets')).find((f) => /^chip\.data\./.test(f));
  writeFileSync(join(d, 'chip.html'), readFileSync(join(d, 'chip.html'), 'utf8').replace(chipData, 'chip.data.0123456789.js'));
  writeStyleguide(join(d, 'index.html'), pageWith(sys(4)));
  assert.ok(existsSync(join(d, chip)) && existsSync(join(d, now)), 'nothing removed while a page\'s data is missing');
});

// The page's loader (splitPage's two inline scripts), run as a browser runs them: in the page, or in the component
// panel's frame, whose parent is the page (window.parent).
function boot(html, { search = '', hash = '#status', parent = null, file = null } = {}) {
  const tags = [...html.matchAll(/<script (id="sg-data" data-src="([^"]+)"|data-sg-parts)>([\s\S]*?)<\/script>/g)];
  const written = [];
  const ctx = { location: { search, hash }, document: { write: (t) => written.push(t), currentScript: null } };
  ctx.self = ctx; ctx.window = ctx;
  ctx.window.parent = parent ?? ctx;
  runInNewContext('0', ctx);
  for (const t of tags) {
    ctx.document.currentScript = { getAttribute: () => file ?? t[2] };
    runInNewContext(t[3], ctx);
    // The data file a top page writes in runs right after the loader, before the next script.
    for (const w of written.splice(0)) { const src = /src="([^"]+)"/.exec(w)?.[1]; ctx.loaded = [...(ctx.loaded ?? []), ...w.match(/src="[^"]+"/g).map((m) => m.slice(5, -1))]; if (src && /\.data\./.test(src)) runInNewContext(splitPage(pageWith(SYSTEM), 'index').files.get(src), ctx); }
  }
  return ctx;
}

test('the page loads its data and the part its address opens on before its code runs; the panel takes the page\'s own copies', () => {
  const { html, files } = splitPage(pageWith(SYSTEM), 'index');
  const dataName = [...files.keys()].find((f) => /\.data\./.test(f)), partName = [...files.keys()].find((f) => /\.part\./.test(f));
  // The page itself: its data written in, no part for Status.
  const top = boot(html);
  assert.deepEqual(top.loaded, [dataName]);
  assert.equal(top.SG_DATA.title, 'Acme');
  // A component's address: its part written in too; ?all every part (?all&only= those).
  assert.deepEqual(boot(html, { hash: '#c-cardTile/accessibility' }).loaded, [dataName, partName]);
  assert.deepEqual(boot(html, { search: '?all' }).loaded, [dataName, partName]);
  assert.deepEqual(boot(html, { search: '?all&only=headerQuokka' }).loaded, [dataName]);
  // The panel, the same page in a frame: its data made from the page's own function, as it was before the page's code
  // changed it, with nothing downloaded; a part the page holds taken the same way.
  top.SG_DATA.components[0].markup = 'changed by the page';
  runInNewContext(files.get(partName), top);
  top.SG_PART_FILES = { cardTile: partName };
  const panel = boot(html, { hash: '#c-cardTile', parent: top });
  assert.equal(panel.loaded, undefined, 'nothing downloaded');
  assert.notEqual(panel.SG_DATA, top.SG_DATA);
  assert.equal(panel.SG_DATA.components[0].markup, '<div class="cardTile"></div>');
  assert.equal(Object.getPrototypeOf(panel.SG_DATA), runInNewContext('Object.prototype', panel), 'its own copy, made in its frame');
  assert.notEqual(panel.SG_PARTS.cardTile, top.SG_PARTS.cardTile);
  assert.deepEqual(JSON.parse(JSON.stringify(panel.SG_PARTS.cardTile())), JSON.parse(JSON.stringify(top.SG_PARTS.cardTile())));
  // Loaded as any page when the page around it has other data, is of another origin, or holds no data of its own.
  assert.deepEqual(boot(html, { parent: { SG_DATA_FILE: 'assets/index.data.0123456789.js', SG_DATA_OF: () => ({}) } }).loaded, [dataName]);
  assert.deepEqual(boot(html, { parent: new Proxy({}, { get() { throw new Error('another origin'); } }) }).loaded, [dataName]);
  // A part the page does not hold, or holds from another file: the panel loads its own.
  assert.deepEqual(boot(html, { hash: '#c-cardTile', parent: { ...top, SG_PART_FILES: { cardTile: 'assets/index.part.0123456789.js' } } }).loaded, [partName]);
});

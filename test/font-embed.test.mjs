import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { embedRemoteFonts, keepSubsets } from '../font-embed.mjs';

const CSS = `/* cyrillic */
@font-face { font-family: 'Inter'; src: url(https://fonts.gstatic.com/s/inter/cyr.woff2) format('woff2'); unicode-range: U+0400; }
/* latin-ext */
@font-face { font-family: 'Inter'; src: url(https://fonts.gstatic.com/s/inter/ext.woff2) format('woff2'); unicode-range: U+0100; }
/* latin */
@font-face { font-family: 'Inter'; src: url(https://fonts.gstatic.com/s/inter/lat.woff2) format('woff2'); unicode-range: U+0000-00FF; }`;
const page = (href) => `<html><head><link rel="stylesheet" href="${href}"><link rel="stylesheet" href="local.css"></head><body></body></html>`;

test('only the latin subsets are kept', () => {
  const faces = keepSubsets(CSS);
  assert.equal(faces.length, 2);
  assert.ok(faces.every((f) => !/cyr\.woff2/.test(f)));
});

test('a font service\'s stylesheet is written into the page, its files as data, and read once', async () => {
  const cacheDir = mkdtempSync(join(tmpdir(), 'fonts-'));
  let reads = 0;
  const opts = { cacheDir, fetchText: async () => { reads++; return CSS; }, fetchBytes: async (u) => { reads++; return Buffer.from('font:' + u); } };
  const href = 'https://fonts.googleapis.com/css2?family=Inter&amp;display=swap';
  const r = await embedRemoteFonts(page(href), opts);
  assert.equal(r.embedded.length, 1);
  assert.doesNotMatch(r.html, /<link[^>]+fonts\.googleapis/);
  assert.match(r.html, /<style data-font-from="https:\/\/fonts\.googleapis\.com\/css2\?family=Inter&amp;display=swap">/);
  assert.match(r.html, /url\(data:font\/woff2;base64,/);
  assert.doesNotMatch(r.html, /fonts\.gstatic\.com/);
  assert.match(r.html, /href="local\.css"/, 'a stylesheet of its own stays linked');
  assert.equal(reads, 3);
  await embedRemoteFonts(page(href), opts);
  assert.equal(reads, 3, 'the second build reads from the cache');
  assert.ok(readdirSync(cacheDir).length >= 3);
});

test('a stylesheet that cannot be read keeps its link and says why', async () => {
  const href = 'https://fonts.googleapis.com/css2?family=Nope';
  const r = await embedRemoteFonts(page(href), { fetchText: async () => { throw new Error('offline'); } });
  assert.equal(r.embedded.length, 0);
  assert.deepEqual(r.kept, [{ url: href, why: 'offline' }]);
  assert.match(r.html, /<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com/);
});

test('a family the CSS asks for first that nothing loads is found; carried, linked, generic and fallback ones are not', async () => {
  const { missingFamilies, serviceFonts } = await import('../font-embed.mjs');
  const html = `<head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400&amp;display=swap"></head>
<style>@font-face { font-family: "acme"; src: url(data:font/woff2;base64,AA) }
body { font-family: "Open Sans", sans-serif; } code { font-family: SFMono-Regular, "Ubuntu Mono", monospace; }
h1 { font-family: Inter, sans-serif; } .b { font-family: acme; } .c { font-family: var(--f, serif); } .d { font-family: system-ui; }</style>`;
  assert.deepEqual(missingFamilies(html), ['Open Sans']);
  const asked = [];
  const r = await serviceFonts(['Open Sans', 'Private Face'], { fetchText: async (u) => { asked.push(u); if (/Private/.test(u) || /100\.\.900/.test(u)) throw new Error('400'); return '@font-face{}'; } });
  assert.deepEqual(r.found.map((f) => f.family), ['Open Sans']);
  assert.match(r.found[0].url, /family=Open\+Sans:ital,wght@0,200\.\.900/);
  assert.deepEqual(r.missing, [{ family: 'Private Face', why: 'not on the font service' }]);
});

test('missingFamilies: a family named through a custom property, in a rule or an inline style, is found', async () => {
  const { missingFamilies } = await import('../font-embed.mjs');
  assert.deepEqual(missingFamilies('<style>:root { --font-family: Acme Sans; } body { font-family: var(--font-family, serif); }</style>'), ['Acme Sans']);
  assert.deepEqual(missingFamilies('<b style="font-family:var(--unset, acme grotesk), sans-serif">a</b>'), ['acme grotesk']);
  assert.deepEqual(missingFamilies('<style>@font-face { font-family: "Acme Sans"; src: url(x); } :root { --f: Acme Sans; } p { font-family: var(--f); }</style>'), []);
});

test('a family\'s own files are found in any folder of the system, by file or folder name', async () => {
  const { localFonts } = await import('../font-embed.mjs');
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const root = mkdtempSync(join(tmpdir(), 'own-fonts-'));
  mkdirSync(join(root, 'assets/fonts/Acme'), { recursive: true });
  writeFileSync(join(root, 'assets/fonts/Acme/Acme-Bold.woff2'), 'b');
  writeFileSync(join(root, 'assets/fonts/Acme/Acme-Regular.woff2'), 'r');
  mkdirSync(join(root, 'type/Grotesk'), { recursive: true });
  writeFileSync(join(root, 'type/Grotesk/Medium.otf'), 'm');
  mkdirSync(join(root, 'node_modules/@fontsource/mono-x/files'), { recursive: true });
  writeFileSync(join(root, 'node_modules/@fontsource/mono-x/files/mono-x-latin-700-normal.woff2'), 'x');
  writeFileSync(join(root, 'node_modules/@fontsource/mono-x/files/mono-x-cyrillic-700-normal.woff2'), 'c');
  const r = await localFonts(['Acme', 'Grotesk', 'Mono X', 'Nowhere'], [root]);
  assert.deepEqual(r.found, ['Acme', 'Grotesk', 'Mono X']);
  assert.deepEqual(r.missing, ['Nowhere']);
  assert.ok(r.faces.some((f) => /"Acme".*font-weight: 700/.test(f)));
  assert.ok(r.faces.some((f) => /"Grotesk".*font-weight: 500/.test(f)));
  assert.equal(r.faces.filter((f) => /"Mono X"/.test(f)).length, 1, 'the latin file only');
  assert.ok(r.faces.some((f) => /"Mono X".*font-weight: 700/.test(f)));
});

test('a family on no font service but on Fontsource is written in from there', async () => {
  const { fontsourceFonts } = await import('../font-embed.mjs');
  const meta = { family: 'Open Thing', subsets: ['latin', 'cyrillic'], weights: [400, 700], styles: ['normal'], variable: false,
    variants: { 400: { normal: { latin: { url: { woff2: 'https://cdn.example/latin-400.woff2' } } } }, 700: { normal: { latin: { url: { woff2: 'https://cdn.example/latin-700.woff2' } } } } } };
  const r = await fontsourceFonts(['Open Thing', 'Gone'], { fetchText: async (u) => { if (/open-thing/.test(u)) return JSON.stringify(meta); throw new Error('404'); }, fetchBytes: async (u) => Buffer.from(u) });
  assert.deepEqual(r.found, ['Open Thing']);
  assert.deepEqual(r.missing, ['Gone']);
  assert.equal(r.faces.length, 2);
  assert.ok(r.faces.every((f) => /url\(data:font\/woff2;base64,/.test(f)));
});

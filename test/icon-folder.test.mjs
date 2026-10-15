// The system's icons kept as one SVG file each, read as one <symbol> sheet (icon-folder.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { findIconFolder, folderSymbols, svgToSymbol, symbolId } from '../icon-folder.mjs';

const svg = (inner, attrs = 'width="24" height="24" viewBox="0 0 24 24"') => `<?xml version="1.0"?>\n<svg ${attrs} xmlns="http://www.w3.org/2000/svg">${inner}</svg>\n`;
const project = (files) => {
  const root = mkdtempSync(join(tmpdir(), 'icon-folder-'));
  for (const [p, text] of Object.entries(files)) { mkdirSync(join(root, p, '..'), { recursive: true }); writeFileSync(join(root, p), text); }
  return root;
};

test('the icon folder is found in the code: named icon or icons, five SVG files or more, the one under src first', () => {
  const sizes = ['xs', 's', 'm'];
  const files = Object.fromEntries(sizes.flatMap((s) => ['alert', 'close'].map((n) => [`src/assets/icons/${s}/${n}-${s}.svg`, svg('<path d="M0 0h24v24H0z"/>')])));
  Object.assign(files, { 'docs/icons/a.svg': svg(''), 'node_modules/pkg/icons/1.svg': svg(''), 'public/img/logo.svg': svg('') });
  for (let i = 0; i < 9; i++) files[`node_modules/pkg/icons/${i}.svg`] = svg('');
  const root = project(files);
  assert.equal(findIconFolder(root), 'src/assets/icons', 'node_modules is never read, a folder with too few is not one');
  assert.equal(findIconFolder(project({ 'src/a.svg': svg('') })), null, 'no icon folder');
  const syms = folderSymbols(root, 'src/assets/icons');
  assert.deepEqual(syms.map((x) => x.id), ['m-alert-m', 'm-close-m', 's-alert-s', 's-close-s', 'xs-alert-xs', 'xs-close-xs']);
  assert.equal(syms[0].file, 'src/assets/icons/m/alert-m.svg');
});

test('each file a symbol: its own viewBox, else its size; the ids it uses inside kept apart from every other file\'s', () => {
  assert.equal(symbolId('m/alert-m.svg'), 'm-alert-m');
  assert.equal(symbolId('flags/EUR (old).svg'), 'flags-EUR-old');
  assert.equal(svgToSymbol('a', svg('<path d="M1 1"/>')), '<symbol id="a" viewBox="0 0 24 24"><path d="M1 1"/></symbol>');
  assert.equal(svgToSymbol('b', svg('<rect/>', 'width="16px" height="16"')), '<symbol id="b" viewBox="0 0 16 16"><rect/></symbol>');
  assert.equal(svgToSymbol('c', '<div></div>'), null);
  const s = svgToSymbol('flag', svg('<defs><clipPath id="clip0"><rect/></clipPath><linearGradient id="g"/></defs><g clip-path="url(#clip0)"><path fill="url(\'#g\')"/><use href="#clip0" xlink:href="#g"/></g>'));
  assert.match(s, /<clipPath id="flag__clip0">/);
  assert.match(s, /clip-path="url\(#flag__clip0\)"/);
  assert.match(s, /fill="url\(#flag__g\)"/);
  assert.match(s, /<use href="#flag__clip0" xlink:href="#flag__g"\/>/);
  assert.doesNotMatch(s, /"#?clip0"|#g"/, 'no id left as the file had it');
});

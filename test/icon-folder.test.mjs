// The system's icons kept as one SVG file each, read as one <symbol> sheet (icon-folder.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findIconFolder, folderSymbols, svgToSymbol, symbolId, iconFolder, codeConnectIcons } from '../icon-folder.mjs';
import { captureIcons, structureInputFiles } from '../structure-capture.mjs';
import { tempDir } from './helpers.mjs';

const ENGINE = fileURLToPath(new URL('..', import.meta.url));

const svg = (inner, attrs = 'width="24" height="24" viewBox="0 0 24 24"') => `<?xml version="1.0"?>\n<svg ${attrs} xmlns="http://www.w3.org/2000/svg">${inner}</svg>\n`;
const project = (files) => {
  const root = tempDir('icon-folder-');
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
  // A stroked icon's own painting on its <svg> stays on the symbol: without fill="none" its outlines fill black.
  assert.equal(svgToSymbol('d', svg('<path d="M1 1" stroke="#000"/>', 'viewBox="0 0 72 72" fill="none" stroke-linecap="round" xmlns:x="y"')), '<symbol id="d" viewBox="0 0 72 72" fill="none" stroke-linecap="round"><path d="M1 1" stroke="#000"/></symbol>');
  const s = svgToSymbol('flag', svg('<defs><clipPath id="clip0"><rect/></clipPath><linearGradient id="g"/></defs><g clip-path="url(#clip0)"><path fill="url(\'#g\')"/><use href="#clip0" xlink:href="#g"/></g>'));
  assert.match(s, /<clipPath id="flag__clip0">/);
  assert.match(s, /clip-path="url\(#flag__clip0\)"/);
  assert.match(s, /fill="url\(#flag__g\)"/);
  assert.match(s, /<use href="#flag__clip0" xlink:href="#flag__g"\/>/);
  assert.doesNotMatch(s, /"#?clip0"|#g"/, 'no id left as the file had it');
});

// A system with its icons as files and Code Connect linking each Figma icon to its file.
const linkedProject = () => {
  const files = { 'ds-config.json': JSON.stringify({ paths: {} }) };
  for (const n of ['alert', 'close', 'check', 'plus', 'minus']) files[`src/assets/icons/m/${n}-m.svg`] = svg(`<path d="M${n.length} 0h24v24H0z"/>`);
  files['src/assets/icons/flags/EUR.svg'] = svg('<path d="M1 1h2"/>');
  const link = (icon) => ({ url: `https://www.figma.com/design/KEY/Icons?node-id=1-${icon.length}`, component: icon.split('/').pop(), icon });
  files['src/figma/icons/icons.figma.batch.json'] = JSON.stringify({ templateFile: './icons.figma.batch.js', components: [...['alert', 'close', 'check', 'plus', 'minus'].map((n) => link(`m/${n}-m`)), link('m/search-m'), { url: 'x', component: 'Button' }] });
  return project(files);
};
const run = (root, script) => spawnSync(process.execPath, [join(ENGINE, script)], { cwd: root, encoding: 'utf8' });

test('Figma\'s icons are read from Code Connect\'s batch files, each meeting its file on its path', () => {
  const root = linkedProject();
  const linked = codeConnectIcons(root);
  assert.deepEqual(linked.map((l) => l.id), ['m-alert-m', 'm-check-m', 'm-close-m', 'm-minus-m', 'm-plus-m', 'm-search-m'], 'an entry with no icon path is not an icon');
  assert.equal(linked.find((l) => l.id === 'm-search-m').name, 'search-m');
  assert.deepEqual(codeConnectIcons(project({ 'a.json': '{}' })), []);
  assert.equal(iconFolder(root, {}), 'src/assets/icons');
  assert.equal(iconFolder(root, { paths: { iconFolder: 'src/assets/icons/m/' } }), 'src/assets/icons/m', 'the configured folder wins');
});

test('the icon gate reads the folder: a Figma icon with no file fails, a file Figma has no icon for is listed', () => {
  const root = linkedProject();
  const inv = run(root, 'icon-inventory-check.mjs');
  assert.equal(inv.status, 1, inv.stdout + inv.stderr);
  assert.match(inv.stdout, /IN BOTH\s+5/);
  assert.match(inv.stdout, /Figma icon "search-m" has no file at src\/assets\/icons\/m\/search-m\.svg/);
  assert.match(inv.stdout, /CODE ONLY\s+1/);
  assert.match(inv.stdout, /flags-EUR/);
  writeFileSync(join(root, 'src/assets/icons/m/search-m.svg'), svg('<path d="M2 2h4"/>'));
  assert.equal(run(root, 'icon-inventory-check.mjs').status, 0);
  const sym = run(root, 'icon-check.mjs');
  assert.equal(sym.status, 0);
  assert.match(sym.stdout, /no sprite; 7 icon file\(s\) in src\/assets\/icons are the system's own/, 'it says what it read, never passes on nothing in silence');
});

test('with neither a snapshot nor Code Connect, the inventory says the folder was found and Figma\'s icons were not', () => {
  const files = { 'ds-config.json': '{}' };
  for (const n of ['a', 'b', 'c', 'd', 'e']) files[`src/icons/${n}.svg`] = svg('<path d="M0 0h1"/>');
  const r = run(project(files), 'icon-inventory-check.mjs');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /5 icon file\(s\) in src\/icons, but Figma's icons are not captured/);
});

test('the code capture reads the folder\'s icons by their path, never counting them unused, and rereads when one changes', () => {
  const root = linkedProject();
  const icons = captureIcons(root, {});
  assert.equal(icons['m-alert-m'].viewBox, '0 0 24 24');
  assert.equal(icons['m-alert-m'].paths, 1);
  assert.deepEqual(icons['m-alert-m'].definedAt, ['src/assets/icons/m/alert-m.svg']);
  assert.equal(icons['m-alert-m'].usedAt, undefined);
  assert.ok(structureInputFiles(root, {}).some((f) => f.endsWith(join('m', 'alert-m.svg'))));
});

// A colour token's job, read from the components that use it (token-jobs.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenJobs, tokenJobLines, cssOf, ratio, pageBackground } from '../token-jobs.mjs';

const theme = { file: 'theme.css', text: `:root {
  --app-background: #ffffff;
  --line-soft: #e5e5e5;
  --edge-strong: #6b6b6b;
  --fill-accent: #0a3cff;
  --fill-plain: #ffffff;
}` };
// A field and a tile with soft borders, a filled action whose border is soft too, a strong-edged picker, and a card.
const vue = (cls, style) => ({ file: `${cls}.vue`, text: cssOf(`${cls}.vue`, `<template><div class="${cls}"/></template>\n<style lang="scss">\n${style}\n</style>`) });
const sources = [theme,
  vue('field-plain', '.field-plain { border: 1px solid var(--line-soft); background: var(--fill-plain); &:disabled { border-color: var(--line-soft); } }'),
  vue('button-solid', '.button-solid { background: var(--fill-accent); border: 1px solid var(--line-soft); }'),
  vue('picker-tile', '.picker-tile { outline: 1px solid var(--edge-strong); }'),
  vue('card-note', '.card-note { border: 1px solid var(--line-soft); }'),
];
const comps = [{ name: 'fieldPlain', cls: '.field-plain' }, { name: 'buttonSolid', cls: '.button-solid' }, { name: 'pickerTile', cls: '.picker-tile' }, { name: 'cardNote', cls: '.card-note' }];

test('a border a control shows itself by is held at 3:1, by it or by the control\'s fill; a decorative one is not', () => {
  const rows = tokenJobs(sources, comps);
  const soft = rows.find((r) => r.var === '--line-soft');
  assert.deepEqual(soft.low.map((x) => x.name), ['fieldPlain'], 'the field\'s soft edge and white fill fail; the filled button passes by its fill');
  assert.equal(soft.low[0].border, ratio([229, 229, 229], [255, 255, 255]));
  assert.equal(soft.low[0].fill, 1);
  assert.deepEqual(soft.others, ['cardNote'], 'the card uses it as decoration');
  assert.ok(!soft.controls.some((x) => /disabled/.test(x.state)), 'a disabled state is exempt');
  const strong = rows.find((r) => r.var === '--edge-strong');
  assert.equal(strong.low.length, 0, 'a strong edge passes');
  assert.ok(!rows.some((r) => r.var === '--fill-accent'), 'a fill is no edge');
});

test('the lines: what fails and the fix, and one token doing two jobs with the split proposed', () => {
  const lines = tokenJobLines(tokenJobs(sources, comps));
  assert.match(lines[0], /^--line-soft is the edge by which fieldPlain \(border 1\.26:1, fill 1:1\) shows it can be clicked, and neither it nor the fill reaches 3:1 against the page \(WCAG 1\.4\.11\)/);
  assert.match(lines[1], /^--line-soft does two jobs: the edge of controls \(fieldPlain, buttonSolid\) and a decorative border \(cardNote\)\. A control border of its own/);
  assert.equal(lines.length, 2);
});

test('the page: the system\'s own background by its name, else white', () => {
  const resolve = (v) => ({ 'var(--app-background)': '#fafafa', 'var(--header-page-background)': 'transparent' }[v] ?? v);
  assert.equal(pageBackground(resolve, ['--header-page-background', '--app-background']), '#fafafa', 'a component\'s own page background is not the page');
  assert.equal(pageBackground(resolve, ['--x']), '#ffffff');
});

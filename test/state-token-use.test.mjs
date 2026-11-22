// A component's states use the system's state token where it has one (state-token-use.mjs, the code rule
// code-state-tokens), and a role's states are set in every mode its rest is (token-grammar.mjs token-states-modes).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stateTwins, stateTokenBreaks, stateTokenLine } from '../lib/state-token-use.mjs';
import { codeGrammarOf } from '../lib/code-grammar.mjs';
import { nameRules } from '../lib/token-grammar.mjs';

test('a state twin is named the ways systems name them', () => {
  assert.ok(stateTwins('--button-bg', 'hover').includes('--button-bg-hover'));
  assert.ok(stateTwins('--button-bg', 'hover').includes('--button-hover-bg'));
  assert.ok(stateTwins('--button-bg-default', 'active').includes('--button-bg-pressed'));
  assert.ok(stateTwins('--chip-border', 'focus-visible').includes('--chip-border-focus'));
});

test('a state rule that writes a primitive, a colour or the rest token where the state token exists is listed', () => {
  const css = `.btn { background: var(--button-bg); color: var(--button-fg); }
.btn:hover { background: var(--blue-700); }
.btn:active { background: var(--button-bg-pressed); }
.btn:disabled { color: #999; }
.tag:hover { background: var(--grey-100); }
.tag { background: var(--tag-bg); }`;
  const declared = new Set(['--button-bg', '--button-bg-hover', '--button-bg-pressed', '--button-fg', '--button-fg-disabled', '--tag-bg']);
  const { seen, breaks } = stateTokenBreaks([{ file: 'src/button.css', text: css }], declared);
  assert.equal(seen, true);
  assert.deepEqual(breaks.map((b) => [b.selector, b.prop, b.want]), [['.btn:hover', 'background', '--button-bg-hover'], ['.btn:disabled', 'color', '--button-fg-disabled']]);
  assert.equal(stateTokenLine(breaks[0]), '.btn:hover sets background: var(--blue-700), where the system has var(--button-bg-hover) (src/button.css:2)');
  assert.deepEqual(stateTokenBreaks([{ file: 'a.css', text: '.tag { background: var(--tag-bg); } .tag:hover { background: var(--grey-100); }' }], declared), { seen: false, breaks: [] }, 'no state token: nothing to follow or break');
});

test('the code rule counts only components with a state token to use, and reads a Vue file\'s own styles', () => {
  const vue = (cls, hover) => `<template><button class="${cls}"></button></template>\n<style>\n.${cls} { background: var(--${cls}-bg); }\n.${cls}:hover { background: ${hover}; }\n</style>`;
  const comps = [
    { name: 'Btn', file: 'src/Btn.vue', text: vue('btn', 'var(--btn-bg-hover)'), styles: [] },
    { name: 'Chip', file: 'src/Chip.vue', text: vue('chip', 'var(--blue-600)'), styles: [] },
    { name: 'Tag', file: 'src/Tag.vue', text: vue('tag', 'var(--grey-100)'), styles: [] },
  ];
  const g = codeGrammarOf({ components: comps, themeVars: ['--btn-bg', '--btn-bg-hover', '--chip-bg', '--chip-bg-hover', '--tag-bg'] });
  const r = g.code.rules.find((x) => x.id === 'code-state-tokens');
  assert.ok(r);
  assert.equal(r.of, 2, 'Tag has no hover token');
  assert.deepEqual(r.toFix.map((x) => x.component), ['Chip']);
  assert.match(r.toFix[0].value, /\.chip:hover sets background: var\(--blue-600\), where the system has var\(--chip-bg-hover\)/);
});

test('a role\'s state with no value in a mode its rest has is listed', () => {
  const t = (name, values) => ({ name, values });
  const rules = nameRules({ tokens: [
    t('button/bg/default', { light: '#fff', dark: '#111' }), t('button/bg/hover', { light: '#eee' }),
    t('link/fg/default', { light: '#00f', dark: '#99f' }), t('link/fg/hover', { light: '#00a', dark: '#77f' }),
  ] });
  const r = rules.find((x) => x.id === 'token-states-modes');
  assert.ok(r, rules.map((x) => x.id).join(', '));
  assert.deepEqual(r.items.map((i) => [i.where, i.value, i.fits]), [['button/bg/*', 'hover has no dark value', false], ['link/fg/*', '', true]]);
});

test('the edit check tells the agent the state token to write, on the lines it added', async () => {
  const { editFindings } = await import('../lib/edit-check.mjs');
  const { steeringTruth } = await import('../lib/steering-check.mjs');
  const truth = steeringTruth({ cssVars: ['--btn-bg', '--btn-bg-hover', '--blue-700'] });
  const full = '.btn { background: var(--btn-bg); }\n.btn:hover { background: var(--blue-700); }\n';
  const out = editFindings(['.btn:hover { background: var(--blue-700); }'], full, { truth, tokenByValue: new Map() }, { sheet: true, file: 'src/btn.css' });
  assert.ok(out.some((f) => /\.btn:hover sets background: var\(--blue-700\), where the system has a token for that state: write var\(--btn-bg-hover\)/.test(f.text)), JSON.stringify(out));
  const ok = editFindings(['.btn:hover { background: var(--btn-bg-hover); }'], '.btn { background: var(--btn-bg); }\n.btn:hover { background: var(--btn-bg-hover); }\n', { truth, tokenByValue: new Map() }, { sheet: true, file: 'src/btn.css' });
  assert.ok(!ok.some((f) => f.kind === 'state token'));
});

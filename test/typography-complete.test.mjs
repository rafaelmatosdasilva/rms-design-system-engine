// Text styles from Figma to the style guide, complete and accurate. The capture recipe takes a field bound to a variable
// from that variable (in the mode the code's root shows, not the mode Figma last drew), records the family and the
// variable each field binds, keeps a weight unitless and keeps the constants of a second collection ds-config names.
// The token check pairs each bound field with the code's variable by the naming convention (no map entry), lets one map
// entry feed a whole scale, compares a field that changes with a breakpoint in every breakpoint, and compares the family
// once. The style guide draws a style only when every field Figma gives it agrees. Every name here is invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { varsFromItems, standInFigma, varsScript, runRecipe } from '../figma-capture.mjs';
import { typographyPairs, typoTargets, familyGroups, bodyFontFamily } from '../text-styles.mjs';
import { agreedTokens, typographyTodos } from '../styleguide-data.mjs';
import { runGate } from './helpers.mjs';

const alias = (id) => ({ type: 'VARIABLE_ALIAS', id });
const coll = (id, name, modes) => ({ k: 'collection', id, v: { id, name, modes: modes.map(([modeId, n]) => ({ modeId, name: n })) } });
const variable = (id, name, resolvedType, valuesByMode, collection, scopes = ['ALL_SCOPES']) => ({ k: 'var', id, v: { id, name, resolvedType, variableCollectionId: collection, valuesByMode, scopes, description: '', remote: false } });
const style = (id, name, fontSize, weight, lh, boundVariables = {}) => ({ k: 'text', id, v: { id, name, fontSize, fontName: { family: 'Lumen Sans', style: weight }, lineHeight: { unit: 'PIXELS', value: lh }, letterSpacing: { unit: 'PIXELS', value: 0 }, textCase: 'ORIGINAL', boundVariables, description: '' } });

// A file: Look (Day, Night) holds the colours, the weights and the family; Screen holds the text sizes, in Figma's order
// Compact first, though the code's root is Roomy. Figma last drew the styles in Compact, so their own values are Compact's.
const items = () => [
  coll('c1', 'Look', [['D', 'Day'], ['N', 'Night']]),
  coll('c2', 'Screen', [['C', 'Compact'], ['R', 'Roomy']]),
  variable('ink', 'text/ink', 'COLOR', { D: { r: 0, g: 0, b: 0, a: 1 }, N: { r: 1, g: 1, b: 1, a: 1 } }, 'c1'),
  variable('wr', 'type/weight/regular', 'FLOAT', { D: 400, N: 400 }, 'c1'),
  variable('wb', 'type/weight/bold', 'FLOAT', { D: 700, N: 700 }, 'c1', ['FONT_WEIGHT']),
  variable('dim', 'state/dim/opacity', 'FLOAT', { D: 40, N: 40 }, 'c1', ['OPACITY']),
  variable('fam', 'type/family', 'STRING', { D: 'Lumen Sans', N: 'Lumen Sans' }, 'c1', ['FONT_FAMILY']),
  variable('ls', 'type/l/size', 'FLOAT', { C: 20, R: 28 }, 'c2', ['FONT_SIZE']),
  variable('lh', 'type/l/height', 'FLOAT', { C: 24, R: 34 }, 'c2', ['LINE_HEIGHT']),
  variable('ss', 'type/s/size', 'FLOAT', { C: 12, R: 12 }, 'c2', ['FONT_SIZE']),
  variable('gp', 'gap/page', 'FLOAT', { C: 16, R: 16 }, 'c2', ['GAP']),
  style('t1', 'L/Regular', 20, 'Regular', 24, { fontSize: alias('ls'), lineHeight: alias('lh'), fontWeight: alias('wr'), fontFamily: alias('fam') }),
  style('t2', 'S/Bold', 12, 'Bold', 16, { fontSize: alias('ss'), fontWeight: alias('wb'), fontFamily: alias('fam') }),
  style('t3', 'Caption', 11, 'Regular', 14),
];
const LOOK = [{ name: 'Day', snapshotKey: 'day', cssSelector: 'root' }, { name: 'Night', snapshotKey: 'night', cssSelector: 'data:theme=night' }];
const SCREEN = { name: 'Screen', kind: 'scalar', modes: [{ name: 'Roomy', snapshotKey: 'roomy', cssSelector: 'root' }, { name: 'Compact', snapshotKey: 'compact', cssSelector: 'data:size=compact' }] };
const cfg = (collections = [SCREEN]) => ({ figma: { colorCollection: 'Look', sizingCollection: 'Look', modes: LOOK, collections } });

test('capture: a bound field takes its variable\'s value in the root mode, never the mode Figma last drew; family and variables recorded', async () => {
  const snap = await varsFromItems(items(), cfg());
  const l = snap.typography['l/regular'];
  assert.equal(l.size, '28px', 'Roomy, the root mode ds-config names, not Compact (20px) that the style caches');
  assert.equal(l.lh, '34px');
  assert.equal(l.weight, '400');
  assert.equal(l.family, 'Lumen Sans');
  assert.deepEqual(l.vars, { size: 'type/l/size', lh: 'type/l/height', weight: 'type/weight/regular', family: 'type/family' });
  assert.deepEqual(snap.typography.caption, { size: '11px', weight: '400', lh: '14px', family: 'Lumen Sans' }, 'a style with no binding: its own values, no vars');
  assert.deepEqual(Object.keys(snap.typography), ['l/regular', 's/bold', 'caption'], 'Figma\'s order');
  assert.deepEqual(snap.modeVariants.Screen.vars['type/l/size'].values, { roomy: '28px', compact: '20px' });
});

test('capture: a weight (bound as a text style\'s weight, or scoped to weights only) and an opacity are unitless', async () => {
  const { sizing } = await varsFromItems(items(), cfg());
  assert.equal(sizing['type/weight/regular'], '400', 'all scopes, but a text style binds it as its weight');
  assert.equal(sizing['type/weight/bold'], '700', 'FONT_WEIGHT only');
  assert.equal(sizing['state/dim/opacity'], '40', 'OPACITY only');
  assert.equal(sizing['type/family'], 'Lumen Sans');
});

test('capture: a second collection ds-config names keeps its constants; one it does not name changes nothing', async () => {
  const named = await varsFromItems(items(), cfg());
  assert.equal(named.sizing['gap/page'], '16px', 'the same in every mode: in no modeVariants, kept here');
  assert.equal(named.sizing['type/s/size'], '12px');
  assert.equal(named.sizing['type/l/size'], '28px', 'one that changes: its root mode');
  assert.deepEqual(named._collections.sizing, ['Look'], 'the sizing collection ds-config gets is unchanged');
  const none = await varsFromItems(items(), cfg([]));
  assert.deepEqual(Object.keys(none.sizing), ['text/ink', 'type/weight/regular', 'type/weight/bold', 'state/dim/opacity', 'type/family'], 'only the sizing collection, as before');
});

test('capture: the bindings travel through the checked chunks of the Figma tool\'s capture, a library variable a style binds included', async () => {
  const list = items();
  // A style bound to a library's variable: read by id, in no local collection.
  list.push({ k: 'var', id: 'lib', v: { id: 'lib', name: 'core/size/xs', resolvedType: 'FLOAT', variableCollectionId: 'libc', valuesByMode: { X: 10 }, scopes: ['FONT_SIZE'], description: '', remote: true } });
  list.push(style('t4', 'XS/Regular', 9, 'Regular', 12, { fontSize: alias('lib') }));
  // What Figma holds: the local variables and styles, the library's variable reachable by id only.
  const local = list.filter((i) => i.id !== 'lib');
  const figma = standInFigma(local);
  const lib = list.find((i) => i.id === 'lib').v;
  const getVar = figma.variables.getVariableByIdAsync;
  figma.variables.getVariableByIdAsync = async (id) => (id === 'lib' ? lib : getVar(id));
  const sums = await runRecipe(varsScript('sums'), figma);
  const chunks = [];
  for (let n = 0; n < sums.of; n++) chunks.push(...(await runRecipe(varsScript(n), figma)).items);
  const text = chunks.filter((i) => i.k === 'text');
  assert.deepEqual(text.find((i) => i.v.name === 'L/Regular').v.boundVariables.fontSize, alias('ls'));
  assert.ok(chunks.some((i) => i.k === 'var' && i.id === 'lib'), 'the library variable a style binds is read');
  const snap = await varsFromItems(chunks, cfg());
  assert.equal(snap.typography['xs/regular'].size, '10px');
  assert.deepEqual(snap.typography['xs/regular'].vars, { size: 'core/size/xs' });
  assert.deepEqual(snap.typography['l/regular'], (await varsFromItems(items(), cfg())).typography['l/regular']);
  // Nothing in the script writes to Figma.
  assert.doesNotMatch(varsScript(0), /setCurrentPage|\.set[A-Z]\w*\(|\.remove\(|createVariable|createText/);
});

test('pairing: a bound field is paired by the naming convention, a map entry wins, a scale key or a list feeds several styles', () => {
  const T = {
    's/regular': { size: '12px', weight: '400', family: 'Lumen Sans', vars: { size: 'type/s/size', weight: 'type/weight/regular' } },
    's/bold': { size: '12px', weight: '700', vars: { size: 'type/s/size' } },
    caption: { size: '11px', weight: '400' },
  };
  const conv = (v) => `--${v.replace(/\//g, '-')}`;
  const { pairs, unpaired, unknown } = typographyPairs(T, { '--w-bold': ['s', 'weight'], '--caption-size': [['caption', 'size']], '--gone': ['xl', 'size'] }, conv);
  const at = (s, f) => pairs.find((p) => p.style === s && p.field === f)?.cssVar;
  assert.equal(at('s/regular', 'size'), '--type-s-size');
  assert.equal(at('s/bold', 'size'), '--type-s-size', 'one variable, every style that binds it');
  assert.equal(at('s/regular', 'weight'), '--w-bold', 'a map entry wins over the binding');
  assert.equal(at('s/bold', 'weight'), '--w-bold', 'a scale key feeds each style of the scale');
  assert.equal(at('caption', 'size'), '--caption-size', 'a list of targets');
  assert.deepEqual(unpaired, [{ style: 'caption', field: 'weight' }]);
  assert.deepEqual(unknown, [{ cssVar: '--gone', key: 'xl', field: 'size' }]);
  assert.deepEqual(typoTargets(T, [['s/regular', 'caption'], 'size']), [{ style: 's/regular', field: 'size' }, { style: 'caption', field: 'size' }]);
  assert.deepEqual(familyGroups(T), [{ family: 'Lumen Sans', variable: null, styles: ['s/regular'] }]);
  assert.equal(bodyFontFamily(':root{--f:"Lumen Sans"} @media (x){body{font-family:Other}} body { font: 400 14px/1.5 var(--f), sans-serif }', (n) => (n === '--f' ? '"Lumen Sans"' : null)), '"Lumen Sans"');
});

// A project whose text styles bind variables, one of them per breakpoint.
const project = ({ css, typography, TYPO = {} }) => ({
  'ds-config.json': { paths: { themeCSS: 'theme.css', snapshotVars: 'snap.json' }, figma: { colorCollection: 'Look', modes: LOOK, collections: [SCREEN] } },
  'design-system-engine-map.mjs': `export const TYPO = ${JSON.stringify(TYPO)};`,
  'theme.css': css,
  'snap.json': {
    typography,
    sizing: {},
    modeVariants: { Screen: { modes: SCREEN.modes.map(({ name, snapshotKey }) => ({ name, snapshotKey })), vars: { 'type/l/size': { kind: 'scalar', values: { roomy: '28px', compact: '20px' } } } } },
  },
});
const TYPO_SNAP = {
  'l/regular': { size: '28px', weight: '400', family: 'Lumen Sans', vars: { size: 'type/l/size', weight: 'type/weight/regular', family: 'type/family' } },
  'l/bold': { size: '28px', weight: '700', family: 'Lumen Sans', vars: { size: 'type/l/size', weight: 'type/weight/bold', family: 'type/family' } },
  's/regular': { size: '12px', weight: '400', family: 'Lumen Sans', vars: { size: 'type/s/size', weight: 'type/weight/regular', family: 'type/family' } },
};
const CSS = (phone = '20px', family = '"Lumen Sans", sans-serif') => `:root { --type-l-size: 28px; --type-s-size: 12px; --type-weight-regular: 400; --type-weight-bold: 700; --type-family: ${family}; }\n:root[data-size="compact"] { --type-l-size: ${phone}; }\n`;
const result = (dir) => JSON.parse(readFileSync(join(dir, 'design-system-engine-check-result.json'), 'utf8'));

test('token check: every style that binds a variable is compared with no map entry, a breakpoint field in every breakpoint', () => {
  const { dir } = runGate('parity-check.mjs', project({ css: CSS(), typography: TYPO_SNAP }), ['--json']);
  const r = result(dir);
  const typo = r.passVars.filter((p) => p.dimension === 'typography');
  assert.deepEqual(r.fail.filter((f) => f.dimension === 'typography'), []);
  assert.deepEqual(typo.filter((p) => p.token === 'l/bold/size').map((p) => [p.mode, p.value]), [['roomy', '28px'], ['compact', '20px']], 'in each breakpoint');
  assert.ok(typo.some((p) => p.token === 's/regular/size' && p.cssVar === '--type-s-size' && p.variable === 'type/s/size'));
  assert.ok(typo.some((p) => p.token === 'l/bold/weight' && p.value === '700'));
  const fam = typo.filter((p) => p.family);
  assert.equal(fam.length, 1, 'the family once, for every style');
  assert.deepEqual(fam[0].styles, ['l/regular', 'l/bold', 's/regular']);
});

test('token check: a breakpoint that differs fails in that breakpoint only, each style that binds it; a family that differs is one finding', () => {
  const { dir, out } = runGate('parity-check.mjs', project({ css: CSS('22px', 'Serifa'), typography: TYPO_SNAP }), ['--json']);
  const r = result(dir);
  const fails = r.fail.filter((f) => f.dimension === 'typography');
  assert.deepEqual(fails.filter((f) => !f.family).map((f) => [f.token, f.mode, f.figma, f.css]), [['l/regular/size', 'Compact', '20px', '22px'], ['l/bold/size', 'Compact', '20px', '22px']]);
  const fam = fails.filter((f) => f.family);
  assert.equal(fam.length, 1);
  assert.equal(fam[0].cssVar, '--type-family');
  assert.match(out, /\[typography\/Compact\] l\/regular\/size → --type-l-size/);
});

test('token check: a style that sets its own family is compared with the code\'s page font; a field nothing names is not compared, and said so', () => {
  const typography = { body: { size: '14px', weight: '400', family: 'Lumen Sans' } };
  const { dir } = runGate('parity-check.mjs', project({ css: ':root { --body-size: 14px; }\nbody { font-family: Lumen Sans, sans-serif; }\n', typography, TYPO: { '--body-size': ['body', 'size'] } }), ['--json']);
  const r = result(dir);
  assert.ok(r.passVars.some((p) => p.family && p.cssVar === 'font-family (html, body)'));
  assert.ok(r.skip.some((s) => s.token === 'body/weight' && /^not compared/.test(s.reason)));
});

test('style guide: a style shows only when every field Figma gives it agrees, in every mode; the rest are named and on the Tasks page', () => {
  const pass = (token, cssVar, value, mode) => ({ dimension: 'typography', token, cssVar, value, ...(mode ? { mode } : {}) });
  const figmaVars = { typography: {
    'l/regular': { size: '28px', weight: '400', lh: '34px' },
    's/regular': { size: '12px', weight: '400' },
    's/bold': { size: '12px', weight: '700' },
    caption: { size: '11px', weight: '400' },
  } };
  const check = {
    passVars: [
      pass('l/regular/size', '--l-size', '28px', 'roomy'), pass('l/regular/size', '--l-size', '20px', 'compact'), pass('l/regular/weight', '--w', '400'), pass('l/regular/lh', '--l-lh', '34px'),
      pass('s/regular/size', '--s-size', '12px'), pass('s/regular/weight', '--w', '400'),
      pass('s/bold/weight', '--wb', '700'),   // its size was compared and differs
      pass('caption/size', '--c-size', '11px'),   // its weight was never compared
      { dimension: 'typography', family: true, token: 'type/family', variable: 'type/family', cssVar: '--type-family', value: 'Lumen Sans', styles: ['l/regular'] },
    ],
    fail: [{ dimension: 'typography', token: 's/bold/size', cssVar: '--s-size', mode: 'Compact', figma: '12px', css: '13px' }],
    skip: [{ dimension: 'typography', token: 'caption/weight', mode: '-', reason: 'not compared: Figma binds no variable to it and no TYPO entry in design-system-engine-map.mjs names it' }],
  };
  const t = agreedTokens(check, figmaVars);
  assert.deepEqual(t.typography.map((x) => x.scale), ['l/regular', 's/regular'], 'Figma\'s order, only the styles agreed in full');
  assert.deepEqual(t.typography[0].size.modes, { roomy: '28px', compact: '20px' });
  assert.deepEqual(t.typeFamily, { figma: 'type/family', var: '--type-family', value: 'Lumen Sans', styles: ['l/regular'] });
  assert.deepEqual(t.typeLeftOff, [{ style: 's/bold', fields: ['size'], differs: ['size'] }, { style: 'caption', fields: ['weight'], differs: [] }]);
  const todo = typographyTodos(check, figmaVars);
  assert.equal(todo.length, 2);
  assert.match(todo[0].say, /^Text style s\/bold differs from the code: font size in Compact: Figma 12px, the code 13px \(--s-size\)/);
  assert.match(todo[1].say, /^1 text style is not compared in full.*caption \(font weight\)/);
  // A family that differs is one task, and the styles still show.
  const differs = agreedTokens({ ...check, passVars: check.passVars.filter((p) => !p.family), fail: [{ dimension: 'typography', family: true, token: 'type/family', variable: 'type/family', cssVar: '--type-family', figma: 'Lumen Sans', css: 'Serifa', styles: ['l/regular', 's/regular'] }] }, figmaVars);
  assert.equal(differs.typeFamily.differs, true);
  assert.deepEqual(differs.typography.map((x) => x.scale), ['l/regular', 's/regular'], 'a family difference keeps no style off');
  assert.match(typographyTodos({ fail: [{ dimension: 'typography', family: true, figma: 'Lumen Sans', css: 'Serifa', cssVar: '--type-family', styles: ['a', 'b'] }] }).at(-1).say, /family differs: Figma Lumen Sans, 2 styles; the code's --type-family is Serifa/);
});

test('style guide page: a style lists only its own fields, the family once, the styles left off named', () => {
  const tpl = readFileSync(new URL('../templates/styleguide.template.html', import.meta.url), 'utf8');
  const block = tpl.slice(tpl.indexOf('/* ── Typography ─'), tpl.indexOf('/* ── Spacing, radii, other sizes ─'));
  assert.match(block, /TYPE_PROPS\.filter\(function \(k\) \{ return t\[k\[0\]\]; \}\)/, 'a field the style does not have is not listed');
  assert.doesNotMatch(block, /\['family', val\('family'/, 'no family line per style');
  assert.match(block, /TOKENS\.typeFamily/);
  assert.match(block, /Left off until Figma and the code agree/);
  assert.match(block, /sizeSwitch\(ts, drawType\)/, 'the breakpoint switch draws every mode');
});

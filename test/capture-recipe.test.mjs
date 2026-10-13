// E39 to E43: the Figma capture recipe (cookbook/refresh-figma.md), each script run as use_figma runs it, on a stand-in
// file: a token that aliases a library variable, a colour with its own opacity among the sizes, durations in seconds
// and in ms, two text styles that share their last segment, and one collection that holds colours and sizes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { textStyle, textStyleKey, shortStyleNames, styleNames, namesStyle } from '../text-styles.mjs';
import { compareTokens } from '../capture-compare.mjs';
import { systemScales } from '../prototype-pieces.mjs';
import { buildSheetLines } from '../build-list.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const recipe = readFileSync(join(ENGINE, 'cookbook', 'refresh-figma.md'), 'utf8');
const FENCE = '`'.repeat(3);
const blocks = [...recipe.matchAll(new RegExp(FENCE + 'js\\n([\\s\\S]*?)' + FENCE, 'g'))].map((m) => m[1]);
const after = (heading) => recipe.split(heading)[1].split(FENCE + 'js\n')[1].split(FENCE)[0];
const SCRIPT = {
  probe: after('### Step 1a - Probe'),
  single: after('### Step 1b-single'),
  batched: after('### Step 1b-batched'),
  sizing: blocks.find((b) => b.startsWith('// Sizing + typography')),
  motion: blocks.find((b) => b.includes('MOTION_COLLECTION')),
};
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const run = (name, figma, swap = []) => { let s = SCRIPT[name]; for (const [a, b] of swap) { assert.ok(s.includes(a), `${name} holds ${a}`); s = s.replace(a, b); } return new AsyncFunction('figma', s)(figma); };
const rgb = (r, g, b, a = 1) => ({ r, g, b, a });
const alias = (id) => ({ type: 'VARIABLE_ALIAS', id });

// A file: Theme (Light, Dark) holds the colours; Sizing (Desktop, Phone) the sizes; Motion the durations and curves.
// lib/* are a library's variables: in no local collection, read by id only. lib/gone was deleted from its library.
function stand({ collections, vars, styles = [] }) {
  const asked = [];
  return {
    asked,
    figma: {
      variables: {
        getLocalVariableCollectionsAsync: async () => collections,
        getVariableByIdAsync: async (id) => { asked.push(id); return vars[id] ?? null; },
      },
      getLocalTextStylesAsync: async () => styles,
      getLocalEffectStylesAsync: async () => [],
    },
  };
}
const libraryFile = () => stand({
  collections: [
    { id: 'c1', name: 'Theme', modes: [{ modeId: 'L', name: 'Light' }, { modeId: 'D', name: 'Dark' }], variableIds: ['bg', 'border', 'ghost', 'scrim'] },
    { id: 'c2', name: 'Sizing', modes: [{ modeId: 'S1', name: 'Desktop' }, { modeId: 'S2', name: 'Phone' }], variableIds: ['gap', 'focus', 'radius'] },
  ],
  vars: {
    bg: { id: 'bg', name: 'button/background', resolvedType: 'COLOR', valuesByMode: { L: alias('lib/red'), D: alias('lib/red-dark') } },
    border: { id: 'border', name: 'card/border', resolvedType: 'COLOR', valuesByMode: { L: alias('lib/line'), D: alias('lib/line') } },
    ghost: { id: 'ghost', name: 'ghost/text', resolvedType: 'COLOR', valuesByMode: { L: alias('lib/gone'), D: alias('lib/gone') } },
    scrim: { id: 'scrim', name: 'overlay/scrim', resolvedType: 'COLOR', valuesByMode: { L: { color: alias('lib/black'), opacity: 50 }, D: { color: rgb(1, 1, 1), opacity: 25 } } },
    gap: { id: 'gap', name: 'gap/m', resolvedType: 'FLOAT', valuesByMode: { S1: 12, S2: alias('lib/space-8') } },
    focus: { id: 'focus', name: 'focus/ring', resolvedType: 'COLOR', valuesByMode: { S1: { color: rgb(0, 0, 1), opacity: 50 }, S2: { color: alias('lib/red'), opacity: 50 } } },
    radius: { id: 'radius', name: 'radius/m', resolvedType: 'FLOAT', valuesByMode: { S1: alias('lib/radius'), S2: alias('lib/radius') } },
    // The library's own variables, with the library's own mode ids.
    'lib/red': { id: 'lib/red', name: 'brand/red', resolvedType: 'COLOR', valuesByMode: { X: rgb(1, 0, 0) } },
    'lib/red-dark': { id: 'lib/red-dark', name: 'brand/red-dark', resolvedType: 'COLOR', valuesByMode: { X: rgb(0.5, 0, 0) } },
    'lib/line': { id: 'lib/line', name: 'line/default', resolvedType: 'COLOR', valuesByMode: { X: alias('lib/grey') } },
    'lib/grey': { id: 'lib/grey', name: 'neutral/200', resolvedType: 'COLOR', valuesByMode: { X: rgb(0.8, 0.8, 0.8) } },
    'lib/black': { id: 'lib/black', name: 'neutral/1000', resolvedType: 'COLOR', valuesByMode: { X: rgb(0, 0, 0) } },
    'lib/space-8': { id: 'lib/space-8', name: 'space/8', resolvedType: 'FLOAT', valuesByMode: { X: 8 } },
    'lib/radius': { id: 'lib/radius', name: 'radius/base', resolvedType: 'FLOAT', valuesByMode: { X: 6 } },
  },
});

test('E39: a token that aliases a library variable resolves, through a chain too; one whose target is gone stays a broken alias', async () => {
  const { figma } = libraryFile();
  const out = await run('single', figma);
  assert.equal(out.color.light['button/background'], '#ff0000');
  assert.equal(out.color.dark['button/background'], '#800000');
  assert.equal(out.color.light['card/border'], '#cccccc', 'a library alias of a library alias');
  assert.equal(out.color.light['ghost/text'], null, 'a deleted target: nothing to resolve');
  assert.deepEqual(out.aliases.light['button/background'], ['brand/red']);
  assert.deepEqual(out.aliases.light['card/border'], ['line/default', 'neutral/200']);
  assert.equal(out.aliases.light['ghost/text'], undefined);
  assert.equal(out.sizing['radius/m'], '6px', 'a size from a library');
  assert.deepEqual(out.modeVariants.Sizing.vars['gap/m'].values, { desktop: '12px', phone: '8px' });
  // The batched path and the separate sizing call read the library the same way.
  const batched = await run('batched', libraryFile().figma);
  assert.deepEqual(batched['button/background'], ['#ff0000', '#800000']);
  assert.deepEqual(batched['ghost/text'], [null, null]);
  const sizing = await run('sizing', libraryFile().figma);
  assert.equal(sizing.sizing['radius/m'], '6px');
  // The probe lists only the alias whose target cannot be read.
  const probe = await run('probe', libraryFile().figma);
  assert.deepEqual(probe.brokenAliases, [{ name: 'ghost/text', mode: 'Light', target: 'lib/gone' }, { name: 'ghost/text', mode: 'Dark', target: 'lib/gone' }]);
});

test('E40: a colour with its own opacity among the sizes is a hex with its alpha, never [object Object]', async () => {
  for (const name of ['single', 'sizing']) {
    const out = await run(name, libraryFile().figma);
    assert.equal(out.sizing['focus/ring'], '#0000ff80', `${name}: its base colour, alpha times opacity`);
    assert.deepEqual(out.modeVariants.Sizing.vars['focus/ring'], { kind: 'color', values: { desktop: '#0000ff80', phone: '#ff000080' } });
    assert.ok(!JSON.stringify(out).includes('[object Object]'));
  }
  const out = await run('single', libraryFile().figma);
  assert.equal(out.color.light['overlay/scrim'], '#00000080', 'a library colour with an opacity');
  assert.equal(out.color.dark['overlay/scrim'], '#ffffff40');
});

const motionFile = () => stand({
  collections: [{ id: 'm', name: 'Motion', modes: [{ modeId: 'M', name: 'Value' }], variableIds: ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 's1', 's2', 'e1', 'e2'] }],
  vars: {
    d1: { id: 'd1', name: 'duration/fast', resolvedType: 'FLOAT', valuesByMode: { M: 0.3 } },
    d2: { id: 'd2', name: 'duration/slow', resolvedType: 'FLOAT', valuesByMode: { M: 200 } },
    d3: { id: 'd3', name: 'duration/base', resolvedType: 'TIMING', valuesByMode: { M: 0.25 } },
    d4: { id: 'd4', name: 'duration/long', resolvedType: 'TIMING', valuesByMode: { M: 12 } },
    d5: { id: 'd5', name: 'duration/typed', resolvedType: 'TIMING', valuesByMode: { M: { value: 250, unit: 'MILLISECONDS' } } },
    d6: { id: 'd6', name: 'duration/library', resolvedType: 'FLOAT', valuesByMode: { M: alias('lib/d') } },
    s1: { id: 's1', name: 'press/scale', resolvedType: 'FLOAT', valuesByMode: { M: 0.95 } },
    s2: { id: 's2', name: 'springStiffness', resolvedType: 'FLOAT', valuesByMode: { M: 300 } },
    e1: { id: 'e1', name: 'easing/standard', resolvedType: 'STRING', valuesByMode: { M: ' cubic-bezier(0.4, 0, 0.2, 1) ' } },
    e2: { id: 'e2', name: 'easing/out', resolvedType: 'EASING', valuesByMode: { M: { type: 'CUSTOM_CUBIC_BEZIER', easingFunctionCubicBezier: { x1: 0, y1: 0, x2: 0.2, y2: 1 } } } },
    'lib/d': { id: 'lib/d', name: 'core/duration/m', resolvedType: 'FLOAT', valuesByMode: { X: 0.2 } },
  },
});

test('E41: durations in ms whatever unit Figma holds them in (TIMING in seconds, a FLOAT in seconds or ms)', async () => {
  const { motion } = await run('motion', motionFile().figma);
  assert.deepEqual(motion, {
    'duration/fast': '300ms', // a FLOAT below 10: seconds
    'duration/slow': '200ms', // a FLOAT from 10 up: ms
    'duration/base': '250ms', // TIMING: seconds
    'duration/long': '12000ms', // TIMING is seconds at any size
    'duration/typed': '250ms', // a value that says its unit
    'duration/library': '200ms', // a library's duration
    'press/scale': '0.95', // a FLOAT that is no duration stays a number
    springStiffness: '300',
    'easing/standard': 'cubic-bezier(0.4, 0, 0.2, 1)',
    'easing/out': 'cubic-bezier(0, 0, 0.2, 1)',
  });
});

test('E42: every text style is kept under its full name, so two that share their last segment stay two', async () => {
  const style = (name, size, weight = 'Regular') => ({ name, fontSize: size, fontName: { family: 'Inter', style: weight }, lineHeight: { unit: 'PIXELS', value: size * 1.5 }, letterSpacing: { value: 0 }, textCase: 'ORIGINAL' });
  const styles = [style('XL/Regular', 24), style('M/Regular', 14), style('M/Bold', 14, 'Bold'), style('Caption', 11)];
  for (const name of ['single', 'sizing']) {
    const out = await run(name, stand({ collections: [{ id: 'c1', name: 'Theme', modes: [{ modeId: 'L', name: 'Light' }], variableIds: [] }], vars: {}, styles }).figma);
    assert.deepEqual(Object.keys(out.typography), ['xl/regular', 'm/regular', 'm/bold', 'caption'], name);
    assert.equal(out.typography['xl/regular'].size, '24px');
    assert.equal(out.typography['m/regular'].size, '14px');
    assert.equal(out.typography['m/bold'].weight, '700');
  }
});

test('E43: one collection with colours and sizes keeps the colour modes\' keys for its sizes, never desktop', async () => {
  const file = () => stand({
    collections: [{ id: 'c1', name: 'Theme', modes: [{ modeId: 'L', name: 'Light' }, { modeId: 'D', name: 'Dark' }], variableIds: ['fg', 'border-w', 'shadow-on'] }],
    vars: {
      fg: { id: 'fg', name: 'text/primary', resolvedType: 'COLOR', valuesByMode: { L: rgb(0, 0, 0), D: rgb(1, 1, 1) } },
      'border-w': { id: 'border-w', name: 'border/width', resolvedType: 'FLOAT', valuesByMode: { L: 1, D: 2 } },
      'shadow-on': { id: 'shadow-on', name: 'shadow/on', resolvedType: 'BOOLEAN', valuesByMode: { L: true, D: false } },
    },
  });
  // ds-config names the same collection for colours and sizes; its colour modes have keys of their own.
  const swap = [["SIZING_COLLECTION='Sizing'", "SIZING_COLLECTION='Theme'"], ["snapshotKey:'light'}", "snapshotKey:'day'}"]];
  for (const name of ['single', 'sizing']) {
    const out = await run(name, file().figma, swap);
    const theme = out.modeVariants.Theme;
    assert.deepEqual(theme.modes.map((m) => m.snapshotKey), ['day', 'dark'], `${name}: the colour modes' keys`);
    assert.deepEqual(theme.vars['border/width'].values, { day: '1px', dark: '2px' });
    assert.deepEqual(theme.vars['shadow/on'], { kind: 'boolean', values: { day: 'true', dark: 'false' } });
    assert.equal(theme.vars['text/primary'], undefined, 'its colours are in color already');
    assert.deepEqual(out._modeOrder.color, ['day', 'dark']);
    assert.ok(!JSON.stringify(out).includes('desktop'));
  }
  // Modes ds-config does not know: each mode's own name.
  const out = await run('single', stand({
    collections: [{ id: 'c1', name: 'Look', modes: [{ modeId: 'A', name: 'Day Mode' }, { modeId: 'B', name: 'Night' }], variableIds: ['w'] }, { id: 'c0', name: 'Colours', modes: [{ modeId: 'Z', name: 'Light' }, { modeId: 'Y', name: 'Dark' }], variableIds: ['c'] }],
    vars: { w: { id: 'w', name: 'border/width', resolvedType: 'FLOAT', valuesByMode: { A: 1, B: 2 } }, c: { id: 'c', name: 'text/primary', resolvedType: 'COLOR', valuesByMode: { Z: rgb(0, 0, 0), Y: rgb(1, 1, 1) } } },
  }).figma, [["SIZING_COLLECTION='Sizing'", "SIZING_COLLECTION='Look'"], ["COLOR_COLLECTION='Theme'", "COLOR_COLLECTION='Colours'"]]);
  assert.deepEqual(out.modeVariants.Look.vars['border/width'].values, { 'day-mode': '1px', night: '2px' });
});

// E42 for the readers: a snapshot keyed by full names and one captured before (by last segment) read the same.
const NEW = { 'xl/regular': { size: '24px', weight: '400', lh: '36px' }, 'm/regular': { size: '14px', weight: '400', lh: '20px' }, 'm/bold': { size: '14px', weight: '700', lh: '20px' }, caption: { size: '11px', weight: '400', lh: '16px' } };
const OLD = { regular: { size: '14px', weight: '400', lh: '20px' }, bold: { size: '14px', weight: '700', lh: '20px' }, caption: { size: '11px', weight: '400', lh: '16px' } };

test('E42: a text style is found by its full name, its old key, or its last segment when only one style has it', () => {
  assert.equal(textStyle(NEW, 'xl/regular').size, '24px');
  assert.equal(textStyle(NEW, 'XL/Regular').size, '24px', 'as Figma writes it');
  assert.equal(textStyle(NEW, 'bold').weight, '700', 'one style ends in bold');
  assert.equal(textStyle(NEW, 'regular'), null, 'two do: neither is guessed');
  assert.equal(textStyle(NEW, 'caption').size, '11px');
  assert.equal(textStyle(OLD, 'bold').weight, '700', 'a snapshot captured before');
  assert.equal(textStyle(OLD, 'm/bold').weight, '700', 'a full name read from an old snapshot');
  assert.equal(textStyle(NEW, 'missing'), null);
  assert.equal(textStyleKey(NEW, 'bold'), 'm/bold');
  assert.deepEqual(shortStyleNames(NEW), [['xl/regular', 'xl/regular'], ['m/regular', 'm/regular'], ['m/bold', 'bold'], ['caption', 'caption']]);
  assert.deepEqual([...styleNames(NEW)].sort(), ['bold', 'caption', 'm/bold', 'm/regular', 'xl/regular']);
  assert.ok(namesStyle(NEW, 'bold', 'm/bold'));
  assert.ok(!namesStyle(NEW, 'regular', 'm/regular'));
});

test('E42: the readers read a full-name snapshot as they read an old one (token check, prototype scales, build sheet)', () => {
  const cfg = { figma: { modes: [{ name: 'Light', snapshotKey: 'light' }] } };
  const at = (value) => ({ modes: { light: { value } } });
  const code = { tokens: { '--caption-size': at('11px'), '--bold-weight': at('700'), '--xl-size': at('24px') } };
  const maps = (TYPO) => ({ EXPLICIT: {}, EXPLICIT_SIZING: {}, SKIP_TOKENS: new Set(), NULL_TOKENS: new Set(), KNOWN_NULL: new Set(), SIZING_SKIP: new Map(), TYPO });
  const short = { '--caption-size': ['caption', 'size'], '--bold-weight': ['bold', 'weight'] };
  for (const typography of [NEW, OLD]) {
    const r = compareTokens(code, { color: {}, sizing: {}, typography }, cfg, maps(short));
    assert.equal(r.match, 2, JSON.stringify(r));
    assert.equal(r.skipped, 0);
  }
  const full = compareTokens(code, { color: {}, sizing: {}, typography: NEW }, cfg, maps({ ...short, '--xl-size': ['xl/regular', 'size'] }));
  assert.equal(full.match, 3, 'a map that names the full style');
  assert.deepEqual(systemScales({}, { typography: NEW }).text.map((t) => t.name), ['xl/regular', 'm/regular', 'bold', 'caption']);
  const d = { COMPONENT_CSS_SELECTORS: { chip: { main: '.chip' } }, CONTRACT: { chip: { fontSizeVar: 'caption', fontWeightVar: 'bold' } }, FIGMA_LAYOUT_TO_CSS: {}, CSS_BASE_RULE_VARS: [] };
  for (const typography of [NEW, OLD]) {
    const lines = buildSheetLines('chip', d, { typography });
    assert.ok(lines.some((l) => l.includes('font-size 11px, font-weight 700')), lines.join('\n'));
  }
});

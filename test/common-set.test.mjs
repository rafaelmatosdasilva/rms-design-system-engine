// The common set nearly every product builds with, listed against the system in Figma, in the code and in the intent layer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMMON_SET, commonOf, leftOut, commonSet, tokenCategories, commonSetLines } from '../lib/common-set.mjs';

test('a component is matched to the set by meaning, on its head noun, the longest alias first', () => {
  const said = Object.fromEntries(['Button', 'IconButton', 'acmeBtn', 'TextField', 'text-input', 'FormField', 'Modal', 'Snackbar', 'DropdownMenu', 'Dropdown',
    'ProgressBar', 'Spinner', 'SkeletonLoader', 'EmptyState', 'BlankSlate', 'Tabs', 'RadioButton', 'Toggle', 'DataTable', 'Tag', 'Button/Primary', 'icon/arrow-left',
    'CardHeader', 'ButtonGroup', 'cardTile', 'Notification'].map((n) => [n, commonOf(n)]));
  assert.deepEqual(said, {
    Button: 'button', IconButton: 'button', acmeBtn: 'button', TextField: 'text input', 'text-input': 'text input', FormField: 'form field', Modal: 'dialog',
    Snackbar: 'toast', DropdownMenu: 'menu', Dropdown: 'select', ProgressBar: 'progress', Spinner: 'progress', SkeletonLoader: 'skeleton', EmptyState: 'empty state',
    BlankSlate: 'empty state', Tabs: 'tabs', RadioButton: 'radio', Toggle: 'switch', DataTable: 'table', Tag: 'badge', 'Button/Primary': 'button', 'icon/arrow-left': 'icon',
    CardHeader: null, ButtonGroup: null, cardTile: 'card', Notification: 'toast',
  });
  assert.equal(COMMON_SET.length, 23);
});

test('three columns: each one missing everywhere, each on some sides only, a side not read never lacking anything', () => {
  const set = commonSet({ figma: ['Button', 'Card', 'Modal'], code: ['Button', 'Modal', 'Toast'], documented: ['Button'] });
  const row = (id) => set.rows.find((r) => r.id === id);
  assert.deepEqual(set.sides, ['figma', 'code', 'documented']);
  assert.deepEqual(row('card'), { id: 'card', kept: undefined, figma: ['Card'], code: [], documented: [] });
  const lines = commonSetLines(set);
  assert.match(lines[0], /^The system has 4 of the 23 components nearly every product builds with \(Figma 3, the code 3, the intent layer 1\)\. Missing on every side, so each product builds its own: link, text input, select, /);
  assert.match(lines[0], /Add each, or say why it stays out in ds-config\.json → commonSet\.leaveOut:$/);
  assert.deepEqual(lines.slice(1), [
    '   · dialog (Modal) is in Figma and the code but not in the intent layer',
    '   · card is in Figma but not in the code or the intent layer',
    '   · toast is in the code but not in Figma or the intent layer',
  ]);
  // No intent layer read and no Figma capture: only the code is a column, so nothing is said to be undocumented.
  const codeOnly = commonSetLines(commonSet({ code: ['Button'] }));
  assert.match(codeOnly[0], /\(the code 1\)\..*leaveOut\.$/);   // nothing follows it, so it ends, with no colon
  assert.equal(codeOnly.length, 1);
  assert.deepEqual(commonSetLines(commonSet({})), []);
  for (const l of [...lines, ...codeOnly]) assert.doesNotMatch(l, /;/);
});

test('a gap left on purpose is said as kept with its reason, never as missing', () => {
  const leaveOut = leftOut({ commonSet: { leaveOut: { Toast: 'Products report with an alert in the page.', elevation: 'A flat system draws no shadows.' } } });
  const names = COMMON_SET.map((c) => c.id).filter((id) => id !== 'toast');
  const lines = commonSetLines(commonSet({ figma: names, code: names }, { leaveOut }));
  assert.deepEqual(lines, [
    'The system has 22 of the 23 components nearly every product builds with (Figma 22, the code 22):',
    '   · toast is left out on purpose: Products report with an alert in the page.',
  ]);
  const all = commonSetLines(commonSet({ figma: COMMON_SET.map((c) => c.id), code: COMMON_SET.map((c) => c.id) }));
  assert.deepEqual(all, []);
});

test('token categories: tokenised in one of five, the raw values the census counted, a side with none, a category kept out', () => {
  const themeCss = ':root { --surface-page: #fff; --text-primary: #111; --brand: var(--blue); --stroke-default: 1px; }';
  const cats = tokenCategories({ themeCss, raw: { colour: 2, spacing: 0, radius: 5, 'font size': 3, shadow: 1 } });
  assert.deepEqual(cats.map((c) => [c.id, c.code, c.raw]), [['colour', 2, 2], ['spacing', 0, 0], ['radius', 0, 5], ['elevation', 0, 1], ['typography', 0, 3]]);
  assert.deepEqual(commonSetLines(null, cats), [
    'The system is tokenised in 1 of the 5 token categories (colour). No tokens for spacing, radius (5 values written by hand in the styles), elevation (1 value written by hand in the styles) and typography (3 values written by hand in the styles). Add tokens for them, or say why they stay out in ds-config.json → commonSet.leaveOut.',
  ]);
  const figmaVars = { color: { light: { 'text/primary': '#111' } }, sizing: { 'gap/s': '4px', 'radii/button': '8px' }, typography: { m: { size: '14px' } }, effects: { 'shadow/raised': {} } };
  const both = tokenCategories({ figmaVars, themeCss: ':root { --text: #111; --gap-s: 4px; --radius-m: 8px; --shadow-1: 0 1px 2px #0003; --font-size-m: 14px; }' });
  assert.deepEqual(commonSetLines(null, both), []);
  const sided = tokenCategories({ figmaVars, themeCss: ':root { --text: #111; --gap-s: 4px; --radius-m: 8px; }', raw: { 'font size': 6 } }, { leaveOut: new Map([['elevation', 'ignored, it has tokens']]) });
  assert.deepEqual(commonSetLines(null, sided), [
    'The system is tokenised in 5 of the 5 token categories (colour, spacing, radius, elevation, typography):',
    '   · typography has tokens in Figma but none in the code, which writes 6 values of it by hand',
  ]);   // elevation, kept out though it has tokens in Figma, is not said to lack them in the code
  const kept = tokenCategories({ themeCss: ':root { --text: #111; --gap-s: 4px; --radius-m: 8px; --font-size-m: 14px; }' }, { leaveOut: leftOut({ commonSet: { leaveOut: { elevation: 'A flat system draws no shadows.' } } }) });
  assert.deepEqual(commonSetLines(null, kept), [
    'The system is tokenised in 4 of the 5 token categories (colour, spacing, radius, typography):',
    '   · elevation is left out on purpose: A flat system draws no shadows.',
  ]);
});

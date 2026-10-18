// every combination of modes. A value right with each switch alone and wrong only together is found, and a text
// and background pair that passes alone and fails together.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { switchFor, collectionSwitches, comboAxes, combinations, mergeSwitches, comboFindings, comboContrast, modeCombinations } from '../mode-combos.mjs';

// Dark sets the text colour; the phone block sets it too, later, so Dark on a phone gets the light one.
const THEME = `:root { --text-body: #111111; --surface-base: #ffffff; --space-m: 12px; }
@media (prefers-color-scheme: dark) { :root { --text-body: #eeeeee; --surface-base: #222222; } }
@media (max-width: 480px), (hover: none) and (pointer: coarse) { :root { --space-m: 14px; --text-body: #111111; } }
`;
const VARS = {
  color: { light: { 'text/body': '#111111', 'surface/base': '#ffffff' }, dark: { 'text/body': '#eeeeee', 'surface/base': '#222222' } },
  modeVariants: { Sizing: { modes: [{ name: 'Desktop', snapshotKey: 'desktop' }, { name: 'Phone', snapshotKey: 'phone' }], vars: { 'space/m': { kind: 'scalar', values: { desktop: '12px', phone: '14px' } } } } },
};
const CFG = { figma: { modes: [{ name: 'Light', snapshotKey: 'light', cssSelector: 'root' }, { name: 'Dark', snapshotKey: 'dark', cssSelector: 'dark-media' }] } };
const toVar = (n) => `--${n.replace(/\//g, '-')}`;

test('the switches: colour modes, then a collection found where the theme sets its variables; a media list takes the alternative the browser can be put in', () => {
  assert.deepEqual(switchFor('media:(max-width: 480px), (hover: none) and (pointer: coarse)').viewport, 480);
  assert.deepEqual(collectionSwitches(VARS.modeVariants.Sizing, THEME, ['--space-m']).map((m) => m.cssSelector), ['root', 'media:(max-width: 480px), (hover: none) and (pointer: coarse)']);
  const axes = comboAxes(CFG, VARS, THEME, { colourVar: toVar, scalarVar: toVar });
  assert.deepEqual(axes.map((a) => [a.name, a.modes.map((m) => m.name), Object.keys(a.tokens)]), [['Colour', ['Light', 'Dark'], ['text/body', 'surface/base']], ['Sizing', ['Desktop', 'Phone'], ['space/m']]]);
  assert.deepEqual(combinations(axes), [[0, 0], [0, 1], [1, 0], [1, 1]]);
  const sw = mergeSwitches(axes.map((a) => a.modes[1].sw));
  assert.deepEqual([sw.media.find((f) => f.name === 'prefers-color-scheme').value, sw.viewport], ['dark', 480]);
});

test('only what goes wrong together is listed: the token and the pair, with the switches alone that pass', () => {
  const axes = comboAxes(CFG, VARS, THEME, { colourVar: toVar, scalarVar: toVar });
  const v = (text, surface, space) => ({ '--text-body': text, '--surface-base': surface, '--space-m': space });
  const readings = [
    { combo: [0, 0], vars: v('#111111', '#ffffff', '12px') },
    { combo: [0, 1], vars: v('#111111', '#ffffff', '14px') },
    { combo: [1, 0], vars: v('#eeeeee', '#222222', '12px') },
    { combo: [1, 1], vars: v('#111111', '#222222', '14px') },
  ];
  assert.deepEqual(comboFindings(axes, readings), [{ token: 'text/body', cssVar: '--text-body', combo: 'Dark with Phone', got: '#111111', want: '#eeeeee', alone: 'Dark with Desktop' }]);
  assert.deepEqual(comboContrast(axes, readings, [{ text: '--text-body', bg: '--surface-base' }]), [{ name: '--text-body on --surface-base', combo: 'Dark with Phone', ratio: 1.19, need: 4.5 }]);
  // A value already wrong with its own switch alone is the other gates' to say.
  const wrongAlone = readings.map((r) => (r.combo.join() === '1,0' ? { ...r, vars: { ...r.vars, '--text-body': '#000000' } } : r));
  assert.deepEqual(comboFindings(axes, wrongAlone), []);
});

test('in the browser: the theme with every combination on, read as the browser resolves it', { timeout: 120000 }, async (t) => {
  const { findChrome } = await import('../cdp.mjs');
  if (!findChrome({ playwright: true }) || typeof WebSocket === 'undefined') { t.skip('no Chrome'); return; }
  const dir = mkdtempSync(join(tmpdir(), 'dse-combos-'));
  try {
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src/theme.css'), THEME);
    writeFileSync(join(dir, 'src/vars.json'), JSON.stringify(VARS));
    const cfg = { ...CFG, paths: { themeCSS: 'src/theme.css', snapshotVars: 'src/vars.json' } };
    const r = await modeCombinations(dir, cfg, { chromePath: findChrome({ playwright: true }), pairs: [{ text: '--text-body', bg: '--surface-base' }] });
    assert.equal(r.combos, 4);
    assert.deepEqual(r.findings.map((f) => `${f.token} ${f.combo} ${f.got}`), ['text/body Dark with Phone #111111']);
    assert.deepEqual(r.contrast.map((f) => `${f.name} ${f.combo}`), ['--text-body on --surface-base Dark with Phone']);
    // Fixed: the phone block sets only sizes. Nothing left.
    writeFileSync(join(dir, 'src/theme.css'), THEME.replace(' --text-body: #111111; } }', ' } }'));
    const ok = await modeCombinations(dir, cfg, { chromePath: findChrome({ playwright: true }), pairs: [{ text: '--text-body', bg: '--surface-base' }] });
    assert.deepEqual([ok.findings, ok.contrast], [[], []]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the style guide\'s To do: one row for the values, one for the pairs, both Claude\'s in the code', async () => {
  const { comboTodos } = await import('../mode-combos.mjs');
  const rows = comboTodos({ findings: [{ token: 'text/body', cssVar: '--text-body', combo: 'Dark with Phone', got: '#111111', want: '#eeeeee' }], contrast: [{ name: '--text-body on --surface-base', combo: 'Dark with Phone', ratio: 1.19, need: 4.5 }] });
  assert.deepEqual(rows.map((r) => [r.kind, r.who]), [['Modes together', 'code'], ['Modes together', 'code']]);
  assert.match(rows[0].say, /^1 token takes a value Figma does not have only when two modes are on together, each mode alone being right \(--text-body in Dark with Phone is #111111, Figma #eeeeee\)\.$/);
  assert.match(rows[1].say, /--text-body on --surface-base in Dark with Phone, 1\.19:1 for 4\.5:1/);
  assert.deepEqual(comboTodos(null), []);
});

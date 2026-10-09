// Gate [24] (E4): a rendered assertion's expected colour taken from its Figma variable, never typed and left to go stale.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandFigmaVars, renderedMatches } from '../rendered-expect.mjs';

const modes = [{ name: 'Light', snapshotKey: 'light' }, { name: 'Dark', snapshotKey: 'dark' }];
const color = { light: { 'input/border/default/color': '#adadad', 'scrim/color': '#00000080' }, dark: { 'input/border/default/color': '#5e5e5e' } };

test('figmaVar: the expected colour is the variable\'s value in the assertion\'s mode, as the browser writes it', () => {
  const { assertions, skipped } = expandFigmaVars([
    { plugin: 'lab', selector: '#scale-input', prop: 'borderTopColor', figmaVar: 'input/border/default', colorScheme: 'Dark' },
    { plugin: 'lab', selector: '#scale-input', prop: 'borderTopColor', figmaVar: 'input/border/default/color' },
    { plugin: 'lab', selector: '.scrim', prop: 'backgroundColor', figmaVar: 'scrim' },
    { plugin: 'lab', selector: '.bar', prop: 'height', expected: '40px' },
  ], color, modes, 'light');
  assert.deepEqual(assertions.map((a) => a.expected), ['rgb(94, 94, 94)', 'rgb(173, 173, 173)', 'rgba(0, 0, 0, 0.502)', '40px']);
  assert.equal(assertions[0].note, 'Figma input/border/default (Dark)');
  assert.deepEqual(skipped, []);
});

test('figmaVar: a variable or a mode the snapshot does not hold is skipped with the reason, never guessed', () => {
  const { assertions, skipped } = expandFigmaVars([
    { plugin: 'lab', selector: '.a', prop: 'color', figmaVar: 'gone/color' },
    { plugin: 'lab', selector: '.b', prop: 'color', figmaVar: 'input/border/default', colorScheme: 'High contrast' },
  ], color, modes);
  assert.deepEqual(assertions, []);
  assert.match(skipped[0], /'gone\/color' is not in the snapshot's 'light' mode/);
  assert.match(skipped[1], /no 'High contrast' mode/);
});

test('rendered values: the same text, or the same colour written another way', () => {
  assert.equal(renderedMatches('rgb(173, 173, 173)', '#adadad'), true);
  assert.equal(renderedMatches('rgba(0, 0, 0, 0.5)', 'rgba(0, 0, 0, 0.502)'), true);
  assert.equal(renderedMatches('rgb(94, 94, 94)', 'rgb(173, 173, 173)'), false);
  assert.equal(renderedMatches('56px', '56px'), true);
  assert.equal(renderedMatches('56px', '40px'), false);
});

// The gate itself: the colour follows the Figma snapshot, so a variable that moved fails on the new value.
import { runGate } from './helpers.mjs';
import { findChrome } from '../cdp.mjs';
const CHROME = findChrome({ playwright: true });
test('[rendered-check] a figmaVar assertion passes on the variable\'s value and fails when Figma moves it', { skip: CHROME && typeof WebSocket !== 'undefined' ? false : 'no Chrome available' }, () => {
  const files = (hex) => ({
    'ds-config.json': { paths: { plugins: ['app'], pluginCSS: ['app/ui.src.html'], snapshotVars: 'figma-vars.snapshot.json' } },
    'app/ui.html': '<!doctype html><style>#i { border: 1px solid #adadad; }</style><input id="i">',
    'structure-contract.mjs': "export const RENDERED_ASSERTIONS = [{ plugin: 'app', selector: '#i', prop: 'borderTopColor', figmaVar: 'input/border/default' }];",
    'figma-vars.snapshot.json': { color: { light: { 'input/border/default/color': hex }, dark: { 'input/border/default/color': '#5e5e5e' } } },
  });
  const ok = runGate('rendered-check.mjs', files('#adadad'));
  assert.match(ok.out, /PASS {2}1\/1 rendered assertions/, ok.out);
  const moved = runGate('rendered-check.mjs', files('#828282'));
  assert.match(moved.out, /rendered "rgb\(173, 173, 173\)" ≠ expected "rgb\(130, 130, 130\)"/, moved.out);
});

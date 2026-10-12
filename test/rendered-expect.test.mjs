// Gate [24] (E4): a rendered assertion's expected colour taken from its Figma variable, never typed and left to go stale.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandFigmaVars, renderedMatches, textStyleExpectations, schemeSwitch } from '../rendered-expect.mjs';

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

test('a text style in full: size, weight, line height, letter spacing (px or em of its size) and text case', () => {
  assert.deepEqual(textStyleExpectations({ size: '12px', weight: '600', lh: '16px', ls: '0.05em', textTransform: 'uppercase' }),
    { fontSize: '12px', fontWeight: '600', lineHeight: '16px', letterSpacing: '0.6px', textTransform: 'uppercase' });
  // No letter spacing and the original case: normal and none, as the browser gives them. No line height: left out.
  assert.deepEqual(textStyleExpectations({ size: '14px', weight: '400' }), { fontSize: '14px', fontWeight: '400', letterSpacing: 'normal', textTransform: 'none' });
  assert.equal(textStyleExpectations({ size: '14px', ls: '-0.2px' }).letterSpacing, '-0.2px');
  assert.equal(renderedMatches('0px', 'normal'), true);
  assert.equal(renderedMatches('0.6px', '0.6000001px'), true);
  assert.equal(renderedMatches('1px', 'normal'), false);
});

test('a mode is put on as the project puts it on: its class, its data attribute, its media query', () => {
  const modes = [{ name: 'Light', snapshotKey: 'light', cssSelector: 'root' }, { name: 'Dark', snapshotKey: 'dark', cssSelector: 'class:theme-dark' }, { name: 'Dim', snapshotKey: 'dim', cssSelector: 'data:theme=dim' }];
  assert.equal(schemeSwitch('Dark', modes).apply, 'document.documentElement.classList.add("theme-dark")');
  assert.deepEqual(schemeSwitch('dark', modes).media.find((f) => f.name === 'prefers-color-scheme'), { name: 'prefers-color-scheme', value: 'light' });
  assert.equal(schemeSwitch('dim', modes).apply, 'document.documentElement.setAttribute("data-theme", "dim")');
  // No mode by that name: the colour scheme, as before.
  assert.deepEqual(schemeSwitch('dark', []).media, [{ name: 'prefers-color-scheme', value: 'dark' }]);
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

// B7: an automatic height is asserted only where Figma fixes one: a component that hugs its content would be measured
// on an empty probe, which has no content, and fail for a reason that is not a difference.
test('[rendered-check] rendered.auto asserts a fixed height and leaves a hugging one alone', { skip: CHROME && typeof WebSocket !== 'undefined' ? false : 'no Chrome available' }, () => {
  const r = runGate('rendered-check.mjs', {
    'ds-config.json': { rendered: { auto: true }, paths: { plugins: ['app'], pluginCSS: ['app/ui.src.html'], snapshotStructure: 'figma-structure.snapshot.json' } },
    'app/ui.html': '<!doctype html><style>.bar { height: 40px; } .tag { padding: 4px; }</style><div class="bar"></div><span class="tag">New</span>',
    'figma-structure.snapshot.json': { components: { bar: { h: 40, sizingV: 'FIXED' }, tag: { h: 24, sizingV: 'HUG' } } },
  });
  assert.match(r.out, /generated 1 height assertion/, r.out);
  assert.match(r.out, /PASS {2}1\/1 rendered assertions/, r.out);
});

// A13: a text style is checked in full, letter spacing and text case too, and a dark mode the project puts on with a
// class is put on with that class.
test('[rendered-check] a text style in full, and a mode put on with its own class', { skip: CHROME && typeof WebSocket !== 'undefined' ? false : 'no Chrome available' }, () => {
  const files = (css) => ({
    'ds-config.json': { figma: { modes: [{ name: 'Light', snapshotKey: 'light', cssSelector: 'root' }, { name: 'Dark', snapshotKey: 'dark', cssSelector: 'class:theme-dark' }] }, paths: { plugins: ['app'], pluginCSS: ['app/ui.src.html'], snapshotVars: 'figma-vars.snapshot.json' } },
    'app/ui.html': `<!doctype html><style>${css}</style><span class="eyebrow">New</span>`,
    'structure-contract.mjs': "export const RENDERED_ASSERTIONS = [{ plugin: 'app', selector: '.eyebrow', textStyle: 'caps' }, { plugin: 'app', selector: '.eyebrow', prop: 'color', expected: 'rgb(255, 255, 255)', colorScheme: 'Dark' }];",
    'figma-vars.snapshot.json': { typography: { caps: { size: '12px', weight: '600', lh: '16px', ls: '0.05em', textTransform: 'uppercase' } } },
  });
  const base = '.eyebrow { font-size: 12px; font-weight: 600; line-height: 16px; color: rgb(0, 0, 0); } :root.theme-dark .eyebrow { color: rgb(255, 255, 255); }';
  const ok = runGate('rendered-check.mjs', files(`${base} .eyebrow { letter-spacing: 0.05em; text-transform: uppercase; }`));
  assert.match(ok.out, /PASS {2}6\/6 rendered assertions/, ok.out);
  const off = runGate('rendered-check.mjs', files(base));
  assert.match(off.out, /\.eyebrow → letterSpacing: rendered "normal" ≠ expected "0\.6px"/, off.out);
  assert.match(off.out, /\.eyebrow → textTransform: rendered "none" ≠ expected "uppercase"/, off.out);
  assert.doesNotMatch(off.out, /→ color: rendered/, off.out);
});

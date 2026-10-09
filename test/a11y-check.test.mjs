// I18 accessibility gate — pure-core unit tests. The CDP/browser path can't run headless in CI,
// so this pins the real logic: WCAG contrast math, AA thresholds, rgba compositing, colour parsing,
// and the contrast-finding classifier. Importing a11y-check.mjs launches nothing (main() is guarded).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseColor, over, effectiveBg, relLuminance, contrastRatio,
  isLargeText, aaThreshold, contrastFindings, INTERACTIVE_ROLES,
  styleguideTarget, A11Y_GUIDE, a11yItemLine, a11yFindingRecord, summarizeAxe,
  iconContrastFindings, namedByTitleOnly, SETTLE_TRANSITIONS,
} from '../a11y-check.mjs';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { findChrome, launchChrome, connectCDP, openPage, waitForTrue, FILE_PAGE_LOADED } from '../cdp.mjs';

test('[axe] summarizeAxe collapses per-node rows into one per rule, busiest first', () => {
  const s = summarizeAxe([
    { id: 'color-contrast', help: 'Elements must have sufficient color contrast', impact: 'serious', count: 2, targets: ['.a', '.b'] },
    { id: 'button-name', help: 'Buttons must have discernible text', impact: 'critical', count: 1, targets: ['button'] },
    { id: 'color-contrast', help: 'Elements must have sufficient color contrast', impact: 'serious', count: 3, targets: ['.c'] },
  ]);
  assert.equal(s.length, 2);
  assert.equal(s[0].id, 'color-contrast');
  assert.equal(s[0].count, 5);
  assert.deepEqual(s[0].targets, ['.a', '.b', '.c']);
});

// ── Plain-language reporting + machine record ──
test('[plain] every issue kind has a title/why/fix, and no raw jargon in the guidance', () => {
  for (const kind of ['contrast', 'hovercontrast', 'name', 'focus', 'focuscontrast', 'ariastate', 'keyboard']) {
    const g = A11Y_GUIDE[kind];
    assert.equal(typeof g.title(1), 'string');
    assert.ok(g.why.length > 10 && g.fix.length > 10);
    // human copy must not leak internal check names
    assert.doesNotMatch(g.why + g.fix, /no-focus|state-not-exposed|not-keyboard|cannotCompute/);
  }
});
test('[plain] titles are singular/plural aware', () => {
  assert.match(A11Y_GUIDE.contrast.title(1), /piece of text is/);
  assert.match(A11Y_GUIDE.contrast.title(3), /3 pieces of text are/);
  assert.match(A11Y_GUIDE.focus.title(1), /control does not/);
  assert.match(A11Y_GUIDE.focus.title(2), /2 controls do not/);
});
test('[plain] a11yItemLine reads as a sentence, not a raw selector dump', () => {
  const c = a11yItemLine('contrast', { theme: 'Light', desc: '.lbl', text: 'Name', ratio: 1.6, threshold: 4.5 });
  assert.match(c, /the text "Name"/);
  assert.match(c, /1\.6 out of 21/);
  assert.match(c, /Light theme/);
  assert.equal(a11yItemLine('name', { role: 'button' }), 'A button with no label');
  assert.equal(a11yItemLine('name', { role: 'textbox' }), 'An input field with no label');
  assert.match(a11yItemLine('focuscontrast', { desc: 'button.x', ratio: 1.5, threshold: 3 }), /focus outline scores 1\.5 out of 21, needs at least 3/);
  assert.match(a11yItemLine('hovercontrast', { text: 'Save', ratio: 2.2, threshold: 4.5 }), /the text "Save" on hover — its readability score is 2\.2 out of 21/);
});
test('[json] a11yFindingRecord carries the exact facts + the fix for a machine', () => {
  const c = a11yFindingRecord('contrast', { theme: 'Dark', desc: '.err', text: 'Oops', ratio: 2.1, threshold: 4.5 });
  assert.equal(c.issue, 'contrast');
  assert.equal(c.selector, '.err');
  assert.equal(c.contrast, 2.1);
  assert.equal(c.needs, 4.5);
  assert.equal(c.theme, 'Dark');
  assert.ok(c.fix && c.fix.length > 10);
  const n = a11yFindingRecord('name', { role: 'button', desc: '<button> with no accessible name' });
  assert.equal(n.role, 'button');
  assert.ok(n.fix.includes('aria-label'));
});

const approx = (a, b, eps = 0.02) => Math.abs(a - b) <= eps;

// ── styleguideTarget (I35): the generated-styleguide render target ──
test('[styleguide] returns the target when the file exists (default path)', () => {
  const t = styleguideTarget({}, '/proj', (p) => p === '/proj/apps/styleguide/index.html');
  assert.equal(t.label, 'apps/styleguide/index.html');
  assert.equal(t.styleguide, true);
  assert.ok(t.url.startsWith('file://'));
});
test('[styleguide] null when the file is absent', () => {
  assert.equal(styleguideTarget({}, '/proj', () => false), null);
});
test('[styleguide] honours a custom styleguide.out', () => {
  const t = styleguideTarget({ styleguide: { out: 'dist/sg.html' } }, '/proj', (p) => p === '/proj/dist/sg.html');
  assert.equal(t.label, 'dist/sg.html');
});
test('[styleguide] opt-out via a11y.styleguide:false', () => {
  assert.equal(styleguideTarget({ a11y: { styleguide: false } }, '/proj', () => true), null);
});

test('contrastRatio: black on white is 21, white on white is 1', () => {
  assert.ok(approx(contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }), 21));
  assert.ok(approx(contrastRatio({ r: 255, g: 255, b: 255 }, { r: 255, g: 255, b: 255 }), 1));
});

test('parseColor handles rgb / rgba / transparent, and the spaces Chrome keeps (oklch, oklab, color(srgb))', () => {
  assert.deepEqual(parseColor('rgb(0, 0, 0)'), { r: 0, g: 0, b: 0, a: 1 });
  assert.deepEqual(parseColor('rgba(10, 20, 30, 0.5)'), { r: 10, g: 20, b: 30, a: 0.5 });
  assert.equal(parseColor('transparent').a, 0);
  // Chrome reports an oklch() colour as written (Tailwind v4's default): white and black, read, not skipped.
  const w = parseColor('oklch(1 0 0)'), k = parseColor('oklch(0 0 0 / 0.5)');
  assert.ok(approx(w.r, 255, 1) && approx(w.g, 255, 1) && approx(w.b, 255, 1) && w.a === 1);
  assert.ok(approx(k.r, 0, 1) && k.a === 0.5);
  assert.ok(approx(parseColor('color(srgb 1 0 0)').r, 255, 0.5));
  assert.equal(parseColor('color(display-p3 1 0 0)'), null);   // not converted → cannot compute
});

test('contrastFindings reads an oklch text colour and background, and says so when a colour space cannot be read', () => {
  const grey = contrastFindings([{ desc: 'span', text: 'Hi', color: 'oklch(0.7 0 0)', bgLayers: ['oklch(1 0 0)'], fontSize: 16, fontWeight: '400', bgImage: false }], 'Light');
  assert.equal(grey.length, 1, 'light grey on white fails 4.5:1');
  assert.ok(grey[0].ratio < 4.5);
  const p3 = contrastFindings([{ desc: 'span', text: 'Hi', color: 'color(display-p3 0 0 0)', bgLayers: ['rgb(255,255,255)'], fontSize: 16, fontWeight: '400', bgImage: false }], 'Light');
  assert.equal(p3.length, 1);
  assert.match(p3[0].cannotCompute, /colour space/);
  const p3bg = contrastFindings([{ desc: 'span', text: 'Hi', color: 'rgb(0,0,0)', bgLayers: ['color(display-p3 1 1 1)'], fontSize: 16, fontWeight: '400', bgImage: false }], 'Light');
  assert.match(p3bg[0]?.cannotCompute ?? '', /colour space/);
});

test('contrastFindings blends see-through text over its background before measuring', () => {
  // Black at 30% on white draws a light grey (about 2.2:1): it must fail, not read as black's 21:1.
  const out = contrastFindings([{ desc: 'span.hint', text: 'Hi', color: 'rgba(0, 0, 0, 0.3)', bgLayers: ['rgb(255,255,255)'], fontSize: 16, fontWeight: '400', bgImage: false }], 'Light');
  assert.equal(out.length, 1);
  assert.ok(out[0].ratio < 3);
  // Fully transparent text draws nothing: no finding.
  assert.equal(contrastFindings([{ desc: 'span', text: 'x', color: 'rgba(0,0,0,0)', bgLayers: ['rgb(255,255,255)'], fontSize: 16, fontWeight: '400', bgImage: false }], 'Light').length, 0);
});

test('effectiveBg composites a translucent element bg over its opaque ancestor', () => {
  // nearest-first: element bg black@50% over an opaque white ancestor → mid grey
  const bg = effectiveBg(['rgba(0, 0, 0, 0.5)', 'rgb(255, 255, 255)']);
  assert.ok(approx(bg.r, 127.5, 0.5) && approx(bg.g, 127.5, 0.5) && approx(bg.b, 127.5, 0.5));
  // no layers → white canvas default
  assert.deepEqual(effectiveBg([]), { r: 255, g: 255, b: 255 });
});

test('isLargeText / aaThreshold follow WCAG (>=24px, or >=18.66px bold)', () => {
  assert.equal(isLargeText(24, '400'), true);
  assert.equal(isLargeText(18.66, '700'), true);
  assert.equal(isLargeText(18, '700'), false);
  assert.equal(isLargeText(23, '400'), false);
  assert.equal(isLargeText(19, 'bold'), true);
  assert.equal(aaThreshold(16, '400'), 4.5);
  assert.equal(aaThreshold(30, '400'), 3);
});

test('contrastFindings flags #777 on white as normal-text fail but passes it as large text', () => {
  const el = (fontSize, fontWeight) => ({ desc: 'span.label', text: 'Hi', color: 'rgb(119,119,119)', bgLayers: ['rgb(255,255,255)'], fontSize, fontWeight, bgImage: false });
  const normal = contrastFindings([el(16, '400')], 'Light');
  assert.equal(normal.length, 1);
  assert.equal(normal[0].threshold, 4.5);
  assert.ok(normal[0].ratio < 4.5);
  const large = contrastFindings([el(30, '400')], 'Light');
  assert.equal(large.length, 0, 'ratio ~4.48 clears the 3:1 large-text bar');
});

test('contrastFindings reports a gradient/image background as cannot-compute, not a fail', () => {
  const out = contrastFindings([{ desc: 'div.hero', text: 'X', color: 'rgb(0,0,0)', bgLayers: [], fontSize: 16, fontWeight: '400', bgImage: true }], 'Dark');
  assert.equal(out.length, 1);
  assert.equal(out[0].cannotCompute, 'background-image/gradient');
  assert.equal(out[0].ratio, undefined);
});

test('a good pair produces no finding', () => {
  const out = contrastFindings([{ desc: 'p', text: 'ok', color: 'rgb(0,0,0)', bgLayers: ['rgb(255,255,255)'], fontSize: 16, fontWeight: '400', bgImage: false }], 'Light');
  assert.equal(out.length, 0);
});

test('INTERACTIVE_ROLES covers the classic controls', () => {
  for (const r of ['button', 'link', 'textbox', 'checkbox', 'tab']) assert.ok(INTERACTIVE_ROLES.has(r));
  assert.equal(INTERACTIVE_ROLES.has('paragraph'), false);
});

test('relLuminance is monotonic (black < grey < white)', () => {
  assert.ok(relLuminance({ r: 0, g: 0, b: 0 }) < relLuminance({ r: 119, g: 119, b: 119 }));
  assert.ok(relLuminance({ r: 119, g: 119, b: 119 }) < relLuminance({ r: 255, g: 255, b: 255 }));
  assert.deepEqual(over({ r: 0, g: 0, b: 0, a: 1 }, { r: 255, g: 255, b: 255 }), { r: 0, g: 0, b: 0 });
});

test('iconContrastFindings: an icon kept in its light-theme colour on a dark background fails 3:1; one that follows the theme passes', () => {
  const dark = ['rgb(30, 30, 30)'];
  const out = iconContrastFindings([
    { desc: 'button.icon-only', color: 'rgb(40, 40, 40)', bgLayers: dark },
    { desc: 'button.close', color: 'rgb(240, 240, 240)', bgLayers: dark },
    { desc: 'button.faded', color: 'rgba(240, 240, 240, 0.1)', bgLayers: dark },
  ], 'Dark');
  assert.deepEqual(out.map((f) => [f.desc, f.kind, f.theme, f.threshold]), [['button.icon-only', 'iconcontrast', 'Dark', 3], ['button.faded', 'iconcontrast', 'Dark', 3]]);
  assert.match(a11yItemLine('iconcontrast', out[0]), /icon scores .* needs at least 3 \(Dark theme\)/);
  assert.equal(a11yFindingRecord('iconcontrast', out[0]).theme, 'Dark');
});

test('namedByTitleOnly: the name the browser settled on came from the title', () => {
  assert.equal(namedByTitleOnly({ name: { value: 'Dark mode', sources: [{ type: 'attribute', attribute: 'aria-labelledby' }, { type: 'attribute', attribute: 'title', value: { value: 'Dark mode' } }] } }), true);
  assert.equal(namedByTitleOnly({ name: { value: 'Close', sources: [{ type: 'attribute', attribute: 'aria-label', value: { value: 'Close' } }, { type: 'attribute', attribute: 'title', superseded: true, value: { value: 'x' } }] } }), false);
  assert.equal(namedByTitleOnly({ name: { value: 'Save', sources: [{ type: 'contents', value: { value: 'Save' } }] } }), false);
  assert.equal(namedByTitleOnly({}), false);
});

// A mode switch starts the component's own transitions: its colours are read once they settle. A button whose text
// colour transitions and whose background does not read 1:1 for a moment in the dark mode (a false contrast failure).
const CHROME = findChrome({ playwright: true });
test('[modes] after a mode switch the colours are read settled, never halfway through a transition', { skip: !CHROME || typeof WebSocket === 'undefined' ? 'no Chrome available' : false }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'settle-test-'));
  const page = join(dir, 'p.html');
  writeFileSync(page, '<!doctype html><style>b{color:#111;background:#fff;transition:color 5s 60s}:root[data-c=dark] b{color:#eee;background:#111}</style><b id="x">Cancel</b>');
  const browser = await launchChrome(CHROME, { tmpPrefix: 'settle-test-' });
  try {
    const { send, close } = await connectCDP(browser.wsUrl);
    const { sessionId } = await openPage(send, pathToFileURL(page).href);
    assert.equal(await waitForTrue(send, sessionId, FILE_PAGE_LOADED), true);
    const read = async () => (await send('Runtime.evaluate', { expression: 'getComputedStyle(document.getElementById("x")).color', returnByValue: true }, sessionId)).result.value;
    await send('Runtime.evaluate', { expression: 'document.documentElement.setAttribute("data-c", "dark")' }, sessionId);
    assert.equal(await read(), 'rgb(17, 17, 17)', 'waiting on its transition: the old text colour on the new dark background');
    await send('Runtime.evaluate', { expression: SETTLE_TRANSITIONS }, sessionId);
    assert.equal(await read(), 'rgb(238, 238, 238)');
    close();
  } finally { browser.kill(); }
});

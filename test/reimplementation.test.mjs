// test/reimplementation.test.mjs - regression tests for the local-reimplementation gate.
//
// The gate (reimplementation-check.mjs) flags an interactive element of a role the DS OWNS that is
// locally styled to look like the DS component but does NOT use the DS component class. It is
// opt-in (no reimplementationSurfaces → PASS), advisory by default (PASS), hard-fail under
// reimplementationStrict, and inert when the DS defines no component for the role.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGate, crashed } from './helpers.mjs';

const GATE = 'reimplementation-check.mjs';

// A DS that owns a button component (ButtonPrimary → .buttonPrimary).
const DS = { componentSelectors: { ButtonPrimary: '.buttonPrimary' } };

// A surface with a hand-styled native button (local class carries visual CSS).
const handRolled =
  `<button class="save-btn">Save</button>\n` +
  `<style>.save-btn { background: #06c; border-radius: 6px; padding: 8px 12px; }</style>\n`;
// A surface that correctly uses the DS button class.
const usesDs =
  `<button class="buttonPrimary">Save</button>\n` +
  `<style>.buttonPrimary { background: var(--btn-bg); }</style>\n`;
// A bare native button with no local styling — a utility/reset, not a simulated component.
const bareButton = `<button class="icon-only" aria-label="Close"></button>\n`;

test('[reimplementation] nothing to scan and no screens captured → not run (exit 2), never a pass', () => {
  const { code, out } = runGate(GATE, { 'ds-config.json': { ...DS } });
  assert.equal(code, 2, out);
  assert.match(out, /⏭ \[reimplementation\] no product code to scan/);
  assert.doesNotMatch(out, /✅/);
});

test('[reimplementation] unset surfaces fall back to the products the config lists (pluginDirs)', () => {
  const { code, out } = runGate(GATE, {
    'ds-config.json': { ...DS, pluginDirs: { app: 'app' } },
    'app/ui.src.html': handRolled,
    'app/ui.html': usesDs,
  });
  assert.equal(code, 0, out);
  assert.match(out, /save-btn/, 'the source page is scanned, not the built one');
});

test('[reimplementation] a hand-styled <button> not using the DS class → advisory PASS', () => {
  const { code, out } = runGate(GATE, {
    'ds-config.json': { ...DS, reimplementationSurfaces: ['ui.html'] },
    'ui.html': handRolled,
  });
  assert.ok(!crashed(out), out);
  assert.equal(code, 0, `advisory must not fail by default:\n${out}`);
  assert.match(out, /save-btn/);
});

test('[reimplementation] the same hand-styled button → FAIL under reimplementationStrict', () => {
  const { code, out } = runGate(GATE, {
    'ds-config.json': { ...DS, reimplementationSurfaces: ['ui.html'], reimplementationStrict: true },
    'ui.html': handRolled,
  });
  assert.equal(code, 1, `strict must fail:\n${out}`);
  assert.match(out, /save-btn/);
});

test('[reimplementation] a button that uses the DS class → PASS (no finding)', () => {
  const { code, out } = runGate(GATE, {
    'ds-config.json': { ...DS, reimplementationSurfaces: ['ui.html'], reimplementationStrict: true },
    'ui.html': usesDs,
  });
  assert.equal(code, 0, out);
  assert.match(out, /no local component reimplementation/);
});

test('[reimplementation] a bare unstyled button is not flagged', () => {
  const { code, out } = runGate(GATE, {
    'ds-config.json': { ...DS, reimplementationSurfaces: ['ui.html'], reimplementationStrict: true },
    'ui.html': bareButton,
  });
  assert.equal(code, 0, `a bare button must not be flagged:\n${out}`);
});

test('[reimplementation] the DS defines no button component → PASS (nothing to reimplement)', () => {
  const { code, out } = runGate(GATE, {
    'ds-config.json': { reimplementationSurfaces: ['ui.html'], componentSelectors: { Card: '.card' } },
    'ui.html': handRolled,
  });
  assert.equal(code, 0, out);
  assert.match(out, /nothing to reimplement/);
});

test('[reimplementation] a known exemption silences the finding', () => {
  const { code, out } = runGate(GATE, {
    'ds-config.json': { ...DS, reimplementationSurfaces: ['ui.html'], reimplementationStrict: true, knownReimplementations: ['ui.html#.save-btn'] },
    'ui.html': handRolled,
  });
  assert.equal(code, 0, `exempted finding must not fail:\n${out}`);
});

test('[reimplementation] an inline-styled look-alike button is flagged', () => {
  const { code, out } = runGate(GATE, {
    'ds-config.json': { ...DS, reimplementationSurfaces: ['ui.html'] },
    'ui.html': `<button style="background:#06c;border-radius:6px;padding:8px">Go</button>\n`,
  });
  assert.ok(!crashed(out), out);
  assert.match(out, /reimplementation/);
});

test('[reimplementation] a text input styled by its id, without the DS input class, is flagged', () => {
  const { out } = runGate(GATE, {
    'ds-config.json': { componentSelectors: { input: '.field' }, reimplementationSurfaces: ['ui.html'] },
    'ui.html': `<input id="scale" type="text"><style>#scale { border: 1px solid #ccc; padding: 0 4px; }</style>\n`,
  });
  assert.match(out, /<input> "#scale"/);
});

test('[reimplementation] a DS input field, a checkbox and a part the theme styles inside a component are not flagged', () => {
  const { code, out } = runGate(GATE, {
    'ds-config.json': { componentSelectors: { input: '.field' }, paths: { themeCSS: 'theme.css' }, reimplementationSurfaces: ['ui.html'], reimplementationStrict: true },
    'theme.css': '.field { border: 1px solid; } .inputField { padding: 0; } .field .field-icon { order: 3; }',
    'ui.html': `<div class="field"><input class="inputField" type="text"><button class="field-icon clear">x</button></div><input type="checkbox" class="tick">`
      + `<style>.clear { background: none; border: 0; } .tick { border: 1px solid; }</style>\n`,
  });
  assert.equal(code, 0, out);
});

// The Figma side: the DS components each product screen uses, read from Figma.
const screenSnap = (components) => JSON.stringify({ screens: { '1:2': { name: 'Main', plugin: 'app', components } } });
const SCREEN_DS = { componentSelectors: { buttonStepper: '.buttonStepper', buttonPrimary: '.buttonPrimary' }, pluginDirs: { app: 'app' } };

test('[reimplementation] a component the Figma screen uses and the code never uses fails', () => {
  const { code, out } = runGate(GATE, {
    'ds-config.json': SCREEN_DS,
    'figma-screen-components.snapshot.json': screenSnap({ buttonStepper: 1, buttonPrimary: 2, 'Icon-plus': 1 }),
    'app/ui.src.html': `<!-- a buttonStepper drawn by hand --><div class="stepper"><button class="buttonPrimary">-</button></div>\n<style>.buttonStepper{}</style>\n`,
  });
  assert.equal(code, 1, out);
  assert.match(out, /app: "Main" uses buttonStepper; the code never uses \.buttonStepper/);
  assert.doesNotMatch(out, /uses buttonPrimary;/, 'a component the code uses is not listed');
  assert.doesNotMatch(out, /Icon-plus/, 'only DS components count');
});

test('[reimplementation] a class added from script counts as a use', () => {
  const { code, out } = runGate(GATE, {
    'ds-config.json': SCREEN_DS,
    'figma-screen-components.snapshot.json': screenSnap({ buttonStepper: 1 }),
    'app/ui.src.html': `<div id="s"></div><script>document.getElementById('s').classList.add('buttonStepper');</script>\n`,
  });
  assert.equal(code, 0, out);
  assert.match(out, /every DS component the product screens use in Figma is used by their code/);
});

test('[reimplementation] a screen component can be excused, and screenComponentsStrict false makes it advice', () => {
  const files = { 'figma-screen-components.snapshot.json': screenSnap({ buttonStepper: 1 }), 'app/ui.src.html': '<div class="stepper"></div>\n' };
  assert.equal(runGate(GATE, { ...files, 'ds-config.json': { ...SCREEN_DS, knownReimplementations: ['app/buttonStepper'] } }).code, 0);
  const soft = runGate(GATE, { ...files, 'ds-config.json': { ...SCREEN_DS, screenComponentsStrict: false } });
  assert.equal(soft.code, 0, soft.out);
  assert.match(soft.out, /⚠️ .*uses buttonStepper/);
});

test('[reimplementation] a component the DS has not built yet is said as not checked, not a product gap', () => {
  const { code, out } = runGate(GATE, {
    'ds-config.json': { ...SCREEN_DS, knownUnimplementedComponents: ['buttonStepper'] },
    'figma-screen-components.snapshot.json': screenSnap({ buttonStepper: 1 }),
    'app/ui.src.html': '<div class="stepper"></div>\n',
  });
  assert.equal(code, 0, out);
  assert.match(out, /⏭ \[reimplementation\] app: "Main" uses buttonStepper, which the DS has not built yet/);
  assert.doesNotMatch(out, /the code never uses/);
});

test('[reimplementation] screens configured but not captured: said on a ⏭ line', () => {
  const { out } = runGate(GATE, {
    'ds-config.json': { ...SCREEN_DS, frames: [{ name: 'Main', nodeId: '1-2', plugin: 'app' }] },
    'app/ui.src.html': usesDs,
  });
  assert.match(out, /⏭ \[reimplementation\] the product screens are not captured from Figma/);
});

// Part 3: a product's own version of something the system has (a loading state and a spinner beside its loader).
const LOADER_THEME = `.loader { display: inline-flex; padding: 8px; }
.loader-spinner { border-radius: 50%; animation: spin 0.8s linear infinite; }
.spinner { border-radius: 50%; animation: spin 0.7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }`;
const LOADER_DS = { componentSelectors: { loader: '.loader' }, paths: { themeCSS: 'theme.css' }, styleguide: { plugins: [{ key: 'A', match: 'app', name: 'Atlas' }] } };

test('[reimplementation] a product drawing its own loader (its loading state, a spinner no component owns) is named, with the system one to use', () => {
  const { code, out } = runGate(GATE, {
    'ds-config.json': { ...LOADER_DS, reimplementationSurfaces: ['app/ui.src.html'] },
    'theme.css': LOADER_THEME,
    'app/ui.src.html': `<style>.loading-state { display: flex; color: var(--muted); } .graph-node { padding: 4px; }</style>\n<div class="loading-state">Loading…</div><span class="spinner"></span><div class="graph-node"></div>`,
  });
  assert.equal(code, 0, out);
  assert.match(out, /⚠️  \[reimplementation\] loader: Atlas draws its own instead of using it \(\.loading-state, \.spinner in app\/ui\.src\.html\)/);
  assert.doesNotMatch(out, /graph-node/, 'a name that only ends with a component word is not one');
});

test('[reimplementation] a product that uses the loader, or dresses it with a class of its own, is not drawing its own', () => {
  const { out } = runGate(GATE, {
    'ds-config.json': { ...LOADER_DS, reimplementationSurfaces: ['app/ui.src.html'] },
    'theme.css': LOADER_THEME,
    'app/ui.src.html': `<style>.loader-wide { width: 100%; } .loading-state { display: flex; }</style>\n<div class="loader loader-wide"><span class="loader-spinner"></span></div><div class="loading-state"></div>`,
  });
  assert.match(out, /✅ \[reimplementation\] no product draws its own version of a system component/);
});

test('[reimplementation] the finding said plainly, for the code to act on', async () => {
  const { plainDifference, plainAction } = await import('../run-diff.mjs');
  const what = 'loader: Atlas draws its own instead of using it (.loading-state, .spinner in app/ui.src.html)';
  assert.equal(plainDifference(what), 'Atlas draws its own loader (.loading-state, .spinner) instead of using the system\'s (app/ui.src.html).');
  assert.deepEqual(plainAction(what, 'loader'), { who: 'code', todo: 'Use the system\'s loader in Atlas in place of its own. Tell Claude to do it.' });
});

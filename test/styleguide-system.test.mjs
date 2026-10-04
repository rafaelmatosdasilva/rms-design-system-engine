// The style guide is the system's own: its controls come from what the code realizes, its look from the system's
// tokens and components, and the page is checked against the system it shows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { realizedControls, chromeRoles, segmentedUi, fieldUi, hiddenAtRest, holdsPart, modeRootCSS, ruleLines, entryLines, buttonUi, cardUi, motionUi } from '../styleguide-data.mjs';
import { checkStyleguidePage, failures, missingRoles, controlClasses } from '../styleguide-check.mjs';
import { differences, differencesMarkdown } from '../run-diff.mjs';
import { appDir } from '../code-roots.mjs';

const defs = {
  'Label Content': { type: 'TEXT', defaultValue: 'Label' },
  'Show Label': { type: 'BOOLEAN', defaultValue: true },
  'Show Icon': { type: 'BOOLEAN', defaultValue: true },
  Type: { type: 'VARIANT', defaultValue: 'negative', variantOptions: ['negative', 'warning', 'positive', 'neutral'] },
  Filled: { type: 'VARIANT', defaultValue: 'True', variantOptions: ['False', 'True'] },
  'Icon Content': { type: 'INSTANCE_SWAP', defaultValue: '1:2' },
  Size: { type: 'VARIANT', defaultValue: 'M', variantOptions: ['M', 'L'] },
};
const css = '.badge{} .badge.high{} .badge.medium{} .badge.low{} .badge.none{} .badge.no-label .badge-label{display:none} .badge.empty{}';

test('an HTML system: a Figma prop is a control when the code realizes it, through the contract, the config or a class', () => {
  const r = realizedControls({ name: 'badge', defs, cls: 'badge', cssText: css,
    propertyMap: { State: { negative: '.badge.high', warning: '.badge.medium', positive: '.badge.low', neutral: '.badge.none' }, 'Show Label': '.badge.no-label .badge-label', Filled: { True: '.badge', False: '.badge.empty' } },
    realizations: { 'Label Content': '.badge-label', 'Show Icon': '.badge svg' } });
  const by = Object.fromEntries(r.controls.map((c) => [c.label, c]));
  assert.deepEqual(by.Type.options.map((o) => [o.label, o.add]), [['negative', ['high']], ['warning', ['medium']], ['positive', ['low']], ['neutral', ['none']]], 'the contract spells it State: found by its options');
  assert.deepEqual(by['Show Label'].off, { add: ['no-label'], attrs: {} }, 'a no- modifier hides the part when false');
  assert.equal(by['Show Icon'].part, 'svg');
  assert.equal(by['Label Content'].part, '.badge-label');
  assert.deepEqual(by.Filled, { label: 'Filled', prop: 'Filled', type: 'BOOLEAN', default: true, off: { add: ['empty'], attrs: {} } });
  assert.equal(by['Icon Content'], undefined, 'an instance swap is not a control');
  assert.deepEqual(r.unrealized, ['Size'], 'a prop nothing in the code realizes is counted, not shown');
  const part = realizedControls({ name: 'chip', defs: { 'Show Icon': { type: 'BOOLEAN', defaultValue: true } }, cls: 'chip', cssText: '.chip{} .chip-icon{}', realizations: { 'Show Icon': '.chip-icon' } });
  assert.deepEqual(part.controls[0].part, '.chip-icon', 'a realization names a part, never a class put on the component itself');
  assert.equal(part.controls[0].on, undefined);
});

const tokens = {
  colors: [
    { group: 'semantic', items: [{ figma: 'semantic/surface/elevationHigh', var: '--surface-high' }, { figma: 'semantic/surface/elevationMedium', var: '--bg' }, { figma: 'semantic/surface/elevationLow', var: '--bg-low' }, { figma: 'semantic/content/primary', var: '--text' }, { figma: 'semantic/content/secondary', var: '--text-2' }, { figma: 'semantic/warning', var: '--warn' }] },
    { group: 'badge', items: [{ figma: 'badge/text/default', var: '--badge-text' }] },
    { group: 'dividerLine', items: [{ figma: 'dividerLine/border', var: '--border' }] },
  ],
  typography: [{ scale: 'm', size: { var: '--m-size', value: '11px' }, weight: { var: '--m-weight' }, lh: { var: '--m-lh' } }, { scale: 's', size: { var: '--s-size', value: '10px' } }, { scale: 'l', size: { var: '--l-size', value: '13px' }, weight: { var: '--l-weight' } }],
  radii: [{ figma: 'radii/card', var: '--radius-card', value: '12px' }, { figma: 'radii/checkbox', var: '--radius-s', value: '4px' }, { figma: 'radii/pill', var: '--radius-full', value: '24px' }],
  spacing: [{ figma: 'gap/s', var: '--gap-s', value: '4px' }, { figma: 'gap/m', var: '--gap-m', value: '8px' }, { figma: 'padding/l', var: '--padding-l', value: '16px' }],
};

test('the page\'s look is the system\'s: its page colours, a shared token before a component\'s, its text styles, radii and spaces', () => {
  const { roles, missing, css: out } = chromeRoles({ tokens, componentNames: ['badge'], themeCss: ':root { --font-family: Inter; } body { color: var(--text); background: var(--bg); }', icons: { size: 16 } });
  assert.equal(roles.bg, 'var(--bg)', 'the background the system\'s own page uses');
  assert.equal(roles.text, 'var(--text)');
  assert.equal(roles.surface, 'var(--surface-high)');
  assert.equal(roles['bg-2'], 'var(--bg-low)');
  assert.equal(roles['text-2'], 'var(--text-2)');
  assert.equal(roles.border, 'var(--border)', 'a shared group before a component\'s');
  assert.notEqual(roles.muted, 'var(--badge-text)', 'a component\'s own token is never the page\'s look');
  assert.equal(roles.font, undefined, 'no font of the page\'s own: its text inherits the system\'s page font and fallbacks');
  assert.deepEqual([roles.s, roles.m, roles.l], ['var(--s-size)', 'var(--m-size)', 'var(--l-size)']);
  assert.equal(roles.radius, 'var(--radius-card)');
  assert.equal(roles['space-s'], 'var(--gap-m)');
  assert.equal(roles.icon, '16px', 'the size the system\'s icons are drawn at');
  assert.deepEqual(missing, []);
  assert.match(out, /^:root, \[data-color\], \[data-size\] \{ --sg-bg: var\(--bg\);/, 'declared again where a preview has its own mode');
  assert.deepEqual(chromeRoles({ tokens, override: { accent: '--brand' } }).roles.accent, 'var(--brand)', 'styleguide.chrome names one by hand');
});

test('the page\'s switches and text fields are the system\'s own components, read from their markup', () => {
  const seg = segmentedUi([{ name: 'card', markup: '<div class="card"><button>A</button></div>' },
    { name: 'segmentedControl', markup: '<div class="segmented-control full-width"><span class="seg-pill"></span><button class="selected"><span class="tab-label">A</span></button><button><span class="tab-label">B</span></button></div>' }]);
  assert.deepEqual(seg, { from: 'segmentedControl', open: '<div class="segmented-control">', close: '</div>', item: { tag: 'button', classes: [], label: 'tab-label' }, selected: { add: ['selected'], attrs: {} } });
  assert.equal(segmentedUi([{ name: 'x', markup: '<div><button>A</button><button>B</button></div>' }]), null, 'no selected state, not a segmented control');
  const field = fieldUi([{ name: 'input', markups: ['<div class="fieldWrap product-x"><input type="number" class="fieldInput"></div>', '<div class="fieldWrap"><svg></svg><input type="text" class="fieldInput extra" value="v"></div>'] }], '.fieldWrap{} .fieldInput{}');
  assert.deepEqual(field, { from: 'input', markup: '<div class="fieldWrap"><input type="text" aria-label="Value" class="fieldInput"></div>' });
});

test('the style guide check: only the system\'s tokens on the page; a role with no token is a warning; the page\'s own accessibility', () => {
  const page = (css, body = '<main><h1>System</h1></main>') => `<html lang="en"><head><style data-system>.x{color:#f00}</style><style>${css}</style></head><body>${body}</body></html>`;
  const clean = page(':root { --sg-bg: Canvas; } :root { --sg-bg: var(--bg); } .a { color: var(--sg-text); padding: var(--sg-space-s) 1px; font-size: var(--sg-s); }');
  assert.deepEqual(failures(checkStyleguidePage(clean)), [], 'the system\'s own CSS (data-system) is not the page\'s');
  const bad = failures(checkStyleguidePage(page('.a { color: #333; font-size: 12px; font-family: Arial; border-radius: 6px; padding: 12px; }')));
  assert.deepEqual(bad.map((f) => f.property), ['color', 'font-size', 'font-family', 'border-radius', 'padding']);
  assert.ok(missingRoles(clean).includes('text'), 'a role never filled is left to the browser');
  assert.ok(checkStyleguidePage(clean).some((f) => f.warning && f.property === '--sg-text'));
  assert.ok(failures(checkStyleguidePage(page('', '<main><img src="a.png"></main>'))).some((f) => f.property === 'accessibility'));
});

test('one list of differences: grouped by component, marked new, the data\'s freshness, accessibility and pointer lines left out', () => {
  const now = ['Structure :: badge height: Figma 20, rendered 24', 'Token values :: ❌ [sizing] padding/s → --padding-s: 8px vs 10px', 'Data is up to date :: ⚠️ a snapshot is old', 'Accessibility :: no label', 'Token contrast :: a on b 2:1', 'Structure :: gate fails', 'Figma file hygiene :: badge has no description'];
  const d = differences(now, ['badge'], ['Structure :: badge height: Figma 20, rendered 24']);
  assert.equal(d.total, 3);
  assert.equal(d.fresh, 2);
  assert.deepEqual(d.groups.map((g) => [g.component, g.items.length]), [['badge', 2], [null, 1]]);
  assert.equal(d.groups[0].items.find((x) => x.check === 'Figma file hygiene').side, 'figma');
  const pointers = ['Structure :: 🔗 badge in Figma: https://example.test', 'Structure :: ↳ last changed 2026-07-31 by someone', 'Every mode is covered: :: ⏭  SKIPPED 17', 'Structure :: least checked: badge, 3 not comparable of 8', 'Docs tell the truth :: surface not found, skipped: a.html', 'Structure :: NO-SHRINK 1 component - advisory, not a difference from Figma', 'Exemption debt :: knownStateExemptions: 18'];
  assert.equal(differences([...now, ...pointers], ['badge']).total, 3, 'a line that only points at a difference is not one');
  const moved = differences(['Structure :: badge gap: Figma 4, rendered 8 (.badge · theme.css:1230)'], ['badge'], ['Structure :: badge gap: Figma 4, rendered 8 (.badge · theme.css:1216)']);
  assert.equal(moved.fresh, 0, 'a difference whose line only moved is not new');
  const md = differencesMarkdown(d, { handback: { code: 'out/handback/code-changes.diff' } });
  assert.match(md, /^# Differences between Figma and the code\n\n3 open, 2 new since the last run/);
  assert.match(md, /## badge \(2\)/);
  assert.match(differencesMarkdown({ ...d, notChecked: [{ check: 'Figma frame unchanged', why: 'FIGMA_TOKEN not set' }] }), /Not checked this run, so a difference there would not show: Figma frame unchanged \(FIGMA_TOKEN not set\)\./, 'a check that did not run is named, never mistaken for a pass');
  assert.match(md, /## The whole system \(1\)\n\n- \*\*new\*\* Token values: \[sizing\] padding\/s/);
});

test('an app lives where pluginDirs says, else apps/<app>', () => {
  assert.equal(appDir({ pluginDirs: { gallery: '../gallery-app/' } }, 'gallery'), '../gallery-app');
  assert.equal(appDir({}, 'gallery'), 'apps/gallery');
});

test('a preview never uses an instance that is hidden at rest', () => {
  const css = '.chip { gap: 0 } .zoom-reset { display: none; } .zoom-reset.on { display: flex; }';
  assert.equal(hiddenAtRest('<button class="chip zoom-reset">x</button>', 'chip', css), true, 'an extra class whose rule is display: none');
  assert.equal(hiddenAtRest('<div class="chip hidden">x</div>', 'chip'), true);
  assert.equal(hiddenAtRest('<div class="chip" hidden>x</div>', 'chip'), true);
  assert.equal(hiddenAtRest('<div class="chip" style="display:none;">x</div>', 'chip'), true);
  assert.equal(hiddenAtRest('<button class="chip">x</button>', 'chip', css), false);
});

test('a component switched to Light on a Dark page inherits the Light text colour, not the page\'s', () => {
  const css = modeRootCSS('  body {\n    overflow-x: hidden;\n    color: var(--text);\n    font-size: var(--m-size);\n    background: var(--bg);\n  }');
  assert.match(css, /\[data-color\], \[data-size\] \{ color: var\(--text\); font-size: var\(--m-size\); \}/, 'the page\'s inherited text styles, resolved again on the preview');
  assert.equal(modeRootCSS('.x { color: red; }'), '', 'no page rule, nothing to repeat');
});

test('a preview uses the instance that holds the parts its props show and hide', () => {
  assert.equal(holdsPart('<button class="b"><span>View</span><svg></svg></button>', 'svg'), true);
  assert.equal(holdsPart('<button class="b">label</button>', 'span'), false, 'a bare text label is no part');
  assert.equal(holdsPart('<button class="b"><span class="x-label">a</span></button>', '[class*="label"], span'), true);
  assert.equal(holdsPart('<svg class="b"></svg>', 'svg'), false, 'the component itself is not one of its parts');
});

test('a component is dated from its own CSS rules and its contract and config entries', () => {
  const css = '.chip { gap: 0; }\n.chips { gap: 1px; }\n@media (max-width: 480px) {\n  .chip.on {\n    gap: 2px;\n  }\n}\n/* .chip */ .other { x: 1 }\n#tt { y: 1 }';
  assert.deepEqual(ruleLines(css, 'chip'), [1, 4, 5, 6], 'its rules, nested ones too, never a longer class or a comment');
  assert.deepEqual(ruleLines(css, '#tt'), [9], 'an id selector');
  const contract = 'export const C = {\n  chip: {\n    props: { a: 1 },\n  },\n  chipGroup: { },\n};';
  assert.deepEqual(entryLines(contract, 'chip'), [2, 3, 4]);
  assert.deepEqual(entryLines('{ "input": { "chip": { "x": 1 } } }', 'chip'), [], 'only an entry that starts its own line');
  assert.deepEqual(entryLines('{\n  "chip": {\n    "x": 1\n  }\n}', 'chip'), [2, 3, 4]);
});

test('a show prop that hides its part with a no- class still names the part, so the page can draw one no instance has', () => {
  const r = realizedControls({ name: 'badge', defs: { 'Show Icon': { type: 'BOOLEAN', defaultValue: true } }, cls: 'badge', cssText: '.badge{} .badge.no-icon svg{display:none}', realizations: { 'Show Icon': '.badge.no-icon svg' } });
  assert.deepEqual(r.controls[0].off, { add: ['no-icon'], attrs: {} });
  assert.equal(r.controls[0].part, 'svg');
});

test('the page\'s buttons and cards are the system\'s own: the quietest text button, never an icon-only one, and its card', () => {
  const css = '.bPrimary{} .bTertiary{} .bQuaternary{} .card{} .label{}';
  const comps = [
    { name: 'bPrimary', role: 'button', markup: '<button class="bPrimary"><span>Scan</span></button>' },
    { name: 'bQuaternary', role: 'button', markup: '<button class="bQuaternary"><svg></svg></button>' },
    { name: 'bTertiary', role: 'button', markup: '<button class="bTertiary" disabled><span class="frame-name label"></span><svg></svg></button>' },
    { name: 'card', markup: '<div class="card"><span>x</span></div>' },
  ];
  assert.deepEqual(buttonUi(comps, css), { from: 'bTertiary', cls: 'bTertiary', label: { tag: 'span', cls: 'label' } }, 'a label a product fills at run time still counts; only the system\'s classes');
  assert.equal(buttonUi(comps, css, 'bPrimary').from, 'bPrimary', 'the config can name one');
  assert.equal(buttonUi([comps[1]], css), null, 'an icon-only button never holds a label');
  assert.deepEqual(cardUi(comps, css), { from: 'card', cls: 'card' });
  const seg = segmentedUi([{ name: 'seg', markup: '<div class="seg"><span class="pill" aria-hidden="true"></span><button class="selected">A</button><button>B</button></div>' }]);
  assert.equal(seg.open, '<div class="seg"><span class="pill" aria-hidden="true"></span>', 'its decoration, for the system\'s script to place');
});

test('how a component moves, from the system\'s CSS: its entry, its exit, the overlay it opens in; a spinner needs no button', () => {
  const css = `.toast { animation: toast-in .2s; } .toast.toast-out { animation: toast-out .2s forwards; }
    .modal { display: none; } .modal.is-open { display: flex; } .modal-overlay { background: var(--o); }
    .modal.is-closing .modal-overlay { animation: bg-out .2s; } .modal-card { animation: in .2s both; } .modal.is-closing .modal-card { animation: out .2s both; }
    .spin { animation: spin 1s linear infinite; }`;
  assert.deepEqual(motionUi('toast', css), { entry: true, exits: ['toast-out'], overlay: null });
  assert.deepEqual(motionUi('modal-card', css), { entry: true, exits: [], overlay: { container: 'modal', open: 'is-open', closing: 'is-closing', layers: ['modal-overlay'] } });
  assert.equal(motionUi('spin', css), null);
  assert.equal(motionUi('#tt', css), null);
});

test('the style guide check: a button or link the page draws itself fails; a font of its own fails; inherit passes', () => {
  const page = (css, body) => `<html lang="en"><head><style>${css}</style></head><body><main><h1>S</h1>${body}</main></body></html>`;
  const body = '<a class="chip-link" href="#">A</a><script>var b = document.createElement(\'button\'); b.className = \'mine\';</script>';
  assert.deepEqual([...controlClasses(body)].sort(), ['chip-link', 'mine']);
  const bad = failures(checkStyleguidePage(page('.chip-link { background: var(--sg-bg-2); border-radius: var(--sg-radius); } .mine { border: var(--sg-line); } .sg-nav a.active { box-shadow: inset 2px 0 0 var(--sg-text); } .x { font-family: var(--font); } .y { font-family: inherit; }', body)));
  assert.deepEqual(bad.map((f) => `${f.selector} ${f.property}`), ['.chip-link background', '.chip-link border-radius', '.mine border', '.x font-family'], 'an inset line marking the current link is not a button');
});

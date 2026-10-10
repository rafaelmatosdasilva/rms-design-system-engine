// What a prototype is drawn from and held to, on a real system: what each component is for without the notes for whoever
// builds it, the product's designed screens, Figma's slots, the option values written as words, the states a page owes,
// the defaults that leave a component inert, the page's own width, and what is the page's to fix against the audit's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { intentText, contextFrom, productScreensOf, requestFocus, focusLines } from '../prototype-context.mjs';
import { fillsWidth, a11yLines } from '../prototype.mjs';
import { normaliseValues, statesOwed } from '../prototype-states.mjs';
import { buildCatalog, catalogTable, checkUi } from '../ui-catalog.mjs';
import { checkPrototype } from '../prototype-pieces.mjs';
import { screenWidths } from '../prototype-render.mjs';

test('what a component is for keeps the words a designer reads, never the notes for whoever builds it', () => {
  assert.equal(intentText('badge — captured from Figma by rms-design-system-engine.'), '', 'the engine\'s own placeholder');
  assert.equal(intentText('Slotted dialog card (DS 672:141311) → .modal-card: padding/l, gap/xl, radii/modal, modal/background.'), 'Slotted dialog card.');
  assert.equal(intentText('Centred Icon + Title(m) + Description(s) (DS 1431:21215) → .empty-state. Content-driven height.'), 'Centred Icon + Title(m) + Description(s). Content-driven height.');
  assert.equal(intentText('strokeSides=bottom (items stack touching). hover/selected Content h=32. CSS: border-bottom only; ::before inset=4px_0'), '', 'build notes only');
  assert.equal(intentText('built base .checkbox (2026-08)'), '');
  assert.equal(intentText('── Input'), '', 'a banner that leaves a bare name');
  assert.equal(intentText('Never rely on transparency or CSS inheritance.'), 'Never rely on transparency or CSS inheritance.', 'a rule that mentions CSS stays');
  assert.equal(intentText('A vertical surface: Type=Primary paints elevation medium.'), 'A vertical surface: Type=Primary paints elevation medium.', 'an option value stays');
  assert.equal(intentText('Badge component (mirrors .details-status from the lab)'), 'Badge component (mirrors .details-status from the lab)');
  assert.equal(intentText('Primary only'), 'Primary only');
  // In the context: the purpose cleaned, a note that only repeats it left out.
  const ctx = contextFrom({ components: { modal: { description: 'Slotted dialog card (DS 672:141311) → .modal-card.', props: {} } } }, { components: { modal: { code: { note: 'Slotted dialog card (DS 672:141311).' }, design: { annotations: [{ label: 'Role: dialog' }] } } } });
  assert.equal(ctx.components.modal.purpose, 'Slotted dialog card.');
  assert.deepEqual(ctx.components.modal.notes, []);
  assert.equal(ctx.components.modal.role, 'dialog');
});

test('the product\'s designed screens: the system\'s components each one uses, and the screen a request names', () => {
  const catalog = { components: { panel: {}, node: {}, bar: {}, list: {}, radio: { description: 'A radio, the base of Harbor Notes\'s depth radio.', props: {} } } };
  const screens = productScreensOf({ screens: { '1:1': { name: 'Harbor Notes', plugin: 'harbor-notes', components: { node: 27, panel: 3, 'Icon-search': 1, bar: 1, '.window': 1 } }, '2:2': { name: 'Kelp Studio', components: { list: 8 } } } }, catalog);
  assert.deepEqual(screens[0].components, [['node', 27], ['panel', 3], ['bar', 1]], 'the system\'s components only, the most used first');
  const ctx = { ...contextFrom(catalog, null, []), productScreens: screens };
  const f = requestFocus(ctx, 'a scan history page for Harbor Notes with a list of scans');
  assert.deepEqual(f.screens.map((s) => s.name), ['Harbor Notes']);
  assert.ok(!f.components.some((c) => c.name === 'radio'), 'the product\'s name points to its screen, never to a component whose note mentions it');
  assert.match(focusLines(f).join('\n'), /the designed screen for it: Harbor Notes \(Figma\), made of node ×27, panel ×3, bar: a new page for it is made of the same/);
});

test('a slot is a place for other components: shown so, and it takes what goes in it', () => {
  const built = [{ name: 'panel', contract: { props: [{ name: 'Main Content', type: 'children' }, { name: 'Type', type: 'enum', options: ['Primary', 'Secondary'], default: 'Primary' }], relationships: { composesWith: ['button'] } } },
    { name: 'bar', contract: { props: [{ name: 'Slot', type: 'children', slot: { preferredOnly: true, preferred: 1 } }], relationships: { composesWith: ['button'] } } },
    { name: 'button', contract: { props: [{ name: 'Label', type: 'text' }] } }, { name: 'field', contract: { props: [] } }];
  const catalog = buildCatalog(built);
  assert.deepEqual(catalog.components.panel.props['Main Content'], { type: 'children' });
  assert.match(catalogTable(catalog), /panel {2,}Main Content=<its children>  Type=Primary\|Secondary  contains button/);
  const inPanel = checkUi({ component: 'panel', children: [{ component: 'field' }] }, catalog);
  assert.ok(!inPanel.findings.some((f) => /never puts/.test(f.message)), 'a slot takes any component');
  const inBar = checkUi({ component: 'bar', children: [{ component: 'field' }] }, catalog);
  assert.ok(inBar.findings.some((f) => /never puts field inside bar/.test(f.message)), 'a slot that takes only the components Figma lists for it');
});

test('the engine\'s pieces take their on/off options written as words, as the components do', () => {
  const raw = { component: 'Page', props: { clip: 'true', width: '480' }, children: [{ component: 'Row', props: { wrap: 'False' } }] };
  normaliseValues(raw, { components: {} });
  assert.equal(raw.props.clip, true);
  assert.equal(raw.children[0].props.wrap, false);
});

test('a page owes the states its data makes: a row of choices is no list, one card is no list, a radio button sends nothing', () => {
  const context = { components: { radioGroup: { role: 'radiogroup', purpose: 'Labelled ROW of radios.' }, radio: { role: 'radio' }, card: { role: 'group', purpose: 'A bordered container.' }, field: { role: 'textbox' }, send: { role: 'button' }, rows: { role: 'listitem', purpose: 'A list row.' } }, rules: [] };
  const catalog = { components: Object.fromEntries(Object.keys(context.components).map((n) => [n, { props: {} }])) };
  const form = { component: 'Page', children: [{ component: 'radioGroup', children: [{ component: 'radio' }, { component: 'radio' }] }, { component: 'card' }, { component: 'field' }] };
  assert.deepEqual(statesOwed(form, { context, catalog }), [], 'choices, a card and a field with nothing to send it');
  const sent = statesOwed({ ...form, children: [...form.children, { component: 'send' }] }, { context, catalog });
  assert.deepEqual(sent.map((o) => [o.state, o.why]), [['error', 'it takes input (field) and sends it (send)']]);
  assert.deepEqual(statesOwed({ component: 'Page', children: [{ component: 'rows' }] }, { context, catalog }).map((o) => o.state), ['empty'], 'a component made for a list');
});

test('Figma\'s default that leaves a component inert is said when the composition does not choose', () => {
  const catalog = { components: { input: { props: { Disabled: { type: 'enum', values: ['True', 'False'], default: 'True' }, State: { type: 'enum', values: ['Default', 'Error'], default: 'Default' } } } } };
  const view = { components: [{ name: 'input', cls: 'input', markup: '<input class="input">', controls: [{ label: 'Disabled', prop: 'Disabled', type: 'VARIANT', options: [] }, { label: 'State', prop: 'State', type: 'VARIANT', options: [] }] }] };
  const said = (ui) => checkPrototype(ui, { catalog, view, scales: { spacing: [], text: [] } }).findings.filter((f) => /Figma's default/.test(f.message)).map((f) => f.message);
  assert.deepEqual(said({ component: 'input', props: {} }), ['input is drawn Disabled=True, Figma\'s default for it: give it "Disabled" "False" unless the page shows it so']);
  assert.deepEqual(said({ component: 'input', props: { Disabled: 'True' } }), [], 'chosen');
});

test('a component its CSS makes fill its container fills the arrangement it is in', () => {
  const css = '.row { width: 100%; height: 40px }\n.empty, .other { flex: 1; }\n.btn { width: auto }\n.row .inner { width: 100% }';
  assert.equal(fillsWidth(css, 'row'), true);
  assert.equal(fillsWidth(css, 'empty'), true, 'flex: 1 grows it into the room left');
  assert.equal(fillsWidth(css, 'btn'), false);
  assert.equal(fillsWidth(css, 'inner'), false, 'a rule on a part, not the component\'s own class');
});

test('the page\'s own width is tried too, and its states are pictured at it', () => {
  assert.deepEqual(screenWidths([], { own: 400 }).map((w) => `${w.name} ${w.px}${w.own ? ' own' : ''}`), ['Phone 375', 'Its own 400 own', 'Tablet 768', 'Desktop 1280']);
  assert.deepEqual(screenWidths([], { own: 768 }).filter((w) => w.own).map((w) => w.name), ['Tablet'], 'a width already tried is the one');
  assert.equal(screenWidths([], { own: null }).length, 3);
});

test('the page\'s own accessibility findings are listed with their fix; the system\'s components\' own are one line for the audit', () => {
  const lines = a11yLines([
    { issue: 'group', selector: 'div.seg (role="radiogroup" with no name)', fix: 'give it "name": "<what it is for>" in its props', own: true },
    { issue: 'focusthin', selector: 'button', fix: 'x', own: false }, { issue: 'annotation', selector: 'a', fix: 'x', own: false }, { issue: 'annotation', selector: 'b', fix: 'x', own: false },
  ]);
  assert.deepEqual(lines, [
    '♿ ACCESSIBILITY OF THE DRAWN PAGE: 1 the page\'s own, 3 about the system\'s components',
    '   ⚠️  group: div.seg (role="radiogroup" with no name) (give it "name": "<what it is for>" in its props)',
    '   • the system\'s components themselves (focusthin, annotation ×2): for the audit (rms-design-system-engine --a11y), not this page',
  ]);
});

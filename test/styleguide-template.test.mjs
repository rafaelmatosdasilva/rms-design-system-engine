// The engine's default style guide: only what Figma and the code agree on, controls labelled with Figma's names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { agreedView, modeAxes, optionEffect, instanceMarkup, componentTokens, agreedTokens } from '../styleguide-data.mjs';
import { fixtureProject } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));

const propsSnap = {
  chip: { properties: { Size: { type: 'VARIANT', defaultValue: 'M', variantOptions: ['M', 'L'] }, Icon: { type: 'VARIANT', defaultValue: 'False', variantOptions: ['False', 'True'] }, 'Label#3:4': { type: 'TEXT', defaultValue: 'Filter' } }, annotations: [{ label: 'Role: togglebutton' }], description: 'A filter.' },
  button: { properties: { Disabled: { type: 'BOOLEAN', defaultValue: false }, Tone: { type: 'VARIANT', defaultValue: 'Primary', variantOptions: ['Primary', 'Quiet'] } } },
  field: { properties: { State: { type: 'VARIANT', defaultValue: 'Default', variantOptions: ['Default', 'Error'] } } },
};
const row = (component, figmaProp, codeProp, status, codeValue = '') => ({ component, figmaProp, codeProp, status, codeValue });

test('a prop both sides agree on is a control with Figma\'s label and the code\'s prop; the rest is only counted', () => {
  const rows = [row('chip', 'Size', 'size', 'match'), row('chip', 'Icon', 'icon', 'match'), row('chip', 'Label', 'label', 'match'), row('chip', 'not in Figma', 'pressed', 'extra'),
    row('button', 'Disabled', 'disabled', 'match'), row('button', 'Tone', 'variant', 'value')];
  const v = agreedView({ propsSnap, rows, classFor: (n) => `.${n}`, cssText: '.chip.chip--l{} .button{}', unbuilt: ['field'] });
  const chip = v.components.find((c) => c.name === 'chip');
  assert.equal(chip.cls, 'chip');
  assert.equal(chip.role, 'togglebutton');
  assert.deepEqual(chip.controls.map((c) => [c.label, c.prop, c.type]), [['Size', 'size', 'VARIANT'], ['Icon', 'icon', 'BOOLEAN'], ['Label', 'label', 'TEXT']]);
  assert.deepEqual(chip.controls[0].options, [{ label: 'M' }, { label: 'L', add: ['chip--l'], attrs: {} }]);   // a class only where the CSS has it
  assert.equal(chip.controls[1].part, 'svg, [class*="icon"]', 'a switch with no class shows or hides the part it names');
  const button = v.components.find((c) => c.name === 'button');
  assert.deepEqual(button.controls, [{ label: 'Disabled', prop: 'disabled', type: 'BOOLEAN', default: false, on: { add: [], attrs: { disabled: '' } }, at: 1 }]);   // Tone differs: not shown; Tone, a variant, leads Figma's order
  assert.equal(v.components.some((c) => c.name === 'field'), false, 'a component not built yet is not shown');
  assert.equal(v.notAgreed.differences, 2);   // the chip prop only the code has, the button's other default
  assert.equal(v.notAgreed.line, 'Left off this page until Figma and the code agree: 2 values where Figma and the code differ and 1 component the code does not have yet (field). Each one is on the Tasks page, with who does it and what to do.');
});

test('a recorded value that moved on one side is not agreed; nothing left says so', () => {
  const rows = [row('button', 'Disabled', 'disabled', 'match')];
  const moved = agreedView({ propsSnap: { button: propsSnap.button }, rows, agreedRecord: { facts: { 'button/height': { figma: '32px', code: '36px' } } } });
  assert.equal(moved.notAgreed.differences, 1);
  const clean = agreedView({ propsSnap: { button: { properties: { Disabled: propsSnap.button.properties.Disabled } } }, rows, agreedRecord: { facts: { 'button/height': { figma: '32px', code: '32px' } } } });
  assert.equal(clean.notAgreed.line, 'Figma and the code agree on everything this page shows.');
});

test('--styleguide with no template of the project\'s own builds the engine\'s, from the components that are built', { timeout: 300000 }, () => {
  const dir = fixtureProject(join(ENGINE, 'test', 'fixtures', 'tidepool-figma'), 'tp-sg-');
  const ref = join(ENGINE, 'test', 'skill-evals', 'build-reference');
  for (const p of ['src/styles/tokens.css', 'src/components/chip.css', 'src/components/Chip.jsx', 'src/components/tag.css', 'src/components/Tag.jsx']) { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), readFileSync(join(ref, p), 'utf8')); }
  const r = spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--styleguide', '--no-a11y-bake'], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Style guide → \.design-system-engine-out\/styleguide\/index\.html {2}\(2 components agreed · the engine's template\)/);
  assert.match(r.stdout, /components the code does not have yet \(button, field, disclosure and stepper\)/);
  assert.equal(existsSync(join(dir, 'component-prop-result.json')), false, 'the project is left as it was');
  const html = readFileSync(join(dir, '.design-system-engine-out/styleguide/index.html'), 'utf8');
  assert.doesNotMatch(html, /\{\{[A-Z_]+\}\}/, 'every marker filled');
  assert.match(html, /\.chip\.chip--l/, 'the component\'s own stylesheet is on the page');
  assert.match(html, /--chip-background/, 'and the tokens');
  const data = JSON.parse(html.match(/id="sg-data">([\s\S]*?)<\/script>/)[1]);
  assert.deepEqual(data.components.map((c) => c.name).sort(), ['chip', 'tag']);
  const tag = data.components.find((c) => c.name === 'tag');
  assert.equal(tag.markupFrom, 'jsx', 'no page shows it: drawn from its own React source');
  assert.equal(tag.markup, '<span class="tag">New</span>');
  assert.deepEqual(data.components.find((c) => c.name === 'tag').controls.find((c) => c.label === 'Tone').options, [{ label: 'Neutral' }, { label: 'Positive', add: ['tag--positive'], attrs: {} }]);
  assert.deepEqual(data.tokens.radii.map((t) => t.var), ['--radii-button', '--radii-chip', '--radii-field']);
  // Its theme sets [data-theme] on the root: the blocks nest (attrModeCSS), so each preview can be in either mode.
  assert.deepEqual(data.modes, [{ label: 'Mode', colour: true, values: [{ label: 'Light', value: 'light' }, { label: 'Dark', value: 'dark' }], attr: 'data-theme', scoped: true }]);
  assert.match(html, /Living style guide/);
});

test('what an option adds comes from the contract\'s selector: a class, an attribute, or a live state', () => {
  assert.deepEqual(optionEffect('.chip', '.chip.chip--l'), { add: ['chip--l'], attrs: {} });
  assert.deepEqual(optionEffect('.button', '.button:disabled'), { add: [], attrs: { disabled: '' } });
  assert.deepEqual(optionEffect('.tab', '.tab[aria-selected="true"]'), { add: [], attrs: { 'aria-selected': 'true' } });
  assert.deepEqual(optionEffect('.button', '.button:hover'), { live: true, state: 'hover' });
  assert.deepEqual(optionEffect('.field', '.field:not(.field--readonly):hover'), { live: true, state: 'hover' }, 'a class inside :not() is never added');
  assert.deepEqual(optionEffect('.button', '.button'), {});
  const v = agreedView({ propsSnap: { badge: { properties: { State: { type: 'VARIANT', defaultValue: 'neutral', variantOptions: ['neutral', 'positive'] } } } },
    rows: [row('badge', 'State', 'state', 'match')], classFor: () => '.badge', propertyMaps: { badge: { State: { neutral: '.badge.none', positive: '.badge.low' } } } });
  assert.deepEqual(v.components[0].controls[0].options, [{ label: 'neutral', add: ['none'], attrs: {} }, { label: 'positive', add: ['low'], attrs: {} }]);
});

test('the mode axes: colour from the config, size from the sizing collection, each named as Figma names its collection, nesting only where the CSS nests', () => {
  const vars = { modeVariants: { sizing: { modes: [{ name: 'Desktop', snapshotKey: 'desktop' }, { name: 'Phone', snapshotKey: 'phone' }], vars: { 'padding/m': { kind: 'scalar', values: { desktop: '12px', phone: '16px' } } } } } };
  assert.deepEqual(modeAxes({}, vars), [
    { label: 'Mode', colour: true, values: [{ label: 'Light', value: 'light' }, { label: 'Dark', value: 'dark' }], attr: 'data-color', scoped: true, media: '(prefers-color-scheme: dark)', mediaValue: 'dark', restValue: 'light' },
    { label: 'sizing', attr: 'data-size', scoped: true, values: [{ label: 'Desktop', value: '' }, { label: 'Phone', value: 'phone', notInCode: true }] },
  ]);
  assert.deepEqual(modeAxes({ figma: { colorCollection: 'Styling' } }, { modeVariants: { Sizing: vars.modeVariants.sizing } }).map((a) => a.label), ['Styling', 'Sizing'], 'never Color or Size: the collections\' own names');
  // A mode the code has CSS for (a [data-…] block, or an @media that sets the collection's variables) is drawn.
  assert.equal(modeAxes({}, vars, ':root[data-size="phone"] { --padding-m: 16px; }')[1].values[1].notInCode, undefined);
  const media = modeAxes({}, vars, ':root { --padding-m: 12px; } @media (max-width: 480px) { :root { --padding-m: 16px; } }')[1];
  assert.equal(media.values[1].notInCode, undefined);
  assert.deepEqual(media.values[0], { label: 'Desktop', value: 'desktop' }, 'a breakpoint mode makes the base a choice of its own');
  assert.deepEqual(media.changes, { phone: [{ name: 'padding/m', from: '12px', to: '16px' }] }, 'the switch says what the mode changes, from the code');
  assert.equal(media.media, '(max-width: 480px)', 'the page starts in the mode its own device or window gets');
  assert.deepEqual(modeAxes({ figma: { modes: [{ name: 'Day', cssSelector: 'root' }, { name: 'Night', cssSelector: 'class:night' }] } }), [{ label: 'Mode', colour: true, values: [{ label: 'Day', value: '' }, { label: 'Night', value: 'night' }], classes: true }]);
});

test('a component\'s real markup is the first instance in the project\'s own pages, without ids or handlers', () => {
  const page = '<script>var x = "<button class=\'cta\'>";</script><div id="app"><button id="go" class="cta big" onclick="go()"><svg></svg><span>Save</span></button><button class="cta">Two</button></div>';
  assert.equal(instanceMarkup(page, 'cta'), '<button class="cta big"><svg></svg><span>Save</span></button>');
  assert.equal(instanceMarkup('<label class="field">Name <input class="field__input"></label>', 'field'), '<label class="field">Name <input class="field__input"></label>');
  assert.equal(instanceMarkup('<div class="ctaX"></div>', 'cta'), null);
  assert.deepEqual(componentTokens('.cta { padding: var(--pad-m); color: var(--text) } .cta:hover { color: var(--text-hover) } .ctaX { color: var(--no) }', 'cta').map((t) => t.var), ['--pad-m', '--text', '--text-hover']);
});

test('every token a component is drawn with: its parts and states too, never another component\'s, colour first', async () => {
  const { allComponentTokens } = await import('../styleguide-data.mjs');
  const css = '.badge { padding: var(--p) var(--q); border-radius: var(--r); background: var(--b-bg); --own: var(--no) } .badge-label { color: var(--b-fg); font-size: var(--fs) } .badge__icon { box-shadow: var(--sh) } .badge:hover { border: var(--line) solid var(--b-line) } .badge-list { gap: var(--g) } .badgeX { color: var(--nope) }';
  const got = allComponentTokens(css, 'badge', ['badge-list']);
  assert.deepEqual(got.map((t) => t.var), ['--b-bg', '--b-fg', '--fs', '--p', '--q', '--r', '--line', '--b-line', '--sh']);
  assert.deepEqual(got.find((t) => t.var === '--b-line').props, ['border']);
});

test('tokens are shown only when equal to Figma in every mode, grouped like the system names them', () => {
  const check = { passVars: [
    { dimension: 'color', token: 'surface/page/color', cssVar: '--surface-page', mode: 'light', value: '#fff' },
    { dimension: 'color', token: 'surface/page/color', cssVar: '--surface-page', mode: 'dark', value: '#000' },
    { dimension: 'color', token: 'text/primary/color', cssVar: '--text-primary', mode: 'light', value: '#111' },
    { dimension: 'sizing', token: 'gap/s', cssVar: '--gap-s', value: '4px' }, { dimension: 'sizing', token: 'radii/card', cssVar: '--radii-card', value: '8px' },
    { dimension: 'sizing', token: 'stroke/default', cssVar: '--stroke-default', value: '1px' },
    // What a sizes collection holds that is not a length: never a space, a radius or a size.
    { dimension: 'sizing', token: 'base/gap/color', cssVar: '--base-gap-color', value: '#0037FA' }, { dimension: 'sizing', token: 'base/padding/fontFamily', cssVar: '--base-padding-fontFamily', value: 'inter' },
    { dimension: 'sizing', token: 'base/spacing/weight', cssVar: '--base-spacing-weight', value: '500' },
    { dimension: 'typography', token: 'm/size', cssVar: '--m-size', value: '14px' }], fail: [{ token: 'x' }] };
  const vars = { color: { light: { 'surface/page/color': '#fff', 'text/primary/color': '#111' }, dark: { 'surface/page/color': '#000', 'text/primary/color': '#eee' } } };
  const t = agreedTokens(check, vars);
  assert.deepEqual(t.colors, [{ group: 'surface', items: [{ figma: 'surface/page', var: '--surface-page', values: { light: '#fff', dark: '#000' } }] }], 'text/primary differs in dark: not shown');
  assert.deepEqual([t.spacing.length, t.radii.length, t.sizing.length], [1, 1, 1]);
  assert.deepEqual(t.typography, [{ scale: 'm', size: { var: '--m-size', value: '14px' } }]);
  assert.equal(t.differences, 1);
});

test('F8: a token\'s description in Figma travels to the token panel; one with none says so', () => {
  const check = { passVars: [{ dimension: 'color', token: 'surface/page/color', cssVar: '--surface-page', mode: 'light', value: '#fff' }, { dimension: 'sizing', token: 'gap/s', cssVar: '--gap-s', value: '4px' }] };
  const vars = { color: { light: { 'surface/page/color': '#fff' } }, tokenMeta: { 'surface/page': { description: 'The page behind everything' }, 'gap/s': { description: 'Between small items' } } };
  const t = agreedTokens(check, vars);
  assert.equal(t.colors[0].items[0].description, 'The page behind everything');
  assert.equal(t.spacing[0].description, 'Between small items');
  assert.equal('description' in agreedTokens(check, { color: vars.color }).colors[0].items[0], false);
  const tpl = readFileSync(new URL('../templates/styleguide.template.html', import.meta.url), 'utf8');
  assert.match(tpl, /'<div><dt>What it is for<\/dt><dd><p>' \+ esc\(t\.description\)/);
  assert.match(tpl, /t\.figma && !t\.primitive \? '<div><dt>What it is for<\/dt><dd><p class="pg-missing">Not written yet\.<\/p>/);
});

test('--component with --styleguide: that component audited first, then its own page beside the whole one, its address printed', { timeout: 600000 }, () => {
  const dir = fixtureProject(join(ENGINE, 'test', 'fixtures', 'demo-ds'), 'demo-sgc-');
  const r = spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--component', 'button', '--styleguide', '--no-a11y-bake'], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const out = r.stdout + r.stderr;
  assert.match(out, /Auditing button, then building the style guide\./);
  assert.match(out, /scope|button/i, 'the scoped audit ran');
  assert.ok(existsSync(join(dir, '.design-system-engine-out', 'census.json')), 'the audit wrote its results');
  assert.match(out, /button: \.design-system-engine-out\/styleguide\/button\.html#c-button/);
});

test('the demo design system: its real markup from its page, and props named differently stay out', { timeout: 300000 }, () => {
  const dir = fixtureProject(join(ENGINE, 'test', 'fixtures', 'demo-ds'), 'demo-sg-');
  const r = spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--styleguide', '--no-a11y-bake'], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const data = JSON.parse(readFileSync(join(dir, '.design-system-engine-out/styleguide/index.html'), 'utf8').match(/id="sg-data">([\s\S]*?)<\/script>/)[1]);
  const button = data.components.find((c) => c.name === 'button');
  assert.equal(button.markupFrom, 'page');
  assert.equal(button.markup, '<button class="tp-button" type="button">Save</button>');
  assert.deepEqual(button.controls, [], 'Disabled is "disabled" in the code: a difference to decide, not a control');
  assert.match(data.notAgreed.line, /where Figma and the code differ/);
});

test('in the browser: no script error, a control changes the real component, the tokens behind it are named', { timeout: 300000 }, async (t) => {
  const { findChrome, launchChrome, connectCDP, openPage, waitForTrue, FILE_PAGE_LOADED } = await import('../cdp.mjs');
  const chromePath = findChrome({ playwright: true });
  if (!chromePath || typeof WebSocket === 'undefined') { t.skip('no Chrome'); return; }
  const dir = fixtureProject(join(ENGINE, 'test', 'fixtures', 'tidepool-figma'), 'tp-sg-');
  const ref = join(ENGINE, 'test', 'skill-evals', 'build-reference');
  for (const p of ['src/styles/tokens.css', 'src/components/chip.css', 'src/components/Chip.jsx', 'src/components/button.css', 'src/components/Button.jsx']) { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), readFileSync(join(ref, p), 'utf8')); }
  // A Figma note on the chip that no check reads: a row of its own on its Accessibility area, read by the To do page too.
  const propsSnap = join(dir, 'src', 'figma', 'figma-component-props.snapshot.json'), snap = JSON.parse(readFileSync(propsSnap, 'utf8'));
  snap.chip.annotations.push({ label: 'Screen readers announce the hint after the label' }); writeFileSync(propsSnap, JSON.stringify(snap));
  // The system's own script, as a product runs it: a moment after a button is drawn it gives it a fuller name. Its focus
  // ring is drawn on ::after. The page measures each variant once the script has answered, and reads the ring there.
  writeFileSync(join(dir, 'src', 'components', 'system.js'), "new MutationObserver(() => Promise.resolve().then(() => { for (const b of document.querySelectorAll('.button:not([aria-label])')) b.setAttribute('aria-label', 'Save now'); })).observe(document.body, { subtree: true, childList: true });");
  writeFileSync(join(dir, 'src', 'components', 'button.css'), readFileSync(join(dir, 'src', 'components', 'button.css'), 'utf8') + "\n.button { position: relative; }\n.button:focus-visible { outline: none; }\n.button::after { content: ''; position: absolute; inset: -3px; border-radius: inherit; }\n.button:focus-visible::after { outline: 2px solid var(--button-background); }\n");
  const cfg0 = JSON.parse(readFileSync(join(dir, 'ds-config.json'), 'utf8'));
  writeFileSync(join(dir, 'ds-config.json'), JSON.stringify({ ...cfg0, systemScripts: ['src/components/system.js'] }));
  // A Figma image of one variant, named as Figma names it, and a file that is not a variant name (left out).
  const shot = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  mkdirSync(join(dir, '.design-system-engine-refs', 'components', 'chip'), { recursive: true });
  writeFileSync(join(dir, '.design-system-engine-refs', 'components', 'chip', 'Size=L.png'), shot);
  writeFileSync(join(dir, '.design-system-engine-refs', 'components', 'chip', 'notes.png'), shot);
  // Do and Don't pictures, each named for its caption.
  for (const [kind, cap] of [['do', 'One filter per chip'], ['dont', 'A sentence in a chip']]) { mkdirSync(join(dir, '.design-system-engine-refs', 'components', 'chip', kind), { recursive: true }); writeFileSync(join(dir, '.design-system-engine-refs', 'components', 'chip', kind, `${cap}.png`), shot); }
  // What a person checked by hand (G5): one as chip is now, one recorded before chip changed.
  spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--checked', 'chip', '1.3.3', '--by', 'Ana'], { cwd: dir, encoding: 'utf8' });
  const ckFile = join(dir, 'design-system-engine-checked.json'), ck = JSON.parse(readFileSync(ckFile, 'utf8'));
  ck.checks.push({ component: 'chip', sc: '3.3.7', by: 'Ana', at: '2026-09-01T10:00:00.000Z', signature: 'before' }); writeFileSync(ckFile, JSON.stringify(ck));
  // A component the team retired (K12), still drawn in a page of the system, by its script and in its notes.
  writeFileSync(join(dir, 'contract.authored.json'), JSON.stringify({ components: { button: { status: 'deprecated', supersededBy: 'chip', since: '2.0' } } }));
  mkdirSync(join(dir, 'src', 'pages'), { recursive: true });
  writeFileSync(join(dir, 'src', 'pages', 'Home.jsx'), "import { Button } from '../components/Button';\nexport const Home = () => <Button Label=\"Save\" />;\n");
  // What the last audit found the chip drawing otherwise than Figma (A9): an Effect row of its Parity. The page runs with
  // it as with any other row (a row built in the wrong place once stopped the page's script, and its build with it).
  mkdirSync(join(dir, '.design-system-engine-out'), { recursive: true });
  writeFileSync(join(dir, '.design-system-engine-out', 'effects.json'), JSON.stringify({ findings: [{ component: 'chip', part: null, what: 'shadow offset', figma: 'draws a shadow 0 4', code: 'draws a shadow 0 2', at: 'src/components/chip.css:1', side: 'code', message: 'chip shadow offset' }] }));
  const built = spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--styleguide'], { cwd: dir, encoding: 'utf8' });
  assert.doesNotMatch(built.stdout + built.stderr, /script stopped|The page threw/, 'the page runs with an Effect row');
  const c = await launchChrome(chromePath);
  try {
    const { send, on, close } = await connectCDP(c.wsUrl);
    const errors = []; on('Runtime.exceptionThrown', (p) => errors.push(p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text));
    const { sessionId } = await openPage(send, `file://${join(dir, '.design-system-engine-out/styleguide/index.html')}`);
    await waitForTrue(send, sessionId, FILE_PAGE_LOADED);
    const run = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true }, sessionId)).result.value;
    // Each state read once it is reached, never after a fixed time: the page keeps trying variants while it changes, and
    // a busy machine is slower than a quiet one (E17).
    const until = async (expr, ok) => { let v; for (let n = 0; n < 60; n++) { v = await run(expr); if (ok(v)) break; await new Promise((r) => setTimeout(r, 100)); } return v; };
    const shownIs = (id) => until(`[...document.querySelectorAll('main > section')].filter((s) => !s.hidden).map((s) => s.id).join()`, (v) => v === id);
    // One view at a time: the overview, with each component's thumbnail, and a component drawn when it is opened.
    assert.equal(await run(`document.querySelectorAll('main > section[id^="c-"]').length`), 0, 'no component drawn before it is opened');
    assert.equal(await run(`[...document.querySelectorAll('main > section')].filter((s) => !s.hidden).map((s) => s.id).join()`), 'overview');
    assert.equal(await run(`!!document.querySelector('a.sg-card[href="#c-chip"] .sg-thumb .chip')`), true, 'the card shows the component itself');
    await run(`location.hash = '#c-chip'`);
    assert.equal(await shownIs('c-chip'), 'c-chip');
    await until(`document.querySelectorAll('.pg-preview').length`, (v) => v === 1);
    assert.equal(await run(`document.querySelectorAll('.pg-preview').length`), 1);
    assert.equal(await run(`document.querySelector('#c-chip .pg-preview .chip').getBoundingClientRect().height`), 24);
    await run(`[...document.querySelectorAll('#c-chip .pg-ctl button')].find((b) => b.textContent === 'L').click()`);
    assert.equal(await run(`document.querySelector('#c-chip .pg-preview .chip').classList.contains('chip--l')`), true);
    // The tokens behind what is drawn follow the control just set; every token it has is in Parity, not here.
    assert.match(await run(`document.querySelector('#c-chip .pg-tokens').textContent`), /--chip-background/);
    assert.equal(await run(`document.querySelectorAll('#c-chip [data-area="play"] .pg-own').length`), 0, 'no Its tokens table');
    // The code a product writes for what is shown: its own tag, the prop just set, a default left out; copied by the
    // system's own button.
    assert.equal(await run(`document.querySelector('#c-chip .pg-code code').textContent`), '<Chip Size="L" />');
    assert.equal(await run(`document.querySelector('#c-chip .pg-code [data-copy]').tagName`), 'BUTTON');
    // Inspect sits in the bar above the stage, not with the props.
    assert.equal(await run(`[...document.querySelectorAll('#c-chip .pg-actions button')].map((b) => b.textContent).filter((x) => /Inspect|specs/i.test(x)).join()`), '');
    assert.equal(await run(`[...document.querySelectorAll('#c-chip .pg-stage-bar--top .pg-stage-tools button')].map((b) => b.textContent).join()`), 'Inspect');
    assert.equal(await run(`document.querySelectorAll('#c-chip .pg-preview [data-hit]').length`), 0);
    // No Full width button: the preview card keeps its layout.
    assert.equal(await run(`[...document.querySelectorAll('#c-chip .pg-actions button')].some((b) => b.textContent === 'Full width')`), false);
    // Width: a chosen width draws it in a frame of that width with the page's own stylesheets; Fit brings the live
    // preview back.
    await run(`document.querySelector('#c-chip .pg-width [data-v="phone"]').click()`);
    assert.equal(await run(`document.querySelector('#c-chip .pg-preview').hidden`), true);
    assert.equal(await run(`document.querySelector('#c-chip .pg-frame iframe').style.width`), '375px');
    assert.equal(await run(`(() => { const d = document.querySelector('#c-chip .pg-frame iframe').contentDocument; const e = d.querySelector('.pg-frame-stage .chip'); return !!e && d.defaultView.getComputedStyle(e).height; })()`), '32px', 'styled by the system in the frame, at the size set (L)');
    assert.match(await run(`document.querySelector('#c-chip .pg-frame-label').textContent`), /Phone.*375px wide/);
    await run(`document.querySelector('#c-chip .pg-width [data-v="fit"]').click()`);
    assert.equal(await run(`document.querySelector('#c-chip .pg-frame').hidden + '|' + document.querySelector('#c-chip .pg-preview').hidden`), 'true|false');
    // A link to the variant: the props set away from their defaults in the address, kept as they change, and a link
    // opened sets them, the controls following.
    assert.equal(await run(`location.hash`), '#c-chip?Size=L');
    assert.equal(await run(`[...document.querySelectorAll('#c-chip .pg-actions button')].some((b) => b.textContent === 'Copy link')`), false, 'no Copy link button: the address bar holds the link');
    await run(`location.hash = '#overview'`); await shownIs('overview');
    await run(`[...document.querySelectorAll('#c-chip .pg-ctl button')].find((b) => b.textContent === 'M').click()`);
    assert.equal(await run(`location.hash`), '#overview', 'a view not shown leaves the address alone');
    await run(`location.hash = '#c-chip?Size=L&Nope=1'`); await shownIs('c-chip');
    await until(`!!document.querySelector('#c-chip .pg-preview .chip.chip--l')`, (v) => v === true);
    assert.equal(await run(`document.querySelector('#c-chip .pg-preview .chip').classList.contains('chip--l') + '|' + [...document.querySelectorAll('#c-chip .pg-ctl button')].find((b) => b.textContent === 'L').getAttribute('aria-pressed')`), 'true|true');
    // Figma beside the code: the image of the variant set (Size=L), beside a still copy of it, or over it with a slider;
    // a variant Figma has no image of says so.
    const figmaBtn = `[...document.querySelectorAll('#c-chip .pg-actions button')].find((b) => b.textContent === 'Figma')`;
    await run(`${figmaBtn}.click()`);
    for (let i = 0; i < 40 && !(await run(`!!document.querySelector('#c-chip .pg-compare img')`)); i++) await new Promise((r) => setTimeout(r, 50));
    assert.equal(await run(`document.querySelector('#c-chip .pg-compare').hidden + '|' + document.querySelectorAll('#c-chip .pg-compare img').length + '|' + !!document.querySelector('#c-chip .pg-compare .chip[inert]')`), 'false|1|true');
    await run(`[...document.querySelectorAll('#c-chip .pg-compare-bar [data-v]')].find((b) => b.dataset.v === 'over').click()`);
    assert.equal(await run(`!document.querySelector('#c-chip .pg-compare-amount').hidden && /inset\\(0px? 50%/.test(document.querySelector('#c-chip .pg-compare-img').style.clipPath)`), true);
    await run(`[...document.querySelectorAll('#c-chip .pg-ctl button')].find((b) => b.textContent === 'M').click()`);
    for (let i = 0; i < 40 && !(await run(`/no image of this variant/.test(document.querySelector('#c-chip .pg-compare').textContent)`)); i++) await new Promise((r) => setTimeout(r, 50));
    assert.match(await run(`document.querySelector('#c-chip .pg-compare').textContent`), /Figma has no image of this variant yet \(it has 1\)/);
    await run(`${figmaBtn}.click()`);
    await run(`[...document.querySelectorAll('#c-chip .pg-ctl button')].find((b) => b.textContent === 'L').click()`);
    // A token's name opens a panel in place: its value, the components that use it and a copy button; the page stays where
    // it is, and Escape closes it, the focus back on the name.
    await run(`[...document.querySelectorAll('#c-chip .pg-areas [data-v]')].find((b) => b.dataset.v === 'parity').click()`);
    const tokenBtn = `document.querySelector('#c-chip .pg-par .sg-token-link[data-token="--chip-background"]')`;
    const hashBefore = await run(`location.hash`);
    await run(`${tokenBtn}.click()`);
    assert.equal(await run(`${tokenBtn}.getAttribute('aria-expanded') + '|' + document.querySelector('.sg-token-pop').hidden + '|' + location.hash`), 'true|false|' + hashBefore);
    assert.match(await run(`document.querySelector('.sg-token-pop').textContent`), /--chip-background.*Used by.*chip.*Copy --chip-background/s);
    assert.equal(await run(`document.activeElement === document.querySelector('.sg-token-pop')`), true);
    await run(`document.querySelector('.sg-token-pop').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
    assert.equal(await run(`document.querySelector('.sg-token-pop').hidden + '|' + (document.activeElement === ${tokenBtn})`), 'true|true');
    // The full view of what uses a token stays at its address.
    await run(`location.hash = '#uses?t=--chip-background'`); await shownIs('uses');
    await until(`document.getElementById('uses').textContent`, (v) => /Used by/.test(v));
    assert.match(await run(`document.getElementById('uses').textContent`), /--chip-background.*One component uses it.*Used by.*chip/s);
    await run(`location.hash = '#c-chip?Size=L'`); await shownIs('c-chip');
    // Its API read from Chip.jsx, and its accessibility: the role's obligations with their WCAG criterion, the text
    // contrast measured as drawn, and no browser check yet.
    assert.match(await run(`document.querySelector('#c-chip [data-area="docs"] .pg-footer').textContent`), /Props.*Label.*default Filter.*Read from src\/components\/Chip\.jsx/s);
    // Every variant tried in the browser when the Accessibility area shows, whatever the Playground has set, as Parity
    // lists everything: the chip's Size, Icon and pressed sides, each check said once with the variants it holds in.
    await run(`[...document.querySelectorAll('#c-chip .pg-areas [data-v]')].find((b) => b.dataset.v === 'a11y').click()`);
    const a11y = await run(`document.querySelector('#c-chip .pg-a11y').textContent`);
    // One table by WCAG criterion, in the Playground's card, the same table as Parity's and the To do page's: the issue
    // number, the area with the criterion, what Figma states, what was found, what to do with who acts, the status with
    // when and where it was read; a count above it and when the audit last ran. Only what applies. No separate table of
    // sources.
    assert.match(a11y, /Task nr.*WCAG criterion.*Figma states.*Found.*What to do.*Status/);
    assert.doesNotMatch(a11y, /What it means|Where it is read from/);
    assert.ok(await run(`!!document.querySelector('#c-chip .pg-a11y .pg-par-card .pg-par-table')`), 'in a card table');
    // What a criterion means opens from its name, by a click (the focus in it, Escape gives it back) or a rest of the pointer.
    const tip = `[...document.querySelectorAll('#c-chip .pg-wcag-tip')].find((b) => /^2\.1\.1/.test(b.textContent))`;
    const popOpen = /^false\|WCAG 2\.1\.1 Keyboard \(A\)What it means.*How it is checked/;
    await run(`${tip}.click()`);
    assert.match(await until(`document.querySelector('.sg-token-pop').hidden + '|' + document.querySelector('.sg-token-pop').textContent`, (v) => popOpen.test(v)), popOpen);
    await run(`document.querySelector('.sg-token-pop').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
    assert.equal(await until(`document.querySelector('.sg-token-pop').hidden + '|' + (document.activeElement === ${tip})`, (v) => v === 'true|true'), 'true|true');
    assert.match(a11y, /2\.1\.1 Keyboard \(A\)/);
    assert.match(a11y, /a <button type="button"> with aria-pressed/);
    assert.match(a11y, /1\.4\.3 Contrast \(Minimum\) \(AA\).*Text (at least )?\d+\.\d:1|\d+\.\d:1 on .* variants and colour modes/s);
    assert.match(a11y, /The audit has not run in a browser yet/);
    assert.match(await run(`document.querySelector('#c-chip .pg-a11y-sum').textContent`), /\d+ done/);
    assert.equal(await run(`[...document.querySelectorAll('#c-chip .pg-a11y tbody tr')].every((r) => /^(done|todo|check|none)$/.test(r.dataset.status) && r.querySelector('.pg-par-sign'))`), true);
    // The page tries the keyboard on every variant after it is drawn: wait for that result (its 2.1.1 row says what Tab
    // reached), never for a fixed time, so a busy machine reads it as a quiet one does (E17).
    let live = '';
    for (let i = 0; i < 240 && !(/Tab reaches it once: "Filter"\..*In all \d+ variants\./.test(live) && /Given by the browser: Space flips aria-pressed/.test(live)); i++) {
      if (i) await new Promise((r) => setTimeout(r, 250));
      live = await run(`document.querySelector('#c-chip .pg-a11y-rows').textContent`);
    }
    assert.match(live, /Tab reaches it once: "Filter"\..*In all \d+ variants\./);
    assert.match(live, /Given by the browser: Space flips aria-pressed/, 'a native button answers Space itself');
    assert.match(live, /The style guide, in the browser/, 'each finding says where it comes from');
    // What a person checks names the component and the part it is about.
    assert.match(live, /On chip, its (\w+ part|text)[^.]*, a person checks that/);
    // Each area has its own address, to send someone to it.
    assert.match(await run(`location.hash`), /^#c-chip\/accessibility/);
    // What it does when used is tried on a few variants after that, one at a time: then the Playground is drawn as set.
    for (let i = 0; i < 120 && await run(`!!document.querySelector('#c-chip .pg-offstage')`); i++) await new Promise((r) => setTimeout(r, 250));
    assert.equal(await run(`document.querySelector('#c-chip .pg-preview .chip').classList.contains('chip--l')`), true, 'the variant is as set after the tries');
    assert.equal(await run(`document.querySelector('#c-chip [data-area="play"]').hidden`), true, 'the Playground stays out of sight');
    // Another page mode: what was tried in every colour mode while the page was built stands, with its ratio.
    await run(`document.querySelector('#mode-controls [data-v="dark"]').click()`);   // Auto comes first
    assert.equal(await run(`document.documentElement.getAttribute('data-theme')`), 'dark');
    await run(`[...document.querySelectorAll('#c-chip .pg-areas [data-v]')].find((b) => b.dataset.v === 'play').click()`);
    await run(`[...document.querySelectorAll('#c-chip .pg-areas [data-v]')].find((b) => b.dataset.v === 'a11y').click()`);
    assert.match(await run(`[...document.querySelectorAll('#c-chip .pg-a11y-rows tr')].find((r) => /1\.4\.3 Contrast/.test(r.cells[1].textContent)).textContent`), /\d+\.\d:1.*(Done|To fix)/s, 'measured again in the other mode');
    await run(`[...document.querySelectorAll('#c-chip .pg-areas [data-v]')].find((b) => b.dataset.v === 'play').click()`);
    // The tokens first, the code on their right, as tall as what it holds and never taller than the tokens.
    assert.equal(await run(`!!document.querySelector('#c-chip .pg-code-row > :first-child .pg-tokens') && document.querySelector('#c-chip .pg-code-row > :last-child').classList.contains('pg-code')`), true);
    assert.equal(await run(`(() => { const c = document.querySelector('#c-chip .pg-code'), t = document.querySelector('#c-chip .pg-tokens').closest('.pg-inspect'); return Math.abs(c.offsetTop - t.offsetTop) > 2 || (c.offsetHeight <= t.offsetHeight + 1 && c.offsetHeight < t.offsetHeight - 2); })()`), true, 'one line of code is not stretched to the tokens');
    // The page in areas, one at a time, switched with the system's own control; the chosen one stays for the next view.
    // Built with only where the component is made of others (the chip is not).
    assert.equal(await run(`[...document.querySelectorAll('#c-chip .pg-areas [data-v]')].map((b) => b.textContent.split(',')[0]).join()`), 'Playground,Variants,Documentation,Motion,Accessibility,Parity,Used in,Changelog', 'Specs is part of the Playground, not an area of its own');
    assert.equal(await run(`[...document.querySelectorAll('#c-chip .pg-area')].filter((a) => !a.hidden).map((a) => a.dataset.area).join()`), 'play');
    await run(`[...document.querySelectorAll('#c-chip .pg-areas [data-v]')].find((b) => b.dataset.v === 'parity').click()`);
    assert.equal(await run(`[...document.querySelectorAll('#c-chip .pg-area')].filter((a) => !a.hidden).map((a) => a.dataset.area).join()`), 'parity');
    // Parity: one table of everything the chip has (props, variables, values), Figma beside code, what to do, a status and
    // when, the same table as the Accessibility area's and the To do page's.
    const parRows = await run(`[...document.querySelectorAll('#c-chip .pg-par-table tbody tr')].map((r) => r.dataset.type + ':' + r.dataset.status)`);
    assert.ok(parRows.some((r) => /^Prop:/.test(r)) && parRows.some((r) => /^Variable:/.test(r)), 'props and variables: ' + parRows);
    const parityText = await run(`document.querySelector('#c-chip [data-area="parity"]').textContent`);
    assert.match(parityText, /Parity.*Task nr.*Type.*Figma.*Code.*What to do.*Status.*Updated/s);
    assert.doesNotMatch(parityText, /Of \d+, \d+ the same/, 'no line counting what is the same, what differs and what is on one side');
    assert.deepEqual(await run(`[...document.querySelectorAll('#c-chip [data-area="parity"] tr[data-status="done"]')].filter((tr) => /Same/.test(tr.lastElementChild.textContent)).length`), 0, 'a row that is done says nothing more under Done');
    // The filter shows one type at a time.
    await run(`[...document.querySelectorAll('#c-chip .pg-par-filter [data-v]')].find((b) => b.dataset.v === 'Prop').click()`);
    // The filter acts on Parity's own table, never on the Accessibility tables beside it.
    assert.deepEqual(await run(`[...new Set([...document.querySelector('#c-chip .pg-par-filter').closest('.pg-par').querySelectorAll('.pg-par-table tbody tr')].filter((r) => !r.hidden).map((r) => r.dataset.type))]`), ['Prop']);
    assert.equal(await run(`[...document.querySelectorAll('#c-chip .pg-a11y tbody tr')].some((r) => r.hidden)`), false);
    await run(`[...document.querySelectorAll('#c-chip .pg-par-filter [data-v]')].find((b) => b.dataset.v === 'all').click()`);
    // Inspect: the Playground turns into its anatomy (an inert copy at the Playground's size, as the controls set it, each part, padding
    // and gap outlined, never filled with a colour); a click on one says in one line what it is and its value; again
    // puts the live component back.
    await run(`[...document.querySelectorAll('#c-chip .pg-areas [data-v]')].find((b) => b.dataset.v === 'play').click()`);
    assert.equal(await run(`document.querySelector('#c-chip .pg-anatomy').hidden`), true, 'off until asked for');
    const liveH = await run(`document.querySelector('#c-chip .pg-preview .chip').getBoundingClientRect().height`);
    await run(`document.querySelector('#c-chip .pg-stage-tools button').click()`);
    // Drawn on the next frame: waited for, as a busy machine can take longer than a fixed pause.
    for (let i = 0; i < 60 && !(await run(`document.querySelectorAll('#c-chip .pg-anat-space').length`)); i++) await new Promise((r) => setTimeout(r, 50));
    assert.equal(await run(`document.querySelector('#c-chip .pg-stage-tools button').getAttribute('aria-pressed') + '|' + document.querySelector('#c-chip .pg-preview').hidden`), 'true|true', 'the inspector in the live component\'s place');
    assert.ok(await run(`document.querySelectorAll('#c-chip .pg-anat-space').length`) >= 2);
    assert.equal(await run(`[...document.querySelectorAll('#c-chip .pg-anat-marks > *')].every((m) => { const b = getComputedStyle(m).backgroundColor; return m.classList.contains('pg-anat-num') || b === 'rgba(0, 0, 0, 0)'; })`), true, 'no colour fills on the drawing');
    assert.equal(await run(`document.querySelector('#c-chip .pg-anatomy .chip').closest('[inert]') !== null`), true, 'the copy is inert and hidden from assistive technology');
    assert.equal(await run(`document.querySelector('#c-chip .pg-anatomy .chip').getBoundingClientRect().height`), liveH, 'drawn at the size the Playground draws it');
    assert.match(await run(`document.querySelector('#c-chip .pg-anat-line').textContent`), /Click a part, a padding or a gap/);
    await run(`(() => { const m = [...document.querySelectorAll('#c-chip .pg-anat-marks [data-hit]')].find((x) => /^chip padding/.test(x.dataset.hit)); m.scrollIntoView({ block: 'center' }); const r = m.getBoundingClientRect(); document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2).click(); })()`);
    assert.match(await run(`document.querySelector('#c-chip .pg-anat-line').textContent`), /^chip padding \w+ {2}· {2}--padding-[a-z]+/, 'one line: what it is and its value');
    assert.equal(await run(`document.querySelectorAll('#c-chip .pg-anat-marks .is-picked').length`), 1);
    await run(`[...document.querySelectorAll('#c-chip .pg-anat-marks [data-hit]')].find((x) => /^part 1/.test(x.dataset.hit)).dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
    assert.match(await run(`document.querySelector('#c-chip .pg-anat-line').textContent`), /color.*--chip-text/, 'the label: its colour');
    // Picked: it stands out, the other boxes faded around it.
    assert.equal(await run(`(() => { const ms = document.querySelector('#c-chip .pg-anat-marks'), other = [...ms.querySelectorAll('[data-hit]')].find((x) => !x.classList.contains('is-picked')); return ms.classList.contains('has-pick') + '|' + getComputedStyle(other).opacity; })()`), 'true|0.3');
    // Nested: the component itself picked, what sits inside it is drawn as parts too, one level down, and a click on
    // one names the path to it.
    await run(`document.querySelector('#c-chip .pg-anat-marks [data-hit^="part 0 "]').dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
    const nested = await run(`[...document.querySelectorAll('#c-chip .pg-anat-marks .is-nested')].map((x) => x.dataset.hit)`);
    assert.ok(nested.length && nested.every((k) => /^part 0 chip > \d+ /.test(k)), 'the parts inside it: ' + nested);
    await run(`document.querySelector('#c-chip .pg-anat-marks .is-nested').dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
    assert.match(await run(`document.querySelector('#c-chip .pg-anat-line').textContent`), /^chip › /, 'the path to what is picked');
    // A click on the stage outside the component lets go of what is picked.
    await run(`document.querySelector('#c-chip .pg-anatomy').dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
    assert.equal(await run(`document.querySelectorAll('#c-chip .pg-anat-marks .is-picked').length + '|' + document.querySelector('#c-chip .pg-anat-marks').classList.contains('has-pick')`), '0|false');
    // A mode switched while inspecting reaches the drawing: the inspector carries the Playground's modes.
    const tplSrc = readFileSync(join(ENGINE, 'templates', 'styleguide.template.html'), 'utf8');
    assert.match(tplSrc, /SGModes\.controls\(preview, function \(\) \{ refresh\(\); if \(inspecting\) requestAnimationFrame\(drawAnatomy\); \}/);
    assert.match(tplSrc, /else if \(preview\.hasAttribute\(a\.attr\)\) anatBox\.setAttribute\(a\.attr, preview\.getAttribute\(a\.attr\)\)/);
    // A control changed in the Playground redraws the specs under it.
    const before = await run(`document.querySelector('#c-chip .pg-anatomy .chip').className`);
    await run(`[...document.querySelectorAll('#c-chip .pg-ctl button')].find((b) => b.textContent === 'M').click()`);
    for (let i = 0; i < 60 && (await run(`document.querySelector('#c-chip .pg-anatomy .chip').className`)) === before; i++) await new Promise((r) => setTimeout(r, 50));
    assert.notEqual(await run(`document.querySelector('#c-chip .pg-anatomy .chip').className`), before, 'the inspector follows the control');
    await run(`[...document.querySelectorAll('#c-chip .pg-ctl button')].find((b) => b.textContent === 'L').click()`);
    // A text typed in the Playground is in the specs too.
    await run(`(() => { const f = [...document.querySelectorAll('#c-chip .pg-ctl')].find((c) => c.querySelector('.pg-ctl-label').textContent.startsWith('Label')).querySelector('input'); f.value = 'Typed words'; f.dispatchEvent(new Event('input')); })()`);
    for (let i = 0; i < 60 && !/Typed words/.test(await run(`document.querySelector('#c-chip .pg-anatomy').textContent`)); i++) await new Promise((r) => setTimeout(r, 50));
    assert.match(await run(`document.querySelector('#c-chip .pg-anatomy').textContent`), /Typed words/, 'the inspector follows a text typed');
    // A Width chosen while inspecting: the anatomy is drawn at that width, never beside the width's frame.
    await run(`[...document.querySelectorAll('#c-chip .pg-width [data-v]')].find((b) => b.dataset.v === 'phone').click()`);
    for (let i = 0; i < 60 && (await run(`(document.querySelector('#c-chip .pg-anat-wrap') || {}).style?.width || ''`)) !== '375px'; i++) await new Promise((r) => setTimeout(r, 50));
    assert.equal(await run(`['.pg-preview', '.pg-frame', '.pg-anatomy'].map((q) => getComputedStyle(document.querySelector('#c-chip ' + q)).display).join() + '|' + document.querySelector('#c-chip .pg-anat-wrap').style.width`), 'none,none,flex|375px');
    await run(`[...document.querySelectorAll('#c-chip .pg-width [data-v]')].find((b) => b.dataset.v === 'fit').click()`);
    // Done inspecting: the live component back in its place.
    await run(`document.querySelector('#c-chip .pg-stage-tools button').click()`);
    assert.equal(await run(`document.querySelector('#c-chip .pg-preview').hidden + '|' + document.querySelector('#c-chip .pg-anatomy').hidden + '|' + document.querySelector('#c-chip .pg-stage-tools button').textContent`), 'false|true|Inspect');
    assert.equal(await run(`getComputedStyle(document.querySelector('#c-chip .pg-anatomy')).display + '|' + document.querySelector('#c-chip .pg-anatomy').childElementCount`), 'none|0', 'nothing of the anatomy left beside the Playground');
    // Variants: every option of each variant prop and both sides of each on/off prop, one per row, drawn by the Playground and copied still; the Playground
    // keeps what was set, and Try it sets the option there.
    await run(`[...document.querySelectorAll('#c-chip .pg-areas [data-v]')].find((b) => b.dataset.v === 'variants').click()`);
    for (let i = 0; i < 60 && !(await run(`document.querySelectorAll('#c-chip .pg-variant-row').length`)); i++) await new Promise((r) => setTimeout(r, 50));
    assert.equal(await run(`[...document.querySelectorAll('#c-chip .pg-variant-group')].map((g) => g.querySelector('h3').textContent + ':' + [...g.querySelectorAll('.pg-variant-row > .pg-ctl-label')].map((l) => l.textContent).join('|')).join()`), 'Size:M|L (in the Playground),Icon:false (in the Playground)|true', 'an on/off prop shows both sides too');
    assert.equal(await run(`[...document.querySelectorAll('#c-chip .pg-variant-group')[0].querySelectorAll('.pg-variant-row')].map((r) => r.querySelector('.pg-variant-stage .chip').classList.contains('chip--l')).join()`), 'false,true');
    assert.equal(await run(`[...document.querySelectorAll('#c-chip .pg-variant-row')].map((r) => r.getBoundingClientRect().left).every((x, i, a) => Math.abs(x - a[0]) < 1)`), true, 'one per row, never a grid');
    assert.equal(await run(`document.querySelector('#c-chip .pg-variant-stage .chip').closest('[inert]') !== null`), true);
    assert.equal(await run(`document.querySelector('#c-chip .pg-preview .chip').classList.contains('chip--l')`), true, 'the Playground as it was');
    await run(`[...document.querySelectorAll('#c-chip .pg-variant-row [data-try]')][1].click()`);
    assert.equal(await run(`[...document.querySelectorAll('#c-chip .pg-area')].filter((a) => !a.hidden).map((a) => a.dataset.area).join()`), 'play');
    await run(`[...document.querySelectorAll('#c-chip .pg-areas [data-v]')].find((b) => b.dataset.v === 'docs').click()`);
    assert.equal(await run(`!!document.querySelector('#c-chip [data-area="docs"] .pg-anatomy')`), false, 'Documentation draws nothing of its own');
    // Do and Don't from the references, each with its caption, the do first.
    assert.equal(await run(`[...document.querySelectorAll('#c-chip .pg-examples .pg-example')].map((e) => e.querySelector('.pg-ctl-label').textContent + ':' + e.querySelector('.pg-example-caption').textContent).join('|')`), "Do:One filter per chip|Don't:A sentence in a chip");
    // Its Documentation first, in the table every task shares (as Parity and Accessibility are), then each section of
    // rows in the Playground's tables, its title the head (Details).
    assert.equal(await run(`document.querySelector('#c-chip [data-area="docs"] .pg-footer > .pg-doc').matches('.pg-knowledge') && !!document.querySelector('#c-chip [data-area="docs"] .pg-knowledge table.sg-issues')`), true);
    assert.match(await run(`[...document.querySelectorAll('#c-chip .pg-doc-card > .pg-inspect-head > h3')].map((h) => h.textContent).join()`), /^Details/);
    assert.equal(await run(`!!document.querySelector('#c-chip [data-area="play"] .pg-anatomy-doc')`), false, 'no Anatomy card under the Playground');
    // Its header: only its version and when it last changed (with the time), its links at the top right, no issue link.
    assert.doesNotMatch(await run(`(document.querySelector('#c-chip .pg-facts') || {}).textContent || ''`), /Figma|Accessibility|Used in/);
    assert.doesNotMatch(await run(`document.querySelector('#c-chip .pg-header').textContent`), /Report an issue/);
    // Its card on the overview: the name only, no line on Figma or accessibility.
    assert.equal(await run(`document.querySelector('#overview .sg-card[href="#c-chip"] > h3').textContent.trim() + '|' + document.querySelector('#overview .sg-card[href="#c-chip"]').children.length`), 'chip|2', 'its picture and its name');
    // The name stays beside the areas; Parity says what it marks to a screen reader (Tidepool has no alert icon to draw
    // before its label), and the page no line about it. Accessibility, with nothing found, says nothing.
    assert.match(await run(`document.querySelector('#c-chip .pg-areas > .pg-areas-name').textContent + '|' + document.querySelector('#c-chip .pg-areas [data-v="parity"]').textContent + '|' + document.querySelector('#c-chip .pg-areas [data-v="a11y"]').textContent + '|' + !!document.querySelector('#c-chip [data-area-go]')`), /^chip\|Parity, 1 only in code\|Accessibility, .*to check\|false$/, 'its Accessibility switch says what is open, as its area counts it');
    // Parity's table head stays in view under the areas as its rows scroll by.
    assert.equal(await run(`getComputedStyle(document.querySelector('#c-chip .pg-par-table th')).position`), 'sticky');
    // On a phone the areas scroll sideways in one row, never wrap; the one chosen scrolls into view.
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 800, deviceScaleFactor: 1, mobile: true }, sessionId);
    await new Promise((r) => setTimeout(r, 100));
    // On a phone the overview keeps two cards side by side, each shorter than on a wide screen.
    // (The overview is out of sight here, so its columns read as declared, repeat(2, …), rather than as two widths.)
    assert.match(await run(`(() => { const g = document.querySelector('#overview .sg-card-grid'); const t = g.querySelector('.sg-thumb'); return getComputedStyle(g).gridTemplateColumns + '|' + getComputedStyle(t).height; })()`), /^(repeat\(2, [^|]+|\d+(\.\d+)?px \d+(\.\d+)?px)\|104px$/);
    assert.equal(await run(`(() => { const s = document.querySelector('#c-chip .pg-areas-scroll'), items = [...s.querySelectorAll('[data-v]')]; return s.scrollWidth > s.clientWidth && new Set(items.map((b) => Math.round(b.getBoundingClientRect().top))).size === 1 && document.documentElement.scrollWidth <= innerWidth; })()`), true, 'one row that scrolls, the page itself no wider than the screen');
    await run(`[...document.querySelectorAll('#c-chip .pg-areas [data-v]')].find((b) => b.dataset.v === 'play').click()`);
    assert.ok(await run(`(() => { const p = document.querySelector('#c-chip .pg-preview').getBoundingClientRect(), t = document.querySelector('#c-chip .pg-stage-bar--top').getBoundingClientRect(); return t.bottom <= p.top + 1; })()`), 'the bar sits above the stage, never over the component');
    await run(`[...document.querySelectorAll('#c-chip .pg-areas [data-v]')].find((b) => b.dataset.v === 'log').click()`);
    assert.equal(await run(`(() => { const s = document.querySelector('#c-chip .pg-areas-scroll'), b = s.querySelector('[data-v="log"]').getBoundingClientRect(), r = s.getBoundingClientRect(); return s.scrollLeft > 0 && b.right <= r.right + 1; })()`), true, 'Changelog scrolled into view');
    // On a phone a table of several columns is a block per row: no head row over the text, each value under the name of its
    // column, no cell narrower than the card, nothing wider than the screen.
    for (const area of ['parity', 'a11y']) {
      await run(`[...document.querySelectorAll('#c-chip .pg-areas [data-v]')].find((b) => b.dataset.v === '${area}').click()`);
      await new Promise((r) => setTimeout(r, 150));
      assert.equal(await run(`(() => { const t = document.querySelector('#c-chip [data-area="${area}"] .pg-par-table'), rows = [...t.querySelectorAll('tbody tr')], card = t.closest('.pg-par-card').getBoundingClientRect();
        return getComputedStyle(t.querySelector('thead')).position === 'absolute' && rows.length > 0 && rows.every((r) => getComputedStyle(r).display === 'block' && [...r.cells].every((td, i) => i === 0 || !td.textContent.trim() || td.getAttribute('data-label')) && [...r.cells].every((td) => td.getBoundingClientRect().width >= card.width - 64 || !td.textContent.trim())) && document.documentElement.scrollWidth <= innerWidth; })()`), true, area + ' reads as blocks on a phone');
    }
    await run(`[...document.querySelectorAll('#c-chip .pg-areas [data-v]')].find((b) => b.dataset.v === 'docs').click()`);
    await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 800, deviceScaleFactor: 1, mobile: false }, sessionId);
    // Its Documentation is the table every task shares: each kind with what is written, what to do and its status, every
    // kind here, written or not, what is to write first; the Tasks page lists the same rows, only those not written yet.
    // Where it is used is its own area, never a kind of documentation.
    assert.equal(await run(`[...document.querySelectorAll('#c-chip .pg-knowledge thead th')].map((d) => d.textContent).join('|')`), 'Task nr|Kind|What is written|What to do|Status');
    const kinds = await run(`[...document.querySelectorAll('#c-chip .pg-knowledge tbody td:nth-child(2)')].map((d) => d.textContent).sort().join('|')`);
    assert.equal(kinds, ['What it is', 'When to use', 'When not to use', 'Common mistakes', 'Limitations', 'Do and don\'t', 'Role'].sort().join('|'));
    assert.match(await run(`[...document.querySelectorAll('#c-chip .pg-knowledge tbody tr')].map((tr) => tr.dataset.status).join(' ')`), /^(todo )*todo( done)*$/, 'what is to write first, what is written after');
    assert.match(await run(`document.querySelector('#c-chip .pg-knowledge tr[data-status="todo"]').textContent`), /(Not written yet\.|No pictures yet\.)You in Figma.+To fix/);
    assert.match(await run(`document.querySelector('#c-chip .pg-areas [data-v="docs"]').textContent`), /^Documentation, \d+ to fix$/, 'its area says what is still to write, as Parity and Accessibility do');
    assert.match(await run(`document.querySelector('#c-chip .pg-knowledge').textContent`), /Not written yet/);
    // The menu: worded buttons; on a wide screen it is always there, with nothing to hide it.
    assert.equal(await run(`document.getElementById('sg-menu').textContent + '|' + document.getElementById('sg-nav-close').textContent`), 'Menu|Close menu');
    await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 800, deviceScaleFactor: 1, mobile: false }, sessionId);
    assert.equal(await run(`!document.getElementById('sg-hide-nav') && getComputedStyle(document.getElementById('sg-sidebar')).display !== 'none' && getComputedStyle(document.getElementById('sg-topbar')).display === 'none'`), true);
    // The overview holds the cards, never notes on what is left off, usage counts, statuses or a To do button.
    assert.doesNotMatch(await run(`document.getElementById('overview').textContent`), /Left off this page|Usage written|Status: |Open the To do list/);
    // Disabled set: the native control is disabled too, so Tab passes it by.
    await run(`location.hash = '#c-button?Disabled=true'`); await new Promise((r) => setTimeout(r, 400));
    assert.equal(await run(`document.querySelector('#c-button .pg-preview button').disabled`), true);
    await run(`location.hash = '#c-button?Disabled=false'`); await new Promise((r) => setTimeout(r, 400));
    // Its page says it is retired, what replaces it, and how much still moves.
    assert.match(await run(`document.querySelector('#c-button .pg-header').textContent`), /Deprecated.*Use chip instead\. Still used in 3 places \(This system 3\), each on the Tasks page\./);
    assert.equal(await run(`document.querySelector('#c-button .pg-preview button').disabled`), false);
    // How a product brings it in: the import line, copied by the system's button.
    assert.equal(await run(`document.querySelector('#c-chip .pg-import code').textContent`), "import { Chip } from '@/components/Chip';");
    // The To do page: the same table as a component's areas, each open row under the issue number its component's own
    // area shows. Every variant of every component was tried while the page was built and kept in it: the final results
    // at once, nothing tried here; a refresh shows the same.
    await run(`location.hash = '#tasks'`); await shownIs('tasks');
    const note = () => run(`(document.querySelector('#tasks .sg-todo-note') || {}).textContent || ''`);
    assert.match(await until(`(document.querySelector('#tasks .sg-todo-note') || {}).textContent || ''`, (v) => v.length > 0), /Every variant of every component was tried in a browser when this page was built, on \d{4}-\d\d-\d\d.*nothing runs while you read them/);
    assert.equal(await run(`!!document.getElementById('sg-a11y-baked') && document.querySelectorAll('.pg-offstage').length`), 0, 'nothing tried here');
    // The note is about Accessibility alone: under its filter, never on another kind.
    assert.equal(await run(`document.querySelector('#tasks .sg-todo-note').closest('.sg-todo-kind').dataset.area`), 'Accessibility');
    assert.equal(await run(`document.querySelector('#tasks .sg-todo-note').getClientRects().length`), 0, 'not shown on Parity');
    assert.match(await run(`document.querySelector('nav a[href="#tasks"]').textContent`), /tasks \(\d+\)$/, 'the final count, at once');
    // One kind at a time, each in its own table, chosen with the filter; no list of every kind at once.
    const shownKind = () => run(`[...document.querySelectorAll('#tasks .sg-todo-kind')].filter((k) => k.getClientRects().length).map((k) => k.dataset.area)`);
    const shownHead = () => run(`document.querySelector('#tasks .sg-todo-kind:not([hidden]) thead').textContent`);
    assert.match((await run(`[...document.querySelectorAll('#tasks .sg-todo-filter [data-v]')].map((b) => b.textContent).join('|')`)), /^Parity \(\d+\)\|(Motion \(\d+\)\|)?Documentation \(\d+\)\|.*Accessibility \(\d+\)(\|Style guide \(\d+\))?$/, 'Accessibility after the rest, the kind that waits; the Style guide\'s own stand-ins last');
    assert.equal(await run(`[...document.querySelectorAll('#tasks .sg-todo-filter [data-v]')].some((b) => b.dataset.v === 'all')`), false, 'no All');
    assert.deepEqual(await shownKind(), ['Parity']);
    assert.equal(await run(`(() => { const h = document.querySelector('#tasks .sg-todo-head'); return [...h.children].map((e) => e.classList.contains('sg-todo-filter') ? 'filter' : e.classList.contains('sg-todo-sum') ? 'counts' : '?').join(','); })()`), 'filter,counts', 'the counts under the filter, since they are the chosen kind\'s');
    assert.match(await shownHead(), /^Task nr\s*Type\s*Figma\s*Code\s*What to do\s*Status$/);
    await run(`document.querySelector('#tasks .sg-todo-filter [data-v="Accessibility"]').click()`);
    assert.deepEqual(await shownKind(), ['Accessibility']);
    assert.equal(await run(`location.hash`), '#tasks/accessibility', 'each kind has its own address to send');
    assert.match(await shownHead(), /^Task nr\s*WCAG criterion\s*Figma states\s*Found\s*What to do\s*Status$/);
    assert.deepEqual(await run(`[...new Set([...document.querySelectorAll('#tasks .sg-todo-kind:not([hidden]) tbody tr')].map((tr) => tr.dataset.area))]`), ['Accessibility']);
    assert.equal(await run(`(() => { const k = document.querySelector('#tasks .sg-todo-kind:not([hidden])'); return k.firstElementChild.classList.contains('sg-todo-note') && k.querySelector('.sg-todo-note').getClientRects().length > 0; })()`), true, 'the note first under the Accessibility filter');
    // Documentation is on the Tasks page too, in the table each component's Documentation area shows, one card for each
    // component with a kind not written yet, only those rows, under the numbers its own area shows.
    await run(`document.querySelector('#tasks .sg-todo-filter [data-v="Documentation"]').click()`);
    assert.match(await shownHead(), /^Task nr\s*Kind\s*What is written\s*What to do\s*Status$/);
    assert.match(await run(`document.querySelector('#tasks .sg-todo-kind:not([hidden]) tbody tr').textContent`), /^\d+(What it is|When to use|When not to use|Common mistakes|Limitations|Do and don't|Role)(Not written yet\.|No pictures yet\.)You in Figma/);
    assert.equal(await run(`document.querySelectorAll('#tasks .sg-todo-kind:not([hidden]) tbody tr:not([data-status="todo"])').length`), 0, 'only what is still to write');
    const chipCard = `[...document.querySelectorAll('#tasks .sg-todo-kind:not([hidden]) .sg-todo-card')].find((k) => k.querySelector('.pg-inspect-head a').textContent === 'chip')`;
    assert.deepEqual(await run(`[...${chipCard}.querySelectorAll('tbody tr')].map((tr) => tr.outerHTML)`), await run(`[...document.querySelectorAll('#c-chip .pg-knowledge tbody tr[data-status="todo"]')].map((tr) => tr.outerHTML)`), 'the same rows, numbers and all');
    const missing = await run(`document.querySelectorAll('#tasks .sg-todo-kind:not([hidden]) tbody tr').length`);
    assert.equal(await run(`document.querySelector('#tasks .sg-todo-sum').textContent`), `✕${missing} to fix`, 'the count is the kind\'s own');
    assert.match(await run(`document.querySelector('#tasks .sg-todo-filter [data-v="Documentation"]').textContent`), new RegExp(`^Documentation \\(${missing}\\)$`));
    assert.deepEqual(await shownKind(), ['Documentation'], 'only the kind chosen is drawn');
    await run(`document.querySelector('#tasks .sg-todo-filter [data-v="Parity"]').click()`);
    assert.deepEqual(await shownKind(), ['Parity'], 'Documentation\'s cards go when another kind is chosen');
    // Every table's head stays in view as its rows scroll by: the card's head under what sticks at the top of the page,
    // the table's own head row under the card's head.
    const headsStick = async (sel) => {
      const pick = `[...document.querySelectorAll('${sel} .pg-par-card, ${sel} .pg-inspect')].filter((c) => c.getClientRects().length && c.querySelector('table') && c.querySelector(':scope > .pg-inspect-head')).sort((a, b) => b.offsetHeight - a.offsetHeight)[0]`;
      await run(`(() => { document.body.style.paddingBottom = '3000px'; const card = ${pick}; window.scrollTo(0, scrollY + card.getBoundingClientRect().top + card.offsetHeight / 2 - 60); })()`);
      await new Promise((r) => setTimeout(r, 400));
      const at = await run(`(() => { const card = ${pick}; const bars = [...document.querySelectorAll('${sel} .pg-areas, ${sel} > h2, ${sel} .sg-size-switch, ${sel} .sg-todo-head')].filter((e) => e.getClientRects().length && getComputedStyle(e).position === 'sticky'); const low = Math.max(0, ...bars.map((e) => e.getBoundingClientRect().bottom)); const head = card.querySelector(':scope > .pg-inspect-head').getBoundingClientRect(), th = card.querySelector('thead th'); const r = { card: card.getBoundingClientRect().top < low, head: Math.round(head.top - low), th: th ? Math.round(th.getBoundingClientRect().top - head.bottom) : 0 }; document.body.style.paddingBottom = ''; window.scrollTo(0, 0); return r; })()`);
      assert.deepEqual(at, { card: true, head: 0, th: 0 }, `${sel}: the card scrolled past the top, its head under the page's bars, the table's head under it`);
    };
    await headsStick('#tasks');
    // Opening a kind's address opens that kind, its tab chosen.
    await run(`location.hash = '#c-chip'`); await shownIs('c-chip');
    await run(`location.hash = '#tasks/documentation'`); await shownIs('tasks');
    assert.deepEqual(await shownKind(), ['Documentation']);
    assert.match(await run(`document.querySelector('#tasks .sg-todo-sum').textContent`), /^✕\d+ to fix$/, 'its own count');
    await run(`document.querySelector('#tasks .sg-todo-filter [data-v="Parity"]').click()`);
    // What the tokens owe is a row of The system: the descriptions to write, for whoever keeps Figma.
    assert.match(await run(`[...document.querySelectorAll('#tasks tr[data-area="System"]')].map((tr) => tr.textContent).join('|')`), /Tokens, description.*You in Figma.*semantic tokens have no description in Figma.*Write what each one is for/);
    // A retired component still in use: a row for each place it is used, under its name, with what replaces it.
    assert.match(await run(`[...document.querySelectorAll('#tasks tr[data-area="Migration"]')].map((tr) => tr.textContent).join('|')`), /^\d+This system3 places: .*A developer in the code.*Move this system off button \(figma-mcp\/settings\.md:105, src\/components\/system\.js:1, src\/pages\/Home\.jsx:2\)\..*Use chip instead\. Every place is in migrations\.md\. A developer does it, or Claude when asked\./);
    const nums = await run(`[...document.querySelectorAll('#tasks .sg-todo-no[data-todo-key]')].map((td) => [td.dataset.todoKey, td.textContent])`);
    assert.ok(nums.length > 0 && nums.every(([, n], i) => +n === i + 1), 'numbered 1, 2, 3 down the page');
    const byNo = (a) => a.slice().sort((p, q) => p[1] - q[1]);
    assert.deepEqual(byNo(await run(`[...document.querySelectorAll('#c-chip .sg-todo-no')].filter((td) => td.textContent).map((td) => [td.dataset.todoKey, td.textContent])`)), nums.filter(([k]) => decodeURIComponent(k).startsWith('chip\u0000')), 'the chip\'s areas show the To do page\'s numbers');
    await send('Page.reload', {}, sessionId);
    await new Promise((r) => setTimeout(r, 300));
    await waitForTrue(send, sessionId, FILE_PAGE_LOADED, { tolerateErrors: true });
    await until(`(document.querySelector('#tasks .sg-todo-note') || {}).textContent || ''`, (v) => v.length > 0);
    assert.match(await note(), /when this page was built/, 'a refresh shows the results the page was built with');
    assert.deepEqual(await run(`[...document.querySelectorAll('#tasks .sg-todo-no[data-todo-key]')].map((td) => [td.dataset.todoKey, td.textContent])`), nums, 'the same list at once');
    // Try again in this browser: every component tried afresh here, then kept in this browser, so a refresh tries nothing.
    // While it runs, only Accessibility waits (how far it has got under it, no count in its filter, none in the menu);
    // every other kind is there at once, with the numbers it had.
    await run(`document.querySelector('#tasks .sg-todo-filter [data-v="Accessibility"]').click()`);
    const others = `[...document.querySelectorAll('#tasks .sg-todo-kind:not([data-area="Accessibility"]) .sg-todo-no[data-todo-key]')].map((td) => [td.dataset.todoKey, td.textContent])`;
    const othersBefore = await run(others);
    await run(`document.querySelector('#tasks [data-a11y-again]').click()`);
    assert.match(await run(`document.querySelector('#tasks .sg-todo-kind[data-area="Accessibility"]:not([hidden]) .sg-todo-wait').textContent`), /^Trying the components for accessibility in this browser, \d+ of \d+\. Its tasks show once every one is tried/);
    assert.deepEqual(await run(`[document.querySelector('#tasks .sg-todo-filter [data-v="Accessibility"]').textContent, document.querySelector('nav a[href="#tasks"]').textContent.trim(), document.querySelectorAll('#tasks .sg-todo-kind[data-area="Accessibility"] table').length]`), ['Accessibility', 'tasks', 0]);
    assert.ok(othersBefore.length > 0);
    assert.deepEqual(await run(others), othersBefore, 'every other kind at once, its numbers as they were');
    await run(`document.querySelector('#tasks .sg-todo-filter [data-v="Parity"]').click()`);
    assert.deepEqual(await run(`[!!document.querySelector('#tasks .sg-todo-kind[data-area="Parity"]:not([hidden]) table'), [...document.querySelectorAll('#tasks .sg-todo-wait')].filter((p) => p.getClientRects().length).length]`), [true, 0], 'the try is said under Accessibility only');
    await run(`document.querySelector('#tasks .sg-todo-filter [data-v="Accessibility"]').click()`);
    let again = ''; for (let n = 0; n < 480 && !/Every component was tried in this browser/.test(again); n++) { if (n) await new Promise((r) => setTimeout(r, 250)); again = await note(); }
    assert.match(again, /Every component was tried in this browser/);
    await send('Page.reload', {}, sessionId);
    await new Promise((r) => setTimeout(r, 300));
    await waitForTrue(send, sessionId, FILE_PAGE_LOADED, { tolerateErrors: true });
    await until(`(document.querySelector('#tasks .sg-todo-note') || {}).textContent || ''`, (v) => v.length > 0);
    assert.match(await note(), /when this page was built/, 'what the build tried stands again after a refresh');
    await run(`location.hash = '#colors'`); await shownIs('colors'); await headsStick('#colors');
    await run(`location.hash = '#c-chip/documentation'`); await shownIs('c-chip'); await headsStick('#c-chip');
    // The button as the system's script leaves it, a moment after it is drawn, and its focus ring drawn on ::after.
    await run(`location.hash = '#c-button/accessibility'`); await shownIs('c-button');
    const btn = await until(`(document.querySelector('#c-button .pg-a11y-rows') || {}).textContent || ''`, (v) => /Tab reaches/.test(v));
    assert.match(btn, /Tab reaches it once: "Save now"/, 'measured once the system\'s script has named it');
    assert.doesNotMatch(btn, /shows no change when it takes the focus/, 'a ring drawn on ::after is a focus that shows');
    // A Figma note no check reads is a row of its own on the chip's Accessibility area, with what to do about it.
    await run(`location.hash = '#c-chip/accessibility'`); await shownIs('c-chip');
    assert.match(await until(`(document.querySelector('#c-chip .pg-a11y-rows') || {}).textContent || ''`, (v) => /Screen readers/.test(v)), /Figma annotation.*Screen readers announce the hint after the label.*Write it as Role: button/s);
    // A check a person made by hand is Done, by whom and when, while chip is as it was; one made before chip changed is
    // to check again, saying who checked it; one nobody checked says how to mark it.
    const rowOf = (sc) => run(`(() => { const tr = [...document.querySelectorAll('#c-chip .pg-a11y-rows tr')].find((r) => r.textContent.includes('${sc} ')); return tr ? tr.dataset.status + '|' + tr.textContent : ''; })()`);
    assert.match(await rowOf('1.3.3'), /^done\|.*Checked by Ana on \d{4}-\d\d-\d\d: No instruction relies only on shape/s);
    assert.match(await rowOf('3.3.7'), /^check\|.*Checked by Ana on 2026-09-01, before chip changed\..*Checked it\? Tell Claude chip 3\.3\.7 is checked\./s);
    assert.match(await rowOf('1.4.5'), /^check\|.*Checked it\? Tell Claude chip 1\.4\.5 is checked\./s);
    // No Documentation page of its own: what is written lives on the Tasks page (#tasks/documentation), and an old link
    // to Documentation or Coverage opens it there, the address saying so; one to the To do page (its old name) opens Tasks.
    assert.equal(await run(`!!document.getElementById('documentation') || !!document.querySelector('nav a[href="#documentation"]')`), false);
    for (const old of ['#documentation', '#coverage']) {
      await run(`location.hash = '${old}'`); await new Promise((r) => setTimeout(r, 200));
      assert.equal(await run(`location.hash`), '#tasks/documentation', `an old ${old} link`);
      assert.deepEqual(await run(`[...document.querySelectorAll('#tasks .sg-todo-kind')].filter((k) => k.getClientRects().length).map((k) => k.dataset.area)`), ['Documentation']);
    }
    await run(`location.hash = '#todo/accessibility'`); await new Promise((r) => setTimeout(r, 200));
    assert.equal(await run(`location.hash`), '#tasks/accessibility', 'an old #todo link');
    assert.deepEqual(await run(`[...document.querySelectorAll('#tasks .sg-todo-kind')].filter((k) => k.getClientRects().length).map((k) => k.dataset.area)`), ['Accessibility']);
    assert.deepEqual(errors, []);
    close();
  } finally { c.kill(); }
});

test('"In use" shows the approved pictures of the system\'s own frames', { timeout: 300000 }, () => {
  const dir = fixtureProject(join(ENGINE, 'test', 'fixtures', 'tidepool-figma'), 'tp-sg-');
  const cfg = JSON.parse(readFileSync(join(dir, 'ds-config.json'), 'utf8'));
  writeFileSync(join(dir, 'ds-config.json'), JSON.stringify({ ...cfg, frames: [{ name: 'Settings', nodeId: '5:1' }, { name: 'Missing', nodeId: '9:9' }] }));
  mkdirSync(join(dir, '.design-system-engine-refs'), { recursive: true });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  writeFileSync(join(dir, '.design-system-engine-refs', '5-1.png'), png);
  spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--styleguide', '--no-a11y-bake'], { cwd: dir, encoding: 'utf8' });
  const data = JSON.parse(readFileSync(join(dir, '.design-system-engine-out/styleguide/index.html'), 'utf8').match(/id="sg-data">([\s\S]*?)<\/script>/)[1]);
  assert.deepEqual(data.screens.map((x) => x.caption), ['Settings']);
  assert.match(data.screens[0].src, /^data:image\/png;base64,iVBOR/);
});

test('the template\'s heading and paragraph rules reach only its own chrome, never a component in a preview', () => {
  const tpl = readFileSync(new URL('../templates/styleguide.template.html', import.meta.url), 'utf8');
  const css = tpl.slice(tpl.lastIndexOf('<style'), tpl.lastIndexOf('</style>')).replace(/\/\*[\s\S]*?\*\//g, '');
  const top = (sel) => { const out = ['']; let depth = 0; for (const ch of sel) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && !depth) out.push(''); else out[out.length - 1] += ch; } return out.map((x) => x.trim()); };
  const selectors = (css.match(/[^{}]+\{/g) ?? []).flatMap((r) => top(r.slice(0, -1)));
  assert.ok(selectors.length > 50, 'the page\'s own stylesheet is read');
  const reaching = selectors.filter((s) => /(^|[\s(,])(h[1-6]|p|figure)\b/.test(s) && !/>\s*(:where\()?(h[1-6]|p|figure)\b/.test(s));
  assert.deepEqual(reaching, []);
});

test('the measuring page (?all) draws no card thumbnails; icons follow Figma, with no made-up size switch', () => {
  const tpl = readFileSync(join(dirname(dirname(fileURLToPath(import.meta.url))), 'templates', 'styleguide.template.html'), 'utf8');
  assert.match(tpl, /function thumbOf\(c, src\) \{\n[^\n]*\|\| ALL\) return;/);
  assert.doesNotMatch(tpl, /Own size|iconSizes/);
  assert.match(tpl, /DATA\.iconFigma/);
});

test('a text part no text prop writes is drawn with its name, so its switch shows something', () => {
  const tpl = readFileSync(join(dirname(dirname(fileURLToPath(import.meta.url))), 'templates', 'styleguide.template.html'), 'utf8');
  assert.match(tpl, /A text part no text prop writes \(Show Description alone\) gets its own name/);
  assert.match(tpl, /replace\(\/\^show\[\\s-\]\+\/i, ''\)/);
});

test('a state set on an earlier part is set there: the checkbox input is ticked, the box class is never added to the whole', async () => {
  const { optionEffect } = await import('../styleguide-data.mjs');
  assert.deepEqual(optionEffect('.checkbox', '.checkbox-input:checked + .checkbox-box'), { add: [], attrs: { checked: '' }, target: '.checkbox-input' });
  const tpl = readFileSync(join(dirname(dirname(fileURLToPath(import.meta.url))), 'templates', 'styleguide.template.html'), 'utf8');
  assert.match(tpl, /if \(!effect\.target && e\.querySelector\('\.' \+ k\)\) return;/);
});

test('choosing the option already set does nothing, and a slot is documented with how Figma lets it be filled', () => {
  const tpl = readFileSync(join(dirname(dirname(fileURLToPath(import.meta.url))), 'templates', 'styleguide.template.html'), 'utf8');
  assert.match(tpl, /if \(next === state\[p\.label\]\) return;/);
  assert.match(tpl, /if \(\/true\/\.test\(b\.getAttribute\('aria-pressed'\) \|\| b\.getAttribute\('aria-checked'\) \|\| b\.getAttribute\('aria-selected'\) \|\| ''\) \|\| b\.dataset\.on === '1'\) return;/);
  // A new selection tells the system's own script, so what follows the selection (a sliding pill) moves with it.
  assert.match(tpl.slice(tpl.indexOf('function segSelect'), tpl.indexOf('function segItems')), /if \(on\) nudge\(\);/);
  assert.match(tpl, /<dt>Slots<\/dt>/);
  assert.match(tpl, /<dt>From Figma<\/dt>/);
});

test('using the component in the playground sets its props: a box ticked, a switch flipped, a value typed', () => {
  const tpl = readFileSync(join(dirname(dirname(fileURLToPath(import.meta.url))), 'templates', 'styleguide.template.html'), 'utf8');
  const src = tpl.slice(tpl.indexOf('function effectHolds'), tpl.indexOf('function partsOf'));
  const effectHolds = new Function(src + 'return effectHolds;')();
  const el = (cls = [], props = {}, attrs = {}) => ({ classList: { contains: (k) => cls.includes(k) }, getAttribute: (a) => attrs[a] ?? null, matches: () => false, querySelector: () => null, ...props });
  const input = el([], { checked: true });
  const root = { ...el(['switch']), querySelector: (s) => (s === '.switch-input' ? input : s === '.switch-track' ? {} : null) };
  assert.equal(effectHolds(root, { add: [], attrs: { checked: '' }, target: '.switch-input' }), true);
  input.checked = false;
  assert.equal(effectHolds(root, { add: [], attrs: { checked: '' }, target: '.switch-input' }), false);
  assert.equal(effectHolds(root, { add: ['switch-track'], attrs: {} }), null);          // a class that names a part: not readable
  assert.equal(effectHolds(root, { state: 'hover' }), null);                             // a live state: not readable
  assert.equal(effectHolds(el(['chip', 'chip--on']), { add: ['chip--on'] }), true);
  assert.match(tpl, /\['click', 'change', 'input'\]\.forEach\(function \(t\) \{ preview\.addEventListener\(t, function \(\) \{ setTimeout\(readBack, 0\); \}\); \}\);/);
  assert.match(tpl, /if \(next !== v\) \{ state\[p\.label\] = next; changed = true; if \(syncs\[p\.label\]\) syncs\[p\.label\]\(\); \}/);
});

test('on a phone the documentation is one column, each name above its text', () => {
  const tpl = readFileSync(join(dirname(dirname(fileURLToPath(import.meta.url))), 'templates', 'styleguide.template.html'), 'utf8');
  const phone = tpl.slice(tpl.indexOf('@media (max-width: 720px)'));
  const block = phone.slice(0, phone.indexOf('</style>'));
  assert.match(block, /\.pg-updated > div \{ grid-template-columns: 1fr;/);
});

test('the controls follow Figma\'s panel: variants first, then the rest in Figma\'s order, a prop not built yet in its place', () => {
  const snap = { card: { properties: { 'Title#1:0': { type: 'TEXT', defaultValue: 'T' }, 'Show Icon#2:0': { type: 'BOOLEAN', defaultValue: true }, Size: { type: 'VARIANT', defaultValue: 'M', variantOptions: ['M', 'L'] } } } };
  const rows = [row('card', 'Title', 'title', 'match'), row('card', 'Show Icon', 'showIcon', 'match'), row('card', 'Size', 'size', 'match')];
  const v = agreedView({ propsSnap: snap, rows, classFor: () => '.card', cssText: '.card{}' });
  assert.deepEqual(v.components[0].controls.map((c) => [c.label, c.at]), [['Size', 0], ['Title', 1], ['Show Icon', 2]]);
  const tpl = readFileSync(join(dirname(dirname(fileURLToPath(import.meta.url))), 'templates', 'styleguide.template.html'), 'utf8');
  assert.match(tpl, /if \(u\.at != null\) ctl\.dataset\.at = u\.at;/);   // a prop not built yet takes its Figma place too
});

test('a text goes to the part whose own words they are; a shape part stays empty and leads; an overlay opens over the whole window; the documentation sections stand apart', () => {
  const tpl = readFileSync(join(dirname(dirname(fileURLToPath(import.meta.url))), 'templates', 'styleguide.template.html'), 'utf8');
  assert.match(tpl, /var named = parts\.find\(function \(k\) \{ return k\.tagName !== 'INPUT' && own\(k\); \}\)/);
  assert.match(tpl, /if \(box\.width > 0 && box\.height > 0\) \{/);
  assert.match(tpl, /wrap\.appendChild\(card\); document\.body\.appendChild\(wrap\);/);
  assert.doesNotMatch(tpl, /preview\.appendChild\(wrap\)/);
  assert.match(tpl, /\.pg-updated \{ display: grid; gap: var\(--sg-space-l\);/);
});

test('a title in the style guide has no line under it; each type style lists its size, weight, line height, letter spacing and case, the family once', () => {
  const tpl = readFileSync(join(dirname(dirname(fileURLToPath(import.meta.url))), 'templates', 'styleguide.template.html'), 'utf8');
  const h3 = /\.sg-subsection > h3 \{[^}]*\}/.exec(tpl)[0];
  assert.doesNotMatch(h3, /border-bottom/);
  for (const [k, word] of [['size', 'size'], ['weight', 'weight'], ['lh', 'line height'], ['ls', 'letter spacing'], ['textTransform', 'case']]) assert.ok(tpl.includes(`['${k}', `) && tpl.includes(`'${word}']`), k);
  assert.match(tpl, /tokenCard\('family'/, 'the family once, as its own token');
  assert.match(tpl, /row\.querySelector\('table'\)\.innerHTML = rowsHTML\(lines\);/);   // a token table, as a component has
});

test('the Playground has the tokens behind what is drawn, no Computed box and no Its tokens table: Parity lists every token', () => {
  const tpl = readFileSync(join(dirname(dirname(fileURLToPath(import.meta.url))), 'templates', 'styleguide.template.html'), 'utf8');
  assert.doesNotMatch(tpl, /pg-computed|>Computed</);
  assert.match(tpl, /<div class="pg-inspect-head">Tokens<\/div><table class="pg-tokens">/);
  assert.doesNotMatch(tpl, /class="pg-own"|>Its tokens</);
});

test('typography follows Figma: its text styles in Figma\'s order, each value named by the Figma variable it binds', () => {
  const check = { passVars: [['m', '11px'], ['l', '13px']].flatMap(([k, v]) => [{ dimension: 'typography', token: `${k}/size`, cssVar: `--${k}-size`, value: v }]) };
  const vars = { typography: { l: { size: '13px' }, m: { size: '11px' } }, sizing: { 'typography/l/font-size': '13px', 'typography/m/font-size': '11px' }, strings: { 'font-family': 'inter' } };
  const t = agreedTokens(check, vars).typography;
  assert.deepEqual(t.map((x) => x.scale), ['l', 'm']);
  assert.equal(t[1].size.figma, 'typography/m/font-size');
  assert.deepEqual(t[0].family, { figma: 'font-family', value: 'inter' });
});

test('a text style named in full (s/regular) keeps its name: each value is after the last slash, named by the scale\'s variable it binds', () => {
  const pass = (style, prop, cssVar, value) => ({ dimension: 'typography', token: `${style}/${prop}`, cssVar, value });
  const check = { passVars: [pass('s/regular', 'size', '--s-size', '12px'), pass('s/regular', 'weight', '--s-weight', '400'), pass('s/strong', 'size', '--s-size', '12px'), pass('s/strong', 'weight', '--s-strong-weight', '700')] };
  const vars = { typography: { 's/regular': { size: '12px', weight: '400' }, 's/strong': { size: '12px', weight: '700' } }, sizing: { 'typography/s/font-size': '12px', 'typography/s/font-weight': '400' } };
  const t = agreedTokens(check, vars).typography;
  assert.deepEqual(t.map((x) => x.scale), ['s/regular', 's/strong'], 'two styles, not one "s" with a "regular" field');
  assert.deepEqual(t[0].size, { var: '--s-size', value: '12px', figma: 'typography/s/font-size' });
  assert.equal(t[0].weight.figma, 'typography/s/font-weight');
  assert.equal(t[1].weight.figma, 'text style s/strong', 'a value the scale\'s variable does not hold is named by its style');
});

test('the search covers every part of the page and, while it has words, only its results show below the field', () => {
  const tpl = readFileSync(join(dirname(dirname(fileURLToPath(import.meta.url))), 'templates', 'styleguide.template.html'), 'utf8');
  for (const kind of ['Component', 'Colour', 'Type style', 'Icon', 'Section']) assert.match(tpl, new RegExp("add\\('" + kind));
  assert.match(tpl, /nav\.hidden = !!words\.length; results\.hidden = !words\.length;/);
  assert.match(tpl, /sMount\.parentNode\.insertBefore\(results, sMount\.nextSibling\);/);
});

test('a component\'s API: a * on each prop the code says must be given, callbacks listed as events, nothing guessed', async () => {
  const { apiView } = await import('../styleguide-data.mjs');
  const v = apiView({ file: '/p/src/B.tsx', tag: 'Button', syntax: 'jsx', props: { label: { required: true }, size: { options: ['S', 'M'], default: 'M', required: false }, onClick: {}, tone: {} },
    events: ['onClick'], slots: { named: ['icon'], default: true } }, 'src/B.tsx');
  assert.deepEqual(v, { file: 'src/B.tsx', tag: 'Button', syntax: 'jsx', props: [{ name: 'label', required: true }, { name: 'size', values: ['S', 'M'], default: 'M', required: false }, { name: 'tone' }],
    events: ['onClick'], slots: ['default', 'icon'] });
  assert.equal(apiView({ file: '/p/x.css', props: {}, events: [], slots: { named: [], default: false } }), null, 'nothing read: no API section');
  assert.equal(apiView({ file: null }), null);
});

test('the code shown: the tag with the props set, in its framework\'s syntax; a required prop never left out', () => {
  const tpl = readFileSync(join(ENGINE, 'templates', 'styleguide.template.html'), 'utf8');
  const src = tpl.slice(tpl.indexOf('var low = function'), tpl.indexOf('// The classes and data attributes the system'));
  const callCode = new Function(src + 'return callCode;')();
  const props = [{ label: 'Size', prop: 'size', type: 'VARIANT', default: 'Medium' }, { label: 'Disabled', prop: 'disabled', type: 'BOOLEAN', default: false }, { label: 'Label', prop: 'label', type: 'TEXT', default: 'Save' }];
  const api = (syntax) => ({ tag: syntax === 'html' ? 'ds-button' : 'Button', syntax, props: [{ name: 'size', values: ['sm', 'md'], default: 'md' }, { name: 'label', required: true }, { name: 'icon', required: true }] });
  // the Figma option written as the code spells it (Small → sm); the default size left out
  assert.equal(callCode({ api: api('jsx') }, props, { Size: 'SM', Disabled: true, Label: 'Send' }), '<Button size="sm" disabled label="Send" icon={…} />');
  assert.equal(callCode({ api: api('jsx') }, props, { Size: 'md', Disabled: false, Label: 'Save' }), '<Button label={…} icon={…} />', 'a required prop the playground leaves at its default is still written');
  assert.equal(callCode({ api: api('vue') }, [{ label: 'On', prop: 'on', type: 'BOOLEAN', default: true }], { On: false }), '<Button :on="false" label="…" icon="…" />');
  assert.equal(callCode({ api: { tag: 'ds-tag', syntax: 'html', props: [] } }, [{ label: 'Tone', prop: 'tone', type: 'VARIANT', default: 'a' }], { Tone: 'b' }), '<ds-tag tone="b"></ds-tag>');
});

test('accessibility per component: its role\'s obligations and behaviours with WCAG, part roles, and what the last browser check found on it', async () => {
  const { a11yView } = await import('../styleguide-data.mjs');
  const result = { checkedAt: '2026-10-05T10:00:00Z', issues: [
    { issue: 'contrast', selector: 'span in .chip', contrast: 3.2, needs: 4.5, theme: 'dark', text: 'Filter', fix: 'Use a darker colour.' },
    { issue: 'contrast', selector: 'span in .chip', contrast: 2.9, needs: 4.5, theme: 'light', text: 'Off', fix: 'Use a darker colour.' },
    { issue: 'behaviour', selector: 'chip: Space does not flip aria-pressed', component: 'chip', fix: 'Make it do it.' },
    { issue: 'focus', selector: '.chips-row', fix: 'x' },   // another class that starts with the same word: not the chip's
  ] };
  const v = a11yView({ name: 'chip', cls: 'chip', role: 'togglebutton', annotations: ['Escape closes it'], parts: [{ layer: 'Icon', part: 'indicator' }], result,
    guide: { contrast: { title: (n) => `Text is hard to read (${n})` } } });
  assert.equal(v.element, 'a <button type="button"> with aria-pressed="true" or "false" (on or off)');
  assert.deepEqual(v.expects.map((x) => x.wcag), ['WCAG 4.1.2 Name, Role, Value (A)', 'WCAG 4.1.2 Name, Role, Value (A)', 'WCAG 2.1.1 Keyboard (A)', 'WCAG 2.1.1 Keyboard (A)', 'WCAG 1.3.1 Info and Relationships (A)']);
  assert.match(v.expects[3].says, /^Escape closes it\.$/);
  // What the page tries on the live component: its role's behaviours and the annotation's, with how each is done.
  assert.deepEqual(v.behaviours.map((b) => [b.id, b.expect, b.act.keys ?? b.act]), [['keys-toggle', 'aria-pressed', [' ']], ['escape-closes', 'hidden', ['Escape']]]);
  assert.equal(v.key, 'togglebutton');
  assert.deepEqual(v.checked.issues.map((i) => [i.kind, i.title, i.wcag, i.details]), [
    ['contrast', 'Text is hard to read (2)', 'WCAG 1.4.3 Contrast (Minimum) (AA)', ['"Filter" 3.2:1, needs 4.5:1 (dark)', '"Off" 2.9:1, needs 4.5:1 (light)']],
    ['behaviour', 'behaviour', 'WCAG 2.1.1 Keyboard (A)', ['chip: Space does not flip aria-pressed']],
  ], 'one line per kind of problem, each place listed');
  // no role stated: nothing invented; no browser check yet: null, and the page says so
  const none = a11yView({ name: 'card', cls: 'card' });
  assert.deepEqual([none.role, none.expects, none.checked], [null, [], null]);
  assert.deepEqual(a11yView({ name: 'card', result: { checkedAt: 't', notRead: ['card (not rendered)'], issues: [] } }).checked, { at: 't', notRead: true, why: 'not rendered', issues: [] });
});

test('parity per component: what agrees (since when), its props and tokens, what differs, not built, not compared', async () => {
  const { parityView } = await import('../styleguide-data.mjs');
  const v = parityView({ name: 'chip',
    agreed: { facts: { 'chip · height': { figma: '24', code: '24', at: '2026-10-04T12:00:00Z', commit: 'a1b2c3d' }, 'chip · radius': { figma: '16px', code: '16px' }, 'chip · gap': { figma: '4', code: '6' }, 'chips · height': { figma: '1', code: '1' } } },
    differences: [{ what: '· chip · radius: Figma 16px, code 12px' }], controls: [{ label: 'Size', prop: 'size' }], unbuilt: [{ label: 'Badge' }],
    ownTokens: { colors: [{ figma: 'chip/background', var: '--chip-background' }], sizes: [] }, census: { notComparable: 0, reasons: {} } });
  // the record's radius is the last agreement, and an open difference names it now: not listed as agreeing
  assert.deepEqual(v.agreed, [{ what: 'height', value: '24', since: '2026-10-04T12:00:00Z', commit: 'a1b2c3d' }]);
  assert.deepEqual(v.counts, { agree: 3, differ: 1, notBuilt: 1, notCompared: 0 });
  assert.equal(v.notCompared, null);
});

test('To do: a role the code fails or has still to be tried on is the code\'s even when a Figma note asked for it; a role not stated yet is done in Figma', () => {
  const tpl = readFileSync(join(ENGINE, 'templates', 'styleguide.template.html'), 'utf8');
  const src = tpl.slice(tpl.indexOf('var WHO = {'), tpl.indexOf('function doWhat('));
  const a11yWho = new Function(src + 'return a11yWho;')();
  const audit = { st: 'todo', from: 'The last audit, in a browser, 5 Oct' };
  // The rendered role differs from the note: the note is right, the code changes.
  assert.equal(a11yWho('4.1.2', 'audit', [audit, { st: 'todo', from: 'Figma annotation Role: button' }], ''), 'A developer in the code');
  assert.equal(a11yWho('1.3.1', 'audit', [{ st: 'todo', from: 'Figma annotation on the "Label" layer' }], ''), 'A developer in the code');
  // Nothing failed and what is missing is in Figma: its role is not stated yet.
  assert.equal(a11yWho('4.1.2', 'audit', [{ st: 'check', from: 'Figma, once annotated' }], ''), 'You in Figma');
  // What a Figma note's role asks, not tried yet: the audit tries it on the code, so nothing is to do in Figma.
  assert.equal(a11yWho('4.1.2', 'audit', [{ st: 'check', from: 'Figma annotation Role: toolbar', html: 'On actionBar, it carries role="toolbar". Tried once the audit runs it in a browser.' }], ''), 'A developer in the code');
  // A colour pair is a design decision; what only a person judges is checked by hand; the code's own finding is Claude's.
  assert.equal(a11yWho('1.4.3', 'audit', [audit], ''), 'You in Figma');
  assert.equal(a11yWho('1.3.3', 'person', [], 'On chip, a person checks that the instructions do not rely on shape.'), 'You check by hand');
  assert.equal(a11yWho('2.1.1', 'static', [{ st: 'todo', from: 'Its code' }], ''), 'A developer in the code');
});

test('To do: AAA advice is to check and to decide, never a must-fix; a component the audit could not try says why', async () => {
  const tpl = readFileSync(join(ENGINE, 'templates', 'styleguide.template.html'), 'utf8');
  // A comfortable 44px target or a 2px ring (AAA) found short is advice: checked, and yours to decide, as its size is the design's.
  assert.match(tpl, /if \(its\.some\(function \(it\) \{ return it\.st === 'todo'; \}\)\) st = k\.extra \? 'check' : 'todo';/);
  assert.match(tpl, /who: r\.st === 'todo' \|\| r\.st === 'check' \? \(r\.k\.extra \? WHO\.both : own \|\| a11yWho\(/);
  // The code has no markup for it: build it first; the audit stopped before it: run it again, never "run the audit" as if it had not.
  assert.match(tpl, /\/no markup\/\.test\(why\) \? 'Build ' \+ c\.name \+ ' in the code: the audit tries this once the page draws it from the code\.'/);
  assert.match(tpl, /'The last audit did not get to ' \+ c\.name \+ \(why \? ' \(' \+ why \+ '\)' : ''\) \+ '\. Run it again\.'/);
  const { a11yView } = await import('../styleguide-data.mjs');
  assert.equal(a11yView({ name: 'overflow', result: { notRead: ['overflow (the code has no markup for it: the style guide draws a stand-in)'], issues: [] } }).checked.why, 'the code has no markup for it: the style guide draws a stand-in');
});

test('a control with no name only where an on/off prop hides its words fails, with what the product does about it', () => {
  const tpl = readFileSync(join(ENGINE, 'templates', 'styleguide.template.html'), 'utf8');
  const named = new Function(tpl.slice(tpl.indexOf('function showsText('), tpl.indexOf('function showFirst(')) + 'return namedWhereUsed;')();
  const props = [{ label: 'Show Label', type: 'BOOLEAN', default: true }, { label: 'Label Content', type: 'TEXT' }, { label: 'Show Icon', type: 'BOOLEAN', default: true }];
  // Unnamed only with its label off: what to do is said, naming the prop.
  assert.match(named([{ 'Show Label': false, 'Show Icon': true }, { 'Show Label': false, 'Show Icon': false }], props), /^With Show Label off it shows no words, so nothing names it\. Where a product uses it that way, give it a name there: an aria-label/);
  // Unnamed with its label shown too: the component's own fault, nothing more said.
  assert.equal(named([{ 'Show Label': false }, { 'Show Label': true }], props), '');
  // An on/off prop that shows no words (an icon) never counts.
  assert.equal(named([{ 'Show Icon': false }], [{ label: 'Show Icon', type: 'BOOLEAN', default: true }]), '');
});

test('an accessibility finding goes to Accessibility, a difference from Figma to Parity', async () => {
  const { splitFindings } = await import('../styleguide-data.mjs');
  const { parity, a11y } = splitFindings([{ check: 'State contrast', what: 'badge [Type=Warning · light]: 2.04:1 (needs 4.5:1)' }, { check: 'Structure', what: 'badge · height: Figma 20, code 22' }, { check: 'Token layering', what: 'x' }]);
  assert.deepEqual(parity.map((x) => x.check), ['Structure', 'Token layering']);
  assert.deepEqual(a11y.map((x) => x.check), ['State contrast']);
  const html = readFileSync(new URL('../templates/styleguide.template.html', import.meta.url), 'utf8');
  assert.match(html, /add\(x\.wcag \|\| \(contrast \? 'WCAG 1\.4\.3 Contrast \(Minimum\) \(AA\)' : ''\), 'todo'/, 'the Accessibility area lists what to fix, under its criterion');
  assert.match(html, /a\[0\] === 'a11y' \? a11yOpen\(c\)/, 'the Accessibility tab carries the alert icon while anything on it is to fix or to check');
  assert.match(html, /if \(o\.icon\) text = WARN_SVG \+ text;/, 'the page\'s own warning mark before the label');
  assert.match(html, /n \+= \(c\.a11yFindings \|\| \[\]\)\.length/, 'counting what the audit found with what the browser check found');
});

test('parity, one table: every prop, variable and value, Figma beside code, with a status and when', async () => {
  const { parityRows } = await import('../styleguide-data.mjs');
  const rows = parityRows({ name: 'chip',
    propsSnap: { chip: { properties: { 'Size': { type: 'VARIANT', defaultValue: 'M', variantOptions: ['M', 'L'] }, 'Label#1:0': { type: 'TEXT', defaultValue: 'Hi' }, 'Badge#2:0': { type: 'BOOLEAN', defaultValue: false } } } },
    controls: [{ label: 'Size', prop: 'size' }, { label: 'Label', prop: 'label' }], unbuilt: [{ label: 'Badge' }],
    codeProps: { size: { default: 'M' }, label: {}, tone: { default: 'neutral' }, onClick: {} },
    allTokens: [{ var: '--chip-background', figma: 'chip/background' }, { var: '--chip-text', figma: 'chip/text' }, { var: '--chip-extra', figma: null }],
    check: { passVars: [{ cssVar: '--chip-background', token: 'chip/background/color', mode: 'light', value: '#fff' }, { cssVar: '--chip-background', token: 'chip/background/color', mode: 'dark', value: '#000' }],
      fail: [{ cssVar: '--chip-text', token: 'chip/text/color', mode: 'Light', figma: '#111111', css: '#222222' }],
      skip: [{ token: 'chip/border', mode: 'Light', reason: 'no dedicated CSS var' }, { token: 'chips/other', reason: 'x' }] },
    agreed: { facts: { 'chip · height': { figma: '24', code: '24', at: '2026-10-04T12:00:00Z' } }, seen: { 'chip · height': { figma: '24', code: '24', same: true }, 'chip · gap': { figma: '4', code: '6', same: false, moves: [{ at: '2026-10-05T08:00:00Z', side: 'code' }] } } },
    propsAt: '2026-10-06T06:00:00Z', checkedAt: '2026-10-06T07:00:00Z' });
  const brief = rows.map((r) => [r.type, r.figma?.name ?? '-', r.code?.name ?? '-', r.status, r.at]);
  assert.deepEqual(brief, [
    ['Prop', 'Size', 'size', 'match', '2026-10-06T06:00:00Z'],
    ['Prop', 'Label', 'label', 'match', '2026-10-06T06:00:00Z'],
    ['Prop', 'Badge', '-', 'figma', '2026-10-06T06:00:00Z'],
    ['Prop', '-', 'tone', 'code', '2026-10-06T06:00:00Z'],
    ['Variable', 'chip/background', '--chip-background', 'match', '2026-10-06T07:00:00Z'],
    ['Variable', 'chip/text', '--chip-text', 'differs', '2026-10-06T07:00:00Z'],
    ['Variable', '-', '--chip-extra', 'code', '2026-10-06T07:00:00Z'],
    ['Variable', 'chip/border', '-', 'figma', '2026-10-06T07:00:00Z'],
    ['Value', 'gap', 'gap', 'differs', '2026-10-05T08:00:00Z'],
    ['Value', 'height', 'height', 'match', '2026-10-04T12:00:00Z'],
  ]);
  assert.equal(rows[0].figma.value, 'M, L · default M');
  assert.equal(rows[4].figma.value, 'light #fff · dark #000', 'each mode');
  assert.deepEqual([rows[5].figma.value, rows[5].code.value], ['Light #111111', 'Light #222222']);
});

// E9: a Figma variable the token check found under another heading is paired with its CSS variable, never listed twice.
test('parity: a variable the token check found but did not compare is one row with both names', async () => {
  const { parityRows } = await import('../styleguide-data.mjs');
  const rows = parityRows({ name: 'highlight',
    allTokens: [{ var: '--highlight-background', figma: null }, { var: '--highlight-text', figma: null }, { var: '--highlight-extra', figma: null }],
    check: { passVars: [], fail: [],
      skip: [{ token: 'highlight/background', cssVar: '--highlight-background', mode: 'Light', reason: 'declared outside :root (component-scoped) - not compared by this gate' }, { token: 'highlight/border', reason: 'no dedicated CSS var' }],
      pendingFigmaSync: [{ token: 'highlight/text/color', cssVar: '--highlight-text', mode: 'Light', consumerFigma: '#111111', css: '#222222' }] },
    checkedAt: '2026-10-06T07:00:00Z' });
  assert.deepEqual(rows.map((r) => [r.figma?.name ?? '-', r.code?.name ?? '-', r.status]), [
    ['highlight/background', '--highlight-background', 'paired'],
    ['highlight/text', '--highlight-text', 'differs'],
    ['-', '--highlight-extra', 'code'],
    ['highlight/border', '-', 'figma'],
  ]);
  assert.match(rows[0].why, /component-scoped/);
  assert.deepEqual([rows[1].figma.value, rows[1].code.value], ['Light #111111', 'Light #222222']);
});

test('parity, what goes inside: a slot or swap in an HTML and CSS system is the markup\'s content; the code\'s props as a list', async () => {
  const { parityRows } = await import('../styleguide-data.mjs');
  const props = { 'Main Content#1:0': { type: 'SLOT' }, 'Icon Content#2:0': { type: 'INSTANCE_SWAP' }, 'Badge#3:0': { type: 'BOOLEAN', defaultValue: false } };
  const html = parityRows({ name: 'panel', propsSnap: { panel: { properties: props } }, unbuilt: [{ label: 'Badge' }] });
  assert.deepEqual(html.map((r) => [r.figma?.name, r.code?.name ?? '-', r.status]), [['Main Content', 'its content', 'match'], ['Icon Content', 'its content', 'match'], ['Badge', '-', 'figma']], 'one not built stays only in Figma');
  // With code props (a list, as the API reader gives them): a slot is the children it takes, a swap needs a prop of its own.
  const jsx = parityRows({ name: 'panel', propsSnap: { panel: { properties: props } }, codeProps: [{ name: 'children' }, { name: 'Badge', default: 'false' }, { name: 'pressed', default: 'false' }] });
  assert.deepEqual(jsx.map((r) => [r.figma?.name ?? '-', r.code?.name ?? '-', r.status]), [['Main Content', 'children', 'match'], ['Icon Content', '-', 'figma'], ['Badge', 'Badge', 'match'], ['-', 'pressed', 'code']]);
});

test('a Figma slot the code holds in a part of its own is paired with that part, and Parity lists it', async () => {
  const { parityRows } = await import('../styleguide-data.mjs');
  const rows = parityRows({ name: 'modal', propsSnap: { modal: { properties: { 'Slot#1:0': { type: 'SLOT' } } } }, slotParts: [{ name: 'Slot', selector: '.modal-slot', slot: true }] });
  assert.deepEqual(rows.map((r) => [r.figma.name, r.code.name, r.status, r.slot]), [['Slot', '.modal-slot', 'match', true]]);
  const tpl = readFileSync(join(ENGINE, 'templates', 'styleguide.template.html'), 'utf8');
  assert.doesNotMatch(tpl, /function slotsHTML\(c\)/, 'no line of slots under its name: Parity lists them');
});

test('import line and nesting: as a product writes the import, and the system\'s components it is built with', async () => {
  const { importOf, nestedComponents, stylesheetImport, scriptUses } = await import('../styleguide-data.mjs');
  // Its own functions in the system's script: named after it and naming its class, never one that only uses it inside
  // something else; exported when the script is a module.
  const script = "function showToast(msg) { const t = document.createElement('div'); t.className = 'toast'; }\nfunction showProgress() { el.classList.add('toast'); }\nfunction esc(s) { return s; }\nexport function createChip() { return '<span class=\"chip\"></span>'; }";
  assert.deepEqual(scriptUses({ text: script, cls: 'toast', name: 'toast' }), [{ name: 'showToast', args: 'msg', exported: false }]);
  assert.deepEqual(scriptUses({ text: script, cls: '.chip', name: 'chip' }), [{ name: 'createChip', args: '', exported: true }]);
  assert.deepEqual(scriptUses({ text: script, cls: 'badge', name: 'badge' }), []);
  // A system of CSS classes: a product imports its stylesheet, by the name the package's exports give it.
  assert.deepEqual(stylesheetImport({ file: 'packages/ui/src/theme.css', pkg: { name: '@acme/ds', dir: '.', exports: { './theme.css': './packages/ui/src/theme.css' } } }), { line: "@import '@acme/ds/theme.css';", from: '@acme/ds/theme.css', css: true });
  assert.equal(stylesheetImport({ file: 'src/theme.css', pkg: { name: '@acme/ds', dir: '.' } }).line, "@import '@acme/ds/src/theme.css';");
  assert.equal(stylesheetImport({ file: 'src/theme.css' }).line, "@import './src/theme.css';");
  assert.deepEqual(importOf({ tag: 'ModalGeneral', syntax: 'vue', file: 'src/components/library/modals/General.vue' }), { line: "import ModalGeneral from '@/components/library/modals/General.vue';", from: '@/components/library/modals/General.vue' });
  assert.equal(importOf({ tag: 'Chip', syntax: 'jsx', file: 'src/components/Chip.jsx', text: 'export function Chip() {}' }).line, "import { Chip } from '@/components/Chip';");
  assert.equal(importOf({ tag: 'Chip', syntax: 'jsx', file: 'packages/ui/src/Chip.tsx', text: 'export default function Chip() {}', pkg: { name: '@acme/ui', dir: 'packages/ui' } }).line, "import Chip from '@acme/ui/Chip';");
  assert.equal(importOf({ tag: 'Chip', syntax: 'jsx', file: 'lib/Chip.jsx', template: '~/ui/{path}' }).line, "import Chip from '~/ui/lib/Chip';");
  assert.equal(importOf({ tag: 'ds-chip', syntax: 'html', file: 'x.js' }), null, 'a custom element is used by its tag, not imported by name');
  const names = [{ name: 'buttonSecondary', cls: 'buttonSecondary' }, { name: 'buttonPrimary', cls: 'buttonPrimary' }, { name: 'modal', cls: 'modal-card' }, { name: 'modalHeader', cls: 'modal-card-header' }];
  assert.deepEqual(nestedComponents({ name: 'modal', cls: 'modal-card', markup: '<div class="modal-card"><div class="modal-card-header"></div><button class="buttonSecondary modal-close">x</button></div>', names }), ['buttonSecondary'], 'its own parts never count');
  assert.deepEqual(nestedComponents({ name: 'Dialog', text: "import { ButtonPrimary } from './ButtonPrimary';\nexport const Dialog = () => <ButtonPrimary />;", names }), ['buttonPrimary']);
});

test('product pictures: a product\'s own picture first, its window from its code, a picture of the page otherwise', async () => {
  const { windowSize, productShots } = await import('../product-shots.mjs');
  assert.deepEqual(windowSize('figma.showUI(__html__,{width:1e3,height:540,title:"Demo"})'), { w: 1000, h: 540 });
  assert.equal(windowSize('no window here'), null);
  const dir = mkdtempSync(join(tmpdir(), 'shots-'));
  mkdirSync(join(dir, 'app', 'docs'), { recursive: true });
  writeFileSync(join(dir, 'app', 'ui.html'), '<!doctype html><button class="btn">Go</button>');
  writeFileSync(join(dir, 'app', 'docs', 'preview.png'), Buffer.from('89504e470d0a1a0a', 'hex'));
  const r = await productShots(dir, [{ key: 'A', page: 'app/ui.html' }], [{ name: 'button', cls: 'btn' }], { chromePath: '/nonexistent' });
  assert.equal(r.A.from, 'image');
  assert.match(r.A.shot, /^data:image\/png;base64,/);
});

test('a control the system lacks: the page draws its default (segmented control, tooltip, card), and says so on the overview and in the To do list', async () => {
  const { segmentedUi, fieldUi, standInGaps } = await import('../styleguide-data.mjs');
  const css = '.tabs{} .seg{} .radio{} .radio-input{} .radio-label{} .search{} .search-input{}';
  const tabs = { name: 'tabs', markup: '<div class="tabs"><button class="active">A</button><button>B</button></div>' };
  const seg = { name: 'segmentedControl', markup: '<div class="seg"><button class="selected">A</button><button>B</button></div>' };
  // The system's segmented control is the switch; its tabs only stand in, and give way to the page's default.
  assert.equal(segmentedUi([tabs, seg]).standIn, null);
  assert.equal(segmentedUi([tabs]).standIn, 'tabs');
  const gen = readFileSync(join(ENGINE, 'styleguide-gen.mjs'), 'utf8');
  assert.match(gen, /view\.ui = \{ segmented: seg && !seg\.standIn \? seg : null,/);
  assert.doesNotMatch(gen, /radioGroupUi|buttonsAsSegmentedUi/, 'no radio group or buttons stand in for a segmented control');
  assert.equal(fieldUi([{ name: 'search', markup: '<div class="search"><input type="search" class="search-input"></div>' }], css).standIn, 'search field');
  const gaps = standInGaps({ segmented: null, field: null, button: { cls: 'b' }, card: null, iconButton: { cls: 'x' }, tip: null });
  assert.deepEqual(gaps.map((g) => g.say), [
    'This system has no segmented control, so the page uses its default segmented control, drawn with its tokens.',
    'This system has no text field, so the page uses a plain text input drawn with its tokens.',
    'This system has no card, so the page uses its default card, with the tables\' border and corners.',
    'This system has no tooltip, so the page uses its default tooltip, drawn with its tokens.',
  ]);
  assert.deepEqual(standInGaps({ segmented: {}, field: {}, button: {}, card: {}, iconButton: {}, tip: {} }), [], 'a system with them all: no note');
  // In the page: the default switch, a named group of plain buttons in the page's own track.
  const tpl = readFileSync(join(ENGINE, 'templates', 'styleguide.template.html'), 'utf8');
  const src = tpl.slice(tpl.indexOf('var SEG = DATA.ui'), tpl.indexOf('function segItems'));
  const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const doc = { addEventListener() {}, querySelectorAll: () => [] };
  const run = (ui) => new Function('DATA', 'esc', 'nudge', 'document', src + 'return { segHTML: segHTML, segSelect: segSelect, tipHTML: tipHTML };')({ ui }, esc, () => {}, doc);
  const d = run({});
  assert.equal(d.segHTML([{ v: 'a', label: 'A' }], 'Mode'), '<div aria-label="Mode" class="sg-seg sg-seg-default" role="group"><button type="button" data-v="a">A</button></div>');
  assert.match(tpl, /\.sg-seg-default > button\[aria-pressed="true"\] \{ background: var\(--sg-bg\);/);
  assert.match(tpl, /\.sg-seg-default > button \{[^}]*min-height: 1\.5rem;/, 'each option at least 24px tall (WCAG 2.5.8)');
  assert.doesNotMatch(tpl, /segHTML\((?:[^;]*?)\)\s*\+\s*'<\/div>'\s*:\s*''|segHTML\(\[\{ v: '', label: 'Not in the code yet'[^;]*\]\);/, 'every switch on the page is named');
  const cls = new Set(), attrs = {};
  const el = { classList: { toggle: (k, on) => (on ? cls.add(k) : cls.delete(k)) }, getAttribute: (a) => attrs[a] ?? null, setAttribute: (a, v) => { attrs[a] = v; }, removeAttribute: (a) => { delete attrs[a]; }, querySelector: () => null, dataset: {} };
  d.segSelect(el, true);
  assert.deepEqual([[...cls], attrs['aria-pressed']], [['selected'], 'true']);
  // An option the system's script made a radio says checked, never pressed (WCAG 4.1.2: a radio cannot be pressed).
  attrs.role = 'radio';
  d.segSelect(el, false);
  assert.deepEqual([attrs['aria-pressed'], attrs['aria-checked']], [undefined, 'false']);
  attrs.role = 'tab';
  d.segSelect(el, true);
  assert.equal(attrs['aria-selected'], 'true');
  // The system's own control, when it has one: its markup and its selected look.
  const s = run({ segmented: segmentedUi([seg]) });
  assert.match(s.segHTML([{ v: 'a', label: 'A' }], 'Mode'), /^<div aria-label="Mode" class="seg"><button type="button" data-v="a">A<\/button><\/div>$/);
  // The tip: the system's own trigger, else the page's default one, its words in a bubble the trigger describes.
  assert.equal(d.tipHTML('Counted so', 'How X is counted'), '<span class="sg-tip"><button type="button" class="sg-tip-btn" aria-label="How X is counted" aria-describedby="sg-tip-1">?</button><span class="sg-tip-bubble" role="tooltip" id="sg-tip-1">Counted so</span></span>');
  assert.equal(run({ tip: { markup: '<button class="info" data-tip="{tip}" aria-label="{name}"></button>' } }).tipHTML('A & B', 'N'), '<button class="info" data-tip="A &amp; B" aria-label="N"></button>');
  assert.match(tpl, /\.sg-tip:hover > \.sg-tip-bubble, \.sg-tip:focus-within > \.sg-tip-bubble \{ visibility: visible; \}/);
  assert.match(tpl, /if \(e\.key === 'Escape'\)[^\n]*is-dismissed/, 'Escape closes it (WCAG 1.4.13)');
  // The overview's cards: the tables' border, corners and shadow on the page's own cards, never taken away by a reset.
  assert.match(tpl, /\.sg-card\.sg-card--own \{ border: var\(--sg-line\); border-radius: var\(--sg-radius\); box-shadow: var\(--sg-shadow\); background: var\(--sg-bg\);/);
  assert.match(tpl, /\.pg-par-card \{ border: var\(--sg-line\); border-radius: var\(--sg-radius\); box-shadow: var\(--sg-shadow\);/);
  assert.match(tpl, /\(\(DATA\.ui && DATA\.ui\.gaps\) \|\| \[\]\)\.forEach\(function \(g\) \{ TODO\.push\(\{ who: 'both', comp: null, say: g\.say, todo: g\.todo \}\); \}\);/);
  // Each stand-in is a task on the Tasks page's last tab, Style guide, never a note on the overview.
  assert.doesNotMatch(tpl, /Stand-ins on this page/);
  assert.match(tpl, /area: t\.area \|\| \(comp \? 'Parity' : 'Style guide'\)/);
  assert.match(tpl, /var TODO_KINDS = \[[^\]]*'Accessibility', 'Style guide'\];/);
});

test('usage on every component, from Figma, the code or the authored contract; the page\'s own contrast in every mode', async () => {
  const { guidanceView, pageContrast } = await import('../styleguide-data.mjs');
  const { checkStyleguidePage, failures } = await import('../styleguide-check.mjs');
  const g = guidanceView({ description: 'A filter.\nWhen to use: to narrow a list.\nWhen not to use:\n- for navigation\n- for one choice', annotations: ['Role: button', 'Limitations: no icon on the right'], authored: { mistakes: 'Using it as a tag' } });
  assert.deepEqual(g.sections.map((x) => [x.key, x.text, x.from]), [
    ['whenToUse', ['to narrow a list.'], 'Figma'], ['whenNotToUse', ['for navigation', 'for one choice'], 'Figma'],
    ['mistakes', ['Using it as a tag'], 'contract.authored.json'], ['limitations', ['no icon on the right'], 'Figma']]);
  assert.deepEqual(guidanceView({ description: 'A filter.' }).missing, ['whenToUse', 'whenNotToUse', 'mistakes', 'limitations']);
  // What the products get wrong with it fills Common mistakes when the team wrote none; the team's own words win.
  const seen = guidanceView({ description: 'A filter.', seen: ['In a product, .x is placed on top of it (app.css).'] }).sections.find((x) => x.key === 'mistakes');
  assert.deepEqual([seen.text, seen.from], [['In a product, .x is placed on top of it (app.css).'], "the products' code, as the last audit found it"]);
  assert.deepEqual(guidanceView({ authored: { mistakes: 'Using it as a tag' }, seen: ['x'] }).sections.find((x) => x.key === 'mistakes').text, ['Using it as a tag']);
  assert.deepEqual(guidanceView({ note: 'Avoid: two in one row' }).sections[1].from, 'the code');
  // Grey #8a8a8a reads on white (3.4:1 fails) and on near-black in Dark (passes): only the failing pair is reported.
  const byVar = new Map([['--bg', { values: { light: '#ffffff', dark: '#1e1e1e' } }], ['--text', { values: { light: '#111111', dark: '#f0f0f0' } }], ['--muted', { values: { light: '#8a8a8a', dark: '#8a8a8a' } }]]);
  const low = pageContrast({ bg: 'var(--bg)', 'bg-2': 'var(--bg)', text: 'var(--text)', 'text-2': 'var(--text)', muted: 'var(--muted)' }, byVar);
  assert.deepEqual(low.map((c) => `${c.text} on ${c.on} in ${c.mode}`), ['muted on bg in light']);
  const page = `<html lang="en"><head><style>/*sg-contrast:${JSON.stringify(low)}*/</style></head><body><main><h1>S</h1></main></body></html>`;
  assert.match(failures(checkStyleguidePage(page, { missing: [] })).map((f) => f.why).join(), /muted text on its bg background is 3\.\d:1 in light, below 4\.5:1/);
});

test('built with: its own area, each component the overview\'s card with its preview, linked to its page', () => {
  const tpl = readFileSync(join(ENGINE, 'templates', 'styleguide.template.html'), 'utf8');
  assert.match(tpl, /\['built', 'Built with'\], \['used', 'Used in'\]/);
  const src = tpl.slice(tpl.indexOf('function builtWithHTML'), tpl.indexOf('function builtThumbs'));
  const html = new Function('DATA', 'esc', 'cid', src + 'return builtWithHTML;')({ ui: { card: { cls: 'card' } } }, (x) => String(x), (n) => 'c-' + n)({ uses: ['buttonPrimary', 'buttonSecondary'] });
  assert.equal(html, '<div class="sg-card-grid"><a class="sg-card card" href="#c-buttonPrimary"><div class="sg-thumb" aria-hidden="true" data-thumb="buttonPrimary"></div><h3>buttonPrimary</h3></a><a class="sg-card card" href="#c-buttonSecondary"><div class="sg-thumb" aria-hidden="true" data-thumb="buttonSecondary"></div><h3>buttonSecondary</h3></a></div>');
  assert.doesNotMatch(tpl.slice(tpl.indexOf('function importHTML'), tpl.indexOf('function builtWithHTML')), /pg-usage-label">Built with/, 'no longer a row of buttons under the import line');
  assert.match(tpl, /if \(!sec\.querySelector\('\.pg-area\[data-area="' \+ v \+ '"\]'\)\) v = 'play';/, 'a component without it opens on the playground');
});

test('the playground and the preview stay linked: a part\'s state set on the part, a product\'s selector ignored, a label edit changes only its words', async () => {
  const { optionEffect, ownSelector, realizedControls } = await import('../styleguide-data.mjs');
  assert.deepEqual(optionEffect('.radioButton', '.radioButton-input:checked'), { add: [], attrs: { checked: '' }, target: '.radioButton-input' });
  assert.deepEqual(optionEffect('.badge', '.badge.high'), { add: ['high'], attrs: {} });
  assert.equal(ownSelector('radioButton', '.step-item.done'), false);
  assert.equal(ownSelector('radioButton', '.radioButton-input:checked'), true);
  // A contract mapping State to a product's own markup (.step-item) is not the component's: Selected falls back to its
  // own :checked rule, and an option the code does not build is offered as not built, never drawn with another's look.
  const r = realizedControls({ name: 'radioButton', cls: 'radioButton',
    defs: { State: { type: 'VARIANT', defaultValue: 'Default', variantOptions: ['Default', 'Selected', 'Unselected'] } },
    propertyMap: { State: { Default: '.step-item', Selected: '.step-item.done', Unselected: '.step-item.unavailable' } },
    cssText: '.radioButton { display: flex } .radioButton-input:checked + .radioButton-circle { border-color: red }' });
  assert.deepEqual(r.controls[0].options, [{ label: 'Default' }, { label: 'Selected', add: [], attrs: { checked: '' }, target: '.radioButton-input' }, { label: 'Unselected', unbuilt: true }]);
  const tpl = readFileSync(join(ENGINE, 'templates', 'styleguide.template.html'), 'utf8');
  assert.match(tpl, /if \(!field\.value \|\| !leaf \|\| !cur \|\| !cur\.isConnected \|\| !cur\.contains\(leaf\)\) \{ refresh\(\); return; \}/, 'a label edit writes into its part, the rest as it is');
  assert.match(tpl, /o\.unbuilt \? 'Figma has this option; the code does not build it yet'/);
});

test('links and changelog: Figma, the code and the team\'s pages; each commit that changed the component, by its release and pull request', async () => {
  const { normalizeRepo, commitUrl, prUrl, fileUrl, changelogs } = await import('../component-changelog.mjs');
  assert.equal(normalizeRepo('git+https://github.com/o/r.git'), 'https://github.com/o/r');
  assert.equal(normalizeRepo('git@gitlab.example.com:team/ds.git'), 'https://gitlab.example.com/team/ds');
  assert.equal(fileUrl('https://github.com/o/r', 'main', 'src/theme.css', 12), 'https://github.com/o/r/blob/main/src/theme.css#L12');
  assert.equal(commitUrl('https://gitlab.example.com/team/ds', 'abc'), 'https://gitlab.example.com/team/ds/-/commit/abc');
  assert.equal(prUrl('https://github.com/o/r', '7'), 'https://github.com/o/r/pull/7');
  // A small repository: a commit on the badge's rule, released as v1.0.0, then one on another rule, then a pull request
  // that changes the badge again; a commit that did not touch the badge is never in its changelog.
  const dir = mkdtempSync(join(tmpdir(), 'changelog-'));
  const git = (...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8' });
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
  const css = (s) => writeFileSync(join(dir, 'theme.css'), s);
  css('.badge { color: red; }\n.chip { color: blue; }\n'); git('add', '.'); git('commit', '-qm', 'Badge and chip'); git('tag', 'v1.0.0');
  css('.badge { color: red; }\n.chip { color: green; }\n'); git('commit', '-qam', 'Chip colour');
  git('checkout', '-qb', 'feature'); css('.badge { color: maroon; }\n.chip { color: green; }\n'); git('commit', '-qam', 'Badge colour');
  git('checkout', '-q', 'main'); git('merge', '-q', '--no-ff', 'feature', '-m', 'Merge pull request #4 from o/feature');
  const logs = changelogs(dir, [{ name: 'badge', files: ['theme.css'], pattern: '\\.badge[^a-zA-Z0-9_-]' }]);
  assert.deepEqual(logs.badge.map((r) => [r.subject, r.release, r.pr]), [['Badge colour', null, '4'], ['Badge and chip', 'v1.0.0', null]]);
  const tpl = readFileSync(join(ENGINE, 'templates', 'styleguide.template.html'), 'utf8');
  assert.match(tpl, /\['log', 'Changelog'\]/);
  assert.match(tpl, /'<div class="pg-head"><h2>' \+ esc\(c\.name\) \+ '<\/h2>' \+ headLinksHTML\(c\.links\)/, 'its links at the top right, beside its name');
  assert.doesNotMatch(tpl, /<dt>Code last changed<\/dt>/, 'the dates live in the changelog, not the documentation');
  // Changelog: every component's changes by release, one row per commit with the components it touched.
  assert.match(tpl, /navLink\('changelog', 'changelog'\)/);
  assert.match(tpl, /One row per commit: the components it changed, then what it says\./);
  // A Width frame runs the system's own scripts and lets a selection move, as the live preview does.
  assert.match(tpl, /querySelectorAll\('script\[data-system-script\]'\)/);
  assert.match(tpl, /selectionMoves\(st\);/);
});

test('status and coverage: only what the team said (Figma, the code, the authored contract), on the card and under the name; the overview counts them and says what each group holds', async () => {
  const { statusView, coverageOf } = await import('../styleguide-data.mjs');
  assert.deepEqual(statusView({ description: 'A chip.\nStatus: beta' }), { status: 'Beta', kind: 'beta', from: 'Figma' });
  assert.deepEqual(statusView({ annotations: ['Maturity: Stable'] }), { status: 'Stable', kind: 'stable', from: 'Figma' });
  assert.deepEqual(statusView({ text: '/** @deprecated use Tag */' }), { status: 'Deprecated', kind: 'deprecated', from: 'the code' });
  assert.deepEqual(statusView({ authored: 'experimental' }), { status: 'Experimental', kind: 'beta', from: 'contract.authored.json' });
  assert.equal(statusView({ description: 'A chip used for status pills.' }), null, 'never guessed from words that only mention it');
  assert.deepEqual(coverageOf({ total: {}, '/repo/src/components/Chip.jsx': { lines: { pct: 87.5 } } }, 'src/components/Chip.jsx'), { lines: 87.5 });
  assert.equal(coverageOf({ total: {} }, 'src/components/Chip.jsx'), null);
  const tpl = readFileSync(join(ENGINE, 'templates', 'styleguide.template.html'), 'utf8');
  assert.match(tpl, /card\(cGrid, cid\(c\.name\), 'Components', c\.name, about\(c\), '', c\.status\)/);
  assert.match(tpl, /Tests cover ' \+ esc\(String\(Math\.round\(c\.coverage\.lines\)\)\) \+ '% of its lines/);
  assert.match(tpl, /group\('Foundations', GROUPS\.foundations \|\| /);
  assert.doesNotMatch(tpl, /'Status: ' \+ kinds|Usage written: |Open the To do list/, 'the overview counts nothing of its own');
  assert.match(tpl, /<div class="pg-stage-bar pg-stage-bar--top"><div class="pg-stage-mode"><\/div>/, 'the sizing mode in the bar above the stage');
  assert.match(tpl, /<div class="pg-stage-bar pg-stage-bar--bottom"><div class="pg-actions"><\/div><p class="pg-anat-line" hidden><\/p><div class="pg-stage-mode"><\/div>/, 'the colour mode in the bar below it, at the right, a button that plays how it moves at its left');
  assert.match(tpl, /\.pg-stage-mode \.sg-mode-label \{ position: absolute; width: 1px/, 'no visible label on the switches inside the playground');
  assert.match(tpl, /var cSet = colourSwitch\(cs, drawColors\)/, 'the colours page has its own Light and Dark switch');
  assert.match(tpl, /hexOf\(getComputedStyle\(el\)\.backgroundColor\)/, 'each colour shows the value it is drawn with');
  assert.match(tpl, /'<div class="pg-areas-scroll">' \+ tabsHTML\(|<div class="pg-areas-scroll">' \+ tabsHTML\(/, 'the areas are tabs');
  assert.match(tpl, /\.sg-tab\.is-on \{ box-shadow: inset 0 -2px 0 var\(--sg-text\); \}/, 'the page\'s own tabs mark the chosen one with a line, in the system\'s colour');
  assert.match(tpl, /if \(inspecting && WIDTH !== 'fit'\) showWidth\('fit'\);/, 'Inspect draws the component at Fit, in the middle of the stage');
  assert.match(tpl, /\.sg-token-sample > \.spacing-bar \{ height: var\(--sg-space-xxl\)/, 'every sample as tall as the others');
  assert.match(tpl, /function tokenCard\(head, rows\)/, 'colours, spacing and radii are lists in cards, the group as the head');
  assert.match(tpl, /sizeList\('radii', 'Radii'/, 'radii are listed as spacing is');
  assert.doesNotMatch(tpl, /Each swatch is the CSS variable itself/, 'no line under the colours title');
  assert.match(tpl, /a\.scoped && a\.attr === 'data-size'; \}, function \(a\) \{ return a\.scoped && a\.attr !== 'data-size'/, 'the sizing mode top left, the colour mode bottom right, inside the playground');
  assert.match(tpl, /\.sg-thumb-live \{[^}]*align-self: center/, 'a card preview is centred whatever its own rule says');
  // A card's picture holds the whole component: what it draws is measured (a modal's buttons past its panel), a
  // component squeezed out of its own box is drawn as wide as its content, and its own animation never holds it.
  const fit = tpl.slice(tpl.indexOf('function fitThumb('), tpl.indexOf('// The To do page'));
  assert.match(fit, /k\.style\.animation = 'none'/);
  assert.match(fit, /var over = k\.scrollWidth - k\.clientWidth; if \(over > 1\)/);
  assert.match(fit, /for \(var i = 0; i < e\.children\.length; i\+\+\) drawn\(e\.children\[i\]\)/);
  assert.match(fit, /'translate\(' \+ tx\.toFixed\(1\) \+ 'px, ' \+ ty\.toFixed\(1\) \+ 'px\) scale\('/);
  // On a phone every grid of cards is two side by side: the overview, the icons, Used in, the pictures in use.
  const phone = tpl.slice(tpl.indexOf('@media (max-width: 480px)'), tpl.indexOf('/* Each overview link is'));
  assert.match(phone, /\.sg-card-grid\.pg-usedin, \.sg-main \.sg-icon-grid, \.sg-main \.sg-screens \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/);
  // A token's value is never cut or broken inside a word; narrow token cards size their columns by what they hold.
  assert.match(tpl, /\.pg-inspect\.sg-token-card td\.sg-token-value \{ overflow-wrap: normal; \}/);
  assert.match(tpl, /@container \(max-width: 560px\) \{\s*\.pg-inspect\.sg-token-card table \{ table-layout: auto; \}/);
  // On a phone a card's line under its name starts where the name does.
  assert.match(phone, /\.sg-card-grid \.sg-card > h3 \{[^}]*padding: var\(--sg-space-s\) var\(--sg-space-m\); \}\s*\.sg-card-grid \.sg-card > h3 \+ p \{ padding: 0 var\(--sg-space-m\)/);
  // The Tasks page keeps its filter and counts at the top as it scrolls, in the title's place; the head rows under them.
  assert.match(tpl, /#tasks > h2 \{ position: static; \}/);
  assert.match(tpl, /\.pg-areas, \.sg-section:not\(\.pg-card-section\) > h2, \.sg-size-switch, \.sg-todo-head \{ position: sticky;/);
  assert.match(tpl, /function todoHeadHeight\(\) \{ stickHeight\(document\.getElementById\('tasks'\)\); \}/);
  // Every table's head sticks under what sticks at the top of its page, a card's head first: one measure for every page.
  assert.match(tpl, /function stickHeight\(sec\) \{[\s\S]*?setProperty\('--pg-areas-h'[\s\S]*?setProperty\('--pg-card-head-h'/);
  assert.match(tpl, /\.pg-inspect \{ border: var\(--sg-line\); border-radius: var\(--sg-radius\); overflow: clip;/, 'a card clips, so its head can stick');
  assert.match(tpl, /\.pg-inspect-head \{ position: sticky; top: calc\(var\(--sg-sticky-top, 0px\) \+ var\(--pg-areas-h, 0px\)\);/);
  // Spacing is its names and values, no bar per space; radii keep their samples.
  assert.match(tpl, /sizeList\('spacing', 'Spacing', TOKENS\.spacing, null\);/);
  assert.match(tpl, /sizeList\('radii', 'Radii', TOKENS\.radii, function \(t\) \{ return '<span class="sg-token-radius"/);
});

test('what uses each token: in a component\'s own rules, or through another token, nearest first', async () => {
  const { tokenUses, variantOf } = await import('../styleguide-data.mjs');
  const u = tokenUses(':root { --n100: #000; --btn-bg: var(--n100); --x: var(--btn-bg) } [data-theme="dark"] { --btn-bg: var(--n900) } .btn { background: var(--btn-bg); padding: var(--pad) } .chip { color: var(--n100) }', [{ name: 'button', cls: 'btn' }, { name: 'chip', cls: 'chip' }, { name: 'tip', cls: '#tt' }]);
  assert.deepEqual(u['--n100'], { direct: ['chip'], via: [{ name: 'button', through: '--btn-bg' }] });
  assert.deepEqual(u['--n900'], { direct: [], via: [{ name: 'button', through: '--btn-bg' }] }, 'a value in another mode counts too');
  assert.equal(u['--x'], undefined, 'a token nothing uses is not listed');
  assert.deepEqual([variantOf('Size=L, State=Default'), variantOf('notes'), variantOf(null)], [{ Size: 'L', State: 'Default' }, null, null]);
});

test('Figma images of each variant: the reference folder first, never the network without a token', async () => {
  const { figmaVariantImages } = await import('../visual-diff.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'figma-variants-'));
  try {
    mkdirSync(join(dir, 'refs', 'components', 'chip'), { recursive: true });
    writeFileSync(join(dir, 'refs', 'components', 'chip', 'Size=L.png'), 'x');
    writeFileSync(join(dir, 'refs', 'components', 'chip.png'), 'x');
    const r = await figmaVariantImages(dir, { visualRefs: 'refs' }, 'chip', { token: null });
    assert.deepEqual(r.images.map((i) => i.variant), [null, 'Size=L'], 'its default first, then each variant');
    let called = false;
    const none = await figmaVariantImages(dir, { visualRefs: 'refs', figmaFileKey: 'K' }, 'tag', { nodeId: '1:2', token: null, fetchImpl: () => { called = true; } });
    assert.deepEqual([none.images, called, /FIGMA_TOKEN/.test(none.why)], [[], false, true]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a text prop comes right after the boolean that shows it; the rest keep Figma\'s order and nothing is dropped', () => {
  const tpl = readFileSync(join(dirname(dirname(fileURLToPath(import.meta.url))), 'templates', 'styleguide.template.html'), 'utf8');
  const src = /  function showsText\(b, t\) \{[\s\S]*?\n  \}\n/.exec(tpl)[0] + /  function showFirst\(list, propOf\) \{[\s\S]*?\n  \}\n/.exec(tpl)[0];
  const showFirst = new Function(`${src}; return showFirst;`)();
  const order = (props) => showFirst(props, (p) => p).map((p) => p.label).join(' | ');
  assert.equal(order([{ label: 'State', type: 'VARIANT' }, { label: 'Text Content', type: 'TEXT', part: '.t' }, { label: 'Show Text', type: 'BOOLEAN', part: '.t' }, { label: 'Show Divider', type: 'BOOLEAN' }]), 'State | Show Text | Text Content | Show Divider');
  assert.equal(order([{ label: 'label-content', type: 'TEXT', part: 'span, [class*="label"]' }, { label: 'show-icon', type: 'BOOLEAN', part: 'svg' }, { label: 'show-label', type: 'BOOLEAN', part: 'span' }]), 'show-icon | show-label | label-content', 'matched by name when the parts are written differently');
  assert.equal(order([{ label: 'Value Content', type: 'TEXT' }, { label: 'Show Value', type: 'BOOLEAN' }, { label: 'Label', type: 'TEXT' }]), 'Show Value | Value Content | Label', 'a text no boolean shows stays where it is');
});

test('every box on the page looks like the system\'s own card: its border colour and width, radius and shadow', async () => {
  const { cardLook, chromeRoles } = await import('../styleguide-data.mjs');
  const css = '.card-title { color: red } .card { display: flex; border: var(--general-thickness) solid var(--card-border); border-radius: var(--radii-card); }';
  assert.deepEqual(cardLook(css, 'card'), { border: 'var(--card-border)', width: 'var(--general-thickness)', radius: 'var(--radii-card)', shadow: null });
  assert.equal(cardLook(css, 'tile'), null);
  const r = chromeRoles({ themeCss: css, card: { cls: 'card' } }).roles;
  assert.deepEqual([r.border, r['line-width'], r.radius, r['radius-l'], r.shadow], ['var(--card-border)', 'var(--general-thickness)', 'var(--radii-card)', 'var(--radii-card)', 'none']);
});

test('Do and Don\'t: pictures in the references, each named for its caption, do\'s first; a variant image can say its scale', async () => {
  const { exampleImages, figmaVariantImages } = await import('../visual-diff.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'figma-examples-'));
  try {
    for (const [kind, f] of [['dont', '2 Two buttons.png'], ['do', '1 One button.png'], ['do', 'notes.txt']]) { mkdirSync(join(dir, 'refs', 'components', 'button', kind), { recursive: true }); writeFileSync(join(dir, 'refs', 'components', 'button', kind, f), 'x'); }
    const ex = await exampleImages(dir, { visualRefs: 'refs' }, 'button', { token: null });
    assert.deepEqual(ex.map((e) => [e.kind, e.caption]), [['do', 'One button'], ['dont', 'Two buttons']]);
    writeFileSync(join(dir, 'refs', 'components', 'button', 'State=Hover@1x.png'), 'x');
    const r = await figmaVariantImages(dir, { visualRefs: 'refs' }, 'button', { token: null });
    assert.deepEqual(r.images.map((i) => [i.variant, i.scale]), [['State=Hover', 1]]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('in the browser: with a width chosen, a link to another component opens it', { timeout: 300000 }, async (t) => {
  const { findChrome, launchChrome, connectCDP, openPage, waitForTrue, FILE_PAGE_LOADED } = await import('../cdp.mjs');
  const chromePath = findChrome({ playwright: true });
  if (!chromePath || typeof WebSocket === 'undefined') { t.skip('no Chrome'); return; }
  const dir = fixtureProject(join(ENGINE, 'test', 'fixtures', 'tidepool-figma'), 'tp-nav-');
  const ref = join(ENGINE, 'test', 'skill-evals', 'build-reference');
  for (const p of ['src/styles/tokens.css', 'src/components/chip.css', 'src/components/Chip.jsx', 'src/components/button.css', 'src/components/Button.jsx']) { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), readFileSync(join(ref, p))); }
  spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--styleguide', '--no-a11y-bake'], { cwd: dir, encoding: 'utf8' });
  const c = await launchChrome(chromePath);
  try {
    const { send, on, close } = await connectCDP(c.wsUrl);
    const errors = []; on('Runtime.exceptionThrown', (p) => errors.push(p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text));
    const { sessionId } = await openPage(send, `file://${join(dir, '.design-system-engine-out/styleguide/index.html')}#c-chip`);
    await waitForTrue(send, sessionId, FILE_PAGE_LOADED);
    const run = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true }, sessionId)).result.value;
    await new Promise((r) => setTimeout(r, 300));
    await run(`document.querySelector('#c-chip .pg-width [data-v="desktop"]').click()`);
    await run(`document.querySelector('.sg-nav a[href="#c-button"]').click()`);
    await new Promise((r) => setTimeout(r, 500));
    assert.equal(await run(`[...document.querySelectorAll('main > section')].filter((s) => !s.hidden).map((s) => s.id).join()`), 'c-button', errors.join('\n'));
    assert.match(await run(`location.hash`), /^#c-button(\?width=desktop)?$/, 'no test text leaks into the address');
    assert.equal(await run(`!!document.querySelector('#c-button .pg-frame iframe') && document.querySelector('#c-button .pg-frame iframe').contentDocument.querySelector('.pg-frame-stage') !== null`), true, 'drawn at the width chosen');
    // The accessibility check's part of the measuring page draws only the components it names.
    const part = await openPage(send, `file://${join(dir, '.design-system-engine-out/styleguide/index.html')}?all&only=chip`);
    await waitForTrue(send, part.sessionId, FILE_PAGE_LOADED);
    await new Promise((r) => setTimeout(r, 300));
    assert.equal((await send('Runtime.evaluate', { expression: `[...document.querySelectorAll('main > section.pg-card-section')].map((s) => s.id).join()`, returnByValue: true }, part.sessionId)).result.value, 'c-chip');
    assert.deepEqual(errors, []);
    close();
  } finally { c.kill(); }
});

test('a foundation\'s size switch: only its samples take the size, no label, room below it', () => {
  const tpl = readFileSync(new URL('../templates/styleguide.template.html', import.meta.url), 'utf8');
  assert.match(tpl, /var sized = function \(el\) \{ axes\.forEach/);
  assert.match(tpl, /SGModes\.controls\(holder, function \(\) \{ draw\(sized\); \}/, 'the switch acts on a holder, never on the section');
  assert.match(tpl, /\.sg-size-switch \{ margin-bottom: var\(--sg-space-xxl\);/);
  assert.match(tpl, /\.sg-size-switch \.sg-mode-label \{ position: absolute; width: 1px/);
  assert.doesNotMatch(tpl, /sec\.classList\.add\('sg-scope'\)/);
});

// A style guide rule: every component with variants has the Variants area, and on/off props count as variants (a
// modal with Show Close Button and Show Actions has variants as much as a button with a Size).
test('Variants: a component with a variant prop or an on/off prop has the area; text, slots and swaps alone do not', () => {
  const tpl = readFileSync(join(ENGINE, 'templates', 'styleguide.template.html'), 'utf8');
  const fn = (name) => tpl.slice(tpl.indexOf(`function ${name}(c)`), tpl.indexOf('\n  }', tpl.indexOf(`function ${name}(c)`)) + 4).replace(/^(function \w+\(c\) \{ return [^\n]*\})[\s\S]*$/, '$1');
  const variantRows = new Function(`${fn('variantProps')}\n${fn('variantRows')}\nreturn variantRows;`)();
  const rows = (controls) => variantRows({ controls }).map((r) => r.label);
  assert.deepEqual(rows([{ type: 'BOOLEAN', label: 'Show Close Button', part: '.modal-close' }, { type: 'BOOLEAN', label: 'Show Actions', part: '.modal-footer' }, { type: 'TEXT', label: 'Title' }]), ['Show Close Button', 'Show Actions'], 'on/off props are variants');
  assert.deepEqual(rows([{ type: 'VARIANT', label: 'Size', options: [{ label: 'S' }, { label: 'M' }] }]), ['Size']);
  assert.deepEqual(rows([{ type: 'TEXT', label: 'Label' }, { type: 'SLOT', label: 'Slot' }, { type: 'INSTANCE_SWAP', label: 'Icon' }]), [], 'nothing to vary');
  // The area and its tab follow the same rows.
  assert.match(tpl, /\(ALL \|\| !variantRows\(c\)\.length \? '' : '<div class="pg-area" data-area="variants">/);
  assert.match(tpl, /a\[0\] !== 'variants' \|\| \(!ALL && variantRows\(c\)\.length\)/);
});

test('Width: the modes Figma gives a viewport width, narrowest first; none, none', async () => {
  const { viewportWidths } = await import('../styleguide-data.mjs');
  const vars = { modeVariants: { Sizing: { modes: [{ name: 'Desktop', snapshotKey: 'desktop' }, { name: 'Phone', snapshotKey: 'phone' }], vars: { 'padding/m': { values: { desktop: '12px', phone: '14px' } }, 'viewport/min-width': { values: { desktop: '1680px', phone: '350px' } } } } } };
  assert.deepEqual(viewportWidths(vars), [{ value: 'phone', label: 'Phone', px: 350 }, { value: 'desktop', label: 'Desktop', px: 1680 }]);
  assert.deepEqual(viewportWidths({ modeVariants: { Sizing: { modes: [], vars: { 'padding/m': {} } } } }), []);
});

test('a page title: the system\'s own heading when it has a large one, else its largest style scaled up', async () => {
  const { chromeRoles } = await import('../styleguide-data.mjs');
  const type = (sizes) => ({ typography: sizes.map((px, i) => ({ scale: ['s', 'm', 'l', 'xl'][i], size: { var: `--t${i}`, value: `${px}px` } })) });
  assert.equal(chromeRoles({ tokens: type([10, 11, 13]) }).roles.title, undefined, 'no large heading: the template scales the largest');
  assert.equal(chromeRoles({ tokens: type([12, 14, 16, 28]) }).roles.title, 'var(--t3)', 'its own heading, as it is');
  const tpl = readFileSync(join(ENGINE, 'templates', 'styleguide.template.html'), 'utf8');
  assert.match(tpl, /--sg-title: calc\(var\(--sg-h1\) \* var\(--sg-title-scale\)\)/);
  assert.match(tpl, /\.sg-section > h2, \.pg-head > h2 \{ font-size: var\(--sg-title\);/);
});

test('Health: each area counted by component, weighted into one number once accessibility is tried; AI readiness; the five components with the most left; each component weakest first', { timeout: 300000 }, async (t) => {
  const tpl = readFileSync(join(ENGINE, 'templates', 'styleguide.template.html'), 'utf8');
  // An item done counts whole, one to check half, one to fix nothing; the weights are the team's when it gives them.
  assert.match(tpl, /var HEALTH_PART = \{ done: 1, kept: 1, check: 0\.5, todo: 0 \};/);
  // Parity and accessibility count the component, so the many values that match never hide the one that does not:
  // whole with nothing left, half with only checks left, nothing while one thing is to fix.
  assert.match(tpl, /var HEALTH_WHOLE = \{ Parity: true, Accessibility: true \};/);
  const standing = new Function(`var HEALTH_PART = { done: 1, check: 0.5, todo: 0 }, HEALTH_WHOLE = { Parity: true, Accessibility: true }; ${tpl.match(/function healthStanding\(rows, area\) \{[\s\S]*?\n  \}/)[0]}; return healthStanding;`)();
  const rows = (done, check, todo) => [...Array(done).fill({ st: 'done' }), ...Array(check).fill({ st: 'check' }), ...Array(todo).fill({ st: 'todo' })];
  assert.equal(standing(rows(300, 0, 1), 'Parity'), 0, 'one value to fix among 300 that match');
  assert.equal(standing(rows(30, 4, 0), 'Accessibility'), 0.5, 'only checks left');
  assert.equal(standing(rows(30, 0, 0), 'Parity'), 1);
  assert.equal(standing(rows(2, 0, 5), 'Documentation'), 2 / 7, 'documentation counts each item');
  assert.equal(standing([], 'Motion'), null, 'nothing to measure');
  assert.match(tpl, /var w = DATA\.healthWeights && DATA\.healthWeights\[a\[0\]\]; return \[a\[0\], typeof w === 'number' && w >= 0 \? w : a\[1\]\];/);
  assert.match(readFileSync(join(ENGINE, 'styleguide-gen.mjs'), 'utf8'), /view\.healthWeights = cfg\.styleguide\.health\.weights;/);
  const { findChrome, launchChrome, connectCDP, openPage, waitForTrue, FILE_PAGE_LOADED } = await import('../cdp.mjs');
  const chromePath = findChrome({ playwright: true });
  if (!chromePath || typeof WebSocket === 'undefined') { t.skip('no Chrome'); return; }
  const dir = fixtureProject(join(ENGINE, 'test', 'fixtures', 'tidepool-figma'), 'tp-health-');
  const ref = join(ENGINE, 'test', 'skill-evals', 'build-reference');
  for (const p of ['src/styles/tokens.css', 'src/components/chip.css', 'src/components/Chip.jsx', 'src/components/button.css', 'src/components/Button.jsx']) { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), readFileSync(join(ref, p))); }
  const cfgFile = join(dir, 'ds-config.json'), cfg = JSON.parse(readFileSync(cfgFile, 'utf8'));
  writeFileSync(cfgFile, JSON.stringify({ ...cfg, styleguide: { ...(cfg.styleguide ?? {}), health: { weights: { Motion: 0 } } } }, null, 2));
  const r = spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--styleguide', '--no-a11y-bake'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const c = await launchChrome(chromePath);
  try {
    const { send, on, close } = await connectCDP(c.wsUrl);
    const errors = []; on('Runtime.exceptionThrown', (p) => errors.push(p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text));
    const { sessionId } = await openPage(send, `file://${join(dir, '.design-system-engine-out/styleguide/index.html')}#health`);
    await waitForTrue(send, sessionId, FILE_PAGE_LOADED);
    const run = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true }, sessionId)).result.value;
    assert.equal(await run(`!!document.querySelector('.sg-nav a[href="#health"]')`), true, 'its own entry in the side panel');
    // Accessibility waits until every component is tried in this browser, and the system's number with it.
    await waitForTrue(send, sessionId, `!/joins once/.test((document.querySelector('#health .sg-health-note') || {}).textContent || 'joins once')`, { attempts: 400 });
    const tiles = await run(`[...document.querySelectorAll('#health .sg-health-tile')].map((t) => [t.querySelector('.sg-health-label').textContent, t.querySelector('.sg-health-num').firstChild.textContent, t.querySelector('.sg-health-sub').textContent])`);
    assert.deepEqual(tiles.map((x) => x[0]), ['Health', 'Parity', 'Accessibility', 'Documentation', 'Motion', 'AI readiness'], errors.join('\n'));
    for (const [label, num] of [...tiles.slice(0, 4), tiles[5]]) assert.match(num, /^\d{1,3}$/, `${label} has a number`);
    assert.match(tiles[0][2], /^Weighted as Parity 35, Accessibility 30, Documentation 20, Motion 0$/, 'the team\'s weight replaces the page\'s');
    assert.match(tiles[1][2], /^\d+ of 2 components done(, \d+ to check)?$/, 'parity counts components');
    assert.match(tiles[3][2], /^\d+ of \d+ done$/, 'documentation counts items');
    // How each card's number is counted: the system's tip at its top right, or with none (this fixture) the page's default
    // tip, its words in a bubble the trigger describes.
    const how = await run(`[...document.querySelectorAll('#health .sg-health-tile')].map((t) => { const b = t.querySelector('.sg-health-top .sg-tip-btn'); return [!!b && b.getAttribute('aria-describedby') === (t.querySelector('.sg-tip-bubble') || {}).id, (t.querySelector('.sg-tip-bubble') || {}).textContent || '']; })`);
    for (const [hasTip, words] of how) { assert.equal(hasTip, true); assert.match(words, /counts|counted|share/); }
    assert.match(how[1][1], /^Each component counts the same\. One counts 100 when every prop, variable and value it has matches Figma, 50 when only rows to check are left, and 0 while one difference is still to fix, however many others match\. The number is the average over the 2 components compared\.$/);
    assert.match(how[0][1], /\(Parity 35, Accessibility 30, Documentation 20, Motion 0\)/);
    assert.match(tiles[5][2], /^\d of 2 components ready$/);
    // The five components with the most left, at most; then each WCAG criterion that fails or waits on a person, the
    // one that fails in most components first (G10).
    assert.deepEqual(await run(`[...document.querySelectorAll('#health .sg-health-card > h3')].map((h) => h.textContent)`), ['Components with the most left', 'Parity by type', 'Accessibility by WCAG criterion']);
    assert.ok(await run(`document.querySelectorAll('#health .sg-health-card:not(.sg-health-crit):not(.sg-health-types) .sg-health-list > li').length`) <= 5);
    // Parity by type (G11): each open difference by what it is about, split by where it comes from, the longest type a
    // full bar; the counts add up to the open differences said under it.
    const types = await run(`[...document.querySelectorAll('#health .sg-health-types .sg-health-list > li')].map((li) => [li.querySelector('.sg-health-row > span').textContent, li.querySelector('.sg-health-row > span:last-child').textContent, li.querySelectorAll('.sg-health-bar > span').length])`);
    assert.ok(types.length > 0, 'something differs in the fixture');
    let sum = 0;
    for (const [name, say, segs] of types) {
      assert.ok(['Props', 'Variables', 'Values', 'Effects', 'Modes', 'Other'].includes(name), name);
      assert.match(say, /^(\d+ differs?)?(, )?(\d+ only in Figma)?(, )?(\d+ only in the code)?$/);
      assert.equal(segs, 3);
      sum += (say.match(/\d+/g) ?? []).map(Number).reduce((a, b) => a + b, 0);
    }
    assert.equal(await run(`document.querySelector('#health .sg-health-types > p.sg-health-sub').textContent`), `${sum} difference${sum === 1 ? '' : 's'} open. The dark part differs, the light part is only in Figma, the striped part only in the code.`);
    const crit = await run(`[...document.querySelectorAll('#health .sg-health-crit .sg-health-list > li')].map((li) => [li.querySelector('.sg-health-row > span').textContent, li.querySelector('.sg-health-row > span:last-child').textContent, li.querySelectorAll('.sg-health-bar > span').length])`);
    assert.ok(crit.length > 0, 'a criterion to fix or to check');
    const fails = crit.map((x) => Number((/(\d+) fail/.exec(x[1]) ?? [0, 0])[1]));
    for (const [name, say, segs] of crit) { assert.match(name, /^\d\.\d+\.\d+ .+ \(A+\)$/); assert.match(say, /^(\d+ fail)?(, )?(\d+ to check)?$/); assert.ok(Number(/\d+/.exec(say)[0]) <= 2); assert.equal(segs, 2); }
    assert.deepEqual(fails, [...fails].sort((a, b) => b - a), 'the criterion that fails in most components first');
    assert.match(await run(`document.querySelector('#health .sg-health-crit > p.sg-health-sub').textContent`), /^Of 2 components tried\. The dark part fails, the light part waits on a person's check\.$/);
    // What was checked (G15): of every check each component owes, the share that ran, with the count.
    const checked = await run(`[...document.querySelectorAll('#health .sg-health-comps tbody tr')].map((tr) => tr.querySelector('td[data-label="Checked"]').textContent)`);
    for (const v of checked) assert.match(v, /^(\d{1,3})%(\d+) of (\d+)$/);
    for (const v of checked) { const [, p, ran, of] = /^(\d+)%(\d+) of (\d+)$/.exec(v).map(Number); assert.equal(p, Math.round(ran / of * 100)); assert.ok(ran <= of); }
    assert.match(await run(`document.querySelector('#health .sg-health-note').textContent`), /Checked is the share of a component's checks that ran/);
    // Each component, the weakest first; a link to its own page; no task listed (they are on the Tasks page).
    const comps = await run(`[...document.querySelectorAll('#health .sg-health-comps tbody tr')].map((tr) => [tr.querySelector('a').getAttribute('href'), parseInt(tr.children[1].textContent, 10)])`);
    assert.deepEqual(comps.map((x) => x[0]).sort(), ['#c-button', '#c-chip']);
    assert.ok(comps[0][1] <= comps[1][1], 'the weakest first');
    const parityCells = await run(`[...document.querySelectorAll('#health .sg-health-comps tbody tr')].map((tr) => tr.querySelector('td[data-label="Parity"]').textContent)`);
    for (const v of parityCells) assert.match(v, /^(0|50|100)%$|^–$/, 'a component\'s parity is whole, half or nothing');
    assert.equal(await run(`document.querySelectorAll('#health .sg-todo-no').length`), 0);
    assert.deepEqual(errors, []);
    close();
  } finally { c.kill(); }
});

test('room around the Playground\'s component, what follows each title as close on every page, no feedback link', () => {
  const tpl = readFileSync(join(ENGINE, 'templates', 'styleguide.template.html'), 'utf8');
  // 100px above and below the component on a wide screen, 64px on a tablet or a narrow laptop, 40px on a phone.
  assert.match(tpl, /\.pg-preview-card \{ --pg-stage-room: 100px; \}/);
  assert.match(tpl, /@media \(max-width: 1100px\) \{ \.pg-preview-card \{ --pg-stage-room: 64px; \} \}/);
  assert.match(tpl, /@media \(max-width: 720px\) \{ \.pg-preview-card \{ --pg-stage-room: 40px; \} \}/);
  assert.match(tpl, /\.pg-preview-col > \.pg-preview, \.pg-preview-col > \.pg-anatomy, \.pg-preview-col > \.pg-frame \{ padding-top: var\(--pg-stage-room\); padding-bottom: var\(--pg-stage-room\); \}/);
  // The overview's links as a page's text under its title, a foundation's size switch too.
  assert.match(tpl, /\.sg-hero \{ margin-bottom: var\(--sg-space-s\); \}/);
  assert.match(tpl, /#overview > \.pg-links \{ margin: 0 0 var\(--sg-space-xl\); \}/);
  assert.match(tpl, /\.sg-section > h2 ~ \.sg-size-switch \{ padding-top: 0; \}/);
  assert.doesNotMatch(readFileSync(join(ENGINE, 'styleguide-gen.mjs'), 'utf8'), /Send feedback/);
});

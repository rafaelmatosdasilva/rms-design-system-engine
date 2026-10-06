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
  assert.equal(v.notAgreed.line, 'Left off this page until Figma and the code agree: 2 values where Figma and the code differ and 1 component the code does not have yet (field). Each one is in the To do list, with who does it and what to do.');
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
  const r = spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--styleguide'], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
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
  assert.deepEqual(data.modes, [{ label: 'Mode', values: [{ label: 'Light', value: '' }, { label: 'Dark', value: 'dark' }], attr: 'data-theme' }]);
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
    { label: 'Mode', values: [{ label: 'Light', value: 'light' }, { label: 'Dark', value: 'dark' }], attr: 'data-color', scoped: true, media: '(prefers-color-scheme: dark)', mediaValue: 'dark', restValue: 'light' },
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
  assert.deepEqual(modeAxes({ figma: { modes: [{ name: 'Day', cssSelector: 'root' }, { name: 'Night', cssSelector: 'class:night' }] } }), [{ label: 'Mode', values: [{ label: 'Day', value: '' }, { label: 'Night', value: 'night' }], classes: true }]);
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
    { dimension: 'typography', token: 'm/size', cssVar: '--m-size', value: '14px' }], fail: [{ token: 'x' }] };
  const vars = { color: { light: { 'surface/page/color': '#fff', 'text/primary/color': '#111' }, dark: { 'surface/page/color': '#000', 'text/primary/color': '#eee' } } };
  const t = agreedTokens(check, vars);
  assert.deepEqual(t.colors, [{ group: 'surface', items: [{ figma: 'surface/page', var: '--surface-page', values: { light: '#fff', dark: '#000' } }] }], 'text/primary differs in dark: not shown');
  assert.deepEqual([t.spacing.length, t.radii.length, t.sizing.length], [1, 1, 1]);
  assert.deepEqual(t.typography, [{ scale: 'm', size: { var: '--m-size', value: '14px' } }]);
  assert.equal(t.differences, 1);
});

test('the demo design system: its real markup from its page, and props named differently stay out', { timeout: 300000 }, () => {
  const dir = fixtureProject(join(ENGINE, 'test', 'fixtures', 'demo-ds'), 'demo-sg-');
  const r = spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--styleguide'], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
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
  // A Figma image of one variant, named as Figma names it, and a file that is not a variant name (left out).
  const shot = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  mkdirSync(join(dir, '.design-system-engine-refs', 'components', 'chip'), { recursive: true });
  writeFileSync(join(dir, '.design-system-engine-refs', 'components', 'chip', 'Size=L.png'), shot);
  writeFileSync(join(dir, '.design-system-engine-refs', 'components', 'chip', 'notes.png'), shot);
  // Do and Don't pictures, each named for its caption.
  for (const [kind, cap] of [['do', 'One filter per chip'], ['dont', 'A sentence in a chip']]) { mkdirSync(join(dir, '.design-system-engine-refs', 'components', 'chip', kind), { recursive: true }); writeFileSync(join(dir, '.design-system-engine-refs', 'components', 'chip', kind, `${cap}.png`), shot); }
  spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--styleguide'], { cwd: dir, encoding: 'utf8' });
  const c = await launchChrome(chromePath);
  try {
    const { send, on, close } = await connectCDP(c.wsUrl);
    const errors = []; on('Runtime.exceptionThrown', (p) => errors.push(p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text));
    const { sessionId } = await openPage(send, `file://${join(dir, '.design-system-engine-out/styleguide/index.html')}`);
    await waitForTrue(send, sessionId, FILE_PAGE_LOADED);
    const run = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true }, sessionId)).result.value;
    // One view at a time: the overview, with each component's thumbnail, and a component drawn when it is opened.
    assert.equal(await run(`document.querySelectorAll('main > section[id^="c-"]').length`), 0, 'no component drawn before it is opened');
    assert.equal(await run(`[...document.querySelectorAll('main > section')].filter((s) => !s.hidden).map((s) => s.id).join()`), 'overview');
    assert.equal(await run(`!!document.querySelector('a.sg-card[href="#c-chip"] .sg-thumb .chip')`), true, 'the card shows the component itself');
    await run(`location.hash = '#c-chip'`);
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(await run(`[...document.querySelectorAll('main > section')].filter((s) => !s.hidden).map((s) => s.id).join()`), 'c-chip');
    assert.equal(await run(`document.querySelectorAll('.pg-preview').length`), 1);
    assert.equal(await run(`document.querySelector('#c-chip .pg-preview .chip').getBoundingClientRect().height`), 24);
    await run(`[...document.querySelectorAll('#c-chip .pg-ctl button')].find((b) => b.textContent === 'L').click()`);
    assert.equal(await run(`document.querySelector('#c-chip .pg-preview .chip').classList.contains('chip--l')`), true);
    assert.match(await run(`document.querySelector('#c-chip .pg-tokens').textContent`), /--chip-background/);
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
    await run(`location.hash = '#overview'`); await new Promise((r) => setTimeout(r, 200));
    await run(`[...document.querySelectorAll('#c-chip .pg-ctl button')].find((b) => b.textContent === 'M').click()`);
    assert.equal(await run(`location.hash`), '#overview', 'a view not shown leaves the address alone');
    await run(`location.hash = '#c-chip?Size=L&Nope=1'`); await new Promise((r) => setTimeout(r, 300));
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
    const tokenBtn = `document.querySelector('#c-chip .pg-tokens .sg-token-link[data-token="--chip-background"]')`;
    const hashBefore = await run(`location.hash`);
    await run(`${tokenBtn}.click()`);
    assert.equal(await run(`${tokenBtn}.getAttribute('aria-expanded') + '|' + document.querySelector('.sg-token-pop').hidden + '|' + location.hash`), 'true|false|' + hashBefore);
    assert.match(await run(`document.querySelector('.sg-token-pop').textContent`), /--chip-background.*Used by.*chip.*Copy --chip-background/s);
    assert.equal(await run(`document.activeElement === document.querySelector('.sg-token-pop')`), true);
    await run(`document.querySelector('.sg-token-pop').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
    assert.equal(await run(`document.querySelector('.sg-token-pop').hidden + '|' + (document.activeElement === ${tokenBtn})`), 'true|true');
    // The full view of what uses a token stays at its address.
    await run(`location.hash = '#uses?t=--chip-background'`); await new Promise((r) => setTimeout(r, 300));
    assert.match(await run(`document.getElementById('uses').textContent`), /--chip-background.*One component uses it.*Used by.*chip/s);
    await run(`location.hash = '#c-chip?Size=L'`); await new Promise((r) => setTimeout(r, 300));
    // Its API read from Chip.jsx, and its accessibility: the role's obligations with their WCAG criterion, the text
    // contrast measured as drawn, and no browser check yet.
    assert.match(await run(`document.querySelector('#c-chip [data-area="docs"] .pg-footer').textContent`), /Props.*Label.*default Filter.*Read from src\/components\/Chip\.jsx/s);
    const a11y = await run(`[...document.querySelectorAll('#c-chip .pg-doc')].find((d) => /Accessibility/.test(d.querySelector('h3').textContent)).textContent`);
    assert.match(a11y, /togglebutton: a <button type="button"> with aria-pressed/);
    assert.match(a11y, /WCAG 2\.1\.1 Keyboard \(A\)/);
    assert.match(a11y, /Text contrast\d+\.\d:1 on "Filter", needs 4\.5:1.*Done/);
    assert.match(a11y, /Browser checkNot run yet.*Not checked yet/s);
    // One table like Parity's: what, what it means, a status with its sign, the WCAG criterion; a count above it.
    assert.match(a11y, /What.*What it means.*Status.*WCAG/);
    assert.match(await run(`document.querySelector('#c-chip .pg-a11y-sum').textContent`), /\d+ done.*\d+ not checked yet/);
    assert.equal(await run(`[...document.querySelectorAll('#c-chip .pg-a11y tbody tr')].every((r) => /^(done|todo|check|none)$/.test(r.dataset.status) && r.querySelector('.pg-par-sign'))`), true);
    await run(`document.querySelectorAll('#mode-controls button')[1].click()`);
    assert.equal(await run(`document.documentElement.getAttribute('data-theme')`), 'dark');
    assert.match(await run(`document.querySelector('#c-chip .pg-contrast').textContent`), /Text contrast.*(Done|To fix)/, 'measured again in the other mode');
    // On this variant: tried on the live component when the Accessibility area shows it, and again for another variant.
    await run(`[...document.querySelectorAll('#c-chip .pg-areas [data-v]')].find((b) => b.dataset.v === 'a11y').click()`);
    const live = await run(`document.querySelector('#c-chip .pg-a11y-live').textContent`);
    assert.match(live, /Tab reaches it once: "Filter"/);
    assert.match(live, /Given by the browser: Space flips aria-pressed/, 'a native button answers Space itself');
    assert.equal(await run(`document.querySelector('#c-chip .pg-preview .chip').classList.contains('chip--l')`), true, 'the variant is as set after the tries');
    assert.equal(await run(`document.querySelector('#c-chip [data-area="play"]').hidden`), true, 'the Playground stays out of sight');
    await run(`[...document.querySelectorAll('#c-chip .pg-areas [data-v]')].find((b) => b.dataset.v === 'play').click()`);
    // The tokens first, the code on their right, as tall as what it holds and never taller than the tokens.
    assert.equal(await run(`!!document.querySelector('#c-chip .pg-code-row > :first-child .pg-tokens') && document.querySelector('#c-chip .pg-code-row > :last-child').classList.contains('pg-code')`), true);
    assert.equal(await run(`(() => { const c = document.querySelector('#c-chip .pg-code'), t = document.querySelector('#c-chip .pg-tokens').closest('.pg-inspect'); return Math.abs(c.offsetTop - t.offsetTop) > 2 || (c.offsetHeight <= t.offsetHeight + 1 && c.offsetHeight < t.offsetHeight - 2); })()`), true, 'one line of code is not stretched to the tokens');
    // Its tokens: every one it is drawn with, its corners and spacing too, by Figma's name, with what it sets.
    const own = await run(`document.querySelector('#c-chip .pg-own').textContent`);
    for (const v of ['--chip-background', '--chip-text', '--gap-s', '--padding-xs', '--padding-s', '--radii-chip']) assert.ok(own.includes(v), v + ' in Its tokens: ' + own);
    assert.match(own, /border-radius/);
    // The page in areas, one at a time, switched with the system's own control; the chosen one stays for the next view.
    // Built with only where the component is made of others (the chip is not).
    assert.equal(await run(`[...document.querySelectorAll('#c-chip .pg-areas [data-v]')].map((b) => b.textContent.split(',')[0]).join()`), 'Playground,Variants,Documentation,Accessibility,Parity,Used in,Changelog', 'Specs is part of the Playground, not an area of its own');
    assert.equal(await run(`[...document.querySelectorAll('#c-chip .pg-area')].filter((a) => !a.hidden).map((a) => a.dataset.area).join()`), 'play');
    await run(`[...document.querySelectorAll('#c-chip .pg-areas [data-v]')].find((b) => b.dataset.v === 'parity').click()`);
    assert.equal(await run(`[...document.querySelectorAll('#c-chip .pg-area')].filter((a) => !a.hidden).map((a) => a.dataset.area).join()`), 'parity');
    // Parity: one table of everything the chip has (props, variables, values), Figma beside code, a status and when.
    const parRows = await run(`[...document.querySelectorAll('#c-chip .pg-par-table tbody tr')].map((r) => r.dataset.type + ':' + r.dataset.status)`);
    assert.ok(parRows.some((r) => /^Prop:/.test(r)) && parRows.some((r) => /^Variable:/.test(r)), 'props and variables: ' + parRows);
    assert.match(await run(`document.querySelector('#c-chip [data-area="parity"]').textContent`), /Parity with Figma.*the same.*differ.*only in Figma.*only in code.*Type.*Figma.*Code.*Status.*Updated/s);
    // The filter shows one type at a time.
    await run(`[...document.querySelectorAll('#c-chip .pg-par-filter [data-v]')].find((b) => b.dataset.v === 'Prop').click()`);
    assert.deepEqual(await run(`[...new Set([...document.querySelectorAll('#c-chip .pg-par-table tbody tr')].filter((r) => !r.hidden).map((r) => r.dataset.type))]`), ['Prop']);
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
    // A mode switched while inspecting reaches the drawing: the inspector carries the Playground's modes.
    const tplSrc = readFileSync(join(ENGINE, 'templates', 'styleguide.template.html'), 'utf8');
    assert.match(tplSrc, /SGModes\.controls\(preview, function \(\) \{ refresh\(\); if \(inspecting\) requestAnimationFrame\(drawAnatomy\); \}/);
    assert.match(tplSrc, /else if \(preview\.hasAttribute\(a\.attr\)\) anatBox\.setAttribute\(a\.attr, preview\.getAttribute\(a\.attr\)\)/);
    assert.ok(await run(`!!document.querySelector('#c-chip [data-area="play"] .pg-own')`), 'Its tokens, in the Playground');
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
    // Each section of rows in the Playground's tables: its title the head (Usage, Accessibility).
    assert.match(await run(`[...document.querySelectorAll('#c-chip .pg-doc-card > .pg-inspect-head > h3')].map((h) => h.textContent).join()`), /Usage/);
    assert.equal(await run(`!!document.querySelector('#c-chip [data-area="play"] .pg-anatomy-doc')`), false, 'no Anatomy card under the Playground');
    // Its header: only its version and when it last changed (with the time), its links at the top right, no issue link.
    assert.doesNotMatch(await run(`(document.querySelector('#c-chip .pg-facts') || {}).textContent || ''`), /Figma|Accessibility|Used in/);
    assert.doesNotMatch(await run(`document.querySelector('#c-chip .pg-header').textContent`), /Report an issue/);
    // What the Parity table marks counts: the chip's pressed prop is only in the code.
    assert.match(await run(`document.querySelector('#overview .sg-card[href="#c-chip"] .sg-card-facts').textContent`), /^Figma 1 only in code.*Accessibility not checked$/s);
    // The name stays beside the areas; Parity says what it marks to a screen reader (Tidepool has no alert icon to draw
    // before its label), and the page no line about it. Accessibility, with nothing found, says nothing.
    assert.equal(await run(`document.querySelector('#c-chip .pg-areas > .pg-areas-name').textContent + '|' + document.querySelector('#c-chip .pg-areas [data-v="parity"]').textContent + '|' + document.querySelector('#c-chip .pg-areas [data-v="a11y"]').textContent + '|' + !!document.querySelector('#c-chip [data-area-go]')`), 'chip|Parity, 1 only in code|Accessibility|false');
    // Parity's table head stays in view under the areas as its rows scroll by.
    assert.equal(await run(`getComputedStyle(document.querySelector('#c-chip .pg-par-table th')).position`), 'sticky');
    // On a phone the areas scroll sideways in one row, never wrap; the one chosen scrolls into view.
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 800, deviceScaleFactor: 1, mobile: true }, sessionId);
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(await run(`(() => { const s = document.querySelector('#c-chip .pg-areas-scroll'), items = [...s.querySelectorAll('[data-v]')]; return s.scrollWidth > s.clientWidth && new Set(items.map((b) => Math.round(b.getBoundingClientRect().top))).size === 1 && document.documentElement.scrollWidth <= innerWidth; })()`), true, 'one row that scrolls, the page itself no wider than the screen');
    await run(`[...document.querySelectorAll('#c-chip .pg-areas [data-v]')].find((b) => b.dataset.v === 'play').click()`);
    assert.ok(await run(`(() => { const p = document.querySelector('#c-chip .pg-preview').getBoundingClientRect(), t = document.querySelector('#c-chip .pg-stage-bar--top').getBoundingClientRect(); return t.bottom <= p.top + 1; })()`), 'the bar sits above the stage, never over the component');
    await run(`[...document.querySelectorAll('#c-chip .pg-areas [data-v]')].find((b) => b.dataset.v === 'log').click()`);
    assert.equal(await run(`(() => { const s = document.querySelector('#c-chip .pg-areas-scroll'), b = s.querySelector('[data-v="log"]').getBoundingClientRect(), r = s.getBoundingClientRect(); return s.scrollLeft > 0 && b.right <= r.right + 1; })()`), true, 'Changelog scrolled into view');
    await run(`[...document.querySelectorAll('#c-chip .pg-areas [data-v]')].find((b) => b.dataset.v === 'docs').click()`);
    await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 800, deviceScaleFactor: 1, mobile: false }, sessionId);
    // How to use it: the same four sections on every page, a missing one said; the overview counts them.
    assert.match(await run(`document.querySelector('#c-chip [data-area="docs"]').textContent`), /Usage.*When to use.*When not to use.*Common mistakes.*Limitations.*Not written yet/s);
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
    assert.equal(await run(`document.querySelector('#c-button .pg-preview button').disabled`), false);
    // How a product brings it in: the import line, copied by the system's button.
    assert.equal(await run(`document.querySelector('#c-chip .pg-import code').textContent`), "import { Chip } from '@/components/Chip';");
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
  spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--styleguide'], { cwd: dir, encoding: 'utf8' });
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
  assert.match(tpl, /if \(b\.getAttribute\('aria-pressed'\) === 'true' \|\| b\.dataset\.on === '1'\) return;/);
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

test('a title in the style guide has no line under it; each type style lists its family, size, weight, line height and letter spacing', () => {
  const tpl = readFileSync(join(dirname(dirname(fileURLToPath(import.meta.url))), 'templates', 'styleguide.template.html'), 'utf8');
  const h3 = /\.sg-subsection > h3 \{[^}]*\}/.exec(tpl)[0];
  assert.doesNotMatch(h3, /border-bottom/);
  for (const k of ['family', 'size', 'weight', 'line height', 'letter spacing']) assert.match(tpl, new RegExp("\\['" + k + "', val\\("));
  assert.match(tpl, /row\.querySelector\('table'\)\.innerHTML = rowsHTML\(lines\);/);   // a token table, as a component has
});

test('a component has no Computed box: the tokens behind what is drawn, and its own tokens, are what sits below it', () => {
  const tpl = readFileSync(join(dirname(dirname(fileURLToPath(import.meta.url))), 'templates', 'styleguide.template.html'), 'utf8');
  assert.doesNotMatch(tpl, /pg-computed|>Computed</);
  assert.match(tpl, /<div class="pg-inspect-head">Tokens<\/div>/);
});

test('typography follows Figma: its text styles in Figma\'s order, each value named by the Figma variable it binds', () => {
  const check = { passVars: [['m', '11px'], ['l', '13px']].flatMap(([k, v]) => [{ dimension: 'typography', token: `${k}/size`, cssVar: `--${k}-size`, value: v }]) };
  const vars = { typography: { l: { size: '13px' }, m: { size: '11px' } }, sizing: { 'typography/l/font-size': '13px', 'typography/m/font-size': '11px' }, strings: { 'font-family': 'inter' } };
  const t = agreedTokens(check, vars).typography;
  assert.deepEqual(t.map((x) => x.scale), ['l', 'm']);
  assert.equal(t[1].size.figma, 'typography/m/font-size');
  assert.deepEqual(t[0].family, { figma: 'font-family', value: 'inter' });
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
  assert.deepEqual(a11yView({ name: 'card', result: { checkedAt: 't', notRead: ['card (not rendered)'], issues: [] } }).checked, { at: 't', notRead: true, issues: [] });
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

test('an accessibility finding goes to Accessibility, a difference from Figma to Parity', async () => {
  const { splitFindings } = await import('../styleguide-data.mjs');
  const { parity, a11y } = splitFindings([{ check: 'State contrast', what: 'badge [Type=Warning · light]: 2.04:1 (needs 4.5:1)' }, { check: 'Structure', what: 'badge · height: Figma 20, code 22' }, { check: 'Token layering', what: 'x' }]);
  assert.deepEqual(parity.map((x) => x.check), ['Structure', 'Token layering']);
  assert.deepEqual(a11y.map((x) => x.check), ['State contrast']);
  const html = readFileSync(new URL('../templates/styleguide.template.html', import.meta.url), 'utf8');
  assert.match(html, /a11yRow\('todo', contrast \? 'Text contrast' : 'To fix'/, 'the Accessibility area lists what to fix');
  assert.match(html, /a\[0\] === 'a11y' \? facts\.a11y/, 'the Accessibility tab carries the alert icon');
  assert.match(html, /if \(o\.icon\) text = '<svg class="sg-seg-icon"[^\n]*' \+ text;/, 'the icon before the label');
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

test('parity, what goes inside: a slot or swap in an HTML and CSS system is the markup\'s content; the code\'s props as a list', async () => {
  const { parityRows } = await import('../styleguide-data.mjs');
  const props = { 'Main Content#1:0': { type: 'SLOT' }, 'Icon Content#2:0': { type: 'INSTANCE_SWAP' }, 'Badge#3:0': { type: 'BOOLEAN', defaultValue: false } };
  const html = parityRows({ name: 'panel', propsSnap: { panel: { properties: props } }, unbuilt: [{ label: 'Badge' }] });
  assert.deepEqual(html.map((r) => [r.figma?.name, r.code?.name ?? '-', r.status]), [['Main Content', 'its content', 'match'], ['Icon Content', 'its content', 'match'], ['Badge', '-', 'figma']], 'one not built stays only in Figma');
  // With code props (a list, as the API reader gives them): a slot is the children it takes, a swap needs a prop of its own.
  const jsx = parityRows({ name: 'panel', propsSnap: { panel: { properties: props } }, codeProps: [{ name: 'children' }, { name: 'Badge', default: 'false' }, { name: 'pressed', default: 'false' }] });
  assert.deepEqual(jsx.map((r) => [r.figma?.name ?? '-', r.code?.name ?? '-', r.status]), [['Main Content', 'children', 'match'], ['Icon Content', '-', 'figma'], ['Badge', 'Badge', 'match'], ['-', 'pressed', 'code']]);
});

test('import line and nesting: as a product writes the import, and the system\'s components it is built with', async () => {
  const { importOf, nestedComponents } = await import('../styleguide-data.mjs');
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

test('a control the system lacks: its stand-in draws the switch, and the page says so on the overview and in the To do list', async () => {
  const { segmentedUi, radioGroupUi, buttonsAsSegmentedUi, fieldUi, standInGaps } = await import('../styleguide-data.mjs');
  const css = '.tabs{} .radio{} .radio-input{} .radio-label{} .bPrimary{} .bSecondary{} .label{} .search{} .search-input{}';
  const tabs = { name: 'tabs', markup: '<div class="tabs"><button class="active">A</button><button>B</button></div>' };
  const radio = { name: 'radio', markup: '<label class="radio"><input type="radio" class="radio-input"><span class="radio-label">One</span></label>' };
  const primary = { name: 'bPrimary', role: 'button', markup: '<button class="bPrimary"><span class="label">Go</span></button>' };
  const secondary = { name: 'bSecondary', role: 'button', markup: '<button class="bSecondary"><span class="label">Back</span></button>' };
  const pick = (comps) => segmentedUi(comps) ?? radioGroupUi(comps, css) ?? buttonsAsSegmentedUi(comps, css);
  // Tabs first, then a radio group, then the system's buttons: the selected one in its strongest look.
  assert.equal(pick([tabs, radio, primary]).standIn, 'tabs');
  assert.deepEqual(pick([radio, primary]).item, { tag: 'label', classes: ['radio'], label: 'radio-label', radio: ['radio-input'] });
  const btn = pick([primary, secondary]);
  assert.deepEqual([btn.standIn, btn.item.classes, btn.selected], ['buttons', ['bSecondary'], { add: ['bPrimary'], remove: ['bSecondary'], attrs: {} }]);
  assert.deepEqual([pick([primary]).item.classes, pick([primary]).selected.add], [[], ['bPrimary']], 'one button: the selected choice wears it, the others are plain');
  assert.equal(pick([]), null);
  assert.equal(fieldUi([{ name: 'search', markup: '<div class="search"><input type="search" class="search-input"></div>' }], css).standIn, 'search field');
  const gaps = standInGaps({ segmented: btn, field: null, button: { cls: 'bSecondary' }, card: null, iconButton: { cls: 'x' } });
  assert.deepEqual(gaps.map((g) => g.say), [
    'This system has no segmented control, so the page uses its buttons side by side.',
    'This system has no text field, so the page uses a plain text input drawn with its tokens.',
    'This system has no card, so the page uses plain blocks drawn with its tokens.',
  ]);
  assert.deepEqual(standInGaps({ segmented: { standIn: null }, field: {}, button: {}, card: {}, iconButton: {} }), [], 'a system with them all: no note');
  // In the page: the stand-in's markup, its selected look swapped in, and each gap on the overview and in the To do list.
  const tpl = readFileSync(join(ENGINE, 'templates', 'styleguide.template.html'), 'utf8');
  const src = tpl.slice(tpl.indexOf('var SEG = DATA.ui'), tpl.indexOf('function segItems'));
  const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const run = (ui) => new Function('DATA', 'esc', 'nudge', src + 'return { segHTML: segHTML, segSelect: segSelect };')({ ui }, esc, () => {});
  const b = run({ segmented: btn });
  assert.equal(b.segHTML([{ v: 'a', label: 'A' }]), '<div class="sg-seg"><button type="button" class="bSecondary" data-v="a"><span class="label">A</span></button></div>');
  const cls = new Set(['bSecondary']), attrs = {};
  const el = { classList: { toggle: (k, on) => (on ? cls.add(k) : cls.delete(k)) }, setAttribute: (a, v) => { attrs[a] = v; }, removeAttribute: (a) => { delete attrs[a]; }, querySelector: () => null, dataset: {} };
  b.segSelect(el, true);
  assert.deepEqual([[...cls], attrs['aria-pressed']], [['bPrimary'], 'true']);
  const r = run({ segmented: pick([radio]) });
  assert.match(r.segHTML([{ v: 'a', label: 'A' }, { v: 'b', label: 'B', off: true }]), /^<div class="sg-seg" role="radiogroup"><label class="radio" data-v="a"><input type="radio" name="sg-r1" class="radio-input"><span class="radio-label">A<\/span><\/label><label class="radio" data-v="b" aria-disabled="true" title=""><input type="radio" name="sg-r1" class="radio-input" disabled>/);
  const input = { checked: false }, lab = { classList: { toggle() {} }, setAttribute: (a) => { throw new Error('no aria-pressed on a radio label: ' + a); }, removeAttribute() {}, querySelector: () => input, dataset: {} };
  r.segSelect(lab, true);
  assert.deepEqual([input.checked, lab.dataset.on], [true, '1']);
  assert.match(tpl, /\(\(DATA\.ui && DATA\.ui\.gaps\) \|\| \[\]\)\.forEach\(function \(g\) \{ TODO\.push\(\{ who: 'both', comp: null, say: g\.say, todo: g\.todo \}\); \}\);/);
  assert.match(tpl, /gp\.className = 'sg-pending sg-gap'; gp\.innerHTML = '<b>Stand-ins on this page<\/b><ul>' \+ GAPS\.map\(function \(g\) \{ return '<li>' \+ esc\(g\.say\) \+ '<\/li>'; \}\)/);
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
  const html = new Function('DATA', 'esc', src + 'return builtWithHTML;')({ ui: { card: { cls: 'card' } } }, (x) => String(x))({ uses: ['buttonPrimary', 'buttonSecondary'] });
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
  // What's new: every component's changes by release, one row per commit with the components it touched.
  assert.match(tpl, /navLink\('whats-new', 'what\\'s new'\)/);
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
  assert.match(tpl, /card\(cGrid, 'c-' \+ c\.name, 'Components', c\.name, about\(c\), '', c\.status, cardFacts\(c\)\)/);
  // Where a person reports a problem: the team's tracker with the component's name, else the repository's own.
  const { issueLink } = await import('../styleguide-data.mjs');
  assert.equal(issueLink({ template: 'https://redmine.example.com/projects/ds/issues/new?issue[subject]={title}', name: 'Chip' }), 'https://redmine.example.com/projects/ds/issues/new?issue[subject]=Chip%3A%20');
  assert.equal(issueLink({ repo: 'https://github.com/acme/ds', name: 'Chip' }), 'https://github.com/acme/ds/issues/new?title=Chip%3A%20');
  assert.equal(issueLink({ repo: 'https://gitlab.acme.com/ds/core', name: null }), 'https://gitlab.acme.com/ds/core/-/issues/new?issue[title]=Style%20guide%3A%20');
  assert.equal(issueLink({ repo: 'https://bitbucket.org/acme/ds', name: 'Chip' }), null);
  assert.match(tpl, /Tests cover ' \+ esc\(String\(Math\.round\(c\.coverage\.lines\)\)\) \+ '% of its lines/);
  assert.match(tpl, /group\('Foundations', GROUPS\.foundations \|\| /);
  assert.doesNotMatch(tpl, /'Status: ' \+ kinds|Usage written: |Open the To do list/, 'the overview counts nothing of its own');
  assert.match(tpl, /<div class="pg-stage-bar pg-stage-bar--top"><div class="pg-stage-mode"><\/div>/, 'the sizing mode in the bar above the stage');
  assert.match(tpl, /<div class="pg-stage-bar pg-stage-bar--bottom"><p class="pg-anat-line" hidden><\/p><div class="pg-stage-mode"><\/div>/, 'the colour mode in the bar below it, at the right');
  assert.match(tpl, /\.pg-stage-mode \.sg-mode-label \{ position: absolute; width: 1px/, 'no visible label on the switches inside the playground');
  assert.match(tpl, /\.sg-demo\.sg-colors \{ display: grid; grid-template-columns: repeat\(6, minmax\(0, 1fr\)\)/, 'six colours a row');
  assert.match(tpl, /a\.scoped && a\.attr === 'data-size'; \}, function \(a\) \{ return a\.scoped && a\.attr !== 'data-size'/, 'the sizing mode top left, the colour mode bottom right, inside the playground');
  assert.match(tpl, /\.sg-thumb-live \{[^}]*align-self: center/, 'a card preview is centred whatever its own rule says');
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
  const src = /  function showFirst\(list, propOf\) \{[\s\S]*?\n  \}\n/.exec(tpl)[0];
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
  spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--styleguide'], { cwd: dir, encoding: 'utf8' });
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
    assert.deepEqual(errors, []);
    close();
  } finally { c.kill(); }
});

test('a foundation\'s size switch: only its samples take the size, no label, room below it', () => {
  const tpl = readFileSync(new URL('../templates/styleguide.template.html', import.meta.url), 'utf8');
  assert.match(tpl, /var sized = function \(el\) \{ axes\.forEach/);
  assert.match(tpl, /SGModes\.controls\(holder, function \(\) \{ draw\(sized\); \}/, 'the switch acts on a holder, never on the section');
  assert.match(tpl, /\.sg-size-switch \{ margin-bottom: var\(--sg-space-xxl\); \}/);
  assert.match(tpl, /\.sg-size-switch \.sg-mode-label \{ position: absolute; width: 1px/);
  assert.doesNotMatch(tpl, /sec\.classList\.add\('sg-scope'\)/);
});

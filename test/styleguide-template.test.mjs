// The engine's default style guide: only what Figma and the code agree on, controls labelled with Figma's names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync, mkdtempSync } from 'node:fs';
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
  assert.deepEqual(data.modes, [{ label: 'Color', values: [{ label: 'Light', value: '' }, { label: 'Dark', value: 'dark' }], attr: 'data-theme' }]);
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

test('the mode axes: colour from the config, size from the sizing collection, nesting only where the CSS nests', () => {
  const vars = { modeVariants: { sizing: { modes: [{ name: 'Desktop', snapshotKey: 'desktop' }, { name: 'Phone', snapshotKey: 'phone' }], vars: { 'padding/m': { kind: 'scalar', values: { desktop: '12px', phone: '16px' } } } } } };
  assert.deepEqual(modeAxes({}, vars), [
    { label: 'Color', values: [{ label: 'Light', value: 'light' }, { label: 'Dark', value: 'dark' }], attr: 'data-color', scoped: true, media: '(prefers-color-scheme: dark)', mediaValue: 'dark', restValue: 'light' },
    { label: 'Size', attr: 'data-size', scoped: true, values: [{ label: 'Desktop', value: '' }, { label: 'Phone', value: 'phone', notInCode: true }] },
  ]);
  // A mode the code has CSS for (a [data-…] block, or an @media that sets the collection's variables) is drawn.
  assert.equal(modeAxes({}, vars, ':root[data-size="phone"] { --padding-m: 16px; }')[1].values[1].notInCode, undefined);
  const media = modeAxes({}, vars, ':root { --padding-m: 12px; } @media (max-width: 480px) { :root { --padding-m: 16px; } }')[1];
  assert.equal(media.values[1].notInCode, undefined);
  assert.deepEqual(media.values[0], { label: 'Desktop', value: 'desktop' }, 'a breakpoint mode makes the base a choice of its own');
  assert.deepEqual(media.changes, { phone: [{ name: 'padding/m', from: '12px', to: '16px' }] }, 'the switch says what the mode changes, from the code');
  assert.equal(media.media, '(max-width: 480px)', 'the page starts in the mode its own device or window gets');
  assert.deepEqual(modeAxes({ figma: { modes: [{ name: 'Day', cssSelector: 'root' }, { name: 'Night', cssSelector: 'class:night' }] } }), [{ label: 'Color', values: [{ label: 'Day', value: '' }, { label: 'Night', value: 'night' }], classes: true }]);
});

test('a component\'s real markup is the first instance in the project\'s own pages, without ids or handlers', () => {
  const page = '<script>var x = "<button class=\'cta\'>";</script><div id="app"><button id="go" class="cta big" onclick="go()"><svg></svg><span>Save</span></button><button class="cta">Two</button></div>';
  assert.equal(instanceMarkup(page, 'cta'), '<button class="cta big"><svg></svg><span>Save</span></button>');
  assert.equal(instanceMarkup('<label class="field">Name <input class="field__input"></label>', 'field'), '<label class="field">Name <input class="field__input"></label>');
  assert.equal(instanceMarkup('<div class="ctaX"></div>', 'cta'), null);
  assert.deepEqual(componentTokens('.cta { padding: var(--pad-m); color: var(--text) } .cta:hover { color: var(--text-hover) } .ctaX { color: var(--no) }', 'cta').map((t) => t.var), ['--pad-m', '--text', '--text-hover']);
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
  for (const p of ['src/styles/tokens.css', 'src/components/chip.css', 'src/components/Chip.jsx']) { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), readFileSync(join(ref, p), 'utf8')); }
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
    // Inspect: the live component marked where it is, each part and padding numbered, the list below naming the token
    // of each (its colours and text style included); never a second component.
    const inspectBtn = `[...document.querySelectorAll('#c-chip .pg-actions button')].find((b) => b.textContent === 'Inspect')`;
    await run(`${inspectBtn}.click()`);
    for (let i = 0; i < 60 && !(await run(`document.querySelectorAll('#c-chip .pg-preview .pg-inspect-marks .pg-anat-num').length`)); i++) await new Promise((r) => setTimeout(r, 50));
    assert.equal(await run(`${inspectBtn}.getAttribute('aria-pressed')`), 'true');
    assert.equal(await run(`document.querySelectorAll('#c-chip .pg-preview .chip').length`), 1);
    const looks = await run(`document.querySelector('#c-chip .pg-inspect-legend').textContent`);
    assert.match(looks, /Spacing.*chip padding.*--padding-[a-z]+/s);
    assert.match(looks, /--chip-[a-z-]+/, 'the colour tokens of what it draws');
    assert.equal(await run(`[...document.querySelectorAll('#c-chip .pg-inspect-marks .pg-anat-num')].map((n) => n.textContent).join()`), await run(`[...document.querySelectorAll('#c-chip .pg-inspect-legend b')].map((b) => b.textContent).join()`));
    // No number covers another: one that would is moved beside it, a line back to where it belongs.
    assert.equal(await run(`(() => { const r = [...document.querySelectorAll('#c-chip .pg-inspect-marks .pg-anat-num')].map((n) => n.getBoundingClientRect()); return r.some((a, i) => r.some((b, j) => j > i && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1)); })()`), false);
    // Width: a chosen width draws it in a frame of that width with the page's own stylesheets (Inspect goes off);
    // Fit brings the live preview back.
    await run(`document.querySelector('#c-chip .pg-width [data-v="phone"]').click()`);
    assert.equal(await run(`${inspectBtn}.getAttribute('aria-pressed') + '|' + document.querySelector('#c-chip .pg-inspect-legend').hidden + '|' + document.querySelector('#c-chip .pg-preview').hidden`), 'false|true|true');
    assert.equal(await run(`document.querySelector('#c-chip .pg-frame iframe').style.width`), '375px');
    assert.equal(await run(`(() => { const d = document.querySelector('#c-chip .pg-frame iframe').contentDocument; const e = d.querySelector('.pg-frame-stage .chip'); return !!e && d.defaultView.getComputedStyle(e).height; })()`), '32px', 'styled by the system in the frame, at the size set (L)');
    assert.match(await run(`document.querySelector('#c-chip .pg-frame-label').textContent`), /Phone.*375px wide/);
    await run(`document.querySelector('#c-chip .pg-width [data-v="fit"]').click()`);
    assert.equal(await run(`document.querySelector('#c-chip .pg-frame').hidden + '|' + document.querySelector('#c-chip .pg-preview').hidden`), 'true|false');
    // A link to the variant: the props set away from their defaults in the address, kept as they change, and a link
    // opened sets them, the controls following.
    assert.equal(await run(`location.hash`), '#c-chip?Size=L');
    assert.equal(await run(`[...document.querySelectorAll('#c-chip .pg-actions button')].some((b) => b.textContent === 'Copy link')`), true);
    await run(`location.hash = '#overview'`); await new Promise((r) => setTimeout(r, 200));
    await run(`[...document.querySelectorAll('#c-chip .pg-ctl button')].find((b) => b.textContent === 'M').click()`);
    assert.equal(await run(`location.hash`), '#overview', 'a view not shown leaves the address alone');
    await run(`location.hash = '#c-chip?Size=L&Nope=1'`); await new Promise((r) => setTimeout(r, 300));
    assert.equal(await run(`document.querySelector('#c-chip .pg-preview .chip').classList.contains('chip--l') + '|' + [...document.querySelectorAll('#c-chip .pg-ctl button')].find((b) => b.textContent === 'L').getAttribute('aria-pressed')`), 'true|true');
    // Its API read from Chip.jsx, and its accessibility: the role's obligations with their WCAG criterion, the text
    // contrast measured as drawn, and no browser check yet.
    assert.match(await run(`document.querySelector('#c-chip .pg-footer').textContent`), /Props.*Label.*default Filter.*Read from src\/components\/Chip\.jsx/s);
    const a11y = await run(`[...document.querySelectorAll('#c-chip .pg-doc')].find((d) => /Accessibility/.test(d.querySelector('h3').textContent)).textContent`);
    assert.match(a11y, /togglebutton: a <button type="button"> with aria-pressed/);
    assert.match(a11y, /WCAG 2\.1\.1 Keyboard \(A\)/);
    assert.match(a11y, /Passes: \d+\.\d:1 on "Filter", needs 4\.5:1/);
    assert.match(a11y, /Last audit.*Not run yet/s);
    await run(`document.querySelectorAll('#mode-controls button')[1].click()`);
    assert.equal(await run(`document.documentElement.getAttribute('data-theme')`), 'dark');
    assert.match(await run(`document.querySelector('#c-chip .pg-contrast').textContent`), /Passes|Fails/, 'measured again in the other mode');
    // On this variant: tried on the live component when the Accessibility area shows it, and again for another variant.
    await run(`[...document.querySelectorAll('#c-chip .pg-areas [data-v]')].find((b) => b.dataset.v === 'a11y').click()`);
    const live = await run(`document.querySelector('#c-chip .pg-a11y-live').textContent`);
    assert.match(live, /Tab reaches it once: "Filter"/);
    assert.match(live, /Given by the browser: Space flips aria-pressed/, 'a native button answers Space itself');
    assert.equal(await run(`document.querySelector('#c-chip .pg-preview .chip').classList.contains('chip--l')`), true, 'the variant is as set after the tries');
    assert.equal(await run(`document.querySelector('#c-chip [data-area="play"]').hidden`), true, 'the Playground stays out of sight');
    await run(`[...document.querySelectorAll('#c-chip .pg-areas [data-v]')].find((b) => b.dataset.v === 'play').click()`);
    // The page in areas, one at a time, switched with the system's own control; the chosen one stays for the next view.
    // Built with only where the component is made of others (the chip is not).
    assert.equal(await run(`[...document.querySelectorAll('#c-chip .pg-areas [data-v]')].map((b) => b.textContent).join()`), 'Playground,Documentation,Accessibility,Parity,Used in,Changelog');
    assert.equal(await run(`[...document.querySelectorAll('#c-chip .pg-area')].filter((a) => !a.hidden).map((a) => a.dataset.area).join()`), 'play');
    await run(`[...document.querySelectorAll('#c-chip .pg-areas [data-v]')].find((b) => b.dataset.v === 'parity').click()`);
    assert.equal(await run(`[...document.querySelectorAll('#c-chip .pg-area')].filter((a) => !a.hidden).map((a) => a.dataset.area).join()`), 'parity');
    assert.match(await run(`document.querySelector('#c-chip [data-area="parity"]').textContent`), /Parity with Figma.*agree/s);
    // Its anatomy, in Documentation: a copy drawn larger as the Playground set it, each part numbered, its padding
    // outlined and numbered after the parts and named by its token in the list (numbers, never colours), how it lines
    // its items up; never a second live component.
    await run(`[...document.querySelectorAll('#c-chip .pg-areas [data-v]')].find((b) => b.dataset.v === 'docs').click()`);
    // Drawn on the next frame: waited for, as a busy machine can take longer than a fixed pause.
    for (let i = 0; i < 60 && !(await run(`document.querySelectorAll('#c-chip .pg-anat-num').length`)); i++) await new Promise((r) => setTimeout(r, 50));
    assert.ok(await run(`document.querySelectorAll('#c-chip .pg-anat-num').length`) >= 1);
    assert.ok(await run(`document.querySelectorAll('#c-chip .pg-anat-space').length`) >= 2);
    assert.equal(await run(`[...document.querySelectorAll('#c-chip .pg-anat-marks > *')].every((m) => { const b = getComputedStyle(m).backgroundColor; return m.classList.contains('pg-anat-num') || b === 'rgba(0, 0, 0, 0)'; })`), true, 'no colour fills on the drawing');
    const legend = await run(`document.querySelector('#c-chip .pg-anat-legend').textContent`);
    assert.match(legend, /Parts.*Spacing.*chip padding.*--padding-[a-z]+.*Alignment.*row/s);
    const nums = await run(`[...document.querySelectorAll('#c-chip .pg-anat-num')].map((n) => n.textContent).join()`);
    assert.equal(nums, await run(`[...document.querySelectorAll('#c-chip .pg-anat-legend b')].map((b) => b.textContent).join()`), 'every number in the drawing is one in the list, in the same order');
    assert.equal(await run(`document.querySelector('#c-chip .pg-anatomy .chip').closest('[inert]') !== null`), true, 'the copy is inert and hidden from assistive technology');
    assert.ok(await run(`document.querySelector('#c-chip .pg-anatomy .chip').getBoundingClientRect().height`) > 24, 'drawn larger than in the playground');
    // How to use it: the same four sections on every page, a missing one said; the overview counts them.
    assert.match(await run(`document.querySelector('#c-chip [data-area="docs"]').textContent`), /Usage.*When to use.*When not to use.*Common mistakes.*Limitations.*Not written yet/s);
    // The menu: worded buttons; on a wide screen it hides and comes back.
    assert.equal(await run(`document.getElementById('sg-menu').textContent + '|' + document.getElementById('sg-nav-close').textContent`), 'Menu|Close menu');
    await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 800, deviceScaleFactor: 1, mobile: false }, sessionId);
    await run(`document.getElementById('sg-hide-nav').click()`);
    assert.equal(await run(`document.body.classList.contains('sg-nav-hidden') && getComputedStyle(document.getElementById('sg-sidebar')).display === 'none' && getComputedStyle(document.getElementById('sg-topbar')).display !== 'none'`), true);
    await run(`document.getElementById('sg-menu').click()`);
    assert.equal(await run(`document.body.classList.contains('sg-nav-hidden')`), false);
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
  assert.match(tpl, /importHTML\(c\) \+ linksHTML\(c\.links\)/);
  assert.doesNotMatch(tpl, /<dt>Code last changed<\/dt>/, 'the dates live in the changelog, not the documentation');
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
  assert.match(tpl, /card\(cGrid, 'c-' \+ c\.name, 'Components', c\.name, about\(c\), '', c\.status\)/);
  assert.match(tpl, /Tests cover ' \+ esc\(String\(Math\.round\(c\.coverage\.lines\)\)\) \+ '% of its lines/);
  assert.match(tpl, /group\('Foundations', GROUPS\.foundations \|\| /);
  assert.match(tpl, /sc\.textContent = 'Status: ' \+ kinds\.stable \+ ' stable, '/);
  assert.match(tpl, /\.sg-thumb-live \{[^}]*align-self: center/, 'a card preview is centred whatever its own rule says');
});

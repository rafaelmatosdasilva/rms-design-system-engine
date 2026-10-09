// Stage 4: the deeper accessibility checks. One small page breaks each rule once; the check must
// name each problem, and leave the parts that are fine alone. Browser cases need Chrome.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeFixture, runGate } from './helpers.mjs';
import { contractSemantics, sameRole, A11Y_GUIDE, groupSame, a11yItemLine, makeStep, pageLoadedExpression } from '../a11y-check.mjs';
import { stateContrastFindings, tokenContrastFindings, tintedVars } from '../contrast-check.mjs';
import { deriveContrastPairs } from '../pair-derive.mjs';
import { findChrome } from '../cdp.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const CHROME = findChrome({ playwright: true });
const HAS_CHROME = !!CHROME && typeof WebSocket !== 'undefined';

test('semantics: the contract names a role by element or aria, and Chrome role names are matched', () => {
  const dir = makeFixture({ 'contract.authored.json': { components: { Chip: { semantics: { element: 'button' } }, Menu: { semantics: { element: 'div', aria: { role: 'menu' } } }, Pic: { semantics: { element: 'img' } } } } });
  assert.deepEqual(contractSemantics(dir), { Chip: 'button', Menu: 'menu', Pic: 'img' });
  assert.equal(sameRole('image', 'img'), true);
  assert.equal(sameRole('generic', 'button'), false);
  for (const k of ['target', 'tabtrap', 'tabindex', 'escape', 'focusreturn', 'heading', 'motion', 'forcedfocus', 'spacing', 'reflow', 'semantics']) assert.ok(A11Y_GUIDE[k]?.fix, k);
});

test('token contrast: see-through text is blended, disabled pairs and see-through backgrounds are left out', () => {
  const r = tokenContrastFindings([{ text: 't', bg: 'b' }, { text: 'x', bg: 'glass' }], (n) => ({ t: '#00000040', b: '#ffffff', x: '#000000', glass: '#ffffff80' }[n]));
  assert.equal(r.checked, 1);
  assert.equal(r.findings[0].ratio < 4.5, true);            // 25% black on white is faint, not 21:1
  const names = ['card/text/disabled/color', 'card/background/disabled/color', 'card/border/color', 'card/divider/color', 'card/background/color'];
  assert.deepEqual(deriveContrastPairs(names), []);                                  // borders are opt-in
  const pairs = deriveContrastPairs(names, { boundaries: true });
  assert.deepEqual(pairs.map((p) => p.name), ['card/border/color on card/background/color']);   // never the divider
  assert.equal(pairs[0].large, true);                      // a border needs 3:1
});

test('state contrast: every mode and every produced state, disabled and pageless cases exempt', () => {
  const code = { components: {
    chip: { instance: { hasText: true }, props: { fontSize: { value: '12px' } }, colors: { light: { color: 'rgb(0, 0, 0)', backgroundColor: 'rgb(255, 255, 255)' }, dark: { color: 'rgb(90, 90, 90)', backgroundColor: 'rgb(60, 60, 60)' } },
      states: { 'State=Hover': { produced: 'forced :hover', changed: { color: { value: 'rgb(200, 200, 200)' } } }, 'State=Disabled': { produced: 'class .disabled', changed: { color: { value: 'rgb(230, 230, 230)' } } }, 'State=Selected': { produced: 'found an element already in this state (app)', changed: { color: { value: 'rgb(250, 250, 250)' } } } } },
    swatch: { instance: { hasText: false }, colors: { light: { color: 'rgb(0, 0, 0)', backgroundColor: 'rgb(0, 0, 0)' } } },
  } };
  const r = stateContrastFindings(code);
  assert.deepEqual(r.findings.map((f) => `${f.component}|${f.state}|${f.mode}`), ['chip|default|dark', 'chip|State=Hover|light']);
});

// The --json result of a page check; a page that was not checked fails with the reason, never as a JSON error.
const pageResult = (out) => {
  const at = out.indexOf('{');
  assert.ok(at > -1, `a11y-check printed no JSON:\n${out}`);
  const d = JSON.parse(out.slice(at));
  assert.equal(d.notChecked, undefined, `a11y-check did not check the page: ${d.notChecked}`);
  return d;
};

test('page: target size, a positive tabindex, Escape, reduced motion, forced colours, text spacing, semantics', { skip: HAS_CHROME ? false : 'no Chrome available' }, () => {
  const page = `<!doctype html><html><head><style>
    body { font: 14px sans-serif; }
    .tiny { width: 16px; height: 16px; padding: 0; margin: 0; border: 0; }
    .big { width: 40px; height: 40px; }
    .spin { transition: transform 300ms; }
    .shadow:focus { outline: none; box-shadow: 0 0 0 3px #0055ff; }
    .box { height: 18px; overflow: hidden; width: 120px; line-height: 18px; }
    .chip { display: inline-block; }
  </style></head><body>
    <button class="tiny" aria-label="a">a</button><button class="tiny" aria-label="b">b</button>
    <button class="big" tabindex="3">Jump</button>
    <button class="spin">Spin</button>
    <button class="shadow">Shadow focus</button>
    <div class="box">Fits now</div>
    <div class="chip">Chip that is not a button</div>
    <div role="dialog" aria-label="d"><button>Inside</button></div>
  </body></html>`;
  const dir = makeFixture({ 'page.html': page, 'contract.authored.json': { components: { Chip: { semantics: { element: 'button' } } } }, 'ds-config.json': { componentSelectors: { Chip: '.chip' } } });
  let out = '';
  try { out = execFileSync(process.execPath, [join(ENGINE, 'a11y-check.mjs'), '--url', pathToFileURL(join(dir, 'page.html')).href, '--json'], { cwd: dir, encoding: 'utf8', timeout: 120000, env: { ...process.env, CHROME_PATH: CHROME } }); }
  catch (e) { out = e.stdout ?? ''; }
  const d = pageResult(out);
  const kinds = (k) => d.issues.filter((i) => i.issue === k).map((i) => i.selector);
  assert.equal(kinds('target').length, 2, out);                               // both 16×16 buttons, 16px apart
  assert.ok(kinds('tabindex').some((s) => s.startsWith('button')), out);
  assert.ok(kinds('escape').length === 1, out);
  assert.ok(kinds('motion').some((s) => /spin/.test(s)), out);
  assert.ok(kinds('forcedfocus').some((s) => /button/.test(s)), out);           // a shadow-only focus ring
  assert.ok(kinds('spacing').some((s) => /box/.test(s)), out);
  assert.deepEqual(d.issues.filter((i) => i.issue === 'semantics').map((i) => [i.rendered, i.contract]), [['generic', 'button']], out);
});

test('page: Escape closes what a trigger opened and gives the focus back to it (I78); an app page has one main heading (I79)', { skip: HAS_CHROME ? false : 'no Chrome available' }, () => {
  const page = `<!doctype html><html lang="en"><head><style>[hidden] { display: none; } body { font: 14px sans-serif; }</style></head><body><main>
    <button id="good" aria-haspopup="dialog" aria-controls="dlg-good">Details</button>
    <div role="dialog" id="dlg-good" aria-label="Details" hidden><button id="good-close">Close</button></div>
    <button id="menu-btn" aria-haspopup="menu" aria-expanded="false" aria-controls="menu">Sort</button>
    <ul role="menu" id="menu" hidden><li role="menuitem" tabindex="-1">Newest</li></ul>
    <button id="stuck" aria-haspopup="dialog">Filters</button>
    <div role="dialog" id="dlg-stuck" aria-label="Filters" hidden><button>Apply</button></div>
  </main><script>
    const $ = (id) => document.getElementById(id);
    $('good').onclick = () => { $('dlg-good').hidden = false; $('good-close').focus(); };
    $('dlg-good').addEventListener('keydown', (e) => { if (e.key === 'Escape') { $('dlg-good').hidden = true; $('good').focus(); } });
    $('menu-btn').onclick = () => { $('menu').hidden = false; $('menu-btn').setAttribute('aria-expanded', 'true'); $('menu').querySelector('li').focus(); };
    $('menu').addEventListener('keydown', (e) => { if (e.key === 'Escape') { $('menu').hidden = true; $('menu-btn').setAttribute('aria-expanded', 'false'); document.activeElement.blur(); } });
    $('stuck').onclick = () => { $('dlg-stuck').hidden = false; $('dlg-stuck').querySelector('button').focus(); };
  </script></body></html>`;
  const dir = makeFixture({ 'page.html': page });
  let out = '';
  try { out = execFileSync(process.execPath, [join(ENGINE, 'a11y-check.mjs'), '--url', pathToFileURL(join(dir, 'page.html')).href, '--json'], { cwd: dir, encoding: 'utf8', timeout: 120000, env: { ...process.env, CHROME_PATH: CHROME } }); }
  catch (e) { out = e.stdout ?? ''; }
  const d = pageResult(out);
  const kinds = (k) => d.issues.filter((i) => i.issue === k).map((i) => i.selector);
  assert.deepEqual(kinds('focusreturn'), ['button#menu-btn: the focus goes to the page'], out);
  assert.deepEqual(kinds('escape'), ['dialog div#dlg-stuck (opened by button#stuck)'], out);
  assert.deepEqual(kinds('heading'), [`${pathToFileURL(join(dir, 'page.html')).href}: no main heading (h1)`], out);
  assert.match(d.issues.find((i) => i.issue === 'focusreturn').fix, /back to the control that opened it/);
});

test('tints: same-colour token pairs are not comparable; a see-through background is blended over its backdrop', async () => {
  const { backdropOf } = await import('../component-capture.mjs');
  const t = tokenContrastFindings([{ text: 'l', bg: 'b', name: 'tag label on tag bg' }], (n) => ({ l: '#c20000', b: '#c20000' }[n]));
  assert.deepEqual([t.checked, t.findings.length, t.sameColour.map((x) => x.name)], [0, 0, ['tag label on tag bg']]);
  assert.equal(backdropOf(['rgba(0, 0, 0, 0.5)', 'rgb(255, 255, 255)']), 'rgb(128, 128, 128)');
  assert.equal(backdropOf([]), null);
  const code = { components: { tag: { instance: { hasText: true }, props: { fontSize: { value: '12px' } },
    colors: { light: { color: 'rgb(194, 0, 0)', backgroundColor: 'color(srgb 0.76 0 0 / 0.12)', backdrop: 'rgb(255, 255, 255)' }, dark: { color: 'rgb(194, 0, 0)', backgroundColor: 'rgba(194, 0, 0, 0.12)' } } } } };
  const r = stateContrastFindings(code);
  assert.equal(r.checked, 1);                                   // dark has no backdrop: skipped, not guessed
  assert.equal(r.findings.length, 0);                           // red text on a 12% red tint over white passes
});

test('tints: a background the code paints see-through is measured as rendered, not as the solid token', () => {
  const code = { components: { tag: { props: { backgroundColor: { value: 'color(srgb 0.76 0 0 / 0.12)', var: '--tag-bg-red' } },
    states: { 'Type=Amber': { changed: { backgroundColor: { value: 'color(srgb 0.81 0.62 0 / 0.15)', var: '--tag-bg-amber' } } } } },
    card: { props: { backgroundColor: { value: 'rgb(255, 255, 255)', var: '--card-bg' } } } } };
  assert.deepEqual([...tintedVars(code)].sort(), ['--tag-bg-amber', '--tag-bg-red']);
  const pairs = [{ text: 'tag/label/amber', bg: 'tag/bg/amber' }, { text: 'card/text', bg: 'card/bg' }];
  const hex = { 'tag/label/amber': '#404040', 'tag/bg/amber': '#cf9e00', 'card/text': '#adadad', 'card/bg': '#ffffff' };
  const r = tokenContrastFindings(pairs, (n) => hex[n], { tinted: (t) => t === 'tag/bg/amber' });
  assert.deepEqual(r.sameColour.map((x) => [x.name, x.tinted]), [['tag/label/amber on tag/bg/amber', true]]);
  assert.deepEqual(r.findings.map((f) => f.name), ['card/text on card/bg']);   // a solid background is still measured
});

test('tints: a see-through background is measured over every surface of its mode, the worst one reported', () => {
  const code = { components: { tag: { instance: { hasText: true }, props: { fontSize: { value: '12px' } },
    colors: { dark: { color: 'rgb(254, 103, 103)', backgroundColor: 'rgba(254, 103, 103, 0.08)', backdrop: 'rgb(28, 28, 28)' } } } } };
  assert.equal(stateContrastFindings(code).findings.length, 0);                       // over the captured backdrop it passes
  const r = stateContrastFindings(code, {}, { surfaces: { dark: ['#1c1c1c', '#2c2c2c'] } });
  assert.equal(r.checked, 1);
  assert.deepEqual(r.findings.map((f) => [f.mode, f.onSurface, f.ratio < 4.5]), [['dark', '#2c2c2c', true]]);   // the lighter surface fails
});

test('the same element failing the same way in many places is one finding with a count', () => {
  const f = (text) => ({ kind: 'contrast', desc: 'button in .seg', theme: 'Dark', ratio: 2.02, threshold: 4.5, text });
  const g = groupSame([f('a'), f('b'), f('c'), f('d'), { ...f('e'), ratio: 3 }]);
  assert.equal(g.length, 2);
  assert.equal(g[0].places, 4);
  assert.match(a11yItemLine('contrast', g[0]), /"a", "b", "c".*in 4 places/);
  assert.equal(g[1].places, 1);
});

test('keyboard, zoom, focus hidden or thin, and Figma annotations', { skip: HAS_CHROME ? false : 'no Chrome available' }, () => {
  const page = `<!doctype html><html><head><style>
    body { font: 14px sans-serif; margin: 0; }
    header { position: fixed; top: 0; left: 0; right: 0; height: 120px; background: #fff; z-index: 9; }
    .under { position: absolute; top: 20px; left: 10px; }
    main { margin-top: 140px; }
    .zbox { width: 50vw; height: 18px; overflow: hidden; line-height: 18px; }
    .thin:focus { outline: 1px solid #000; }
    .fake, .good { display: inline-block; padding: 8px; }
  </style></head><body>
    <header>Sticky</header><button class="under">Under the header</button>
    <main>
      <div role="button" tabindex="0" class="fake">Fake</div>
      <div role="button" tabindex="0" class="good" onkeydown="if (event.key === 'Enter' || event.key === ' ') this.click()">Good</div>
      <div role="radiogroup" class="rg" aria-label="r"><div role="radio" tabindex="0" aria-checked="true">A</div><div role="radio" tabindex="-1" aria-checked="false">B</div></div>
      <div class="zbox">A sentence long enough to fit on one line at full width but not at double zoom</div>
      <button class="thin">Thin ring</button>
      <div class="chip">Chip</div>
    </main>
  </body></html>`;
  const dir = makeFixture({ 'page.html': page, 'figma-component-props.snapshot.json': { chip: { nodeId: '1:2', annotations: [{ label: 'Role: button' }] } }, 'ds-config.json': { componentSelectors: { chip: '.chip' } } });
  let out = '';
  try { out = execFileSync(process.execPath, [join(ENGINE, 'a11y-check.mjs'), '--url', pathToFileURL(join(dir, 'page.html')).href, '--json'], { cwd: dir, encoding: 'utf8', timeout: 120000, env: { ...process.env, CHROME_PATH: CHROME } }); }
  catch (e) { out = e.stdout ?? ''; }
  const d = pageResult(out);
  const kinds = (k) => d.issues.filter((i) => i.issue === k).map((i) => i.selector);
  assert.ok(kinds('activate').includes('div.fake [role=button] (Enter)'), out);
  assert.ok(!kinds('activate').some((x) => /good/.test(x)), out);            // handles the keys
  assert.equal(kinds('arrows').length, 1, out);
  assert.ok(kinds('obscured').some((s) => /under/.test(s)), out);
  assert.ok(kinds('zoom').some((s) => /zbox/.test(s)), out);
  assert.deepEqual(kinds('focusthin'), ['button'], out);                     // not the browser's own ring
  assert.deepEqual(kinds('annotation'), ['chip: Figma says role "button", it renders as "generic"'], out);
});

test('annotations: role, name, heading level and alt text are read from the note; other notes stay notes', async () => {
  const { annotationFacts, annotationMismatches, axeIntact, fileFromTgz } = await import('../a11y-check.mjs');
  assert.deepEqual(annotationFacts([{ label: 'Role: button. aria-label: Close dialog' }]), { role: 'button', name: 'Close dialog' });
  assert.deepEqual(annotationFacts([{ label: 'Heading level 2' }]), { level: 2, role: 'heading' });
  assert.deepEqual(annotationFacts([{ label: 'Alt text: Sales chart' }]), { name: 'Sales chart', role: 'img' });
  assert.deepEqual(annotationFacts([{ label: 'Icon can change depending on the feature' }]), {});
  assert.deepEqual(annotationMismatches({ level: 2, role: 'heading' }, { role: 'heading', level: 3 }), ['Figma says heading level 2, it renders as level 3']);
  // axe is only ever run when it matches the pinned hash.
  assert.equal(axeIntact('axe.run = () => {}'), false);
  const { gzipSync } = await import('node:zlib');
  const header = Buffer.alloc(512); header.write('package/axe.min.js'); header.write('00000000005\0', 124);
  const tgz = gzipSync(Buffer.concat([header, Buffer.from('hello'.padEnd(512, '\0')), Buffer.alloc(1024)]));
  assert.equal(fileFromTgz(tgz, 'package/axe.min.js'), 'hello');
});

test('annotations: composite roles, notes on inner layers; values in any language', async () => {
  const { annotationFacts, annotationMismatches, annotationFactsFor } = await import('../a11y-check.mjs');
  assert.deepEqual(annotationFacts([{ label: 'Role: button. aria-label: Fechar diálogo' }]), { role: 'button', name: 'Fechar diálogo' });
  assert.deepEqual(annotationFacts([{ label: 'role:togglebutton' }]), { role: 'button', pressed: true });
  assert.deepEqual(annotationFacts([{ label: 'role: textinput' }]), { role: 'textbox' });
  assert.deepEqual(annotationFacts([{ label: 'Papel: botão' }]), {});                  // keywords are English only
  assert.deepEqual(annotationMismatches({ role: 'button', pressed: true }, { role: 'button' }), ['Figma says it is a toggle button, it has no aria-pressed']);
  assert.deepEqual(annotationMismatches({ role: 'button', pressed: true }, { role: 'button', pressed: 'false' }), []);
  const dir = makeFixture({ 'figma-component-props.snapshot.json': { chip: { nodeId: '1:2', annotations: [{ label: 'O ícone muda conforme a funcionalidade' }], layerAnnotations: [{ layer: 'Label', annotations: [{ label: 'aria-label: Remover filtro' }] }] } } });
  assert.deepEqual(annotationFactsFor(dir), { chip: { facts: {}, layers: [{ layer: 'Label', facts: { name: 'Remover filtro' } }] } });
});

test('Gate 10g: a note the accessibility check verifies passes without a contract entry; prose still needs one', () => {
  const r = runGate('structure-check.mjs', {
    'ds-config.json': { paths: { themeCSS: 'theme.css', snapshotStructure: 's.json', pluginCSS: ['app.css'], compPropsSnapshot: 'props.json' } },
    's.json': { components: { chip: {} } },
    'app.css': '.chip {}',
    'theme.css': ':root {}',
    'structure-contract.mjs': "export const CONTRACT = { chip: {} };\nexport const COMPONENT_CSS_SELECTORS = { chip: { main: '.chip' } };\nexport const FIGMA_LAYOUT_TO_CSS = {};",
    'props.json': { chip: { nodeId: '1:2', properties: {}, annotations: [{ label: 'Role: button' }, { label: 'Only on wide screens' }] } },
  });
  assert.match(r.out, /"Role: button" is checked by the accessibility check|1\/2 Figma annotation/, r.out);
  assert.match(r.out, /annotation "Only on wide screens" not acknowledged/, r.out);
});

test('Gate 10g and the accessibility facts: a note in a design-intent category asks nothing; an uncategorised one still does', async () => {
  const { noteKey } = await import('../annotation-categories.mjs');
  const { annotationFactsFor, annotationUses } = await import('../a11y-check.mjs');
  const props = { chip: { nodeId: '1:2', properties: {}, annotations: [{ label: 'Role: button' }, { label: 'Only on wide screens' }, { label: 'Use h1 only on page title' }] } };
  const cats = { _updated: '2026-10-08T10:00:00Z', categories: { i: { label: 'Intent' } }, notes: { '1:2': { [noteKey('Only on wide screens')]: 'i', [noteKey('Use h1 only on page title')]: 'i' } } };
  const files = {
    'ds-config.json': { paths: { themeCSS: 'theme.css', snapshotStructure: 's.json', pluginCSS: ['app.css'], compPropsSnapshot: 'props.json' } },
    's.json': { components: { chip: {} } },
    'app.css': '.chip {}',
    'theme.css': ':root {}',
    'structure-contract.mjs': "export const CONTRACT = { chip: {} };\nexport const COMPONENT_CSS_SELECTORS = { chip: { main: '.chip' } };\nexport const FIGMA_LAYOUT_TO_CSS = {};",
    'props.json': props,
  };
  // The intent notes need no acknowledgement in the contract; the role note is still checked.
  const r = runGate('structure-check.mjs', { ...files, 'figma-annotation-categories.snapshot.json': cats });
  assert.doesNotMatch(r.out, /not acknowledged/, r.out);
  assert.match(r.out, /1\/1 Figma annotation acknowledgments/, r.out);   // the role note only: the intent notes are not counted
  // The facts the browser check verifies: the intent note's "h1" is no heading level. Without categories it still is.
  const cfg = { paths: { compPropsSnapshot: 'props.json' } };
  const withCats = annotationFactsFor(makeFixture({ 'props.json': props, 'figma-annotation-categories.snapshot.json': cats }), cfg).chip.facts;
  assert.deepEqual([withCats.role, withCats.level], ['button', undefined]);
  assert.equal(annotationFactsFor(makeFixture({ 'props.json': props }), cfg).chip.facts.level, 1);
  // Every note is still listed for the agents, an intent one with its kind and no check's use.
  assert.deepEqual(annotationUses(props.chip, { cats }).map((u) => [u.text, u.kind ?? null, u.uses.length > 0]),
    [['Role: button', null, true], ['Only on wide screens', 'intent', false], ['Use h1 only on page title', 'intent', false]]);
});

test('annotations in the browser: a toggle button without aria-pressed, and a note on an inner layer', { skip: HAS_CHROME ? false : 'no Chrome available' }, () => {
  const page = `<!doctype html><html><body>
    <button class="fav" aria-label="Favorito"><span class="lbl" aria-label="Salvar">★</span></button>
  </body></html>`;
  const dir = makeFixture({
    'page.html': page,
    'figma-component-props.snapshot.json': { fav: { nodeId: '1:2', annotations: [{ label: 'role:togglebutton' }], layerAnnotations: [{ layer: 'Icon', annotations: [{ label: 'aria-label: Favoritar' }] }, { layer: 'Badge', annotations: [{ label: 'Role: status' }] }] } },
    'structure-contract.mjs': "export const CONTRACT = { fav: { children: [{ name: 'Icon', cssSelector: '.fav .lbl' }] } };",
    'ds-config.json': { componentSelectors: { fav: '.fav' } },
  });
  let out = '';
  try { out = execFileSync(process.execPath, [join(ENGINE, 'a11y-check.mjs'), '--url', pathToFileURL(join(dir, 'page.html')).href, '--json'], { cwd: dir, encoding: 'utf8', timeout: 120000, env: { ...process.env, CHROME_PATH: CHROME } }); }
  catch (e) { out = e.stdout ?? ''; }
  const d = pageResult(out);
  const got = d.issues.filter((i) => i.issue === 'annotation').map((i) => i.selector);
  assert.ok(got.includes('fav: Figma says it is a toggle button, it has no aria-pressed'), out);
  assert.ok(got.some((x) => /^fav › Icon: Figma says its name is "Favoritar", it is announced as "Salvar"/.test(x)), out);
  assert.ok(got.some((x) => /^fav › Badge: not checked, the contract has no part named "Badge"/.test(x)), out);
});

test('annotations in the browser: a role is read on the component, never on a control inside it', { skip: HAS_CHROME ? false : 'no Chrome available' }, () => {
  // tile: a plain container holding a link and a button, its note says article. Its first control is not the component.
  // sheet: a native <dialog> inside a wrapper, found by the role the browser gives it (no role attribute written).
  // act: a wrapper around its one button reads as that button, as before.
  const page = `<!doctype html><html><body>
    <div class="tile"><a href="#a">Open</a><button>Like</button></div>
    <div class="sheet"><dialog open><p>Hello</p><button>Close</button></dialog></div>
    <div class="act"><button>Go</button></div>
    <div class="duo"><button>Yes</button><button>No</button></div>
    <div class="solo"><button aria-label="Save"><svg role="img" aria-label="disk" width="8" height="8"></svg></button></div>
  </body></html>`;
  // duo and solo name no role: a container of two buttons is read as itself; a wrapper around one button (an icon's
  // role inside it does not count) reads as that button.
  const dir = makeFixture({
    'page.html': page,
    'figma-component-props.snapshot.json': {
      tile: { nodeId: '1:1', annotations: [{ label: 'Role: article' }] },
      sheet: { nodeId: '1:2', annotations: [{ label: 'Role: dialog' }] },
      act: { nodeId: '1:3', annotations: [{ label: 'Role: button' }] },
      duo: { nodeId: '1:4', annotations: [{ label: 'aria-label: Choice' }] },
      solo: { nodeId: '1:5', annotations: [{ label: 'aria-label: Save' }] },
    },
    'ds-config.json': { componentSelectors: { tile: '.tile', sheet: '.sheet', act: '.act', duo: '.duo', solo: '.solo' } },
  });
  let out = '';
  try { out = execFileSync(process.execPath, [join(ENGINE, 'a11y-check.mjs'), '--url', pathToFileURL(join(dir, 'page.html')).href, '--json'], { cwd: dir, encoding: 'utf8', timeout: 120000, env: { ...process.env, CHROME_PATH: CHROME } }); }
  catch (e) { out = e.stdout ?? ''; }
  const d = pageResult(out);
  const got = d.issues.filter((i) => i.issue === 'annotation').map((i) => i.selector);
  // The tile's own role is reported, not the link inside it.
  assert.ok(got.some((x) => /^tile: Figma says role "article", it renders as "generic"/.test(x)), out);
  assert.ok(!got.some((x) => /^tile: .*renders as "(link|button)"/.test(x)), out);
  // The dialog is found by its computed role, and the wrapper around one button still reads as that button.
  assert.ok(!got.some((x) => /^sheet: /.test(x)), out);
  assert.ok(!got.some((x) => /^act: /.test(x)), out);
  // The container's name is its own (none), not its first button's.
  assert.ok(got.some((x) => /^duo: Figma says its name is "Choice", it is announced as ""/.test(x)), out);
  assert.ok(!got.some((x) => /^duo: .*announced as "Yes"/.test(x)), out);
  assert.ok(!got.some((x) => /^solo: /.test(x)), out);
});

test('role contracts: what each role requires, on the rendered component', { skip: HAS_CHROME ? false : 'no Chrome available' }, () => {
  const page = `<!doctype html><html><body>
    <button class="fav" aria-label="Favorite" aria-pressed="false" onclick="this.setAttribute('aria-pressed', this.getAttribute('aria-pressed') === 'true' ? 'false' : 'true')">★</button>
    <button class="pin" aria-label="Pin" aria-pressed="false">📌</button>
    <button class="star" aria-label="Star">☆</button>
    <div class="fake-check">Remember me</div>
    <label class="good-check"><input type="checkbox"> Keep me signed in</label>
    <div class="field error"><input type="text" aria-label="Email"></div>
    <div class="field-ok error"><input type="text" aria-label="Name" aria-invalid="true" aria-describedby="nm"><span id="nm">Required</span></div>
    <div role="tablist"><button role="tab" class="tab selected">One</button><button role="tab" class="tab" aria-selected="false">Two</button></div>
    <button class="go disabled">Go</button>
  </body></html>`;
  const dir = makeFixture({
    'page.html': page,
    'contract.authored.json': { components: {
      pin: { semantics: { element: 'button' } }, fakeCheck: { semantics: { element: 'input[type=checkbox]' } }, goodCheck: { semantics: { element: 'input[type=checkbox]' } },
      field: { semantics: { aria: { role: 'textbox' } } }, fieldOk: { semantics: { aria: { role: 'textbox' } } }, tab: { semantics: { aria: { role: 'tab' } } }, go: { semantics: { element: 'button' } } } },
    'figma-component-props.snapshot.json': { fav: { annotations: [{ label: 'role: togglebutton' }] }, pin: { annotations: [{ label: 'role: togglebutton' }] }, star: { annotations: [{ label: 'role: togglebutton' }] } },
    'ds-config.json': { componentSelectors: { fav: '.fav', pin: '.pin', star: '.star', fakeCheck: '.fake-check', goodCheck: '.good-check', field: '.field', fieldOk: '.field-ok', tab: '.tab', go: '.go' } },
  });
  let out = '';
  try { out = execFileSync(process.execPath, [join(ENGINE, 'a11y-check.mjs'), '--url', pathToFileURL(join(dir, 'page.html')).href, '--json'], { cwd: dir, encoding: 'utf8', timeout: 120000, env: { ...process.env, CHROME_PATH: CHROME } }); }
  catch (e) { out = e.stdout ?? ''; }
  const d = pageResult(out);
  const got = d.issues.filter((i) => i.issue === 'rolecontract').map((i) => i.selector).sort();
  assert.deepEqual(got, [
    'fakeCheck (checkbox): has no checkbox control (a native input, or role="checkbox" with aria-checked)',
    'field (textbox): in its error state the error is shown only by its look: there is no message to read (WCAG 3.3.1). The design needs an error message part, linked to the field with aria-describedby (send it back to Figma)',
    'field (textbox): in its error state the field has no aria-invalid="true"',
    'go (button): looks disabled but is not disabled or aria-disabled',
    'pin (toggle button): aria-pressed does not change when clicked',
    'star (toggle button): is a toggle button without aria-pressed',
    'tab (tab): the selected tab has no aria-selected="true"',
  ], out);
});

test('a deeper check that fails is tried again, and reported as not checked when it fails twice (never silently clean)', async () => {
  const findings = [], unfinished = [];
  const step = makeStep(findings, unfinished, 'demo');
  let calls = 0;
  await step(async () => { calls++; findings.push({ kind: 'target' }); if (calls === 1) throw new Error('Runtime.evaluate: no answer within 30s'); });
  assert.deepEqual([calls, findings.length, unfinished], [2, 1, []]);   // a slow browser once: retried, no duplicate
  await step(async () => { findings.push({ kind: 'role' }); throw new Error('Runtime.evaluate: no answer within 30s'); });
  assert.equal(findings.length, 1);                                     // the partial finding is not kept
  assert.deepEqual(unfinished, ['demo: deeper check 2 (Runtime.evaluate: no answer within 30s)']);
  await step(async () => { findings.push({ kind: 'keys' }); });
  assert.equal(findings.length, 2);
});

test('a page counts as loaded only once it is no longer the about:blank a new tab starts on', () => {
  const loaded = (href, readyState, found = true) => new Function('location', 'document', `return ${pageLoadedExpression('.tp-chip')}`)({ href }, { readyState, querySelector: () => (found ? {} : null) });
  assert.equal(loaded('about:blank', 'complete'), false);   // the race: blank already says "complete"
  assert.equal(loaded('file:///p/ui.html', 'loading'), false);
  assert.equal(loaded('file:///p/ui.html', 'complete', false), false);
  assert.equal(loaded('file:///p/ui.html', 'complete'), true);
  assert.equal(new Function('location', 'document', `return ${pageLoadedExpression()}`)({ href: 'http://localhost:6006/' }, { readyState: 'complete' }), true);
});

test('a page that was not checked says so in --json, with the reason, never as a clean result', () => {
  const dir = makeFixture({ 'page.html': '<!doctype html><html><body><button>x</button></body></html>' });
  // A browser that exits at once. /usr/bin/false is on Linux and macOS alike (macOS has no /bin/false, so the
  // engine would skip the path and start a real Chrome).
  const out = execFileSync(process.execPath, [join(ENGINE, 'a11y-check.mjs'), '--url', pathToFileURL(join(dir, 'page.html')).href, '--json'], { cwd: dir, encoding: 'utf8', timeout: 120000, env: { ...process.env, CHROME_PATH: '/usr/bin/false' } });
  const d = JSON.parse(out.slice(out.indexOf('{')));
  assert.match(d.notChecked, /^Chrome failed to start/);
  assert.equal(d.issues, undefined);
});

test('page: a component whose selector is not valid CSS is said not checked; the rest of the page is still read, each finding with its component', { skip: HAS_CHROME ? false : 'no Chrome available' }, () => {
  const page = `<!doctype html><html lang="en"><head><style>body { font: 14px sans-serif; background: #fff; } .chip { color: #bbb; }</style></head><body><main><h1>T</h1>
    <span class="chip">Faint chip</span></main></body></html>`;
  const dir = makeFixture({ 'page.html': page, 'ds-config.json': { componentSelectors: { Chip: '.chip', 'table/row': '.table/row' } } });
  let out = '';
  try { out = execFileSync(process.execPath, [join(ENGINE, 'a11y-check.mjs'), '--url', pathToFileURL(join(dir, 'page.html')).href, '--component', 'Chip', '--component', 'table/row', '--json'], { cwd: dir, encoding: 'utf8', timeout: 120000, env: { ...process.env, CHROME_PATH: CHROME } }); }
  catch (e) { out = e.stdout ?? ''; }
  const d = pageResult(out);
  assert.deepEqual(d.notRead, ['table/row (its selector .table/row is not valid CSS, so it was not checked)'], out);
  const contrast = d.issues.filter((i) => i.issue === 'contrast');
  assert.ok(contrast.length, 'the page was still read: ' + out);
  assert.ok(contrast.every((i) => i.component === 'Chip'), out);
  assert.match(d.checkedAt, /^\d{4}-\d\d-\d\dT/);
});

test('icons: one that carries meaning and fades into its background, and a control said only in a tooltip, are named; words and a clear icon are left alone', { skip: HAS_CHROME ? false : 'no Chrome available' }, () => {
  const page = `<!doctype html><html lang="en"><head><style>body { font: 14px sans-serif; background: #1e1e1e; color: #f0f0f0; } button { background: #1e1e1e; color: inherit; border: 1px solid #888; width: 40px; height: 40px; }
    .faint svg { fill: #2a2a2a; } .clear svg { fill: currentColor; } .mask { display: inline-block; width: 16px; height: 16px; background: #2b2b2b; -webkit-mask-image: linear-gradient(#000, #000); mask-image: linear-gradient(#000, #000); }</style></head><body><main><h1>Icons</h1>
    <button class="faint" aria-label="Upload tokens"><svg width="16" height="16" aria-hidden="true"><path d="M0 0h16v16H0z"/></svg></button>
    <button class="clear" aria-label="Close"><svg width="16" height="16" aria-hidden="true"><path d="M0 0h16v16H0z"/></svg></button>
    <button class="masked" aria-label="Feedback"><span class="mask"></span></button>
    <button class="tip clear" title="Dark mode"><svg width="16" height="16"><path d="M0 0h16v16H0z"/></svg></button>
    <button class="worded faint" style="width:auto"><svg width="16" height="16" aria-hidden="true"><path d="M0 0h16v16H0z"/></svg> Save</button>
  </main></body></html>`;
  const dir = makeFixture({ 'page.html': page });
  let out = '';
  try { out = execFileSync(process.execPath, [join(ENGINE, 'a11y-check.mjs'), '--url', pathToFileURL(join(dir, 'page.html')).href, '--json'], { cwd: dir, encoding: 'utf8', timeout: 120000, env: { ...process.env, CHROME_PATH: CHROME } }); }
  catch (e) { out = e.stdout ?? ''; }
  const d = pageResult(out);
  const kinds = (k) => d.issues.filter((i) => i.issue === k).map((i) => i.selector);
  assert.deepEqual(kinds('iconcontrast').sort(), ['button.faint', 'button.masked'], out);   // a word beside the icon makes it decoration
  assert.deepEqual(kinds('tooltipname'), ['<button> "Dark mode", named only by its title'], out);
  assert.equal(kinds('name').length, 0, out);
});

// E8: the focus the check gives a field (its Tab walk) is taken away with a transition: an edge is read once the
// field is back at rest, so a faint edge fails every run, never only when the read comes before the transition ends.
test('page: a field edge is read at rest, never halfway back from its focus look', { skip: HAS_CHROME ? false : 'no Chrome available' }, () => {
  const page = `<!doctype html><html lang="en"><head><style>
    body { font: 14px sans-serif; background: #fff; }
    input { border: 1px solid #bbbbbb; transition: border-color 60s; }
    input:focus { border-color: #222222; outline: 2px solid #222222; }
  </style></head><body><main><h1>Form</h1><label>Name <input id="a"></label> <label>Town <input id="b"></label> <label>Code <input id="c"></label></main></body></html>`;
  const dir = makeFixture({ 'page.html': page });
  let out = '';
  try { out = execFileSync(process.execPath, [join(ENGINE, 'a11y-check.mjs'), '--url', pathToFileURL(join(dir, 'page.html')).href, '--json'], { cwd: dir, encoding: 'utf8', timeout: 120000, env: { ...process.env, CHROME_PATH: CHROME } }); }
  catch (e) { out = e.stdout ?? ''; }
  const d = pageResult(out);
  assert.deepEqual(d.issues.filter((i) => i.issue === 'boundary').map((i) => i.selector.split(' ')[0]).sort(), ['input#a', 'input#b', 'input#c'], out);
});

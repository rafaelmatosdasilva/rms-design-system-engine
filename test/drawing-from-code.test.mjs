// A prototype drawn from what the code really shows: the markup its scripts build, the fullest markup the code has,
// the classes its theme gives each state, the colours it names in comments or Figma resolves through aliases, the
// font the design is set in, the icon swapped into an instance and the state a designed screen shows it in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { scriptMarkups, instanceMarkups, fullestMarkup, agreedView } from '../styleguide-data.mjs';
import { modifierFor, systemFamily, checkPrototype } from '../prototype-pieces.mjs';
import { prototypePage, fontLoader, codeColours } from '../prototype.mjs';
import { screenToPrototype } from '../screen-layout.mjs';
import { findChrome, launchChrome, connectCDP, openPage, waitForTrue, FILE_PAGE_LOADED } from '../cdp.mjs';

const CHROME = findChrome({ playwright: true });

const PAGE = `<div class="list"><div class="node hidden"></div></div>
<script>
function makeItem(v, isSelected, isRemote) {
  var libBadge = isRemote ? '<span class="lib-badge"><svg><use href="#icon-library"/></svg></span>' : '';
  return '<button class="node var-item' + (isSelected ? ' node-selected' : '') + '" data-id="' + esc(v.id) + '">' +
    '<div class="var-type-icon">' + typeIconHtml(v.type, 16) + '</div>' +
    '<span class="var-name">' + esc(v.name) + '</span>' + libBadge +
  '</button>';
}
function makeDivider(label, tier, count) {
  return '<div class="dividerSection"><div class="dividerSection-content">' +
    (tier ? '<span class="tier-dot ' + tier + '"></span>' : '') + label +
    '<span class="div-sep">·</span><span class="count">' + count + '</span></div></div>';
}
</script>`;

test('a script\'s markup is read from its literal pieces: words become a slot, a part built on an option is kept, values in tags and parts held in variables are left out', () => {
  assert.deepEqual(scriptMarkups(PAGE, 'node'), ['<button class="node var-item" data-id=""><div class="var-type-icon"></div><span class="var-name">Label</span></button>']);
  assert.deepEqual(scriptMarkups(PAGE, 'dividerSection'), ['<div class="dividerSection"><div class="dividerSection-content"><span class="tier-dot "></span>Label<span class="div-sep">·</span><span class="count">Label</span></div></div>']);
  assert.deepEqual(instanceMarkups(PAGE, 'node'), ['<div class="node hidden"></div>'], 'the page itself shows only an empty stand-in');
  assert.deepEqual(scriptMarkups('<script>var s = "<p>" + x;</script>', 'node'), []);
});

test('the fullest markup the code shows is drawn, never a whole section; the others are kept for each instance to choose from', () => {
  assert.equal(fullestMarkup([{ markup: '<b class="a">x</b>', from: 'contract' }, { markup: '<b class="a"><i></i><span>x</span></b>', from: 'script' }]).from, 'script');
  const big = `<div class="a">${'<p></p>'.repeat(40)}</div>`;
  assert.equal(fullestMarkup([{ markup: big, from: 'page' }, { markup: '<b class="a">x</b>', from: 'contract' }]).from, 'contract', 'a whole section is not a component');
  assert.equal(fullestMarkup([{ markup: big, from: 'page' }]).from, 'page', 'unless nothing else is there');
  const view = agreedView({ propsSnap: { node: { properties: {} } }, classFor: () => 'node', probes: { node: '<button class="node"><span>t</span></button>' }, pages: [PAGE] });
  const node = view.components.find((c) => c.name === 'node');
  assert.equal(node.markupFrom, 'script');
  assert.match(node.markup, /var-type-icon/);
  assert.ok(node.markups.includes('<button class="node"><span>t</span></button>'), 'the probe stays a choice');
});

test('an option is turned on by the class the theme gives it, or by the class coloured with the variable its value names', () => {
  const css = '.badge { color: grey } .badge.high { color: var(--semantic-negative); } .node.node-selected { outline: 1px solid }';
  assert.equal(modifierFor(css, 'badge', 'negative'), 'high');
  assert.equal(modifierFor(css, 'node', 'Selected'), 'node-selected');
  assert.equal(modifierFor(css, 'badge', 'positive'), null);
});

test('the design\'s font: written through a variable, found on the page unless it is a system font; Google asked unless turned off', () => {
  assert.match(systemFamily(':root { --font-family: Inter; } body { font-family: var(--font-family), ui-sans-serif, sans-serif; }'), /^Inter\b/);
  assert.match(systemFamily('body { font-family: var(--brand-font), sans-serif; } :root { --brand-font: "Söhne"; }'), /^"Söhne", sans-serif$/);
  assert.match(fontLoader({ family: 'Inter, ui-sans-serif, sans-serif', text: [] }), /\(\[\{"family":"Inter"\}\], true\);<\/script>/);
  assert.equal(fontLoader({ family: 'system-ui, sans-serif', text: [{ family: 'Arial' }] }), '');
  const parts = { view: { components: [] }, themeCSS: '', componentCSS: '', iconSheet: '' };
  const tree = { component: 'Page', props: {}, children: [] };
  assert.match(prototypePage({ name: 'p', tree, parts, scales: { family: 'Inter', text: [], spacing: [] }, gaps: [] }), /data-pt-fonts>[\s\S]*\], true\);/);
  assert.match(prototypePage({ name: 'p', tree, parts, scales: { family: 'Inter', text: [], spacing: [] }, gaps: [], fonts: false }), /data-pt-fonts>[\s\S]*\], false\);/, 'still looked for on the machine, never asked of Google');
});

test('a Figma colour is drawn with the variable the naming rule gives it, else the one whose comment names it, else the one Figma makes it from', () => {
  const scales = { colors: [] };
  const vars = { color: { dark: { 'surface/low/color': '#111', 'panel/primary/color': '#111', 'text/main/color': '#eee', 'nowhere/color': '#f00' } }, aliases: { dark: { 'panel/primary/color': ['surface/low/color'] } } };
  codeColours(scales, vars, ':root { --bg-detail: #111; /* surface/low, the detail surface */ --text-main: #eee; }', undefined, (n) => `--${n.replace(/\/colou?r$/, '').replace(/\//g, '-')}`);
  assert.deepEqual(Object.fromEntries(scales.colors.map((c) => [c.name, c.var])), { 'text/main': '--text-main', 'surface/low': '--bg-detail', 'panel/primary': '--bg-detail' });
});

const catalog = { components: { node: { props: { Title: { type: 'text', default: 'Title' }, iconContent: { type: 'slot' }, Selected: { type: 'enum', values: ['False', 'True'], default: 'False' } } }, panel: { props: {} } } };
const screen = { name: 'Atlas', tree: { kind: 'frame', name: 'Atlas', w: 300, h: 200, layout: 'VERTICAL', children: [
  { kind: 'instance', name: 'panel', component: 'panel', w: 300, h: 200, fill: { var: 'panel/primary/color' }, layout: 'VERTICAL', gap: 8, gapVar: 'gap/m', children: [
    { kind: 'instance', name: 'node', component: 'node', w: 200, h: 40, props: { Title: 'cardPanel', iconContent: 'Icon-var-color', State: 'Disabled', Selected: 'False' }, texts: ['cardPanel'] },
    { kind: 'instance', name: 'node', component: 'node', w: 200, h: 40, props: { Title: 'modalAlert', iconContent: 'Icon-component', State: 'Default', Selected: 'True' }, texts: ['modalAlert'] },
  ] },
] } };
const scales = { spacing: [{ name: 'gap/m', var: '--gap-m', value: '8px' }], text: [], colors: [{ name: 'panel/primary', var: '--panel' }] };

test('a designed instance keeps its swapped-in icon and the state it is shown in; a component the code lacks keeps its surface', () => {
  const { prototype: p } = screenToPrototype(screen, { catalog, scales, drawable: new Set(['node']) });
  const panel = p.children[0];
  assert.equal(panel.props.surface, 'panel/primary');
  const [one, two] = panel.children[0].children;
  assert.equal(one.props.iconContent, 'Icon-var-color');
  assert.equal(one.props.figmaState, 'Disabled');
  assert.equal(two.props.figmaState, undefined, 'the default state needs nothing');
  const r = checkPrototype(p, { catalog, view: { components: [{ name: 'node', cls: 'node', markup: '<button class="node"><span>x</span></button>', controls: [] }] }, scales, css: '.node.node-selected{} .node.node-disabled{}' });
  assert.equal(r.ok, true, JSON.stringify(r.findings));
});

test('page: each instance draws the markup with room for its words, its icon from the sheet, its state\'s class, and no margin of its own in an arrangement', { skip: CHROME ? false : 'no Chrome available', timeout: 120000 }, async () => {
  const { prototype: tree } = screenToPrototype(screen, { catalog, scales, drawable: new Set(['node']) });
  const full = '<button class="node var-item"><div class="var-type-icon"></div><span class="var-name">Label</span></button>';
  const parts = { view: { components: [{ name: 'node', cls: 'node', markup: full, markups: [full, '<button class="node icon-only"><svg><use href="#icon-x"/></svg></button>'], controls: [] }], modes: [] },
    themeCSS: ':root{--panel:#123456} .node{margin-bottom:8px;display:flex} .node.node-selected{outline:2px solid white} .node.node-disabled{border-style:dashed}', componentCSS: '',
    iconSheet: '<svg id="ds-icon-sheet" width="0" height="0" style="position:absolute"><symbol id="icon-var-color" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6"/></symbol><symbol id="icon-component" viewBox="0 0 16 16"><rect width="12" height="12"/></symbol></svg>' };
  const html = prototypePage({ name: 'atlas', tree, parts, scales, gaps: [], catalog, fonts: false });
  const dir = mkdtempSync(join(tmpdir(), 'from-code-'));
  writeFileSync(join(dir, 'p.html'), html);
  const chrome = await launchChrome(CHROME);
  try {
    const cdp = await connectCDP(chrome.wsUrl);
    const { sessionId } = await openPage(cdp.send, pathToFileURL(join(dir, 'p.html')).href);
    assert.ok(await waitForTrue(cdp.send, sessionId, `${FILE_PAGE_LOADED} && !!document.querySelector('[data-pt-path="0"]')`, { tolerateErrors: true }));
    const v = (await cdp.send('Runtime.evaluate', { expression: `(() => { const nodes = [...document.querySelectorAll('.node')];
      return { names: nodes.map((n) => n.querySelector('.var-name') && n.querySelector('.var-name').textContent), icons: nodes.map((n) => (n.querySelector('.var-type-icon use') || {}).getAttribute && n.querySelector('.var-type-icon use').getAttribute('href')),
        disabled: nodes[0].classList.contains('node-disabled'), selected: nodes[1].classList.contains('node-selected'), margin: getComputedStyle(nodes[0]).marginBottom,
        surface: getComputedStyle(document.querySelector('[data-pt-unbuilt]')).backgroundColor }; })()`, returnByValue: true }, sessionId)).result.value;
    assert.deepEqual(v.names, ['cardPanel', 'modalAlert']);
    assert.deepEqual(v.icons, ['#icon-var-color', '#icon-component']);
    assert.equal(v.disabled, true, 'State=Disabled turns on the class the code has for it');
    assert.equal(v.selected, true, 'Selected=True turns on a class the theme declares');
    assert.equal(v.margin, '0px', 'the arrangement spaces the parts, as auto layout does');
    assert.equal(v.surface, 'rgb(18, 52, 86)', 'the unbuilt panel keeps its surface');
    cdp.close();
  } finally { chrome.kill(); }
});

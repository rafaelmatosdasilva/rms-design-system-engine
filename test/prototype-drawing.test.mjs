// A prototype drawn as on a real system, whose components are copied from its products' pages: a part of a component is
// drawn inside it, Figma's slots are emptied and filled, the product's own classes and words stay in the product, what
// fills its container fills it, each option lands on its part, and the page works as the product does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { prototypePage } from '../prototype.mjs';
import { VISUAL_EXPRESSION, visualFindings } from '../prototype-visual.mjs';
import { findChrome, launchChrome, connectCDP, openPage, waitForTrue, FILE_PAGE_LOADED } from '../cdp.mjs';

const CHROME = findChrome({ playwright: true });
const SYSTEM_CSS = `
.seg { display: flex; } .seg button { padding: 4px; } .seg button.selected { font-weight: 700; } .seg-pill { position: absolute; }
.panel { display: flex; flex-direction: column; background: #eee; } .panel-head { display: flex; } .panel-main { display: block; }
.row-item { width: 100%; height: 40px; display: flex; } .btn { padding: 4px 8px; } .bar { display: flex; background: #ddd; height: 40px; }
.switch { display: flex; } .switch-input { position: absolute; opacity: 0; } .switch-track { width: 30px; height: 16px; } .switch-tooltip { width: 16px; }
.field { display: flex; } .field--disabled { opacity: .5; } .field-label { color: #333; }
.modal { display: none; position: fixed; inset: 0; } .modal.is-open { display: flex; } .modal-card { background: #fff; }
.tg { padding: 4px; }`;
const PRODUCT_CSS = '.product-only { width: 120px; }';
const c = (name, cls, markup, controls = [], extra = {}) => ({ name, cls, role: null, markup, markups: [markup], controls, ...extra });
const seg = '<div class="seg" aria-label="Browse"><span class="seg-pill"></span><button class="selected"><span class="lab">Tokens</span></button><button><span class="lab">Components</span></button></div>';
const parts = {
  themeCSS: SYSTEM_CSS, systemCSS: SYSTEM_CSS, componentCSS: PRODUCT_CSS,
  iconSheet: '<svg style="display:none"><symbol id="i-a" viewBox="0 0 1 1"></symbol></svg>',
  scripts: '<script>document.body.insertAdjacentHTML("beforeend", \'<svg style="display:none"><symbol id="i-a" viewBox="0 0 1 1"></symbol></svg>\');</script>',
  view: {
    modes: [{ label: 'Colour', attr: 'data-color', values: [{ label: 'Dark', value: 'dark' }, { label: 'Light', value: 'light' }], media: '(prefers-color-scheme: dark)', mediaValue: 'dark', restValue: 'light' }],
    components: [
      c('segmented', 'seg', seg, [], { slots: [{ name: 'Slot' }] }),
      c('segment', 'seg', seg, [{ label: 'Label', prop: 'Label', type: 'TEXT', part: '.lab' }, { label: 'Number', prop: 'Number', type: 'TEXT', part: '.num', default: '1' }, { label: 'Selected', prop: 'Selected', type: 'BOOLEAN', on: { add: ['selected'], attrs: {} } }], { only: 'button' }),
      { ...c('panel', 'panel', '', [], { slots: [{ name: 'Main Content' }, { name: 'Head Content' }] }), markup: '<div class="panel product-only"><div class="panel-head"><span>Product head</span></div></div>', markups: ['<div class="panel product-only"><div class="panel-head"><span>Product head</span></div></div>', '<div class="panel"><div class="panel-head">Head</div><div class="panel-main">Main</div></div>'] },
      c('row', 'row-item', '<div class="row-item product-only"><span>Row</span></div>', [{ label: 'Title', prop: 'Title', type: 'TEXT', part: 'span' }]),
      c('button', 'btn', '<button class="btn">Go</button>', [{ label: 'Label', prop: 'Label', type: 'TEXT' }]),
      c('bar', 'bar', '<div class="bar"><span class="product-only">Product bar</span></div>', [], { slots: [{ name: 'Slot' }] }),
      c('switch', 'switch', '<label class="switch"><input type="checkbox" class="switch-input" checked><span class="switch-track"></span><span class="switch-tooltip">i</span></label>', [{ label: 'Enable', prop: 'Enable', type: 'BOOLEAN', default: true, on: { add: [], attrs: { checked: '' }, target: '.switch-input' }, off: { add: ['switch-track'], attrs: {} } }]),
      c('field', 'field', '<label class="field"><span class="field-label" id="fl">Label</span><input class="field-input" value="Value" aria-labelledby="fl"><span class="field-after">Label</span></label>', [
        { label: 'Label Content', prop: 'Label Content', type: 'TEXT', part: '.field-label' }, { label: 'Value Content', prop: 'Value Content', type: 'TEXT', part: '.field-input' },
        { label: 'Show After', prop: 'Show After', type: 'BOOLEAN', part: '.field-after', default: true }, { label: 'After Content', prop: 'After Content', type: 'TEXT', part: '[class*="label"], span', default: 'Label' },
        { label: 'Disabled', prop: 'Disabled', type: 'BOOLEAN', default: true, on: { add: ['field--disabled'], attrs: {}, also: [{ target: '.field-input', attrs: { disabled: '' } }] } }]),
      c('modal', 'modal-card', '<div class="modal-card"><h2 class="modal-title">Title</h2><div class="modal-slot">Slot</div></div>', [], { slots: [{ name: 'Slot' }], motion: { overlay: { container: 'modal', open: 'is-open', closing: null, layers: [] } } }),
      c('toggle', 'tg', '<button class="tg" aria-pressed="false">T</button>', [{ label: 'Label', prop: 'Label', type: 'TEXT' }]),
    ],
  },
};
const catalog = { components: {
  segmented: { props: { Slot: { type: 'children' } } }, segment: { props: { Label: { type: 'text' }, Number: { type: 'text', default: '1' }, Selected: { type: 'boolean' } } },
  panel: { props: { 'Main Content': { type: 'children' }, 'Head Content': { type: 'children' } } }, row: { props: { Title: { type: 'text' } } },
  button: { props: { Label: { type: 'text' } } }, bar: { props: { Slot: { type: 'children' } } }, switch: { props: { Enable: { type: 'boolean' } } },
  field: { props: { 'Label Content': { type: 'text' }, 'Value Content': { type: 'text' }, 'Show After': { type: 'boolean' }, 'After Content': { type: 'text' }, Disabled: { type: 'boolean' } } },
  modal: { props: { Slot: { type: 'children' } } }, toggle: { props: { Label: { type: 'text' } } },
} };
const tree = { component: 'Page', props: { width: '400', padding: 'gap/m', gap: 'gap/m' }, children: [
  { component: 'segmented', props: { name: 'What to show' }, children: [{ component: 'segment', props: { Label: 'Alpha', Selected: true } }, { component: 'segment', props: { Label: 'Beta' } }] },
  { component: 'Stack', props: {}, children: [{ component: 'row', props: { Title: 'One' } }, { component: 'row', props: { Title: 'Two' } }] },
  { component: 'Row', props: { justify: 'end' }, children: [{ component: 'button', props: { Label: 'Open', opens: 'm' } }] },
  { component: 'panel', props: {}, children: [{ component: 'Text', props: { text: 'Export', as: 'h1' } }, { component: 'button', props: { Label: 'Help', inSlot: 'Head Content' } }] },
  { component: 'switch', props: { Enable: false, tip: 'Marks print outside the trim' } },
  { component: 'field', props: { 'Label Content': 'Name', 'Value Content': 'Ada', 'Show After': false, Disabled: false } },
  { component: 'field', props: { 'Label Content': 'Email', Disabled: false } },
  { component: 'Row', props: { gap: 'gap/m' }, children: [{ component: 'toggle', props: { Label: 'Bold' } }, { component: 'toggle', props: { Label: 'Italic' } }] },
  { component: 'panel', props: { stretch: true }, children: [{ component: 'Text', props: { text: 'Second' } }] },
  { component: 'bar', props: { stretch: true }, children: [{ component: 'button', props: { Label: 'Export' } }] },
  { id: 'm', component: 'modal', props: {}, children: [{ component: 'button', props: { Label: 'Cancel' } }, { component: 'button', props: { Label: 'Delete' } }] },
] };

test('a prototype drawn from product copies: parts inside their component, slots filled, the product\'s classes and words left out, fills, options on their parts, and it works', { skip: CHROME ? false : 'no Chrome available', timeout: 120000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'proto-draw-'));
  const file = join(dir, 'page.html');
  writeFileSync(file, prototypePage({ name: 'p', tree, parts, scales: { spacing: [{ name: 'gap/m', var: '--gap-m', value: '8px' }], text: [] }, gaps: [], catalog, fonts: false }));
  const chrome = await launchChrome(CHROME);
  const { send, close } = await connectCDP(chrome.wsUrl);
  try {
    const { sessionId } = await openPage(send, pathToFileURL(file).href);
    await waitForTrue(send, sessionId, `${FILE_PAGE_LOADED} && !!document.querySelector('[data-pt-path="0"]')`, { attempts: 200 });
    await send('Emulation.setDeviceMetricsOverride', { width: 800, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }, sessionId); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result?.value; };
    const key = async (k, shift = false) => { for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: k, code: k, windowsVirtualKeyCode: k === 'Tab' ? 9 : 27, modifiers: shift ? 8 : 0 }, sessionId); };
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const comp = (name, i = 0) => `document.querySelectorAll('[data-pt-component="${name}"]')[${i}]`;

    // A segment is the button inside its segmented control; the control keeps its pill, takes the page's name for it.
    const s = await ev(`(() => { const e = ${comp('segmented')}; return { buttons: [...e.querySelectorAll(':scope > button')].map((b) => b.textContent.trim() + (b.classList.contains('selected') ? '*' : '')), nested: e.querySelectorAll('.seg .seg').length, pill: !!e.querySelector('.seg-pill'), name: e.getAttribute('aria-label') }; })()`);
    assert.deepEqual(s, { buttons: ['Alpha*', 'Beta'], nested: 0, pill: true, name: 'What to show' }, 'no number written over a label; the product\'s "Browse" left out');
    // What fills its container fills the arrangement: the list's column, a row that lines its parts up at the end.
    const w = await ev(`(() => { const page = document.querySelector('[data-pt-path="0"]').getBoundingClientRect().width - 16; const at = (p) => Math.round(document.querySelector('[data-pt-path="' + p + '"]').getBoundingClientRect().width); return { page: Math.round(page), stack: at('0.1'), rowEnd: at('0.2'), row: at('0.1.0') }; })()`);
    assert.deepEqual([w.stack, w.rowEnd, w.row], [w.page, w.page, w.page], JSON.stringify(w));
    // Figma's slots: the plainest copy with a part for each, emptied of the product's content; a child in the slot it names.
    const p = await ev(`(() => { const e = ${comp('panel')}; return { cls: e.className, main: e.querySelector('.panel-main').textContent.trim(), head: e.querySelector('.panel-head').textContent.trim() }; })()`);
    assert.deepEqual(p, { cls: 'panel', main: 'Export', head: 'Help' });
    const b = await ev(`(() => { const e = ${comp('bar')}; return { text: e.textContent.trim(), full: Math.round(e.getBoundingClientRect().width) }; })()`);
    assert.deepEqual(b, { text: 'Export', full: w.page }, 'the product\'s content left out; stretched as told');
    // Each option on its part: the switch off on its checkbox, its tip on the part that carries one; a field's value and
    // label in place, its default words never through a guess, ids its own.
    const sw = await ev(`(() => { const e = ${comp('switch')}; return { checked: e.querySelector('input').checked, tip: e.querySelector('.switch-tooltip').getAttribute('data-tip') }; })()`);
    assert.deepEqual(sw, { checked: false, tip: 'Marks print outside the trim' });
    const f = await ev(`(() => [0, 1].map((i) => { const e = ${comp('field')}.parentNode.querySelectorAll('[data-pt-component="field"]')[i]; return { label: e.querySelector('.field-label').textContent, value: e.querySelector('input').value, after: !!e.querySelector('.field-after'), disabled: e.querySelector('input').disabled, id: e.querySelector('.field-label').id, by: e.querySelector('input').getAttribute('aria-labelledby') }; }))()`);
    assert.deepEqual(f.map((x) => [x.label, x.value, x.after, x.disabled]), [['Name', 'Ada', false, false], ['Email', 'Value', true, false]]);
    assert.notEqual(f[0].id, f[1].id, 'each copy keeps its ids to itself');
    assert.equal(f[0].by, f[0].id, 'what points at an id follows it');
    // One copy of each icon, whoever added the sheet; the mode drawn is the one pressed.
    assert.equal(await ev(`document.querySelectorAll('symbol#i-a').length`), 1);
    assert.equal(await ev(`[...document.querySelectorAll('#pt-modes button')].filter((x) => x.getAttribute('aria-pressed') === 'true').map((x) => x.textContent).join()`), 'Light');
    // Toggle buttons are on or off each on its own; a segment click moves the choice.
    await ev(`${comp('toggle')}.click()`); await wait(50); await ev(`${comp('toggle', 1)}.click()`); await wait(50);
    assert.equal(await ev(`[0, 1].map((i) => ${comp('toggle')}.parentNode.children[i].getAttribute('aria-pressed')).join()`), 'true,true');
    await ev(`${comp('segmented')}.querySelectorAll('button')[1].click()`); await wait(50);
    assert.equal(await ev(`[...${comp('segmented')}.querySelectorAll('button')].map((x) => x.classList.contains('selected')).join()`), 'false,true');
    // A modal keeps the focus inside it while Tab moves, closes with Escape, gives the focus back.
    await ev(`document.querySelector('[data-pt-opens="m"]').click()`); await wait(100);
    const tabs = [];
    for (let i = 0; i < 3; i++) { await key('Tab'); tabs.push(await ev(`(document.activeElement.closest('.pt-open-layer') ? 'in:' : 'out:') + document.activeElement.textContent.trim()`)); }
    await key('Tab', true); tabs.push(await ev(`(document.activeElement.closest('.pt-open-layer') ? 'in:' : 'out:') + document.activeElement.textContent.trim()`));
    assert.deepEqual(tabs, ['in:Delete', 'in:Cancel', 'in:Delete', 'in:Cancel']);
    await key('Escape'); await wait(100);
    assert.equal(await ev(`document.querySelectorAll('.pt-open-layer').length + ':' + document.activeElement.textContent.trim()`), '0:Open');
    // The design review: two system components with a surface of their own meet edge to edge by design.
    const review = visualFindings(await ev(VISUAL_EXPRESSION));
    assert.ok(!review.findings.some((x) => x.kind === 'touching' && /Page/.test(x.message)), JSON.stringify(review.findings));
  } finally { close(); chrome.kill(); }
});

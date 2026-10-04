// A designed screen drawn as Figma shows it: its modes, its size and clipping, what sits over the layout, the inside of
// components the code lacks, surfaces bound to the system's tokens, each side's padding, and each instance's words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { screenToPrototype } from '../screen-layout.mjs';
import { checkPrototype } from '../prototype-pieces.mjs';
import { prototypePage } from '../prototype.mjs';
import { findChrome, launchChrome, connectCDP, openPage, waitForTrue, FILE_PAGE_LOADED } from '../cdp.mjs';
import { pathToFileURL } from 'node:url';

const CHROME = findChrome({ playwright: true });
const scales = { spacing: [{ name: 'padding/l', var: '--padding-l', value: '16px' }, { name: 'gap/m', var: '--gap-m', value: '8px' }], text: [], colors: [{ name: 'panel/background', var: '--panel-background' }] };
const catalog = { components: { window: { props: { Title: { type: 'text', default: 'Title' } } }, node: { props: { Title: { type: 'text', default: 'Title' }, Selected: { type: 'enum', values: ['False', 'True'], default: 'False' } } } } };
const screen = { name: 'Plugin', modes: { Styling: 'Dark' }, tree: { kind: 'frame', name: 'Plugin', w: 400, h: 300, layout: 'VERTICAL', clips: true, children: [
  { kind: 'instance', name: 'window', component: 'window', w: 400, h: 40, fillW: true, props: { Title: 'Atlas' }, layout: 'HORIZONTAL', pad: [0, 16, 0, 16], padVars: [null, 'padding/l', null, 'padding/l'], children: [{ kind: 'text', name: 'Title', text: 'Atlas', w: 40, h: 16 }] },
  { kind: 'frame', name: 'Body', w: 400, h: 260, fillW: true, fillH: true, layout: 'VERTICAL', gap: 8, gapVar: 'gap/m', fill: { var: 'panel/background/color' }, children: [
    { kind: 'instance', name: 'node', component: 'node', w: 200, h: 40, props: { Title: 'one', Selected: 'True' }, texts: ['one'] },
    { kind: 'instance', name: 'node', component: 'node', w: 24, h: 24, props: { Title: 'two' }, textless: true },
  ] },
  { kind: 'frame', name: 'Lines', w: 30, h: 100, absolute: true, children: [] },
] } };

test('a designed screen keeps its modes, size, clipping, sides, surfaces, and leaves out what sits over the layout', () => {
  const { prototype: p, gaps } = screenToPrototype(screen, { catalog, scales, drawable: new Set(['node']) });
  assert.deepEqual(p.props, { width: '400', height: '300', clip: true, mode: 'Dark' });
  const [win, body] = p.children;
  assert.equal(win.component, 'window');
  assert.deepEqual(win.props.box, { w: 400, h: 40, fillW: true }, 'a component the code lacks keeps its size');
  assert.equal(win.children[0].component, 'Row', 'and its inside, in its own arrangement');
  assert.deepEqual([win.children[0].props.paddingLeft, win.children[0].props.paddingRight, win.children[0].props.paddingTop], ['padding/l', 'padding/l', undefined], 'each side its own token');
  assert.equal(body.props.surface, 'panel/background', 'a surface bound to a system token is drawn with it');
  assert.deepEqual(body.children[0].props.content, ['one']);
  assert.equal(body.children[1].props.textless, true);
  assert.equal(body.children[0].props.box, undefined, 'a component the code has keeps its own size');
  assert.equal(p.children.length, 2, 'the absolute layer is out of the flow');
  assert.ok(gaps.some((g) => /"Lines" in Plugin is placed over the layout/.test(g.need)));
  const r = checkPrototype(p, { catalog, view: { components: [{ name: 'node', cls: 'node', markup: '<button class="node"><span>x</span></button>', controls: [] }] }, scales, css: '.node.node-selected { outline: 1px solid; }' });
  assert.equal(r.ok, true, JSON.stringify(r.findings));
  assert.ok(!r.findings.some((f) => /Selected=True/.test(f.message)), 'Selected=True has the class .node-selected');
  const bad = checkPrototype({ component: 'Stack', props: { surface: '#123456' } }, { catalog, view: { components: [] }, scales });
  assert.match(bad.findings.map((f) => f.message).join('\n'), /Stack\.surface "#123456" is not one of the system's colour tokens/);
});

test('page: drawn in the screen\'s mode, at its size, an option value turns on its class, and each instance\'s words are written', { skip: CHROME ? false : 'no Chrome available', timeout: 120000 }, async () => {
  const { prototype: tree } = screenToPrototype(screen, { catalog, scales, drawable: new Set(['node']) });
  const parts = { view: { components: [{ name: 'node', cls: 'node', markup: '<button class="node"><span>x</span></button>', controls: [] }], modes: [{ attr: 'data-theme', values: [{ label: 'Light', value: '' }, { label: 'Dark', value: 'dark' }] }] }, themeCSS: ':root{--panel-background:#111} [data-theme=dark]{--panel-background:#000}', componentCSS: '.node{color:red} .node.node-selected{outline:2px solid white}', iconSheet: '' };
  const html = prototypePage({ name: 'plugin', tree, parts, scales, gaps: [], catalog });
  const dir = mkdtempSync(join(tmpdir(), 'fidelity-'));
  writeFileSync(join(dir, 'p.html'), html);
  const chrome = await launchChrome(CHROME);
  try {
    const cdp = await connectCDP(chrome.wsUrl);
    const { sessionId } = await openPage(cdp.send, pathToFileURL(join(dir, 'p.html')).href);
    assert.ok(await waitForTrue(cdp.send, sessionId, `${FILE_PAGE_LOADED} && !!document.querySelector('[data-pt-path="0"]')`, { tolerateErrors: true }));
    const v = (await cdp.send('Runtime.evaluate', { expression: `(() => { const q = (p) => document.querySelector('[data-pt-path="' + p + '"]'); const r = q('0').getBoundingClientRect();
      return { theme: document.documentElement.getAttribute('data-theme'), h: r.height, overflow: getComputedStyle(q('0')).overflow, win: q('0.0').getBoundingClientRect().height,
        selected: q('0.1.0').classList.contains('node-selected'), one: q('0.1.0').textContent.trim(), two: q('0.1.1').textContent.trim(), surface: getComputedStyle(q('0.1')).backgroundColor }; })()`, returnByValue: true }, sessionId)).result.value;
    cdp.close();
    assert.deepEqual(v, { theme: 'dark', h: 300, overflow: 'hidden', win: 40, selected: true, one: 'one', two: '', surface: 'rgb(0, 0, 0)' });
  } finally { chrome.kill(); }
});

// I96: a product's page against the screen designed for it in Figma: which components and how many, their order, the
// space between neighbours and their alignment, measured in the browser at the screen's size.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeFixture } from './helpers.mjs';
import { readingOrder, screenFindings, productOfScreen, projectScreens, screenTodos, mergeScreens, screenSnapshot, screenScopes, cutPlaces, pageShift } from '../screen-parity.mjs';
import { screenCaptureScript } from '../screen-layout.mjs';
import { findChrome } from '../cdp.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));

const b = (component, x, y, w, h) => ({ component, x, y, w, h });

test('which and how many, their order, the space between neighbours and their alignment', () => {
  assert.deepEqual(readingOrder([b('b', 50, 2, 10, 10), b('a', 0, 0, 10, 10), b('c', 0, 40, 10, 10)]).map((x) => x.component), ['a', 'b', 'c']);
  const figma = [b('actionBar', 0, 0, 360, 48), b('panel', 16, 64, 328, 200), b('button', 16, 280, 120, 32)];
  const same = [b('actionBar', 0, 0, 360, 48), b('panel', 16, 64, 328, 200), b('button', 16, 280, 120, 32)];
  assert.deepEqual(screenFindings('Home', figma, same), []);
  const page = [b('actionBar', 0, 0, 360, 48), b('panel', 16, 72, 328, 200), b('button', 20, 288, 120, 32), b('button', 16, 336, 120, 32)];
  assert.deepEqual(screenFindings('Home', figma, page).map((f) => f.message), [
    'the page shows 2 buttons; "Home" has 1',
    'the space between actionBar and the panel below it is 24px on the page, 16px on "Home"',
    'button starts 4px from panel\'s left edge on the page; on "Home" they line up',
  ]);
  // The panel drawn above the action bar: out of the screen's order. A component missing: said.
  const swapped = [b('panel', 16, 0, 328, 200), b('actionBar', 0, 216, 360, 48)];
  const f = screenFindings('Home', figma, swapped).map((x) => `${x.kind}: ${x.message}`);
  assert.ok(f.includes('missing: "Home" has 1 button; the page shows none'), f.join('\n'));
  assert.ok(f.some((x) => /^order: (actionBar|panel) is out of the screen's order/.test(x)), f.join('\n'));
  // Three or more of one component is a list: how many is the page's data; whether it shows one, and where, is compared.
  const list = (n, y0) => Array.from({ length: n }, (_, i) => b('node', 16, y0 + i * 48, 328, 40));
  assert.deepEqual(screenFindings('Tree', [b('actionBar', 0, 0, 360, 48), ...list(3, 64)], [b('actionBar', 0, 0, 360, 48), ...list(7, 64)]), []);
  assert.deepEqual(screenFindings('Tree', [b('actionBar', 0, 0, 360, 48), ...list(3, 64)], [b('actionBar', 0, 0, 360, 48), ...list(2, 80)]).map((x) => x.message), ['the space between actionBar and the node below it is 32px on the page, 16px on "Tree"']);
  assert.deepEqual(screenFindings('Tree', [b('actionBar', 0, 0, 360, 48), ...list(4, 64)], [b('actionBar', 0, 0, 360, 48)]).map((x) => x.message), ['"Tree" has a list of node; the page shows none']);
});

test('two columns side by side have no order between them; one column turned round on the page is out of order', () => {
  // A list beside an empty state: the list is longer on the page, so the empty state sorts among its rows. Not an order.
  const figma = [b('list', 0, 0, 200, 40), b('item', 0, 48, 200, 40), b('empty', 300, 60, 200, 80), b('row', 0, 96, 200, 40)];
  const page = [b('list', 0, 0, 200, 40), b('item', 0, 48, 200, 40), b('row', 0, 96, 200, 40), b('empty', 300, 120, 200, 80)];
  assert.deepEqual(screenFindings('Tree', figma, page).filter((f) => f.kind === 'order'), []);
  const turned = [b('list', 0, 0, 200, 40), b('row', 0, 48, 200, 40), b('item', 0, 96, 200, 40), b('empty', 300, 60, 200, 80)];
  assert.deepEqual(screenFindings('Tree', figma, turned).filter((f) => f.kind === 'order').map((f) => f.component), ['item']);
});

test('neighbours share a scope; a component\'s own parts are its own; two of one component are paired by place', () => {
  // A status bar holds a badge and a switch in its slot and draws its own divider; a side panel holds another switch.
  const divider = { kind: 'instance', component: 'dividerLine', x: 300, y: 46, w: 500, h: 2, absolute: true };
  const bar = { kind: 'instance', component: 'statusBar', x: 300, y: 0, w: 500, h: 48, children: [
    { kind: 'frame', type: 'SLOT', children: [{ kind: 'instance', component: 'badge', x: 316, y: 14, w: 40, h: 20 }, { kind: 'instance', component: 'segmentedControl', x: 700, y: 12, w: 80, h: 24 }] }, divider] };
  const panel = { kind: 'instance', component: 'panel', x: 0, y: 0, w: 280, h: 400, children: [{ kind: 'frame', type: 'SLOT', children: [{ kind: 'instance', component: 'segmentedControl', x: 16, y: 14, w: 248, h: 24 }] }] };
  const { scope, own } = screenScopes({ kind: 'instance', component: 'Screen', children: [panel, bar] });
  assert.deepEqual([own.has(divider), scope.get(bar.children[0].children[0]), scope.get(panel)], [true, bar, null]);
  // The page sits 40px higher (no title bar), its two switches a few pixels off one row: paired by place, and the badge
  // and the side panel's switch, in other scopes, never neighbours.
  const fig = [b('panel', 0, 40, 280, 400), b('statusBar', 300, 40, 500, 48), { ...b('badge', 316, 54, 40, 20), scope: 'bar' }, { ...b('segmentedControl', 700, 52, 80, 24), scope: 'bar' }, { ...b('segmentedControl', 16, 54, 248, 24), scope: 'panel' }];
  const page = [b('panel', 0, 0, 280, 400), b('statusBar', 300, 0, 500, 48), b('badge', 316, 14, 40, 20), b('segmentedControl', 700, 9, 80, 24), b('segmentedControl', 16, 14, 248, 24)];
  assert.deepEqual(screenFindings('Tree', fig, page), []);
});

test('a row\'s free space allows for the text before it; a gap stays exact (E37)', () => {
  // A status bar: a title and a badge on the left, a button pushed to the right. Chrome draws the title 4px narrower, so
  // the free space before the right-hand button is 4px wider: 2% of the 240px before it allows that, on top of 2px.
  const bar = { x: 0 };
  const fig = [{ ...b('badge', 160, 12, 40, 20), scope: bar }, { ...b('buttonTertiary', 208, 10, 24, 24), scope: bar }, { ...b('iconButton', 400, 10, 24, 24), scope: bar }];
  const page = [{ ...b('badge', 156, 12, 40, 20), scope: bar }, { ...b('buttonTertiary', 204, 10, 24, 24), scope: bar }, { ...b('iconButton', 400, 10, 24, 24), scope: bar }];
  assert.deepEqual(screenFindings('Bar', fig, page), []);
  // Two buttons a gap apart (12 in Figma, 8 on the page): a gap the layout names is exact, whatever text is before it.
  const fig2 = [{ ...b('buttonSecondary', 600, 10, 62, 24), scope: bar }, { ...b('buttonPrimary', 674, 10, 76, 24), scope: bar }];
  const page2 = [{ ...b('buttonSecondary', 604, 10, 62, 24), scope: bar }, { ...b('buttonPrimary', 674, 10, 76, 24), scope: bar }];
  assert.match(screenFindings('Footer', fig2, page2).map((f) => f.message).join(), /8px on the page, 12px on "Footer"/);
});

test('a product\'s own frame is no one\'s scope; where an answer was cut is left out (E38)', () => {
  // A screen whose window is a product's own instance: what it holds is the screen's, not the frame's own parts.
  const card = { kind: 'instance', component: 'card', x: 16, y: 120, w: 300, h: 200, children: [] };
  const app = { kind: 'instance', component: '.My App', x: 0, y: 0, w: 820, h: 520, children: [{ kind: 'frame', name: 'Body', children: [card] }] };
  const isSystem = (c) => ['card'].includes(c);
  const { own } = screenScopes({ kind: 'frame', name: 'Screen', children: [app] }, { isSystem });
  assert.equal(own.has(card), false);
  assert.equal(screenScopes({ kind: 'frame', name: 'Screen', children: [app] }).own.has(card), true);
  // The places a cut answer does not describe, and the page's shift from the screen.
  assert.deepEqual(cutPlaces({ kind: 'frame', children: [{ kind: 'frame', x: 400, y: 160, w: 358, h: 24, cut: true }, card] }), [{ x: 400, y: 160, w: 358, h: 24 }]);
  assert.deepEqual(pageShift([b('panel', 0, 40, 280, 400), b('badge', 300, 54, 40, 20)], [b('panel', 0, 0, 280, 400), b('badge', 300, 14, 40, 20)]), { dx: 0, dy: -40 });
});

test('the capture keeps a list to its first three and each answer under use_figma\'s 20 KB, the rest left for the next run', async () => {
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  const node = (id, type, name, x, y, w, h, extra = {}) => ({ id, type, name, x, y, width: w, height: h, visible: true, absoluteBoundingBox: { x, y, width: w, height: h }, boundVariables: {}, fills: [], strokes: [], ...extra });
  const row = (i) => node(`r${i}`, 'INSTANCE', 'row', 0, 40 * i, 200, 40, { componentProperties: {}, getMainComponentAsync: async () => ({ name: 'Size=M', remote: false, parent: { type: 'COMPONENT_SET', name: 'row' } }), findOne: () => null, findAll: () => [] });
  const list = node('1:1', 'FRAME', 'List', 0, 0, 200, 400, { layoutMode: 'VERTICAL', itemSpacing: 0, children: Array.from({ length: 10 }, (_, i) => row(i)) });
  // A screen of 400 named layers: too large for one answer on its own, so it is cut, and the next screen waits.
  const big = (id) => node(id, 'FRAME', 'Big', 0, 0, 800, 800, { layoutMode: 'VERTICAL', children: Array.from({ length: 400 }, (_, i) => node(`b${i}`, 'FRAME', `Section with a long name ${i}`, 0, i, 800, 1, { layoutMode: 'NONE', children: [] })) });
  const small = node('3:3', 'FRAME', 'Small', 0, 0, 100, 100, { children: [] });
  const nodes = { '1:1': list, '2:2': big('2:2'), '3:3': small, '4:4': big('4:4') };
  const figma = { getNodeByIdAsync: async (id) => nodes[id] ?? null, getStyleByIdAsync: async () => null, variables: { getVariableByIdAsync: async () => null, getVariableCollectionByIdAsync: async () => null } };
  const run = (ids) => new AsyncFunction('figma', screenCaptureScript(ids))(figma);
  const a = await run(['1:1']);
  assert.deepEqual([a.screens[0].tree.children.length, a.screens[0].tree.more, a.left], [3, 7, undefined]);
  const c = await run(['2:2', '3:3', '4:4']);
  assert.ok(JSON.stringify(c).length < 20480, `${JSON.stringify(c).length} characters`);
  assert.deepEqual([c.screens.map((s) => s.id), c.screens[0].cut, c.screens[0].tree.more > 0, c.left], [['2:2', '3:3'], true, true, ['4:4']]);
  // The engine keeps each answer with the ones before, in ds-config's order, and only the screens it still names.
  assert.deepEqual(screenSnapshot({ result: c }).left, ['4:4']);
  assert.deepEqual(mergeScreens([{ id: '9:9' }, { id: '1:1', v: 1 }], [{ id: '2:2' }, { id: '1:1', v: 2 }], ['2-2', '1-1', '3-3']), [{ id: '2:2' }, { id: '1:1', v: 2 }]);
});

test('the product a screen is for: ds-config\'s screens, the screen components snapshot, else its name', () => {
  assert.equal(productOfScreen({ id: '1:2', name: 'Home' }, { declared: [{ nodeId: '1-2', plugin: 'shop' }] }), 'shop');
  assert.equal(productOfScreen({ id: '3:4', name: 'Home' }, { screenComponents: { '3:4': { plugin: 'atlas' } } }), 'atlas');
  assert.equal(productOfScreen({ id: '5:6', name: 'Tide Chart / Settings' }, { products: ['shop', 'tide-chart'] }), 'tide-chart');
  assert.equal(productOfScreen({ id: '7:8', name: 'Other' }, { products: ['shop'] }), null);
});

test('in the browser: the product\'s page at the screen\'s size, against the screen; the style guide\'s To do row', { timeout: 120000, skip: (!findChrome({ playwright: true }) || typeof WebSocket !== 'function') && 'no Chrome' }, async () => {
  const root = makeFixture({});
  const ds = join(root, 'ds'), shop = join(root, 'shop');
  try {
    mkdirSync(join(ds, 'figma'), { recursive: true }); mkdirSync(shop, { recursive: true });
    writeFileSync(join(ds, 'theme.css'), '.actionBar { height: 48px; }\n');
    const config = { paths: { themeCSS: 'theme.css', snapshotStructure: 'figma/structure.json', plugins: ['shop'], pluginCSS: ['../shop/ui.src.html'] }, screens: [{ name: 'Shop / Home', nodeId: '1-2', plugin: 'shop' }, { name: 'Shop / Results', nodeId: '3-4', plugin: 'shop' }] };
    writeFileSync(join(ds, 'ds-config.json'), JSON.stringify(config));
    writeFileSync(join(ds, 'figma', 'structure.json'), JSON.stringify({ components: { actionBar: {}, panel: {}, button: {}, chip: {}, tag: {}, card: {} } }));
    const card = (y) => ({ kind: 'instance', component: 'card', x: 16, y, w: 328, h: 60 });
    writeFileSync(join(ds, 'figma', 'figma-screen-layout.snapshot.json'), JSON.stringify({ screens: [{ id: '1:2', name: 'Shop / Home', modes: {}, tree: { kind: 'frame', x: 0, y: 0, w: 360, h: 400, layout: 'VERTICAL', children: [
      { kind: 'instance', component: 'actionBar', x: 0, y: 0, w: 360, h: 48 },
      { kind: 'instance', component: 'panel', x: 16, y: 64, w: 328, h: 200 },
      { kind: 'instance', component: 'button', x: 16, y: 280, w: 120, h: 32 },
    ] } }, { id: '3:4', name: 'Shop / Results', modes: {}, tree: { kind: 'frame', x: 0, y: 0, w: 360, h: 400, children: [
      { kind: 'instance', component: 'actionBar', x: 0, y: 0, w: 360, h: 48 },
      { kind: 'instance', component: 'chip', x: 16, y: 64, w: 80, h: 24 },
      { kind: 'instance', component: 'tag', x: 112, y: 64, w: 60, h: 24 },
      card(104), card(172), card(240), card(308),
    ] } }] }));
    writeFileSync(join(shop, 'ui.src.html'), 'source');
    writeFileSync(join(shop, 'ui.html'), '<!doctype html><html><head><style>body { margin: 0; } .actionBar { height: 48px; } .panel { margin: 24px 16px 0; height: 200px; } .button { display: block; margin: 16px 16px 0; width: 120px; height: 32px; padding: 0; border: 0; }</style></head><body><div class="actionBar"></div><div class="panel"></div><button class="button">A</button><button class="button">B</button></body></html>');
    const chromePath = findChrome({ playwright: true });
    // The page opens on Home: Results is another state, said once rather than as every difference of that state.
    const r = await projectScreens(ds, config, { chromePath });
    assert.deepEqual(r.notCompared, ['"Shop / Results" (shop\'s page opens in another state: it shows 1 of the screen\'s 4 components. Give the screen a setup in ds-config.json (its frames or screens entry), a script that puts the page in the screen\'s state)']);
    assert.deepEqual(r.screens.map((s) => [s.name, s.product, s.width]), [['Shop / Home', 'shop', 360]]);
    // A setup puts the page in the screen's state: five results where the screen has four is the list's data, and
    // the button inside each card is the card's own part, not one of the screen's buttons.
    config.screens[1].setup = `document.body.innerHTML = '<div class="actionBar"></div><div style="display: flex; gap: 16px; margin: 16px 16px 0"><span class="chip" style="display: block; width: 80px; height: 24px"></span><span class="tag" style="display: block; width: 60px; height: 24px"></span></div>' + '<div class="card" style="margin: 16px 16px 0; height: 60px"><button class="button">Open</button></div>'.repeat(5);`;
    const withSetup = await projectScreens(ds, config, { chromePath });
    assert.deepEqual(withSetup.notCompared, []);
    assert.deepEqual(withSetup.screens.find((s) => s.name === 'Shop / Results').findings, []);
    assert.deepEqual(r.screens[0].findings.map((f) => f.message), ['the page shows 2 buttons; "Shop / Home" has 1', 'the space between actionBar and the panel below it is 24px on the page, 16px on "Shop / Home"']);
    // --figma-screens writes the capture script for the screens ds-config.json names, then keeps the answer and says
    // what differs.
    const run = (...args) => spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), ...args], { cwd: ds, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', CHROME_PATH: chromePath } });
    const a = run('--figma-screens');
    assert.match(a.stdout, /Screen capture script for 2 screens → \.design-system-engine-out\/figma-capture\/screen-capture\.js \(read-only/, a.stdout + a.stderr);
    assert.match(readFileSync(join(ds, '.design-system-engine-out/figma-capture/screen-capture.js'), 'utf8'), /const SCREEN_IDS = \["1:2","3:4"\];/);
    writeFileSync(join(ds, 'answer.json'), JSON.stringify({ result: JSON.parse(readFileSync(join(ds, 'figma', 'figma-screen-layout.snapshot.json'), 'utf8')) }));
    const c = run('--figma-screens', 'answer.json');
    assert.match(c.stdout, /✓ 2 screens read from Figma → figma\/figma-screen-layout\.snapshot\.json/, c.stdout + c.stderr);
    assert.match(c.stdout, /🖼  shop's page against "Shop \/ Home" \(360px\), 2 differences:\n   the page shows 2 buttons/);
    assert.match(c.stdout, /ℹ️  Not compared: "Shop \/ Results" \(shop's page opens in another state/);
    const rows = screenTodos(r);
    assert.deepEqual(rows.map((x) => [x.area, x.type, x.who]), [['Products', 'shop, screen', 'code']]);
    assert.match(rows[0].say, /^shop's page is laid out otherwise than its designed screen in Figma, in 2 places \(the page shows 2 buttons/);
    assert.match(rows[0].todo, /^Lay out shop as "Shop \/ Home" is in Figma, or tell the design team the screen is out of date\. Tell Claude which\.$/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

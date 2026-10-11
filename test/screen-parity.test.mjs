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
import { readingOrder, screenFindings, productOfScreen, projectScreens, screenTodos } from '../screen-parity.mjs';
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

// where each component lives, the next larger context to know before changing one: the products whose code uses
// it, what it sits inside and holds, and the Figma screens that draw it. Written into the contracts and the catalog,
// printed by --query and beside each component in the differences list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { productFiles, usageMap, usageLines, usesIn } from '../usage-map.mjs';
import { answerLines } from '../query.mjs';
import { differencesMarkdown } from '../run-diff.mjs';
import { tempDir } from './helpers.mjs';

const project = (files) => {
  const dir = tempDir('usage-');
  for (const [f, text] of Object.entries(files)) { mkdirSync(dirname(join(dir, f)), { recursive: true }); writeFileSync(join(dir, f), text); }
  return dir;
};

test('a use is the component\'s tag in a component file, or its class put on an element, never a word in a comment or a style', () => {
  assert.equal(usesIn('chip', '.chip', 'a.html', '<span class="chip">A</span><span class="chip chip--on">B</span><!-- chip --><style>.chip{}</style>'), 2);
  assert.equal(usesIn('chip', '.chip', 'App.tsx', '<Chip label="a" /><Chip>b</Chip><div className="chip" />'), 3);
  assert.equal(usesIn('statusBar', null, 'App.vue', '<status-bar /><StatusBar />'), 2);
  assert.equal(usesIn('chip', '.chip', 'a.html', '<p>a chip</p>'), 0);
});

test('where each component lives: its products, the system\'s own pages, what it sits inside and holds, the screens that draw it', () => {
  const dir = project({
    'apps/shop/ui.src.html': '<div class="panel"><button class="btn">Buy</button><button class="btn">Back</button></div>',
    'apps/shop/ui.html': '<div class="panel"><button class="btn">Buy</button><button class="btn">Back</button></div>',   // built from ui.src.html
    'apps/admin/index.html': '<button class="btn">Save</button>',
    'docs/demo.html': '<button class="btn">Demo</button>',
    'components/Btn.html': '<button class="btn">its own definition</button>',
  });
  try {
    const cfg = { paths: { plugins: ['shop', 'admin'] }, styleguide: { plugins: [{ key: 'S', match: 'shop', name: 'The Shop' }] } };
    const files = productFiles(dir, cfg);
    assert.deepEqual(files.map((f) => f.file).sort(), ['apps/admin/index.html', 'apps/shop/ui.src.html', 'components/Btn.html', 'docs/demo.html'], 'a page built from a source beside it is not counted again');
    const u = usageMap(['btn', 'panel', 'toast'], {
      files, classFor: (n) => `.${n}`,
      composition: { panel: ['btn', 'icon-close'] },
      screens: { screens: { 'S:1': { name: 'Shop checkout', components: { btn: 3, panel: 1 } } } },
    });
    assert.deepEqual(u.btn.products, [{ name: 'The Shop', files: 1, uses: 2 }, { name: 'Admin', files: 1, uses: 1 }, { name: 'this project', files: 1, uses: 1, own: true }]);
    assert.ok(!u.btn.files.some((f) => f.file === 'components/Btn.html'), 'its own definition is not a use');
    assert.deepEqual([u.btn.inside, u.panel.holds], [['panel'], ['btn']]);
    assert.deepEqual(u.btn.screens, [{ screen: 'Shop checkout', count: 3 }]);
    assert.deepEqual(usageLines(u.btn), [
      "  lives in: The Shop (1 file, 2 uses) · Admin (1 file, 1 use) · this project (1 file, 1 use)",
      '  inside: panel',
      '  on Figma screens: Shop checkout (3)',
    ]);
    assert.deepEqual(usageLines(u.toast), ['  lives in: no product code uses it yet']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('--query says where a component lives, and the differences list says it under the component', () => {
  const livesIn = { products: [{ name: 'The Shop', files: 2, uses: 5 }], files: [], inside: ['panel'], holds: [], screens: [] };
  const lines = answerLines({ kind: 'component', name: 'btn', entry: { selector: '.btn', props: {}, livesIn } });
  assert.ok(lines.includes('  lives in: The Shop (2 files, 5 uses)'), lines.join('\n'));
  assert.ok(lines.includes('  inside: panel'));
  const md = differencesMarkdown({ total: 1, fresh: 0, groups: [{ component: 'btn', items: [{ check: 'Token values', what: 'btn: height 32px, Figma 36px', side: 'decide' }] }] }, { livesIn: { btn: livesIn } });
  assert.match(md, /## btn \(1\)\n\n_Lives in The Shop \(2 files\); inside panel\._\n\n- Token values: btn: height 32px/);
});

test('every product has a name: ds-config.json products, else its folder, else this project; a package of the system is the system\'s', () => {
  const dir = project({
    'apps/northwind-web/src/Home.vue': '<template><CardTile /></template>',
    'products/acme-shop/index.html': '<div class="card-tile"></div>',
    'packages/acme-admin/src/Page.vue': '<template><CardTile /><CardTile /></template>',
    'packages/ui/src/Demo.vue': '<template><CardTile /></template>',
    'packages/ui/src/CardTile.vue': '<template><div class="card-tile"><slot /></div></template>',
    'src/pages/Index.vue': '<template><CardTile /></template>',
  });
  try {
    const cfg = { products: { 'Northwind web': { dir: 'apps/northwind-web' } } };
    const files = productFiles(dir, cfg, { systemFiles: ['packages/ui/src/CardTile.vue'] });
    const u = usageMap(['cardTile'], { files, classFor: () => '.card-tile' });
    assert.deepEqual(u.cardTile.products, [
      { name: 'Acme Admin', files: 1, uses: 2 },
      { name: 'Northwind web', files: 1, uses: 1 },
      { name: 'Acme Shop', files: 1, uses: 1 },
      { name: 'this project', files: 2, uses: 2, own: true },
    ]);
    assert.ok(u.cardTile.products.every((p) => typeof p.name === 'string' && p.name), 'never null');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a component defined in a file with a prefix (HbButton.vue for button) is not a use of itself', () => {
  const files = [
    { file: 'src/components/HbButton.vue', text: '<template><button class="hb-button"><slot /></button></template>' },
    { file: 'apps/shop/Cart.vue', text: '<template><HbButton>Pay</HbButton></template>' },
  ];
  const map = usageMap(['button'], { files, classFor: () => '.hb-button', definedIn: { button: 'src/components/HbButton.vue' } });
  assert.deepEqual(map.button.files.map((f) => f.file).includes('src/components/HbButton.vue'), false);
});

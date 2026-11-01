// pages-to-write.mjs - the components no intent page documents, most used first, and the pages a run starts for the
// first of them: what they are for and when to use them drafted from their contracts, an example drafted from how the
// products use them (intent-examples.mjs), never written as the team's. An invented system (Acme) and invented
// products (Shop, Admin).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeFixture } from './helpers.mjs';
import { rankPages, seedLines, startLimit, toStart, pagesToWriteLines, reachOf } from '../lib/pages-to-write.mjs';

const ENGINE = fileURLToPath(new URL('../lib/audit.mjs', import.meta.url));
const lives = (products, extra = {}) => ({ products: products.map(([name, files, uses]) => ({ name, files, uses })), files: [], inside: [], holds: [], screens: [], ...extra });
const USAGE = {
  tileMedia: lives([['Shop', 4, 9], ['Admin', 2, 3]]),
  chipFilter: lives([['Shop', 6, 20]]),
  badgeCount: lives([['Admin', 1, 1]]),
  noteBox: lives([]),
  iconStar: lives([['Shop', 3, 7]], { inside: ['buttonMain'] }),
  'tileList/row': lives([['Shop', 2, 2]], { inside: ['tileList'] }),
  menuItem: lives([['Shop', 5, 5]]),
};

test('the pages to write, most used first: by products, then files, then uses; documented elsewhere listed apart', () => {
  const contracts = new Map([['menuItem', { name: 'menuItem', partOf: 'menuMain' }]]);
  const proposals = new Map([['add:tileList/row', { kind: 'add', effect: 'documented', host: 'Tile list' }]]);
  const { ranked, skipped } = rankPages({ noPage: Object.keys(USAGE), usage: USAGE, contracts, proposals, documented: (n) => n === 'buttonMain', codeFiles: { tileMedia: 'src/TileMedia.vue', chipFilter: 'src/ChipFilter.vue', badgeCount: 'src/BadgeCount.vue' } });
  assert.deepEqual(ranked.map((r) => [r.rank, r.name]), [[1, 'tileMedia'], [2, 'chipFilter'], [3, 'badgeCount'], [4, 'noteBox']]);
  assert.deepEqual(ranked[0].reach, { products: ['Shop', 'Admin'], files: 6, uses: 12 });
  assert.deepEqual(skipped, [{ name: 'iconStar', why: 'an icon inside buttonMain, documented there' }, { name: 'tileList/row', why: "documented in Tile list's page" }, { name: 'menuItem', why: 'a part of menuMain' }]);
  // A run starts the first ones the products use and that have code to start from: never one nobody uses.
  assert.deepEqual(toStart(ranked, 10).map((r) => r.name), ['tileMedia', 'chipFilter', 'badgeCount']);
  assert.deepEqual(toStart(ranked, 2).map((r) => r.name), ['tileMedia', 'chipFilter']);
  assert.equal(startLimit({}), 10);
  assert.equal(startLimit({ intentLayer: { folder: 'docs', startPages: 0 } }), 0);
  assert.equal(startLimit({ intentLayer: { folder: 'docs', startPages: -2 } }), 10);
  const lines = pagesToWriteLines(ranked, skipped, { limit: 2 });
  assert.equal(lines[0], 'Pages to write, most used first: 4 components with no intent page (the first 2 the products use are started on the next run that writes the layer, their lines drafts to review).');
  assert.equal(lines[1], '    1. tileMedia - Shop and Admin: 6 files, 12 uses (started next)');
  assert.equal(lines[4], '    4. noteBox - no product uses it yet');
  assert.match(lines[5], /^Documented in another page, so not listed: iconStar \(an icon inside buttonMain, documented there\), tileList\/row/);
  assert.deepEqual(reachOf(null), { products: [], files: 0, uses: 0 });
});

test('what a started page begins with, from its contract: drafts of what it is for and when to use it, only what the contract says', () => {
  const contract = { name: 'tileMedia', description: 'A tile with a picture and a title', states: [{ name: 'hover' }, { name: 'disabled' }],
    props: [{ name: 'Size', options: ['S', 'M'], bindings: { figma: {}, code: { prop: 'size', options: ['small', 'medium'] } } }, { name: 'Wide', options: ['true', 'false'], bindings: { figma: {}, code: { prop: 'wide' } } }],
    codeOnly: [{ name: 'tone', options: ['calm', 'loud', 'quiet'] }] };
  const lines = seedLines(contract, { products: ['Shop', 'Admin'], files: 6, uses: 12 }, { lives: { holds: ['chipFilter'], inside: ['tileList'] } });
  assert.deepEqual(lines, [
    { where: 'Purpose', text: 'A tile with a picture and a title.' },
    { where: 'When to use', text: 'The products use it today: Shop and Admin, in 6 files.' },
    { where: 'When to use', text: 'Pick its `size` for the case: `small` or `medium`.' },
    { where: 'When to use', text: 'Pick its `tone` for the case: `calm`, `loud` or `quiet`.' },
    { where: 'When to use', text: 'It shows the states hover and disabled.' },
    { where: 'When to use', text: 'It holds `chipFilter`.' },
    { where: 'When to use', text: 'It sits inside `tileList`.' },
  ]);
  // A description that only says where it came from is none; a line the content check finds wrong is not written.
  const none = seedLines({ description: 'tileMedia — captured from Figma by rms-design-system-engine.', props: [] }, { products: ['Shop'], files: 1, uses: 1 }, { check: (t) => !/products/.test(t) });
  assert.deepEqual(none, []);
});

// ── A project: a folder layer written as Markdown, its contracts and a product's code ───────────────────────────────
const contract = (name, file, extra = {}) => ({ name, source: { code: { file, tag: name[0].toUpperCase() + name.slice(1), syntax: 'vue' } }, ...extra });
const inCart = (uses) => ({ products: [{ name: 'Shop', files: 1, uses }], files: [{ file: 'apps/shop/src/Cart.vue', uses, product: 'Shop' }], inside: [], holds: [], screens: [] });
const PROJECT = {
  'package.json': { name: 'acme' },
  'struct.json': { components: { buttonMain: {}, tileMedia: {}, chipFilter: {} } },
  'src/ButtonMain.vue': '<template><button><slot /></button></template>\n<script setup>defineProps({ size: String })</script>\n',
  'src/TileMedia.vue': '<template><div><slot /></div></template>\n<script setup>defineProps({ size: String, title: String })</script>\n',
  'src/ChipFilter.vue': '<template><button><slot /></button></template>\n<script setup>defineProps({ tone: String })</script>\n',
  'docs/components/button-main.md': '---\ntitle: Button Main\nkind: component\ncomponent: src/ButtonMain.vue\n---\n\n# Button Main\n\nThe next step the person is expected to take.\n\n## When to use\n\n- To submit a form.\n',
  'apps/shop/src/Cart.vue': '<template>\n  <ButtonMain size="small" class="pay">Pay now</ButtonMain>\n  <TileMedia size="small" :title="cart.name" />\n  <TileMedia size="small" title="Your basket" />\n  <ChipFilter tone="calm" />\n</template>\n',
  'contracts/button-main.contract.json': contract('buttonMain', 'src/ButtonMain.vue', { props: [{ name: 'Size', options: ['small', 'large'], bindings: { figma: {}, code: { prop: 'size', options: ['small', 'large'] } } }], codeSlots: [{ name: 'default' }], livesIn: inCart(1) }),
  'contracts/tile-media.contract.json': contract('tileMedia', 'src/TileMedia.vue', { description: 'A tile with a picture', props: [{ name: 'Size', options: ['small', 'medium'], bindings: { figma: {}, code: { prop: 'size', options: ['small', 'medium'] } } }, { name: 'Title', bindings: { figma: {}, code: { prop: 'title' } } }], livesIn: inCart(2) }),
  'contracts/chip-filter.contract.json': contract('chipFilter', 'src/ChipFilter.vue', { props: [], codeOnly: [{ name: 'tone', options: ['calm', 'loud'] }], livesIn: inCart(1) }),
};
const CFG = { paths: { snapshotStructure: 'struct.json' }, componentFiles: { buttonMain: 'src/ButtonMain.vue', tileMedia: 'src/TileMedia.vue', chipFilter: 'src/ChipFilter.vue' }, intentLayer: { folder: 'docs', startPages: 1 } };

test('a run that writes the layer starts the most used page to write and drafts an example where none is shown', async () => {
  const { syncIntentLayer } = await import('../lib/intent-layer.mjs');
  const { prepareLayerFix } = await import('../lib/intent-changes.mjs');
  const dir = makeFixture({ ...PROJECT, 'ds-config.json': CFG });
  assert.equal((await syncIntentLayer(dir, CFG, {})).ok, true);
  const p = await prepareLayerFix(dir, CFG, { drafts: false });
  assert.equal(p.error, undefined);
  // One page started (startPages: 1): the most used of the two with none, beside its sibling, every line a draft.
  assert.deepEqual(p.result.started.map((s) => [s.codeName, s.rank]), [['tileMedia', 1]]);
  const tile = p.result.files.get('docs/components/tile-media.md');
  assert.match(tile, /^---\ntitle: Tile Media\nkind: component\ncomponent: src\/TileMedia\.vue\nstatus: draft\n---\n/);
  assert.match(tile, /## Purpose\n\n\*\*Draft:\*\* A tile with a picture\.\n/);
  assert.match(tile, /## When to use\n\n- \*\*Draft:\*\* The products use it today: Shop, in 1 file\.\n- \*\*Draft:\*\* Pick its `size` for the case: `small` or `medium`\.\n/);
  assert.ok(tile.split('\n').filter((l) => /\S/.test(l) && !/^(---|title:|kind:|component:|status:|## |```|<TileMedia)/.test(l)).every((l) => /\*\*Draft:\*\*/.test(l)), 'nothing presented as the team\'s words');
  // Its example: the form both calls take (text or an expression, the product's own data either way), drafted.
  assert.match(tile, /\*\*Draft:\*\* The most common way the products use it \(2 of the 2 uses read\), from apps\/shop\/src\/Cart\.vue, line 3, in Shop, with the product's own data left out:\n\n```vue\n<TileMedia size="small" :title="title" \/>\n```\n$/);
  assert.ok(!p.result.files.has('docs/components/chip-filter.md'), 'only as many as startPages says');
  // The page the team wrote, which shows no example, gets one drafted from the product's call, its words left out.
  assert.match(p.result.files.get('docs/components/button-main.md'), /- To submit a form\.\n\n## Examples\n\n\*\*Draft:\*\* The most common way the products use it \(its one use read\), from apps\/shop\/src\/Cart\.vue, line 2, in Shop, with the product's own data left out:\n\n```vue\n<ButtonMain size="small">\n {2}…\n<\/ButtonMain>\n```\n$/);
  assert.match(p.summary, /### Tile Media \(new page\)\nStarted from its code \(`src\/TileMedia\.vue`\): `docs\/components\/tile-media\.md`, number 1 of the pages to write, most used first \(Shop: 1 file, 2 uses\)/);
  // The list, in a terminal: most used first, the one the next run starts marked.
  const r = spawnSync(process.execPath, [ENGINE, '--pages-to-write'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Pages to write, most used first: 2 components with no intent page \(the first one the products use is started on the next run that writes the layer, its lines drafts to review\)/);
  assert.match(r.stdout, /1\. tileMedia - Shop: 1 file, 2 uses \(started next\)\n\s+2\. chipFilter - Shop: 1 file, 1 use\n/);
  // startPages 0: none started; the example is still drafted.
  const off = await prepareLayerFix(dir, { ...CFG, intentLayer: { folder: 'docs', startPages: 0 } }, { drafts: false });
  assert.deepEqual(off.result.started, []);
  assert.ok(off.result.files.has('docs/components/button-main.md'));
  assert.ok(readFileSync(join(dir, 'docs/components/button-main.md'), 'utf8').endsWith('- To submit a form.\n'), 'nothing written in the layer: the changes are for a person to send');
});

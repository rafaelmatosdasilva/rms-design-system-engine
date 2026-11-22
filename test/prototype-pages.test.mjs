// Each prototype a page of its own in the style guide (prototype-pages.mjs), and the page that lists them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tempDir } from './helpers.mjs';
import { prototypePages, prototypeNames } from '../lib/prototype-pages.mjs';

// A PNG's header with its size: what the page reads a screen's width and height from.
const png = (w, h) => { const b = Buffer.alloc(24); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); return b; };

function project() {
  const root = tempDir('proto-pages-');
  mkdirSync(join(root, 'prototypes', 'Orders.handoffs'), { recursive: true });
  mkdirSync(join(root, '.design-system-engine-out', 'prototypes'), { recursive: true });
  writeFileSync(join(root, 'prototypes', 'Orders.vue'), '<template><div/></template>');
  writeFileSync(join(root, 'prototypes', 'Home.json'), '{}');
  writeFileSync(join(root, 'prototypes', 'Orders.check.json'), JSON.stringify({ name: 'Orders', file: 'prototypes/Orders.vue', at: '2026-11-20T10:00:00Z', ok: false, mistakes: 1, used: { chip: 3, button: 1 }, items: [{ component: 'chip', message: 'size L is not one of its sizes' }], lacked: [{ need: 'date picker' }, { need: 'date picker' }, { need: 'truck icon' }], owes: [], checkedAt: { system: '2.4.0', commit: 'abc1234def' } }));
  writeFileSync(join(root, 'prototypes', 'Orders.handoffs', 'v1.json'), JSON.stringify({ name: 'Orders', version: 'handoff/orders/v1', at: '2026-11-18T09:00:00Z', used: { chip: 2 } }));
  writeFileSync(join(root, 'prototypes', 'Orders.handoffs', 'v2.json'), JSON.stringify({ name: 'Orders', version: 'handoff/orders/v2', at: '2026-11-20T09:00:00Z', used: { chip: 3 }, since: { label: 'handoff/orders/v1', any: true, components: { added: ['button'], removed: [], moved: [] }, findings: { added: [], removed: [] }, gaps: { added: [], removed: [] }, dependencies: { added: [], removed: [] }, copy: { added: [], removed: [] } } }));
  writeFileSync(join(root, 'prototypes', 'Orders.handoff-notes.md'), '## Off the happy path\n\nOwner: QA · Date: 2026-11-19\n\nAn empty list says so.\n');
  writeFileSync(join(root, 'prototypes', 'Orders.comments.json'), JSON.stringify({ comments: [{ id: 'c1', says: 'The chip is too tall', by: 'Design', at: '2026-11-19T12:00:00Z', on: { component: 'chip' }, done: true, answer: 'Size M now' }, { id: 'c2', says: 'Add an empty state', at: '2026-11-20T12:00:00Z' }] }));
  for (const [w, x] of [['phone', 375], ['desktop', 1280]]) writeFileSync(join(root, '.design-system-engine-out', 'prototypes', `Orders@${w}.png`), png(x, 900));
  // What an older draw remembers of a prototype the project no longer has is no page of its own.
  writeFileSync(join(root, '.design-system-engine-out', 'prototypes', 'gaps.json'), JSON.stringify({ byPrototype: { Home: [{ need: 'map', kind: 'component' }], Gone: [{ need: 'x', kind: 'component' }] } }));
  return root;
}

test('every prototype the project has gets a page, and none it no longer has', () => {
  const root = project();
  assert.deepEqual(prototypeNames(root), ['Home', 'Orders']);
});

test('a prototype\'s page: its screens at each width, its last check, what the system lacks once a need, its handoff, notes and comments', () => {
  const [home, orders] = prototypePages(project());
  assert.equal(orders.file, 'prototypes/Orders.vue');
  assert.equal(orders.state, 'findings');
  assert.deepEqual(orders.screens.map((s) => [s.label, s.w, s.h]), [['phone', 375, 900], ['desktop', 1280, 900]], 'narrowest first, at the size taken');
  assert.match(orders.screens[0].src, /^data:image\/png;base64,/, 'carried as data, as every picture on the page');
  assert.equal(orders.check.system, '2.4.0');
  assert.deepEqual(orders.check.items, [{ component: 'chip', message: 'size L is not one of its sizes' }]);
  assert.deepEqual(orders.lacked, [{ need: 'date picker', times: 2 }, { need: 'truck icon', times: 1 }]);
  assert.deepEqual(orders.versions.map((v) => v.version), ['handoff/orders/v1', 'handoff/orders/v2']);
  assert.deepEqual(orders.versions[1].since, ['Now uses button'], 'what each version changed, in the page\'s words');
  const happy = orders.notes.find((p) => p.title === 'Off the happy path');
  assert.equal(happy.owner, 'QA');
  assert.equal(happy.body, 'An empty list says so.');
  assert.ok(orders.notes.some((p) => p.empty), 'a part nobody wrote is said as empty');
  assert.deepEqual(orders.comments.map((c) => [c.id, c.done]), [['c1', true], ['c2', false]]);
  // A prototype nobody checked: not checked, with what the last draw found it lacks.
  assert.equal(home.state, 'not checked');
  assert.deepEqual(home.lacked, [{ need: 'map', times: 1 }]);
  assert.deepEqual(home.screens, []);
});

test('the style guide has a Prototypes page: a row a prototype, its page in the side panel, linked from each component that uses it', async () => {
  const { templateText } = await import('../lib/styleguide-template.mjs');
  const tpl = templateText();
  assert.match(tpl, /navLink\('prototypes', 'prototypes'\)/);
  assert.match(tpl, /section\('prototypes', 'Prototypes', 'Prototypes'/);
  assert.match(tpl, /panelCard\('What to do', todo\)[\s\S]*panelCard\('Its screens'[\s\S]*panelCard\('Status'[\s\S]*panelCard\('What its last check found'[\s\S]*panelCard\('What the system lacks for it'[\s\S]*panelCard\('Its handoff'[\s\S]*panelCard\('What people wrote for it'[\s\S]*panelCard\('What people said'/, 'the panels\' one order');
  assert.match(tpl, /#prototypes\?panel=' \+ esc\(encodeURIComponent\('proto:' \+ p\.name\)\)/, 'a component\'s page links each prototype to its own');
  assert.match(tpl, /: !!\(target\._openKey && target\._openKey\(panelWant\)\)/, 'a link opens any page\'s own panel by its key');
  assert.match(tpl, /NAV_MARK\.prototypes = /);
  assert.match(readFileSync(new URL('../lib/styleguide-gen.mjs', import.meta.url), 'utf8'), /view\.prototypes = pp/);
});

test('a request counts only the prototypes the project still has, never one a draw remembers after it was deleted', async () => {
  const { gapsNow } = await import('../lib/requests.mjs');
  assert.deepEqual(Object.keys(await gapsNow(project())), ['Home'], 'Gone is no prototype of the project\'s');
  // A project with no prototypes folder: nothing to tell them apart by, so every draw counts.
  const bare = tempDir('proto-bare-');
  mkdirSync(join(bare, '.design-system-engine-out', 'prototypes'), { recursive: true });
  writeFileSync(join(bare, '.design-system-engine-out', 'prototypes', 'gaps.json'), JSON.stringify({ byPrototype: { A: [], B: [] } }));
  assert.deepEqual(Object.keys(await gapsNow(bare)), ['A', 'B']);
});

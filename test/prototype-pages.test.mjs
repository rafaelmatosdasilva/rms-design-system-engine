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
  writeFileSync(join(root, 'prototypes', 'Orders.check.json'), JSON.stringify({ name: 'Orders', file: 'prototypes/Orders.vue', at: '2026-11-20T10:00:00Z', ok: false, mistakes: 1, used: { chip: 3, button: 1 }, items: [{ component: 'chip', message: 'size L is not one of its sizes' }], lacked: [{ need: 'date picker' }, { need: 'date picker' }, { need: 'truck icon' }], owes: [], checkedAt: { system: '2.4.0', commit: 'abc1234def' }, request: 'a list of orders with their status' }));
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
  assert.equal(orders.asked.request, 'a list of orders with their status', 'the prompt it was made from');
  assert.equal(orders.state, 'fix', 'in the page\'s own word');
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
  assert.equal(home.asked.request, null);
});

test('the style guide has a Prototypes page: a grid or a table, filtered by status and product, each prototype\'s page in the side panel', async () => {
  const { templateText } = await import('../lib/styleguide-template.mjs');
  const tpl = templateText();
  assert.match(tpl, /navLink\('prototypes', 'prototypes'\)/);
  assert.match(tpl, /section\('prototypes', 'Prototypes', 'Prototypes'/);
  // Shown with none yet as the page that has nothing yet (pageNone): its mark large and what it will hold. Asking for one
  // is coming soon: a label in place of the button, and no request to copy (soonLabel).
  assert.match(tpl, /pageNone\('prototypes', 'No prototypes yet', 'Describe a screen to your AI agent\. It\\'s built from the system\\'s own components, and what the system lacks becomes a request\.', soonLabel\(\)\)/);
  // Requests always in the menu, below Prototypes since a prototype's check is where a request comes from, with its own
  // empty state while there is none.
  assert.ok(tpl.indexOf("navLink('prototypes', 'prototypes')") < tpl.indexOf("navLink('requests', 'requests')"), 'Prototypes, then Requests');
  assert.doesNotMatch(tpl, /if \(REQ\.length\) \(function/, 'Requests is never left out of the menu');
  assert.match(tpl, /pageNone\('requests', 'No requests yet', 'What prototypes need and the system doesn\\'t have, the most asked first, for your team to decide\.', soonLabel\(\)\)/);
  // A grid or a table, switched beside the title, the grid following the table's filters and order.
  assert.match(tpl, /segHTML\(\[\{ v: 'grid', label: 'Grid' \}, \{ v: 'table', label: 'Table' \}\], 'View'\)/);
  assert.match(tpl, /<th>Prototype<\/th><th>Product<\/th><th>System version<\/th><th>Asked by<\/th><th>Asked on<\/th><th>Status<\/th>/);
  assert.match(tpl, /new MutationObserver\(follow\)/, 'the grid follows the table');
  // The statuses in the page's own words, and Product as a list chip, as the Rules page's Area.
  assert.match(tpl, /fix: \['differs', 'Fix', 0\], missing: \['differs', 'Missing', 1\], 'not checked': \['figma', 'Not checked', 2\], done: \['match', 'Done', 3\]/);
  assert.match(tpl, /filterBar\(sec, \{ total: PROTO.length, said: 'prototypes', chips: chips, cols: \[\{ key: 'status' \}, \{ key: 'product', label: 'Product' \}\] \}\)/);
  // Its panel: what to do (Continue), what was asked, what its check found (Copy fix), its status, the rest.
  assert.match(tpl, /panelCard\('What to do', todo\)[\s\S]*panelCard\('What was asked'[\s\S]*panelCard\('What its last check found'[\s\S]*panelCard\('Status'[\s\S]*panelCard\('Its screens'[\s\S]*panelCard\('What the system lacks for it'[\s\S]*panelCard\('Its handoff'[\s\S]*panelCard\('What people wrote for it'[\s\S]*panelCard\('What people said'/, 'the panel\'s one order');
  // Continue and Copy fix are coming soon too: the label, never a request to copy.
  assert.doesNotMatch(tpl, /'Continue this prototype'|'Copy fix'| prototype: '/);
  assert.match(tpl, /\['', soonLabel\(\)\]\]/);
  assert.doesNotMatch(tpl, /'\/rms-design-system-engine /, 'no request in one agent\'s form');
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

test('the prompt a prototype was made from is kept with its check, and a later check that does not know it keeps it', async () => {
  const { checkRecord, writeCheck } = await import('../lib/prototype-record.mjs');
  const root = tempDir('proto-asked-');
  writeCheck(root, 'prototypes', checkRecord({ name: 'Orders', file: 'prototypes/Orders.vue', request: 'a list of orders' }));
  writeCheck(root, 'prototypes', checkRecord({ name: 'Orders', file: 'prototypes/Orders.vue' }));
  assert.equal(JSON.parse(readFileSync(join(root, 'prototypes', 'Orders.check.json'), 'utf8')).request, 'a list of orders');
  writeCheck(root, 'prototypes', checkRecord({ name: 'Orders', file: 'prototypes/Orders.vue', request: 'a list of orders, by status' }));
  assert.deepEqual(JSON.parse(readFileSync(join(root, 'prototypes', 'Orders.check.json'), 'utf8')).asks.map((a) => a.request), ['a list of orders', 'a list of orders, by status'], 'a new prompt is the next ask');
});

test('the prompt, who asked it and when are kept together, and a later check by someone else keeps the asker', async () => {
  const { checkRecord, writeCheck } = await import('../lib/prototype-record.mjs');
  const root = tempDir('proto-who-');
  writeCheck(root, 'prototypes', checkRecord({ name: 'Orders', request: 'a list of orders', by: 'Design', askedAt: '2026-11-22T10:00:00Z' }));
  writeCheck(root, 'prototypes', checkRecord({ name: 'Orders', by: 'Product' }));
  const r = JSON.parse(readFileSync(join(root, 'prototypes', 'Orders.check.json'), 'utf8'));
  assert.deepEqual([r.request, r.by, r.askedAt], ['a list of orders', 'Design', '2026-11-22T10:00:00Z']);
});

test('the prompt hook keeps who is asking with what they asked, by itself', async () => {
  const { routePrompt } = await import('../lib/guard.mjs');
  const root = tempDir('proto-hook-');
  writeFileSync(join(root, 'ds-config.json'), '{}');
  routePrompt({ prompt: '/rms-design-system-engine prototype a page listing orders with their status' }, { root });
  let kept = null; try { kept = JSON.parse(readFileSync(join(root, '.design-system-engine-out', 'prototypes', 'request.json'), 'utf8')); } catch { /* not routed to a prototype */ }
  assert.ok(kept, 'a prototype request is kept');
  assert.match(kept.text, /orders/);
  const { decidedBy } = await import('../lib/decided-by.mjs');
  assert.equal(kept.by ?? null, decidedBy(root, []), 'with who asked: the name Git has for them, as every decision names its person');
});

test('every ask is kept in order: the one that made it, then each that changed it, with who and when', async () => {
  const { checkRecord, writeCheck } = await import('../lib/prototype-record.mjs');
  const root = tempDir('proto-asks-');
  writeCheck(root, 'prototypes', checkRecord({ name: 'Orders', request: 'a list of orders', by: 'Design', askedAt: '2026-11-20T10:00:00Z' }));
  writeCheck(root, 'prototypes', checkRecord({ name: 'Orders' }));
  writeCheck(root, 'prototypes', checkRecord({ name: 'Orders', request: 'add an empty state', by: 'Product', askedAt: '2026-11-21T10:00:00Z' }));
  const r = JSON.parse(readFileSync(join(root, 'prototypes', 'Orders.check.json'), 'utf8'));
  assert.deepEqual(r.asks.map((a) => [a.request, a.by]), [['a list of orders', 'Design'], ['add an empty state', 'Product']]);
  assert.deepEqual([r.request, r.by], ['a list of orders', 'Design'], 'who asked for it is who made it');
});

test('with no repository named for them, a check says the prototypes are on this computer only, and to ask once', async () => {
  const { storeLines } = await import('../lib/prototype-record.mjs');
  const root = tempDir('proto-store-');
  writeFileSync(join(root, 'ds-config.json'), '{}');
  assert.match(storeLines(root).join('\n'), /on this computer only[\s\S]*NEXT: ask the person once[\s\S]*--store prototypes=<that link>/);
  writeFileSync(join(root, 'ds-config.json'), JSON.stringify({ stores: { prototypes: { read: 'https://gitlab.example.com/acme/prototypes' } } }));
  assert.deepEqual(storeLines(root), [], 'said no more once it is named');
});

test('Continue and Copy fix hand the agent the prototype they name, with what it needs to change it, and keep the change as its next ask', async () => {
  const { continueContext } = await import('../lib/prototype-pages.mjs');
  const root = project();
  const c = continueContext(root, 'change the Orders prototype: add an empty state');
  assert.equal(c.file, 'prototypes/Orders.vue');
  assert.equal(c.ask, 'add an empty state');
  const said = c.lines.join('\n');
  assert.match(said, /This changes the Orders prototype: prototypes\/Orders\.vue/);
  assert.match(said, /First: a list of orders with their status/, 'what was asked so far');
  assert.match(said, /chip: size L is not one of its sizes/, 'what its last check found');
  assert.match(said, /c2: Add an empty state/, 'what is still open');
  assert.match(said, /--prototype prototypes\/Orders\.vue/, 'and how to check it again');
  assert.equal(continueContext(root, 'change the Nowhere prototype: x'), null, 'a prototype the project does not have is no context');
  // The prompt hook says it, and keeps the change as the next ask.
  const { routePrompt } = await import('../lib/guard.mjs');
  writeFileSync(join(root, 'ds-config.json'), '{}');
  const out = routePrompt({ prompt: '/rms-design-system-engine fix the Orders prototype: chip, size L is not one of its sizes' }, { root });
  assert.match(out, /This changes the Orders prototype/);
  assert.equal(JSON.parse(readFileSync(join(root, '.design-system-engine-out', 'prototypes', 'request.json'), 'utf8')).text, 'chip, size L is not one of its sizes');
});

test('every build checks every prototype, and checks again only what moved: its page, its pin or the system', async () => {
  const { checkAll } = await import('../lib/prototype-pages.mjs');
  const root = project();
  const ran = [];
  const run = async (file) => { ran.push(file); return { ok: true }; };
  const first = await checkAll(root, { version: '1.0.0', run });
  assert.deepEqual(first.checked.sort(), ['Home', 'Orders']);
  ran.length = 0;
  const same = await checkAll(root, { version: '1.0.0', run });
  assert.deepEqual([ran, same.kept.sort()], [['prototypes/Home.json'], ['Orders']], 'nothing moved: Orders kept, and Home, which has no check kept, checked again');
  writeFileSync(join(root, 'prototypes', 'Orders.vue'), '<template><section/></template>');
  ran.length = 0;
  await checkAll(root, { version: '1.0.0', run });
  assert.ok(ran.includes('prototypes/Orders.vue'), 'its page changed');
  ran.length = 0;
  await checkAll(root, { version: '1.1.0', run });
  assert.ok(ran.includes('prototypes/Orders.vue'), 'the system moved');
});

test('each width a prototype was drawn at is kept with its check: whether it fits, and what only longer words break', async () => {
  const { widthResults, widthLine, checkRecord } = await import('../lib/prototype-record.mjs');
  const fit = { widths: ['Phone (375px)', 'Desktop (1280px)'], findings: [
    { kind: 'cut', widths: ['Phone (375px)'], asWritten: true },
    { kind: 'wraps', widths: ['Phone (375px)', 'Desktop (1280px)'], asWritten: false },
    { kind: 'target', component: 'chip', widths: ['Phone (375px)'], asWritten: true },
  ] };
  const w = widthResults(fit);
  assert.deepEqual(w, [{ width: 'Phone (375px)', fits: false, problems: 1, longer: 1 }, { width: 'Desktop (1280px)', fits: true, problems: 0, longer: 1 }], 'a tap target is the system\'s own, and longer words a translation\'s');
  assert.equal(widthLine(w), '📏 Each width: Phone (375px) 1 problem · Desktop (1280px) fits');
  assert.deepEqual(checkRecord({ name: 'A', widths: w }).widths, w, 'kept with the check, where a team\'s own exit criterion reads it');
  assert.deepEqual(widthResults(null), [], 'not drawn: nothing said');
});

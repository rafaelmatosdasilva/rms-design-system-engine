// Gaps and changes sorted into local and shared (local-shared.mjs): what stays in one product is its team's and waits on
// no one; what changes what other products get (a shared component, a token, a contract, a Figma component) is shared,
// says why in one line, and waits on the one who decides for it. An invented system (Acme, cardTile, Northwind).
import { test } from 'node:test';
import { templateText } from '../lib/styleguide-template.mjs';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeFixture } from './helpers.mjs';
import { scopeOf, todoScope, editScope, changeScope, scopeSummary, scopeLine, usageFrom, proposalScope, findingScope, issueScopeLine, sideScope } from '../lib/local-shared.mjs';
import { editCheck } from '../lib/edit-check.mjs';
import { judge } from '../lib/guard.mjs';
import { heldOf } from '../lib/sign-off.mjs';
import { changeLines } from '../lib/component-change.mjs';

const owners = { cardTile: { team: 'Cards team', decides: 'Cards lead' }, '*': 'Design system team' };
const usage = { cardTile: { products: [{ name: 'Northwind', files: 4, uses: 9 }, { name: 'Acme shop', files: 2, uses: 3 }, { name: 'Acme admin', files: 1, uses: 1 }, { name: null, files: 1, uses: 1 }] } };

test('a removal from a component three products use is shared, hard to undo, high risk, and waits on who decides it', () => {
  const s = scopeOf({ home: 'system', kind: 'option', change: 'remove', what: "cardTile's size=xs", component: 'cardTile' }, { usage, owners });
  assert.equal(s.scope, 'shared');
  assert.equal(s.undo, 'hard');
  assert.equal(s.reach, 3, 'the system\'s own pages are not a product');
  assert.equal(s.risk, 'high');
  assert.equal(s.decider.name, 'Cards lead');
  assert.equal(s.reason, "Shared: cardTile's size=xs is the system's: 3 products use it (Northwind, Acme shop, Acme admin); hard to undo, high risk.");
  // An addition nothing uses yet is still the system's, only easier to undo.
  const add = scopeOf({ home: 'system', kind: 'token', change: 'add', what: 'the token --gap-xl' }, { usage, owners });
  assert.equal(add.scope, 'shared');
  assert.equal(add.undo, 'easy');
  assert.equal(add.decider.name, 'Design system team', 'the owner of the rest decides a token');
});

test('one product\'s own screen is local: no decider, whoever owns the rest, and it says why', () => {
  const s = scopeOf({ home: 'product', kind: 'page', change: 'fix', what: 'src/pages/Checkout.vue', product: 'Northwind' }, { usage, owners });
  assert.equal(s.scope, 'local');
  assert.equal(s.decider, null);
  assert.equal(s.reason, 'Local: src/pages/Checkout.vue stays in Northwind: no other product gets it; easy to undo, low risk.');
  // What the engine cannot place is shared until someone says.
  const unsure = scopeOf({ what: 'the spacing scale' }, { owners });
  assert.equal(unsure.scope, 'shared');
  assert.equal(unsure.ambiguous, true);
  assert.match(unsure.reason, /^Shared: the engine cannot tell whether the spacing scale stays in one product/);
});

test('the Tasks list: a product\'s page or version is local, the system\'s tokens are shared, a retired token by who acts', () => {
  assert.equal(todoScope({ area: 'Products', type: 'Northwind, version', kind: 'Version', who: 'code', product: 'Northwind', team: 'Northwind team' }, { owners }).scope, 'local');
  assert.equal(todoScope({ area: 'Products', type: 'Acme shop, accessibility', kind: 'Accessibility', who: 'code' }, { owners }).reason, "Local: Acme shop's accessibility stays in Acme shop: no other product gets it; easy to undo, low risk.");
  assert.equal(todoScope({ area: 'Accessibility', type: 'Pages, 2.4.2 Page Titled', kind: 'Accessibility', who: 'code' }, { owners }).scope, 'local');
  const tok = todoScope({ who: 'both', area: 'System', type: 'Tokens, text styles', kind: 'Text style' }, { owners });
  assert.equal(tok.scope, 'shared');
  assert.equal(tok.decider.name, 'Design system team');
  assert.equal(todoScope({ kind: 'Retired', who: 'code' }, { owners }).scope, 'local', 'each product swaps a retired token in its own code');
  const open = todoScope({ kind: 'Retired', who: 'both' }, { owners });
  assert.equal(open.scope, 'shared');
  assert.equal(open.undo, 'hard');
  const sum = scopeSummary([{ scope: tok }, { scope: open }, { scope: todoScope({ area: 'Products', type: 'Northwind, screen', kind: 'Screen', who: 'code' }) }]);
  assert.deepEqual(sum, { shared: 2, local: 1, waiting: [{ name: 'Design system team', n: 2 }] });
  assert.equal(scopeLine(sum), "2 shared, waiting on Design system team (2); 1 local, each product team's own");
  assert.equal(scopeLine({ shared: 1, local: 0, waiting: [] }), '1 shared, with no owner named (ds-config.json owners)');
});

test('an edit by its file: the theme and a system component are shared, a product file is local; a removal is hard to undo', () => {
  const contract = { name: 'cardTile', props: [{ name: 'size', options: ['s', 'm', 'xs'] }] };
  const files = { theme: new Set(['src/theme.css']), components: new Map([['src/CardTile.vue', contract]]) };
  const ctx = { usage, owners };
  const added = editScope({ file: 'src/theme.css', before: ':root { --a: 1px; }', after: ':root { --a: 1px; --b: 2px; }', root: '/p', files }, ctx);
  assert.equal(added.scope, 'shared');
  assert.equal(added.undo, 'easy');
  assert.match(added.reason, /the token --b is the system's/);
  const gone = editScope({ file: 'src/theme.css', before: ':root { --a: 1px; --b: 2px; }', after: ':root { --a: 1px; }', root: '/p', files }, ctx);
  assert.equal(gone.undo, 'hard');
  assert.match(gone.reason, /removing --b from the theme/);
  const opt = editScope({ file: 'src/CardTile.vue', before: "['s', 'm', 'xs']", after: "['s', 'm']", root: '/p', files }, ctx);
  assert.equal(opt.scope, 'shared');
  assert.equal(opt.risk, 'high');
  assert.equal(opt.decider.name, 'Cards lead');
  const page = editScope({ file: 'apps/northwind/Checkout.vue', root: '/p', files, productOf: () => 'Northwind' }, ctx);
  assert.equal(page.scope, 'local');
  assert.match(page.reason, /stays in Northwind/);
});

test('a change in Figma is the system\'s component: breaking when it breaks something, and changeLines says it with who it waits on', () => {
  const ch = { component: 'cardTile', ops: [], report: {}, breaking: [{ what: 'cardTile size=xs removed' }], held: [], named: [], faults: [], questions: [], usedBy: { products: ['Northwind (4 files)', 'Acme shop (2 files)', "the system's own pages (1 file)"], inside: [], screens: 0 } };
  const s = changeScope(ch, { owners });
  assert.equal(s.scope, 'shared');
  assert.equal(s.reach, 2);
  assert.equal(s.undo, 'hard');
  ch.scope = s;
  assert.match(changeLines(ch).join('\n'), /Shared: cardTile's Figma component is the system's: 2 products use it \(Northwind, Acme shop\); hard to undo, high risk\. It waits on Cards lead\./);
});

const CARD = `<template>\n  <div class="card-tile"><slot /></div>\n</template>\n<style>\n.card-tile { gap: 4px; }\n</style>\n`;
const project = () => makeFixture({
  'ds-config.json': { paths: { themeCSS: 'src/theme.css' }, owners },
  'src/theme.css': ':root {\n  --card-gap: 4px;\n  --card-bg: #ffffff;\n}\n',
  'src/CardTile.vue': CARD,
  'src/pages/Promo.vue': '<template>\n  <div class="promo"></div>\n</template>\n',
  'contracts/cardTile.contract.json': { name: 'cardTile', source: { code: { file: 'src/CardTile.vue' } }, props: [{ name: 'size', type: 'enum', options: ['s', 'm'] }], livesIn: usage.cardTile },
});
const cfg = { paths: { themeCSS: 'src/theme.css' }, owners };

test('the edit check tells the agent whether what it changed is local or shared, and on whom a shared one waits', () => {
  const root = project();
  assert.equal(usageFrom(root, cfg).cardTile.products.length, 4, 'the usage map as the contracts keep it');
  const own = editCheck({ tool_name: 'Edit', tool_input: { file_path: join(root, 'src/pages/Promo.vue'), old_string: '<div class="promo"></div>', new_string: '<div class="promo" style="color: #123456"></div>' } }, { root, cfg, headOf: () => null });
  assert.match(own, /\nLocal: src\/pages\/Promo\.vue stays in one product: no other product gets it; easy to undo, low risk\. It is this product team's to fix: nothing here waits on the system's owner\.$/);
  const sys = editCheck({ tool_name: 'Edit', tool_input: { file_path: join(root, 'src/CardTile.vue'), old_string: '.card-tile { gap: 4px; }', new_string: '.card-tile { gap: 4px; color: #123456; }' } }, { root, cfg, headOf: () => null });
  assert.match(sys, /\nShared: cardTile's code is the system's: 3 products use it \(Northwind, Acme shop, Acme admin\); can be undone, high risk\. Every product that uses it gets this edit; what it adds to the system waits on Cards lead to sign it off\.$/);
});

test('the guard holds an addition with why it is shared and who decides it, and writes down the session that made it', () => {
  const root = project();
  const edit = { tool_name: 'Edit', cwd: root, session_id: 'session-one', tool_input: { file_path: join(root, 'src/theme.css'), old_string: '  --card-gap: 4px;\n', new_string: '  --card-gap: 4px;\n  --card-gap-xl: 12px;\n' } };
  const held = judge(edit, { cfg, userText: 'add a larger gap token' });
  assert.equal(held.decision, 'deny');
  assert.match(held.reason, /Shared: the token --card-gap-xl is the system's: every product that uses it gets the change; easy to undo, low risk\./);
  assert.match(held.reason, /ask who signs it off \(Design system team decides for it in ds-config\.json owners\)/);
  assert.match(held.reason, /Never your own name: the agent that made a change never signs it off\./);
  assert.doesNotMatch(held.reason, /--second-review/, 'by default only a person signs off');
  assert.deepEqual(heldOf(root, 'the token --card-gap-xl').author, { kind: 'agent', session: 'session-one' });
  assert.match(judge(edit, { cfg: { ...cfg, review: { second: 'agent-or-person' } }, userText: 'add a larger gap token' }).reason, /--second-review "the token --card-gap-xl"\): never this one, which made the change\./);
  assert.equal(judge({ tool_name: 'Write', cwd: root, tool_input: { file_path: join(root, '.design-system-engine-out/held-for-sign-off.json'), content: '{}' } }, { cfg, userText: 'yes' }).decision, 'deny');
});

test('the style guide shows local or shared beside who acts, never counts them in a line of its own, and says it on a change in Figma', () => {
  const tpl = templateText();
  const fn = (name) => new RegExp(`function ${name}\\(x\\) \\{[^\\n]*\\}`).exec(tpl)[0];
  const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const scopeHTML = new Function('esc', `${fn('scopeWords')}\n${fn('scopeHTML')}\nreturn scopeHTML;`)(esc);
  assert.equal(scopeHTML({ scope: 'shared', reason: 'Shared: why.', decider: { name: 'Cards lead' } }), '<span class="sg-todo-scope" data-scope="shared" title="Shared: why.">Shared, waits on Cards lead</span>');
  assert.equal(scopeHTML({ scope: 'local', reason: 'Local: why.' }), '<span class="sg-todo-scope" data-scope="local" title="Local: why.">Local, waits on no one</span>');
  assert.match(tpl, /\(r\.who \? '<span class="sg-todo-who">' \+ esc\(r\.who\) \+ '<\/span>' : ''\) \+ \(isOpen\(r\) \? scopeHTML\(rowScope\(r\)\) : ''\)/, 'beside who acts, on every open task');
  assert.doesNotMatch(tpl, /sg-todo-scope-line|' shared' \+ \(onList/, 'no line on the Tasks page counting them: each task says it beside who acts');
  assert.match(tpl, /card\('Local or shared', x\.scope \? lines\(\[x\.scope\.reason\]\) : ''\)/, 'a change in Figma says it');
  assert.match(tpl, /scope: \{ scope: 'local', reason: 'Local: ' \+ x\.product/, 'a product\'s near copy is that product\'s');
});

// The intent layer's proposals: one about a component's page is what every product reads, one about a product's flow
// or page stays in that product; an Add is a component with no page yet, the system's.
test('an intent-layer proposal is shared for a component\'s page and local for a product\'s flow or page', () => {
  const comp = proposalScope({ kind: 'fix', subject: 'tileRow', page: 'Card Tile' }, { page: { name: 'Card Tile', layer: 'components', component: 'cardTile' } }, { usage, owners });
  assert.equal(comp.scope, 'shared');
  assert.equal(comp.decider.name, 'Cards lead');
  assert.equal(comp.reason, "Shared: Card Tile's page is the system's: 3 products use it (Northwind, Acme shop, Acme admin); easy to undo, medium risk.");
  const flow = proposalScope({ kind: 'fix', subject: 'cardTile', page: 'Checkout' }, { page: { name: 'Checkout', layer: 'flows' } }, { usage, owners });
  assert.deepEqual([flow.scope, flow.decider], ['local', null]);
  assert.equal(flow.reason, "Local: Checkout's page stays in one product: no other product gets it; easy to undo, low risk.");
  assert.equal(proposalScope({ kind: 'review', subject: 'x' }, { page: { name: 'Orders', layer: 'pages', product: 'Northwind' } }).reason, "Local: Orders's page stays in Northwind: no other product gets it; easy to undo, low risk.");
  const add = proposalScope({ kind: 'add', subject: 'tileTwo' }, {}, { owners });
  assert.equal(add.scope, 'shared');
  assert.match(add.reason, /^Shared: tileTwo's page is the system's: /);
  assert.equal(proposalScope({ kind: 'move', subject: 'Picker', split: true }, { page: { name: 'Picker', layer: 'components' } }).ambiguous, true, 'split evidence is a decision');
});

// A component only one side has: only in Figma, the system's to build; only in one product's code, that product's own.
test('a component only in Figma is shared; one only in one product\'s code is local; one the system\'s code has is shared', () => {
  const fig = sideScope({ name: 'tileTwo', side: 'figma' }, { usage, owners });
  assert.equal(fig.scope, 'shared');
  assert.equal(fig.reason, "Shared: tileTwo is the system's: no product's code uses it yet, every new one gets it; easy to undo, low risk.");
  const one = sideScope({ name: 'promoBar', file: 'src/PromoBar.vue' }, { usage: { promoBar: { products: [{ name: 'Northwind', files: 1 }] } } });
  assert.deepEqual([one.scope, one.decider], ['local', null]);
  assert.equal(one.reason, 'Local: promoBar (src/PromoBar.vue) stays in Northwind: no other product gets it; can be undone, low risk.');
  assert.equal(sideScope({ name: 'cardTile', file: 'src/CardTile.vue' }, { usage, owners }).scope, 'shared', 'several products use it');
  assert.equal(sideScope({ name: 'loneTile' }, {}).scope, 'shared', 'unknown use: the system\'s until someone says');
  // The Tasks page counts them: their rows carry the scope the page reads.
  const tpl = templateText();
  assert.match(tpl, /codeOnly: k\.name, codeFile: k\.file,[^\n]*scope: k\.scope \|\| null \}/);
  assert.match(tpl, /figmaOnly: n,[^\n]*scope: \(DATA\.notAgreed\.scopes \|\| \{\}\)\[n\] \|\| null \}/);
});

// What an issue's body says: a finding about a product's screen is local, any other the system's.
test('a finding is local when it is a product\'s own screen, else shared; the issue line names who it waits on', () => {
  assert.equal(issueScopeLine(findingScope({ check: 'Structure', component: 'cardTile' }, { usage, owners })), "Shared: waits on Cards lead — cardTile is the system's: 3 products use it (Northwind, Acme shop, Acme admin); easy to undo, medium risk.");
  assert.equal(issueScopeLine(findingScope({ check: 'Markup', product: 'Northwind' })), "Local: the product team's own — Northwind's own screen stays in Northwind: no other product gets it; easy to undo, low risk.");
  assert.equal(issueScopeLine(null), '');
});

// A finding or a task says which product it is about when every file it names is that product's.
test('a finding names its product by the files it names; a system file or two products leave it shared', async () => {
  const { productIn } = await import('../lib/local-shared.mjs');
  const { findingRecords } = await import('../lib/run-diff.mjs');
  const productOf = (f) => (/^apps\/northwind\//.test(f) ? 'Northwind' : /^apps\/acme\//.test(f) ? 'Acme shop' : null);
  assert.equal(productIn('hex written by hand (apps/northwind/src/Cart.vue:12)', productOf), 'Northwind');
  assert.equal(productIn('apps/northwind/a.css and src/theme.css', productOf), null, 'a system file too: no one product');
  assert.equal(productIn('apps/northwind/a.css and apps/acme/b.css', productOf), null, 'two products');
  assert.equal(productIn('see https://example.com/apps/northwind/a.css', productOf), null, 'a link is not a file');
  assert.equal(productIn('apps/northwind/a.css', null), null);
  const [own, sys] = findingRecords(['Clean CSS :: ⚠️  cardTile override (apps/northwind/src/Cart.vue:12)', 'Clean CSS :: ⚠️  cardTile override (src/CardTile.vue:3)'], ['cardTile'], { productOf });
  assert.equal(own.product, 'Northwind');
  assert.equal('product' in sys, false);
  assert.equal(findingScope(own, { usage, owners }).scope, 'local');
  assert.equal(findingScope(sys, { usage, owners }).scope, 'shared');
  // An older record with no product is placed the same way, from its evidence.
  assert.equal(issueScopeLine(findingScope({ check: 'Clean CSS', evidence: 'x (apps/northwind/a.css:1)' }, { productOf })), "Local: the product team's own — Northwind's own screen stays in Northwind: no other product gets it; easy to undo, low risk.");
  // A task whose file is one product's is that product's.
  assert.equal(todoScope({ kind: 'Token', area: 'Tokens', file: 'apps/acme/src/x.css' }, { productOf }).scope, 'local');
  assert.equal(todoScope({ kind: 'Token', area: 'Tokens', file: 'src/theme.css' }, { productOf }).scope, 'shared');
});

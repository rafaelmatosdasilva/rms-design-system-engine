import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tempDir } from './helpers.mjs';
import { codeOverrides, figmaDetaches, proposals, proposalLines, proposalsMarkdown, recordDecision, readDecided } from '../lib/proposals.mjs';

const classes = { button: '.btn', card: '.card' };
const files = [
  { file: '../shop/src/shop.css', product: true, productName: 'shop', text: '.btn {\n  color: red;\n}\n.page .btn--primary { padding: 4px 8px; --x: 1 }\n.title { padding: 2px }\n' },
  { file: '../admin/src/Panel.vue', product: true, productName: 'admin', text: '<template>\n  <Button style="padding: 6px">Go</Button>\n</template>\n<style>\n.card { border-radius: 0 }\n</style>\n' },
  { file: '../docs/src/App.jsx', product: true, productName: 'docs', text: '<Card style={{ borderRadius: 0, padding: 12 }} />' },
  { file: 'src/button.css', product: false, productName: null, text: '.btn { padding: 8px }' },
];

test('a product rule that styles a system component, and an inline style on its tag, are overrides; the system\'s own rules and custom properties are not', () => {
  const o = codeOverrides(files, classes);
  assert.deepEqual(o.map((x) => [x.product, x.component, x.property, x.value, x.line]), [
    ['shop', 'button', 'color', 'red', 1],
    ['shop', 'button', 'padding', '4px 8px', 4],
    ['admin', 'card', 'border-radius', '0', 5],
    ['admin', 'button', 'padding', '6px', 2],
    ['docs', 'card', 'border-radius', '0', 1],
    ['docs', 'card', 'padding', '12', 1],
  ]);
});

test('a frame detached from a system component in a product\'s screen is a detach of that component', () => {
  const screens = [{ id: '1:1', name: 'Shop home', tree: { children: [{ kind: 'frame', detached: 'Card', children: [{ kind: 'frame', detached: 'Unknown thing' }] }] } }, { id: '2:2', name: 'Admin list', tree: { kind: 'frame', detached: 'card' } }];
  const d = figmaDetaches(screens, { names: ['card', 'button'], productOf: (s) => s.name.split(' ')[0].toLowerCase() });
  assert.deepEqual(d, [{ component: 'card', product: 'shop', screen: 'Shop home' }, { component: 'card', product: 'admin', screen: 'Admin list' }]);
});

test('the same override in two products becomes a proposal with its evidence and reach, and one product alone does not', () => {
  const list = proposals({ overrides: codeOverrides(files, classes), detaches: [{ component: 'card', product: 'shop', screen: 'A' }, { component: 'card', product: 'admin', screen: 'B' }], reach: { button: ['admin', 'docs', 'shop'] } });
  assert.deepEqual(list.map((p) => p.id), ['detach:card', 'override:button:padding', 'override:card:border-radius']);
  const pad = list.find((p) => p.id === 'override:button:padding');
  assert.deepEqual(pad.products, ['shop', 'admin']);
  assert.deepEqual(pad.reach, ['admin', 'docs', 'shop']);
  assert.match(pad.what, /2 products set it themselves \(4px 8px · 6px\)/);
  assert.ok(!list.some((p) => p.id === 'override:button:color'));
  const lines = proposalLines(list);
  assert.match(lines[0], /3 proposals drafted/);
  assert.doesNotMatch(proposalsMarkdown(list), /;/);
});

test('a decision is kept with who made it, a rejection must say why, and a decided proposal is said in one line', () => {
  const dir = tempDir('proposals-');
  {
    assert.throws(() => recordDecision(dir, 'detach:card', { verdict: 'rejected', by: 'QA' }), /says why/);
    assert.throws(() => recordDecision(dir, 'detach:card', { verdict: 'accepted' }), /who made it/);
    recordDecision(dir, 'detach:card', { verdict: 'rejected', reason: 'each product needs its own layout', by: 'QA', at: '2026-11-15T10:00:00Z' });
    const list = proposals({ detaches: [{ component: 'card', product: 'shop', screen: 'A' }, { component: 'card', product: 'admin', screen: 'B' }], decided: readDecided(dir) });
    assert.deepEqual(proposalLines(list), ['   detach:card: rejected by QA on 2026-11-15: each product needs its own layout']);
  }
});

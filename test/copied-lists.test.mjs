// Lists an intent-layer page copies from what the engine generates (copied-lists.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copiedLists, listsIn } from '../copied-lists.mjs';

const comps = ['tileCard', 'pillTag', 'rowItem', 'navBar', 'sideSheet', 'toastNote', 'stepFlow', 'dateField', 'menuList'];
const facts = {
  comps: new Map(comps.map((c) => [c.toLowerCase(), c])),
  components: { tileCard: { props: { size: {}, tone: {}, dense: {}, label: {}, href: {} } } },
  tokens: ['--space-gap-xs', '--space-gap-s', '--space-gap-m', '--space-gap-l', '--space-gap-xl', '--space-pad-s', '--space-pad-m', '--brand-ink'],
};
const page = (title, text) => ({ sections: [{ title, text }] });

test('a table and a run of bullets are each one list', () => {
  assert.deepEqual(listsIn('Intro.\n| Prop | Type |\n|---|---|\n| `size` | string |\n| `tone` | string |\n\n- a\n- b').map((l) => l.length), [3, 2]);
});

test('a prop table copied from the code points to the contract, even with descriptions', () => {
  const t = page('Props', '| Prop | Type | Description |\n|---|---|---|\n| `size` | string | How big the tile is drawn on the page |\n| `tone` | string | Its colour |\n| `dense` | boolean | Less room |\n| `label` | string | Its words |');
  const [f] = copiedLists(t, facts, { component: 'tileCard', contractOf: () => 'contracts/tile-card.contract.json' });
  assert.equal(f.kind, 'copy');
  assert.equal(f.says, "a list of 4 of tileCard's props");
  assert.match(f.fix, /^Replace the list under Props with a link to its contract \(contracts\/tile-card\.contract\.json\)\.$/);
});

test('a whole token family listed by name points to the file its tokens come from; a few picked out are kept', () => {
  const fam = page('Gap tokens', '- `space/gap/xs`\n- `space/gap/s`\n- `space/gap/m`\n- `space/gap/l`\n- `space/gap/xl`');
  const [f] = copiedLists(fam, facts, { tokenFileOf: (n) => (/gap/.test(n) ? 'specs/tokens/all.dsds.json' : null) });
  assert.match(f.fix, /the tokens file \(specs\/tokens\/all\.dsds\.json\)/);
  const picks = page('Page spacing', 'Use these:\n- `--space-gap-xl`\n- `--space-pad-m`\n- `--space-gap-s`\n- `--brand-ink`');
  assert.deepEqual(copiedLists(picks, facts), [], 'a few tokens from several families, with a rule: guidance');
  const meant = page('Gap tokens', '- `space/gap/xs`: between an icon and its label inside a control\n- `space/gap/s`: between the fields of one group in a form\n- `space/gap/m`: between two cards placed side by side\n- `space/gap/l`: between the sections that make one page\n- `space/gap/xl`: around the page content on a wide screen');
  assert.deepEqual(copiedLists(meant, facts), [], 'a table that says what each one is for is guidance');
});

test('a catalog of components is a copy; a sequence or a few picked out are rules', () => {
  const cat = page('All components', comps.map((c) => `- ${c}`).join('\n'));
  assert.match(copiedLists(cat, facts)[0].says, /a list of 9 components/);
  assert.deepEqual(copiedLists(page('Edit mode', '- tileCard\n- pillTag\n- rowItem\n- navBar'), facts), [], 'four picked out: guidance');
  assert.deepEqual(copiedLists(page('Stack', '1. tileCard\n2. rowItem\n3. tileCard\n4. navBar\n5. rowItem\n6. pillTag\n7. sideSheet\n8. toastNote\n9. stepFlow'), facts), [], 'an order, a name twice: a rule');
});

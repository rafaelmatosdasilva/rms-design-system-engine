import { test } from 'node:test';
import assert from 'node:assert/strict';
import { propRenames, codemod, wayAcross, renamesMarkdown, removeInOf } from '../lib/renames.mjs';
import { keepOldNames } from '../lib/rename-sweep.mjs';

const rec = (props, systemVersion = '2.4.1') => ({ systemVersion, contracts: { button: { name: 'button', props } } });
const base = rec([{ name: 'variant', type: 'enum', options: ['primary', 'secondary', 'ghost'], default: 'primary' }, { name: 'isDisabled', type: 'boolean', default: false }]);
const now = rec([{ name: 'variant', type: 'enum', options: ['primary', 'secondary', 'subtle'], default: 'primary' }, { name: 'disabled', type: 'boolean', default: false }]);

test('a prop gone and a prop new holding the same type and default are one prop renamed, and a value moved in place is one value renamed', () => {
  const r = propRenames(base, now);
  assert.deepEqual(r.map((x) => [x.kind, x.from, x.to]), [['prop', 'isDisabled', 'disabled'], ['value', 'ghost', 'subtle']]);
});

test('a prop removed with nothing new beside it, or a value added, is no rename', () => {
  assert.deepEqual(propRenames(base, rec([{ name: 'variant', type: 'enum', options: ['primary', 'secondary', 'ghost', 'link'], default: 'primary' }])), []);
});

test('the codemod renames the prop and the value on the component tag only, across lines, and leaves other tags alone', () => {
  const r = propRenames(base, now);
  const text = ['<Button isDisabled variant="ghost">Go</Button>', '<Link variant="ghost" isDisabled />', '<Button', '  variant={"ghost"}', '  isDisabled={busy}', '/>', ''].join('\n');
  const out = codemod([{ file: '../shop/src/App.jsx', text }], r);
  const e = out.get('../shop/src/App.jsx');
  assert.deepEqual([...e.changes], [[1, '<Button disabled variant="subtle">Go</Button>'], [4, '  variant={"subtle"}'], [5, '  disabled={busy}']]);
});

test('Vue bindings and kebab-case tags are renamed too', () => {
  const r = propRenames(base, now);
  const out = codemod([{ file: 'src/X.vue', text: '<my-button :isDisabled="x" :variant="\'ghost\'" />' }], propRenames({ contracts: { myButton: base.contracts.button } }, { contracts: { myButton: now.contracts.button } }));
  assert.equal(out.get('src/X.vue').changes.get(1), '<my-button :disabled="x" :variant="\'subtle\'" />');
  assert.equal(r.length, 2);
});

test('the way across counts each product still on the old names, writes one patch per root, and the aliases go in the next major', () => {
  const way = wayAcross({ renames: propRenames(base, now), systemVersion: '2.4.1', files: [
    { file: '../shop/src/A.jsx', text: '<Button isDisabled />\n<Button variant="ghost" />\n' },
    { file: '../admin/src/B.tsx', text: '<Button variant="primary" />\n' },
  ] });
  assert.equal(way.removeIn, '3.0.0');
  assert.deepEqual(way.uses, { '../shop': 2 });
  assert.equal(way.patches.length, 1);
  assert.match(way.patches[0].diff, /^--- a\/src\/A\.jsx/);
  assert.match(way.patches[0].diff, /\+<Button disabled \/>/);
  const md = renamesMarkdown(way, { '../shop': 'handback/renames-shop.diff' });
  assert.match(md, /deprecated alias of `disabled` until 3\.0\.0/);
  assert.match(md, /shop: 2 places, patch handback\/renames-shop\.diff/);
  assert.doesNotMatch(md, /;/);
});

test('without a system version the aliases go in the next major version, and a kept token says the version that removes it', () => {
  assert.equal(removeInOf(null), null);
  const adds = keepOldNames({ text: ':root {\n  --text-main: #111;\n}' }, [{ from: '--text-primary', to: '--text-main' }], '3.0.0');
  assert.match([...adds.values()][0][0], /--text-primary: var\(--text-main\);.*remove in 3\.0\.0, once every product has moved/);
});

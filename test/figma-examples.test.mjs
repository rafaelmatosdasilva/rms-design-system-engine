// The examples the design team placed in Figma: read in parts, the best kept, and each component opened as one of them
// (its words, its icons, a list's items) in the style guide's Playground.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { examplesSnapshot, bestExample, readExamplesWith } from '../figma-examples.mjs';
import { harnessCases } from '../component-harness.mjs';
import { listSamples } from '../vue-harness.mjs';

const BAR = { page: 'navigation', frame: 'Horizontal Examples', props: { style: '1' }, texts: [], items: ['home-m:Início', 'arrows-m:Transferências', 'bell-m:Notificações'].map((x, i) => ({ component: 'navigation/TabMobile', props: { mainIcon: x.split(':')[0], LabelContent: x.split(':')[1], showLabel: true, state: i === 0 ? 'selected' : 'default' }, texts: [x.split(':')[1]] })) };

test('the parts of a read become one snapshot; the example with real words is the one a component opens with', () => {
  const snap = examplesSnapshot([JSON.stringify({ _read: 't', next: 2, components: { a: [{ props: { labelContent: 'Label' }, texts: ['Label'] }, { props: { labelContent: 'Pagar' }, texts: ['Pagar'] }] } }), `wrapped: ${JSON.stringify({ next: null, components: { 'navigation/BarHorizontal': [BAR] } })}`]);
  assert.deepEqual(Object.keys(snap.components), ['a', 'navigation/BarHorizontal']);
  assert.equal(bestExample(snap, 'a', { properties: { 'labelContent#1:2': { type: 'TEXT', defaultValue: 'Label' } } }).props.labelContent, 'Pagar', 'Figma\'s placeholder words come last');
  assert.equal(bestExample(snap, 'none'), null);
});

test('read through figma-cli in parts: a part cut at its size is read a component at a time, a dropped one again', async () => {
  const seen = [];
  let dropped = false;
  const run = async (script) => {
    const from = Number(/FROM = (\d+)/.exec(script)[1]), count = Number(/COUNT = (\d+)/.exec(script)[1]);
    seen.push(`${from}+${count}`);
    if (from === 0 && count > 1) return '… output cut at 20000 of 30000 characters';
    if (from === 1 && !dropped) { dropped = true; return '✗ Not connected to Figma'; }
    return JSON.stringify({ next: from + 1 < 3 ? from + 1 : null, components: { [`c${from}`]: [{ props: {}, texts: [] }] } });
  };
  const snap = await readExamplesWith(run, { count: 4, wait: 0 });
  assert.deepEqual(Object.keys(snap.components), ['c0', 'c1', 'c2']);
  assert.deepEqual(seen, ['0+4', '0+1', '1+4', '1+4', '2+4']);
});

test('a component opens as its example: its words and icons in every case, a list\'s items its example\'s', () => {
  const entry = { properties: { 'labelContent#1:2': { type: 'TEXT', defaultValue: 'Label' }, 'iconContent#1:3': { type: 'INSTANCE_SWAP', defaultValue: '9:9' }, size: { type: 'VARIANT', defaultValue: 's', variantOptions: ['s', 'm'] } } };
  const cases = harnessCases(entry, 8, { props: { labelContent: 'Pagar', iconContent: 'wallet-m', size: 'm' } });
  assert.equal(cases[0].props.labelContent, 'Pagar');
  assert.equal(cases[0].props.iconContent, 'wallet-m');
  assert.equal(cases[0].props.size, 's', 'a variant stays Figma\'s default: the controls start there');
  assert.ok(cases.every((c) => c.props.labelContent === 'Pagar'));
  const tpl = '<template><div><tab v-for="(tab, index) in tabs" :key="index" :selected="tab.selected" :icon="tab.icon" :label="tab.label" @clicked="emit(\'clicked\', tab.id)"/></div></template>';
  const tabs = listSamples(tpl, ['tabs'], {}, BAR, { 'home-m': 'm/home-m', 'arrows-m': 'm/arrows-m', 'bell-m': 'm/bell-m' }).tabs;
  assert.deepEqual(tabs, [
    { selected: true, icon: 'm/home-m', label: 'Início', id: 1 },
    { selected: false, icon: 'm/arrows-m', label: 'Transferências', id: 2 },
    { selected: false, icon: 'm/bell-m', label: 'Notificações', id: 3 },
  ]);
  assert.deepEqual(listSamples(tpl, ['tabs'], {}, null, {}).tabs.map((t) => t.label), ['Label 1', 'Label 2', 'Label 3'], 'with no example, as before');
});

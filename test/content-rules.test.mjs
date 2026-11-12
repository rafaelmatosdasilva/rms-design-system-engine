// What a component's words need, from the file's own uses (content-rules.mjs): the text properties a use must set,
// room for its longest words, and the name an icon-only use keeps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contentRules, givenProps, labelLengths, isPlaceholder } from '../lib/content-rules.mjs';
import { grammarOf, grammarLines, fixOf } from '../lib/construction-grammar.mjs';

const T = (def) => ({ type: 'TEXT', defaultValue: def });
const props = {
  chip: { properties: { 'labelContent#1:1': T('Label') } },
  stat: { properties: { 'amountText#1:2': T('42%') } },
  tag: { properties: { 'labelContent#1:3': T('Label') } },
  iconButton: { properties: { 'labelContent#1:4': T('Label'), 'showLabel#1:5': { type: 'BOOLEAN', defaultValue: true }, 'icon#1:6': { type: 'INSTANCE_SWAP' } } },
  navItem: { properties: { 'labelContent#1:7': T('Label'), 'showLabel#1:8': { type: 'BOOLEAN', defaultValue: true } } },
  menuItem: { properties: { 'labelContent#1:9': T('Label'), 'showLabel#1:10': { type: 'BOOLEAN', defaultValue: true } } },
};
const text = (prop, more = {}) => ({ t: 'TEXT', n: 'Label', wired: { characters: `${prop}#x` }, ...more });
const skeleton = {
  chip: { trees: [{ c: [text('labelContent', { text: { resize: 'WIDTH_AND_HEIGHT', truncate: 'ENDING' } })] }] },
  tag: { trees: [{ c: [text('labelContent', { text: { resize: 'WIDTH_AND_HEIGHT' } })] }] },
  stat: { trees: [{ c: [text('amountText', { text: { resize: 'WIDTH_AND_HEIGHT' } })] }] },
  iconButton: { trees: [{ c: [{ t: 'INSTANCE', n: 'Icon' }, text('labelContent', { wired: { characters: 'labelContent#1:4', visible: 'showLabel#1:5' } })] }] },
  navItem: { trees: [{ c: [{ t: 'INSTANCE', n: 'Icon' }, { t: 'FRAME', n: 'Words', wired: { visible: 'showLabel#1:8' }, c: [text('labelContent')] }] }] },
  menuItem: { trees: [{ c: [{ t: 'INSTANCE', n: 'Icon' }, text('labelContent', { wired: { characters: 'labelContent#1:9', visible: 'showLabel#1:10' } })] }] },
};
const use = (p, texts = Object.values(p).filter((v) => typeof v === 'string')) => ({ props: p, texts });
const examples = { components: {
  chip: [use({ labelContent: 'Savings accounts in the north region' }), use({ labelContent: 'Loans' }), use({ labelContent: 'Cards' })],
  tag: [use({ labelContent: 'New' }), use({ labelContent: 'Credit accounts of the central bank' }), use({ labelContent: 'Old' })],
  stat: [use({ amountText: '12%' }), use({ amountText: '40%' }), use({ amountText: '3%' })],
  iconButton: [use({ showLabel: false, labelContent: 'Close' }, []), use({ showLabel: false, labelContent: 'Label' }, []), use({ showLabel: true, labelContent: 'Save' })],
  navItem: [use({ showLabel: false, labelContent: 'Home' }, []), use({ showLabel: false, labelContent: 'Find' }, [])],
  menuItem: [use({ showLabel: false, labelContent: 'Open' }, [])],
} };
const rules = () => Object.fromEntries(contentRules({ props, skeleton, examples }).map((r) => [r.id, r]));
const off = (r) => r.items.filter((i) => !i.fits).map((i) => [i.component, i.value]);

test('placeholder words: the property\'s own name, or the words that say "fill this in"', () => {
  assert.ok(isPlaceholder('Label', 'labelContent'));
  assert.ok(isPlaceholder('Step', 'stepText'));
  assert.ok(isPlaceholder('List item', 'textContent'));
  assert.ok(isPlaceholder('{name}', 'x'));
  assert.ok(!isPlaceholder('42%', 'amountText'));
  assert.ok(!isPlaceholder('Pay now', 'textContent'));
});

test('a text property every use sets starts on placeholder words', () => {
  const r = rules()['props-given'];
  assert.deepEqual(r.items.map((i) => i.component).sort(), ['chip', 'stat', 'tag'], 'iconButton keeps its default in one use');
  assert.deepEqual(off(r), [['stat', 'amountText starts on "42%", which all 3 uses replace']]);
  assert.deepEqual(givenProps({ props, examples }).stat, ['amountText'], 'one every use sets is one to give, whatever its default');
  assert.deepEqual(givenProps({ props, examples }).chip, ['labelContent'], 'a placeholder default is one to give');
});

test('a text that grows on one line, whose uses run long, ends in an ellipsis or stops at a maximum width', () => {
  const r = rules()['text-room'];
  assert.deepEqual(r.items.map((i) => [i.component, i.fits]), [['chip', true], ['tag', false]], 'stat\'s uses are short: nothing to say');
  assert.match(off(r)[0][1], /^Label grows on one line with nothing to stop it, and its uses run to 6 words \("Credit accounts/);
  assert.deepEqual(labelLengths({ props, skeleton, examples }).tag, { labelContent: [1, 6] });
});

test('an icon-only use still sets its hidden label, shown by the label or the frame that holds it', () => {
  const r = rules()['icon-only-named'];
  assert.deepEqual(r.items.map((i) => [i.component, i.fits]), [['iconButton', false], ['menuItem', true], ['navItem', true]]);
  assert.deepEqual(off(r), [['iconButton', '1 of 2 icon-only uses leave labelContent on "Label"']]);
});

test('said only from the file\'s uses, three at least, and in the grammar with what an agent must set', () => {
  assert.deepEqual(contentRules({ props, skeleton, examples: null }), []);
  const few = { components: { chip: examples.components.chip.slice(0, 2) } };
  assert.ok(!contentRules({ props, skeleton, examples: few }).some((r) => r.id === 'props-given'), 'two uses are too few');
  const g = grammarOf({ props, skeleton, examples });
  assert.deepEqual(g.figma.content.given.stat, ['amountText']);
  assert.ok(grammarLines(g).some((l) => /^- Text properties a use must set .*stat \(amountText\)/.test(l)));
  assert.ok(!g.figma.rules.some((x) => x.id === 'text-room'), 'two texts are too few for a rule');
  const given = g.figma.rules.find((x) => x.id === 'props-given');
  assert.equal(given.status, 'decide', 'two of three follow it: the team decides');
  assert.match(fixOf(given, given.toFix[0]).say, /^Start the property on placeholder words, so a use that leaves it shows it is unset: amountText starts on "42%"/);
});

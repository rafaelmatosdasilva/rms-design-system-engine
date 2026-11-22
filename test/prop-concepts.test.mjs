// One idea, one prop name and one set of values across the whole system (prop-concepts.mjs), in Figma's grammar and
// the code's, and the catalog answering a guessed name with the system's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conceptOf, nameRule, valueRule, otherNames } from '../lib/prop-concepts.mjs';
import { codeGrammarOf } from '../lib/code-grammar.mjs';

const C = (name, ...props) => ({ name, props: props.map(([n, values = []]) => ({ name: n, values })) });

test('a prop name stands for its idea, however it is held', () => {
  assert.equal(conceptOf('label'), 'words');
  assert.equal(conceptOf('Text'), 'words');
  assert.equal(conceptOf('isDisabled'), 'off');
  assert.equal(conceptOf('showLabel'), 'words');
  assert.equal(conceptOf('Label#12:3'), 'words');
  assert.equal(conceptOf('href'), null);
});

test('the same idea under two names: the name most use is kept, every other listed', () => {
  const r = nameRule([C('button', ['label']), C('chip', ['text']), C('tab', ['label']), C('badge', ['count'])]);
  assert.match(r.says, /^One idea has one prop name across the system: label$/);
  assert.deepEqual(r.items.map((i) => [i.component, i.value, i.fits]), [['button', '', true], ['chip', 'text, where the system says label', false], ['tab', '', true]]);
  assert.equal(nameRule([C('a', ['label']), C('b', ['label'])]), null, 'one name: nothing to say');
});

test('one prop whose values differ from component to component, and a set on another scale', () => {
  const r = valueRule([C('button', ['size', ['S', 'M', 'L']]), C('chip', ['size', ['S', 'M', 'L']]), C('input', ['size', ['sm', 'md', 'lg']]), C('avatar', ['size', ['S', 'M', 'L', 'XL']])]);
  assert.match(r.says, /size takes S, M, L/);
  assert.deepEqual(r.items.filter((i) => !i.fits).map((i) => [i.component, i.value]), [
    ['input', 'size takes sm, md, lg, on another scale than S, M, L'],
    ['avatar', 'size takes S, M, L, XL, where most take S, M, L'],
  ]);
  assert.equal(valueRule([C('a', ['size', ['S', 'M']]), C('b', ['size', ['S', 'M']]), C('c', ['size', ['S', 'M']])]), null);
});

test('the code grammar holds its components to it, as Figma\'s does', () => {
  const comp = (name, props) => ({ name, file: `src/${name}.tsx`, text: `export function ${name}() { return <div className="${name.toLowerCase()}" /> }`, api: { props } });
  const g = codeGrammarOf({ components: [comp('Button', { label: {}, size: { options: ['s', 'm'] } }), comp('Chip', { text: {}, size: { options: ['s', 'm'] } }), comp('Tab', { label: {}, size: { options: ['s', 'm', 'l'] } })] });
  const name = g.code.rules.find((r) => r.id === 'code-one-prop-name'), values = g.code.rules.find((r) => r.id === 'code-one-prop-values');
  assert.deepEqual(name.toFix.map((t) => t.component), ['Chip']);
  assert.deepEqual(values.toFix.map((t) => t.component), ['Tab']);
});

test('the other names of an idea are the ones the system does not use', () => {
  assert.deepEqual(otherNames('label', ['label', 'content']), ['text', 'labeltext', 'caption']);
  assert.deepEqual(otherNames('href', []), []);
});

test('the catalog gives each prop the names an agent will guess, and the check answers a guess with the system\'s', async () => {
  const { checkUi } = await import('../lib/ui-catalog.mjs');
  const catalog = { components: { button: { props: { label: { type: 'text', otherNames: ['text', 'labeltext', 'caption'] } } } } };
  const r = checkUi({ component: 'button', props: { text: 'Save' } }, catalog);
  assert.ok(r.findings.some((f) => f.message === 'button has no prop "text": the system calls it "label"'), JSON.stringify(r.findings));
});

test('--query answers a guessed prop name with the system\'s', async () => {
  const { answer, answerLines } = await import('../lib/query.mjs');
  const catalog = { components: { button: { props: { label: { type: 'text', otherNames: ['text', 'caption'] } } }, chip: { props: { label: { type: 'text', otherNames: ['text'] } } } } };
  const a = answer('text', { catalog });
  assert.equal(a.kind, 'prop');
  assert.deepEqual(answerLines(a), ['text: no component has a prop of that name. The system calls it label', '  button: label', '  chip: label']);
  assert.deepEqual(answerLines(answer('label', { catalog })), ['label: a prop of button, chip']);
});

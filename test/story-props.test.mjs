// A component's stories and examples held to the values its props take today (story-props.mjs), and the code's rule
// that says so (code-grammar.mjs, code-stories-take-values).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { storyBreaks, storyBreakLine } from '../lib/story-props.mjs';
import { codeGrammarOf } from '../lib/code-grammar.mjs';
import { checkSeverities } from '../lib/construction-grammar.mjs';

const api = { props: { size: { options: ['s', 'm', 'l'] }, tone: { options: ['neutral', 'danger'] }, disabled: { options: ['true', 'false'] }, label: {} } };
const csf = `import { Chip } from './Chip';
export default { title: 'Components/Chip', component: Chip, args: { size: 'm', label: 'Chip' } };
export const Small = { args: { size: 's' } };
export const Tiny = { args: { size: 'xs', tone: 'Danger', disabled: true, label: 'Tiny' } };
export const Old = (args) => <Chip {...args} />;
Old.args = { tone: 'error' };
export const Drawn = { render: () => <Chip size="xl" tone={tone} label="x" /> };
`;

test('a story arg or a literal prop its component no longer takes is listed, with where and what it takes', () => {
  const b = storyBreaks({ name: 'chip', api, stories: [{ file: 'src/Chip.stories.tsx', text: csf }] });
  assert.deepEqual(b.map((x) => [x.story, x.prop, x.value, x.line]), [
    ['Tiny', 'size', 'xs', 4],
    ['Old', 'tone', 'error', 6],
    ['Drawn', 'size', 'xl', 7],
  ]);
  assert.match(storyBreakLine(b[0]), /^src\/Chip\.stories\.tsx:4 \(Tiny\) sets size="xs", which size no longer takes: it takes s, m, l$/);
});

test('letter case, a yes or no, an expression, an arg that is no prop and a prop with no listed values are left alone', () => {
  const text = `export default { args: { size: 'M', disabled: false, count: 3, variant: 'ghost', label: 'anything' } };
export const A = { render: () => <Chip size={big ? 'xl' : 's'} label="free text" /> };`;
  assert.deepEqual(storyBreaks({ name: 'Chip', api, stories: [{ file: 'Chip.stories.tsx', text }] }), []);
});

test('a Vue example file is read the same way, its bound values left alone', () => {
  const text = `<template>\n  <Chip size="xs" />\n  <Chip :size="'xl'" />\n</template>`;
  const b = storyBreaks({ name: 'Chip', api, stories: [{ file: 'Chip.examples.vue', text }] });
  assert.deepEqual(b.map((x) => [x.value, x.line]), [['xs', 2]]);
});

const comp = (name, stories) => ({ name, file: `src/${name}.tsx`, text: `export function ${name}() { return <button className="${name.toLowerCase()}" /> }`, api, stories });

test('the code rule: on from the first component with stories, every break to fix, and it fails the check', () => {
  const g = codeGrammarOf({ components: [comp('Chip', [{ file: 'src/Chip.stories.tsx', text: csf }]), comp('Tag', [])] });
  const r = g.code.rules.find((x) => x.id === 'code-stories-take-values');
  assert.ok(r, 'the rule is read with one component that has stories');
  assert.equal(r.of, 1, 'only components with stories are counted');
  assert.equal(r.status, 'fix');
  assert.equal(r.toFix[0].component, 'Chip');
  assert.match(r.toFix[0].value, /size="xs"/);
  assert.ok(checkSeverities(g).errors.some((x) => x.id === 'code-stories-take-values'), 'a broken story fails --construction-check');
  const clean = codeGrammarOf({ components: [comp('Chip', [{ file: 'src/Chip.stories.tsx', text: `export default { args: { size: 's' } };` }])] });
  assert.equal(clean.code.rules.find((x) => x.id === 'code-stories-take-values').status, 'rule');
  const off = codeGrammarOf({ components: [comp('Chip', [{ file: 'src/Chip.stories.tsx', text: csf }])] }, { answers: { 'code-stories-take-values': false } });
  assert.equal(off.code.rules.find((x) => x.id === 'code-stories-take-values'), undefined, 'the team can say no');
});

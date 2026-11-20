// What a team writes into Storybook by hand, read into its specs and guidelines. Nothing here opens a browser: the
// reading is given in, in the shape the page's own expression returns (test/storybook-docs-real.test.mjs reads a real one).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { docsFor, storybookPart, statusFromTags, storyExample, differLines, storybookDocs, buildHash, csfExpression, DOCS_FILE } from '../lib/storybook-docs.mjs';
import { exampleText } from '../lib/intent-examples.mjs';
import { tempDir } from './helpers.mjs';

const READING = { titles: {
  'Components/Forms/Field': { file: './stories/Field.stories.js', description: 'One value a person types.', tags: ['deprecated'],
    argTypes: {
      size: { description: 'Small in tables.', options: ['sm', 'md', 'xl'], default: "'md'" },
      hint: { description: 'A line under the field.', options: null, default: null },
      tone: { description: 'Replaced by status.', options: null, default: null },
    },
    stories: [{ id: 'field--empty', name: 'Empty', args: { size: 'md', label: 'Name' }, tags: [], description: null },
      { id: 'field--error', name: 'With error', args: { invalid: true }, tags: ['!autodocs'], description: 'Shown after a failed save.' }] },
} };
const CODE = { size: { type: 'string', options: ['sm', 'md', 'lg'], default: "'sm'" }, hint: { type: 'string' }, label: { type: 'string' } };
const FIGMA = { 'Size': { type: 'VARIANT', defaultValue: 'md', variantOptions: ['sm', 'md', 'lg'] } };

test("a component's stories are found under its name however the stories title it", () => {
  assert.equal(docsFor('field', READING).title, 'Components/Forms/Field');
  assert.equal(docsFor('Field', READING).file, './stories/Field.stories.js');
  assert.equal(docsFor('Button', READING), null);
  assert.equal(docsFor('Field', null), null, 'no reading is nothing, never a crash');
});

test("the contract takes what the stories say as written: descriptions, options, defaults, examples and tags", () => {
  const part = storybookPart(docsFor('Field', READING), { codeProps: CODE, figmaProps: FIGMA });
  assert.equal(part.from, 'stories/Field.stories.js');
  assert.equal(part.description, 'One value a person types.');
  assert.deepEqual(part.tags, ['deprecated']);
  assert.deepEqual(part.props.find((p) => p.name === 'hint'), { name: 'hint', description: 'A line under the field.' });
  assert.deepEqual(part.examples.map((e) => e.name), ['Empty', 'With error'], 'each story an example, in the file\'s order');
  assert.deepEqual(part.examples[1], { name: 'With error', args: { invalid: true }, description: 'Shown after a failed save.', tags: ['!autodocs'] });
});

test('where the stories and the code or Figma disagree, it is said with both sides', () => {
  const { differs } = storybookPart(docsFor('Field', READING), { codeProps: CODE, figmaProps: FIGMA });
  assert.deepEqual(differs.find((d) => d.prop === 'tone'), { prop: 'tone', what: 'not in the code', storybook: 'Replaced by status.' }, 'a prop the code no longer has');
  assert.ok(differs.some((d) => d.prop === 'size' && d.what === 'options the code does not have' && d.storybook === 'xl'));
  assert.ok(differs.some((d) => d.prop === 'size' && d.what === 'options Storybook does not list' && d.code === 'lg'));
  assert.ok(differs.some((d) => d.prop === 'size' && d.what === 'options Figma does not have' && d.figma === 'sm, md, lg'));
  assert.deepEqual(differs.find((d) => d.what === 'a different default'), { prop: 'size', what: 'a different default', storybook: 'md', code: 'sm' }, "a quoted default and a bare one are compared as values");
  assert.equal(differs.filter((d) => d.prop === 'hint').length, 0, 'a prop both describe alike says nothing');
  const lines = differLines([{ component: 'Field', differs }]);
  assert.ok(lines.some((l) => /^⚠️  \[storybook\] Field: tone, not in the code \(Storybook says Replaced by status\.\)\. Change the story or the code/.test(l)), lines.join('\n'));
  assert.ok(lines.some((l) => /size, a different default \(Storybook says md, the code has sm\)/.test(l)));
});

test('with no code props read, a prop is never said to be missing from the code', () => {
  const { differs } = storybookPart(docsFor('Field', READING), { codeProps: null, figmaProps: FIGMA });
  assert.equal(differs.filter((d) => d.what === 'not in the code').length, 0);
  assert.ok(differs.some((d) => d.what === 'a different default' && d.figma === 'md') === false, 'Figma says md, as the stories do');
});

test("a tag that is a status is the contract's status, said to come from Storybook", () => {
  assert.deepEqual(statusFromTags(['autodocs', 'deprecated']), { state: 'deprecated', source: 'storybook' });
  assert.deepEqual(statusFromTags(['beta']), { state: 'experimental', source: 'storybook' });
  assert.equal(statusFromTags(['autodocs', '!dev']), null);
  assert.equal(statusFromTags(undefined), null);
});

test("a story is written as the guidelines' example, in the code's own syntax, with only the props it has", () => {
  const contract = { name: 'field', source: { code: { syntax: 'vue', tag: 'AcmeField' } }, props: [{ name: 'Size', bindings: { code: { prop: 'size' } } }], codeOnly: [{ name: 'label' }, { name: 'isInvalid' }], storybook: { from: 'stories/Field.stories.js' } };
  const vue = storyExample(contract, { name: 'Empty', args: { size: 'md', label: 'Name "first"', invalid: true, onChange: null } });
  assert.deepEqual(vue, { code: '<AcmeField size="md" label="Name &quot;first&quot;" :is-invalid="true" />', lang: 'vue', story: 'Empty', file: 'stories/Field.stories.js' });
  assert.equal(exampleText(vue), "The team's own story Empty, from stories/Field.stories.js, in Storybook:");
  const jsx = storyExample({ ...contract, source: { code: { syntax: 'jsx', tag: 'Field' } } }, { name: 'Error', args: { isInvalid: true, size: 'sm' } });
  assert.equal(jsx.code, '<Field isInvalid size="sm" />');
  assert.equal(storyExample({ name: 'x', source: { code: {} } }, { name: 'A', args: {} }), null, 'no syntax known, no example');
});

test('the reading is kept on the build, and read again only when Storybook was built again', async () => {
  const root = tempDir('storybook-docs-');
  assert.equal(await storybookDocs(root, {}), null, 'no build, nothing');
  const dir = join(root, 'storybook-static');
  mkdirSync(dir);
  writeFileSync(join(dir, 'iframe.html'), '<!doctype html>');
  writeFileSync(join(dir, 'index.json'), '{"v":5,"entries":{}}');
  const build = buildHash(dir);
  mkdirSync(join(root, DOCS_FILE, '..'), { recursive: true });
  writeFileSync(join(root, DOCS_FILE), JSON.stringify({ at: 'x', build, titles: READING.titles }));
  assert.equal((await storybookDocs(root, {}, { offline: true })).titles['Components/Forms/Field'].description, 'One value a person types.');
  assert.equal(await storybookDocs(root, { storybook: { docs: false } }), null, 'a project can switch it off');
  writeFileSync(join(dir, 'index.json'), '{"v":5,"entries":{"a":{}}}');
  assert.notEqual(buildHash(dir), build);
  assert.equal(await storybookDocs(root, {}, { offline: true }), null, 'a build kept for another build is not this one');
  assert.ok(existsSync(join(root, DOCS_FILE)));
});

test("the page's expression asks the preview's own store, and comes back null on a Storybook without one", async () => {
  const e = csfExpression(['a--b']);
  assert.match(e, /loadCSFFileByStoryId/);
  assert.match(e, /\["a--b"\]/);
  assert.equal(await new Function('window', `return ${e}`)({}), null, 'Storybook 6 has no preview store');
  const meta = { id: 'm', title: 'Components/Tag', parameters: { fileName: './Tag.stories.js', docs: { description: { component: ' A label. ' } } }, tags: ['beta'],
    argTypes: { tone: { description: 'Its colour.', options: ['info', 'warn'], table: { defaultValue: { summary: 'info' } } }, onClick: { action: 'clicked' }, icon: { control: false } } };
  const store = { loadCSFFileByStoryId: async () => ({ meta, stories: { 'm--a': { id: 'm--a', name: 'A', args: { tone: 'warn', render: () => 1, icon: { el: new Map() } }, tags: [], parameters: {} } } }) };
  const got = await new Function('window', `return ${e}`)({ __STORYBOOK_PREVIEW__: { storyStoreValue: store } });
  assert.deepEqual(got['Components/Tag'], { file: './Tag.stories.js', description: 'A label.', tags: ['beta'], argTypes: { tone: { description: 'Its colour.', options: ['info', 'warn'], default: 'info' } },
    stories: [{ id: 'm--a', name: 'A', args: { tone: 'warn' }, tags: [], description: null }] }, 'only plain words leave the page: a function or an element passed in is content');
});

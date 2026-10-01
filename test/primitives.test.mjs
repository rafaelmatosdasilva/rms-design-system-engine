// I42: a raw element styled like a design-system primitive is the primitive written by hand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { primitiveTable, primitiveTag, primitiveOf, primitiveFindings, classRulesOf, declsOf, jsxDeclsOf, normValue, primitiveLine, primitiveGuideLines, projectPrimitives } from '../primitives.mjs';
import { makeFixture } from './helpers.mjs';

const CFG = { primitives: [
  { component: 'Text', props: { size: 'medium', color: 'secondary' }, when: { font: 'var(--body-medium)', color: 'var(--text-secondary)' } },
  { component: 'Text', props: { size: 'medium' }, when: { font: 'var(--body-medium)' } },
  { component: 'Stack', props: { direction: 'column' }, when: { display: 'flex', flexDirection: 'column' } },
  { component: 'Text', props: { size: 'small' }, when: { class: ['text-sm', 'text-muted'] } },
  { component: 'Broken' },
  { props: {}, when: { color: 'red' } },
] };
const TABLE = primitiveTable(CFG);

test('the table: entries without a component or a condition are left out; camelCase properties are CSS names', () => {
  assert.equal(TABLE.length, 4);
  assert.deepEqual([...TABLE[2].decls], [['display', 'flex'], ['flex-direction', 'column']]);
  assert.equal(primitiveTag(TABLE[0]), '<Text size="medium" color="secondary">');
  assert.equal(primitiveTag({ component: 'Divider', props: {} }), '<Divider>');
  assert.deepEqual(primitiveTable({}), []);
});

test('values: a variable matches with or without its fallback, case and spaces do not count', () => {
  assert.equal(normValue('var(--text-secondary, #333)'), 'var(--text-secondary)');
  assert.equal(normValue(' VAR( --Body-Medium ) !important'), 'var(--body-medium)');
  assert.deepEqual([...declsOf('font: var(--body-medium); color:var(--text-secondary,#555)')], [['font', 'var(--body-medium)'], ['color', 'var(--text-secondary)']]);
  assert.deepEqual([...jsxDeclsOf(`display: 'flex', flexDirection: "column", gap: 8, flexGrow: 1`)], [['display', 'flex'], ['flex-direction', 'column'], ['gap', '8px'], ['flex-grow', '1']]);
});

test('the most specific matching entry wins; a partial match is not a match', () => {
  const both = new Map([['font', 'var(--body-medium)'], ['color', 'var(--text-secondary)']]);
  assert.equal(primitiveTag(primitiveOf({ decls: both }, TABLE)), '<Text size="medium" color="secondary">');
  assert.equal(primitiveTag(primitiveOf({ decls: new Map([['font', 'var(--body-medium)'], ['margin', '0']]) }, TABLE)), '<Text size="medium">');
  assert.equal(primitiveOf({ decls: new Map([['color', 'var(--text-secondary)']]) }, TABLE), null);
  assert.equal(primitiveOf({ classes: ['text-sm'] }, TABLE), null);
  assert.equal(primitiveTag(primitiveOf({ classes: ['x', 'text-sm', 'text-muted'] }, TABLE)), '<Text size="small">');
});

test('markup: a style attribute, a JSX style object, a class rule, and utility classes', () => {
  const rules = classRulesOf('.hint { font: var(--body-medium); color: var(--text-secondary); }\n.row .hint { color: red }\n.col, .stack { display: flex; flex-direction: column }');
  const html = [
    '<p style="font: var(--body-medium); color: var(--text-secondary, #555)">Help</p>',
    '<span class="hint">Help</span>',
    '<div className="col" onClick={() => go({ a: 1 })}>',
    '<div style={{ display: "flex", flexDirection: \'column\' }}>',
    '<span class="text-sm text-muted">Small</span>',
    '<span class="title">Not a primitive</span>',
    '<Text size="medium">Already the system</Text>',
    '<button style="font: var(--body-medium)">A control</button>',
  ].join('\n');
  const found = primitiveFindings(html, TABLE, { rules });
  assert.deepEqual(found.map((f) => `${f.line}:${f.tag}:${primitiveTag(f.primitive)}`), [
    '1:p:<Text size="medium" color="secondary">',
    '2:span:<Text size="medium" color="secondary">',
    '3:div:<Stack direction="column">',
    '4:div:<Stack direction="column">',
    '5:span:<Text size="small">',
  ]);
  assert.equal(primitiveLine(found[0], 'src/App.vue'), '<p> src/App.vue:1 is <Text size="medium" color="secondary">, written by hand: use the component.');
});

test('a file\'s own <style> rules count; with no table nothing is read', () => {
  const vue = '<template><span class="note">x</span></template>\n<style scoped>.note { font: var(--body-medium) }</style>';
  assert.equal(primitiveFindings(vue, TABLE).length, 1);
  assert.deepEqual(primitiveFindings(vue, []), []);
});

test('the project: components\' own sources and excluded folders are skipped; the guide lines name the tag', () => {
  const dir = makeFixture({
    'src/theme.css': '.hint { font: var(--body-medium); color: var(--text-secondary) }',
    'src/App.jsx': 'export const App = () => <span className="hint">Help</span>;',
    'src/components/Text.jsx': 'export const Text = () => <span className="hint" />;',
    'legacy/Old.jsx': 'export const Old = () => <span className="hint" />;',
  });
  const cfg = { ...CFG, componentFiles: { Text: ['src/components/Text.jsx'] }, scanExcludeDirs: ['legacy'] };
  assert.deepEqual(projectPrimitives(dir, cfg).map((f) => `${f.file}:${f.line}`), ['src/App.jsx:1']);
  assert.deepEqual(projectPrimitives(dir, {}), []);
  assert.equal(primitiveGuideLines(CFG)[0], '- <Text size="medium" color="secondary"> for an element styled with font: var(--body-medium), color: var(--text-secondary)');
  assert.equal(primitiveGuideLines(CFG)[3], '- <Text size="small"> for an element styled with class text-sm, class text-muted');
});

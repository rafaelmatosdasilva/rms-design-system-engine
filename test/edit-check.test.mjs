// I62: every UI edit is checked when it is made. What an edit added that the design system does not have goes
// back to the agent with the right name; what it did not add, the app's own components, the platform's own
// attributes, token definitions, comments and data stay silent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { addedLines, editFindings, editCheck, componentTagIn, normHex } from '../edit-check.mjs';
import { steeringTruth } from '../steering-check.mjs';
import { makeFixture } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const catalog = { components: { chip: { props: { Size: { type: 'enum', values: ['M', 'L'], codeName: 'size' } } }, button: { props: {} } } };
const theme = ':root {\n  --text-primary: #1b2433;\n  --chip-text: #1B2433;\n  --chip-background: #e8eef9;\n}\n';
const ctx = { truth: steeringTruth({ catalog, cssVars: ['--text-primary', '--chip-text', '--chip-background'] }), tokenByValue: new Map([['#1b2433', ['--text-primary', '--chip-text']], ['#e8eef9', ['--chip-background']]]) };
const find = (added, opts = {}) => editFindings(added, added.join('\n'), ctx, opts).map((f) => f.text);

test('what an edit added: new lines of an Edit or MultiEdit, lines a Write adds to the committed file', () => {
  assert.deepEqual(addedLines({ tool_name: 'Edit', tool_input: { old_string: 'a\nb', new_string: 'a\nb\nc\n' } }), ['c']);
  assert.deepEqual(addedLines({ tool_name: 'MultiEdit', tool_input: { edits: [{ old_string: 'x', new_string: 'y' }, { old_string: '', new_string: 'z' }] } }), ['y', 'z']);
  assert.deepEqual(addedLines({ tool_name: 'Write', tool_input: { content: 'a\nb\nc' } }, { headText: 'a\nc' }), ['b']);
  assert.deepEqual(addedLines({ tool_name: 'Write', tool_input: { content: 'a\nb' } }), ['a', 'b']);   // a new file
  assert.deepEqual(addedLines({ tool_name: 'Read', tool_input: {} }), []);
  assert.equal(normHex('#ABC'), '#aabbcc');
});

test('flags a colour written by hand, with the token that has it, and one the system does not have', () => {
  assert.deepEqual(find(['.card { color: #1B2433; }'], { sheet: true }), ['#1B2433 is written by hand; use var(--text-primary) (or var(--chip-text))']);
  assert.deepEqual(find(['.card { border-color: #ff00aa; }'], { sheet: true }), ['#ff00aa is not a design-system colour; use one of its colour tokens']);
  assert.deepEqual(find(['<div style={{ backgroundColor: "#e8eef9" }}>']), ['#e8eef9 is written by hand; use var(--chip-background)']);
  assert.deepEqual(find(['<rect fill="#e8eef9" />']), ['#e8eef9 is written by hand; use var(--chip-background)']);
});

test('silent on colours that are not styling: token definitions, the theme, comments, links, data, a canvas', () => {
  assert.deepEqual(find(['  --brand: #ff00aa;'], { sheet: true }), []);
  assert.deepEqual(find([':root{--a: #ff00aa;--b: #00ff00}'], { sheet: true }), []);
  assert.deepEqual(find(['.card { color: #ff00aa; }'], { sheet: true, isTheme: true }), []);
  assert.deepEqual(find(['// matches #ff00aa in dark mode'], { sheet: true }), []);
  assert.deepEqual(find(['<a href="#add">Add</a>', '<Link to="#faded">x</Link>']), []);
  assert.deepEqual(find(["  '100': '#f4ed7c', '101': '#f4ed47',"]), []);
  assert.deepEqual(find(["ctx.fillStyle = '#ffffff';"]), []);
  assert.deepEqual(find(['.card { color: var(--text-primary, #1b2433); }'], { sheet: true }), []);   // a fallback goes through the token
});

test('flags a variable declared nowhere, unless the file declares it', () => {
  assert.deepEqual(find(['.x { color: var(--chip-bg); }'], { sheet: true }), ['var(--chip-bg) is not a declared CSS variable']);
  const added = ['.x { --local: 2px; gap: var(--local); }'];
  assert.deepEqual(editFindings(added, added.join('\n'), ctx, { sheet: true }), []);
});

test('props only on a design-system component tag, never on the HTML element or the app\'s own components', () => {
  assert.deepEqual(find(['<Chip size="md" />']), ['size="md" is not a value this prop takes; write size="M"']);
  assert.deepEqual(find(['<Chip Size="L" />']), ['Size= is not the prop\'s name as the code writes it; write size=']);
  assert.deepEqual(find(['<input size="20" />', '<button size="big">x</button>', '<MyChip size="md" />']), []);
  assert.equal(componentTagIn('<hb-chip size="M">', ['chip']), 'hb-chip');
  assert.equal(componentTagIn('<my-custom-chip>', ['chip']), null);
});

test('the hook: a UI edit in a parity project, with an opt-out; everything else passes silently', () => {
  const dir = makeFixture({
    'ds-config.json': { paths: { themeCSS: 'src/theme.css' } },
    'src/theme.css': theme,
    'contracts/catalog.json': catalog,
    'src/pages/Filters.jsx': '<Chip size="md" />\n<span style={{ color: "#1b2433" }}>x</span>\n',
    'src/ui.html': '<p style="color: #ff00aa">x</p>\n',
    'src/ui.src.html': '<p>x</p>\n',
    'notes.md': 'color: #ff00aa\n',
  });
  const write = (file) => ({ hook_event_name: 'PostToolUse', cwd: dir, tool_name: 'Write', tool_input: { file_path: join(dir, file), content: '<Chip size="md" />\n<span style={{ color: "#1b2433" }}>x</span>\n' } });
  const r = editCheck(write('src/pages/Filters.jsx'), { root: dir, cfg: { paths: { themeCSS: 'src/theme.css' } }, headOf: () => null });
  assert.match(r, /2 things it added the system does not have/);
  assert.match(r, /Filters\.jsx:1  size="md" is not a value this prop takes; write size="M"/);
  assert.match(r, /Filters\.jsx:2  #1b2433 is written by hand; use var\(--text-primary\)/);
  assert.match(r, /--query <name>/);
  assert.equal(editCheck(write('src/pages/Filters.jsx'), { root: dir, cfg: { editCheck: false } }), null);
  assert.equal(editCheck(write('src/pages/Filters.jsx'), { root: dir, cfg: { hooks: false } }), null);
  assert.equal(editCheck(write('notes.md'), { root: dir, cfg: {} }), null);                         // not a UI file
  assert.equal(editCheck(write('src/ui.html'), { root: dir, cfg: {}, headOf: () => null }), null);  // built from ui.src.html
  // Nothing added: an edit that only removed lines.
  assert.equal(editCheck({ tool_name: 'Edit', tool_input: { file_path: join(dir, 'src/pages/Filters.jsx'), old_string: 'a\nb', new_string: 'a' } }, { root: dir, cfg: {} }), null);
  // Through the guard, as Claude Code runs it: the reason goes back to the agent.
  const out = spawnSync(process.execPath, [join(ENGINE, 'guard.mjs')], { input: JSON.stringify(write('src/pages/Filters.jsx')), encoding: 'utf8' });
  assert.equal(out.status, 0);
  const j = JSON.parse(out.stdout);
  assert.equal(j.decision, 'block');
  assert.match(j.reason, /size="md" is not a value this prop takes/);
  // No ds-config.json: not a parity project, nothing to say.
  const plain = makeFixture({ 'a.css': '.x{color:#fff}' });
  const none = spawnSync(process.execPath, [join(ENGINE, 'guard.mjs')], { input: JSON.stringify({ hook_event_name: 'PostToolUse', cwd: plain, tool_name: 'Write', tool_input: { file_path: join(plain, 'a.css'), content: '.x{color:#fff}' } }), encoding: 'utf8' });
  assert.equal(none.stdout, '');
});

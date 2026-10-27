// every UI edit is checked when it is made. What an edit added that the design system does not have goes
// back to the agent with the right name; what it did not add, the app's own components, the platform's own
// attributes, token definitions, comments and data stay silent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { addedLines, editFindings, editCheck, componentTagIn, normHex, themeSizes, importFindings, nestedComponents, nestingFindings } from '../edit-check.mjs';
import { varsByMode, pairsOf } from '../token-pairs.mjs';
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

test('a colour written another way: rgb(), hsl(), oklch() or a CSS name, where a style uses it', () => {
  const none = (c) => `${c} is not a design-system colour; use one of its colour tokens`;
  assert.deepEqual(find(['<span class="chip" style="background-color: green; color: white;">Saved</span>']), [none('green'), none('white')]);
  assert.deepEqual(find(['.card { color: rgb(27, 36, 51); }'], { sheet: true }), ['rgb(27, 36, 51) is written by hand; use var(--text-primary) (or var(--chip-text))']);
  assert.deepEqual(find(['.card { border: 1px solid hsl(140 60% 40%); }'], { sheet: true }), [none('hsl(140 60% 40%)')]);
  assert.deepEqual(find(['<div style={{ background: "oklch(0.7 0.15 150)" }}>']), [none('oklch(0.7 0.15 150)')]);
  assert.deepEqual(find(['  color: Tomato;'], { sheet: true }), [none('Tomato')]);
  assert.deepEqual(find(['  .saved { color: green; }'], { sheet: true, isTheme: true }), [none('green')]);
  assert.deepEqual(find(['<rect fill="white" />', "el.style.backgroundColor = 'lime';", '<Box sx={{ color: "red" }} />']), [none('white'), none('lime'), none('red')]);
});

test('silent on a colour name or function that is not a colour of its own: classes, keywords, props, prose, tokens', () => {
  assert.deepEqual(find(['.green { white-space: nowrap; }', '.x { color: currentColor; background: transparent; outline: 2px solid Highlight; }'], { sheet: true }), []);
  assert.deepEqual(find(['.x { animation: fade-white 1s; border-color: var(--text-primary, white); }'], { sheet: true }), []);
  assert.deepEqual(find(['.x { color: rgb(var(--text-primary) / 0.5); background: rgb(from var(--text-primary) r g b / 50%); }'], { sheet: true }), []);
  assert.deepEqual(find(['.x { border-color: var(--text-primary, rgb(0 0 0)); }'], { sheet: true }), []);
  assert.deepEqual(find(['<p>Text color: red means an error</p>', '<Badge color="green">Saved</Badge>', '<Box colorScheme="green" />', '<div className="bg-white text-green-600">']), []);
  assert.deepEqual(find(["ctx.fillStyle = 'white';", "ctx.strokeStyle = 'rgb(0, 0, 0)';"]), []);
});

test('in the theme file, a colour Figma has nowhere is flagged (a page rule written there)', () => {
  assert.deepEqual(find(['.saved { color: #22c55e; }'], { sheet: true, isTheme: true }), ['#22c55e is not a design-system colour; use one of its colour tokens']);
});

test('silent on colours that are not styling: token definitions, the theme, comments, links, data, a canvas', () => {
  assert.deepEqual(find(['  --brand: #ff00aa;'], { sheet: true }), []);
  assert.deepEqual(find([':root{--a: #ff00aa;--b: #00ff00}'], { sheet: true }), []);
  assert.deepEqual(find(['.card { color: #1b2433; }'], { sheet: true, isTheme: true }), [], 'the theme writes the system\'s own values');
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

test('a comment that switches a check off goes back with the rules it names; prose about one does not', () => {
  const off = (rules) => `${rules} switches a check off; fix what the check reports, or ask the person first`;
  assert.deepEqual(find(['  // eslint-disable-next-line jsx-a11y/click-events-have-key-events']), [off('eslint-disable-next-line jsx-a11y/click-events-have-key-events')]);
  assert.deepEqual(find(['{/* eslint-disable-next-line react/jsx-key */}']), [off('eslint-disable-next-line react/jsx-key')]);
  assert.deepEqual(find(['// eslint-disable-next-line no-console -- debugging']), [off('eslint-disable-next-line no-console')]);
  assert.deepEqual(find(['/* stylelint-disable declaration-no-important */'], { sheet: true }), [off('stylelint-disable declaration-no-important')]);
  assert.deepEqual(find(['// biome-ignore lint/a11y/useButtonType: the parent sets it']), [off('biome-ignore lint/a11y/useButtonType')]);
  assert.deepEqual(find(['// @ts-ignore the types are wrong', '{/* @ts-expect-error */}', '// @ts-nocheck', '<!-- eslint-disable -->']),
    [off('@ts-ignore'), off('@ts-expect-error'), off('@ts-nocheck'), off('eslint-disable')]);
  assert.deepEqual(find(['// see the eslint-disable docs', 'const rule = "eslint-disable";', '// eslint-disabled on purpose', '/* eslint-enable */']), []);

  const dir = makeFixture({
    'ds-config.json': { paths: { themeCSS: 'src/theme.css' } },
    'src/theme.css': theme,
    'contracts/catalog.json': catalog,
    'src/pages/Filters.jsx': '{/* @ts-expect-error the old size */}\n<Chip size="M" />\n',
  });
  const r = editCheck({ tool_name: 'Edit', tool_input: { file_path: join(dir, 'src/pages/Filters.jsx'), old_string: '<Chip size="M" />', new_string: '{/* @ts-expect-error the old size */}\n<Chip size="M" />' } }, { root: dir, cfg: { paths: { themeCSS: 'src/theme.css' } }, headOf: () => null });
  assert.match(r, /^rms-design-system-engine checked this edit: 1 thing to fix\.\n/);
  assert.match(r, /Filters\.jsx:1  @ts-expect-error switches a check off/);
  assert.match(r, /\nTake it out and fix what the check reports\. When that cannot be done, ask the person before switching a check off\.$/);
});

test('accessibility where the edit added the line: the static rules with their fix; lines it did not add stay silent', () => {
  const a = { ...ctx, a11y: { styles: () => '' } };
  const run = (full, at, opts) => { const lines = full.split('\n'); return editFindings(at.map((i) => lines[i]), full, a, opts).map((f) => `${f.line}: ${f.text}`); };
  const page = '<button class="old"><Icon name="x" /></button>\n<button onClick={close}><CloseIcon /></button>\n<img src={logo}>\n<div onClick={open}>Open</div>\n<span aria-lable="Close">x</span>\n<button>Save</button>';
  assert.deepEqual(run(page, [1, 2, 3, 4, 5]), [
    '2: a button with only an icon inside and no aria-label, aria-labelledby or title; add aria-label="<what it does>"',
    '3: an image with no alt (use alt="" when it is decorative); add alt="<what it shows>"',
    '4: a clickable <div> with no role and no tabindex: a keyboard cannot reach it (use a <button>)',
    '5: aria-lable is not an ARIA attribute; write aria-label',
  ]);   // the button on line 1 was there before the edit
  // A removed focus outline counts only when no style in the project puts focus back.
  const css = '.chip:focus { outline: none; }';
  assert.deepEqual(run(css, [0], { sheet: true }), ['1: .chip:focus removes the focus outline and no focus style puts one back; add a .chip:focus-visible style that shows where focus is']);
  assert.deepEqual(editFindings([css], css, { ...ctx, a11y: { styles: () => '.chip:focus-visible { box-shadow: 0 0 0 2px var(--focus); }' } }, { sheet: true }), []);
  const vue = '<template><button>Go</button></template>\n<style>\n.go:focus { outline: 0 }\n</style>';
  assert.deepEqual(run(vue, [2], { component: true }), ['3: .go:focus removes the focus outline and no focus style puts one back; add a .go:focus-visible style that shows where focus is']);
  assert.deepEqual(editFindings(['<img src="a.png">'], '<img src="a.png">', ctx), []);   // not asked for (a11yStatic: false)

  const dir = makeFixture({
    'ds-config.json': { paths: { themeCSS: 'src/theme.css' } },
    'src/theme.css': theme,
    'contracts/catalog.json': catalog,
    'src/pages/Filters.jsx': '<button onClick={close}><CloseIcon /></button>\n',
  });
  const edit = { tool_name: 'Write', tool_input: { file_path: join(dir, 'src/pages/Filters.jsx'), content: '<button onClick={close}><CloseIcon /></button>\n' } };
  const r = editCheck(edit, { root: dir, cfg: { paths: { themeCSS: 'src/theme.css' } }, headOf: () => null });
  assert.match(r, /^rms-design-system-engine checked this edit: 1 thing to fix\.\n  Filters\.jsx:1  a button with only an icon inside/);
  assert.match(r, /\nFix it in this file now\.$/);
  assert.equal(editCheck(edit, { root: dir, cfg: { paths: { themeCSS: 'src/theme.css' }, a11yStatic: false }, headOf: () => null }), null);
});

test('a size written by hand: the token with that value, or the nearest; only a kind of size the theme names', () => {
  const sizes = themeSizes(':root {\n  --space-2: 8px;\n  --space-3: 12px;\n  --space-4: 1rem;\n  --radius-md: 6px;\n  --radius-full: 9999px;\n  --font-size-sm: 0.875rem;\n  --spacing: 0.25rem;\n}');
  const s = { ...ctx, truth: steeringTruth({ catalog, cssVars: ['--space-2', '--space-3', '--space-4', '--radius-md', '--radius-full', '--font-size-sm'] }), sizes };
  const run = (lines, opts = { sheet: true }) => editFindings(lines, lines.join('\n'), s, opts).map((f) => f.text);
  assert.deepEqual(run(['.card { padding: 12px 1rem; gap: 10px; border-radius: 6px; font-size: 14px; }']), [
    'padding: 12px is written by hand; use var(--space-3)',
    'padding: 1rem is written by hand; use var(--space-4)',
    'gap: 10px is not a spacing value of the design system; the nearest are var(--space-2) (8px) and var(--space-3) (12px)',
    'border-radius: 6px is written by hand; use var(--radius-md)',
    'font-size: 14px is written by hand; use var(--font-size-sm)',
  ]);
  assert.deepEqual(run(['.pill { border-radius: 9999px; }']), ['border-radius: 9999px is written by hand; use var(--radius-full)']);
  // Left alone: 0, a hairline, a negative, calc(), a pill no token holds, other properties, a token, a token definition, the theme.
  assert.deepEqual(run(['.x { margin: 0 auto; padding: 1px; margin-top: -8px; padding: calc(100% - 12px); border-radius: 999px; width: 12px; line-height: 20px; }', '.y { padding: var(--space-3); }', '  --gap-x: 10px;']), []);
  assert.deepEqual(run(['.card { padding: 10px; }'], { sheet: true, isTheme: true }), []);
  assert.deepEqual(editFindings(['.card { padding: 10px; }'], '.card { padding: 10px; }', { ...ctx, sizes: themeSizes(':root { --radius-md: 6px; }') }, { sheet: true }), []);   // no spacing token, no spacing finding
  // In markup: a style attribute (a bare number is px there) and a style object; an option that is not a style is left alone.
  assert.deepEqual(run(['<div style={{ padding: 12, lineHeight: 1.5 }}>', "const s = { borderRadius: '5px' };", '<Chart options={{ padding: 12 }} />', '<Box sx={{ padding: 2 }}>'], {}), [
    'padding: 12 is written by hand; use var(--space-3)',
    'borderRadius: 5px is not a radius of the design system; the nearest is var(--radius-md) (6px)',
  ]);
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

test('an import a product should no longer write: the replaced library, the system\'s insides past its exports', () => {
  const imports = { replaced: { '@old/ui': '@acme/ds', 'legacy-icons': '@acme/ds/icons' }, system: '@acme/ds', exports: { '.': './index.js', './button': './src/button.js', './icons/*': './icons/*.js' } };
  const f = (line) => importFindings(line, imports);
  assert.deepEqual(f("import { Button } from '@old/ui';"), ["'@old/ui' is from the library the system replaced; import from '@acme/ds'"]);
  assert.deepEqual(f("import Chip from '@old/ui/chip';"), ["'@old/ui/chip' is from the library the system replaced; import from '@acme/ds'"]);
  assert.deepEqual(f("const i = require('legacy-icons');"), ["'legacy-icons' is from the library the system replaced; import from '@acme/ds/icons'"]);
  assert.deepEqual(f("@import '@old/ui/theme.css';"), ["'@old/ui/theme.css' is from the library the system replaced; import from '@acme/ds'"]);
  assert.deepEqual(f("import { Button } from '@acme/ds/src/button.js';"), ["'@acme/ds/src/button.js' reaches inside @acme/ds; import from '@acme/ds/button'"]);
  assert.deepEqual(f("export { Chip } from '@acme/ds/src/chip';"), ["'@acme/ds/src/chip' reaches inside @acme/ds; import from '@acme/ds'"]);
  assert.deepEqual(f("const m = await import('@acme/ds/internal/tokens');"), ["'@acme/ds/internal/tokens' reaches inside @acme/ds; import from '@acme/ds'"]);
  // What the package exports, a pattern included, the package itself, and other modules stay silent.
  for (const ok of ["import { Button } from '@acme/ds';", "import { Button } from '@acme/ds/button';", "import Star from '@acme/ds/icons/star';", "import React from 'react';", "import '@old/uikit';", "import x from './src/local.js';", 'const old = "@old/ui is gone";']) assert.deepEqual(f(ok), [], ok);
  // No exports map: the package's sources, build output and private folders are its insides; the rest is public.
  const bare = { replaced: {}, system: '@acme/ds', exports: null };
  assert.deepEqual(importFindings("import x from '@acme/ds/dist/esm/chip.js';", bare), ["'@acme/ds/dist/esm/chip.js' reaches inside @acme/ds; import from '@acme/ds'"]);
  assert.deepEqual(importFindings("import x from '@acme/ds/_private';", bare), ["'@acme/ds/_private' reaches inside @acme/ds; import from '@acme/ds'"]);
  assert.deepEqual(importFindings("import x from '@acme/ds/chip';", bare), []);
  assert.deepEqual(importFindings("import { Button } from '@old/ui';", null), []);
});

test('the hook reads imports from ds-config.json and the system\'s package.json; the system\'s own repository stays silent', () => {
  const files = {
    'src/theme.css': theme,
    'contracts/catalog.json': catalog,
    'node_modules/@acme/ds/package.json': { name: '@acme/ds', exports: { '.': './index.js', './button': './src/button.js' } },
  };
  const cfg = { paths: { themeCSS: 'src/theme.css' }, imports: { system: '@acme/ds', replaced: { '@old/ui': '@acme/ds' } } };
  const content = "import { Button } from '@acme/ds/src/button.js';\nimport { Chip } from '@old/ui';\nimport { Card } from '@acme/ds';\n";
  const write = (dir) => ({ hook_event_name: 'PostToolUse', cwd: dir, tool_name: 'Write', tool_input: { file_path: join(dir, 'src/pages/Home.jsx'), content } });
  const product = makeFixture({ ...files, 'package.json': { name: 'product' } });
  const r = editCheck(write(product), { root: product, cfg, headOf: () => null });
  assert.match(r, /2 things it added the system does not have/);
  assert.match(r, /Home\.jsx:1  '@acme\/ds\/src\/button\.js' reaches inside @acme\/ds; import from '@acme\/ds\/button'/);
  assert.match(r, /Home\.jsx:2  '@old\/ui' is from the library the system replaced; import from '@acme\/ds'/);
  // The design system's own repository imports its insides; a replaced library is still flagged there.
  const own = makeFixture({ ...files, 'package.json': { name: '@acme/ds' } });
  const o = editCheck(write(own), { root: own, cfg, headOf: () => null });
  assert.doesNotMatch(o, /reaches inside/);
  assert.match(o, /'@old\/ui' is from the library the system replaced/);
  // No imports in ds-config.json: nothing about imports.
  assert.equal(editCheck(write(product), { root: product, cfg: { paths: cfg.paths }, headOf: () => null }), null);
});

test('a component put inside another the way the system never does, with the catalog\'s rules', () => {
  const comps = {
    toolbar: { children: ['buttonTertiary', 'iconButton'], props: { Icon: { type: 'slot' } } },
    card: { children: ['input'], props: { Slot: { type: 'children' } } },                                  // an open slot: anything goes in
    panel: { children: ['input'], props: { Slot: { type: 'children', slot: { preferredOnly: true, preferred: 1 } } } },
    modal: { children: ['buttonPrimary'], neverCombineWith: ['modal'], props: {} },
    buttonPrimary: {}, buttonTertiary: {}, input: {}, iconButton: {},
  };
  const src = [
    '<Toolbar>',
    '  <div className="row">',
    '    <ButtonPrimary label="Go" icon={<IconButton />} />',   // through a div: still inside; the attribute's JSX is not
    '  </div>',
    '  <ButtonTertiary />',
    '</Toolbar>',
    '<Card><ButtonPrimary /></Card>',
    '<Panel><ButtonPrimary /></Panel>',
    '<Modal>',
    '  <MyRow><Input /></MyRow>',                                // the app's own component between: not judged
    '  <Modal />',
    '</Modal>',
    '<Toolbar><hb-icon-button></hb-icon-button></Toolbar>',
  ].join('\n');
  assert.deepEqual(nestedComponents(src, comps).map((x) => `${x.parent}>${x.child}@${x.line}`),
    ['toolbar>buttonPrimary@3', 'toolbar>buttonTertiary@5', 'card>buttonPrimary@7', 'panel>buttonPrimary@8', 'modal>modal@11', 'toolbar>iconButton@13']);
  assert.deepEqual(nestingFindings(src, comps), [
    { line: 3, text: 'the design system never puts buttonPrimary inside toolbar (it holds only buttonTertiary, iconButton): put it beside toolbar, not inside it' },
    { line: 8, text: 'the design system never puts buttonPrimary inside panel (it holds only input): put it beside panel, not inside it' },
    { line: 11, text: 'modal must never contain modal; put the modal beside it' },
  ]);
  // Through the edit check: only where the edit added the inner component.
  const ctx2 = { ...ctx, nesting: comps };
  const lines = src.split('\n');
  assert.deepEqual(editFindings([lines[2]], src, ctx2).map((f) => [f.line, f.kind]), [[3, 'nesting']]);
  assert.deepEqual(editFindings([lines[4]], src, ctx2), []);
  assert.deepEqual(editFindings([lines[2]], src, ctx2, { sheet: true }).filter((f) => f.kind === 'nesting'), []);
});

test('a plain element the edit styled as a declared primitive: the component to write, only on added lines', async () => {
  const { primitiveTable } = await import('../primitives.mjs');
  const primitives = primitiveTable({ primitives: [{ component: 'Text', props: { size: 'medium', color: 'secondary' }, when: { font: 'var(--body-medium)', color: 'var(--text-secondary)' } }] });
  const p = { ...ctx, truth: steeringTruth({ catalog, cssVars: ['--body-medium', '--text-secondary'] }), primitives, rules: new Map([['hint', new Map([['font', 'var(--body-medium)'], ['color', 'var(--text-secondary)']])]]) };
  const full = '<span class="hint">old</span>\n<p style="font: var(--body-medium); color: var(--text-secondary)">new</p>\n<span class="hint">new</span>';
  const added = full.split('\n').slice(1);
  assert.deepEqual(editFindings(added, full, p).map((f) => `${f.line}: ${f.text}`), [
    '2: <p> styled by hand is the system\'s <Text size="medium" color="secondary">; use the component',
    '3: <span> styled by hand is the system\'s <Text size="medium" color="secondary">; use the component',
  ]);
  assert.deepEqual(editFindings(added, full, { ...p, primitives: [] }), []);
  assert.deepEqual(editFindings(['.hint { font: var(--body-medium) }'], '.hint { font: var(--body-medium) }', p, { sheet: true }), []);
});

// A text or icon colour put on a surface it was not made for. Every token is the system's own, so nothing is
// invented: what is wrong is the pairing, and it reads as a different grey on every card long before anyone notices.
test('an edit that pairs a colour with the wrong surface is told so, with the contrast the two give', () => {
  const theme = [':root {', '  --content-on-interactive: #ffffff;', '  --surface-interactive: #1a5fd0;', '  --surface-base: #ffffff;', '}'].join('\n');
  const colorVars = varsByMode(theme);
  const pairs = pairsOf(colorVars);
  const full = ['.card {', '  color: var(--content-on-interactive);', '  background: var(--surface-base);', '}', '.btn { color: var(--content-on-interactive); background-color: var(--surface-interactive); }'].join('\n');
  const lines = full.split('\n');
  const only = { ...ctx, colorVars, pairs };
  const run = (at) => editFindings(at.map((i) => lines[i]), full, only, { sheet: true }).filter((f) => f.kind === 'pair');
  const found = run([1, 2]);
  assert.equal(found.length, 1, JSON.stringify(found));
  assert.equal(found[0].line, 2);
  assert.match(found[0].text, /--content-on-interactive is the system's colour for --surface-interactive, not for --surface-base/);
  assert.match(found[0].text, /1:1 there, under 4\.5:1/);
  // The pair the system did make says nothing, and so does a theme file: that is where the pairs are declared.
  assert.deepEqual(run([4]), []);
  assert.deepEqual(editFindings([lines[1]], full, only, { sheet: true, isTheme: true }).filter((f) => f.kind === 'pair'), []);
  // A rule that sets only the text colour pairs nothing: what is under it is whatever the page puts there.
  assert.deepEqual(editFindings(['  color: var(--content-on-interactive);'], '.x {\n  color: var(--content-on-interactive);\n}', only, { sheet: true }).filter((f) => f.kind === 'pair'), []);
});

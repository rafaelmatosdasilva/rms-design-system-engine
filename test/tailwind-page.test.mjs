// A Tailwind system's compiled CSS on its style guide page, its reset kept to the drawings (tailwind-page.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTailwindEntry, tailwindForPage, DRAWN } from '../lib/tailwind-page.mjs';

test('a stylesheet is Tailwind\'s entry when it imports Tailwind or names its layers', () => {
  assert.equal(isTailwindEntry('@import "tailwindcss";\n@theme inline { --color-primary: var(--primary); }'), true);
  assert.equal(isTailwindEntry("@import 'tailwindcss/preflight';"), true);
  assert.equal(isTailwindEntry('@tailwind base;\n@tailwind utilities;'), true, 'Tailwind 3');
  assert.equal(isTailwindEntry(':root { --primary: #000; }\n.button { color: var(--primary); }'), false);
  assert.equal(isTailwindEntry('@import "./tokens.css";'), false);
});

test('its base layer (the reset, the system\'s own base rules) is kept to the drawings, its utilities are not touched', () => {
  const css = '@layer theme, base, components, utilities;\n@layer theme { :root { --color-primary: red; } }\n'
    + '@layer base { *, ::before { margin: 0; padding: 0; } button { background: transparent; } body { background: var(--background); } }\n'
    + '@layer utilities { .h-5 { height: calc(var(--spacing) * 5); } .content-\\[\\"\\}\\"\\] { content: "}"; } }';
  const out = tailwindForPage(css);
  assert.match(out, /@layer base \{\n@scope \(\.pg-preview, [^)]*\) \{\n \*, ::before \{ margin: 0; padding: 0; \} button \{[^}]*\} body \{[^}]*\} \n\}\n\}/);
  assert.ok(DRAWN.every((d) => out.includes(d)), 'every place a component is drawn');
  assert.match(out, /@layer theme \{ :root \{ --color-primary: red; \} \}/, 'the theme layer as compiled');
  assert.match(out, /@layer utilities \{ \.h-5 \{ height: calc\(var\(--spacing\) \* 5\); \}/, 'the utilities as compiled');
  assert.match(out, /content: "\}"; \} \}$/, 'a brace inside a string never ends a block');
  assert.equal(tailwindForPage('.a { color: red; }'), '.a { color: red; }', 'a sheet with no base layer is left as it is');
  assert.equal((tailwindForPage('@layer base { a { b: c } }\n@layer base { d { e: f } }').match(/@scope/g) ?? []).length, 2, 'each base layer');
});

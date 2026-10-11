// System health (L7, K14, F8, F11, F14, I17): advice the audit gives so the system stays healthy as it grows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modeAttributes, modesBelowRoot, productsWithTwoThemes, undescribedTokens, catalogueOnlyPatches, nearDuplicateComponents, namedByLook } from '../system-advice.mjs';

test('L7: a mode set on an element below the page root, in markup or a script', () => {
  const theme = ':root { --bg: #fff; }\n[data-theme="dark"] { --bg: #000; }\n:root[data-size=phone] { --pad: 4px; }\n.card[data-open] { display: block; }';
  assert.deepEqual(modeAttributes(theme), ['data-size', 'data-theme']);   // a rule with no custom property is not a mode
  const files = [
    { file: 'index.html', text: '<html data-theme="dark">\n<body data-size="phone">\n<div class="panel" data-theme="light">' },
    { file: 'app.js', text: "document.documentElement.setAttribute('data-theme', t);\npanel.setAttribute('data-theme', 'dark');\ndocument.body.dataset.size = 'phone';\ncard.dataset.theme = 'dark';" },
  ];
  assert.deepEqual(modesBelowRoot(files, ['data-size', 'data-theme']).map((f) => `${f.file}:${f.line} ${f.attr} on ${f.on}`), [
    'index.html:3 data-theme on <div>',
    'app.js:2 data-theme on panel',
    'app.js:4 data-theme on card',
  ]);
  assert.deepEqual(modesBelowRoot(files, []), []);
});

test('K14: a product that brings in two of the system\'s themes', () => {
  const products = {
    shop: [{ file: 'shop/main.css', text: "@import '@acme/ds/theme.css';\n@import url('@acme/ds/brand-b.css');" }],
    admin: [{ file: 'admin/main.js', text: "import '@acme/ds/theme.css';" }, { file: 'admin/index.html', text: '<link rel="stylesheet" href="/ds/theme.css">' }],
  };
  assert.deepEqual(productsWithTwoThemes(products, ['packages/ui/theme.css', 'packages/ui/brand-b.css']), [{ product: 'shop', themes: ['brand-b.css', 'theme.css'], files: ['shop/main.css'] }]);
  assert.deepEqual(productsWithTwoThemes(products, ['packages/ui/theme.css']), []);   // one theme file: nothing to bring in twice
});

test('F8: semantic tokens with no description; primitives are left out', () => {
  const vars = { color: { light: { 'text/primary': '#111', 'text/muted/color': '#666', 'primitives/gray/900': '#111' } }, sizing: { 'space/s': '4px' },
    tokenMeta: { 'text/primary': { description: 'Body text' }, 'text/muted': { description: 'Secondary text' } } };
  assert.deepEqual(undescribedTokens(vars), { total: 3, missing: ['space/s'] });
});

test('F11: a Storybook preview rule that styles a component', () => {
  const files = [
    { file: '.storybook/preview.css', text: 'body { margin: 0; }\n.chip { padding: 8px; }\n.chip-row .chip:hover { color: red; }\n.chipset { gap: 2px; }' },
    { file: '.storybook/preview-head.html', text: '<link rel="preconnect">\n<style>\n  .button { min-width: 80px; }\n</style>' },
  ];
  assert.deepEqual(catalogueOnlyPatches(files, { chip: '.chip', button: '.button' }).map((f) => `${f.file}:${f.line} ${f.component} ${f.selector}`), [
    '.storybook/preview.css:2 chip .chip',
    '.storybook/preview.css:3 chip .chip-row .chip:hover',
    '.storybook/preview-head.html:3 button .button',
  ]);
});

test('F14: two components whose own rules are nearly the same', () => {
  const base = 'display: inline-flex; align-items: center; gap: var(--gap-s); padding: 0 var(--padding-m); border-radius: var(--radius-pill); font: var(--label);';
  const css = `.tag { ${base} }\n.chip { ${base} background: var(--chip-bg); }\n.card { display: block; padding: var(--padding-l); border: 1px solid; border-radius: var(--radius-m); background: var(--surface); }`;
  assert.deepEqual(nearDuplicateComponents(css, { tag: '.tag', chip: '.chip', card: '.card' }), [{ a: 'chip', b: 'tag', same: 6, of: 7 }]);
  assert.deepEqual(nearDuplicateComponents(css, { tag: '.tag', card: '.card' }), []);
});

test('I17: semantic tokens named by look, not by role', () => {
  assert.deepEqual(namedByLook(['text/primary', 'background/blue-500', 'border/gray', 'primitives/blue/500', 'icon/subtle', 'surface/50']), [
    { name: 'background/blue-500', word: 'blue' },
    { name: 'border/gray', word: 'gray' },
    { name: 'surface/50', word: '50' },
  ]);
});

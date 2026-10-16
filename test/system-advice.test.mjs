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

test('the To do rows for the tokens: descriptions for Figma, then two decisions, each with its examples; shared primitives are no row', async () => {
  const { tokenTodos } = await import('../system-advice.mjs');
  const { tokenUsers } = await import('../contract-gen.mjs');
  const vars = { color: {
    light: { 'a/x/color': '#fff', 'b/y/color': '#fff', 'c/z/color': '#fff', 'd/w/color': '#fff', 'e/color': '#000', 'f/color': '#000', 'primitives/white': '#fff' },
    dark: { 'a/x/color': '#111', 'b/y/color': '#111', 'c/z/color': '#111', 'd/w/color': '#111', 'e/color': '#eee', 'f/color': '#eee', 'primitives/white': '#fff' } },
    tokenMeta: { 'e/color': { description: 'Body text' } } };
  const built = [{ name: 'input', contract: { anatomy: { root: { radiusToken: '{radii.input}', gapToken: '{gap.l}' } } } }, { name: 'card', contract: { anatomy: { root: { gapToken: '{gap.l}' } } } }];
  const rows = tokenTodos({ vars, users: tokenUsers(built) });
  assert.deepEqual(rows.map((r) => [r.kind, r.who]), [['Description', 'figma'], ['Same value', 'both'], ['Single use', 'both']]);
  assert.match(rows[0].say, /^5 shared tokens \(no component holds them as its own\) have no description in Figma \(a\/x\/color, b\/y\/color, c\/z\/color, d\/w\/color, and 1 more\)\. Each component's own tokens are in its Documentation\.$/);
  assert.match(rows[1].say, /^2 groups of tokens hold the same value written by hand rather than pointing at one primitive \(a\/x\/color, b\/y\/color, and 2 more; e\/color and f\/color\)\.$/);
  // Tokens that point at the same primitive share its value by design: no row for them.
  const aliased = { ...vars, aliases: Object.fromEntries(['light', 'dark'].map((m) => [m, Object.fromEntries(Object.keys(vars.color[m]).filter((n) => !n.startsWith('primitives/')).map((n) => [n, ['primitives/white']]))])) };
  assert.deepEqual(tokenTodos({ vars: aliased }).map((r) => r.kind), ['Description']);
  assert.equal(rows[2].say, '1 token is used by one component only (radii/input in input).');
  // Nothing to do: no rows; no contracts written yet: no single-use row.
  assert.deepEqual(tokenTodos({ vars: { color: { light: { 'e/color': '#000' } }, tokenMeta: { 'e/color': { description: 'Body text' } } } }), []);
  assert.equal(tokenTodos({ vars }).length, 2);
});

test('aliases to a removed token: a Figma variable the capture found pointing nowhere, a code token showing only its fallback', async () => {
  const { brokenFigmaAliases, danglingCodeAliases, tokenTodos } = await import('../system-advice.mjs');
  assert.deepEqual(brokenFigmaAliases({ brokenAliases: [{ name: 'chip/bg', mode: 'Light', target: 'VariableID:1:2' }, { mode: 'Dark' }] }), [{ name: 'chip/bg', mode: 'Light', target: 'VariableID:1:2' }]);
  assert.deepEqual(brokenFigmaAliases({}), []);
  const files = [
    { file: 'theme.css', text: ':root { --surface: #fff;\n  --chip-bg: var(--surface-raised, #fff);\n  --ok: var(--surface);\n  /* --gone: var(--nothing, red); */ }' },
    { file: 'app.css', text: '.x { color: var(--old-text, #333); background: var(--hook, red); border-color: var(--set-by-js, red); }' },
    { file: 'app.js', text: "el.style.setProperty('--set-by-js', '#000');" },
  ];
  const removed = (t) => (t === '--old-text' ? { sha: 'abc123', date: '2026-09-30' } : null);
  // A token's own definition always counts; a use elsewhere only when the history shows the token was declared once (a
  // theming hook nobody declares is left alone); one set from a script, a comment and a declared token are not listed.
  assert.deepEqual(danglingCodeAliases(files, { removed }), [
    { file: 'theme.css', line: 2, token: '--chip-bg', target: '--surface-raised', removed: null },
    { file: 'app.css', line: 1, token: null, target: '--old-text', removed: { sha: 'abc123', date: '2026-09-30' } },
  ]);
  const rows = tokenTodos({ vars: { brokenAliases: [{ name: 'chip/bg', mode: 'Light', target: 'surface/raised' }] }, dangling: danglingCodeAliases(files, { removed }) });
  assert.deepEqual(rows.map((r) => [r.kind, r.who]), [['Broken alias', 'figma'], ['Broken alias', 'code']]);
  assert.match(rows[0].say, /^1 Figma variable points at a variable that is no longer in the file \(chip\/bg to surface\/raised\)\.$/);
  assert.match(rows[1].say, /^2 tokens in the code point at a token declared nowhere, so they show only their fallback \(--chip-bg to --surface-raised; app\.css:1 to --old-text, removed in abc123\)\.$/);
});

test('F6: a token named after a product or a brand, the components\' own tokens aside', async () => {
  const { brandNamedTokens, tokenTodos } = await import('../system-advice.mjs');
  const { brandNames } = await import('../code-roots.mjs');
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(join(tmpdir(), 'brands-'));
  writeFileSync(join(dir, 'products.json'), JSON.stringify({ products: [{ name: 'Harbor Notes', repo: 'acme/harbor-notes' }] }));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: '@acme/ds' }));
  const brands = brandNames(dir, { pluginDirs: { 'tide-chart': '../tide' }, brands: ['Lab'] });
  assert.deepEqual(brands, ['Harbor Notes', 'harbor-notes', 'tide-chart', 'Lab', 'acme']);
  const names = ['harborNotes/accent/color', 'acme/primary', 'text/primary', 'label/color', 'lab/surface', 'badge/acme', 'tideChartHeader/color', 'primitives/blue'];
  // A short name matches a whole part only (lab, not label); a long one inside a part (tideChartHeader).
  assert.deepEqual(brandNamedTokens(names, { brands, components: ['badge'] }).map((x) => [x.name, x.brand]),
    [['harborNotes/accent/color', 'Harbor Notes'], ['acme/primary', 'acme'], ['lab/surface', 'Lab'], ['tideChartHeader/color', 'tide-chart']]);
  const row = tokenTodos({ vars: { color: { light: { 'acme/primary': '#000' } }, tokenMeta: { 'acme/primary': { description: 'x' } } }, brands }).find((r) => r.kind === 'Brand in the name');
  assert.equal(row.who, 'figma');
  assert.match(row.say, /^1 token is named after a product or brand \(acme\/primary for acme\)/);
});

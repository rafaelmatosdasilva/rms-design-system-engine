// I65, first part: Tailwind classes with a value in brackets, compared with the project's own @theme.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { themeValues, arbitraryFindings, arbitraryLine, usesTailwind, projectArbitrary } from '../tailwind-check.mjs';
import { editCheck } from '../edit-check.mjs';
import { makeFixture } from './helpers.mjs';

const css = '@import "tailwindcss";\n@theme {\n  --color-action-primary: #0A6C74;\n  --color-status-danger: #b42318;\n  --radius-control: 6px;\n  --spacing-2: 8px;\n  --text-sm: 14px;\n  --font-weight-semibold: 600;\n}\n';
const theme = themeValues(css);
const lines = (html) => arbitraryFindings(html, theme).map((f) => arbitraryLine('x', f).replace(/^x:\d+ {2}/, ''));

test('the theme by namespace and value', () => {
  assert.deepEqual([...theme.keys()], ['color', 'radius', 'spacing', 'text', 'font-weight']);
  assert.deepEqual(theme.get('color').get('#0a6c74'), ['action-primary']);
  assert.equal(usesTailwind(css), true);
  assert.equal(usesTailwind(':root { --x: 1px; }'), false);
});

test('a value the theme has: its utility, keeping variants, the sign and the opacity', () => {
  assert.deepEqual(lines('<a className="hover:bg-[#0a6c74] rounded-[6px] -mt-[8px] text-[14px] font-[600] bg-[#B42318]/50">'), [
    'hover:bg-[#0a6c74]  the theme has this value: write hover:bg-action-primary',
    'rounded-[6px]  the theme has this value: write rounded-control',
    '-mt-[8px]  the theme has this value: write -mt-2',
    'text-[14px]  the theme has this value: write text-sm',
    'font-[600]  the theme has this value: write font-semibold',
    'bg-[#B42318]/50  the theme has this value: write bg-status-danger/50',
  ]);
});

test('a value the theme does not have, and what is not a literal', () => {
  assert.deepEqual(lines('<div class="w-[137px] text-[#ff00aa] rounded-[4px]">'), [
    'w-[137px]  137px is not a design-system value',
    'text-[#ff00aa]  #ff00aa is not a design-system value (a colour the theme does not have)',
    'rounded-[4px]  4px is not a design-system value',
  ]);
  assert.deepEqual(lines('<div class="bg-[url(/a.png)] w-[var(--w)] grid-cols-[1fr_2fr] z-[5] data-[state=open]:block">'), []);
});

test('the project, and the edit hook, only where Tailwind is used', () => {
  const dir = makeFixture({ 'ds-config.json': { paths: { themeCSS: 'src/app.css' } }, 'src/app.css': css, 'src/Badge.tsx': 'export const B = () => <span className="rounded-[4px] p-2">x</span>;\n' });
  const r = projectArbitrary(dir, css);
  assert.equal(r.tailwind, true);
  assert.deepEqual(r.findings.map((f) => `${f.file}:${f.line} ${f.cls}`), ['src/Badge.tsx:1 rounded-[4px]']);
  assert.deepEqual(projectArbitrary(dir, ':root{}'), { tailwind: false, findings: [] });
  const edit = { tool_name: 'Edit', tool_input: { file_path: join(dir, 'src/Badge.tsx'), old_string: 'x', new_string: '<b className="rounded-[6px] bg-[#b42318]">y</b>' } };
  const out = editCheck(edit, { root: dir, cfg: { paths: { themeCSS: 'src/app.css' } } });
  assert.match(out, /rounded-\[6px\] is outside the theme; write rounded-control/);
  assert.match(out, /bg-\[#b42318\] is outside the theme; write bg-status-danger/);
  assert.doesNotMatch(out, /#b42318 is written by hand/);   // reported once, as the class
  assert.equal(editCheck(edit, { root: dir, cfg: { paths: { themeCSS: 'src/app.css' }, tailwind: false } }), null);
});

test('I65 part two: the Tailwind preset names tokens the way @theme does', async () => {
  const { resolveNamingSpec, tokenToVar } = await import('../naming-convention.mjs');
  const spec = resolveNamingSpec({ figma: { namingConvention: { preset: 'tailwind', dropSegments: ['color'] } } });
  assert.equal(tokenToVar('surface/base/color', spec), '--color-surface-base');
  assert.equal(tokenToVar('action/primary/text/color', spec), '--color-action-primary-text');
  assert.equal(tokenToVar('radius/control', spec, { raw: true }), '--radius-control');
  assert.equal(tokenToVar('space/2', spec, { raw: true }), '--spacing-2');
  assert.equal(tokenToVar('radii/chip', spec, { raw: true }), '--radius-chip');
  // Declared by hand, the same: a namespace and first-segment renames of one's own.
  const own = resolveNamingSpec({ figma: { namingConvention: { colorNamespace: 'c', namespaces: { gap: 'space' } } } });
  assert.equal(tokenToVar('surface/page/color', own), '--c-surface-page');
  assert.equal(tokenToVar('gap/m', own, { raw: true }), '--space-m');
  // Without either, nothing changes.
  assert.equal(tokenToVar('surface/page/color', resolveNamingSpec({})), '--surface-page');
});

test('a theme variable is used through its utility', async () => {
  const { usedByUtility } = await import('../tailwind-check.mjs');
  const src = '<b className="hover:bg-action-primary/50 rounded-control p-2 md:flex">x</b>';
  assert.equal(usedByUtility('--color-action-primary', src), true);
  assert.equal(usedByUtility('--radius-control', src), true);
  assert.equal(usedByUtility('--spacing-2', src), true);
  assert.equal(usedByUtility('--breakpoint-md', src), true);
  assert.equal(usedByUtility('--color-surface-base', src), false);
  assert.equal(usedByUtility('--my-own-var', src), false);   // not a namespace Tailwind makes utilities from
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModes, loadCollections, allModes, buildResolver, detectModes } from '../mode-resolver.mjs';

// ── loadModes / loadCollections / allModes ───────────────────────────────────
test('loadModes falls back to light/dark when nothing configured', () => {
  assert.deepEqual(loadModes({}).map(m => m.snapshotKey), ['light', 'dark']);
});

test('loadCollections is empty unless declared, and normalises kind', () => {
  assert.deepEqual(loadCollections({}), []);
  const cfg = { figma: { collections: [
    { name: 'Breakpoint', modes: [{ name: 'Phone', snapshotKey: 'phone', cssSelector: 'root' }] },
    { name: 'Empty' }, // dropped: no modes
  ] } };
  const cols = loadCollections(cfg);
  assert.equal(cols.length, 1);
  assert.equal(cols[0].kind, 'scalar'); // default
});

test('allModes unions color axis + collections, deduped by snapshotKey', () => {
  const cfg = { figma: {
    modes: [{ name: 'Light', snapshotKey: 'light', cssSelector: 'root' },
            { name: 'Dark', snapshotKey: 'dark', cssSelector: 'dark-media' }],
    collections: [{ name: 'Breakpoint', kind: 'scalar', modes: [
      { name: 'Phone', snapshotKey: 'phone', cssSelector: 'root' },
      { name: 'Tablet', snapshotKey: 'tablet', cssSelector: 'media:(min-width: 768px)' },
    ] }],
  } };
  assert.deepEqual(allModes(cfg).map(m => m.snapshotKey), ['light', 'dark', 'phone', 'tablet']);
});

// ── resolve (hex) stays byte-identical to the 2-mode behaviour ────────────────
const COLOR_CSS = `
:root { --brand: #ff0000; --surface: var(--brand); }
@media (prefers-color-scheme: dark) { :root { --brand: #00ff00; } }
`;
const LD = [{ name: 'Light', snapshotKey: 'light', cssSelector: 'root' },
            { name: 'Dark', snapshotKey: 'dark', cssSelector: 'dark-media' }];

test('resolve() returns lowercased hex and follows var() + media override', () => {
  const { resolve } = buildResolver(COLOR_CSS, LD);
  assert.equal(resolve('--brand', 'light'), '#ff0000');
  assert.equal(resolve('--brand', 'dark'), '#00ff00');
  assert.equal(resolve('--surface', 'light'), '#ff0000'); // alias
  assert.equal(resolve('--surface', 'dark'), '#00ff00');  // alias inherits dark override
  assert.equal(resolve('--missing', 'light'), null);
});

// ── resolveRaw returns scalars/strings, and generic media: selector works ─────
const SIZE_CSS = `
:root { --gap-m: 8px; --pad: var(--gap-m); --font: Inter; }
@media (min-width: 768px) { :root { --gap-m: 12px; } }
@media (min-width:1200px) { :root { --gap-m: 16px; } }
`;
const BP = [
  { name: 'Phone', snapshotKey: 'phone', cssSelector: 'root' },
  { name: 'Tablet', snapshotKey: 'tablet', cssSelector: 'media:(min-width: 768px)' },
  { name: 'Desktop', snapshotKey: 'desktop', cssSelector: 'media:(min-width: 1200px)' },
];

test('resolveRaw resolves scalars per breakpoint mode (mobile-first cascade)', () => {
  const { resolveRaw } = buildResolver(SIZE_CSS, BP);
  assert.equal(resolveRaw('--gap-m', 'phone'), '8px');    // base :root
  assert.equal(resolveRaw('--gap-m', 'tablet'), '12px');  // media override (spaced condition)
  assert.equal(resolveRaw('--gap-m', 'desktop'), '16px'); // media override (unspaced condition)
  assert.equal(resolveRaw('--pad', 'tablet'), '12px');    // alias inherits the override
});

test('resolveRaw returns string literals, resolve() returns null for non-hex', () => {
  const { resolve, resolveRaw } = buildResolver(SIZE_CSS, BP);
  assert.equal(resolveRaw('--font', 'phone'), 'Inter');
  assert.equal(resolve('--gap-m', 'phone'), null); // scalar is not a hex
});

// ── detectModes: --init reads where the theme CSS puts each mode ─────────────
test('detectModes maps each Figma mode to the override block the theme CSS really has', () => {
  const sel = (css, keys) => detectModes(css, keys).modes.map((m) => m.cssSelector);
  assert.deepEqual(sel(':root{--a:1} :root[data-theme="dark"]{--a:2}'), ['root', 'data:theme=dark']);
  assert.deepEqual(sel(':root{--a:1} @media (prefers-color-scheme: dark){:root{--a:2}}'), ['root', 'dark-media']);
  assert.deepEqual(sel(':root{--a:1} .theme-dark{--a:2}'), ['root', 'class:theme-dark']);
  assert.deepEqual(sel(':root{--a:1} [data-mode=night]{--a:2}', ['day', 'night']), ['root', 'data:mode=night']);
  // Each mode to its own block, whatever the order in the file.
  assert.deepEqual(sel(':root{--a:1} [data-theme=contrast]{--a:3} [data-theme=dark]{--a:2}', ['light', 'dark', 'contrast']), ['root', 'data:theme=dark', 'data:theme=contrast']);
  // A block without custom properties is not a mode.
  assert.deepEqual(detectModes(':root{--a:1} [data-theme=dark] .x{color:red} .dark{color:red}').unsure, ['dark']);
  // Nothing found: the old default, and the setup says which mode to check.
  const none = detectModes(':root{--a:1}');
  assert.deepEqual(none.modes.map((m) => m.cssSelector), ['root', 'dark-media']);
  assert.deepEqual(none.unsure, ['dark']);
  assert.deepEqual(detectModes(':root{--a:1}', ['Light', 'Dark']).modes.map((m) => [m.name, m.snapshotKey]), [['Light', 'light'], ['Dark', 'dark']]);
});

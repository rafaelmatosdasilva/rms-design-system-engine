// Regression tests for naming-check.mjs (Gate: no invented CSS variables) and its A4 fix:
// color tokens are now read across ALL configured modes, not just hardcoded light/dark.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGate, EMPTY_ENGINE_MAP } from './helpers.mjs';

const GATE = 'naming-check.mjs';
const paths = { themeCSS: 'theme.css', snapshotVars: 'figma-vars.snapshot.json' };

test('[bugfix A4] a color token in a NON-light/dark mode traces back (not "invented")', () => {
  const { code, out } = runGate(GATE, {
    'ds-config.json': { paths, figma: { modes: [
      { name: 'Day',   snapshotKey: 'day',   cssSelector: 'root' },
      { name: 'Night', snapshotKey: 'night', cssSelector: 'dark-media' },
    ] } },
    'design-system-engine-map.mjs': EMPTY_ENGINE_MAP,
    'theme.css': ':root { --brand: #ffffff; }',
    'figma-vars.snapshot.json': { color: { day: { 'brand/color': '#ffffff' }, night: { 'brand/color': '#000000' } } },
  });
  // Old code read only snap.color.light/dark, so with day/night modes --brand looked invented → exit 1.
  assert.equal(code, 0, out);
});

test('[regression] the default light/dark axis still traces color vars back', () => {
  const { code, out } = runGate(GATE, {
    'ds-config.json': { paths },
    'design-system-engine-map.mjs': EMPTY_ENGINE_MAP,
    'theme.css': ':root { --brand: #ffffff; }',
    'figma-vars.snapshot.json': { color: { light: { 'brand/color': '#ffffff' }, dark: { 'brand/color': '#000000' } } },
  });
  assert.equal(code, 0, out);
});

test('[regression] a genuinely invented CSS var is still flagged', () => {
  const { code, out } = runGate(GATE, {
    'ds-config.json': { paths },
    'design-system-engine-map.mjs': EMPTY_ENGINE_MAP,
    'theme.css': ':root { --totally-invented: #ff0000; }',
    'figma-vars.snapshot.json': { color: { light: { 'brand/color': '#ffffff' }, dark: {} } },
  });
  assert.equal(code, 1, out);
  assert.match(out, /totally-invented/);
});

test('[bugfix reverse-exact] an invented SUB-VARIANT var is flagged even though a shorter token exists', () => {
  // --button-primary-bogus reverses to button/primary/bogus. The old prefix match accepted it
  // because button/primary is a real token; the exact-match fix must now flag it as invented.
  const { code, out } = runGate(GATE, {
    'ds-config.json': { paths },
    'design-system-engine-map.mjs': EMPTY_ENGINE_MAP,
    'theme.css': ':root { --button-primary-bogus: #ff0000; }',
    'figma-vars.snapshot.json': { color: { light: { 'button/primary/color': '#ffffff' }, dark: {} } },
  });
  assert.equal(code, 1, out);
  assert.match(out, /button-primary-bogus/);
});

test('[regression reverse-exact] a var that maps to a real token exactly still traces back', () => {
  // --button-primary reverses to button/primary, which is a real token → not invented.
  const { code, out } = runGate(GATE, {
    'ds-config.json': { paths },
    'design-system-engine-map.mjs': EMPTY_ENGINE_MAP,
    'theme.css': ':root { --button-primary: #ffffff; }',
    'figma-vars.snapshot.json': { color: { light: { 'button/primary/color': '#ffffff' }, dark: {} } },
  });
  assert.equal(code, 0, out);
});

test('a token the map points at a variable of another name is listed with Figma\'s name, and fails under figmaNames strict', () => {
  const files = (strict) => ({
    'ds-config.json': { paths, ...(strict ? { figmaNames: 'strict' } : {}) },
    'design-system-engine-map.mjs': "export const EXPLICIT = { 'semantic/content/primary': '--text' }; export const EXPLICIT_SIZING = {}; export const SKIP_TOKENS = new Set(); export const SIZING_SKIP = new Map(); export const SYSTEM_VARS = new Set();",
    'theme.css': ':root { --text: #0a0a0a; }',
    'figma-vars.snapshot.json': { color: { light: { 'semantic/content/primary/color': '#0a0a0a' }, dark: {} } },
  });
  const soft = runGate(GATE, files(false));
  assert.equal(soft.code, 0, soft.out);
  assert.match(soft.out, /NOT FIGMA'S NAME \(1\)/);
  assert.match(soft.out, /semantic\/content\/primary {2}→ {2}--text {3}\(Figma's name: --semantic-content-primary\)/);
  const hard = runGate(GATE, files(true));
  assert.equal(hard.code, 1, hard.out);
});

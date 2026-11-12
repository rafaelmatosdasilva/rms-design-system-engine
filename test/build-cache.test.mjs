import { test } from 'node:test';
import assert from 'node:assert/strict';
import { partCache, keyOf } from '../lib/build-cache.mjs';
import { tempDir } from './helpers.mjs';

// A part of the page's data is taken from the last build only when everything it reads is the same.
test('a kept part is given back for the same inputs, never for different ones', () => {
  const c = partCache(tempDir('build-cache-'));
  assert.equal(c.get('motion', { css: 'a' }), undefined, 'nothing kept yet');
  c.set('motion', { css: 'a', comps: [['chip', '.chip']] }, { motion: { durations: [1] } });
  assert.deepEqual(c.get('motion', { css: 'a', comps: [['chip', '.chip']] }), { motion: { durations: [1] } });
  assert.equal(c.get('motion', { css: 'b', comps: [['chip', '.chip']] }), undefined, 'a sheet changed');
  assert.equal(c.get('motion', { css: 'a', comps: [['chip', '.tag']] }), undefined, 'a component changed');
  assert.notEqual(keyOf({ a: 1 }), keyOf({ a: 2 }));
});

// The components' own build is kept while its sources are: a component's file moves it, what the engine writes never.
test('the sources key moves with a component file or the build setup, never with what the engine writes', async () => {
  const { writeFileSync, mkdirSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { sourcesKey } = await import('../lib/build-cache.mjs');
  const { OUT_DIR } = await import('../lib/names.mjs');
  const root = tempDir('sources-key-');
  mkdirSync(join(root, 'src', 'components'), { recursive: true });
  writeFileSync(join(root, 'src', 'components', 'Chip.vue'), '<template><span/></template>');
  writeFileSync(join(root, 'package.json'), '{}');
  const one = sourcesKey(root);
  mkdirSync(join(root, OUT_DIR), { recursive: true });
  writeFileSync(join(root, OUT_DIR, 'a11y.json'), '{}');
  writeFileSync(join(root, 'src', 'figma-vars.snapshot.json'), '{}');
  writeFileSync(join(root, 'notes.md'), 'x');
  assert.equal(sourcesKey(root), one, 'what the engine writes, a snapshot, a note');
  writeFileSync(join(root, 'src', 'components', 'Chip.vue'), '<template><span class="chip"/></template>');
  assert.notEqual(sourcesKey(root), one, 'a component changed');
  const two = sourcesKey(root);
  writeFileSync(join(root, 'vite.config.js'), 'export default {}');
  assert.notEqual(sourcesKey(root), two, 'the build setup changed');
});

test('the sources key moves with a Showroom screen kept outside the project, as with one inside it', async () => {
  const { sourcesKey } = await import('../lib/build-cache.mjs');
  const { writeFileSync, mkdirSync, utimesSync } = await import('node:fs');
  const { join } = await import('node:path');
  const root = tempDir('bc-outside-'), screens = tempDir('bc-screens-');
  writeFileSync(join(root, 'App.vue'), '<template><div/></template>');
  mkdirSync(join(screens, 'stand-ins'), { recursive: true });
  writeFileSync(join(screens, 'Home.vue'), '<template><p class="a">x</p></template>');
  writeFileSync(join(screens, 'stand-ins', 'text.css'), '.a { color: red; }');
  const cfg = { paths: { showroom: screens } };
  const before = sourcesKey(root, cfg);
  assert.equal(sourcesKey(root, cfg), before, 'the same while nothing changed');
  writeFileSync(join(screens, 'Home.vue'), '<template><p class="a b">x</p></template>');
  const later = new Date(Date.now() + 5000); utimesSync(join(screens, 'Home.vue'), later, later);
  assert.notEqual(sourcesKey(root, cfg), before, 'a screen changed outside the project is drawn again');
  const mid = sourcesKey(root, cfg);
  writeFileSync(join(screens, 'stand-ins', 'text.css'), '.a { color: blue; font-size: 2em; }');
  assert.notEqual(sourcesKey(root, cfg), mid, 'and so is one whose stand-in or stylesheet changed');
  assert.equal(sourcesKey(root, {}), sourcesKey(root, {}), 'a project with its screens inside it keys as before');
});

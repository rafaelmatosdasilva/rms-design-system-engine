// A style guide for one component (E27): --component X --styleguide builds a page of X and the components it nests
// only, each nested one followed in turn, beside the whole system's page (never in its place), and says so.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scopeView, nestedComponents } from '../styleguide-data.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const HARBOR = join(ENGINE, 'test', 'fixtures', 'harbor-ds');

test('the components asked for, in any case, and every one they nest, followed in turn', () => {
  const comps = [{ name: 'card', cls: 'card' }, { name: 'button', cls: 'btn' }, { name: 'icon', cls: 'icon' }, { name: 'badge', cls: 'badge' }, { name: 'toast', cls: 'toast', codeOnly: {} }];
  const nests = { card: ['button'], button: ['icon'], icon: [], badge: [], toast: ['icon'] };
  const r = scopeView(comps, ['Card', 'nope'], (c) => nests[c.name]);
  assert.deepEqual(r.components.map((c) => c.name), ['card', 'button', 'icon'], 'in the page\'s own order');
  assert.deepEqual(r.scope, { asked: ['card'], nested: ['button', 'icon'], missing: ['nope'] });
  assert.equal(r.codeOnly, 0);
  const t = scopeView(comps, ['toast'], (c) => nests[c.name]);
  assert.deepEqual([t.components.map((c) => c.name), t.codeOnly], [['icon', 'toast'], 1]);
  assert.deepEqual(scopeView(comps, ['btn'], (c) => nests[c.name]).scope.asked, ['button'], 'by its class too');
});

test('a nested component is found by the tag its own file gives it (HbBadge for Figma\'s badge)', () => {
  const names = [{ name: 'button', cls: 'hb-button' }, { name: 'badge', cls: 'hb-badge' }];
  const text = '<script setup>import HbBadge from \'./HbBadge.vue\'</script><template><button class="hb-button"><HbBadge /></button></template>';
  assert.deepEqual(nestedComponents({ name: 'button', cls: 'hb-button', text, names }), [], 'its Figma name alone does not find it');
  assert.deepEqual(nestedComponents({ name: 'button', cls: 'hb-button', text, names, tags: { badge: ['HbBadge'] } }), ['badge']);
});

test('--component X --styleguide builds X and what it nests, beside the whole system\'s page', { timeout: 300000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'sg-scope-'));
  cpSync(HARBOR, dir, { recursive: true });
  // The button nests the badge (its tag, as its own file names it).
  writeFileSync(join(dir, 'components', 'HbButton.vue'), `<script setup lang="ts">
import HbBadge from './HbBadge.vue';
withDefaults(defineProps<{ variant?: 'Primary' | 'Secondary'; size?: 'Small' | 'Large'; label?: string }>(), { variant: 'Primary', size: 'Small', label: 'Continue' });
</script>
<template><button :class="['hb-button', { 'hb-button--secondary': variant === 'Secondary' }]" type="button">{{ label }}<HbBadge /></button></template>
`);
  const r = spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--component', 'button', '--styleguide'], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  const out = r.stdout + r.stderr;
  assert.match(out, /🖼 {2}Style guide of button → \.design-system-engine-out\/styleguide\/button\.html {2}\(and the component it nests: badge · the engine's template\)/, out);
  assert.match(out, /The whole system's style guide: rms-design-system-engine --styleguide/);
  assert.match(out, /button: \.design-system-engine-out\/styleguide\/button\.html#c-button/);
  assert.ok(!existsSync(join(dir, '.design-system-engine-out', 'styleguide', 'index.html')), 'the whole system\'s page is not written in its place');
  const page = readFileSync(join(dir, '.design-system-engine-out', 'styleguide', 'button.html'), 'utf8');
  const data = JSON.parse(page.match(/<script type="application\/json" id="sg-data">([\s\S]*?)<\/script>/)?.[1] ?? 'null');
  assert.ok(data, 'the page holds its data');
  assert.deepEqual(data.components.map((c) => c.name).sort(), ['badge', 'button']);
  assert.deepEqual(data.scope, { asked: ['button'], nested: ['badge'], missing: [] });
  assert.ok(!('allComponents' in data), 'the whole system\'s list stays off the page');
});

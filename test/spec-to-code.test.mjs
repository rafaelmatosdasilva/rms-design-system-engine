// The component a spec describes, written in code the way the system's own components are (spec-to-code.mjs), handed
// back as a patch that adds the file, and read back with the code's own reader against the spec.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codeFromSpec, checkAgainstSpec, newFilePatch } from '../lib/spec-to-code.mjs';
import { predict } from '../lib/figma-ops.mjs';
import { anatomyOf } from '../lib/code-grammar.mjs';
import { textComponentApi } from '../lib/component-source.mjs';

const ops = [{ op: 'create', name: 'acmePill', axes: [{ name: 'size', options: ['s', 'm'] }], layout: { dir: 'HORIZONTAL' } }, { op: 'describe', text: 'A short status.' },
  { op: 'addLayer', parent: '', layer: { type: 'instance', name: 'Icon', of: 'acmeIcon' } }, { op: 'addLayer', parent: '', layer: { type: 'text', name: 'Label', style: 'label/s', text: 'Active' } },
  { op: 'addProperty', name: 'showIcon', kind: 'boolean', default: true, layer: 'Icon' }, { op: 'addProperty', name: 'label', kind: 'text', default: 'Active', layer: 'Label' },
  { op: 'bind', layer: '', field: 'fill', variable: 'surface/muted' }, { op: 'bind', layer: '', field: 'gap', variable: 'space/xs' }];
const model = predict(null, ops, { props: { acmeIcon: { properties: {} } }, varNames: {} });
const ctx = { framework: 'vue', folder: 'src/components/pills', cssVarOf: (v) => `--${v.replace(/\//g, '-')}`, textWayOf: (s) => (s === 'label/s' ? { how: 'include', name: 'Label-S' } : null), tagOf: () => 'acme-icon' };

test('a Vue component written as the system writes one: its props, its parts, its tokens, its text style', () => {
  const { file, text, notes } = codeFromSpec(model, ctx);
  assert.equal(file, 'src/components/pills/AcmePill.vue');
  assert.match(text, /<div :class="\['acme-pill', `acme-pill--\$\{size\}`\]">/);
  assert.match(text, /<acme-icon v-if="showIcon" class="acme-pill__icon" \/>/);
  assert.match(text, /<span class="acme-pill__label">\{\{ label \}\}<\/span>/);
  assert.match(text, /size: \{ type: String, default: "s", validator: \(v\) => \["s","m"\]\.includes\(v\) \}/);
  assert.match(text, /\/\*\* A short status\. \*\//);
  assert.match(text, /background-color: var\(--surface-muted\);\n  gap: var\(--space-xs\);/);
  assert.match(text, /<style lang="scss" scoped>[\s\S]*\.acme-pill__label \{\n  @include Label-S;\n\}/);
  assert.deepEqual(notes, []);
  // Read back with the code's own reader, it is what the spec says.
  const api = textComponentApi(file, text), anatomy = anatomyOf({ file, text, styles: [{ file, text: text.replace(/[\s\S]*<style[^>]*>/, (m) => m.replace(/[^\n]/g, ' ')).replace(/<\/style>[\s\S]*/, '') }], root: 'acme-pill', props: Object.keys(api.props) });
  assert.deepEqual(checkAgainstSpec(model, {}, anatomy, Object.keys(api.props)), []);
  assert.ok(anatomy.parts.find((p) => p.class === 'acme-pill__icon').optional, 'the icon is shown on its property');
});

test('what the system cannot give is a note, never invented; the file comes as a patch that adds it', () => {
  const { text, notes } = codeFromSpec(model, { ...ctx, cssVarOf: () => null, textWayOf: () => null });
  assert.ok(notes.some((n) => /surface\/muted has no custom property/.test(n)));
  assert.ok(notes.some((n) => /text style label\/s/.test(n)));
  assert.match(text, /background-color: \/\* surface\/muted \*\/;/);
  const p = newFilePatch('src/A.vue', 'one\ntwo\n');
  assert.equal(p, 'diff --git a/src/A.vue b/src/A.vue\nnew file mode 100644\n--- /dev/null\n+++ b/src/A.vue\n@@ -0,0 +1,2 @@\n+one\n+two\n');
  const jsx = codeFromSpec(model, { ...ctx, framework: 'jsx' });
  assert.match(jsx.text, /export function AcmePill\(\{ size = "s", showIcon = true, label = "Active" \}\)/);
  assert.match(jsx.text, /\{showIcon && <AcmeIcon className="acme-pill__icon" \/>\}/);
});

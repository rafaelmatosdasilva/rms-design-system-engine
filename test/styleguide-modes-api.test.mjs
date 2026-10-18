// The style guide for a system that sets its modes with attributes on its root ([data-theme="dark"] and
// [data-size="phone"] on <html>), and whose components' API says more than Figma does: each preview and section in a
// mode of its own, the page on Auto, and a Playground control for each prop only the code takes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { attrModeCSS, colourAttrMode, modeAxes, modeScopes, codeControls, apiView } from '../styleguide-data.mjs';
import { textComponentApi, extractTypes, extractDocumented } from '../component-source.mjs';
import { codeCases, figmaPropFor } from '../component-harness.mjs';

const cfg = { figma: { modes: [{ name: 'Light', cssSelector: 'root' }, { name: 'Dark', cssSelector: 'data:theme=dark' }] } };
const THEME = ':root { --bg: #fff; --gap: 16px; }\n:root[data-theme="dark"] { --bg: #000; }\n:root[data-size="phone"] { --gap: 8px; }\n:root[data-theme="dark"][data-size="phone"] { --bg: #111; }';

test('a colour mode set by an attribute on the root nests: each preview in its own, its root mode named', () => {
  assert.deepEqual(colourAttrMode(cfg), { attr: 'data-theme', base: 'light' });
  assert.deepEqual(modeScopes(cfg), ['data-color', 'data-size', 'data-theme']);
  const css = attrModeCSS(THEME, colourAttrMode(cfg));
  assert.match(css, /\[data-theme="light"\] \{\n {4}--bg: #fff;\n {2}\}/, 'the root\'s value of what dark changes, to go back to light inside a dark page');
  assert.match(css, /\n {2}\[data-theme="dark"\] \{\n {4}--bg: #000;/);
  assert.match(css, /\n {2}\[data-size="phone"\] \{\n {4}--gap: 8px;/, 'a size block nests too, so one section can show Phone');
  assert.match(css, /\[data-theme="dark"\]\[data-size="phone"\], \[data-theme="dark"\] \[data-size="phone"\], \[data-size="phone"\] \[data-theme="dark"\] \{/);
  assert.equal(attrModeCSS(':root { --a: 1px; }', null), '');
  const colour = modeAxes(cfg, {}, THEME)[0];
  assert.equal(colour.scoped, true);
  assert.deepEqual(colour.values.map((v) => v.value), ['light', 'dark']);
  assert.equal(modeAxes(cfg, {}, ':root { --bg: #fff; }')[0].scoped, undefined, 'no block on the root: a switch for the page only');
});

test('the page\'s colour switch has Light and Dark only, starts in the device\'s mode and follows it, even with no media query of the code\'s', () => {
  const tpl = readFileSync(new URL('../templates/styleguide.template.html', import.meta.url), 'utf8');
  assert.doesNotMatch(tpl, /label: 'Auto', title: 'Follows this device/);
  assert.match(tpl, /var c = effective\(axis, scope\), on = c;/);
  assert.match(tpl, /AXES\.forEach\(function \(a\) \{ if \(darkOf\(a\) && !html\.hasAttribute\(a\.attr\) && !fixed\[a\.attr\]\) AUTO\[a\.attr\] = true; \}\);/);
  assert.match(tpl, /SGModes\.prefers\.addEventListener\('change'/);
});

test('a Vue prop\'s type, the values its comment lists, and never a binding in its template read as a default', () => {
  const vue = `<template><button :icon="icon" :disabled="disabled" :class="buttonSize"></button></template>
<script setup>
/** @buttonSize {String} the size, can be [s, m(default), l]
@alignment {String} can be [left, center, right] */
defineProps({ label: String, icon: String, buttonSize: { type: String, default: 'm' }, disabled: Boolean, value: [String, Number], alignment: String, params: Object })
</script>`;
  const api = textComponentApi('Button.vue', vue);
  assert.deepEqual(api.props.icon, { type: 'string' }, ':icon="icon" is a binding, not a default');
  assert.deepEqual(api.props.disabled, { type: 'boolean' });
  assert.deepEqual(api.props.buttonSize, { default: 'm', options: ['s', 'm', 'l'], type: 'string' });
  assert.deepEqual(api.props.alignment, { options: ['left', 'center', 'right'], type: 'string' });
  assert.equal(api.props.value.type, 'string | number');
  assert.equal(api.props.params.type, 'object');
  assert.deepEqual([...extractTypes('x: Stringy, y: Boolean')], [['y', 'boolean']]);
  assert.deepEqual(extractDocumented('@size {String} can be [s, m(default), l]').get('size'), { type: 'string', options: ['s', 'm', 'l'], default: 'm' });
});

test('each prop only the code\'s API takes is a Playground control and a case drawn, named as Figma names it when Figma has it', () => {
  assert.equal(figmaPropFor(['labelContent', 'size'], 'label'), 'labelContent');
  assert.equal(figmaPropFor(['labelContent', 'size'], 'buttonSize'), 'size');
  assert.equal(figmaPropFor(['size'], 'buttonSize', ['buttonSize', 'size']), null, 'the code has a size of its own');
  const api = apiView({ file: 'Button.vue', props: { buttonSize: { options: ['s', 'm', 'l'], default: 'm', type: 'string' }, selected: { type: 'boolean' }, disabled: { type: 'boolean' }, allowEventPropagation: { type: 'boolean' }, label: { type: 'string' } } });
  const figmaControls = [{ label: 'disabled', prop: 'disabled', type: 'BOOLEAN' }];
  const ctl = codeControls(figmaControls, api, { 'size#1:2': { defaultValue: 's' }, disabled: { defaultValue: 'true' } });
  assert.deepEqual(ctl.map((k) => [k.label, k.prop, k.type, k.default]), [['size', 'buttonSize', 'VARIANT', 's'], ['selected', 'selected', 'BOOLEAN', false], ['label', 'label', 'TEXT', 'Label']], 'size starts on Figma\'s default; disabled is Figma\'s; a behaviour is no control; a text only the code has is a field');
  assert.equal(codeControls(figmaControls, api, ['size'])[0].default, 'm', 'with no Figma default, the code\'s');
  const text = codeControls(figmaControls, api, { 'labelContent#1:3': { type: 'TEXT', defaultValue: 'Label' } }).find((k) => k.prop === 'label');
  assert.deepEqual([text.label, text.type, text.default], ['labelContent', 'TEXT', 'Label'], 'Figma\'s text prop: a field');
  const base = { disabled: 'false', size: 's' };
  const cases = codeCases(base, { props: { selected: { type: 'boolean' }, buttonSize: { options: ['s', 'm'], type: 'string' }, allowEventPropagation: { type: 'boolean' }, focusInput: { type: 'boolean' } } });
  assert.deepEqual(cases, [{ label: 'selected=true', props: { disabled: 'false', size: 's', selected: true } }], 'buttonSize is Figma\'s size; behaviour props are not drawn');
});

test('each prop is independent: props set together show together, and an option its build drew is never greyed out', () => {
  const tpl = readFileSync(new URL('../templates/styleguide.template.html', import.meta.url), 'utf8');
  assert.match(tpl, /function rootChange\(a, b\)/);
  assert.match(tpl, /off: !p\.on && !p\.off && !p\.part && !renderedWith\(c, p, true\)/);
});

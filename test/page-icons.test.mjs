// An icon the code does not have draws nothing. The rule is the owner's — a prototype uses the code's icons, never
// Figma's — and until this the page check read every prop a page passed except the one whose wrong value leaves a
// blank where a control should be, and still called the page made of the system.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bareIcon, nearestIcon, unknownIcons, checkPage } from '../lib/page-check.mjs';

const ICONS = ['icon-chevron-down', 'icon-search', 'icon-close', 'icon-user'];
const node = (tag, props) => ({ tag, line: 1, attrs: Object.entries(props).map(([name, value], i) => ({ kind: 'prop', name, value, line: 10 + i })) });

test('an icon is the same icon however the project writes its name', () => {
  for (const w of ['chevron-down', 'icon-chevron-down', 'chevronDown', 'Chevron_Down', '  chevron-down  ']) {
    assert.equal(bareIcon(w), 'chevrondown', w);
  }
  assert.equal(bareIcon(''), '');
  assert.equal(bareIcon(null), '');
});

test('an icon the code has is never reported, whichever way it is spelt', () => {
  assert.deepEqual(unknownIcons([node('Button', { icon: 'search' })], ICONS), []);
  assert.deepEqual(unknownIcons([node('Button', { icon: 'icon-search' })], ICONS), []);
  assert.deepEqual(unknownIcons([node('Field', { leadingIcon: 'chevron-down', trailingIcon: 'close' })], ICONS), []);
});

test('an icon the code lacks is named, with the nearest the code has', () => {
  const [one] = unknownIcons([node('Button', { icon: 'sparkles' })], ICONS);
  assert.equal(one.value, 'sparkles');
  assert.equal(one.near, null, 'nothing close enough is better said as nothing');
  // A near miss is what an agent writes from Figma's name, and the nearest is the useful half of the finding.
  assert.equal(nearestIcon('chevron-dwn', ICONS), 'icon-chevron-down', 'one letter missing');
  assert.equal(nearestIcon('chevorn-down', ICONS)?.length ? true : false, true, 'two letters swapped resolves to something');
  assert.equal(nearestIcon('searc', ICONS), 'icon-search', 'a shorter name that starts the same');
  assert.equal(nearestIcon('user-circle', ICONS), 'icon-user', 'a longer name that starts the same');
});

test('what is decided at runtime, and what is not an icon, are left alone', () => {
  // A bound value is whatever the data holds when the page runs: this check cannot know it, and guessing would be worse.
  assert.deepEqual(unknownIcons([{ tag: 'Button', line: 1, attrs: [{ kind: 'prop', name: 'icon', value: 'whatever', bound: true, line: 3 }] }], ICONS), []);
  // A prop that merely contains the word is not an icon prop.
  assert.deepEqual(unknownIcons([node('Button', { iconography: 'sparkles', label: 'sparkles' })], ICONS), []);
  // An empty value says nothing.
  assert.deepEqual(unknownIcons([node('Button', { icon: '   ' })], ICONS), []);
});

test('a project whose icons could not be read says nothing, rather than calling every icon missing', () => {
  // The worst outcome of this check would be a page refused on no evidence. No icons read is no finding, ever.
  assert.deepEqual(unknownIcons([node('Button', { icon: 'sparkles' }), node('Field', { leadingIcon: 'anything' })], []), []);
});

test('the page check reports it as an error, naming the icon and its nearest', () => {
  const page = '<template>\n  <Button icon="sparkles" />\n  <Button icon="searc" />\n  <Button icon="search" />\n</template>\n';
  const system = { ROOT: '/nowhere', components: { Button: { tag: 'Button', props: {}, slots: { default: false, named: [] }, events: [] } }, byFile: new Map(), roots: new Set(), aliases: {}, globals: new Map(), uses: {}, firstUse: {}, importSeen: {}, style: {}, files: [], templates: [], icons: ICONS };
  const { findings } = checkPage('p.vue', page, system);
  const icons = findings.filter((f) => f.kind === 'icon');
  assert.equal(icons.length, 2, `the two the code lacks, not the one it has: ${icons.map((f) => f.message).join(' | ')}`);
  assert.ok(icons.every((f) => f.level === 'error'), 'a blank where a control should be is not a warning');
  assert.match(icons[0].message, /icon="sparkles": the code has no such icon, so it draws nothing$/);
  assert.match(icons[1].message, /icon="searc".*its nearest is "icon-search"/);
});

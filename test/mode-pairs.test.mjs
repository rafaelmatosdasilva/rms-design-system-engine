// Two colour modes on at once, for the text contrast: the pairs that switch different things (a media feature each, a
// data attribute each, a mode of another colour collection), never two classes or two values of one switch; one switch
// made of both, undone in reverse.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combinedModes, mergeSwitches, modeSwitchFor } from '../mode-resolver.mjs';
import { styleguideSwitch } from '../code-capture.mjs';

test('mode pairs: dark with high contrast, a colour mode with another colour collection, never one axis twice', () => {
  const modes = [
    { name: 'Light', snapshotKey: 'light', cssSelector: 'root' },
    { name: 'Dark', snapshotKey: 'dark', cssSelector: 'dark-media' },
    { name: 'High contrast', snapshotKey: 'hc', cssSelector: 'high-contrast-media' },
    { name: 'Dim', snapshotKey: 'dim', cssSelector: 'class:dim' },
    { name: 'Night', snapshotKey: 'night', cssSelector: 'class:night' },
  ];
  const names = combinedModes(modes).map((p) => p.name);
  assert.ok(names.includes('Dark + High contrast'));
  assert.ok(names.includes('Dark + Dim'));
  assert.ok(!names.includes('Dim + Night'), 'two classes may be one axis');
  assert.ok(!names.some((n) => n.startsWith('Light +')), 'the base mode switches nothing');
  const cols = [{ name: 'Accent', kind: 'color', modes: [{ name: 'Ocean', snapshotKey: 'ocean', cssSelector: 'data:accent=ocean' }, { name: 'Forest', snapshotKey: 'forest', cssSelector: 'data:accent=forest' }] }];
  const withCols = combinedModes(modes.slice(0, 2), cols).map((p) => p.name);
  assert.deepEqual(withCols, ['Dark + Ocean', 'Dark + Forest']);
  assert.deepEqual(combinedModes([cols[0].modes[0], cols[0].modes[1]]), [], 'two values of one attribute');

  const sw = mergeSwitches([modeSwitchFor(modes[1]), modeSwitchFor(modes[2])]);
  assert.deepEqual(sw.media, [{ name: 'prefers-color-scheme', value: 'dark' }, { name: 'prefers-contrast', value: 'more' }]);
  const both = mergeSwitches([modeSwitchFor(modes[1]), modeSwitchFor(cols[0].modes[0])]);
  assert.match(both.apply, /data-accent/);
  assert.match(styleguideSwitch(both).apply, /'data-color', "dark"/);
});

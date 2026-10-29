// A token belongs in the first layer where its value can change (layer-placement.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layerPlacement, layerPlacementLines } from '../layer-placement.mjs';

const snap = {
  _collections: { color: 'Theme', colorModes: ['Light', 'Dark'] },
  color: {
    light: { 'kit/tile/background/color': '#ffffff', 'kit/tile/text/color': '#111111', 'kit/tile/border/color': '#dddddd', 'surface/page/color': '#ffffff' },
    dark: { 'kit/tile/background/color': '#000000', 'kit/tile/text/color': '#eeeeee', 'kit/tile/border/color': '#dddddd', 'surface/page/color': '#000000' },
  },
  aliases: {
    light: { 'kit/tile/background/color': ['surface/page/color'], 'kit/tile/text/color': ['ink/strong'], 'surface/page/color': ['white'] },
    dark: { 'kit/tile/background/color': ['surface/page/color'], 'kit/tile/text/color': ['ink/soft'], 'surface/page/color': ['black'] },
  },
};

test('a moded collection\'s tokens defined the same in every mode are named: the same alias, or the same value', () => {
  const [r] = layerPlacement(snap);
  assert.equal(r.collection, 'Theme');
  assert.equal(r.total, 4);
  assert.equal(r.count, 2, 'the tile background (one alias in both) and its border (one value in both); not its text, nor the page surface');
  assert.deepEqual(r.still, [{ family: 'kit/tile', count: 2, examples: ['kit/tile/background/color', 'kit/tile/border/color'] }]);
  assert.match(layerPlacementLines([r])[0], /^Theme changes with its modes \(Light, Dark\), and 2 of its 4 colour tokens never do/);
});

test('one mode, or every token using its modes: nothing said', () => {
  assert.deepEqual(layerPlacement({ color: { light: { a: '#fff' } } }), []);
  assert.deepEqual(layerPlacement({ color: { light: { a: '#fff' }, dark: { a: '#000' } } }), []);
});

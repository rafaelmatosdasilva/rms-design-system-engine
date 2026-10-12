// The designed screens themselves checked for accessibility (W1): contrast inside every instance with see-through
// layers composited, words on an image or a gradient, a control under 24 by 24; documentation left out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { screenA11yCaptureScript, screenA11ySnapshot, mergeA11yScreens, surfaceOf, screenA11yFindings, screenA11yLines } from '../screen-a11y.mjs';

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const rgb = (h) => ({ r: parseInt(h.slice(1, 3), 16) / 255, g: parseInt(h.slice(3, 5), 16) / 255, b: parseInt(h.slice(5, 7), 16) / 255 });
const solid = (h, extra = {}) => ({ type: 'SOLID', visible: true, color: rgb(h), ...extra });
// A mock Figma node: its box, its paints, its children (each told its parent), findOne over its descendants.
function node(type, name, [x, y, w, h], extra = {}, children = []) {
  const n = { type, name, visible: true, opacity: 1, absoluteBoundingBox: { x, y, width: w, height: h }, width: w, height: h, fills: [], strokes: [], boundVariables: {}, ...extra };
  if (type !== 'TEXT') n.children = children;
  for (const k of children) k.parent = n;
  n.findOne = (fn) => { for (const k of n.children ?? []) { if (fn(k)) return k; const d = k.findOne?.(fn); if (d) return d; } return null; };
  return n;
}
const text = (name, box, colour, size = 14, weight = 400, extra = {}) => node('TEXT', name, box, { characters: name, fontSize: size, fontWeight: weight, fills: [solid(colour)], ...extra });

function file() {
  const iconShape = node('VECTOR', 'Vector', [304, 108, 16, 16], { fills: [solid('#c8c8c8')] });
  const icon = node('INSTANCE', 'icon', [302, 106, 20, 20], { getMainComponentAsync: async () => ({ name: 'icon', parent: null }) }, [iconShape]);
  const iconButton = node('INSTANCE', 'iconButton', [300, 104, 20, 20], { getMainComponentAsync: async () => ({ name: 'Size=S', parent: { type: 'COMPONENT_SET', name: 'iconButton' } }) }, [icon]);
  const bound = text('Bound', [16, 300, 80, 16], '#eeeeee', 14, 400, { fills: [solid('#eeeeee', { boundVariables: { color: { id: 'v1' } } })] });
  const screen = node('FRAME', 'Settings', [1000, 2000, 360, 640], { fills: [solid('#ffffff')] }, [
    node('FRAME', 'Card', [1016, 2016, 328, 80], { fills: [solid('#f5f5f5')] }, [
      text('Low contrast', [1032, 2032, 120, 16], '#b0b0b0'),
      text('Fine', [1032, 2056, 120, 16], '#1a1a1a'),
    ]),
    node('FRAME', 'Banner', [1000, 2100, 360, 40], { fills: [solid('#000000', { opacity: 0.5 })] }, [text('On the banner', [1016, 2112, 120, 16], '#ffffff')]),
    node('FRAME', 'Hero', [1000, 2150, 360, 120], { fills: [{ type: 'IMAGE', visible: true }] }, [text('Over the photo', [1016, 2200, 200, 32], '#ffffff', 28, 700)]),
    node('FRAME', 'Spec', [1000, 2400, 360, 40], {}, [text('12px', [1010, 2410, 40, 12], '#dddddd')]),
    { ...node('FRAME', 'Actions', [1000, 2000, 360, 40]), children: [] },
    text('Off the screen', [1600, 2000, 120, 16], '#eeeeee'),
    node('INSTANCE', 'checkBox', [1000, 2500, 120, 16], { componentProperties: { State: { type: 'VARIANT', value: 'Disabled' } }, getMainComponentAsync: async () => ({ name: 'State=Disabled', parent: { type: 'COMPONENT_SET', name: 'checkBox' } }) }, [text('Save as default', [1024, 2500, 96, 16], '#c8c8c8', 11, 600, { opacity: 0.24 })]),
    // A button drawn at 16% opacity reads as disabled; a row whose State is Inactive (not chosen) is measured.
    node('INSTANCE', 'buttonPrimary', [1200, 2520, 80, 32], { opacity: 0.16, componentProperties: {}, getMainComponentAsync: async () => ({ name: 'buttonPrimary', parent: null }) }, [text('Rescan', [1210, 2528, 60, 16], '#1c1c1c')]),
    node('INSTANCE', 'listItem', [1000, 2560, 360, 32], { componentProperties: { State: { type: 'VARIANT', value: 'Inactive' } }, getMainComponentAsync: async () => ({ name: 'State=Inactive', parent: { type: 'COMPONENT_SET', name: 'listItem' } }) }, [text('Not chosen', [1016, 2568, 100, 16], '#111111')]),
  ]);
  // Absolute boxes: the icon button and the bound text inside the screen.
  for (const n of [iconButton, icon, iconShape, bound]) n.absoluteBoundingBox = { ...n.absoluteBoundingBox, x: n.absoluteBoundingBox.x + 1000, y: n.absoluteBoundingBox.y + 2000 };
  screen.children.push(iconButton, bound); iconButton.parent = screen; bound.parent = screen;
  return { '1:1': screen };
}
const figmaOf = (nodes, vars = {}) => ({
  mixed: Symbol('mixed'),
  getNodeByIdAsync: async (id) => nodes[id] ?? null,
  variables: { getVariableByIdAsync: async (id) => (vars[id] ? { resolveForConsumer: () => ({ value: { ...rgb(vars[id]), a: 1 }, resolvedType: 'COLOR' }) } : null) },
});

test('the capture reads every text and lone icon with what is drawn behind it, inside instances, documentation and what lies outside left out', async () => {
  const figma = figmaOf(file(), { v1: '#202020' });
  const r = await new AsyncFunction('figma', screenA11yCaptureScript(['1-1']))(figma);
  const s = r.screens[0];
  assert.deepEqual([s.id, s.name, s.w, s.h, s.docs, s.off], ['1:1', 'Settings', 360, 640, 1, 2], 'a spec left out; a disabled checkbox\'s and a faded button\'s words counted apart, not measured');
  const by = Object.fromEntries(s.inks.map((x) => [x.ex, x]));
  assert.deepEqual(Object.keys(by).sort(), ['Bound', 'Fine', 'Low contrast', 'Not chosen', 'On the banner', 'Over the photo', 'icon'], 'the spec\'s words and the text off the screen are left out; a row not chosen is measured');
  assert.deepEqual(by['Low contrast'].on, [[245, 245, 245, 1]], 'the card behind it, from the last opaque fill up');
  assert.deepEqual(by['On the banner'].on, [[255, 255, 255, 1], [0, 0, 0, 0.5]], 'a see-through banner over the screen');
  assert.deepEqual(by['Over the photo'].on, [[255, 255, 255, 1], 'I'], 'a picture over the screen: no one colour behind the words');
  assert.deepEqual(by.Bound.fg, [32, 32, 32, 1], 'a bound colour as its variable resolves on this node, not the paint\'s stored one');
  assert.deepEqual([by.icon.k, by.icon.fg], ['i', [200, 200, 200, 1]], 'an icon with no words beside it is measured, from its shape');
  assert.deepEqual(s.small.map((x) => [x.c, x.w, x.h]), [['iconButton', 20, 20], ['icon', 20, 20]]);
  assert.ok(JSON.stringify(r).length < 20480);
});

test('findings: contrast as the eye sees it, words on a picture, a control under 24 by 24; an ornament is no control', async () => {
  const figma = figmaOf(file(), { v1: '#202020' });
  const snap = screenA11ySnapshot({ result: await new AsyncFunction('figma', screenA11yCaptureScript(['1:1']))(figma) });
  assert.deepEqual(surfaceOf([[255, 255, 255, 1], [0, 0, 0, 0.5]]), { r: 127.5, g: 127.5, b: 127.5 });
  assert.equal(surfaceOf(['I']), null);
  const f = screenA11yFindings(snap, { roles: { iconButton: 'button', icon: 'img' } });
  const of = (what) => f.find((x) => x.what.includes(what));
  assert.deepEqual([of('Low contrast').kind, of('Low contrast').need, of('Low contrast').bg, of('Low contrast').criterion], ['contrast', 4.5, '#f5f5f5', '1.4.3']);
  assert.ok(of('Low contrast').ratio < 4.5);
  assert.deepEqual([of('On the banner').kind, of('On the banner').bg], ['contrast', '#808080'], 'white on a half-black banner over white reads as on grey');
  assert.deepEqual([of('Over the photo').kind, of('Over the photo').criterion], ['plate', '1.4.3']);
  assert.deepEqual([of('the icon').kind, of('the icon').need, of('the icon').criterion], ['contrast', 3, '1.4.11']);
  assert.equal(of('Fine'), undefined);
  assert.equal(of('Bound'), undefined, 'its variable resolves dark: it passes');
  assert.deepEqual(f.filter((x) => x.kind === 'target').map((x) => [x.what, x.size]), [['iconButton', '20×20']], 'a 20px icon is no control; the button holding it is');
  // Without roles, a name that says control counts.
  assert.deepEqual(screenA11yFindings(snap).filter((x) => x.kind === 'target').map((x) => x.what), ['iconButton']);
  const lines = screenA11yLines(f);
  assert.match(lines[0], /^♿ Figma screens, accessibility \(advisory, for whoever keeps the Figma file\): 5 to fix$/);
  assert.ok(lines.some((l) => /Settings: "Over the photo" sits on an image or a gradient/.test(l)));
  assert.deepEqual(screenA11yLines([], { screens: 3 }), ['✓ Figma screens: the 3 screens read pass contrast and target size.']);
  // A screen frame with no fill: nothing behind its words, so no contrast is guessed; it says so once.
  const bare = screenA11yFindings({ screens: [{ name: 'Start', inks: [{ k: 't', fg: [245, 245, 245, 1], on: [], s: 11, w: 600, ex: 'Select a frame', n: 2 }] }] });
  assert.deepEqual(bare.map((x) => [x.kind, x.count]), [['bare', 2]]);
  assert.match(screenA11yLines(bare)[1], /^ {3}Start: 2 texts and icons have nothing drawn behind them \(the screen has no fill\)/);
  // One control at two sizes is one line; two screens with one name are told apart by their ids.
  const two = screenA11yFindings({ screens: [{ id: '1:1', name: 'Export', small: [{ c: 'radioButton', w: 120, h: 16, n: 1 }, { c: 'radioButton', w: 239, h: 16, n: 1 }] }, { id: '2:2', name: 'Export', small: [] }] }, { roles: { radioButton: 'radio' } });
  assert.deepEqual(two.map((x) => [x.screen, x.what, x.size, x.n]), [['Export (1:1)', 'radioButton', '120×16, 239×16', 2]]);
  assert.match(screenA11yLines(two)[1], /^ {3}Export \(1:1\): radioButton \(2 times\) is drawn 120×16, 239×16, under 24×24 \(WCAG 2\.5\.8\)/);
});

test('each answer stays under use_figma\'s 20 KB: the rest of the screens wait for the next run, the answers merge in ds-config\'s order', async () => {
  const many = (id) => node('FRAME', `Screen ${id}`, [0, 0, 400, 4000], { fills: [solid('#ffffff')] }, Array.from({ length: 300 }, (_, i) => text(`Line number ${i} of a long list`, [0, i * 12, 300, 12], `#${(i % 200 + 30).toString(16).padStart(2, '0')}3040`)));
  const figma = figmaOf({ '1:1': many('1:1'), '2:2': many('2:2') });
  const r = await new AsyncFunction('figma', screenA11yCaptureScript(['1:1', '2:2']))(figma);
  assert.ok(JSON.stringify(r).length < 20480, `${JSON.stringify(r).length} characters`);
  assert.deepEqual([r.screens.map((s) => s.id), r.left], [['1:1'], ['2:2']]);
  assert.deepEqual(mergeA11yScreens([{ id: '2:2', v: 1 }], [{ id: '1:1' }, { id: '2:2', v: 2 }], ['1-1', '2-2']), [{ id: '1:1' }, { id: '2:2', v: 2 }]);
  assert.throws(() => screenA11ySnapshot({ nothing: true }), /not a screen accessibility capture/);
});

// A9: what a component draws past its colours, Figma's against the code's: shadows, blurs, a gradient or image fill,
// clipping, blending and opacity. One Figma has and the code does not follow is Claude's; one only the code has, or
// Figma's clipping, is a decision.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shadowsOf, codeEffects, effectsFindings, effectsSnapshot, EFFECTS_CAPTURE_JS, effectsCaptureScript } from '../effects-parity.mjs';

const CSS = [{ file: 'theme.css', text: `:root { --shadow-color: rgba(0, 0, 0, 0.25); --blur: 4px; }
/* a comment with { braces } never splits a rule */
.card { box-shadow: 0 2px 8px 0 var(--shadow-color), inset 0 0 0 1px #e5e5e5; overflow: hidden; }
.card:hover { box-shadow: none; }
.banner { background-image: linear-gradient(90deg, #ff0000, #0000ff); }
.scrim { backdrop-filter: blur(var(--blur)); opacity: 0.8; }
.chip { mix-blend-mode: multiply; }
.badge { color: red; }
.badge-background { opacity: 0.08; }` }];

test('a box-shadow in Figma\'s words; the component\'s own rule only, var() read through the theme', () => {
  assert.deepEqual(shadowsOf('0 2px 8px 0 rgba(0, 0, 0, 0.25), inset 0 0 0 1px #e5e5e5').map(({ css, ...s }) => s), [
    { type: 'DROP_SHADOW', x: 0, y: 2, radius: 8, spread: 0, color: [0, 0, 0, 0.25] },
    { type: 'INNER_SHADOW', x: 0, y: 0, radius: 0, spread: 1, color: [229, 229, 229, 1] },
  ]);
  assert.deepEqual(shadowsOf('none'), []);
  const card = codeEffects(CSS, 'card');
  assert.equal(card.shadows.length, 2, 'not the :hover rule');
  assert.deepEqual([card.clips, card.at], [true, 'theme.css:3']);
  assert.deepEqual([codeEffects(CSS, 'scrim').backgroundBlur, codeEffects(CSS, 'scrim').opacity], [8, 0.8], 'blur(4px) is Figma\'s 8');
  assert.equal(codeEffects(CSS, 'banner').image, 'GRADIENT_LINEAR');
  assert.equal(codeEffects(CSS, 'nothing'), null);
});

test('each component\'s effects against Figma\'s, its layers against the code\'s parts of the same name, and who acts', () => {
  const snap = { components: {
    card: { effects: [{ type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.25 }, x: 0, y: 4, radius: 8, spread: 0, colorVar: 'shadow/color' }, { type: 'INNER_SHADOW', color: { r: 229, g: 229, b: 229, a: 1 }, x: 0, y: 0, radius: 0, spread: 1 }], clips: true },
    banner: { fills: [{ type: 'GRADIENT_LINEAR', stops: [{ at: 0, color: { r: 255, g: 0, b: 0, a: 1 } }, { at: 1, color: { r: 0, g: 128, b: 0, a: 1 } }] }] },
    scrim: { effects: [{ type: 'BACKGROUND_BLUR', radius: 8 }], opacity: 0.8 },
    chip: { clips: true },
    badge: { parts: { Background: { opacity: 0.08 }, Icon: { clips: true } } },
    overlay: { parts: { Overlay: { effects: [{ type: 'BACKGROUND_BLUR', radius: 4 }] } } },
  } };
  const found = effectsFindings(snap, CSS, (n) => n);
  assert.deepEqual(found.map((f) => [f.component, f.part, f.what, f.side]), [
    ['card', null, 'shadow offset', 'code'],
    ['banner', null, 'gradient colours', 'code'],
    ['chip', null, 'clip content', 'decide'],
    ['chip', null, 'blend mode', 'decide'],
  ]);
  assert.match(found[0].message, /^card shadow offset: Figma draws a shadow 0 4, blur 8, spread 0, rgba\(0, 0, 0, 0\.25\) \(shadow\/color\), the code draws a shadow 0 2, blur 8, spread 0, rgba\(0, 0, 0, 0\.25\) \(theme\.css:3\)$/);
  assert.match(found[1].message, /goes #ff0000 to #008000, the code goes #ff0000 to #0000ff/);
  assert.ok(!found.some((f) => f.component === 'scrim'), 'blur(4px) is Figma\'s 8: the same');
  assert.ok(!found.some((f) => f.component === 'badge'), 'its Background layer is .badge-background at 8%; its icon only clips');
  assert.ok(!found.some((f) => f.component === 'overlay'), 'no rule of its own in the CSS: nothing compared');
});

test('the capture changes nothing and keeps its answer small; the snapshot keeps the components', () => {
  assert.match(effectsCaptureScript('1-439'), /^const PAGE_IDS = \["1:439"\];/m);
  assert.match(EFFECTS_CAPTURE_JS, /n\.effects/);
  assert.match(EFFECTS_CAPTURE_JS, /clipsContent/);
  assert.doesNotMatch(EFFECTS_CAPTURE_JS, /\.(remove|resize|setProperties|appendChild)\(|\b(n|c|set)\.(effects|fills|blendMode|opacity|clipsContent)\s*=[^=]/, 'read only: no node is changed');
  assert.deepEqual(Object.keys(effectsSnapshot(JSON.stringify({ result: { components: { card: {} } } })).components), ['card']);
  assert.throws(() => effectsSnapshot('{"x":1}'), /not an effects capture/);
});

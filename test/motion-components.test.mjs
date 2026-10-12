// C7: how each component moves on its own, Figma's against the code's. A spinner turning (a loop), a panel, a modal or a
// toast opening and closing: the code's @keyframes and transitions, Figma's Motion keyframes, animation styles and the
// overlays its prototype opens. One Figma animates and the code does not is Claude's; one the code animates and Figma
// does not is for whoever keeps Figma; both with another duration or curve, Claude's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { animationsOf, keyframesWhat, keyframesIn, codeMotions, figmaMotions, componentMotionFindings, componentMotionRows } from '../motion-components.mjs';
import { MOTION_CAPTURE_JS, motionCaptureScript, motionSnapshot } from '../motion-parity.mjs';

const CSS = [{ file: 'theme.css', text: `:root { --modal-duration: 280ms; --modal-easing: cubic-bezier(0.22, 1, 0.36, 1); --modal-offset: 8px; }
/* The spinner; a comment with { braces } and ; never splits a rule */
.loader-spinner { width: 14px; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes modal-in { from { opacity: 0; transform: translateY(var(--modal-offset)); } to { opacity: 1; transform: translateY(0); } }
@keyframes modal-out { from { opacity: 1; } to { opacity: 0; transform: translateY(var(--modal-offset)); } }
@keyframes bg-in { from { opacity: 0; } to { opacity: 1; } }
.modal-overlay { animation: bg-in var(--modal-duration) var(--modal-easing) both; }
.modal-card { animation: modal-in var(--modal-duration) var(--modal-easing) both; }
.modal.is-closing .modal-card { animation: modal-out 160ms ease-in both; }
.drawer { transform: translateX(100%); transition: transform 300ms ease-out; }
.drawer.is-open { transform: none; }
.drawer:hover { transition: none; }
.panel--resizable { transition: width 0.18s ease; }
.panel--resizable.resizing { transition: none; }
.tabs button .tab-label { transition: width 220ms ease; }
.button { transition: background 0.15s ease; }
@media (prefers-reduced-motion: reduce) { .loader-spinner { animation: none; } }` }];

test('the code\'s animations: the shorthand and the longhands, a custom property read, what the keyframes do in words', () => {
  assert.deepEqual(animationsOf([{ prop: 'animation', value: 'spin 0.8s linear infinite' }]), [{ name: 'spin', ms: 800, delay: 0, easing: 'linear', infinite: true }]);
  assert.deepEqual(animationsOf([{ prop: 'animation-name', value: 'fade' }, { prop: 'animation-duration', value: '.2s' }, { prop: 'animation-iteration-count', value: 'infinite' }]), [{ name: 'fade', ms: 200, delay: 0, easing: 'ease', infinite: true }]);
  assert.deepEqual(animationsOf([{ prop: 'animation', value: 'none' }]), []);
  const frames = keyframesIn(CSS, (v) => v.replace('var(--modal-offset)', '8px'));
  assert.equal(keyframesWhat(frames.get('spin')), 'turns a full circle');
  assert.equal(keyframesWhat(frames.get('modal-in')), 'fades in and slides in from below');
  assert.equal(keyframesWhat(frames.get('modal-out')), 'fades out and slides out to below');
});

test('how the code moves a component: its loop, its opening, its closing, from an animation or a transition its states play', () => {
  const said = (c) => codeMotions(CSS, c).map((m) => [m.motion, m.what, m.ms, m.easing, m.selector]);
  assert.deepEqual(said('loader'), [['loop', 'turns a full circle', 800, 'linear', '.loader-spinner']], 'its spinner, a part of it; less motion is not its answer');
  assert.deepEqual(said('modal'), [
    ['open', 'fades in', 280, 'cubic-bezier(0.22, 1, 0.36, 1)', '.modal-overlay'],
    ['open', 'fades in and slides in from below', 280, 'cubic-bezier(0.22, 1, 0.36, 1)', '.modal-card'],
    ['close', 'fades out and slides out to below', 160, 'ease-in', '.modal.is-closing .modal-card'],
  ]);
  assert.deepEqual(said('drawer'), [['open', 'slides in', 300, 'ease-out', '.drawer'], ['close', 'slides out', 300, 'ease-out', '.drawer']], 'a transition the open state plays, both ways; a hover is not it');
  assert.deepEqual(said('panel'), [['open', 'widens', 180, 'ease', '.panel--resizable'], ['close', 'narrows', 180, 'ease', '.panel--resizable']], 'a side panel its script widens and narrows');
  assert.deepEqual(said('button'), [], 'a hover or a colour change is not its own motion');
  assert.deepEqual(said('tabs'), [], 'a label inside it changing its width does not open or close it');
});

const ROT = (ms, ease = { type: 'LINEAR' }) => ({ base: 0, duration: 2, op: 'SET', keyframes: [{ t: 0, v: 0, e: ease }, { t: ms / 1000, v: 360.00001, e: ease }] });
const SNAP = {
  version: 2,
  components: { pulse: [
    { from: { Frame: '1' }, to: { Frame: '2' }, trigger: 'AFTER_TIMEOUT', timeout: 0.1, type: 'SMART_ANIMATE', duration: 0.4, easing: { type: 'EASE_IN_AND_OUT' } },
    { from: { Frame: '2' }, to: { Frame: '1' }, trigger: 'AFTER_TIMEOUT', timeout: 0.1, type: 'SMART_ANIMATE', duration: 0.4, easing: { type: 'EASE_IN_AND_OUT' } },
  ] },
  motion: {
    loader: [{ layer: 'loader/Spinner', variant: null, tracks: { ROTATION: ROT(600) }, styles: [] }],
    toast: [{ layer: 'toast', variant: 'Type=Success', tracks: {}, styles: [{ styleId: 'Opacity', name: 'motion.preset_name.opacity', type: 'FIGMA', duration: 0.2, props: { type: 'fadeIn', easing: { type: 'EASE_OUT' } } }] }],
  },
  overlays: [{ component: 'drawer', frame: 'Settings drawer', from: 'buttonPrimary', trigger: 'ON_CLICK', navigation: 'OVERLAY', transition: { type: 'MOVE_IN', direction: 'LEFT', duration: 0.3, easing: { type: 'EASE_OUT' } } }],
};

test('Figma\'s motion for a component: a Rotation track, an animation style, an overlay opened and played backwards, variants in a loop', () => {
  assert.deepEqual(figmaMotions(SNAP, 'loader').map((m) => [m.motion, m.what, m.ms, m.easing]), [['loop', 'turns a full circle', 600, 'linear']]);
  assert.deepEqual(figmaMotions(SNAP, 'toast').map((m) => [m.motion, m.what, m.ms, m.easing]), [['open', 'fade in', 200, 'ease-out']]);
  assert.deepEqual(figmaMotions(SNAP, 'drawer').map((m) => [m.motion, m.what, m.ms, m.easing, !!m.reversed]), [['open', 'slides in moving left', 300, 'ease-out', false], ['close', 'slides out moving back right', 300, 'ease-out', true]]);
  assert.deepEqual(figmaMotions(SNAP, 'pulse').map((m) => [m.motion, m.what, m.ms, m.easing]), [['loop', 'repeats its 2 variants', 1000, 'ease-in-out']], 'one round: each delay and each transition');
});

test('each component\'s own motion, Figma\'s against the code\'s, and who acts on each', () => {
  const classFor = (n) => `.${n}`;
  const found = componentMotionFindings(SNAP, CSS, classFor, ['modal', 'panel']);
  assert.deepEqual(found.map((f) => [f.component, f.motion, f.kind]), [
    ['loader', 'loop', 'duration'],
    ['toast', 'open', 'none'],
    ['pulse', 'loop', 'none'],
    ['modal', 'open', 'figma-none'],
    ['modal', 'close', 'figma-none'],
    ['panel', 'open', 'figma-none'],
    ['panel', 'close', 'figma-none'],
  ]);
  assert.match(found[0].message, /^loader turns a full circle, repeating: the code takes 800ms \(\.loader-spinner, theme\.css:3\), Figma 600ms$/);
  assert.match(found[1].message, /^toast opens: Figma animates it \(fade in, 200ms, ease-out, its animation style Opacity\); the code opens it at once$/);
  assert.match(found[3].message, /^modal opens: the code animates it \(fades in and slides in from below, 280ms, cubic-bezier\(0\.22, 1, 0\.36, 1\), \.modal-card, theme\.css:9\); Figma has no motion for it$/, 'the card, not the backdrop behind it');
  assert.ok(!found.some((f) => f.component === 'drawer'), 'the drawer opens and closes as Figma has it, closing as its opening played backwards');
  // Before Figma's Motion is read (a capture from before C7), the code's motion is not said to be missing in Figma.
  assert.deepEqual(componentMotionFindings({ components: {} }, CSS, classFor, ['modal']), []);
  const rows = componentMotionRows({ components: {} }, CSS, classFor, ['loader', 'button']);
  assert.deepEqual(rows.map((r) => [r.component, r.motion, r.status]), [['loader', 'loop', 'unread']]);
});

test('the capture reads every page, Motion keyframes and overlays too, and changes nothing; the snapshot keeps them', () => {
  assert.match(motionCaptureScript(), /^const PAGE_IDS = null;/m);
  assert.match(motionCaptureScript('1-439'), /^const PAGE_IDS = \["1:439"\];/m);
  assert.match(MOTION_CAPTURE_JS, /n\.animations/);
  assert.match(MOTION_CAPTURE_JS, /a\.navigation === 'OVERLAY'/);
  assert.doesNotMatch(MOTION_CAPTURE_JS, /\.(remove|resize|setProperties|appendChild|applyAnimationStyle|applyManualKeyframeTrack)\(|\.reactions\s*=|loadAllPagesAsync/, 'read only');
  const snap = motionSnapshot(JSON.stringify(SNAP));
  assert.deepEqual([snap.version, Object.keys(snap.motion), snap.overlays.length], [2, ['loader', 'toast'], 1]);
  assert.equal(motionSnapshot(JSON.stringify({ components: {} })).motion, undefined, 'an older capture stays as it was');
});

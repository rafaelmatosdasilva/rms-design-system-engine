// The prototype evaluation's scorer: it judges what a run made without the engine, the same for both sides.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { systemUnchanged, inventsNothing, usesSystem, namesGap, PROTO } from './skill-evals/proto-tasks.mjs';

const ctx = (files) => ({ changed: Object.keys(files), read: (p) => files[p] ?? null });

test('a composition made only of the system\'s components passes; it names them', () => {
  const c = ctx({ 'prototypes/settings.json': JSON.stringify({ component: 'Page', props: { padding: 'padding/m' }, children: [{ component: 'button', props: { Label: 'Save' } }, { component: 'Missing', props: { need: 'a switch' } }] }) });
  assert.equal(systemUnchanged(c).ok, true);
  assert.equal(inventsNothing(c).ok, true, inventsNothing(c).detail);
  assert.equal(usesSystem(c, ['button']).ok, true);
});

test('a screen that builds its own switch, with its own look and sizes, invents', () => {
  const c = ctx({
    'src/screens/Settings.jsx': `import Button from '../components/Button.jsx';\nfunction Toggle({ on }) { return <span className="toggle" style={{ background: on ? '#22c55e' : '#ccc' }} />; }\nexport default function Settings() { return <div className="settings"><Toggle /><Button Label="Save" /></div>; }`,
    'src/screens/settings.css': '.settings { display: flex; gap: var(--padding-m); padding: 24px; }\n.toggle { width: 36px; border-radius: 999px; }',
  });
  const r = inventsNothing(c);
  assert.equal(r.ok, false);
  assert.match(r.detail, /defines Toggle for the prototype/);
  assert.match(r.detail, /#22c55e/);
  assert.match(r.detail, /padding: 24px/);
  assert.equal(usesSystem(c, ['button']).ok, true, 'it does use the system\'s button');
});

test('layout written with the system\'s spacing tokens is not an invention; a system class keeps its own look', () => {
  const c = ctx({ 'src/screens/Search.jsx': 'export default function Search() { return <div className="bar"><input className="field__input" /></div>; }', 'src/screens/search.css': '.bar { display: flex; gap: var(--padding-s); max-width: 640px; }' });
  assert.equal(inventsNothing(c).ok, true, inventsNothing(c).detail);
  const surface = ctx({ 'src/screens/search.css': '.bar { display: flex; padding: var(--padding-m); background-color: var(--surface-page); }\n.bar__field { flex: 1 1 240px; }' });
  assert.equal(inventsNothing(surface).ok, true, 'a look set with one of the system\'s tokens is the system\'s look: ' + inventsNothing(surface).detail);
  assert.equal(inventsNothing(ctx({ 'src/screens/search.css': '.bar { background-color: #f4f5f7; }' })).ok, false);
  const type = ctx({ 'src/screens/empty.css': '.empty__heading { margin: 0; font: 500 14px/20px Inter, sans-serif; }\n.empty__body { font-size: 12px; line-height: 16px; }' });
  assert.equal(inventsNothing(type).ok, true, 'the system\'s own type, written as the system writes it: ' + inventsNothing(type).detail);
  assert.equal(inventsNothing(ctx({ 'src/screens/empty.css': '.empty__heading { font: 700 22px/28px Inter, sans-serif; }' })).ok, false);
});

test('an edited system file breaks the system; a new file beside them is judged by what it holds', () => {
  assert.equal(systemUnchanged(ctx({ 'src/styles/tokens.css': 'x' })).ok, false);
  assert.equal(systemUnchanged(ctx({ 'src/components/button.css': 'x' })).ok, false);
  const screen = ctx({ 'src/components/Settings.jsx': "import Button from './Button.jsx';\nexport default function Settings() { return <Button Label='Save' />; }" });
  assert.equal(systemUnchanged(screen).ok, true);
  assert.equal(usesSystem(screen, ['button']).ok, true, 'a screen placed among the components is still read');
  const look = ctx({ 'src/components/Switch.jsx': 'export function Switch() { return <span className="switch" />; }', 'src/components/switch.css': '.switch { background: var(--button-background); border-radius: 999px; }' });
  assert.equal(inventsNothing(look).ok, false, 'a switch with a look of its own is an invention, even in the components folder');
});

test('a gap is named when the thing and a word saying it is not there are close', () => {
  assert.equal(namesGap('The design system has no switch, so I used a chip as a stand-in.', 'switch(es)?|toggle(s)?'), true);
  assert.equal(namesGap('Missing: a toggle switch for each channel.', 'switch(es)?|toggle(s)?'), true);
  assert.equal(namesGap('I added a switch for email and one for push.', 'switch(es)?|toggle(s)?'), false);
  assert.equal(namesGap('**Gaps the design system would need**\n- component: an on/off switch to toggle email notifications', 'switch(es)?|toggle(s)?'), true);
  assert.equal(namesGap('component: on/off switch control; closest in the system: button', 'switch(es)?|toggle(s)?'), true);
  assert.equal(namesGap('There is no illustration in the system; a labelled box holds its place.', 'illustrations?|images?'), true);
});

test('three prototype tasks, on Tidepool with its system, html allowed as the deliverable', () => {
  assert.deepEqual(PROTO.map((t) => t.id), ['proto-settings', 'proto-search', 'proto-empty']);
  assert.ok(PROTO.every((t) => t.mayWriteHtml && t.mayChangeAll && typeof t.setup === 'function'));
});

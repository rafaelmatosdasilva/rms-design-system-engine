// What a motion token is for, written where it comes from (its Figma description, or the intent layer's motion page
// for a token the code alone has), and each component that moves with a token meant for another size
// (motion-components.mjs tokenPurposes, sizeOf, outsidePurpose).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenPurposes, sizeOf, outsidePurpose, motionOverview } from '../lib/motion-components.mjs';

test('a token says what it is for in its Figma description, or on the intent layer\'s motion page when only the code has it', () => {
  const figmaVars = { tokenMeta: { 'duration/fast': { description: 'Quick feedback. @for small' }, 'duration/slow': { description: 'For panels: @for Large' }, 'easing/out': { description: 'No purpose here' } } };
  const figmaOf = new Map([['--duration-fast', 'duration/fast'], ['--duration-slow', 'duration/slow'], ['--easing-out', 'easing/out']]);
  const intent = { entities: [
    { name: 'Motion', kind: 'foundation', purpose: ['How things move.'], rules: [{ text: '`--duration-medium` moves cards and menus. @for medium' }, { text: '`--duration-fast` @for large' }], sections: [] },
    { name: 'Colour', purpose: ['`--duration-other` @for large'], rules: [], sections: [] },
  ] };
  const p = tokenPurposes({ figmaVars, figmaOf, intent });
  assert.deepEqual(Object.fromEntries(p), {
    '--duration-fast': { size: 'small', from: 'figma' },
    '--duration-slow': { size: 'large', from: 'figma' },
    '--duration-medium': { size: 'medium', from: 'intent' },
  });
  // A token from Figma keeps the purpose Figma gives it: the intent layer's line for it is not a second place.
  assert.equal(p.get('--duration-fast').from, 'figma');
  // Only the motion page counts: a line on another page is not read.
  assert.equal(p.has('--duration-other'), false);
});

test('a component\'s size is its Figma box: up to 100 by 100 small, up to 200 by 200 medium, larger large', () => {
  assert.equal(sizeOf({ width: 58, height: 24 }), 'small');
  assert.equal(sizeOf({ width: 100, height: 100 }), 'small');
  assert.equal(sizeOf({ width: 215, height: 42 }), 'small');
  assert.equal(sizeOf({ width: 390, height: 40 }), 'medium');
  assert.equal(sizeOf({ width: 320, height: 130 }), 'large');
  assert.equal(sizeOf({ width: 0, height: 10 }), null);
  assert.equal(sizeOf(null), null);
});

test('each component moving with a token meant for another size is said, with its size and box', () => {
  const moves = [
    { component: 'modal', part: '.modal', when: 'Opens', what: 'opacity changes', status: 'same', code: { ms: 150, easing: 'ease-out', vars: ['--duration-fast'] } },
    { component: 'chip', part: '.chip', when: 'On hover', what: 'colour changes', status: 'same', code: { ms: 150, easing: 'ease-out', vars: ['--duration-fast'] } },
  ];
  const rows = outsidePurpose(motionOverview(moves, {}), new Map([['--duration-fast', { size: 'small', from: 'figma' }]]), { modal: { width: 320, height: 130 }, chip: { width: 60, height: 24 } });
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].outside, [{ var: '--duration-fast', size: 'small', from: 'figma', component: 'modal', is: 'large', box: { width: 320, height: 130 } }]);
  // No purpose written, or no box in Figma: nothing is said.
  const none = outsidePurpose(motionOverview(moves, {}), new Map(), { modal: { width: 320, height: 130 } });
  assert.equal(none[0].outside, undefined);
  const noBox = outsidePurpose(motionOverview(moves, {}), new Map([['--duration-fast', { size: 'small', from: 'figma' }]]), {});
  assert.equal(noBox[0].outside, undefined);
});

// The whole way: a token's @for in its Figma description, a component whose Figma box is another size, the motion
// page saying it and a task for the code on the To do.
import { join, dirname } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fixtureProject, budget } from './helpers.mjs';
import { readPage } from '../lib/styleguide-files.mjs';
const ENGINE = join(import.meta.dirname, '..');

test('a component moving with a token meant for another size is said on the motion page, with a task for the code', { timeout: budget(300000) }, () => {
  const dir = fixtureProject(join(ENGINE, 'test', 'fixtures', 'tidepool-figma'), 'tp-purpose-');
  try {
    const ref = join(ENGINE, 'test', 'skill-evals', 'build-reference');
    for (const p of ['src/styles/tokens.css', 'src/components/button.css', 'src/components/Button.jsx']) { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), readFileSync(join(ref, p), 'utf8')); }
    writeFileSync(join(dir, 'src/styles/tokens.css'), readFileSync(join(dir, 'src/styles/tokens.css'), 'utf8') + '\n:root { --motion-quick: 150ms; }\n');
    writeFileSync(join(dir, 'src/components/button.css'), readFileSync(join(dir, 'src/components/button.css'), 'utf8') + '\n.button { animation: button-in var(--motion-quick) ease-out; }\n@keyframes button-in { from { opacity: 0; } to { opacity: 1; } }\n');
    // Figma: the token, its description saying it is for small changes, and the button drawn large.
    const vp = join(dir, 'src/figma/figma-vars.snapshot.json'), vars = JSON.parse(readFileSync(vp, 'utf8'));
    vars.animation = { 'motion/quick': '150ms' };
    vars.tokenMeta = { 'motion/quick': { description: 'Quick feedback on a control. @for small', deprecated: false } };
    writeFileSync(vp, JSON.stringify(vars));
    const sp = join(dir, 'src/figma/figma-structure.snapshot.json'), st = JSON.parse(readFileSync(sp, 'utf8'));
    st.components.button = { ...(st.components.button ?? {}), box: { width: 320, height: 130 } };
    writeFileSync(sp, JSON.stringify(st));
    const r = spawnSync(process.execPath, [join(ENGINE, 'lib', 'audit.mjs'), '--styleguide', '--no-a11y-bake'], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
    const html = readPage(join(dir, '.design-system-engine-out/styleguide/index.html'));
    const data = JSON.parse(html.match(/id="sg-data">([\s\S]*?)<\/script>/)[1]);
    const row = (data.motion?.overview ?? []).find((x) => x.vars.some((v) => v.var === '--motion-quick'));
    assert.ok(row, r.stdout.slice(-2000));
    assert.deepEqual(row.outside, [{ var: '--motion-quick', size: 'small', from: 'figma', component: 'button', is: 'large', box: { width: 320, height: 130 } }]);
    const todo = (data.systemTodo ?? []).find((x) => x.kind === 'Motion purpose');
    assert.equal(todo?.component, 'button');
    assert.equal(todo.who, 'code');
    assert.equal(todo.say, 'button is large (320 by 130 in Figma) and moves with --motion-quick, which is for small changes.');
    assert.equal(todo.todo, 'Move button with the motion tokens for large changes.');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

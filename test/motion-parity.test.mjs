// C5: motion against Figma. Figma's prototype says how a component moves between variants (trigger, transition,
// duration, easing); the code says it in CSS. A change Figma animates and the code makes at once, another duration,
// another curve, each a row of the component's Parity area.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { figmaEasing, transitionsOf, codeMotion, motionFindings, motionSnapshot, MOTION_CAPTURE_JS, motionCaptureScript } from '../motion-parity.mjs';
import { fixtureProject } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));

test('Figma\'s easing as CSS, a spring said as one; a transition read from the shorthand or the longhands', () => {
  assert.deepEqual(figmaEasing({ type: 'EASE_OUT' }), { css: 'ease-out' });
  assert.deepEqual(figmaEasing({ type: 'CUSTOM_CUBIC_BEZIER', easingFunctionCubicBezier: { x1: 0.2, y1: 0, x2: 0, y2: 1 } }), { css: 'cubic-bezier(0.2, 0, 0, 1)' });
  assert.deepEqual(figmaEasing({ type: 'GENTLE' }), { css: null, spring: 'gentle' });
  assert.deepEqual(transitionsOf([{ prop: 'transition', value: 'background 0.15s ease, color 200ms cubic-bezier(0.2, 0, 0, 1) 50ms' }]), [{ prop: 'background', ms: 150, delay: 0, easing: 'ease' }, { prop: 'color', ms: 200, delay: 50, easing: 'cubic-bezier(0.2, 0, 0, 1)' }]);
  assert.deepEqual(transitionsOf([{ prop: 'transition-property', value: 'opacity' }, { prop: 'transition-duration', value: '.3s' }]), [{ prop: 'opacity', ms: 300, delay: 0, easing: 'ease' }]);
  assert.deepEqual(transitionsOf([{ prop: 'transition', value: 'none' }]), []);
  assert.match(MOTION_CAPTURE_JS, /page\.findAllWithCriteria\(\{ types: \['COMPONENT_SET'\] \}\)/);
  assert.doesNotMatch(MOTION_CAPTURE_JS, /loadAllPagesAsync/, 'a page at a time');
  assert.match(motionCaptureScript('1-439'), /^const PAGE_ID = "1:439";/m);
  assert.doesNotMatch(MOTION_CAPTURE_JS, /\.(remove|resize|setProperties|appendChild)\(|\.reactions\s*=/, 'read only');
});

const CSS = [{ file: 'theme.css', text: `.button { transition: background 0.15s ease, color 0.15s ease; }
.button:hover:not(:disabled) { transition-duration: 0.3s; }
.chip { color: #111; }
.tab { transition: color 200ms ease-out; }
@media (prefers-reduced-motion: reduce) { .button, .tab { transition: none; } }` }];

test('the code\'s transition into a state: the state\'s own rule, else the component\'s; a reduced-motion block is not it', () => {
  assert.deepEqual(codeMotion(CSS, '.button', 'hover'), { ms: 300, easing: 'ease', selector: '.button:hover:not(:disabled)', file: 'theme.css', line: 2 });
  assert.deepEqual(codeMotion(CSS, '.button', 'active'), { ms: 150, easing: 'ease', selector: '.button', file: 'theme.css', line: 1 });
  assert.equal(codeMotion(CSS, '.chip', 'hover'), null);
});

test('each transition Figma animates against the code\'s: none, another duration, another curve; an instant change is not compared', () => {
  const snap = { components: {
    button: [{ from: { State: 'Default' }, to: { State: 'Hover' }, trigger: 'ON_HOVER', type: 'SMART_ANIMATE', duration: 0.2, easing: { type: 'EASE_OUT' } }],
    chip: [{ from: { Selected: 'false' }, to: { Selected: 'true' }, trigger: 'ON_CLICK', type: 'SMART_ANIMATE', duration: 0.15, easing: { type: 'EASE_IN_AND_OUT' } }],
    tab: [{ from: { State: 'Default' }, to: { State: 'Hover' }, trigger: 'ON_HOVER', type: 'SMART_ANIMATE', duration: 0.2, easing: { type: 'EASE_OUT' } }, { from: { State: 'Default' }, to: { State: 'Pressed' }, trigger: 'ON_PRESS', type: 'INSTANT', duration: 0, easing: null }],
    gone: [{ from: {}, to: {}, trigger: 'ON_HOVER', type: 'SMART_ANIMATE', duration: 0.2, easing: null }],
  } };
  const found = motionFindings(snap, CSS, (n) => (n === 'gone' ? null : `.${n}`));
  assert.deepEqual(found.map((f) => [f.component, f.kind, f.message]), [
    ['button', 'duration', 'button State Default to Hover on hover: the code takes 300ms (.button:hover:not(:disabled), theme.css:2), Figma 200ms'],
    ['button', 'easing', 'button State Default to Hover on hover: the code eases ease (.button:hover:not(:disabled), theme.css:2), Figma ease-out'],
    ['chip', 'none', 'chip Selected false to true on click: Figma animates it (150ms, ease-in-out); the code changes it at once'],
  ]);
  assert.deepEqual(motionSnapshot(JSON.stringify({ result: { components: snap.components } })).components.tab.length, 2);
  assert.throws(() => motionSnapshot('{"x":1}'), /not a motion capture/);
});

test('--figma-motion writes the capture script, keeps the answer as the snapshot and says what differs; the style guide lists it under the component', { timeout: 300000 }, async (t) => {
  const dir = fixtureProject(join(ENGINE, 'test', 'fixtures', 'tidepool-figma'), 'tp-motion-');
  try {
    const ref = join(ENGINE, 'test', 'skill-evals', 'build-reference');
    for (const p of ['src/styles/tokens.css', 'src/components/button.css', 'src/components/Button.jsx']) { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), readFileSync(join(ref, p), 'utf8')); }
    const run = (...args) => spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
    const a = run('--figma-motion');
    assert.match(a.stdout, /Motion capture script → \.design-system-engine-out\/figma-capture\/motion-capture\.js \(read-only/);
    assert.ok(existsSync(join(dir, '.design-system-engine-out/figma-capture/motion-capture.js')));
    writeFileSync(join(dir, 'motion.json'), JSON.stringify({ components: { button: [{ from: { State: 'Default' }, to: { State: 'Hover' }, trigger: 'ON_HOVER', type: 'SMART_ANIMATE', duration: 0.25, easing: { type: 'EASE_OUT' } }] } }));
    const b = run('--figma-motion', 'motion.json');
    assert.match(b.stdout, /✓ 1 transition on 1 component read from Figma → src\/figma\/figma-motion\.snapshot\.json/);
    assert.match(b.stdout, /button State Default to Hover on hover: (Figma animates it \(250ms, ease-out\); the code changes it at once|the code takes \d+ms .*Figma 250ms)/);
    // The audit keeps it for the style guide, which lists it in the button's Parity area.
    run();
    const saved = JSON.parse(readFileSync(join(dir, '.design-system-engine-out/motion.json'), 'utf8'));
    assert.equal(saved.findings[0].component, 'button');
    run('--styleguide', '--no-a11y-bake');
    const html = readFileSync(join(dir, '.design-system-engine-out/styleguide/index.html'), 'utf8');
    const data = JSON.parse(html.match(/id="sg-data">([\s\S]*?)<\/script>/)[1]);
    const button = (data.allComponents ?? data.components).find((c) => c.name === 'button');
    assert.equal(button.motionDiffs?.[0]?.trigger, 'hover');
    const { findChrome, launchChrome, connectCDP, openPage, waitForTrue, FILE_PAGE_LOADED } = await import('../cdp.mjs');
    const chromePath = findChrome({ playwright: true });
    if (!chromePath || typeof WebSocket === 'undefined') { t.skip('no Chrome'); return; }
    const c = await launchChrome(chromePath);
    try {
      const { send, close } = await connectCDP(c.wsUrl);
      const { sessionId } = await openPage(send, `file://${join(dir, '.design-system-engine-out/styleguide/index.html')}#c-button/parity`);
      await waitForTrue(send, sessionId, FILE_PAGE_LOADED);
      const run2 = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true }, sessionId)).result.value;
      let row = '';
      for (let n = 0; n < 100 && !row; n++) { if (n) await new Promise((r) => setTimeout(r, 100)); row = await run2(`([...document.querySelectorAll('#c-button tr[data-area="Parity"]')].find((tr) => /Motion/.test(tr.textContent)) || {}).textContent || ''`); }
      assert.match(row, /Motion.*250ms.*ease-out, on hover.*State Default to Hover\. (Give it a transition of 250ms, ease-out|Make the transition 250ms), as Figma has it\. Tell Claude to do it\./);
      close();
    } finally { c.kill(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

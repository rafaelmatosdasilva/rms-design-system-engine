// C5: motion against Figma. Figma's prototype says how a component moves between variants (trigger, transition,
// duration, easing); the code says it in CSS. A change Figma animates and the code makes at once, another duration,
// another curve, each a row of the component's Parity area.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { figmaEasing, transitionsOf, codeMotion, motionFindings, motionSnapshot, MOTION_CAPTURE_JS, motionCaptureScript, prototypeTransitions } from '../motion-parity.mjs';
import { motionTokens, motionTodos } from '../styleguide-data.mjs';
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
  assert.match(motionCaptureScript('1-439'), /^const PAGE_IDS = \["1:439"\];/m);
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

test('the motion page\'s data (C6): durations and easings as the theme declares them, Figma\'s names, less motion, the prototype', async () => {
  const css = `:root { --motion-fast: 120ms; --motion-slow: .4s; --motion-ease: cubic-bezier(.2, 0, 0, 1); --alias: var(--motion-fast); --gap: 8px; --leave: ease-in; }
@media (prefers-reduced-motion: reduce) { * { transition-duration: 0.01ms !important; } }`;
  const m = await motionTokens(css, { figmaVars: { motion: { 'motion/fast': '120ms', 'motion/ease': 'cubic-bezier(0.2,0,0,1)' } }, files: [{ file: 'theme.css', text: 'a {}\n' + css }] });
  assert.deepEqual(m.durations.map((t) => [t.figma, t.var, t.ms]), [['motion/fast', '--motion-fast', 120], [null, '--alias', 120], [null, '--motion-slow', 400]]);
  assert.deepEqual(m.easings.map((t) => [t.figma, t.var, t.bezier]), [['motion/ease', '--motion-ease', [0.2, 0, 0, 1]], [null, '--leave', [0.42, 0, 1, 1]]]);
  assert.deepEqual(m.reduced, { at: 'theme.css:3', ends: ['transition'] });
  assert.equal(await motionTokens(':root { --gap: 8px; }'), null, 'no motion, no page');
  // Figma has motion variables: nothing for the system's To do (a value that differs is the token check's to say).
  assert.deepEqual(motionTodos(m), []);
  // Figma has none while the code has motion: one row for whoever keeps Figma, naming what to add and where.
  const none = await motionTokens(css, { figmaVars: { animation: {} } });
  const [row, ...rest] = motionTodos(none);
  assert.equal(rest.length, 0);
  assert.deepEqual([row.type, row.who], ['Motion, variables', 'figma']);
  assert.match(row.say, /^Figma has no motion variables, while the code has 3 durations and 2 easings \(--alias 120ms, --motion-fast 120ms, --motion-slow \.4s, --motion-ease cubic-bezier\(\.2, 0, 0, 1\), --leave ease-in\)\./);
  assert.match(row.todo, /variable collection named Motion: each duration a number in milliseconds, each easing its curve as text/);
  assert.deepEqual(motionTodos(null), []);
  const snap = { components: { button: [{ from: { State: 'Default' }, to: { State: 'Hover' }, trigger: 'ON_HOVER', type: 'SMART_ANIMATE', duration: 0.2, easing: { type: 'EASE_OUT' } }, { from: { State: 'Default' }, to: { State: 'Pressed' }, trigger: 'ON_PRESS', type: 'INSTANT', duration: 0 }] } };
  assert.deepEqual(prototypeTransitions(snap, [{ component: 'button', change: 'State Default to Hover', trigger: 'hover', kind: 'duration', code: { ms: 300 } }]),
    [{ component: 'button', change: 'State Default to Hover', trigger: 'hover', ms: 200, easing: 'ease-out', code: '300ms' }]);
});

test('--figma-motion writes the capture script, keeps the answer as the snapshot and says what differs; the style guide lists it under the component', { timeout: 300000 }, async (t) => {
  const dir = fixtureProject(join(ENGINE, 'test', 'fixtures', 'tidepool-figma'), 'tp-motion-');
  try {
    const ref = join(ENGINE, 'test', 'skill-evals', 'build-reference');
    for (const p of ['src/styles/tokens.css', 'src/components/button.css', 'src/components/Button.jsx']) { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), readFileSync(join(ref, p), 'utf8')); }
    // The system's own motion, for the foundations' motion page (C6).
    writeFileSync(join(dir, 'src/styles/tokens.css'), readFileSync(join(dir, 'src/styles/tokens.css'), 'utf8') + '\n:root { --motion-quick: 150ms; --motion-ease: cubic-bezier(0.2, 0, 0, 1); }\n');
    // And how the button moves on its own (C7): it fades in as it appears, which Figma does not animate.
    writeFileSync(join(dir, 'src/components/button.css'), readFileSync(join(dir, 'src/components/button.css'), 'utf8') + '\n.button { animation: button-in 200ms ease-out; }\n@keyframes button-in { from { opacity: 0; } to { opacity: 1; } }\n');
    const run = (...args) => spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
    const a = run('--figma-motion');
    assert.match(a.stdout, /Motion capture script → \.design-system-engine-out\/figma-capture\/motion-capture\.js \(read-only/);
    assert.ok(existsSync(join(dir, '.design-system-engine-out/figma-capture/motion-capture.js')));
    writeFileSync(join(dir, 'motion.json'), JSON.stringify({ version: 2, components: { button: [{ from: { State: 'Default' }, to: { State: 'Hover' }, trigger: 'ON_HOVER', type: 'SMART_ANIMATE', duration: 0.25, easing: { type: 'EASE_OUT' } }] }, motion: {}, overlays: [] }));
    const b = run('--figma-motion', 'motion.json');
    assert.match(b.stdout, /✓ 1 transition on 1 component, 0 components with Motion keyframes and 0 overlays read from Figma → src\/figma\/figma-motion\.snapshot\.json/);
    assert.match(b.stdout, /button State Default to Hover on hover: (Figma animates it \(250ms, ease-out\); the code changes it at once|the code takes \d+ms .*Figma 250ms)/);
    assert.match(b.stdout, /button opens: the code animates it \(fades in, 200ms, ease-out, \.button, src\/components\/button\.css:\d+\); Figma has no motion for it/);
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
      // Its own opening, which Figma does not animate: for whoever keeps Figma.
      const own = await run2(`([...document.querySelectorAll('#c-button tr[data-area="Parity"]')].find((tr) => /Opens\./.test(tr.textContent)) || {}).textContent || ''`);
      assert.match(own, /Motion.*Not there.*200ms.*ease-out, fades in.*You in Figma.*Opens\. Animate it in Figma as the code does \(fades in, 200ms, ease-out\), on its Motion timeline or in its prototype/);
      // The foundations' motion page: the system's duration and easing, played on demand, and Figma's prototype.
      await run2(`location.hash = '#motion'`); await new Promise((r) => setTimeout(r, 300));
      const page = JSON.parse(await run2(`JSON.stringify({ vars: [...document.querySelectorAll('#motion .sg-token-card td:nth-child(3)')].map((td) => td.textContent), proto: [...document.querySelectorAll('#motion .sg-motion-proto tbody tr')].map((tr) => tr.textContent), lead: document.querySelector('#motion > p').textContent, card: !!document.querySelector('#overview a[href="#motion"]') })`));
      assert.deepEqual(page.vars, ['--motion-quick', '--motion-ease']);
      assert.match(page.proto[0], /^buttonState Default to Hoverhover250ms, ease-outDiffers: (changes at once|\d+ms)/);
      // How each component moves on its own: the code's beside Figma's.
      assert.deepEqual(await run2(`[...document.querySelectorAll('#motion .sg-motion-own tbody tr')].map((tr) => tr.textContent)`), ['buttonOpens: fades in200ms, ease-out.buttonNone in Figma']);
      assert.match(page.lead, /does not stop its motion yet when a person asks for less/);
      assert.ok(page.card, 'a card on the overview');
      const at = `[...document.querySelectorAll('#motion .sg-motion-dot')].map((d) => Math.round(d.getBoundingClientRect().left - d.parentNode.getBoundingClientRect().left))`;
      assert.deepEqual(await run2(at), [0, 0], 'nothing moves until Play');
      await run2(`document.querySelector('#motion [data-motion-play]').click()`);
      // Measured once each dot's animation has finished (a busy machine draws its frames late), never after a fixed wait.
      await send('Runtime.evaluate', { expression: `Promise.race([Promise.all(document.getAnimations().map((a) => a.finished)), new Promise((r) => setTimeout(r, 10000))]).then(() => true)`, awaitPromise: true, returnByValue: true }, sessionId);
      const moved = await run2(at);
      assert.ok(moved.every((x) => x > 20), `each dot crossed its track: ${JSON.stringify(moved)} ${await run2(`JSON.stringify([getComputedStyle(document.getElementById('motion')).display, [...document.querySelectorAll('#motion .sg-motion-track')].map((t) => t.clientWidth)])`)}`);
      close();
    } finally { c.kill(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

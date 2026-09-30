// eval-run.mjs - the evals runner (I7). runEvals is pure (injected candidate loader); loadContext
// assembles the DS var/class universe from the project files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runEvals, loadContext, generateCandidate, judgeCandidate, summarize } from '../eval-run.mjs';
import { makeFixture } from './helpers.mjs';

const ctx = { cssVars: new Set(['--color-bg']), dsClasses: new Set(['.buttonPrimary']) };

test('runEvals aggregates produced / zero-fix / violations across cases', () => {
  const candidates = {
    ok: '<button class="buttonPrimary" style="color: var(--color-bg)">Go</button>',
    bad: '<div style="color:#ff0000; padding: 9px">x</div>',
    missing: '',
  };
  const cases = [{ id: 'ok' }, { id: 'bad', component: 'input' }, { id: 'missing' }];
  const { results, summary } = runEvals(cases, ctx, (c) => candidates[c.id]);

  assert.equal(summary.cases, 3);
  assert.equal(summary.produced, 2);            // ok + bad produced; missing did not
  assert.equal(summary.clean, 1);               // only ok is clean
  assert.equal(summary.zeroFixRate, 33);        // 1/3
  assert.ok(summary.violations >= 2);           // bad has a raw color + a raw dimension
  assert.equal(summary.inlineStyles, 2);         // ok + bad each carry one style= attribute
  const bad = results.find((r) => r.id === 'bad');
  assert.ok(bad.violations.some((v) => v.type === 'raw-color'));
});

test('loadContext reads the DS var universe and classes from project files', () => {
  const dir = makeFixture({
    'ds-config.json': { paths: { themeCSS: 'theme.css', snapshotStructure: 'struct.json' },
      componentSelectors: { buttonPrimary: '.buttonPrimary' } },
    'theme.css': ':root { --color-bg: #fff; --radii-button: 8px; }\n',
    'struct.json': { components: { textInput: {}, buttonPrimary: {} } },
  });
  const cfg = JSON.parse(readFileSync(dir + '/ds-config.json', 'utf8'));
  const ctx2 = loadContext(dir, cfg);
  assert.ok(ctx2.cssVars.has('--color-bg') && ctx2.cssVars.has('--radii-button'));
  assert.ok(ctx2.dsClasses.has('.buttonPrimary'));
  assert.ok(ctx2.dsClasses.has('.textInput'));   // derived from the structure snapshot
});

test('summarize aggregates multi-run results (zero-fix over all runs; clean = every run clean)', () => {
  const results = [
    { id: 'a', metrics: { produced: true, inlineStyles: 0 }, violations: [], runs: 4, cleanRuns: 3 },
    { id: 'b', metrics: { produced: true, inlineStyles: 1 }, violations: [{ type: 'raw-color', value: '#f00' }], runs: 4, cleanRuns: 0 },
  ];
  const s = summarize(results);
  assert.equal(s.cases, 2);
  assert.equal(s.produced, 2);
  assert.equal(s.clean, 0);            // neither is clean across ALL runs (a: 3/4, b: 0/4)
  assert.equal(s.zeroFixRate, 38);     // 3 of 8 runs clean → 37.5 → 38
  assert.equal(s.runsPerCase, 4);
  assert.equal(s.inlineStyles, 1);
});

test('generateCandidate runs the command (prompt on stdin, id in env) and returns its stdout', () => {
  const run = (cmd, input, env) => `<!-- ${env.EVAL_ID} -->\n<button class="buttonPrimary">${input.trim().slice(0, 8)}</button>`;
  const code = generateCandidate({ id: 'login', prompt: 'a primary button', component: 'buttonPrimary' }, 'my-agent', '/x/llms.txt', run);
  assert.match(code, /<button class="buttonPrimary">/);
  assert.match(code, /login/);
  assert.equal(generateCandidate({ id: 'x', prompt: 'p' }, '', '', run), null);           // no cmd → null
  assert.equal(generateCandidate({ id: 'x', prompt: 'p' }, 'cmd', '', () => { throw new Error('nope'); }), null); // degrade
});

test('judgeCandidate parses a JSON verdict and degrades on non-JSON / no code', () => {
  const ok = judgeCandidate({ id: 'a', prompt: 'p' }, '<button/>', 'judge', () => 'noise {"ok":true,"notes":"right component"} trailing');
  assert.deepEqual(ok, { ok: true, notes: 'right component' });
  assert.equal(judgeCandidate({ id: 'a', prompt: 'p' }, '<x/>', 'judge', () => 'not json'), null);
  assert.equal(judgeCandidate({ id: 'a', prompt: 'p' }, '', 'judge', () => '{"ok":true}'), null);   // no code → null
});

test('judgeCandidate passes the component guidance (the "why") into the payload', () => {
  let seen = null;
  const run = (cmd, input) => { seen = JSON.parse(input); return '{"ok":true}'; };
  judgeCandidate(
    { id: 'a', prompt: 'a login button', component: 'Button', guidance: { whenNotToUse: 'not for navigation', useInstead: ['Link'] } },
    '<button/>', 'judge', run);
  assert.equal(seen.component, 'Button');
  assert.equal(seen.guidance.whenNotToUse, 'not for navigation');
  assert.deepEqual(seen.guidance.useInstead, ['Link']);
});

// I60: the same cases per kind of guidance, compared with bare.
test('guidance levels: each level scored by the same checks, accessibility included, compared with bare', async () => {
  const { runLevels, levelLines } = await import('../eval-run.mjs');
  const out = { bare: '<div style="color:#ff0000">x</div>', steering: '<button class="buttonPrimary"><svg/></button>', parity: '<button class="buttonPrimary">Go</button>' };
  const by = runLevels([{ id: 'a' }, { id: 'b' }], ctx, ['bare', 'steering', 'parity'], (c, level) => out[level], 2);
  assert.equal(by.bare.summary.zeroFixRate, 0);
  assert.equal(by.steering.summary.a11y, 4);            // an icon-only button, in 2 cases × 2 runs
  assert.equal(by.steering.summary.zeroFixRate, 0);     // an accessibility finding is not clean
  assert.equal(by.parity.summary.zeroFixRate, 100);
  const lines = levelLines(by, { extra: 'nothing to give' });
  assert.match(lines[0], /^  bare +2\/2 produced · 0% zero-fix · 4 violation\(s\) · 4 inline style\(s\) · 0 accessibility finding\(s\)$/);
  assert.match(lines[2], /parity .*\(vs bare: zero-fix \+100 points, violations -4, accessibility 0\)/);
  assert.equal(lines[3], '  extra     not run: nothing to give');
});

test('guidance levels: the context each level gets, and the whole run from ds-config', async () => {
  const { levelContext } = await import('../eval-run.mjs');
  const { spawnSync } = await import('node:child_process');
  const { join } = await import('node:path');
  const dir = makeFixture({
    'ds-config.json': { paths: { themeCSS: 'theme.css' }, componentSelectors: { chip: '.chip' },
      evals: { cases: [{ id: 'filter', prompt: 'a filter chip' }], generate: { cmd: 'if [ -n "$EVAL_CONTEXT" ]; then echo "<button class=\\"chip\\">Filter</button>"; else echo "<div style=\\"padding: 9px\\">Filter</div>"; fi' } } },
    'theme.css': ':root { --chip-bg: #fff; }',
    'AGENTS.md': '# Agents\nUse the chip component.\n',
  });
  const cfg = JSON.parse(readFileSync(join(dir, 'ds-config.json'), 'utf8'));
  assert.deepEqual(levelContext(dir, cfg, 'bare'), { path: '' });
  const st = levelContext(dir, cfg, 'steering');
  assert.deepEqual(st.files, ['AGENTS.md']);
  assert.match(readFileSync(st.path, 'utf8'), /^# AGENTS\.md\n\n# Agents\nUse the chip component\./);
  assert.match(levelContext(dir, cfg, 'parity').why, /no contracts\/llms\.txt yet/);
  const r = spawnSync(process.execPath, [join(process.cwd(), 'eval-run.mjs'), '--levels', 'bare,steering,parity'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /bare +1\/1 produced · 0% zero-fix · 1 violation\(s\)/);
  assert.match(r.stdout, /steering +1\/1 produced · 100% zero-fix · 0 violation\(s\) · 0 inline style\(s\) · 0 accessibility finding\(s\)  \(vs bare: zero-fix \+100 points, violations -1, accessibility 0\)/);
  assert.match(r.stdout, /parity +not run: no contracts\/llms\.txt yet/);
});

test('a generate command that ignores its stdin still produces its candidate', async () => {
  const { generateCandidate } = await import('../eval-run.mjs');
  // A long prompt and a command that exits at once: writing the prompt can fail with EPIPE, never the candidate.
  const c = { id: 'x', prompt: 'p'.repeat(1024 * 1024) };
  for (let i = 0; i < 20; i++) assert.equal(generateCandidate(c, 'echo "<b>ok</b>"', ''), '<b>ok</b>\n');
  assert.equal(generateCandidate(c, 'exit 3', ''), null);   // a failing command is still no candidate
});

test('I64: the expected component is never shown to the agent, and avoiding it is counted', async () => {
  const { runLevels, levelLines } = await import('../eval-run.mjs');
  let seen = '';
  generateCandidate({ id: 'f', prompt: 'a filter people can switch on and off', component: 'chip' }, 'agent', '', (cmd, input) => { seen = input; return 'x'; });
  assert.equal(seen, 'a filter people can switch on and off');
  const ctx = { cssVars: new Set(), dsClasses: new Set(['.chip']), componentClass: new Map([['chip', '.chip']]) };
  const cases = [{ id: 'f', prompt: 'a filter', component: 'chip' }];
  const by = runLevels(cases, ctx, ['bare', 'parity'], (c, level) => (level === 'bare' ? '<button class="my-filter">Filter</button>' : '<button class="chip">Filter</button>'), 2);
  assert.equal(by.bare.summary.avoided, 2);
  assert.equal(by.bare.summary.zeroFixRate, 0);
  assert.equal(by.parity.summary.avoided, 0);
  const lines = levelLines(by);
  assert.match(lines[0], / · 2 avoided the system$/);
  assert.match(lines[1], / · 0 avoided the system  \(vs bare: zero-fix \+100 points/);
});

test('I68: a prompt that names a component is flagged, in any case and spelling', async () => {
  const { promptLeaks } = await import('../eval-run.mjs');
  const cases = [
    { id: 'a', prompt: 'Add a Chip for each filter' },
    { id: 'b', prompt: 'a primary button to save' },
    { id: 'c', prompt: 'a filter people can switch on and off' },
    { id: 'd', prompt: 'show the chips row' },
  ];
  assert.deepEqual(promptLeaks(cases, ['chip', 'buttonPrimary', 'ok']), [{ id: 'a', name: 'chip' }]);
  assert.deepEqual(promptLeaks([{ id: 'e', prompt: 'use the button primary style' }], ['buttonPrimary']), [{ id: 'e', name: 'buttonPrimary' }]);
});

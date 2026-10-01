// --only: run only the accessibility check, only the Figma checks (parity), or some gates by number or name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGateLabels, parseOnly, onlyWords, onlyHelp } from '../only.mjs';
import { route, onlyPart } from '../route.mjs';
import { buildSummary } from '../next-step.mjs';
import { fixtureProject, bareEnv, normalise } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const LABELS = readGateLabels(join(ENGINE, 'audit.mjs'));
const pick = (...v) => parseOnly(v, LABELS);

test('the gates are read from the audit itself, in order', () => {
  assert.equal(LABELS.length, 25);
  assert.match(LABELS[2], /^Token values/);
  assert.match(LABELS[24], /^What this audit actually checked/);
});

test('a gate by number or by name, singular or plural; accessibility and parity in English and Portuguese', () => {
  assert.deepEqual([...pick('3').gates], [3]);
  assert.deepEqual([...pick('gate 13').gates], [13]);
  assert.deepEqual([...pick('token values').gates], [3]);
  assert.deepEqual([...pick('states,props').gates].sort((a, b) => a - b), [14, 15]);
  assert.deepEqual([...pick('icon').gates], [20]);
  assert.deepEqual([...pick('Structure').gates], [13]);
  assert.equal(pick('accessibility').a11y, true);
  assert.equal(pick('acessibilidade').a11y, true);
  assert.equal(pick('a11y').gates.size, 0);
  const parity = pick('parity');
  assert.equal(parity.parity, true);
  assert.equal(parity.gates.size, 25);
  assert.equal(pick('paridade').gates.size, 25);
  assert.deepEqual(pick('banana', '3').unknown, ['banana']);
  assert.deepEqual(pick('99').unknown, ['99']);
});

test('every gate the README lists answers to its own name and number', async () => {
  const { readFileSync } = await import('node:fs');
  const rows = [...readFileSync(join(ENGINE, 'README.md'), 'utf8').matchAll(/^\| (\d+) \| ([^|]+?) \|/gm)].map((m) => [Number(m[1]), m[2]]);
  assert.equal(rows.length, LABELS.length);
  for (const [n, name] of rows) {
    assert.deepEqual([...pick(name).gates], [n], name);
    assert.deepEqual([...pick(String(n)).gates], [n]);
  }
  assert.deepEqual(pick('a').unknown, ['a']);   // too short to be a name
});

test('what ran, in words; the help names every gate', () => {
  assert.equal(onlyWords(pick('3'), LABELS), '[3] Token values');
  assert.equal(onlyWords(pick('accessibility'), LABELS), 'the accessibility check');
  assert.equal(onlyWords(pick('parity', 'accessibility'), LABELS), 'the Figma checks (gates 1 to 25) and the accessibility check');
  const help = onlyHelp(['banana'], LABELS);
  assert.match(help, /^Not a check this engine has: banana\./);
  assert.match(help, /accessibility\s+the accessibility check alone/);
  assert.match(help, /\n {2}3 {15}Token values\n/);
  assert.match(help, /NEXT: rms-design-system-engine --only/);
});

test('the router: a part of the run when the person asks for one; notes and how-to questions keep their recipe', () => {
  const st = { hasConfig: true, components: ['button', 'chip'], cmd: 'rms-design-system-engine' };
  const run = (t) => route(t, st).run.join(' ; ');
  assert.equal(run('check only the accessibility of the button'), 'rms-design-system-engine --component button --only accessibility');
  assert.equal(run('is the button accessible?'), 'rms-design-system-engine --component button --only accessibility');
  assert.equal(run('verifica a acessibilidade do chip'), 'rms-design-system-engine --component chip --only accessibility');
  assert.equal(run('run just the parity'), 'rms-design-system-engine --only parity');
  assert.equal(run('check the chip against Figma, without accessibility'), 'rms-design-system-engine --component chip --only parity');
  assert.equal(run('run only the token values gate'), "rms-design-system-engine --only 'token values'");
  assert.equal(run('only gate 13 for the chip'), 'rms-design-system-engine --component chip --only 13');
  assert.equal(run('só os estados do chip'), 'rms-design-system-engine --component chip --only states');
  assert.equal(route('how do I write a note in Figma saying the chip is a toggle, so the parity checks it?', st).recipe, 'a11y-notes');
  assert.equal(route('how do I make the chip accessible?', st).recipe, 'a11y-notes');
  assert.equal(run('accept only the radius of the chip'), 'rms-design-system-engine --component chip --baseline --findings --match radi');   // debt comes first
  assert.equal(onlyPart('so the parity checks it'), null);   // "so" is English, "só" is not
  assert.equal(onlyPart('check the whole design system against Figma'), null);
});

test('the summary of a partial run says what ran, and accessibility on its own is not called parity', () => {
  const gate = { label: 'Token values  (x)', pass: false, lines: ['❌ [sizing/-] radii/chip → --radii-chip'] };
  const one = buildSummary({ verdict: 'failed', gates: [gate], only: { words: '[3] Token values', a11y: null } });
  assert.match(one, /^# Parity result\n\n\*\*Not in parity\.\*\* 1 of 1 gate fails\.\n\nOnly \[3\] Token values ran in this run; nothing else was checked\./);
  const a11y = buildSummary({ verdict: 'pass', gates: [], only: { words: 'the accessibility check', a11y: { static: 1, browser: null } } });
  assert.match(a11y, /^# Accessibility result\n\n\*\*Accessibility checked\.\*\*/);
  assert.match(a11y, /Accessibility: 1 finding from the code, the browser part did not run \(no page or no Chrome\)\./);
  assert.doesNotMatch(buildSummary({ verdict: 'pass', gates: [] }), /Only|ran in this run/);
});

test('on the demo design system: one gate, the accessibility check alone, a word it does not know, and --baseline', { timeout: 600000 }, () => {
  const dir = fixtureProject(join(ENGINE, 'test', 'fixtures', 'demo-ds'), 'only-');
  const audit = (...args) => {
    const r = spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), ...args], { cwd: dir, encoding: 'utf8', env: { ...bareEnv(), NO_COLOR: '1', FORCE_COLOR: '0', CI: '1' }, timeout: 300000 });
    const out = normalise((r.stdout ?? '') + (r.stderr ?? ''), dir);
    return { code: r.status, out, gates: [...out.matchAll(/^(?:✅|❌|⏭|⚠️)\s+\[(\d+)\]/gm)].map((m) => Number(m[1])) };
  };
  const one = audit('--only', '3');
  assert.equal(one.code, 1);
  assert.deepEqual(one.gates, [3]);
  assert.match(one.out, /ONLY: \[3\] Token values/);
  assert.match(one.out, /❌ \[sizing\/-\] radii\/chip → --radii-chip/);
  assert.doesNotMatch(one.out, /♿|🧩|📉/);
  assert.match(one.out, /Only \[3\] Token values ran in this run; nothing else was checked\./);

  const a11y = audit('--only', 'accessibility');
  assert.equal(a11y.code, 0);
  assert.deepEqual(a11y.gates, []);
  assert.match(a11y.out, /ONLY THE ACCESSIBILITY CHECK RAN/);
  assert.match(a11y.out, /♿ Accessibility from the code/);
  assert.doesNotMatch(a11y.out, /GATE SUMMARY|🧩/);

  const parity = audit('--only', 'parity');
  assert.equal(parity.gates.length, 25);
  assert.doesNotMatch(parity.out, /♿/);
  assert.match(parity.out, /🧩 Primitives written by hand/);   // the system's advice is part of the parity

  const unknown = audit('--only', 'banana');
  assert.equal(unknown.code, 2);
  assert.match(unknown.out, /^Not a check this engine has: banana\./m);
  const baseline = audit('--only', '3', '--baseline');
  assert.equal(baseline.code, 2);
  assert.match(baseline.out, /--baseline records the whole run: run it without --only\./);
});

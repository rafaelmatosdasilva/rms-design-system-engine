// The other half of a check tried on purpose: work that is right, written another way than the demo writes it. Every
// check is already shown to catch a mistake (planted-faults.test.mjs); a check that also refuses legal work is the
// worse fault, because the answer to it is to fix the check, never to bend the work. Each case below is run on a copy
// of the demo design system, set up as its planted fault is, once as the demo writes it and once rewritten another
// legal way (a colour as rgb(), a hover guarded, a transition in longhands, a shadow with its zeros left out), and the
// check must say the same of both: the rewrite named nowhere, the check's status unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';
import { bareEnv, fixtureProject, normalise, budget } from './helpers.mjs';

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = join(ENGINE, 'test', 'fixtures', 'demo-ds');

const gates = (out) => Object.fromEntries([...out.matchAll(/^\s+(✅|❌|⏭|⚠️)\s+\[(\d+)\]\s+(.+?)\s{2,}(\S.*)$/gm)].map((m) => [Number(m[2]), m[4].trim()]));
const section = (out, n) => { const a = out.indexOf(`  [${n}] `); const b = out.indexOf(`  [${n + 1}] `, a + 1); return a < 0 ? '' : out.slice(a, b < 0 ? a + 3000 : b); };
const edit = (dir, file, fn) => { const p = join(dir, file); writeFileSync(p, fn(readFileSync(p, 'utf8'))); };
const put = (dir, file, text) => { mkdirSync(dirname(join(dir, file)), { recursive: true }); writeFileSync(join(dir, file), text); };
const config = (dir, fn) => edit(dir, 'ds-config.json', (t) => JSON.stringify(fn(JSON.parse(t)), null, 2));
const contract = (dir, code) => edit(dir, 'structure-contract.mjs', (t) => `${t}\n${code}\n`);
const css = (dir, from, to) => edit(dir, 'src/theme.css', (t) => { assert.ok(t.includes(from), `the theme holds ${from}`); return t.replace(from, to); });
const commit = (dir) => { execFileSync('git', ['add', '-A'], { cwd: dir }); execFileSync('git', ['-c', 'user.name=d', '-c', 'user.email=d@e', 'commit', '-qm', 'x', '--allow-empty'], { cwd: dir }); };
const audit = (dir) => {
  const r = spawnSync(process.execPath, [join(ENGINE, 'lib', 'audit.mjs')], { cwd: dir, encoding: 'utf8', env: { ...bareEnv(), NO_COLOR: '1', FORCE_COLOR: '0', CI: '1' }, timeout: budget(300000) });
  const out = normalise((r.stdout ?? '') + (r.stderr ?? ''), dir);
  return { out, gates: gates(out) };
};
function rewrite({ setup = null, legal }) {
  const dir = fixtureProject(FIXTURE, 'legal-');
  if (setup) setup(dir);
  commit(dir);
  audit(dir);
  commit(dir);
  const before = audit(dir);
  legal(dir);
  commit(dir);
  return { before, after: audit(dir) };
}

// gate → { what (the legal rewrite), setup (as its planted fault's), legal, names (what must not be named after it) }
const CASES = {
  3: { what: 'a token\'s colour written as rgb()', legal: (d) => css(d, '--button-background: #1f5fd6;', '--button-background: rgb(31, 95, 214);'), names: /button\/background/ },
  5: { what: 'a dark value in upper-case hex', legal: (d) => css(d, '--button-background: #5b8def;', '--button-background: #5B8DEF;'), names: /button\/background/ },
  7: { what: 'a component\'s private variable made of a token', legal: (d) => css(d, 'padding: var(--padding-xs) var(--padding-s);\n  border: 0; border-radius: var(--radii-chip);', '--_chip-pad: var(--padding-s);\n  padding: var(--padding-xs) var(--_chip-pad);\n  border: 0; border-radius: var(--radii-chip);'), names: /--_chip-pad/ },
  9: { what: 'a text case set back to none', legal: (d) => css(d, '.tp-chip .tp-chip__label { white-space: nowrap; }', '.tp-chip .tp-chip__label { white-space: nowrap; text-transform: none; }'), names: /text-transform|tp-chip__label/ },
  11: { what: 'a token used with a fallback', legal: (d) => css(d, 'background: var(--chip-background); color: var(--chip-text);', 'background: var(--chip-background); color: var(--chip-text, #1b2433);'), names: /--chip-text|#1b2433/ },
  12: { what: 'a component styling its own element by its own class', legal: (d) => edit(d, 'src/theme.css', (t) => `${t}\n.tp-field > .tp-field__input { min-width: 0; }\n`), names: /tp-field__input/ },
  13: { what: 'no border written as none', legal: (d) => css(d, 'border: 0; border-radius: var(--radii-chip);', 'border: none; border-radius: var(--radii-chip);'), names: /chip/ },
  14: { what: 'a hover guarded so a disabled button does not react', legal: (d) => css(d, '.tp-button:hover { background: var(--button-background-hover); }', '.tp-button:hover:not(:disabled) { background: var(--button-background-hover); }'), names: /hover/i },
  15: { what: 'a component\'s props in another order', legal: (d) => edit(d, 'src/components/Chip.jsx', (t) => t.replace("Chip({ label = 'Filter', size = 'M', icon = false, onClick })", "Chip({ onClick, icon = false, size = 'M', label = 'Filter' })")), names: /chip: Figma property "(Label|Size|Icon)"/ },
  20: { what: 'a pseudo-element drawn with no words', legal: (d) => edit(d, 'src/theme.css', (t) => `${t}\n.tp-chip__label::after { content: ''; display: block; }\n`), names: /tp-chip__label::after/ },
  21: { what: 'a transition written in longhands, its time in seconds',
    setup: (d) => { contract(d, "export const TRANSITION_CONTRACT = { '.tp-button': 'background 150ms ease' };"); css(d, 'background: var(--button-background); color: var(--button-text);', 'background: var(--button-background); color: var(--button-text);\n  transition: background 150ms ease;'); },
    legal: (d) => css(d, 'transition: background 150ms ease;', 'transition-property: background; transition-duration: 0.15s; transition-timing-function: ease;'), names: /\.tp-button: missing/ },
  22: { what: 'a motion time in seconds',
    setup: (d) => { config(d, (c) => ({ ...c, figma: { ...c.figma, motion: { explicit: { 'motion/duration/fast': '--motion-duration-fast' } } } })); edit(d, 'src/figma-vars.snapshot.json', (t) => JSON.stringify({ ...JSON.parse(t), motion: { 'motion/duration/fast': '150ms' } }, null, 2)); css(d, '  --stroke-default: 1px;\n', '  --stroke-default: 1px;\n  --motion-duration-fast: 150ms;\n'); },
    legal: (d) => css(d, '--motion-duration-fast: 150ms;', '--motion-duration-fast: 0.15s;'), names: /motion\/duration\/fast/ },
  23: { what: 'a shadow with its zeros and spaces left out',
    setup: (d) => { config(d, (c) => ({ ...c, figma: { ...c.figma, effects: { explicit: { 'elevation/1': '--elevation-1' } } } })); edit(d, 'src/figma-vars.snapshot.json', (t) => JSON.stringify({ ...JSON.parse(t), effects: { 'elevation/1': '0px 1px 2px 0px rgba(0, 0, 0, 0.2)' } }, null, 2)); css(d, '  --stroke-default: 1px;\n', '  --stroke-default: 1px;\n  --elevation-1: 0px 1px 2px 0px rgba(0, 0, 0, 0.2);\n'); },
    legal: (d) => css(d, '--elevation-1: 0px 1px 2px 0px rgba(0, 0, 0, 0.2);', '--elevation-1: 0 1px 2px rgba(0,0,0,.2);'), names: /elevation\/1/ },
};

for (const [n, c] of Object.entries(CASES)) {
  const g = Number(n);
  test(`[${g}] passes ${c.what}`, { timeout: budget(120000) }, () => {
    const { before, after } = rewrite(c);
    assert.ok(before.gates[g], `the check ran:\n${before.out.slice(0, 600)}`);
    assert.equal(after.gates[g], before.gates[g], `the same verdict on legal work written another way:\n${section(after.out, g)}`);
    // What the check named before (the demo's own differences) it may name again; never something new for the rewrite.
    const had = (section(before.out, g).match(new RegExp(c.names.source, 'gi')) ?? []).length;
    assert.ok((section(after.out, g).match(new RegExp(c.names.source, 'gi')) ?? []).length <= had, `and the rewrite named nowhere:\n${section(after.out, g)}`);
  });
}

// A component asked for that the system does not have (E24): the router scopes to it even before any snapshot names a
// component, and the scoped run says nothing about it was checked, never a pass. A component only the code has is
// known to the router too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { route, guessedComponents, withCodeNames } from '../route.mjs';
import { nextStep, buildSummary } from '../next-step.mjs';
import { fixtureProject } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));

test('the router scopes to a component the code has and Figma does not, and to a name written as one before any is known', () => {
  assert.deepEqual(withCodeNames(['button', 'badge'], () => [{ name: 'HbBadge', cls: 'hb-badge' }, { name: 'HbChip', cls: 'hb-chip' }, { name: 'Button', cls: 'tp-button' }]), ['button', 'badge', 'HbChip']);
  assert.deepEqual(guessedComponents("check buttonPrimary's accessibility on GitHub"), ['buttonPrimary']);
  assert.deepEqual(guessedComponents('audit the card component'), ['card']);
  assert.deepEqual(guessedComponents('check the whole component'), []);
  assert.deepEqual(route('audit the card component', { components: [] }).run, ['rms-design-system-engine --component card']);
  assert.deepEqual(route('raise maxSnapshotAgeDays so it goes green', { components: ['button'] }).run, ['rms-design-system-engine'], 'with components known, a setting is no component');
});

test('nothing checked for a name that is no component: said in the summary and the NEXT line, never parity', () => {
  assert.match(nextStep({ scope: ['buttonTertiary'], foundNowhere: ['buttonTertiary'] }), /^NEXT: tell the person nothing was checked for buttonTertiary: it is in neither the Figma data nor the code\. Ask which component they mean/);
  const all = buildSummary({ verdict: 'pass', gates: [], scope: ['buttonTertiary'], foundNowhere: ['buttonTertiary'] });
  assert.match(all, /\*\*Nothing checked\.\*\* buttonTertiary is in neither the Figma data nor the code\./);
  assert.doesNotMatch(all, /In parity/);
  assert.match(buildSummary({ verdict: 'pass', gates: [], scope: ['button', 'nope'], foundNowhere: ['nope'] }), /\*\*In parity\.\*\*[\s\S]*\*\*Nothing checked for nope\*\*: in neither the Figma data nor the code\./);
});

test('a scoped run on the demo system for a component it does not have says nothing was checked', { timeout: 300000 }, () => {
  const dir = fixtureProject(join(ENGINE, 'test', 'fixtures', 'demo-ds'), 'nowhere-');
  const r = spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--component', 'buttonTertiary'], { cwd: dir, encoding: 'utf8', timeout: 250000, env: { ...process.env, NO_COLOR: '1', FIGMA_TOKEN: '', CHROME_PATH: '/nonexistent' } });
  assert.match(r.stdout, /⚠️ {2}buttonTertiary: in neither the Figma data nor the code \(no file named for it, no element with its class\), so nothing about it was checked\./, r.stdout + r.stderr);
  const summary = readFileSync(join(dir, '.design-system-engine-out', 'summary.md'), 'utf8');
  assert.match(summary, /\*\*Nothing checked\.\*\* buttonTertiary is in neither the Figma data nor the code\./);
  assert.match(summary, /\nNEXT: tell the person nothing was checked for buttonTertiary/);
  const ok = spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--component', 'button'], { cwd: dir, encoding: 'utf8', timeout: 250000, env: { ...process.env, NO_COLOR: '1', FIGMA_TOKEN: '', CHROME_PATH: '/nonexistent' } });
  assert.doesNotMatch(ok.stdout, /in neither the Figma data nor the code/, 'a component the system has is checked as before');
});

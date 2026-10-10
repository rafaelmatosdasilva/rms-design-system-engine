// First-time setup: where the code is is asked, never guessed, and nothing is written before it is known. The Figma
// link is optional: without it the code's own checks run and the summary says nothing was compared with Figma.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { nextStep, buildSummary } from '../next-step.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const FIGMA = '--figma-url=https://www.figma.com/design/AbCdEf123456XyZ/X';
const engine = (dir, ...args) => spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', DESIGN_SYSTEM_ENGINE_NO_AUTO_UPDATE: '1' } });
const init = (dir, ...args) => engine(dir, '--init', '--no-hooks', ...args);

// A folder of other code: a plugin's page with its own styles, no stylesheet of design tokens.
function otherCode() {
  const dir = mkdtempSync(join(tmpdir(), 'setup-other-'));
  mkdirSync(join(dir, 'plugin'));
  writeFileSync(join(dir, 'plugin', 'ui.src.html'), '<html><style>.a { color: red; }</style><body></body></html>');
  return dir;
}

test('in a folder of other code, setup says what it holds and asks where the code is; it writes nothing', { timeout: 120000 }, () => {
  const dir = otherCode();
  const r = init(dir, FIGMA);
  assert.equal(r.status, 2);
  assert.match(r.stdout, /has code, but no stylesheet that declares design tokens\./);
  assert.match(r.stdout, /NEXT: ask the person where the design system's code is/);
  assert.deepEqual(readdirSync(dir), ['plugin'], 'nothing written');
  const none = init(dir);
  assert.equal(none.status, 2, 'with no answer at all, and no terminal to ask in, it stops too');
  assert.match(none.stdout, /and, if they have one, the link to its Figma file \(optional\)/);
});

test('told the code is here, a folder with no design tokens starts from Figma, and says why', { timeout: 120000 }, () => {
  const dir = otherCode();
  const r = init(dir, FIGMA, '--project=.');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Build mode: no stylesheet declares design tokens in .*, so it starts from Figma/);
  assert.equal(JSON.parse(readFileSync(join(dir, 'ds-config.json'), 'utf8')).build, true);
});

test('with no Figma link, there must be design tokens to check; building needs the Figma file', { timeout: 120000 }, () => {
  const dir = otherCode();
  const r = init(dir, '--project=.');
  assert.equal(r.status, 2);
  assert.match(r.stdout, /No stylesheet that declares design tokens in .*, and no Figma file to build them from\. Nothing was written\./);
  const b = init(dir, '--project=.', '--build');
  assert.equal(b.status, 2);
  assert.match(b.stdout, /Building from Figma needs the Figma file\. Nothing was written\./);
  assert.ok(!existsSync(join(dir, 'ds-config.json')));
});

test('set up without Figma, only the code is checked and the summary says nothing was compared with Figma', { timeout: 300000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'setup-nofigma-'));
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'theme.css'), ':root { --text: #111; }\nbody { color: var(--text); }\n');
  const r = init(dir, '--project=.');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /No Figma file: the checks of the code alone run; the checks against Figma wait until its link is added/);
  assert.equal(JSON.parse(readFileSync(join(dir, 'ds-config.json'), 'utf8')).figmaFileKey, '');
  const run = engine(dir);
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /Only the accessibility check ran: there is no Figma file yet \(figmaFileKey in ds-config\.json\), so nothing was compared with Figma\./);
  assert.doesNotMatch(run.stdout, /Parity holds|refresh-figma/);
});

test('the NEXT line never claims parity when there was no Figma to compare with', () => {
  assert.match(nextStep({ noFigma: true }), /^NEXT: nothing to do in the code\. To compare it with Figma, ask the person for the link/);
  assert.equal(nextStep({}), 'NEXT: nothing to do. Parity holds for what was checked.');
  const s = buildSummary({ verdict: 'pass', gates: [], next: 'NEXT: x', only: { words: 'the accessibility check', noFigma: true, a11y: { static: 0, browser: null } } });
  assert.match(s, /there is no Figma file yet/);
});

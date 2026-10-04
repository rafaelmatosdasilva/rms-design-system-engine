// The "Figma changed" task's scorer: the designer changed the chip's background (light and dark) and its radius. An
// update with every mode passes; one with the light values only (all the Figma MCP shows) fails on dark only; an
// untouched project fails both; one that moves another token fails on that.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { findChrome } from '../cdp.mjs';
import { BUILD, TIDEPOOL } from './skill-evals/build-tasks.mjs';

const CHROME = findChrome({ playwright: true });
const task = BUILD.find((t) => t.id === 'update-chip');

function project(edit = (css) => css) {
  const dir = mkdtempSync(join(tmpdir(), 'update-chip-'));
  cpSync(TIDEPOOL, dir, { recursive: true });
  task.setup(dir);
  const f = join(dir, 'src/styles/tokens.css');
  writeFileSync(f, edit(readFileSync(f, 'utf8')));
  return { dir, changed: ['src/styles/tokens.css'], read: (p) => (existsSync(join(dir, p)) ? readFileSync(join(dir, p), 'utf8') : null), final: '' };
}
const failing = async (edit) => (await task.score(project(edit))).filter((c) => !c.ok).map((c) => c.name);
const light = (css) => css.replace('--chip-background: #e8eef9', '--chip-background: #dfe7f7').replace('--radii-chip: 16px', '--radii-chip: 12px');
const dark = (css) => css.replace('--chip-background: #243049', '--chip-background: #2d3b5c');

test('update-chip: every mode passes, light only fails on dark, untouched fails both, another token moved is named', { skip: CHROME ? false : 'no Chrome available', timeout: 300000 }, async () => {
  assert.deepEqual(await failing((c) => dark(light(c))), []);
  assert.deepEqual(await failing(light), ['the new dark background is in the tokens (chip/background, dark: #2d3b5c)', 'dark matches Figma']);
  assert.deepEqual(await failing((c) => c), ['the new light background and radius are in the tokens (chip/background #dfe7f7, radii/chip 12px)', 'the new dark background is in the tokens (chip/background, dark: #2d3b5c)', 'light matches Figma', 'dark matches Figma']);
  assert.deepEqual(await failing((c) => dark(light(c)).replace('--chip-text: #1b2433', '--chip-text: #000000')), ['no other token moved', 'light matches Figma']);
});

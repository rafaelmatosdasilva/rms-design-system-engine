// The stepper build task's scorer: the reference passes; a stepper whose buttons are only drawn glyphs with no spoken
// name, that has no spinbutton and goes below 0, fails on those points only. Rendered in Chrome with the scorer's React stand-in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { findChrome } from '../cdp.mjs';
import { BUILD } from './skill-evals/build-tasks.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REF = join(HERE, 'skill-evals', 'build-reference');
const CHROME = findChrome({ playwright: true });
const task = BUILD.find((t) => t.id === 'build-stepper');

function project(jsx, css = readFileSync(join(REF, 'src/components/stepper.css'), 'utf8')) {
  const dir = mkdtempSync(join(tmpdir(), 'stepper-'));
  cpSync(join(REF, 'src/styles'), join(dir, 'src/styles'), { recursive: true });
  mkdirSync(join(dir, 'src/components'), { recursive: true });
  writeFileSync(join(dir, 'src/components/Stepper.jsx'), jsx);
  writeFileSync(join(dir, 'src/components/stepper.css'), css);
  const changed = ['src/components/Stepper.jsx', 'src/components/stepper.css'];
  return { dir, changed, read: (p) => (existsSync(join(dir, p)) ? readFileSync(join(dir, p), 'utf8') : null), final: '' };
}
const failing = (checks) => checks.filter((c) => !c.ok).map((c) => c.name);

test('the reference stepper passes every check: its range, the names of its buttons, a click on each, its floor and ArrowUp', { skip: CHROME ? false : 'no Chrome available', timeout: 120000 }, async () => {
  const checks = await task.score(project(readFileSync(join(REF, 'src/components/Stepper.jsx'), 'utf8')));
  assert.deepEqual(failing(checks), [], JSON.stringify(checks.filter((c) => !c.ok)));
  assert.match(checks.find((c) => c.name.startsWith('a click on Increment')).detail, /^from 1: up 2, down 1$/, 'its own state, kept between renders');
});

test('one whose buttons have no spoken name, with no spinbutton and no floor, fails on those points only', { skip: CHROME ? false : 'no Chrome available', timeout: 120000 }, async () => {
  const jsx = `import { useState } from 'react';
import './stepper.css';
export function Stepper({ Value = '1' }) {
  const [v, setV] = useState(Number(Value));
  return (<div className="stepper"><button type="button" className="stepper__step" onClick={() => setV(v - 1)}><svg width="12" height="12"><rect x="1" y="5" width="10" height="2" /></svg></button><span className="stepper__value">{v}</span><button type="button" className="stepper__step" onClick={() => setV(v + 1)}><svg width="12" height="12"><rect x="1" y="5" width="10" height="2" /><rect x="5" y="1" width="2" height="10" /></svg></button></div>);
}`;
  const f = failing(await task.score(project(jsx)));
  assert.deepEqual(f, ['the value is a spinbutton with its range (Figma role: spinbutton, from 0 to 10)', 'the spinbutton can have an accessible name', 'the step buttons have spoken names (Figma: Decrement and Increment, roles decrement and increment)', 'it stays within 0 to 10 (Decrement stops at 0)', 'ArrowUp steps the spinbutton up']);
});

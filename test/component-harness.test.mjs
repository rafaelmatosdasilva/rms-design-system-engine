// component-harness.mjs: a React design system's components rendered from their own code, so the accessibility check
// tries them in the browser without a dev server (build mode, or no page to open).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { harnessCases, propsOf, pageColours, loadTypeScript } from '../component-harness.mjs';
import { findChrome } from '../cdp.mjs';

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const TIDEPOOL = join(ENGINE, 'test', 'fixtures', 'tidepool-figma');
const REF = join(ENGINE, 'test', 'skill-evals', 'build-reference');
const CHROME = findChrome({ playwright: true });

test('each component in its Figma variants: the default, each other value, each switch flipped; interaction states are left to the browser', () => {
  const entry = { properties: { 'Label#1:0': { type: 'TEXT', defaultValue: 'Save' }, State: { type: 'VARIANT', defaultValue: 'Default', variantOptions: ['Default', 'Hover', 'Error'] }, Disabled: { type: 'VARIANT', defaultValue: 'False', variantOptions: ['False', 'True'] }, 'Icon#1:2': { type: 'BOOLEAN', defaultValue: false } } };
  const cases = harnessCases(entry);
  assert.deepEqual(cases.map((c) => c.label), ['default', 'State=Error', 'Disabled=True', 'Icon=true']);
  assert.deepEqual(cases[0].props, { Label: 'Save', label: 'Save', State: 'Default', state: 'Default', Disabled: false, disabled: false, Icon: false, icon: false });
  assert.deepEqual(propsOf({ 'Show Icon': 'True' }), { 'Show Icon': true, showIcon: true });
});

test('the page sits on the system\'s own surface and text colour when its CSS names them', () => {
  assert.deepEqual(pageColours(':root { --surface-page: #fff; --text-primary: #111; --chip-background: #eee; }'), { surface: '--surface-page', ink: '--text-primary' });
  assert.deepEqual(pageColours(':root { --bg: #fff; --fg: #000; }'), { surface: '--bg', ink: '--fg' });
  assert.deepEqual(pageColours(':root { --chip-background: #eee; }'), { surface: null, ink: null });
});

const tidepool = (stepper = null) => {
  const dir = mkdtempSync(join(tmpdir(), 'harness-'));
  cpSync(TIDEPOOL, dir, { recursive: true });
  cpSync(join(REF, 'src'), join(dir, 'src'), { recursive: true });
  if (stepper) writeFileSync(join(dir, 'src/components/Stepper.jsx'), stepper);
  return dir;
};
const check = (dir) => {
  let out = '';
  try { out = execFileSync(process.execPath, [join(ENGINE, 'a11y-check.mjs'), '--json'], { cwd: dir, encoding: 'utf8', timeout: 200000, env: { ...process.env, CHROME_PATH: CHROME } }); } catch (e) { out = e.stdout ?? ''; }
  return JSON.parse(out.slice(out.indexOf('{')));
};
const ready = CHROME && loadTypeScript(ENGINE) ? false : 'no Chrome or no TypeScript available';

test('build mode: the reference components, rendered from their code, show only what the design itself lacks (an error shown by colour alone)', { skip: ready, timeout: 300000 }, () => {
  const d = check(tidepool());
  assert.match(String(d.target), /rendered from their code/);
  assert.deepEqual(d.issues.map((i) => `${i.issue} ${i.selector}`), ['rolecontract field (textbox): in its error state the error is shown only by its look: there is no message to read (WCAG 3.3.1). The design needs an error message part, linked to the field with aria-describedby (send it back to Figma)'], JSON.stringify({ issues: d.issues, notRead: d.notRead }));
});

test('build mode: a stepper with nameless step buttons and no keys is caught on its own code', { skip: ready, timeout: 300000 }, () => {
  const bad = `import { useState } from 'react';
import './stepper.css';
export function Stepper({ Value = '1' }) {
  const [v, setV] = useState(Number(Value));
  return (<div className="stepper"><button type="button" className="stepper__step" onClick={() => setV(v - 1)}><svg width="12" height="12"><rect x="1" y="5" width="10" height="2" /></svg></button><span className="stepper__value" role="spinbutton" aria-valuenow={v}>{v}</span><button type="button" className="stepper__step" onClick={() => setV(v + 1)}><svg width="12" height="12"><rect x="5" y="1" width="2" height="10" /></svg></button></div>);
}`;
  const d = check(tidepool(bad));
  const says = d.issues.map((i) => `${i.issue} ${i.selector}`).join('\n');
  assert.match(says, /partrole stepper: its "Decrement" part \(decrement\) has no spoken name/);
  assert.match(says, /partrole stepper: its "Increment" part \(increment\) has no spoken name/);
  assert.match(says, /behaviour stepper: ArrowUp steps it up \(role spinbutton\), but aria-valuenow stayed 1/);
  assert.match(says, /name .*spinbutton/i);
});

test('build mode: a stepper whose Decrement goes below its minimum is caught, and the check after it starts from the same value', { skip: ready, timeout: 300000 }, () => {
  const below = `import { useState } from 'react';
import './stepper.css';
export function Stepper({ Value = '1', ...rest }) {
  const [v, setV] = useState(Number(Value));
  return (<div className="stepper"><button type="button" aria-label="Decrease" className="stepper__step" onClick={() => setV(v - 1)}><svg aria-hidden="true" width="12" height="12"><rect x="1" y="5" width="10" height="2" fill="currentColor" /></svg></button><span className="stepper__value" role="spinbutton" tabIndex={0} aria-label={rest['aria-label']} aria-valuenow={v} aria-valuemin={0} aria-valuemax={10} onKeyDown={(e) => { if (e.key === 'ArrowUp') setV(Math.min(10, v + 1)); }}>{v}</span><button type="button" aria-label="Increase" className="stepper__step" onClick={() => setV(Math.min(10, v + 1))}><svg aria-hidden="true" width="12" height="12"><rect x="5" y="1" width="2" height="10" fill="currentColor" /></svg></button></div>);
}`;
  const says = check(tidepool(below)).issues.filter((i) => /stepper/.test(i.selector)).map((i) => `${i.issue} ${i.selector}`);
  assert.deepEqual(says, ['partrole stepper: its "Decrement" part (decrement) goes past the minimum: pressed from 1, the value reached -3 (aria-valuemin 0). Stop at it, or disable the button there']);
});

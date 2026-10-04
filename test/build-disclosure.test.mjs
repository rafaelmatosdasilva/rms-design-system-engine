// The disclosure build task's scorer: the reference passes; a disclosure that never opens, or one whose chevron is
// heard, does not. Each is rendered in Chrome with the scorer's React stand-in, which keeps state between renders.
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
const task = BUILD.find((t) => t.id === 'build-disclosure');

function project(jsx, css = readFileSync(join(REF, 'src/components/disclosure.css'), 'utf8')) {
  const dir = mkdtempSync(join(tmpdir(), 'disclosure-'));
  cpSync(join(REF, 'src/styles'), join(dir, 'src/styles'), { recursive: true });
  mkdirSync(join(dir, 'src/components'), { recursive: true });
  writeFileSync(join(dir, 'src/components/Disclosure.jsx'), jsx);
  writeFileSync(join(dir, 'src/components/disclosure.css'), css);
  const changed = ['src/components/Disclosure.jsx', 'src/components/disclosure.css'];
  return { dir, changed, read: (p) => (existsSync(join(dir, p)) ? readFileSync(join(dir, p), 'utf8') : null), final: '' };
}
const failing = (checks) => checks.filter((c) => !c.ok).map((c) => c.name);

test('the reference disclosure passes every check, a click opening and closing it', { skip: CHROME ? false : 'no Chrome available', timeout: 120000 }, async () => {
  const checks = await task.score(project(readFileSync(join(REF, 'src/components/Disclosure.jsx'), 'utf8')));
  assert.deepEqual(failing(checks), [], JSON.stringify(checks.filter((c) => !c.ok)));
});

test('one that never opens, with a chevron that is read out, fails on those points only', { skip: CHROME ? false : 'no Chrome available', timeout: 120000 }, async () => {
  const jsx = `import './disclosure.css';
export function Disclosure({ Label = 'Details', Content = 'Shipping takes two business days.', Expanded = false }) {
  return (<div className="disclosure"><button type="button" className="disclosure__trigger" aria-expanded={Expanded ? 'true' : 'false'}><span>{Label}</span><span className="disclosure__chevron">▾</span></button>{Expanded && <div className="disclosure__panel">{Content}</div>}</div>);
}`;
  const f = failing(await task.score(project(jsx)));
  assert.deepEqual(f, ['a click opens it: aria-expanded="true" and the passage shows', 'a second click closes it again', 'aria-controls names the passage it opens (Figma: Panel, role panel)', 'the chevron is silent for screen readers (Figma: Chevron, role indicator)']);
});

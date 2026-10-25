// page-render.mjs: a prototype page in the project's own code drawn at each screen width, its words as written and
// 40% longer. A React page here (the engine's stand-in draws it); a Vue page goes through the project's own build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { findChrome } from '../cdp.mjs';
import { loadTypeScript } from '../component-harness.mjs';
import { stressPage } from '../page-render.mjs';

const CHROME = findChrome({ playwright: true });
const project = (jsx, css = '') => {
  const dir = mkdtempSync(join(tmpdir(), 'page-render-'));
  mkdirSync(join(dir, 'prototypes'), { recursive: true });
  writeFileSync(join(dir, 'prototypes', 'Orders.jsx'), jsx);
  writeFileSync(join(dir, 'prototypes', 'orders.css'), css);
  return dir;
};
const skip = !CHROME ? 'no Chrome available' : !loadTypeScript(process.cwd()) ? 'TypeScript is not installed globally (npm install -g typescript)' : false;

test('a part wider than a phone, and a label cut short, are found with their words', { skip, timeout: 120000 }, async () => {
  const dir = project(`import './orders.css';
export default function Orders() { return (<main><h1>Orders</h1><div className="acme-strip">Open orders this month</div>
  <button className="acme-tab">Recently closed orders</button></main>); }`, '.acme-strip{width:600px}.acme-tab{width:90px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}');
  const r = await stressPage(dir, {}, 'prototypes/Orders.jsx');
  assert.ok(!r.why, r.why);
  assert.deepEqual(r.widths, ['Phone (375px)', 'Tablet (768px)', 'Desktop (1280px)']);
  assert.ok(r.findings.some((f) => f.kind === 'wide' && f.component === '.acme-strip' && f.widths.includes('Phone (375px)')), JSON.stringify(r.findings));
  assert.ok(r.findings.some((f) => f.kind === 'cut' && /Recently closed/.test(f.text)), JSON.stringify(r.findings));
});

test('a page that fits says nothing; one it cannot draw says why', { skip, timeout: 120000 }, async () => {
  const ok = await stressPage(project('export default function Orders() { return (<main><h1>Orders</h1><p>None yet.</p></main>); }'), {}, 'prototypes/Orders.jsx');
  assert.deepEqual(ok.findings, []);
  assert.match((await stressPage(project(''), {}, 'prototypes/Orders.svelte')).why, /not built yet/);
});

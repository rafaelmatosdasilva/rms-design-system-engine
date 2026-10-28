// The Showroom's screens read as pages (showroom-quality.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { showroomQuality, showroomQualityLines, titledHeadings } from '../showroom-quality.mjs';
import { tempDir } from './helpers.mjs';

const DEMO = fileURLToPath(new URL('./fixtures/demo-ds', import.meta.url));
const demoWith = (screens) => {
  const root = tempDir('showroom-quality-');
  cpSync(DEMO, root, { recursive: true });
  mkdirSync(join(root, 'showroom'), { recursive: true });
  for (const [f, text] of Object.entries(screens)) writeFileSync(join(root, 'showroom', f), text);
  return root;
};

test('a Showroom screen is reviewed as a page: what it should not do, with its line, and a score', async () => {
  const root = demoWith({
    'Checkout.jsx': `import { Button } from '../src/components/Button.jsx';
export default function Checkout() {
  return (<main>
    <h1>Checkout</h1>
    <h3>Delivery</h3>
    <Button label="Pay" variant="primary" />
    <Button label="Save for later" variant="primary" />
  </main>);
}
`,
    'Done.jsx': `export default function Done() { return (<main><h1>Thank you</h1><p>Your order is on its way.</p></main>); }\n`,
  });
  const cfg = JSON.parse(readFileSync(join(root, 'ds-config.json'), 'utf8'));
  const rows = await showroomQuality(root, cfg);
  assert.deepEqual(rows.map((r) => r.screen), ['Checkout', 'Done']);
  const co = rows[0];
  assert.ok(co.score < 10, JSON.stringify(co));
  assert.ok(co.findings.some((f) => f.kind === 'heading' && /level 3 follows level 1/.test(f.message)), JSON.stringify(co.findings));
  assert.ok(co.findings.every((f) => f.line > 0), 'each with its line');
  assert.equal(rows[1].findings.length, 0);
  const lines = showroomQualityLines(rows);
  assert.match(lines[0], /^🎨 Showroom screens as pages: 1 of 2 with something a page should not do/);
  assert.match(lines[1], /Checkout \d+\/10 {2}\(showroom\/Checkout\.jsx\)/);
  // No Showroom: nothing said.
  assert.deepEqual(await showroomQuality(tempDir('no-showroom-'), {}), []);
  assert.deepEqual(showroomQualityLines([]), []);
});

test('the system\'s own header with a title is the page\'s heading, and a card with no surface is no card', () => {
  const tree = { children: [
    { name: 'appBar', attrs: {}, children: [] },
    { name: 'headerPage', attrs: { title: 'Orders' }, children: [] },
    { name: 'sectionHeader', attrs: { title: 'Recent' }, children: [] },
    { name: 'cardTile', attrs: {}, children: [{ name: 'cardStat', attrs: { surface: 'none', label: 'x' }, children: [] }] },
  ] };
  titledHeadings(tree);
  assert.equal(tree.children[0].attrs.level, undefined, 'a header with no title is the app\'s bar');
  assert.equal(tree.children[1].attrs.level, '1');
  assert.equal(tree.children[2].attrs.level, '2');
  assert.equal(tree.children[3].children[0].name, null, 'laid out inside the card as any part');
});

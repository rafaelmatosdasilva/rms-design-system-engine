import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WIDTH_FACTS_JS, sameDrawn, sameDrawnLines } from '../lib/width-facts.mjs';
import { findChrome } from '../lib/cdp.mjs';
import { openBrowser } from '../lib/page-driver.mjs';

const CHROME = findChrome();

test('two neighbouring widths drawn the same though different rules hold are listed, and nothing else is', () => {
  const f = (name, px, media, layout, container = 0) => ({ name, px, media, layout, container });
  const same = sameDrawn([f('Desktop', 1280, ['(min-width: 768px)', '(min-width: 1200px)'], 'L1'), f('Phone', 375, [], 'L1'), f('Tablet', 768, ['(min-width: 768px)'], 'L1', 2)]);
  assert.deepEqual(same, [
    { a: 'Phone', b: 'Tablet', rules: ['(min-width: 768px)'], container: 2 },
    { a: 'Tablet', b: 'Desktop', rules: ['(min-width: 1200px)'], container: 2 },
  ]);
  // Laid out differently: the rules did their work. The same rules at both: nothing was meant to change.
  assert.deepEqual(sameDrawn([f('Phone', 375, [], 'L1'), f('Tablet', 768, ['(min-width: 768px)'], 'L2')]), []);
  assert.deepEqual(sameDrawn([f('Phone', 375, [], 'L1'), f('Big phone', 430, [], 'L1')]), []);
  const line = sameDrawnLines(same)[0];
  assert.match(line, /Phone and Tablet are drawn the same, though the CSS has rules for one and not the other \(@media \(min-width: 768px\)\)/);
  assert.match(line, /Its 2 container queries read the box around a part, not the window/);
});

test('in the browser: a rule that changes the page keeps two widths apart, one a stronger rule overrides is said, one for a part not here is not', { skip: !CHROME && 'Chrome not found', timeout: 60000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'width-facts-'));
  const page = (css, body) => { const f = join(dir, `${Math.random().toString(36).slice(2)}.html`); writeFileSync(f, `<!doctype html><style>${css}</style><main id="p">${body}</main>`); return pathToFileURL(f).href; };
  const b = await openBrowser('chrome', CHROME, { driver: 'engine' });
  const at = async (url) => {
    const p = await b.page(url);
    const out = [];
    for (const [name, px] of [['Phone', 375], ['Desktop', 1280]]) { await p.setViewport(px, 900); out.push({ ...(await p.evaluate(WIDTH_FACTS_JS('#p'))), name, px }); }
    await p.close();
    return sameDrawn(out);
  };
  try {
    const card = '<div class="row"><div class="card">A</div><div class="card">B</div></div>';
    // Column on a phone, a row from 768px: drawn apart.
    assert.deepEqual(await at(page('.row{display:flex;flex-direction:column}@media (min-width:768px){.row{flex-direction:row}}', card)), []);
    // A colour from 768px: drawn apart too, though nothing moved.
    assert.deepEqual(await at(page('.card{color:#111}@media (min-width:768px){.card{color:#333}}', card)), []);
    // The wide padding is overridden by a stronger rule written for every width: the same at both, and said.
    const over = await at(page('@media (min-width:768px){.card{padding:32px}} main .row .card{padding:16px}', card));
    assert.equal(over.length, 1);
    assert.deepEqual(over[0].rules, ['(min-width:768px)'].map((r) => r.replace(':', ': ')));
    // A rule for a part this page does not have changes nothing here, and is no finding.
    assert.deepEqual(await at(page('@media (min-width:768px){.not-here{padding:32px}}', card)), []);
  } finally { await b.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }); }
});

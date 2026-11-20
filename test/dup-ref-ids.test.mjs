// An id a label or a reference points at, on more than one element: the reference lands on the first one, which may
// be another copy of the component (the style guide's thumbnail of it). The browser check names it, and the style
// guide gives every copy it draws ids of its own, with what points at them inside it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeFixture, budget } from './helpers.mjs';
import { findChrome } from '../lib/cdp.mjs';
import { dupRefExpression, ID_REF_ATTRS, AXE_SAME } from '../lib/a11y-check.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const CHROME = findChrome({ playwright: true });
const HAS_CHROME = !!CHROME && typeof WebSocket !== 'undefined';
const SKIP = HAS_CHROME ? false : 'no Chrome available';
const js = (f) => readFileSync(join(ENGINE, 'templates', 'styleguide', 'js', f), 'utf8');

async function withPage(html, fn) {
  const { launchChrome, connectCDP, openPage, waitForTrue, FILE_PAGE_LOADED } = await import('../lib/cdp.mjs');
  const dir = makeFixture({ 'p.html': html });
  const c = await launchChrome(CHROME);
  try {
    const { send, close } = await connectCDP(c.wsUrl);
    const { sessionId } = await openPage(send, pathToFileURL(join(dir, 'p.html')).href);
    await waitForTrue(send, sessionId, FILE_PAGE_LOADED);
    const ev = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true }, sessionId)).result.value;
    try { return await fn(ev); } finally { close(); }
  } finally { c.kill(); }
}

test('the check covers what a label, a table cell and an input point at, beside aria (axe-core looks at aria only)', () => {
  for (const a of ['for', 'headers', 'list', 'aria-labelledby', 'aria-describedby']) assert.ok(ID_REF_ATTRS.includes(a), a);
  assert.deepEqual(AXE_SAME['duplicate-id-aria'], ['dupid'], 'an element both report is said once, by the engine');
});

test('a label whose id is also on a copy earlier in the page: named, with the copy it lands on', { skip: SKIP, timeout: budget(60000) }, async () => {
  const out = await withPage(`<!doctype html><html lang="en"><body>
    <section id="index"><div class="thumb"><input type="checkbox" id="box-1" class="box"><label for="box-1">Label</label></div></section>
    <section id="c-check"><div class="pg-preview">
      <input type="checkbox" id="box-1" class="box"><label for="box-1">Label</label>
      <input id="ok" aria-describedby="hint"><p id="hint">Unique</p>
      <span id="name-a">Name</span><button aria-labelledby="name-a">x</button>
    </div></section>
    <span id="name-a">Elsewhere</span>
  </body></html>`, (ev) => ev(dupRefExpression(null, '.pg-preview')));
  assert.equal(out.length, 2, out.join('\n'));
  assert.match(out[0], /^input#box-1\.box \(its id is on 2 elements: label "Label" \[for\] points at another one, outside this component\)$/);
  assert.match(out[1], /^span#name-a \(its id is on 2 elements: button "x" \[aria-labelledby\] points at this one only because it comes first\)$/);
});

test('ids used once, or used twice where nothing points at them: nothing to say', { skip: SKIP, timeout: budget(60000) }, async () => {
  const out = await withPage(`<!doctype html><html lang="en"><body><div class="pg-preview">
    <input id="a"><label for="a">A</label><svg><g id="icon"></g></svg><svg><g id="icon"></g></svg>
  </div></body></html>`, (ev) => ev(dupRefExpression(null, '.pg-preview')));
  assert.deepEqual(out, []);
});

test('style guide: a thumbnail is drawn with ids of its own, and what points at them inside it follows', { skip: SKIP, timeout: budget(60000) }, async () => {
  assert.match(js('06-overview.js'), /var k = src\.cloneNode\(true\); uniqueIds\(k\);/, 'the overview\'s copy of a preview');
  const src = js('18-component-playground.js');
  const fn = src.slice(src.indexOf('  var ID_N = 0'), src.indexOf('\n  }\n', src.indexOf('function uniqueIds')) + 4);
  const r = await withPage(`<!doctype html><html lang="en"><body>
    <div id="thumb"></div>
    <div id="preview"><input type="checkbox" id="b1"><label for="b1">Label</label>
      <svg><defs><clipPath id="cl"><rect width="4" height="4"/></clipPath><linearGradient id="gr"></linearGradient></defs>
      <g id="ic" clip-path="url(#cl)" fill="url('#gr')" style="mask: url(#cl)"></g><use href="#ic"/><use href="#sprite-icon"/></svg></div>
    <script>${fn}
      var k = document.getElementById('preview').cloneNode(true); uniqueIds(k); document.getElementById('thumb').appendChild(k);
    </script></body></html>`, (ev) => ev(`(() => { const t = document.getElementById('thumb'); const ids = [...document.querySelectorAll('[id]')].map((e) => e.id);
      const at = (s, a) => t.querySelector(s).getAttribute(a);
      return { dup: ids.filter((x, i) => ids.indexOf(x) !== i), forOk: !!t.querySelector('#' + at('label', 'for')),
        clip: at('g', 'clip-path'), fill: at('g', 'fill'), style: at('g', 'style'), use: [...t.querySelectorAll('use')].map((u) => u.getAttribute('href')), ownG: t.querySelector('g').id }; })()`));
  assert.deepEqual(r.dup, [], 'no id is on two elements');
  assert.ok(r.forOk, 'the label points inside its own copy');
  assert.equal(r.clip, 'url(#cl-sg1)');
  assert.equal(r.fill, "url('#gr-sg1')");
  assert.equal(r.style, 'mask: url(#cl-sg1)');
  assert.deepEqual(r.use, ['#' + r.ownG, '#sprite-icon'], 'a reference to the page\'s own sprite stays as it was');
});

// The accessibility criteria a browser decides, tried in Firefox and WebKit as well as Chrome (a11y-browsers.mjs):
// the same measurements and real Tab presses in each, and only what differs from Chrome said. A page with a fault
// only Firefox draws (a focus ring it alone removes) is the case the pass exists for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFileSync, rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { makeFixture, budget } from './helpers.mjs';
import { PASS, compare, browserRows, browserLine, onlyLine, differByBrowser, a11yBrowsers } from '../lib/a11y-browsers.mjs';
import { keyActions, openBrowser } from '../lib/page-driver.mjs';
import { browsersHere, triedIn, BROWSER_RUN_LINE } from '../lib/browsers.mjs';
import { WCAG22, WCAG_KIND } from '../lib/wcag21.mjs';

const HERE = browsersHere();

test('the pass answers only criteria a browser decides, each by its own kind of finding', () => {
  for (const [sc, p] of Object.entries(PASS)) {
    assert.equal(WCAG22.find((c) => c.sc === sc)?.browser, 'each', sc);
    for (const k of p.kinds) assert.equal(WCAG_KIND[k], sc, k);
  }
  assert.deepEqual(Object.keys(PASS), ['1.4.4', '1.4.10', '1.4.12', '2.1.1', '2.4.7', '2.5.8']);
});

test('a key press is a real one, with its modifiers held around it', () => {
  const [a] = keyActions('Tab', { alt: true });
  assert.equal(a.type, 'key');
  assert.deepEqual(a.actions.map((x) => x.type), ['keyDown', 'keyDown', 'keyUp', 'keyUp']);
  assert.equal(a.actions[0].value, '');   // Option held first
  assert.equal(a.actions[1].value, '');   // then Tab
  assert.equal(keyActions('Tab')[0].actions.length, 2);
});

test('only what differs from Chrome is said, with the browsers it fails in, and the row keeps the worst', () => {
  const f = (kind, desc) => ({ kind, sc: WCAG_KIND[kind], desc });
  assert.deepEqual(compare([f('focus', 'button.a')], [f('focus', 'button.a'), f('focus', 'button.b')]).only, [f('focus', 'button.b')]);
  assert.deepEqual(compare([f('focus', 'button.a')], []).passes, [f('focus', 'button.a')]);
  const run = { browsers: [{ label: 'Chrome' }, { label: 'Firefox' }, { label: 'WebKit', altTab: true }], components: {
    menu: { Chrome: [f('target', 'button.x')], Firefox: [f('target', 'button.x'), f('focus', 'button.ring')], WebKit: [f('target', 'button.x'), f('focus', 'button.ring')] },
  } };
  const rows = browserRows(run, 'menu');
  assert.equal(browserLine(rows['2.4.7']), 'Chrome ✓ · Firefox ✕ · WebKit ✕');
  assert.equal(browserLine(rows['2.5.8']), 'Chrome ✕ · Firefox ✕ · WebKit ✕');
  assert.deepEqual(rows['2.5.8'].only, [], 'a fault Chrome has too is said once, by the run in Chrome');
  assert.deepEqual(rows['2.4.7'].only, [{ desc: 'button.ring', browsers: ['Firefox', 'WebKit'] }]);
  assert.equal(onlyLine('2.4.7', rows['2.4.7'].only[0]), 'Fails in Firefox and WebKit only: no visible focus when Tab reaches it, button.ring');
  assert.deepEqual(differByBrowser(run), ['2.4.7']);
  assert.deepEqual(browserRows(run, 'other'), {});
});

test('what a row and a run say when no other browser tried it', () => {
  assert.match(triedIn({ browser: 'each', pass: true }), /^Tried in Chrome\. This is one a browser decides: Firefox and WebKit try it/);
  assert.match(triedIn({ browser: 'each' }), /^Tried in Chrome alone\. .* the pass in them does not try it yet\.$/);
  assert.match(BROWSER_RUN_LINE, /answered for Chrome alone this run/);
  assert.doesNotMatch(BROWSER_RUN_LINE, /\/|installed|\bhere\b/);
});

const PAGE = `<!doctype html><html><head><style>
  .ok:focus-visible { outline: 2px solid blue; }
  .gone { outline: none; } .gone:focus { outline: none; }
  .ff:focus-visible { outline: 2px solid blue; }
  /* Only Firefox reads this: the ring is taken away there alone. */
  @supports (-moz-appearance: none) { .ff:focus-visible { outline: none; } }
  .tiny { width: 12px; height: 12px; padding: 0; border: 0; }
</style></head><body><nav>${'<a href="#n">A link of the page</a> '.repeat(60)}</nav><section id="c-demo"><div class="pg-preview">
  <button class="ok">Fine</button>
  <button class="gone">No ring anywhere</button>
  <button class="ff">No ring in Firefox</button>
  <button class="tiny" aria-label="x"></button><button class="tiny" aria-label="y"></button>
  <a href="#z" class="ok">Link</a>
</div></section></body></html>`;

test('in Chrome and Firefox: real Tab presses, and a focus ring Firefox alone takes away is said as Firefox\'s', { skip: !(HERE.chrome && HERE.firefox) && 'Chrome and Firefox are both needed', timeout: budget(180000) }, async () => {
  const dir = makeFixture({});
  const page = join(dir, 'page.html');
  writeFileSync(page, PAGE);
  try {
    const run = await a11yBrowsers({ url: () => pathToFileURL(page).href, components: ['demo'], browsers: [{ name: 'chrome', path: HERE.chrome }, { name: 'firefox', path: HERE.firefox }], open: openBrowser, rootOf: (n) => `#c-${n} .pg-preview` });
    assert.deepEqual(run.refused, []);
    const kinds = (l) => run.components.demo[l].map((f) => `${f.kind} ${f.desc}`).sort();
    // The same in both: a ring removed everywhere, the targets too small. Every control reached by Tab, though the
    // page's own sixty links come first: the walk starts at the components.
    for (const l of ['Chrome', 'Firefox']) {
      assert.ok(kinds(l).includes('focus button.gone'), `${l}: ${kinds(l)}`);
      assert.ok(kinds(l).some((k) => k.startsWith('target button.tiny')), `${l}: ${kinds(l)}`);
      assert.ok(!kinds(l).some((k) => k.startsWith('keyboard')), `${l}: ${kinds(l)}`);
    }
    // Only Firefox loses the ring on .ff, and that is the one line said.
    assert.ok(!kinds('Chrome').includes('focus button.ff'), kinds('Chrome'));
    assert.ok(kinds('Firefox').includes('focus button.ff'), kinds('Firefox'));
    const rows = browserRows(run, 'demo');
    assert.equal(browserLine(rows['2.4.7']), 'Chrome ✕ · Firefox ✕');
    assert.deepEqual(rows['2.4.7'].only, [{ desc: 'button.ff', browsers: ['Firefox'] }]);
    assert.deepEqual(differByBrowser(run), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

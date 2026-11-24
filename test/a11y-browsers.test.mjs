// The accessibility criteria a browser decides, tried in Firefox and WebKit as well as Chrome (a11y-browsers.mjs):
// the same measurements and real Tab presses in each, and only what differs from Chrome said. A page with a fault
// only Firefox draws (a focus ring it alone removes) is the case the pass exists for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFileSync, rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { makeFixture, budget } from './helpers.mjs';
import { PASS, compare, browserRows, browserLine, onlyLine, differByBrowser, a11yBrowsers, shortVersion, browserName } from '../lib/a11y-browsers.mjs';
import { keyActions, openBrowser } from '../lib/page-driver.mjs';
import { browsersHere, triedIn, BROWSER_RUN_LINE } from '../lib/browsers.mjs';
import { WCAG22, WCAG_KIND } from '../lib/wcag21.mjs';

const HERE = browsersHere();

test('the pass answers only criteria a browser decides, each by its own kind of finding', () => {
  for (const [sc, p] of Object.entries(PASS)) {
    assert.equal(WCAG22.find((c) => c.sc === sc)?.browser, 'each', sc);
    for (const k of p.kinds) assert.equal(WCAG_KIND[k], sc, k);
  }
  assert.deepEqual(Object.keys(PASS), ['1.4.4', '1.4.10', '1.4.12', '2.1.1', '2.4.7', '2.5.8', '2.1.2', '2.4.3', '2.4.11', '1.4.13', '2.5.2', '2.5.7', '3.2.1', '3.2.2', '3.3.8']);
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

test('each browser is named with the version it was, and a run saved without versions names it alone', () => {
  assert.equal(shortVersion('131.0.6778.85'), '131');
  assert.equal(shortVersion('133.0'), '133');
  assert.equal(shortVersion('18.2'), '18.2');
  assert.equal(shortVersion('17.4.1'), '17.4');
  assert.equal(shortVersion(undefined), '');
  assert.equal(browserName({ label: 'WebKit', version: '18.2' }), 'WebKit 18.2');
  assert.equal(browserName({ label: 'Firefox' }), 'Firefox');
  const f = (kind, desc) => ({ kind, sc: WCAG_KIND[kind], desc });
  const run = { browsers: [{ label: 'Chrome', version: '131.0.6778.85' }, { label: 'Firefox', version: '133.0' }, { label: 'WebKit', version: '18.2', altTab: true }], components: {
    menu: { Chrome: [], Firefox: [], WebKit: [f('focus', 'button.ring')] },
  } };
  const rows = browserRows(run, 'menu');
  assert.equal(browserLine(rows['2.4.7']), 'Chrome 131 ✓ · Firefox 133 ✓ · WebKit 18.2 ✕');
  assert.equal(onlyLine('2.4.7', rows['2.4.7'].only[0], rows['2.4.7']), 'Fails in WebKit 18.2 only: no visible focus when Tab reaches it, button.ring');
  assert.equal(onlyLine('2.4.7', rows['2.4.7'].only[0]), 'Fails in WebKit only: no visible focus when Tab reaches it, button.ring', 'without its row, the browser alone');
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
    // Each browser says the version it was, so a row names it with it.
    for (const b of run.browsers) assert.match(b.version ?? '', /^\d+(\.\d+)*/, `${b.label} gave its version`);
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
    assert.match(browserLine(rows['2.4.7']), /^Chrome \d+(\.\d+)? ✕ · Firefox \d+(\.\d+)? ✕$/);
    assert.deepEqual(rows['2.4.7'].only, [{ desc: 'button.ff', browsers: ['Firefox'] }]);
    assert.deepEqual(differByBrowser(run), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// Three more criteria from the same Tab walk, as Chrome's own check reads them, now in every browser: a component that
// holds the focus (2.1.2), a positive tabindex (2.4.3), and a control hidden behind something when focused (2.4.11).
const TRAP = `<!doctype html><html><head><meta charset="utf-8"><style>
  .cover { position: relative; display: inline-block; } .lid { position: absolute; inset: 0; background: #fff; }
</style></head><body><section id="c-trap"><div class="pg-preview">
  <button id="a">First</button><button id="b">Second</button>
</div></section><section id="c-order"><div class="pg-preview">
  <button>Plain</button><button tabindex="3">Jumps the queue</button><div class="cover"><button id="hid">Under a cover</button><div class="lid"></div></div>
</div></section><p><a href="#after">After</a></p>
<script>
  // Tab on the second button goes back to the first, Shift+Tab on the first back to the second: the focus never leaves.
  document.getElementById('b').addEventListener('keydown', (e) => { if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); document.getElementById('a').focus(); } });
  document.getElementById('a').addEventListener('keydown', (e) => { if (e.key === 'Tab' && e.shiftKey) { e.preventDefault(); document.getElementById('b').focus(); } });
</script></body></html>`;

test('in Chrome and Firefox: a focus held, a positive tabindex and a control hidden when focused, said in each', { skip: !(HERE.chrome && HERE.firefox) && 'Chrome and Firefox are both needed', timeout: budget(180000) }, async () => {
  const dir = makeFixture({});
  const page = join(dir, 'trap.html');
  writeFileSync(page, TRAP);
  try {
    const run = await a11yBrowsers({ url: () => pathToFileURL(page).href, components: ['trap', 'order'], browsers: [{ name: 'chrome', path: HERE.chrome }, { name: 'firefox', path: HERE.firefox }], open: openBrowser, rootOf: (n) => `#c-${n} .pg-preview` });
    assert.deepEqual(run.refused, []);
    for (const l of ['Chrome', 'Firefox']) {
      const of = (c) => run.components[c][l].map((f) => f.kind);
      assert.ok(of('trap').includes('tabtrap'), `${l} trap: ${of('trap')}`);
      assert.ok(of('order').includes('tabindex'), `${l} order: ${of('order')}`);
      assert.ok(of('order').includes('obscured'), `${l} order: ${of('order')}`);
      assert.ok(!of('order').includes('tabtrap'), `${l}: nothing holds the focus there`);
    }
    assert.match(browserLine(browserRows(run, 'trap')['2.1.2']), /^Chrome \d+(\.\d+)? ✕ · Firefox \d+(\.\d+)? ✕$/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// What a component does when used, by the in-page checks Chrome's own run uses, now in every browser: a control that
// acts on press (2.5.2), a thing moved only by dragging, with no other control beside it (2.5.7), a password field that turns autofill off (3.3.8). A
// criterion is said only where it had something to try: the plain component has no password field.
const USED_PAGE = `<!doctype html><html><head><meta charset="utf-8"></head><body><section id="c-used"><div class="pg-preview">
  <button id="press" aria-pressed="false">Press</button>
  <label>Password <input type="password" autocomplete="off"></label>
</div></section><section id="c-drag"><div class="pg-preview"><div draggable="true" class="card">Drag me</div></div></section>
<section id="c-plain"><div class="pg-preview"><button>Plain</button></div></section>
<script>document.getElementById('press').addEventListener('pointerdown', (e) => { e.currentTarget.setAttribute('aria-pressed', 'true'); });</script>
</body></html>`;

test('in each browser here: what a component does when used, said only where it had something to try', { skip: !(HERE.chrome && HERE.firefox) && 'Chrome and Firefox are both needed', timeout: budget(240000) }, async () => {
  const dir = makeFixture({});
  const page = join(dir, 'used.html');
  writeFileSync(page, USED_PAGE);
  const browsers = [{ name: 'chrome', path: HERE.chrome }, { name: 'firefox', path: HERE.firefox }, ...(HERE.webkit ? [{ name: 'webkit', path: HERE.webkit }] : [])];
  try {
    const run = await a11yBrowsers({ url: () => pathToFileURL(page).href, components: ['used', 'drag', 'plain'], browsers, open: openBrowser, rootOf: (n) => `#c-${n} .pg-preview` });
    assert.deepEqual(run.refused, []);
    for (const b of run.browsers) {
      const of = run.components.used[b.label].map((f) => f.kind);
      for (const k of ['pointerdown', 'authfill']) assert.ok(of.includes(k), `${b.label}: ${of}`);
      assert.ok(run.components.drag[b.label].some((f) => f.kind === 'dragging'), `${b.label}: ${run.components.drag[b.label].map((f) => f.kind)}`);
      assert.ok(run.ran.used[b.label].includes('auth'), `${b.label}: ${run.ran.used[b.label]}`);
    }
    const labels = run.browsers.map((b) => browserName(b));
    const used = browserRows(run, 'used'), drag = browserRows(run, 'drag'), plain = browserRows(run, 'plain');
    const fails = labels.map((l) => `${l} ✕`).join(' · ');
    for (const sc of ['2.5.2', '3.3.8']) assert.equal(browserLine(used[sc]), fails, sc);
    assert.equal(browserLine(drag['2.5.7']), fails);
    assert.equal(plain['3.3.8'], undefined, 'no password field, so 3.3.8 was not tried');
    assert.equal(plain['2.5.7'], undefined, 'nothing to drag, so 2.5.7 was not tried');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// On a large style guide the pass reloads the page for each component in each browser, more than a run's time holds:
// it starts no component past its time, keeps what an earlier run found for those, and tries them first next time.
test('a pass out of time keeps the earlier results for what it did not reach, and reaches those first next time', async () => {
  const seen = [];
  const fake = (name) => ({ label: { chrome: 'Chrome', firefox: 'Firefox' }[name], close: async () => {}, page: async (u) => { seen.push(`${name} ${u}`); return { evaluate: async () => null, setViewport: async () => {}, press: async () => {}, close: async () => {} }; } });
  const open = async (name) => fake(name);
  const browsers = [{ name: 'chrome' }, { name: 'firefox' }];
  const previous = { at: '2026-01-01T00:00:00.000Z', components: { old: { Chrome: [], Firefox: [{ kind: 'focus', desc: 'button' }] } }, ran: {}, tried: { old: '2026-01-01T00:00:00.000Z' } };
  const late = await a11yBrowsers({ url: (n) => n, components: ['old', 'fresh'], browsers, open, rootOf: (n) => `#${n}`, until: Date.now() - 1, previous });
  assert.deepEqual(late.notReached.sort(), ['fresh', 'old']);
  assert.deepEqual(late.components.old, previous.components.old, 'kept from the earlier run');
  assert.equal(late.components.fresh, undefined);
  assert.deepEqual(seen, []);
  // With time, the one never tried goes first, then the oldest; each is tried in every browser before the next.
  const run = await a11yBrowsers({ url: (n) => n, components: ['old', 'fresh'], browsers, open, rootOf: (n) => `#${n}`, previous });
  assert.deepEqual(seen, ['chrome fresh', 'firefox fresh', 'chrome old', 'firefox old']);
  assert.deepEqual(run.notReached, []);
  assert.ok(run.tried.fresh && run.tried.old);
});

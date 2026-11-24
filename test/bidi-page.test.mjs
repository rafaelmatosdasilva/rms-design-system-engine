// A Firefox tab whose browsing context is dropped mid-check is opened once more (bidi.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bidiPage } from '../lib/bidi.mjs';

const LOST = 'no such frame: DiscardedBrowsingContextError: BrowsingContext does no longer exist';

// A Firefox that drops the tab the first `drops` times a script runs, as Windows runners do now and then, and on the
// loads named in `lostLoads` (1 is the first page load of all, 2 the next, and so on).
function fakeFirefox(drops, lostLoads = []) {
  const calls = [];
  let n = 0, loads = 0;
  const send = async (method, params) => {
    calls.push([method, params]);
    if (method === 'browsingContext.create') return { context: `tab${++n}` };
    if (method === 'browsingContext.navigate' && lostLoads.includes(++loads)) throw new Error(LOST);
    if (method === 'script.evaluate') {
      if (drops-- > 0) throw new Error(LOST);
      return { type: 'success', result: { type: 'string', value: `on ${params.target.context}` } };
    }
    return {};
  };
  return { send, calls };
}

test('a tab dropped mid-check is opened again at the same page and width, and the step runs again', async () => {
  const ff = fakeFirefox(1);
  const page = await bidiPage(ff.send, 'file:///page.html', { width: 1280, height: 800 });
  await page.setViewport(375, 812);
  assert.equal(await page.evaluate('1'), 'on tab2');
  const reopen = ff.calls.filter(([m]) => m === 'browsingContext.navigate');
  assert.deepEqual(reopen.map(([, p]) => p.url), ['file:///page.html', 'file:///page.html']);
  assert.deepEqual(ff.calls.filter(([m]) => m === 'browsingContext.setViewport').at(-1)[1].viewport, { width: 375, height: 812 }, 'at the width it was at');
  assert.ok(ff.calls.some(([m, p]) => m === 'browsingContext.close' && p.context === 'tab1'), 'the dropped tab is closed');
});

test('a second loss in one step is said, never tried a third time', async () => {
  const ff = fakeFirefox(2);
  const page = await bidiPage(ff.send, 'file:///page.html');
  await assert.rejects(page.evaluate('1'), /DiscardedBrowsingContext/);
  assert.equal(ff.calls.filter(([m]) => m === 'browsingContext.create').length, 2);
});

// The go is each step's own. Counted once per page, the loss while the page loaded spent it and the step that met the
// next loss had none, which failed checks on the Windows runners for a tab the engine could have opened again.
test('a tab lost while the page loads costs the steps nothing: one that meets a loss later still gets its own go', async () => {
  const ff = fakeFirefox(1, [1]);
  const page = await bidiPage(ff.send, 'file:///page.html');
  assert.equal(await page.evaluate('1'), 'on tab3', 'the step opened a tab of its own and ran again');
  assert.equal(ff.calls.filter(([m]) => m === 'browsingContext.create').length, 3, 'one at the open, one for the open it lost, one for the step');
});

// The reopen is an opening like any other, so it has the opening's own go. Without it the step's go went on a tab that
// never finished loading and the loss was said anyway, which is how a third check met this on the Windows runners
// after the go was made each step's own (engine #700).
test('a reopen that loses its new tab while it loads opens another, and the step still comes through', async () => {
  const ff = fakeFirefox(1, [2]);
  const page = await bidiPage(ff.send, 'file:///page.html');
  assert.equal(await page.evaluate('1'), 'on tab3', 'the reopen tried again rather than giving up the step');
  assert.equal(ff.calls.filter(([m]) => m === 'browsingContext.create').length, 3, 'the open, the reopen it lost, and the reopen that held');
});

test('every step gets a go, not only the first: three steps each meeting one loss all come through', async () => {
  let n = 0, tries = 0;
  // The tab is lost on the first try of each step and holds on the second, so every step meets one loss of its own.
  const send = async (method, params) => {
    if (method === 'browsingContext.create') return { context: `tab${++n}` };
    if (method === 'script.evaluate') {
      if (++tries % 2 === 1) throw new Error(LOST);
      return { type: 'success', result: { type: 'string', value: `on ${params.target.context}` } };
    }
    return {};
  };
  const page = await bidiPage(send, 'file:///page.html');
  assert.equal(await page.evaluate('1'), 'on tab2');
  assert.equal(await page.evaluate('2'), 'on tab3');
  assert.equal(await page.evaluate('3'), 'on tab4');
});

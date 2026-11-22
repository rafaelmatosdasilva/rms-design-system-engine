// A Firefox tab whose browsing context is dropped mid-check is opened once more (bidi.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bidiPage } from '../lib/bidi.mjs';

// A Firefox that drops the tab the first `drops` times a script runs, as Windows runners do now and then.
function fakeFirefox(drops) {
  const calls = [];
  let n = 0;
  const send = async (method, params) => {
    calls.push([method, params]);
    if (method === 'browsingContext.create') return { context: `tab${++n}` };
    if (method === 'script.evaluate') {
      if (drops-- > 0) throw new Error('no such frame: DiscardedBrowsingContextError: BrowsingContext does no longer exist');
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

test('a second loss is said, never tried a third time', async () => {
  const ff = fakeFirefox(2);
  const page = await bidiPage(ff.send, 'file:///page.html');
  await assert.rejects(page.evaluate('1'), /DiscardedBrowsingContext/);
  assert.equal(ff.calls.filter(([m]) => m === 'browsingContext.create').length, 2);
});

// A Firefox tab whose browsing context is lost mid-check (bidi.mjs): a move between processes is waited out on the same
// tab, and only a tab Firefox no longer lists is opened again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bidiPage } from '../lib/bidi.mjs';

const LOST = 'no such frame: DiscardedBrowsingContextError: BrowsingContext does no longer exist';
const fast = { wait: { waitMs: 2000, everyMs: 1 } };

// A Firefox whose tabs move process now and then, as GitHub's runners showed: `moves` steps meet a lost context while
// the tab is still listed; `closes` steps meet one where the tab is gone for good; `loading` readiness questions are
// answered "loading" first, and `lostReady` of them meet the move.
function fakeFirefox({ moves = 0, closes = 0, loading = 0, lostReady = 0, never = false } = {}) {
  const calls = [], gone = new Set();
  let n = 0;
  const send = async (method, params = {}) => {
    calls.push([method, params]);
    if (method === 'browsingContext.create') return { context: `tab${++n}` };
    if (method === 'browsingContext.getTree') { if (gone.has(params.root)) throw new Error(LOST); return { contexts: [{ context: params.root }] }; }
    if (method === 'browsingContext.close') { gone.add(params.context); return {}; }
    if (method === 'script.evaluate') {
      if (params.expression === 'document.readyState') {
        if (gone.has(params.target.context)) throw new Error(LOST);
        if (lostReady-- > 0) throw new Error(LOST);
        if (never || loading-- > 0) return { type: 'success', result: { type: 'string', value: 'loading' } };
        return { type: 'success', result: { type: 'string', value: 'complete' } };
      }
      if (moves-- > 0) throw new Error(LOST);
      if (closes-- > 0) { gone.add(params.target.context); throw new Error(LOST); }
      return { type: 'success', result: { type: 'string', value: `on ${params.target.context}` } };
    }
    return {};
  };
  return { send, calls };
}
const count = (calls, m) => calls.filter(([x]) => x === m).length;

test('a page is waited for by asking it, never by the navigation\'s own wait, which a move can leave unanswered', async () => {
  const ff = fakeFirefox({ loading: 3, lostReady: 2 });
  const page = await bidiPage(ff.send, 'file:///page.html', fast);
  assert.deepEqual(ff.calls.find(([m]) => m === 'browsingContext.navigate')[1], { context: 'tab1', url: 'file:///page.html', wait: 'none' });
  assert.equal(await page.evaluate('1'), 'on tab1', 'asked again through the move until it said complete');
  assert.equal(count(ff.calls, 'browsingContext.create'), 1);
});

test('a lost context in a tab Firefox still lists is a move: the step runs again on the same tab, no new load', async () => {
  const ff = fakeFirefox({ moves: 1 });
  const page = await bidiPage(ff.send, 'file:///page.html', fast);
  assert.equal(await page.evaluate('1'), 'on tab1', 'still on its own tab');
  assert.equal(count(ff.calls, 'browsingContext.create'), 1, 'no tab opened again, so no second move to meet');
  assert.equal(count(ff.calls, 'browsingContext.navigate'), 1);
});

// GitHub's Windows runners: the tab stayed listed, and every retry on it met the loss again.
test('a second loss in one step opens a fresh tab, even when Firefox still lists the old one', async () => {
  const ff = fakeFirefox({ moves: 2 });
  const page = await bidiPage(ff.send, 'file:///page.html', fast);
  assert.equal(await page.evaluate('1'), 'on tab2');
  assert.equal(count(ff.calls, 'browsingContext.create'), 2);
});

test('a tab Firefox no longer lists is opened again at the same page and width, and the step runs again', async () => {
  const ff = fakeFirefox({ closes: 1 });
  const page = await bidiPage(ff.send, 'file:///page.html', { width: 1280, height: 800, ...fast });
  await page.setViewport(375, 812);
  assert.equal(await page.evaluate('1'), 'on tab2');
  assert.deepEqual(ff.calls.filter(([m]) => m === 'browsingContext.navigate').map(([, p]) => p.url), ['file:///page.html', 'file:///page.html']);
  assert.deepEqual(ff.calls.filter(([m]) => m === 'browsingContext.setViewport').at(-1)[1].viewport, { width: 375, height: 812 }, 'at the width it was at');
});

test('a step that keeps meeting the loss ends after its goes, and says so', async () => {
  const ff = fakeFirefox({ moves: 99 });
  const page = await bidiPage(ff.send, 'file:///page.html', fast);
  await assert.rejects(page.evaluate('1'), /DiscardedBrowsingContext.*\(met 3 times in one step: waited on the same tab, then opened a new tab, then opened a new tab\)/);
  assert.equal(ff.calls.filter(([m, p]) => m === 'script.evaluate' && p.expression === '1').length, 3);
});

test('every step has goes of its own: three steps each meeting a move all come through', async () => {
  let tries = 0;
  const ff = fakeFirefox();
  const send = async (method, params = {}) => {
    if (method === 'script.evaluate' && params.expression !== 'document.readyState' && ++tries % 2 === 1) throw new Error(LOST);
    return ff.send(method, params);
  };
  const page = await bidiPage(send, 'file:///page.html', fast);
  for (const x of ['1', '2', '3']) assert.equal(await page.evaluate(x), 'on tab1');
});

test('a page that never finishes loading is said, not waited on for ever', async () => {
  const ff = fakeFirefox({ never: true });
  await assert.rejects(bidiPage(ff.send, 'file:///page.html', { wait: { waitMs: 50, everyMs: 1 } }), /did not finish loading in Firefox/);
  assert.ok(ff.calls.some(([m]) => m === 'browsingContext.close'), 'its tab is closed');
});

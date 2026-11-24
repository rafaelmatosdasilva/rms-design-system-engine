// A drawn prototype at every width in Firefox and WebKit as well as Chrome (prototype-browsers.mjs): the prototype
// check's own measurement run in each browser, a picture of each width kept, and only what differs from Chrome said.
// A label only Firefox draws too narrow (a rule only Firefox reads) is the case the pass exists for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { makeFixture, budget } from './helpers.mjs';
import { fitOnly, prototypeBrowsers, browserFitLines, prototypeBrowserList } from '../lib/prototype-browsers.mjs';
import { openBrowser } from '../lib/page-driver.mjs';
import { browsersHere } from '../lib/browsers.mjs';

const HERE = browsersHere();

test('only what another browser finds at the same width, state and words is kept', () => {
  const run = (width, issues, longer = false) => ({ state: 'default', width, longer, issues });
  const wraps = { kind: 'wraps', path: '0.1', text: 'Save changes', component: 'button' };
  const chrome = [run('phone', [wraps]), run('tablet', [])];
  assert.deepEqual(fitOnly(chrome, [run('phone', [wraps]), run('tablet', [])]), []);
  assert.deepEqual(fitOnly(chrome, [run('phone', [wraps]), run('tablet', [wraps])]), [run('tablet', [wraps])]);
  // The same words longer is another case: Chrome's as-written answer does not cover it.
  assert.equal(fitOnly(chrome, [run('phone', [wraps], true)]).length, 1);
});

test('Firefox and WebKit by default where they are here, the ones named, or none', () => {
  const found = { chrome: '/c', firefox: '/f', webkit: null };
  assert.deepEqual(prototypeBrowserList(found, {}).map((b) => b.name), ['firefox']);
  assert.deepEqual(prototypeBrowserList({ ...found, webkit: '/w' }, { prototype: { browsers: ['webkit'] } }).map((b) => b.name), ['webkit']);
  assert.deepEqual(prototypeBrowserList(found, { prototype: { browsers: false } }), []);
  assert.deepEqual(prototypeBrowserList(found, { prototype: { browsers: [] } }), []);
});

// A browser whose tab the engine lost: openBrowser's own page throws what Firefox says when it drops a browsing
// context. Each browser is given its go, and the count says how many of them lose the tab before one draws.
const LOST = 'no such frame: DiscardedBrowsingContextError: BrowsingContext does no longer exist';
function losingOpen(lose = {}) {
  const tries = {};
  return async (name) => {
    tries[name] = (tries[name] ?? 0) + 1;
    const lost = tries[name] <= (lose[name] ?? 0);
    return {
      label: name[0].toUpperCase() + name.slice(1),
      page: async () => {
        if (lost) throw new Error(LOST);
        return {
          evaluate: async (e) => (/__ptStates/.test(e) ? ['default'] : /data-pt-path/.test(e) ? true : []),
          setViewport: async () => {},
          close: async () => {},
        };
      },
      close: async () => {},
    };
  };
}
const TWO = [{ name: 'chrome', path: '/c' }, { name: 'firefox', path: '/f' }];
const WIDTHS = [{ name: 'tablet', px: 768 }];

test('a browser that loses its tab is opened once more, and what the lost go wrote is not counted twice', async () => {
  const run = await prototypeBrowsers({ url: 'file:///p.html', widths: WIDTHS, browsers: TWO, open: losingOpen({ firefox: 1 }) });
  assert.deepEqual(run.refused, []);
  assert.deepEqual(run.browsers.map((b) => b.label), ['Chrome', 'Firefox']);
  assert.deepEqual(Object.keys(run.runs), ['Chrome', 'Firefox']);
});

test('a second loss is said, and that browser is left out rather than guessed at', async () => {
  const run = await prototypeBrowsers({ url: 'file:///p.html', widths: WIDTHS, browsers: TWO, open: losingOpen({ firefox: 2 }) });
  assert.deepEqual(run.refused, [`Firefox: ${LOST}`]);
  assert.deepEqual(run.browsers.map((b) => b.label), ['Chrome']);
  assert.deepEqual(Object.keys(run.runs), ['Chrome']);
});

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
  body { margin: 0; font: 16px/1.4 sans-serif; } .btn { display: inline-block; padding: 4px 8px; }
  @supports (-moz-appearance: none) { .ff { width: 40px; } }
</style></head><body><div id="pt-canvas"><div data-pt-path="0">
  <button class="btn" data-pt-path="0.0" data-pt-component="button">Save</button>
  <button class="btn ff" data-pt-path="0.1" data-pt-component="button">Send the report</button>
</div></div><script>
  // A state is shown by drawing the page again, as the prototype's own page does: the longer words go with it.
  const drawn = document.getElementById('pt-canvas').innerHTML;
  window.__ptStates = ['default']; window.__ptShow = () => { document.getElementById('pt-canvas').innerHTML = drawn; };
</script></body></html>`;

test('in Chrome and Firefox: a label only Firefox wraps is said as Firefox\'s, with a picture of each width', { skip: !(HERE.chrome && HERE.firefox) && 'Chrome and Firefox are both needed', timeout: budget(180000) }, async () => {
  const dir = makeFixture({});
  const page = join(dir, 'p.html');
  writeFileSync(page, PAGE);
  try {
    const widths = [{ name: 'tablet', px: 768 }, { name: 'desktop', px: 1280 }];
    const run = await prototypeBrowsers({ url: pathToFileURL(page).href, widths, browsers: [{ name: 'chrome', path: HERE.chrome }, { name: 'firefox', path: HERE.firefox }], open: openBrowser, dir, name: 'p' });
    assert.deepEqual(run.refused, []);
    assert.deepEqual(run.browsers.map((b) => b.label), ['Chrome', 'Firefox']);
    const wrapsIn = (l) => run.runs[l].some((r) => r.issues.some((i) => i.kind === 'wraps' && /Send the report/.test(i.text)));
    assert.equal(wrapsIn('Chrome'), false);
    assert.equal(wrapsIn('Firefox'), true);
    const lines = browserFitLines(run);
    assert.ok(lines.some((l) => /"Send the report"/.test(l) && /wraps onto two lines at tablet, desktop/.test(l) && /in Firefox only$/.test(l)), lines.join('\n'));
    assert.ok(!lines.some((l) => /"Save"/.test(l)), lines.join('\n'));
    for (const w of ['tablet', 'desktop']) {
      const f = join(dir, 'firefox', `p@${w}.png`);
      assert.ok(existsSync(f), f);
      assert.equal(readFileSync(f).subarray(1, 4).toString(), 'PNG');
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

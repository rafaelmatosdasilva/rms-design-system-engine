// A stand-in shows on the prototype's page for what it is: marked where it is drawn with what it stands in for (the
// component itself untouched), counted on the bar, turned off and on, and reached from the gaps list, which shows each
// gap's parts on the page. A stand-in for a component the system has is said: the system's own is used.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { prototypePage } from '../prototype.mjs';
import { checkPrototype, pageGaps } from '../prototype-pieces.mjs';
import { findChrome, launchChrome, connectCDP, openPage, waitForTrue, FILE_PAGE_LOADED } from '../cdp.mjs';

const CHROME = findChrome({ playwright: true });
const CSS = '.btn { padding: 4px 8px; } .btn:focus-visible { outline: 2px solid blue; } .card { display: flex; flex-direction: column; padding: 8px; }';
const c = (name, cls, markup, controls = []) => ({ name, cls, role: null, markup, markups: [markup], controls });
const parts = { themeCSS: CSS, systemCSS: CSS, componentCSS: '', iconSheet: '', view: { modes: [], components: [
  c('button', 'btn', '<button class="btn">Go</button>', [{ label: 'Label', prop: 'Label', type: 'TEXT' }]),
  c('card', 'card', '<div class="card"></div>'),
  c('datePicker', 'dp', '<div class="dp"></div>'),
] } };
const catalog = { components: { button: { props: { Label: { type: 'text' } } }, card: { props: {} }, datePicker: { props: {} } } };
const tree = { component: 'Page', props: { width: '480' }, children: [
  { id: 'when', component: 'button', props: { Label: '12 Oct 2026', standInFor: 'calendar' } },
  { id: 'saved', component: 'Text', props: { text: 'Saved', standInFor: 'toast' } },
  { id: 'map', component: 'Missing', props: { need: 'a map of the scan' } },
  { id: 'open', component: 'button', props: { Label: 'Options', opens: 'menu' } },
  { id: 'menu', component: 'card', props: {}, children: [{ id: 'pick', component: 'button', props: { Label: 'Pick', standInFor: 'menu item' } }] },
] };

test('a stand-in for a component the system has is said; the page lists each gap with its parts', () => {
  const r = checkPrototype({ component: 'Page', children: [{ component: 'button', props: { Label: 'Date', standInFor: 'date picker' } }, { component: 'button', props: { Label: 'Search', standInFor: 'search field' } }] }, { catalog, view: parts.view, scales: { spacing: [], text: [] } });
  assert.deepEqual(r.findings.filter((f) => /stands in/.test(f.message)).map((f) => f.message), ['button stands in for "date picker", and the system has datePicker: use datePicker itself, without "standInFor"']);
  const gaps = pageGaps(checkPrototype(tree, { catalog, view: parts.view, scales: { spacing: [], text: [] } }).gaps);
  assert.deepEqual(gaps.map((g) => [g.need, g.nodes.join()]), [['calendar', 'when'], ['toast', 'saved'], ['a map of the scan', 'map'], ['menu item', 'pick'], ['a Page layout component', '']]);
  assert.equal(gaps[0].line, 'component: calendar; the prototype uses button meanwhile');
});

test('stand-ins are marked on the page, counted, turned off and on, and reached from the gaps list', { skip: CHROME ? false : 'no Chrome available', timeout: 90000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'proto-standins-'));
  const file = join(dir, 'page.html');
  const gaps = pageGaps(checkPrototype(tree, { catalog, view: parts.view, scales: { spacing: [], text: [] } }).gaps);
  writeFileSync(file, prototypePage({ name: 'p', tree, parts, scales: { spacing: [], text: [] }, gaps, catalog, fonts: false }));
  const chrome = await launchChrome(CHROME);
  const { send, close } = await connectCDP(chrome.wsUrl);
  try {
    const { sessionId } = await openPage(send, pathToFileURL(file).href);
    await waitForTrue(send, sessionId, `${FILE_PAGE_LOADED} && !!document.querySelector('[data-pt-path="0"]')`, { attempts: 200 });
    const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }, sessionId); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result?.value; };
    const frame = () => ev('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
    const marks = () => ev(`[...document.querySelectorAll('#pt-marks .pt-mark')].map((m) => m.textContent)`);
    await frame();
    // Counted on the bar (the one inside what a click opens too), marked where drawn, with what each stands in for.
    assert.deepEqual(await ev(`(() => { const b = document.getElementById('pt-standins'); return [b.hidden, b.textContent, b.getAttribute('aria-pressed')]; })()`), [false, 'Stand-ins (3)', 'true']);
    assert.deepEqual(await marks(), ['Stand-in for calendar', 'Stand-in for toast']);
    const placed = await ev(`(() => { const e = document.querySelector('[data-pt-id="when"]').getBoundingClientRect(); const b = document.querySelector('#pt-marks .pt-mark-box').getBoundingClientRect(); return [Math.round(b.left - e.left), Math.round(b.top - e.top), Math.round(b.width - e.width)]; })()`);
    assert.deepEqual(placed, [-3, -3, 6], 'the box sits around the part');
    // The component itself is untouched: its own focus ring shows as the system draws it.
    assert.equal(await ev(`(() => { const e = document.querySelector('[data-pt-id="when"]'); return getComputedStyle(e).outlineStyle + '|' + e.className; })()`), 'none|btn');
    // Turned off and on from the bar; the page script can turn them off for a picture.
    await ev(`document.getElementById('pt-standins').click()`); await frame();
    assert.deepEqual([await marks(), await ev(`document.querySelectorAll('#pt-marks .pt-mark-box').length`)], [[], 0]);
    await ev(`document.getElementById('pt-standins').click()`); await frame();
    assert.equal((await marks()).length, 2);
    // Opened, the menu's stand-in is marked too.
    await ev(`document.querySelector('[data-pt-opens="menu"]').click()`); await frame(); await frame();
    assert.deepEqual(await marks(), ['Stand-in for calendar', 'Stand-in for toast', 'Stand-in for menu item']);
    await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`); await frame(); await frame();
    // The gaps list: what each is, and a way to its parts on the page.
    await ev(`document.getElementById('pt-gaps-toggle').click()`);
    const items = await ev(`[...document.querySelectorAll('#pt-gaps li')].map((li) => [li.querySelector('.pt-chip').textContent, !!li.querySelector('.pt-gap-show')])`);
    assert.deepEqual(items, [['stand-in', true], ['stand-in', true], ['missing', true], ['stand-in', true], ['layout', true]]);
    await ev(`PT_MARKS(false)`); await frame();
    await ev(`document.querySelectorAll('#pt-gaps .pt-gap-show')[0].click()`); await frame();
    assert.deepEqual(await ev(`[document.getElementById('pt-standins').getAttribute('aria-pressed'), document.querySelectorAll('#pt-marks .pt-flash').length]`), ['true', 1], 'a stand-in shown from the list turns the marks on and flashes it');
    await ev(`document.querySelectorAll('#pt-gaps .pt-gap-show')[2].click()`); await frame();
    assert.equal(await ev(`(() => { const f = document.querySelector('#pt-marks .pt-flash').getBoundingClientRect(), e = document.querySelector('[data-pt-id="map"]').getBoundingClientRect(); return Math.round(f.width - e.width); })()`), 6, 'a Missing box flashes where it is');
    await ev(`document.querySelectorAll('#pt-gaps .pt-gap-show')[3].click()`);
    assert.match(await ev(`document.querySelectorAll('#pt-gaps li')[3].textContent`), /not drawn now/, 'a part inside what a click opens is not on the page until opened');
    await ev(`document.querySelectorAll('#pt-gaps .pt-gap-show')[4].click()`);
    assert.equal(await ev(`document.getElementById('pt-outline').getAttribute('aria-pressed')`), 'true', 'the engine\'s layout is shown by its outline');
  } finally { close(); chrome.kill(); }
});

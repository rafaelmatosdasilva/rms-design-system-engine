// Which browsers the checks can run in, and what a run in Chrome alone leaves unanswered. Layout, fonts, form
// controls and focus rings differ between engines: some criteria are the same everywhere, some a browser decides,
// and what a screen reader hears is read from Chrome's accessibility tree, which no other engine exposes. The passes
// in Firefox and WebKit try the criteria a browser decides that a11y-browsers.mjs covers; the rest stay Chrome's, and
// a row says which rather than letting a Chrome run read as all of them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findFirefox, findWebKit, browsersHere, browserLines, triedIn, WHY_MISSING, BROWSER_RUN_LINE } from '../lib/browsers.mjs';
import { WCAG22, BEYOND_AA, browserOf } from '../lib/wcag21.mjs';
import { templateText } from '../lib/styleguide-template.mjs';

test('every criterion says what it depends on, and the three kinds are what they claim', () => {
  for (const c of WCAG22) assert.ok(['same', 'each', 'chrome'].includes(c.browser), `${c.sc}: ${c.browser}`);
  for (const b of BEYOND_AA) assert.ok(['same', 'each', 'chrome'].includes(b.browser), b.sc);
  // What a browser decides: what Tab reaches, where the focus shows and is not hidden, how the page reflows and
  // zooms, what spacing does to it, what an input does when it changes, and what a drag or a tap needs.
  const each = WCAG22.filter((c) => c.browser === 'each').map((c) => c.sc);
  assert.deepEqual(each, ['1.4.4', '1.4.10', '1.4.12', '1.4.13', '2.1.1', '2.1.2', '2.4.3', '2.4.7', '2.4.11', '2.5.2', '2.5.7', '2.5.8', '3.2.1', '3.2.2', '3.3.8']);
  // What a screen reader hears is Chrome's alone.
  assert.deepEqual(WCAG22.filter((c) => c.browser === 'chrome').map((c) => c.sc), ['4.1.2']);
  // Read from the code, the markup or the system's own values: the same in every browser.
  for (const sc of ['1.1.1', '1.3.4', '1.4.3', '1.4.11', '2.4.2', '2.4.5', '3.1.1', '3.3.7']) assert.equal(browserOf(sc), 'same', sc);
  // High contrast mode is painted by the browser; a reduced-motion rule is read the same by every engine.
  assert.equal(BEYOND_AA.find((b) => b.sc === 'Forced colours').browser, 'each');
  assert.equal(BEYOND_AA.find((b) => b.sc === 'Reduced motion').browser, 'same');
});

test('what a row says about where it was tried, by what the criterion depends on, the same on every machine', () => {
  assert.match(triedIn({ browser: 'same' }), /^Same in every browser/);
  assert.match(triedIn({ browser: 'chrome' }), /^Chrome only: the other engines expose nothing/);
  assert.match(triedIn({ browser: 'each' }), /^Tried in Chrome alone\. This is one a browser decides, so Firefox and WebKit can differ, and the pass in them does not try it yet\.$/);
  assert.match(triedIn({ browser: 'each', pass: true }), /^Tried in Chrome\. This is one a browser decides: Firefox and WebKit try it on the style guide's components/);
  // A criterion with nothing said about it is read as the same everywhere, never as tried in all of them.
  assert.match(triedIn({}), /^Same in every browser/);
  // What is installed changes nothing a run answered, so it changes nothing the row says: one page built here and one
  // built on another machine read the same.
  assert.equal(triedIn({ browser: 'each' }, { firefox: true, webkit: true }), triedIn({ browser: 'each' }, { firefox: false, webkit: false }));
});

test('what a run says about the browsers is the same on every machine, with no path in it', () => {
  assert.match(BROWSER_RUN_LINE, /answered for Chrome alone this run\. Firefox and WebKit try them on the style guide's components/);
  assert.doesNotMatch(BROWSER_RUN_LINE, /\/|installed|\bhere\b/, 'nothing about this machine: a report is pasted and compared');
});

test('a browser that is not here is named as missing, never passed over', () => {
  const found = { chrome: '/somewhere/chrome', firefox: null, webkit: null };
  const lines = browserLines(found);
  assert.equal(lines.length, 4);
  assert.match(lines[3], /^Playwright/, 'the driver is said last');
  assert.match(lines[1], new RegExp(WHY_MISSING.firefox));
  assert.match(lines[2], new RegExp(WHY_MISSING.webkit.replace(/[()']/g, '.')));
  // With none at all, the first line says the whole browser check cannot run.
  assert.match(browserLines({ chrome: null, firefox: null, webkit: null })[0], /no browser check runs at all/);
  // One that is here says what runs in it and what does not, so nobody reads it as having answered everything.
  assert.match(browserLines({ chrome: 'c', firefox: '/bin/firefox', webkit: null })[1], /rendered parity and the accessibility criteria a browser decides are tried in it\)/);
  assert.match(browserLines({ chrome: 'c', firefox: null, webkit: '/usr/bin/safaridriver' })[2], /when ds-config\.json names webkit \(rendered\.browsers, a11y\.browsers\)/);
  // The finders answer for this machine without throwing, whatever is installed.
  for (const f of [findFirefox, findWebKit]) { const p = f(); assert.ok(p === null || typeof p === 'string'); }
  // Turned off by name, as Chrome can be.
  assert.equal(findFirefox({ env: { DESIGN_SYSTEM_ENGINE_FIREFOX: 'none' } }), null);
  assert.equal(findWebKit({ env: { DESIGN_SYSTEM_ENGINE_WEBKIT: 'none' } }), null);
  // What the run records is names, never paths: the style guide is published.
  const here = browsersHere();
  for (const v of Object.values(here)) assert.ok(v === null || typeof v === 'string');
});

test('the style guide says where each criterion was tried, worked out once', () => {
  const page = templateText();
  assert.match(page, /WCAG\.tried\[r\.k\.browser === 'each' && \(WCAG\.passSc \|\| \[\]\)\.indexOf\(r\.k\.sc\) >= 0 \? 'pass' : \(r\.k\.browser \|\| 'same'\)\]/, 'the row reads the line for its kind');
  assert.match(page, /'Tried in ' \+ bbRow\.line/, 'a row the other browsers tried says each browser\'s result');
  // A row beyond A and AA carries it too: high contrast mode is the browser's own painting, and saying it was the
  // same everywhere would be the opposite of true.
  assert.match(page, /browser: b\.browser/, 'the rows beyond A and AA keep what they depend on');
  assert.doesNotMatch(page, /Firefox is not installed here/, 'the page never works the wording out itself');
});

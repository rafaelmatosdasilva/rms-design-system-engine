// WCAG 2.1 at level A and AA: every success criterion is listed with how the engine covers it for a component, the
// in-page checks (wcag-page.js) find each problem a small page breaks once and leave the page that is fine alone, the
// audit's browser check runs them, the code checks read shortcuts, timers, gestures and device motion, and the style
// guide gives each code finding to its component. Browser cases need Chrome.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeFixture } from './helpers.mjs';
import { WCAG21, WCAG21_GUIDE, WCAG21_KIND, WCAG_PAGE_SOURCE } from '../wcag21.mjs';
import { A11Y_GUIDE, a11yFindingRecord } from '../a11y-check.mjs';
import { scriptFindings, scriptOnly } from '../a11y-static.mjs';
import { wcagStatics, A11Y_WCAG, wcagLabel } from '../styleguide-data.mjs';
import { findChrome, launchChrome, connectCDP, openPage, waitForTrue, FILE_PAGE_LOADED } from '../cdp.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const CHROME = findChrome({ playwright: true });
const HAS_CHROME = !!CHROME && typeof WebSocket !== 'undefined';
const FIXTURE = join(ENGINE, 'test', 'fixtures', 'wcag21', 'page.html');

test('catalogue: the 50 criteria of WCAG 2.1 at A and AA, each with how it is covered and plain words', () => {
  assert.equal(WCAG21.length, 50);
  assert.equal(WCAG21.filter((c) => c.level === 'A').length, 30);
  assert.equal(WCAG21.filter((c) => c.level === 'AA').length, 20);
  assert.equal(new Set(WCAG21.map((c) => c.sc)).size, 50);
  for (const c of WCAG21) {
    assert.ok(['auto', 'audit', 'static', 'person', 'page', 'media'].includes(c.how), c.sc);
    assert.ok(c.says && c.name, c.sc);
    if (c.how === 'person') assert.ok(c.person, `${c.sc} says what a person checks`);
    if (['auto', 'audit', 'static'].includes(c.how)) assert.ok(c.kinds?.length, `${c.sc} names the findings that fail it`);
    for (const k of c.kinds ?? []) assert.ok(A11Y_GUIDE[k]?.fix, `${c.sc}: ${k} has words in the audit's guide`);
  }
  // Each new kind reads in plain words, singular and plural, and counts in the audit's --json with its criterion.
  for (const [k, g] of Object.entries(WCAG21_GUIDE)) {
    assert.match(g.title(1), /^One /, k);
    assert.match(g.title(3), /^3 /, k);
    assert.ok(WCAG21_KIND[k], `${k} fails a criterion`);
    assert.equal(A11Y_WCAG[k], WCAG21_KIND[k], k);
  }
  assert.equal(a11yFindingRecord('labelname', { desc: 'button' }).wcag, '2.5.3');
  assert.equal(wcagLabel('2.5.3'), 'WCAG 2.5.3 Label in Name (A)');
  assert.equal(wcagLabel('1.4.13'), 'WCAG 1.4.13 Content on Hover or Focus (AA)');
});

test('code: a single-key shortcut on the page, a short timer that closes something, a gesture, device motion', () => {
  const kinds = (src) => scriptFindings(src).map((f) => f.kind);
  // 2.1.4: on the whole page with no modifier; a modifier asked for, or a key listened for on a focused component, is fine.
  assert.deepEqual(kinds(`document.addEventListener('keydown', (e) => { if (e.key === 'k') openSearch(); });`), ['shortcut']);
  assert.deepEqual(kinds(`document.addEventListener('keydown', (e) => { if (e.metaKey && e.key === 'k') openSearch(); if (e.key === 'Escape') close(); });`), []);
  assert.deepEqual(kinds(`list.addEventListener('keydown', (e) => { if (e.key === 'a') pick(); });`), []);
  // 2.2.1: closed by itself after 1 to 20 seconds, even through a ternary; the end of a short animation, a timer stopped
  // while hovered, and one that fetches are fine.
  assert.deepEqual(kinds(`function show() { t = setTimeout(dismissToast, isError ? 8000 : 5000); }`), ['timing']);
  assert.match(scriptFindings(`setTimeout(() => el.remove(), 4000)`)[0].desc, /after 4 seconds/);
  assert.deepEqual(kinds(`setTimeout(() => el.remove(), 300); setTimeout(fetchMore, 3000); setTimeout(() => el.remove(), 30000);`), []);
  assert.deepEqual(kinds(`const t = setTimeout(close, 5000); el.addEventListener('mouseenter', () => clearTimeout(t));`), []);
  // 2.5.1 and 2.5.4.
  assert.deepEqual(kinds(`el.addEventListener('touchmove', (e) => { if (e.touches.length > 1) zoom(e); });`), ['gesture']);
  assert.deepEqual(kinds(`window.addEventListener('devicemotion', undo);`), ['motionact']);
  assert.deepEqual(kinds(`// window.addEventListener('devicemotion', undo);`), []);   // a comment is not code
  // A component file keeps only its scripts, with its line numbers.
  const vue = `<template>\n<div/>\n</template>\n<script>\nwindow.addEventListener('deviceorientation', tilt);\n</script>`;
  assert.equal(scriptFindings(scriptOnly(vue))[0].line, 5);
});

test('style guide: a finding in the code goes to the component its file or its code names', () => {
  const comps = [{ name: 'toast', cls: 'toast' }, { name: 'searchBox', cls: 'searchBox' }];
  const out = wcagStatics([
    { kind: 'timing', file: 'src/toast.js', line: 3, desc: 'a', fix: 'f' },
    { kind: 'shortcut', file: 'src/shared.js', line: 9, desc: 'b', near: `el.closest('.searchBox')` },
    { kind: 'gesture', file: 'src/other.js', line: 1, desc: 'c', near: 'nothing of theirs' },
    { kind: 'name', file: 'src/toast.js', line: 1, desc: 'not a script finding' },
  ], comps);
  assert.deepEqual(Object.keys(out).sort(), ['searchBox', 'toast']);
  assert.deepEqual(out.toast.map((f) => f.kind), ['timing']);
  assert.deepEqual(out.searchBox.map((f) => f.line), [9]);
});

async function inPage(fn) {
  const chrome = await launchChrome(CHROME);
  const { send, close } = await connectCDP(chrome.wsUrl);
  try {
    const { sessionId } = await openPage(send, pathToFileURL(FIXTURE).href);
    await waitForTrue(send, sessionId, FILE_PAGE_LOADED, { attempts: 200 });
    const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }, sessionId); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result?.value; };
    await ev(WCAG_PAGE_SOURCE + '; true');
    return await fn(ev);
  } finally { close(); chrome.kill(); }
}

test('page: each WCAG 2.1 problem the page breaks once is found, and the part that is fine is left alone', { skip: HAS_CHROME ? false : 'no Chrome available', timeout: 120000 }, async () => {
  await inPage(async (ev) => {
    const good = await ev(`(async () => { const r = document.getElementById('good'); const a = window.__wcag21.check(r, { name: 'x' }); const b = await window.__wcag21.interact(r); return { f: a.findings.concat(b.findings), ran: a.ran.concat(b.ran) }; })()`);
    assert.deepEqual(good.f, [], JSON.stringify(good.f));
    for (const k of ['group', 'table', 'order', 'autocomplete', 'boundary', 'link', 'emptylabel', 'labelname', 'aria', 'status', 'hovercontent', 'onfocus', 'oninput', 'pointerdown']) assert.ok(good.ran.includes(k), `${k} was tried`);
    const bad = await ev(`(async () => { const r = document.getElementById('bad'); const a = window.__wcag21.check(r, { name: 'x' }); const b = await window.__wcag21.interact(r); return a.findings.concat(b.findings); })()`);
    const of = (k) => bad.filter((f) => f.kind === k).map((f) => f.desc);
    for (const k of ['textalt', 'group', 'table', 'context', 'order', 'autocomplete', 'boundary', 'pause', 'flash', 'link', 'labelname', 'aria', 'dupid', 'status', 'hovercontent', 'oninput', 'pointerdown']) assert.ok(of(k).length, `${k}: ${JSON.stringify(bad)}`);
    assert.ok(of('autocomplete').some((d) => /email/.test(d)));
    assert.ok(of('labelname').some((d) => /shows "Save" but is named "Submit form"/.test(d)));
    assert.equal(of('dupid').length, 1);                                              // one id used twice is said once
    assert.ok(of('aria').some((d) => /aria-hidden="true" on something Tab reaches/.test(d)));
    assert.ok(of('hovercontent').some((d) => /does not close with Escape/.test(d)));
    assert.ok(of('hovercontent').some((d) => /goes away when the pointer moves onto it/.test(d)));
    assert.ok(of('pointerdown').some((d) => /^button\.presser \(/.test(d)));       // named as it was before the press
    // A field named only by its placeholder (gone once typing starts); a role without the state it requires; a value ARIA
    // does not allow; an edge drawn in oklch, read rather than skipped.
    assert.ok(of('placeholderlabel').some((d) => /placeholder-only/.test(d)), JSON.stringify(bad));
    assert.ok(of('aria').some((d) => /bare-slider.*aria-valuenow/.test(d)), JSON.stringify(of('aria')));
    assert.ok(of('aria').some((d) => /bare-combo.*aria-expanded/.test(d)), JSON.stringify(of('aria')));
    assert.ok(of('aria').some((d) => /aria-live="loud"/.test(d)), JSON.stringify(of('aria')));
    assert.ok(of('boundary').some((d) => /faint-ok/.test(d)), JSON.stringify(of('boundary')));
    for (const f of bad) assert.ok(WCAG21.find((c) => c.sc === f.sc)?.kinds.includes(f.kind), `${f.kind} fails ${f.sc}`);
  });
});

test('audit: the browser check runs the WCAG 2.1 checks and says which ran, each finding with its criterion', { skip: HAS_CHROME ? false : 'no Chrome available', timeout: 180000 }, () => {
  const dir = makeFixture({ 'page.html': readFileSync(FIXTURE, 'utf8') });
  let out = '';
  try { out = execFileSync(process.execPath, [join(ENGINE, 'a11y-check.mjs'), '--url', pathToFileURL(join(dir, 'page.html')).href, '--json'], { cwd: dir, encoding: 'utf8', timeout: 170000, env: { ...process.env, CHROME_PATH: CHROME } }); }
  catch (e) { out = e.stdout ?? ''; }
  const d = JSON.parse(out.slice(out.indexOf('{')));
  assert.ok(d.ran.includes('wcag21'), out);
  const got = new Set(d.issues.map((i) => i.issue));
  for (const k of ['textalt', 'labelname', 'link', 'status', 'dupid']) assert.ok(got.has(k), `${k} in ${[...got]}`);
  for (const i of d.issues.filter((x) => WCAG21_GUIDE[x.issue])) assert.equal(i.wcag, WCAG21_KIND[i.issue], i.issue);
});

test('style guide: each Figma annotation says what it feeds, and one no check reads says so', async () => {
  const { annotationUses } = await import('../a11y-check.mjs');
  const uses = annotationUses({
    annotations: [{ label: 'Role: button' }, { label: 'Escape closes the dialog' }, { label: 'Sizing: fill' }, { label: 'Heading level 2' }, { label: 'Alt: Company logo' }],
    layerAnnotations: [{ layer: 'Error', annotations: [{ label: 'Role: error' }] }],
  });
  const of = (t) => uses.find((u) => u.text === t);
  assert.match(of('Role: button').uses[0], /its role \(button\)/);
  assert.deepEqual(of('Role: button').sc, ['4.1.2', '2.1.1']);
  assert.match(of('Escape closes the dialog').uses[0], /Escape closes it/);
  assert.deepEqual(of('Sizing: fill').uses, []);                       // no check reads it: the page says so
  assert.deepEqual(of('Heading level 2').uses.map((u) => u.split(' (')[0]), ['its heading level']);
  assert.match(of('Alt: Company logo').uses[0], /spoken name \("Company logo"\)/);
  assert.equal(of('Role: error').layer, 'Error');
  assert.match(of('Role: error').uses[0], /"Error" part \(errormessage\)/);
});

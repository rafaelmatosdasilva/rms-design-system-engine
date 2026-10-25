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
import { makeFixture, budget } from './helpers.mjs';
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

test('page: a tip that fades out slowly once Escape is pressed is closed, not one that stays', { skip: HAS_CHROME ? false : 'no Chrome available', timeout: budget(120000) }, async () => {
  await inPage(async (ev) => {
    const found = await ev(`(async () => {
      const box = document.createElement('div');
      box.innerHTML = '<button type="button" data-tip="Save it">Save</button><div id="slowtip" role="tooltip" style="position:fixed;top:0;left:0;width:80px;height:20px;opacity:0">Save it</div>';
      document.body.appendChild(box);
      const b = box.querySelector('button'), tip = box.querySelector('#slowtip');
      b.addEventListener('mouseover', () => { tip.style.transition = 'none'; tip.style.opacity = '1'; });
      // Escape starts a fade far longer than the check waits: in a page the browser does not draw, any fade is that.
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { tip.style.transition = 'opacity 30s'; tip.style.opacity = '0'; } });
      const r = await window.__wcag21.interact(box, { wait: 100, triggers: 1 });
      box.remove();
      return r.findings.map((f) => f.desc);
    })()`);
    assert.ok(!found.some((d) => /does not close with Escape/.test(d)), JSON.stringify(found));
  });
});

// a tip or a menu that closes when anything is pressed is not the control acting on the press (a tip must close so,
// WCAG 1.4.13); only what the press itself does counts. A control that acts on the press is still found.
test('page: a tip or a menu that closes on any press is not the pressed control acting; one that acts on the press is found', { skip: HAS_CHROME ? false : 'no Chrome available', timeout: budget(120000) }, async () => {
  await inPage(async (ev) => {
    const found = await ev(`(async () => {
      const box = document.createElement('div');
      box.innerHTML = '<button type="button" id="calm" data-tip="Tokens">Tokens</button><button type="button" id="opener" aria-expanded="false">Menu</button><ul id="menu" hidden><li>One</li></ul><button type="button" id="eager">Now</button><div id="tt" role="tooltip" class="tt">Tokens</div>';
      document.body.appendChild(box);
      const tt = box.querySelector('#tt'), opener = box.querySelector('#opener'), menu = box.querySelector('#menu'), eager = box.querySelector('#eager');
      box.querySelector('#calm').addEventListener('mouseover', () => { tt.className = 'tt visible'; });
      document.addEventListener('mousedown', () => { tt.className = 'tt'; if (!menu.hidden) { menu.hidden = true; opener.setAttribute('aria-expanded', 'false'); } });
      opener.addEventListener('click', () => { menu.hidden = false; opener.setAttribute('aria-expanded', 'true'); });
      eager.addEventListener('pointerdown', () => { eager.classList.toggle('on'); });
      const r = await window.__wcag21.interact(box, { wait: 100, triggers: 1 });
      box.remove();
      return r.findings.filter((f) => f.kind === 'pointerdown').map((f) => f.desc);
    })()`);
    assert.equal(found.length, 1, JSON.stringify(found));
    assert.match(found[0], /eager|Now/);
  });
});

test('page: each WCAG 2.1 problem the page breaks once is found, and the part that is fine is left alone', { skip: HAS_CHROME ? false : 'no Chrome available', timeout: budget(120000) }, async () => {
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

test('audit: the browser check runs the WCAG 2.1 checks and says which ran, each finding with its criterion', { skip: HAS_CHROME ? false : 'no Chrome available', timeout: budget(180000) }, () => {
  const dir = makeFixture({ 'page.html': readFileSync(FIXTURE, 'utf8') });
  let out = '';
  try { out = execFileSync(process.execPath, [join(ENGINE, 'a11y-check.mjs'), '--url', pathToFileURL(join(dir, 'page.html')).href, '--json'], { cwd: dir, encoding: 'utf8', timeout: budget(170000), env: { ...process.env, CHROME_PATH: CHROME } }); }
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

// The keys of the ARIA Authoring Practices, pressed as the component's own script hears them: a tab list that moves with
// the arrows but not Home and End, a list box that does not move at all, a combobox that opens but does not close, a menu
// button whose menu closes on Escape but leaves the focus elsewhere, a modal dialog that lets Tab out. The same, built
// right, is left alone; with keys: false nothing is pressed.
test('page: the keys of tab lists, list boxes, comboboxes, menu buttons and modal dialogs', { skip: HAS_CHROME ? false : 'no Chrome available', timeout: budget(120000) }, async () => {
  await inPage(async (ev) => {
    const run = (keys) => ev(`(async () => {
      const box = document.createElement('div');
      box.innerHTML = '<div role="tablist" id="tabs"><button role="tab" aria-selected="true">One</button><button role="tab" aria-selected="false" tabindex="-1">Two</button><button role="tab" aria-selected="false" tabindex="-1">Three</button></div>'
        + '<ul role="listbox" id="still" aria-label="Fruit"><li role="option" tabindex="0" aria-selected="true">Apple</li><li role="option" tabindex="-1">Pear</li></ul>'
        + '<input role="combobox" id="combo" aria-expanded="false" aria-controls="combo-list" aria-label="City"><ul id="combo-list" role="listbox" hidden><li role="option">Lisbon</li></ul>'
        + '<button type="button" id="opener" aria-haspopup="menu" aria-expanded="false">Actions</button><div role="menu" id="actions" hidden><button role="menuitem" tabindex="-1">Copy</button><button role="menuitem" tabindex="-1">Paste</button></div>'
        + '<div role="dialog" aria-modal="true" aria-label="Edit" id="dlg" style="position:fixed;top:0;left:0"><button type="button">Save</button><button type="button">Cancel</button></div>';
      document.body.appendChild(box);
      const tabs = [...box.querySelectorAll('[role=tab]')];
      box.querySelector('#tabs').addEventListener('keydown', (e) => { const i = tabs.indexOf(document.activeElement); if (e.key === 'ArrowRight') tabs[(i + 1) % tabs.length].focus(); });
      const combo = box.querySelector('#combo'), list = box.querySelector('#combo-list');
      combo.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown') { combo.setAttribute('aria-expanded', 'true'); list.hidden = false; } });
      const opener = box.querySelector('#opener'), menu = box.querySelector('#actions');
      opener.addEventListener('click', () => { const open = opener.getAttribute('aria-expanded') !== 'true'; opener.setAttribute('aria-expanded', String(open)); menu.hidden = !open; if (open) menu.querySelector('[role=menuitem]').focus(); });
      menu.addEventListener('keydown', (e) => { if (e.key === 'Escape') { opener.setAttribute('aria-expanded', 'false'); menu.hidden = true; document.body.focus(); } });
      const r = await window.__wcag21.interact(box, { wait: 50, triggers: 1, keys: ${keys} });
      box.remove();
      return r.findings.filter((f) => ['arrows', 'homeend', 'comboboxkeys', 'escape', 'focusreturn', 'modalescape'].includes(f.kind)).map((f) => f.kind + ': ' + f.desc);
    })()`);
    const bad = await run(true);
    const has = (re) => assert.ok(bad.some((d) => re.test(d)), `${re} in ${JSON.stringify(bad)}`);
    has(/^homeend: div#tabs .*Home and End do not go/);
    has(/^arrows: ul#still .*ArrowDown does not move/);
    has(/^comboboxkeys: input#combo .*Escape does not close its list/);
    has(/^focusreturn: button#opener .*the focus goes to/);
    has(/^modalescape: div#dlg .*Tab and Shift\+Tab can leave it/);
    assert.ok(!bad.some((d) => /^arrows: div#tabs/.test(d)), 'the tabs move with the arrows');
    assert.deepEqual(await run(false), []);
  });
});

test('page: the same patterns built right are left alone', { skip: HAS_CHROME ? false : 'no Chrome available', timeout: budget(120000) }, async () => {
  await inPage(async (ev) => {
    const found = await ev(`(async () => {
      const box = document.createElement('div');
      box.innerHTML = '<div role="tablist" id="tabs"><button role="tab" aria-selected="true">One</button><button role="tab" tabindex="-1">Two</button></div>'
        + '<input role="combobox" id="combo" aria-expanded="false" aria-label="City">'
        + '<div role="dialog" aria-modal="true" aria-label="Edit" id="dlg" style="position:fixed;top:0;left:0"><button type="button" id="a">Save</button><button type="button" id="b">Cancel</button></div>';
      document.body.appendChild(box);
      const tabs = [...box.querySelectorAll('[role=tab]')];
      box.querySelector('#tabs').addEventListener('keydown', (e) => { const i = tabs.indexOf(document.activeElement); const to = { ArrowRight: (i + 1) % 2, ArrowLeft: (i + 1) % 2, Home: 0, End: 1 }[e.key]; if (to != null) tabs[to].focus(); });
      const combo = box.querySelector('#combo');
      combo.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown') combo.setAttribute('aria-expanded', 'true'); if (e.key === 'Escape') combo.setAttribute('aria-expanded', 'false'); });
      const a = box.querySelector('#a'), b = box.querySelector('#b');
      box.querySelector('#dlg').addEventListener('keydown', (e) => { if (e.key !== 'Tab') return; if (!e.shiftKey && document.activeElement === b) { e.preventDefault(); a.focus(); } if (e.shiftKey && document.activeElement === a) { e.preventDefault(); b.focus(); } });
      const r = await window.__wcag21.interact(box, { wait: 50, triggers: 1, keys: true });
      box.remove();
      return { f: r.findings.map((f) => f.kind + ': ' + f.desc), ran: r.ran };
    })()`);
    assert.deepEqual(found.f.filter((d) => /^(arrows|homeend|comboboxkeys|modalescape)/.test(d)), []);
    for (const k of ['arrows', 'homeend', 'comboboxkeys', 'modalescape']) assert.ok(found.ran.includes(k), k);
  });
});

// What a screen reader says on each control (name, role, state), and the names that say little: a role, an icon's
// name, the role said twice; two links with the same words going to different places.
test('page: what a screen reader says, and names that say little or the same', { skip: HAS_CHROME ? false : 'no Chrome available', timeout: budget(120000) }, async () => {
  await inPage(async (ev) => {
    const r = await ev(`(() => {
      const box = document.createElement('div');
      box.innerHTML = '<button type="button" aria-pressed="true">Bold</button><button type="button" aria-expanded="false" aria-haspopup="menu">More</button>'
        + '<input type="checkbox" id="cb" checked><label for="cb">Remember me</label><input type="text" aria-label="Email" required>'
        + '<button type="button" aria-label="icon"><svg></svg></button><button type="button" aria-label="chevron-down"><svg></svg></button><button type="button" aria-label="Close button"><svg></svg></button><button type="button">Field</button>'
        + '<a href="/a">Edit</a><a href="/b">Edit</a><a href="/c">Open</a><a href="/c">Open</a>';
      document.body.appendChild(box);
      const out = window.__wcag21.check(box, { name: 'x' });
      box.remove();
      return { says: out.spoken.map((s) => s.says), f: out.findings.filter((f) => ['weakname', 'samename'].includes(f.kind)).map((f) => f.kind + ': ' + f.desc) };
    })()`);
    for (const s of ['Bold, button, pressed', 'More, button, collapsed, has popup', 'Remember me, checkbox, checked', 'Email, edit text, required']) assert.ok(r.says.includes(s), `${s} in ${JSON.stringify(r.says)}`);
    const has = (re) => assert.ok(r.f.some((d) => re.test(d)), `${re} in ${JSON.stringify(r.f)}`);
    has(/^weakname: .*"icon, button": the name says nothing/);
    has(/^weakname: .*"chevron-down, button": the name is an icon's or a file's name/);
    has(/^weakname: .*"Close button, button": the role is said twice/);
    has(/^samename: .*2 links say "Edit" and go to different places/);
    assert.equal(r.f.filter((d) => /samename/.test(d)).length, 1, 'two links to the same place are fine');
    assert.equal(r.f.filter((d) => /weakname/.test(d)).length, 3, JSON.stringify(r.f));   // a visible "Field" is the design's own words: left alone
  });
});

// A build trying the page has no person on it (person: false): the focus a component's own script moves outside it is
// never taken for a person's, so the try is never stopped (and never started again forever).
test('page: with no person on the page, focus moved outside by the component\'s own script does not stop the try', { skip: HAS_CHROME ? false : 'no Chrome available', timeout: budget(120000) }, async () => {
  await inPage(async (ev) => {
    const r = await ev(`(async () => {
      const box = document.createElement('div'), away = document.createElement('button');
      box.innerHTML = '<button type="button" id="mover">Next</button>'; away.textContent = 'Elsewhere';
      document.body.appendChild(box); document.body.appendChild(away);
      box.querySelector('#mover').addEventListener('click', () => away.focus());
      const out = {};
      try { await window.__wcag21.interact(box, { wait: 50, triggers: 2, person: false }); out.build = 'finished'; } catch (e) { out.build = e && e.interrupted ? 'interrupted' : 'error'; }
      box.remove(); away.remove();
      return out;
    })()`);
    assert.equal(r.build, 'finished');
  });
});

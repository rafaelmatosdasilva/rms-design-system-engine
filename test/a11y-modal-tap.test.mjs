// variants told apart by more than a colour some people cannot see, a state high-contrast mode keeps,
// a modal dialog that keeps the focus inside it, and a tip a tap shows as hover does. Each page breaks one rule beside a
// part that keeps it. Browser cases need Chrome.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeFixture } from './helpers.mjs';
import { modalEscape, A11Y_GUIDE, severityOf, cvdVariantFindings, colourDistance, changeLine } from '../a11y-check.mjs';
import { A11Y_WCAG } from '../styleguide-data.mjs';
import { findChrome } from '../cdp.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const CHROME = findChrome({ playwright: true });
const HAS_CHROME = !!CHROME && typeof WebSocket !== 'undefined';

const tips = (tapWorks) => `
  <span class="info" tabindex="0" data-tip="How it is counted">i</span>
  <div id="tip" role="tooltip" style="position:fixed;top:10px;left:10px;display:none;background:#000;color:#fff">x</div>
  <script>
    const el = document.querySelector('.info'), tip = document.getElementById('tip');
    let timer = null;
    const show = () => { tip.textContent = el.dataset.tip; tip.style.display = 'block'; };
    const hide = () => { clearTimeout(timer); tip.style.display = 'none'; };
    el.addEventListener('mouseover', () => { clearTimeout(timer); timer = setTimeout(show, 200); });
    el.addEventListener('mouseout', hide);
    document.addEventListener('mousedown', (e) => { if (!tip.contains(e.target)) hide(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
    ${tapWorks ? `let touched = false; document.addEventListener('pointerdown', (e) => { touched = e.pointerType !== 'mouse'; }, true);
    el.addEventListener('click', () => { if (touched) { clearTimeout(timer); show(); } });
    document.addEventListener('mousedown', (e) => { if (touched) e.stopImmediatePropagation(); }, true);` : ''}
  </script>`;
const modal = (keeps) => `
  <button id="behind">Behind the modal</button>
  <div class="overlay" style="position:fixed;inset:0;background:rgba(0,0,0,.4)">
    <div class="sheet" role="dialog" aria-modal="true" aria-label="Export" style="background:#fff;margin:40px;padding:16px">
      <button id="m1">Cancel</button> <button id="m2">Export</button>
    </div>
  </div>
  ${keeps ? `<script>
    const m1 = document.getElementById('m1'), m2 = document.getElementById('m2');
    m2.addEventListener('keydown', (e) => { if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); m1.focus(); } });
    m1.addEventListener('keydown', (e) => { if (e.key === 'Tab' && e.shiftKey) { e.preventDefault(); m2.focus(); } });
  </script>` : ''}`;
const page = (body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Tips</title></head><body><main><h1>Tips</h1>${body}</main></body></html>`;

const run = (dir, file) => {
  let out = '';
  try { out = execFileSync(process.execPath, [join(ENGINE, 'a11y-check.mjs'), '--url', pathToFileURL(join(dir, file)).href, '--json', '--no-axe'], { cwd: dir, encoding: 'utf8', timeout: 240000, env: { ...process.env, CHROME_PATH: CHROME, NO_COLOR: '1' } }); }
  catch (e) { out = (e.stdout ?? '') + (e.stderr ?? ''); }
  const at = out.indexOf('{'); assert.ok(at > -1, out);
  return JSON.parse(out.slice(at));
};

test('their words, their criteria and how a walk is read', () => {
  assert.equal(modalEscape([null, null, 'page', 'button#behind "Behind"']), 'button#behind "Behind"', 'the page itself is not an escape; a control behind the dialog is');
  assert.equal(modalEscape([null, null, null]), null);
  assert.equal(modalEscape(['closed']), null);
  for (const k of ['modalescape', 'tapcontent']) { assert.ok(A11Y_GUIDE[k].fix, k); assert.equal(severityOf(k), 'blocker'); }
  assert.deepEqual([A11Y_WCAG.modalescape, A11Y_WCAG.tapcontent], ['2.4.3', '1.4.13']);
});

test('a modal that lets Tab reach the page behind it, and a tip a tap closes as it opens, are found; the right ones pass', { skip: HAS_CHROME ? false : 'no Chrome available', timeout: 600000 }, () => {
  // A modal open over the page covers what is behind it, so each is tried on a page of its own.
  const dir = makeFixture({ 'modal-bad.html': page(modal(false)), 'modal-good.html': page(modal(true)), 'tip-bad.html': page(tips(false)), 'tip-good.html': page(tips(true)) });
  const of = (d, k) => d.issues.filter((i) => i.issue === k).map((i) => i.selector);
  const all = (d) => JSON.stringify(d.issues.map((i) => [i.issue, i.selector]));
  const mb = run(dir, 'modal-bad.html'), mg = run(dir, 'modal-good.html'), tb = run(dir, 'tip-bad.html'), tg = run(dir, 'tip-good.html');
  assert.match(of(mb, 'modalescape').join('\n'), /^div\.sheet "Export": Tab leaves it for button#behind "Behind the modal", on the page behind it/, all(mb));
  assert.deepEqual(of(mg, 'modalescape'), [], all(mg));
  assert.match(of(tb, 'tapcontent').join('\n'), /^span\.info: what it shows on hover \(div#tip "How it is counted"\) never shows on a tap$/, all(tb));
  assert.deepEqual(of(tg, 'tapcontent'), [], all(tg));
});

test('two variants that differ only by a red against a green read as one to people who do not see green; a blue one stays apart', () => {
  const v = (label, bg) => ({ label, shape: 'SPAN;none0|none0|none0|none0;600;none;Label;', colours: [bg, 'rgb(255, 255, 255)', 'rgba(0, 0, 0, 0)'] });
  const f = cvdVariantFindings([{ name: 'badge', variants: [v('badge--success', 'rgb(67, 160, 71)'), v('badge--error', 'rgb(229, 57, 53)'), v('badge--info', 'rgb(21, 101, 192)')] }]);
  assert.deepEqual(f.map((x) => [x.desc, x.vision]), [['badge: badge--success and badge--error differ only by colour, and look alike to people who do not see green (deuteranopia)', 'deuteranopia']]);
  assert.equal(cvdVariantFindings([{ name: 'badge', variants: [v('a', 'rgb(67, 160, 71)'), { ...v('b', 'rgb(229, 57, 53)'), shape: 'SPAN;other' }] }]).length, 0, 'an icon or a word apart: not colour alone');
  assert.ok(colourDistance({ r: 67, g: 160, b: 71 }, { r: 229, g: 57, b: 53 }) > 100);
  assert.equal(severityOf('cvdvariant'), 'advisory');
  assert.deepEqual([A11Y_WCAG.cvdvariant, A11Y_WCAG.forcedstate], ['1.4.1', '1.4.11']);
});

test('in the browser: red and green variants, and a selected tab drawn only by its background in high-contrast mode', { skip: HAS_CHROME ? false : 'no Chrome available', timeout: 600000 }, () => {
  const body = `<style>
    .badge { display: inline-block; padding: 4px 8px; color: #fff; font: 600 14px sans-serif; }
    .badge--success { background: #43a047; } .badge--error { background: #e53935; } .badge--info { background: #1565c0; }
    .tab, .tabok { border: 0; background: #eee; color: #111; padding: 8px; font: 14px sans-serif; }
    .tab[aria-selected=true] { background: #036; color: #fff; }
    .tabok[aria-selected=true] { background: #036; color: #fff; border-bottom: 3px solid #036; }
  </style>
  <span class="badge badge--success">Label</span> <span class="badge badge--error">Label</span> <span class="badge badge--info">Label</span>
  <div class="tabs" role="tablist"><button class="tab" role="tab" aria-selected="true">One</button><button class="tab" role="tab" aria-selected="false">Two</button></div>
  <div class="tabsok" role="tablist"><button class="tabok" role="tab" aria-selected="true">One</button><button class="tabok" role="tab" aria-selected="false">Two</button></div>`;
  const dir = makeFixture({ 'page.html': page(body), 'ds-config.json': { componentSelectors: { badge: '.badge', tabs: '.tabs', tabsok: '.tabsok' } } });
  let out = '';
  try { out = execFileSync(process.execPath, [join(ENGINE, 'a11y-check.mjs'), '--url', pathToFileURL(join(dir, 'page.html')).href, '--json', '--no-axe', '--component', 'badge,tabs,tabsok'], { cwd: dir, encoding: 'utf8', timeout: 240000, env: { ...process.env, CHROME_PATH: CHROME, NO_COLOR: '1' } }); }
  catch (e) { out = (e.stdout ?? '') + (e.stderr ?? ''); }
  const d = JSON.parse(out.slice(out.indexOf('{')));
  const of = (k) => d.issues.filter((i) => i.issue === k).map((i) => i.selector);
  const all = JSON.stringify(d.issues.map((i) => [i.issue, i.selector]));
  assert.deepEqual(of('cvdvariant'), ['badge: badge--success and badge--error differ only by colour, and look alike to people who do not see green (deuteranopia)'], all);
  assert.deepEqual(of('forcedstate'), ['button.tab "One" (selected)'], all);
});

test('what a screen reader says when a press shows a toast; one put in no live region is said unheard', { skip: HAS_CHROME ? false : 'no Chrome available', timeout: 600000 }, () => {
  assert.equal(changeLine({ said: [{ how: 'politely', text: 'Saved' }], focus: null }), 'says "Saved" politely');
  assert.equal(changeLine({}), 'says nothing, and the focus stays where it was');
  const toast = (live) => page(`<button id="go">Show toast</button>${live ? '<div class="region" role="status"></div>' : ''}
    <script>document.getElementById('go').addEventListener('click', () => { const t = document.createElement('div'); t.className = 'toast'; t.textContent = 'Saved'; ${live ? "document.querySelector('.region')" : 'document.querySelector("main")'}.appendChild(t); });</script>`);
  const dir = makeFixture({ 'bad.html': toast(false), 'good.html': toast(true), 'ds-config.json': { componentSelectors: { toast: '.toast' } } });
  const go = (file) => { let out = ''; try { out = execFileSync(process.execPath, [join(ENGINE, 'a11y-check.mjs'), '--url', pathToFileURL(join(dir, file)).href, '--json', '--no-axe', '--component', 'toast'], { cwd: dir, encoding: 'utf8', timeout: 240000, env: { ...process.env, CHROME_PATH: CHROME, NO_COLOR: '1' } }); } catch (e) { out = (e.stdout ?? '') + (e.stderr ?? ''); } return JSON.parse(out.slice(out.indexOf('{'))); };
  const bad = go('bad.html'), good = go('good.html');
  const of = (d, k) => d.issues.filter((i) => i.issue === k).map((i) => i.selector);
  assert.deepEqual(of(bad, 'unannounced'), ['div.toast "Saved" (shown by pressing "Show toast"): in no live region, and the focus does not go to it'], JSON.stringify(bad.issues.map((i) => [i.issue, i.selector])));
  assert.deepEqual(bad.heardOnChange.map((c) => [c.what, c.says]), [['pressing "Show toast" shows toast', 'says nothing, and the focus stays where it was']], 'the button pressed keeps its focus: no move');
  assert.deepEqual(of(bad, 'status'), [], 'said once, with what showed it');
  assert.deepEqual(of(good, 'unannounced'), [], JSON.stringify(good.issues.map((i) => [i.issue, i.selector])));
  assert.deepEqual(good.heardOnChange.map((c) => [c.what, c.says]), [['pressing "Show toast" shows toast', 'says "Saved" politely']]);
});

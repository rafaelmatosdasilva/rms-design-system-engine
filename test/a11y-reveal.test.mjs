// A component shown only after an action is opened before it is checked (E31): a modal behind its "Show modal" button,
// a menu kept hidden until its trigger is pressed. Its likely openers are pressed in turn (those that name it first),
// never one that deletes or submits; what opened it is said, and a component no press showed is never called clean.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeFixture } from './helpers.mjs';
import { revealWords } from '../a11y-check.mjs';
import { findChrome } from '../cdp.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const CHROME = findChrome({ playwright: true });
const HAS_CHROME = !!CHROME && typeof WebSocket !== 'undefined';
const run = (dir, component) => {
  try { return execFileSync(process.execPath, [join(ENGINE, 'a11y-check.mjs'), '--component', component, '--url', pathToFileURL(join(dir, 'page.html')).href, '--json'], { cwd: dir, encoding: 'utf8', timeout: 120000, env: { ...process.env, CHROME_PATH: CHROME } }); }
  catch (e) { return e.stdout ?? ''; }
};
const result = (out) => JSON.parse(out.slice(out.indexOf('{\n')));

test('the words a component\'s name gives, to find what opens it', () => {
  assert.deepEqual(revealWords(['confirmModal', 'date-picker', 'toast']), [['confirm', 'modal'], ['date', 'picker'], ['toast']]);
});

test('a modal added by its "Show" button is opened, then checked open', { skip: HAS_CHROME ? false : 'no Chrome available', timeout: 150000 }, () => {
  const page = `<!doctype html><html><head><title>Modal</title></head><body><main><h1>Modal</h1>
    <button type="button" onclick="document.title = 'other'">Other</button>
    <button type="button" id="show" onclick="document.body.insertAdjacentHTML('beforeend', '<div class=&quot;modal&quot; role=&quot;dialog&quot; aria-modal=&quot;true&quot; aria-label=&quot;Settings&quot;><p>Saved</p><button type=&quot;button&quot;><svg width=&quot;16&quot; height=&quot;16&quot;></svg></button></div>')">Show Modal</button>
  </main></body></html>`;
  const dir = makeFixture({ 'page.html': page, 'ds-config.json': { componentSelectors: { modal: '.modal' } } });
  const out = run(dir, 'modal');
  assert.match(out, /ℹ️ {2}\[a11y\] modal on .*page\.html: opened by pressing "Show Modal", then checked open/, out);
  const d = result(out);
  assert.deepEqual(d.opened.length, 1, out);
  assert.ok(d.issues.some((i) => i.issue === 'name' || /no accessible name/.test(i.selector ?? '')), 'the button inside it, with no name, is found: ' + out);
  assert.equal(d.notRead, undefined, out);
});

test('a menu kept hidden until its trigger is pressed is opened by the trigger that says it opens something', { skip: HAS_CHROME ? false : 'no Chrome available', timeout: 150000 }, () => {
  const page = `<!doctype html><html><head><title>Menu</title></head><body><main><h1>Menu</h1>
    <button type="button">Help</button>
    <button type="button" aria-expanded="false" aria-controls="m" onclick="var m = document.getElementById('m'); m.hidden = !m.hidden; this.setAttribute('aria-expanded', String(!m.hidden))">Actions</button>
    <ul id="m" class="menu" role="menu" hidden><li role="menuitem" tabindex="-1">Rename</li></ul>
  </main></body></html>`;
  const dir = makeFixture({ 'page.html': page, 'ds-config.json': { componentSelectors: { menu: '.menu' } } });
  const out = run(dir, 'menu');
  assert.match(out, /menu on .*page\.html: opened by pressing "Actions"/, out);
});

test('a press that deletes or submits is never tried, and a component nothing opened is not called clean', { skip: HAS_CHROME ? false : 'no Chrome available', timeout: 150000 }, () => {
  const page = `<!doctype html><html><head><title>Danger</title></head><body><main><h1>Danger</h1>
    <button type="button" onclick="document.body.insertAdjacentHTML('beforeend', '<div class=&quot;modal&quot; role=&quot;dialog&quot; aria-label=&quot;Gone&quot;>Deleted</div>')">Delete everything</button>
  </main></body></html>`;
  const dir = makeFixture({ 'page.html': page, 'ds-config.json': { componentSelectors: { modal: '.modal' } } });
  const out = run(dir, 'modal');
  assert.doesNotMatch(out, /opened by pressing/, out);
  assert.match(out, /no control on the page could open it/, out);
});

// What a screen reader is given, in each component's contract (contract-a11y.mjs): read from the code's markup, measured
// in a browser on every variant by the style guide's build (wcag-page.js facts, kept in the output folder's
// a11y-facts.json), each fact with where it came from, and each state whose facts differ. Browser cases need Chrome.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { markupFacts, measuredFacts, withA11yFacts, factsFile, writeA11yFacts, readA11yFacts, a11yFactsPath } from '../lib/contract-a11y.mjs';
import { WCAG_PAGE_SOURCE } from '../lib/wcag21.mjs';
import { findChrome, launchChrome, connectCDP, openPage, waitForTrue, FILE_PAGE_LOADED } from '../lib/cdp.mjs';
import { makeFixture, fixtureProject, budget } from './helpers.mjs';
import { OUT_DIR } from '../lib/names.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const CHROME = findChrome({ playwright: true });
const HAS_CHROME = !!CHROME && typeof WebSocket !== 'undefined';

test('code: the role, how the name is given, the states, whether Tab reaches it and its keys, from its own markup', () => {
  const jsx = (body) => `export function Acme(props) { return (${body}); }`;
  // A button whose words are a prop: its name is that prop's.
  assert.deepEqual(markupFacts(jsx('<button className="acme-chip" type="button" disabled={props.off}><span aria-hidden="true" /><span>{label}</span></button>'), { props: ['label', 'off'] }),
    { role: 'button', name: 'prop:label', states: ['disabled'], focusable: true, keyboard: ['Enter', 'Space'] });
  // An icon button named by aria-label, words or a prop.
  assert.equal(markupFacts(jsx('<button type="button" aria-label="Close"><svg /></button>')).name, 'aria-label');
  assert.equal(markupFacts(jsx('<button type="button" aria-label={title}><svg /></button>'), { props: ['title'] }).name, 'prop:title');
  // A div made a button: its own keys, read from its handler; its state, bound.
  assert.deepEqual(markupFacts(jsx(`<div role="button" tabIndex={0} aria-expanded={open} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') go(); if (e.key === 'Escape') shut(); }}>Row</div>`), { props: ['open'] }),
    { role: 'button', name: 'content', states: ['aria-expanded'], focusable: true, keyboard: ['Enter', 'Escape', 'Space'] });
  // A field named by its label.
  assert.deepEqual(markupFacts(jsx('<div className="acme-field"><label htmlFor="x">Name</label><input id="x" required /></div>')), { role: 'textbox', name: 'label', states: ['required'], focusable: true, keyboard: [] });
  // Vue: a link whose words are a prop, a key its modifier answers.
  assert.deepEqual(markupFacts('<template><a class="acme-link" :href="to" @keydown.esc="close">{{ text }}</a></template>', { props: ['to', 'text'] }),
    { role: 'link', name: 'prop:text', states: [], focusable: true, keyboard: ['Enter', 'Escape'] });
  // Nothing Tab reaches: said so. A tabindex of -1 keeps it out.
  assert.deepEqual(markupFacts(jsx('<span className="acme-tag">New</span>')), { focusable: false, keyboard: [] });
  assert.equal(markupFacts(jsx('<a href="#x" tabIndex="-1">Skip</a>')).focusable, false);
  // What the code alone cannot say is left to the browser, never guessed: a root that is another component, a role
  // bound to an expression, another component inside that may hold a control.
  assert.equal(markupFacts(jsx('<Button kind="x">Go</Button>')), null);
  assert.equal(markupFacts(jsx('<div role={role}>x</div>'), { props: ['role'] }), null);
  assert.deepEqual(markupFacts(jsx('<div className="acme-card"><Icon /></div>')), null);
});

test('browser: the facts most variants hold, and each state that differs with only what tells it apart', () => {
  const on = { role: 'button', name: 'content', states: ['aria-pressed'], focusable: true, keys: ['Enter', 'Space'] };
  const off = { role: 'button', name: 'content', states: ['aria-pressed', 'disabled'], focusable: false, keys: [] };
  const live = { facts: [
    { f: on, when: [{ Size: 'M', Disabled: 'False' }, { Size: 'L', Disabled: 'False' }] },
    { f: off, when: [{ Size: 'M', Disabled: 'True' }, { Size: 'L', Disabled: 'True' }] },
  ] };
  assert.deepEqual(measuredFacts(live), {
    role: 'button', name: 'content', states: ['aria-pressed'], focusable: true, keyboard: ['Enter', 'Space'],
    byState: [{ when: { Disabled: 'True' }, states: ['aria-pressed', 'disabled'], focusable: false, keyboard: [] }],
  });
  assert.equal(measuredFacts({ ran: {} }), null, 'a result from before the facts were kept gives none');
  // The audit's file: the default theme's, each component with the day it was measured.
  const file = factsFile({ default: { chip: { live } }, retail: { chip: { live: { facts: [] } } } }, '2026-10-30T10:00:00.000Z');
  assert.equal(file.components.chip.at, '2026-10-30');
  assert.equal(file.components.chip.byState.length, 1);
});

test('contract: the browser first, Figma and the code kept beside it where they say otherwise; the code makes the name exact', () => {
  const acc = { element: { value: 'button', from: 'authored' }, role: { value: 'togglebutton', from: 'figma' } };
  const code = { role: 'button', name: 'prop:label', states: [], focusable: true, keyboard: ['Enter', 'Space'] };
  const measured = { role: 'button', name: 'content', states: [], focusable: true, keyboard: ['Enter', 'Space'], byState: [{ when: { Disabled: 'True' }, focusable: false, keyboard: [] }], at: '2026-10-30' };
  assert.deepEqual(withA11yFacts(acc, { code, measured }), {
    element: { value: 'button', from: 'authored' },
    role: { value: 'button', from: 'measured', differs: [{ value: 'togglebutton', from: 'figma' }] },
    name: { value: 'prop:label', from: 'code', measured: 'content' },
    states: { value: [], from: 'measured' }, focusable: { value: true, from: 'measured' }, keyboard: { value: ['Enter', 'Space'], from: 'measured' },
    byState: [{ when: { Disabled: 'True' }, focusable: false, keyboard: [], from: 'measured' }],
    measuredAt: '2026-10-30',
  });
  // The team's own word on its role stays first. With only the code, each fact says so.
  assert.deepEqual(withA11yFacts({ role: { value: 'switch', from: 'authored' } }, { measured: { ...measured, byState: [] } }).role, { value: 'switch', from: 'authored', differs: [{ value: 'button', from: 'measured' }] });
  assert.deepEqual(withA11yFacts(null, { code }).name, { value: 'prop:label', from: 'code' });
  assert.equal(withA11yFacts(null, {}), null, 'nothing known, nothing written');
});

test('the facts file keeps what an earlier build measured for the components a later one did not try', () => {
  const dir = makeFixture({});
  writeA11yFacts(dir, { at: 't1', components: { chip: { role: 'button' }, tag: { role: null } } });
  writeA11yFacts(dir, { at: 't2', components: { chip: { role: 'switch' } } });
  const f = readA11yFacts(dir);
  assert.equal(f.at, 't2');
  assert.deepEqual(f.components, { chip: { role: 'switch' }, tag: { role: null } });
  assert.equal(writeA11yFacts(dir, { at: 't3', components: {} }), false, 'a build that measured nothing leaves the file as it was');
});

async function inPage(fn) {
  const chrome = await launchChrome(CHROME);
  const { send, close } = await connectCDP(chrome.wsUrl);
  try {
    const { sessionId } = await openPage(send, pathToFileURL(join(ENGINE, 'test', 'fixtures', 'wcag21', 'page.html')).href);
    await waitForTrue(send, sessionId, FILE_PAGE_LOADED, { attempts: 200 });
    const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }, sessionId); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result?.value; };
    await ev(WCAG_PAGE_SOURCE + '; true');
    return await fn(ev);
  } finally { close(); chrome.kill(); }
}

test('page: each control as the browser gives it to a screen reader', { skip: HAS_CHROME ? false : 'no Chrome available', timeout: budget(120000) }, async () => {
  await inPage(async (ev) => {
    const got = await ev(`(() => {
      const box = document.createElement('div');
      box.innerHTML = '<button type="button" id="a">Save</button><button type="button" id="b" disabled aria-pressed="false">Save</button><a id="c" href="#x">More</a>'
        + '<button type="button" id="d" aria-label="Close"><svg width="10" height="10"></svg></button><div id="e"><label for="f">Name</label><input id="f" required></div><span id="g">New</span>'
        + '<div id="h" role="switch" aria-checked="false" tabindex="0">Wifi</div>';
      document.body.appendChild(box);
      const out = {}; for (const id of 'abcdegh') out[id] = window.__wcag21.facts(document.getElementById(id));
      box.remove(); return out;
    })()`);
    assert.deepEqual(got.a, { role: 'button', name: 'content', states: [], focusable: true, keys: ['Enter', 'Space'] });
    assert.deepEqual(got.b, { role: 'button', name: 'content', states: ['aria-pressed', 'disabled'], focusable: false, keys: [] }, 'disabled: Tab passes it by');
    assert.deepEqual(got.c, { role: 'link', name: 'content', states: [], focusable: true, keys: ['Enter'] });
    assert.equal(got.d.name, 'aria-label');
    assert.deepEqual(got.e, { role: 'textbox', name: 'label', states: ['required'], focusable: true, keys: [] }, 'a field inside its root, named by its label');
    assert.deepEqual(got.g, { role: null, name: null, states: [], focusable: false, keys: [] });
    assert.deepEqual(got.h, { role: 'switch', name: 'content', states: ['aria-checked'], focusable: true, keys: [] }, 'no native keys for a role a script gives');
  });
});

test('demo system: the style guide\'s build measures each component, and its contract says what a screen reader is given', { skip: HAS_CHROME ? false : 'no Chrome available', timeout: budget(300000) }, async () => {
  const dir = fixtureProject(join(ENGINE, 'test', 'fixtures', 'demo-ds'), 'a11y-facts-');
  const r = spawnSync(process.execPath, [join(ENGINE, 'lib', 'audit.mjs'), '--styleguide'], { cwd: dir, encoding: 'utf8', timeout: budget(280000), env: { ...process.env, NO_COLOR: '1', CHROME_PATH: CHROME } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(existsSync(a11yFactsPath(dir)), 'kept in the output folder for the contracts');
  const { generateContracts } = await import('../lib/contract-gen.mjs');
  const cfg = JSON.parse(readFileSync(join(dir, 'ds-config.json'), 'utf8'));
  const built = await generateContracts(dir, cfg, { force: true });
  assert.deepEqual(built.invalid, [], JSON.stringify(built.invalid));
  const acc = (n) => JSON.parse(readFileSync(join(built.outDir, `${n}.contract.json`), 'utf8')).accessibility;
  // The chip is a toggle button in Figma; the team's contract and the browser say a plain button, and the contract says both.
  const chip = acc('chip');
  assert.deepEqual(chip.role, { value: 'button', from: 'authored', differs: [{ value: 'togglebutton', from: 'figma' }] });
  assert.deepEqual(chip.name, { value: 'prop:label', from: 'code', measured: 'content' });
  assert.deepEqual(chip.states, { value: [], from: 'measured' }, 'no aria-pressed: nothing tells a screen reader it is on');
  assert.deepEqual([chip.focusable, chip.keyboard], [{ value: true, from: 'measured' }, { value: ['Enter', 'Space'], from: 'measured' }]);
  assert.match(chip.measuredAt, /^\d{4}-\d{2}-\d{2}$/);
  // The field: a text box named by its label.
  assert.deepEqual([acc('field').role, acc('field').name], [{ value: 'textbox', from: 'measured' }, { value: 'label', from: 'measured' }]);
});

// The sweep starts a moment after the Status page shows; a page still loading then (a web font, an image) had each
// component's check wait for the load while the sweep passed it untried, so its facts were never measured.
test('demo system: a page that is still loading when its sweep starts still has every component measured', { skip: HAS_CHROME ? false : 'no Chrome available', timeout: budget(240000) }, async () => {
  const dir = fixtureProject(join(ENGINE, 'test', 'fixtures', 'demo-ds'), 'a11y-slow-');
  const r = spawnSync(process.execPath, [join(ENGINE, 'lib', 'audit.mjs'), '--styleguide', '--no-a11y-bake'], { cwd: dir, encoding: 'utf8', timeout: budget(200000), env: { ...process.env, NO_COLOR: '1', CHROME_PATH: CHROME } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const { createServer } = await import('node:http');
  const gif = Buffer.from('R0lGODlhAQABAAAAACw=', 'base64');
  const server = createServer((q, res) => setTimeout(() => { res.writeHead(200, { 'content-type': 'image/gif' }); res.end(gif); }, 2500));
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  try {
    const page = join(dir, OUT_DIR, 'styleguide', 'index.html');
    writeFileSync(page, readFileSync(page, 'utf8').replace('</body>', `<img src="http://127.0.0.1:${server.address().port}/slow.gif" alt="">\n</body>`));
    const { bakeA11y } = await import('../lib/styleguide-bake.mjs');
    const b = await bakeA11y(page, { chromePath: CHROME, jobs: 3 });
    assert.deepEqual(b.unmeasured, []);
    const facts = factsFile(b.themes).components;
    assert.deepEqual(Object.keys(facts).sort(), ['button', 'chip', 'field'], 'every component measured');
    assert.deepEqual([facts.field.role, facts.field.name], ['textbox', 'label']);
  } finally { server.close(); }
});

test('bake: each page tries every jobs-th component by name, as the page shares them out', async () => {
  const { shareOf } = await import('../lib/styleguide-bake.mjs');
  assert.deepEqual([0, 1].map((i) => shareOf(['field', 'button', 'chip'], i, 2)), [['button', 'field'], ['chip']]);
});

test('code: a JSX or TSX component gives its element, its role and its ARIA from what it returns, as a Vue template does', async () => {
  const { accessibilityOf } = await import('../lib/contract-code.mjs');
  assert.deepEqual(accessibilityOf("export function AcmeChip({ label, on }) { return (<button className='acme-chip' type='button' aria-pressed={on}><span aria-hidden='true' />{label}</button>); }"),
    { element: { value: 'button', from: 'code' }, aria: { value: ['aria-pressed', 'aria-hidden'], from: 'code' } });
  assert.deepEqual(accessibilityOf("type Props = { title: string };\nexport const AcmeCard = ({ title }: Props): JSX.Element => <section role=\"region\" aria-label={title} className=\"acme-card\" />;"),
    { element: { value: 'section', from: 'code' }, role: { value: 'region', from: 'code' }, aria: { value: ['aria-label'], from: 'code' } });
  // Its root another component: no element of its own is said. The team's word still is.
  assert.equal(accessibilityOf('export function AcmeWrap() { return <Button>Go</Button>; }'), null);
  assert.deepEqual(accessibilityOf('export function AcmeWrap() { return <Button>Go</Button>; }', { authored: { element: 'a' } }), { element: { value: 'a', from: 'authored' } });
});

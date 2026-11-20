// A Figma slot whose content the component's own markup already holds (a group's radios) is drawn with that content,
// marked as the slot over it in Inspect only: a dashed area named for the slot. The content is not the component's, so
// the preview and its thumbnail show it unmarked. It is never swapped for an empty box, which left a group showing only
// an empty slot with its radios hidden, so its preview, its thumbnail and the checks that read the preview all missed
// the real component. The code shown is the component's, with no mark of the Playground's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fixtureProject, budget } from './helpers.mjs';
import { findChrome, launchChrome, connectCDP, openPage, waitForTrue } from '../lib/cdp.mjs';
import { templateText } from '../lib/styleguide-template.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const CHROME = findChrome({ playwright: true });

// The demo system with two more components, invented: choiceGroup, a slot its markup fills with radios and a switch for
// its own label, and radio, each of those radios a component of the system's own.
function choiceGroupProject() {
  const dir = fixtureProject(join(ENGINE, 'test', 'fixtures', 'demo-ds'), 'sg-slot-');
  const edit = (p, fn) => writeFileSync(join(dir, p), fn(readFileSync(join(dir, p), 'utf8')));
  edit('src/figma-component-props.snapshot.json', (s) => JSON.stringify({ ...JSON.parse(s), choiceGroup: { nodeId: '40:1', properties: { 'showLabel#2:0': { type: 'BOOLEAN', defaultValue: false }, 'Options#1:0': { type: 'SLOT' } }, annotations: [] }, radio: { nodeId: '41:1', properties: { 'label#3:0': { type: 'TEXT', defaultValue: 'Basic' } }, annotations: [] } }));
  edit('ds-config.json', (s) => { const c = JSON.parse(s); c.componentFiles.choiceGroup = 'src/components/ChoiceGroup.jsx'; c.componentFiles.radio = 'src/components/Radio.jsx'; return JSON.stringify(c); });
  edit('structure-contract.mjs', (s) => s.replace("  field: { main: '.tp-field' },\n", "  field: { main: '.tp-field' },\n  choiceGroup: { main: '.tp-choice-group' },\n  radio: { main: '.tp-radio' },\n"));
  writeFileSync(join(dir, 'src', 'components', 'ChoiceGroup.jsx'), 'export function ChoiceGroup({ showLabel = false, children }) {\n  return <div className="tp-choice-group" role="radiogroup" aria-label="Plan">{showLabel && <span className="tp-choice-group__label">Plan</span>}{children}</div>;\n}\n');
  writeFileSync(join(dir, 'src', 'components', 'Radio.jsx'), 'export function Radio({ label = \'Basic\' }) {\n  return <label className="tp-radio"><input type="radio" name="plan" /><span className="tp-radio__mark" /><span className="tp-radio__label">{label}</span></label>;\n}\n');
  const radio = (word, on) => `<label class="tp-radio"><input type="radio" name="plan"${on ? ' checked' : ''}><span class="tp-radio__mark"></span><span class="tp-radio__label">${word}</span></label>`;
  edit('apps/gallery/ui.html', (s) => s.replace('</main>', `  <div class="tp-choice-group" role="radiogroup" aria-label="Plan">${radio('Basic', true)}${radio('Pro', false)}</div>\n</main>`));
  appendFileSync(join(dir, 'src', 'theme.css'), '\n.tp-choice-group { display: flex; flex-direction: column; gap: 8px; }\n.tp-radio { display: flex; gap: 8px; align-items: center; }\n.tp-radio__mark { width: 12px; height: 12px; border: 1px solid; border-radius: 50%; }\n');
  return dir;
}

test('a slot its markup already fills shows that content, marked as the slot in Inspect only, and the code shown has no mark', { skip: CHROME && typeof WebSocket !== 'undefined' ? false : 'no Chrome available', timeout: budget(300000) }, async () => {
  const dir = choiceGroupProject();
  const r = spawnSync(process.execPath, [join(ENGINE, 'lib', 'audit.mjs'), '--styleguide', '--no-a11y-bake'], { cwd: dir, encoding: 'utf8', timeout: budget(250000), env: { ...process.env, NO_COLOR: '1' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Style guide check: the page uses only the system/, 'the mark is drawn with the page\'s own tokens');
  const file = join(dir, '.design-system-engine-out', 'styleguide', 'index.html');
  const browser = await launchChrome(CHROME, { tmpPrefix: 'sg-slot-' });
  const { send, close } = await connectCDP(browser.wsUrl);
  try {
    const { sessionId } = await openPage(send, pathToFileURL(file).href + '#c-choiceGroup');
    const read = `(() => {
      const g = document.querySelector('#c-choiceGroup .pg-preview .tp-choice-group'); if (!g) return null;
      const box = (n) => n.getBoundingClientRect();
      const mark = g.querySelector(':scope > .pg-slot-area');
      const radios = [...g.querySelectorAll('.tp-radio')];
      const code = document.querySelector('#c-choiceGroup .pg-code pre code');
      const thumb = document.querySelector('.sg-thumb .tp-choice-group');
      return JSON.stringify({
        shown: radios.map((k) => getComputedStyle(k).display !== 'none' && getComputedStyle(k).visibility !== 'hidden' && box(k).height > 0),
        gone: g.querySelectorAll('.pg-slot-gone').length,
        marks: g.querySelectorAll('.tp-radio__mark').length, words: radios.map((k) => k.textContent.trim()),
        mark: mark && { slot: mark.getAttribute('data-slot'), hidden: mark.getAttribute('aria-hidden'), display: getComputedStyle(mark).display },
        code: code ? code.textContent : '',
        thumbRadios: thumb ? thumb.querySelectorAll('.tp-radio:not(.pg-slot-gone)').length : -1,
        thumbMark: thumb ? [...thumb.querySelectorAll('.pg-slot-over')].map((n) => getComputedStyle(n).display) : null,
      });
    })()`;
    await waitForTrue(send, sessionId, `${read} !== null && document.querySelector('#c-choiceGroup .pg-code pre code').textContent.length > 0`, { attempts: 400, intervalMs: 50 });
    const v = JSON.parse((await send('Runtime.evaluate', { expression: read, returnByValue: true }, sessionId)).result.value);
    assert.deepEqual(v.shown, [true, true], 'both radios show in the preview');
    assert.equal(v.gone, 0, 'nothing of the content is hidden');
    // The group's label switch is off and its part a guess (a label, a text, a span): it hides the group's own label,
    // never each radio's, which are another component's parts.
    assert.equal(v.marks, 2, 'each radio keeps its mark');
    assert.deepEqual(v.words, ['Basic', 'Pro'], 'and its words');
    assert.ok(v.mark, 'the slot is marked');
    assert.equal(v.mark.slot, 'Slot Options', 'named for the slot');
    assert.equal(v.mark.hidden, 'true', 'the mark is the page\'s, never read out');
    assert.equal(v.mark.display, 'none', 'and unseen in the preview: the content is not the component\'s');
    assert.ok(v.code.trim(), 'the code is shown');
    assert.doesNotMatch(v.code, /pg-slot/, 'with no mark of the Playground\'s');
    assert.equal(v.thumbRadios, 2, 'the Index card\'s thumbnail shows the radios too');
    assert.deepEqual(v.thumbMark, ['none'], 'unmarked');
    // Beside Inspect, a button named for the slot says it is there, and marks its area in the preview while pressed.
    const shownMark = `(() => { const b = [...document.querySelectorAll('#c-choiceGroup .pg-stage-tools button')].find((x) => x.textContent.trim() === 'Slot Options'); if (!b) return null;
      const struck = () => b.querySelectorAll('.sg-link-mark path').length;
      const eyeBefore = struck(); b.click(); const g = document.querySelector('#c-choiceGroup .pg-preview .tp-choice-group'), mark = g.querySelector(':scope > .pg-slot-over'), box = (n) => n.getBoundingClientRect();
      const r = { eye: [eyeBefore, struck()], pressed: b.getAttribute('aria-pressed'), display: getComputedStyle(mark).display, covers: [...g.querySelectorAll('.tp-radio')].every((k) => { const a = box(k), m = box(mark); return a.left >= m.left - 1 && a.right <= m.right + 1 && a.top >= m.top - 1 && a.bottom <= m.bottom + 1; }) };
      b.click(); r.after = [b.getAttribute('aria-pressed'), getComputedStyle(mark).display]; return JSON.stringify(r); })()`;
    const sm = JSON.parse((await send('Runtime.evaluate', { expression: shownMark, returnByValue: true }, sessionId)).result.value);
    assert.deepEqual(sm, { eye: [2, 1], pressed: 'true', display: 'block', covers: true, after: ['false', 'none'] }, 'its eye struck through, then open while the area shows over the radios, and the area goes again');
    // Inspect: the slot is marked over its content, named, and clicked it says what it is.
    await send('Runtime.evaluate', { expression: `[...document.querySelectorAll('#c-choiceGroup button')].find((b) => b.textContent.trim() === 'Inspect').click()` }, sessionId);
    const inspect = `(() => {
      const w = document.querySelector('#c-choiceGroup .pg-anat-wrap'); const mark = w && w.querySelector('.pg-slot-over'); if (!mark || !mark.getBoundingClientRect().width) return null;
      const box = (n) => n.getBoundingClientRect(), radios = [...w.querySelectorAll('.tp-radio')];
      return JSON.stringify({ outline: getComputedStyle(mark).outlineStyle, events: getComputedStyle(mark).pointerEvents, label: getComputedStyle(mark, '::after').content,
        covers: radios.length === 2 && radios.every((k) => { const a = box(k), m = box(mark); return a.left >= m.left - 1 && a.right <= m.right + 1 && a.top >= m.top - 1 && a.bottom <= m.bottom + 1; }) });
    })()`;
    await waitForTrue(send, sessionId, `${inspect} !== null`, { attempts: 400, intervalMs: 50 });
    const m = JSON.parse((await send('Runtime.evaluate', { expression: inspect, returnByValue: true }, sessionId)).result.value);
    assert.equal(m.outline, 'dashed', 'drawn dashed, as every slot area');
    assert.equal(m.label, '"Slot Options"', 'its name drawn');
    assert.equal(m.events, 'none', 'never in the way of a click');
    assert.ok(m.covers, 'the mark is the area the content takes, as Inspect lays it out');
  } finally { close(); browser.kill(); }
});

test('only a slot with nothing to show is an empty area in its place', () => {
  const tpl = templateText();
  assert.match(tpl, /if \(rs\.length\) \{[\s\S]*?fill\.classList\.add\('pg-slot-over'\);[\s\S]*?return;\n {10}\}/, 'content to show: marked over it');
  assert.match(tpl, /\.pg-slot-area\.pg-slot-over \{ display: none;/, 'unseen in the preview and the thumbnails');
  assert.match(tpl, /\.pg-anat-wrap \.pg-slot-area\.pg-slot-over, \.pg-slots-shown \.pg-slot-area\.pg-slot-over \{ display: block; \}/, 'seen in Inspect, and while its button is pressed');
  assert.match(tpl, /el\.insertBefore\(fill, kids\[0\] \|\| null\);\n {10}kids\.forEach\(function \(k\) \{ k\.classList\.add\('pg-slot-gone'\); \}\);/, 'none: the empty area, as before');
});

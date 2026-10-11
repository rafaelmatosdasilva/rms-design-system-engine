// The whole accessibility check in one run: axe-core's rules beside the engine's own, each control's text and edge
// measured again while hovered, focused and pressed, what a script makes clickable that Tab never reaches, a trap that
// goes round a few controls or holds only with Shift+Tab, target size by the WCAG circle and the comfortable touch size,
// each component on a 320px screen, text that spills when spacing grows, WCAG 2.2's new criteria, high-contrast mode,
// colour vision, every element accounted for and what a screen reader says. One small page breaks each rule once; the
// check names each problem and leaves the parts that are fine alone. Browser cases need Chrome.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeFixture } from './helpers.mjs';
import { axeFindings, elementKey, tabTrap, spokenLine, cvdFindings, cvdLuminance, accountFor, a11ySummaryLines, guideFor, severityOf, A11Y_GUIDE, a11yVerdict, AXE_SAME } from '../a11y-check.mjs';
import { WCAG22, WCAG22_NEW, WCAG_KIND, WCAG21_GUIDE } from '../wcag21.mjs';
import { findChrome } from '../cdp.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const CHROME = findChrome({ playwright: true });
const HAS_CHROME = !!CHROME && typeof WebSocket !== 'undefined';

test('WCAG 2.2 at A and AA: the 55 criteria, 4.1.1 gone (a duplicate id counted under 4.1.2), the six new ones each covered', () => {
  assert.equal(WCAG22.length, 55);
  assert.equal(WCAG22.filter((c) => c.level === 'A').length, 31);
  assert.equal(WCAG22.filter((c) => c.level === 'AA').length, 24);
  assert.ok(!WCAG22.some((c) => c.sc === '4.1.1'));
  assert.deepEqual(WCAG22_NEW.map((c) => c.sc), ['2.4.11', '2.5.7', '2.5.8', '3.2.6', '3.3.7', '3.3.8']);
  assert.equal(WCAG_KIND.dupid, '4.1.2');
  assert.equal(WCAG_KIND.target, '2.5.8');
  assert.equal(WCAG_KIND.obscured, '2.4.11');
  assert.equal(WCAG_KIND.authpaste, '3.3.8');
  for (const k of ['statecontrast', 'stateedge', 'target44', 'cvdcontrast', 'forcedcontrast', 'dragging', 'authpaste', 'authfill', 'fakelink']) assert.ok(A11Y_GUIDE[k]?.fix, `${k} has words`);
  for (const k of ['dragging', 'authpaste', 'authfill', 'fakelink']) assert.match(WCAG21_GUIDE[k].title(1), /^One /, k);
  assert.equal(severityOf('authpaste'), 'blocker');
  assert.equal(severityOf('target44'), 'advisory');
  assert.equal(severityOf('cvdcontrast'), 'advisory');
  assert.match(a11yVerdict([]).line, /WCAG 2\.2 AA$/);
});

test('axe-core: one finding per rule, the elements the engine already reports for the same problem left to the engine', () => {
  const engine = [{ kind: 'contrast', desc: 'span.lbl in .chip' }, { kind: 'name', desc: '<button> with no accessible name', el: 'button.icon' }];
  const rows = axeFindings([
    { id: 'color-contrast', help: 'Elements must meet minimum color contrast ratio thresholds', impact: 'serious', tags: ['wcag143'], nodes: [{ target: '.chip span', desc: 'span.lbl in .chip' }, { target: '.tag', desc: 'span.tag in .tag', summary: 'Fix any of the following: contrast 2.1' }] },
    { id: 'button-name', help: 'Buttons must have discernible text', impact: 'critical', tags: ['wcag412'], nodes: [{ target: '.icon', desc: 'button.icon' }] },
    { id: 'list', help: 'Lists must be structured correctly', impact: 'serious', tags: ['wcag131'], nodes: [{ target: 'ul', desc: 'ul' }] },
    { id: 'heading-order', help: 'Heading levels should only increase by one', impact: 'moderate', tags: ['best-practice'], nodes: [{ target: 'h4', desc: 'h4' }] },
  ], engine);
  assert.deepEqual(rows.map((r) => [r.kind, r.severity, r.wcag, r.places]), [['axe:color-contrast', 'blocker', '1.4.3', 1], ['axe:list', 'blocker', '1.3.1', 1], ['axe:heading-order', 'advisory', null, 1]]);
  assert.equal(rows[0].fix, 'Fix any of the following: contrast 2.1');
  assert.match(guideFor(rows[0].kind, [rows[0]]).title(1), /^Elements must meet .*\(axe-core color-contrast, WCAG 1\.4\.3\)$/);
  assert.equal(elementKey('button.x in .chip'), 'button.x');
  assert.equal(elementKey('input.f::placeholder in .field'), 'input.f');
  assert.equal(elementKey('div.box (its edge stands out 2:1) in .c'), 'div.box');
  for (const kinds of Object.values(AXE_SAME)) for (const k of kinds) assert.ok(A11Y_GUIDE[k], `${k} is a kind the engine reports`);
});

test('a keyboard trap: stuck on one control, or going round a few while the page has more; the browser going back to the top is not one', () => {
  const round = ['1|a', '2|b', '3|c', '2|b', '3|c', '2|b', '3|c', '2|b', '3|c'];
  assert.deepEqual(tabTrap(round, { stops: 5 }), { cycle: ['b', 'c'], ids: [2, 3] });
  assert.equal(tabTrap(round, { stops: 2 }), null);   // two controls on the page, Tab going round both
  assert.equal(tabTrap(['1|a', null, '1|a', null, '1|a', null], { stops: 5 }), null);   // through the page itself
  assert.deepEqual(tabTrap(['1|a', '2|b', '2|b', '2|b'], { stops: 5 }), { at: 'b' });
});

test('what a screen reader says: role, name, value and states, in its words; a plain element says nothing', () => {
  const node = (role, name, props = {}, value) => ({ role: { value: role }, name: { value: name }, ...(value ? { value: { value } } : {}), properties: Object.entries(props).map(([k, v]) => ({ name: k, value: { value: v } })) });
  assert.equal(spokenLine(node('checkbox', 'Remember me', { checked: 'false' })), 'checkbox, Remember me, not checked');
  assert.equal(spokenLine(node('switch', 'Wi-Fi', { checked: 'true' })), 'switch, Wi-Fi, on');
  assert.equal(spokenLine(node('button', 'Bold', { pressed: 'false' })), 'button, Bold, not pressed');
  assert.equal(spokenLine(node('textbox', 'Email', { required: true, invalid: 'true' }, 'ana@')), 'edit text, Email, ana@, required, invalid entry');
  assert.equal(spokenLine(node('heading', 'Settings', { level: 2 })), 'heading, Settings, level 2');
  assert.equal(spokenLine(node('button', 'Save', { disabled: true })), 'button, Save, unavailable');
  assert.equal(spokenLine(node('StaticText', 'Hello')), '"Hello"');
  assert.equal(spokenLine(node('generic', '')), null);
  assert.equal(spokenLine({ ignored: true }), null);
});

test('colour vision: text that passes WCAG and one deficiency can no longer read, the worst one named; grey on white stays fine', () => {
  const t = (color, bg) => ({ desc: 'p.x', text: 'Warning', color, bgLayers: [bg], fontSize: 14, fontWeight: '400' });
  assert.ok(cvdLuminance({ r: 255, g: 0, b: 0 }, 'protanopia') < 0.2126 / 1.5);   // red looks dark to someone who does not see red
  const red = cvdFindings([t('rgb(255, 32, 32)', 'rgb(0, 0, 0)')], 'Light');
  assert.equal(red.length, 1);
  assert.equal(red[0].vision, 'protanopia');
  assert.ok(red[0].ratio < 4.5);
  assert.deepEqual(cvdFindings([t('rgb(80, 80, 80)', 'rgb(255, 255, 255)')], 'Light'), []);
  assert.deepEqual(cvdFindings([t('rgb(200, 200, 200)', 'rgb(255, 255, 255)')], 'Light'), []);   // fails WCAG itself: the contrast check says it
});

test('every element accounted for: each text and icon with its ratio and verdict, and the component it sits in', () => {
  const rows = accountFor([{ desc: 'span.a in .chip', color: 'rgb(0, 0, 0)', bgLayers: ['rgb(255, 255, 255)'], fontSize: 14, fontWeight: '400' }, { desc: 'span.b', color: 'rgb(210, 210, 210)', bgLayers: ['rgb(255, 255, 255)'], fontSize: 14, fontWeight: '400' }],
    [{ desc: 'button.i in .bar', color: 'rgb(0, 0, 0)', bgLayers: ['rgb(255, 255, 255)'] }], 'Light');
  assert.deepEqual(rows.map((r) => [r.el, r.component, r.what, r.verdict]), [['span.a', '.chip', 'text', 'passes'], ['span.b', null, 'text', 'fails'], ['button.i', '.bar', 'icon', 'passes']]);
});

test('the run summary carries the accessibility verdict and each kind of problem, blockers first, with its components', () => {
  const lines = a11ySummaryLines({ verdict: { line: '2 blockers · 1 warning · 1 advisory · WCAG 2.2 AA' }, issues: [
    { issue: 'target44', severity: 'advisory', component: 'chip' },
    { issue: 'contrast', severity: 'blocker', component: 'chip' }, { issue: 'contrast', severity: 'blocker', component: 'badge' },
    { issue: 'axe:list', severity: 'warning', rule: 'list', help: 'Lists must be structured correctly', wcag: '1.3.1' },
  ], notRead: ['axe-core\'s rules (offline)'] });
  assert.deepEqual(lines, [
    '**Accessibility.** 2 blockers · 1 warning · 1 advisory · WCAG 2.2 AA.',
    '- Blocker: 2 pieces of text are hard to read (chip, badge)',
    '- Warning: Lists must be structured correctly (axe-core list, WCAG 1.3.1)',
    '- Advisory: 1 control is smaller than a comfortable touch target (chip)',
    '- Not all of it checked: axe-core\'s rules (offline)',
  ]);
  assert.deepEqual(a11ySummaryLines(null), []);
});

const PAGE = `<!doctype html><html lang="en"><head><title>All of it</title><style>
  body { font: 14px sans-serif; background: #fff; color: #111; margin: 16px; }
  button { min-width: 44px; min-height: 44px; }
  .save { background: #0a58ca; color: #fff; border: 0; }
  .save:focus { outline: 2px solid #000; color: #3d6fd6; }
  .save:active { background: #e8e8e8; color: #f4f4f4; }
  .field { border: 1px solid #555; padding: 6px; }
  .field:hover { border-color: #ddd; }
  .card { cursor: pointer; padding: 8px; border: 1px solid #333; }
  .dots { display: flex; gap: 6px; } .dots button { min-width: 0; min-height: 0; width: 16px; height: 16px; padding: 0; border: 0; }
  .roomy { min-width: 0; min-height: 0; height: 32px; }
  .box { height: 18px; width: 260px; line-height: 18px; overflow: visible; }
  .ico { display: inline-block; width: 16px; height: 16px; background-color: #222; -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Ccircle cx='8' cy='8' r='7'/%3E%3C/svg%3E") center/contain no-repeat; mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Ccircle cx='8' cy='8' r='7'/%3E%3C/svg%3E") center/contain no-repeat; }
  .warn { color: #ff2020; background: #000; padding: 4px; }
  .item { cursor: grab; padding: 6px; border: 1px solid #333; }
</style></head><body><main><h1>All of it</h1>
  <button class="save">Save</button>
  <label for="f">Name</label> <input id="f" class="field">
  <div class="card" onclick="void 0">Open by attribute</div>
  <div class="card" id="listened">Open by listener</div>
  <div class="card"><a href="/guide">A card around its own link</a></div>
  <div class="dots"><button aria-label="One"></button><button aria-label="Two"></button></div>
  <button class="roomy">Roomy</button>
  <p class="box">A line of text that holds its height</p>
  <label for="pw">Password</label> <input id="pw" type="password" autocomplete="off">
  <div class="list"><div class="item" draggable="true">Drag me</div></div>
  <a href="#" class="fake">Delete</a>
  <button class="mask" aria-label="Close"><span class="ico"></span></button>
  <p class="warn">Red warning text on black</p>
  <ul><div>A list with a child it should not have</div></ul>
  <div id="trap"><button id="t1">One</button> <button id="t2">Two</button></div> <button id="after">After</button>
</main><script>
  document.getElementById('listened').addEventListener('click', () => {});
  document.getElementById('pw').addEventListener('paste', (e) => e.preventDefault());
  document.getElementById('t2').addEventListener('keydown', (e) => { if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); document.getElementById('t1').focus(); } });
  document.getElementById('t1').addEventListener('keydown', (e) => { if (e.key === 'Tab' && e.shiftKey) { e.preventDefault(); document.getElementById('t2').focus(); } });
</script></body></html>`;
const run = (dir, args) => {
  let out = '';
  try { out = execFileSync(process.execPath, [join(ENGINE, 'a11y-check.mjs'), '--url', pathToFileURL(join(dir, 'page.html')).href, ...args], { cwd: dir, encoding: 'utf8', timeout: 240000, env: { ...process.env, CHROME_PATH: CHROME, NO_COLOR: '1' } }); }
  catch (e) { out = (e.stdout ?? '') + (e.stderr ?? ''); }
  return out;
};
const json = (out) => { const at = out.indexOf('{'); assert.ok(at > -1, out); const d = JSON.parse(out.slice(at)); assert.equal(d.notChecked, undefined, d.notChecked); return d; };

test('the whole check on one page: every new rule found once, the rest of the page left alone', { skip: HAS_CHROME ? false : 'no Chrome available', timeout: 300000 }, () => {
  const dir = makeFixture({ 'page.html': PAGE });
  const d = json(run(dir, ['--json', '--a11y']));
  const of = (k) => d.issues.filter((i) => i.issue === k);
  const says = (k) => of(k).map((i) => i.selector).join('\n');
  // The text of a control focused and pressed, a field's edge hovered.
  assert.deepEqual(of('statecontrast').map((i) => i.state).sort(), ['focused', 'pressed'], JSON.stringify(d.issues));
  assert.match(says('stateedge'), /input#f\.field when hovered/);
  // A click handler, read from the attribute and from Chrome's listeners; a card around its own link is fine.
  assert.match(says('keyboard'), /div\.card \(a script handles its clicks/);
  assert.match(says('keyboard'), /div#listened\.card \(a script handles its clicks/);
  assert.equal(of('keyboard').length, 2, says('keyboard'));
  // Tab going round two controls.
  assert.match(says('tabtrap'), /Tab goes round 2 controls \(button#t\d, button#t\d\)/);
  // Two 16px targets whose 24px circles overlap; a 32px one is advice.
  assert.equal(of('target').filter((i) => /aria|button/.test(i.selector) && i.size === '16×16').length, 2, says('target'));
  assert.ok(of('target44').some((i) => /button\.roomy/.test(i.selector) && i.severity === 'advisory'), says('target44'));
  // Text that spills out of a box that keeps its height, once a reader widens the spacing.
  assert.match(says('spacing'), /p\.box \(spills over what is next to it\)/);
  // WCAG 2.2: a password field that cancels paste and turns autofill off, a thing moved only by dragging.
  assert.equal(of('authpaste').length, 1, says('authpaste'));
  assert.equal(of('authpaste')[0].wcag, '3.3.8');
  assert.equal(of('authfill').length, 1);
  assert.match(says('dragging'), /div\.item/);
  assert.match(says('fakelink'), /a\.fake/);
  // High-contrast mode and colour vision.
  assert.match(says('forcedcontrast'), /button\.mask/);
  assert.ok(of('cvdcontrast').some((i) => i.vision === 'protanopia' && /Red warning/.test(i.text)), JSON.stringify(of('cvdcontrast')));
  // axe-core: what only it found, as its own finding with its rule, criterion and severity.
  const list = of('axe:list')[0];
  assert.ok(list, JSON.stringify(d.issues.map((i) => i.issue)));
  assert.equal(list.rule, 'list');
  assert.equal(list.wcag, '1.3.1');
  assert.equal(list.severity, 'blocker');
  assert.ok(!d.issues.some((i) => i.issue === 'axe:target-size' && /dots/.test(String(i.elements))), 'the engine already reports the dots');
  // What was measured, each element with its verdict; and what a screen reader says.
  assert.ok(d.measured.texts > 5 && d.measured.controls > 5, JSON.stringify(d.measured));
  assert.ok(d.elements.some((e) => e.what === 'text' && e.verdict === 'passes'));
  assert.ok(d.heard.page.some((l) => /^edit text, Name/.test(l)), JSON.stringify(d.heard));
  assert.ok(!d.leftOut);
  // Fine as they are: the heading, the plain field at rest, the card around its link.
  assert.ok(!d.issues.some((i) => /A card around/.test(i.selector ?? '')));
});

test('a part left out on purpose (--no-axe, --no-states) is said, and the verdict says not all of it was checked', { skip: HAS_CHROME ? false : 'no Chrome available', timeout: 300000 }, () => {
  const dir = makeFixture({ 'page.html': PAGE });
  const d = json(run(dir, ['--json', '--no-axe', '--no-states']));
  assert.equal(d.leftOut.length, 2);
  assert.match(d.verdict.line, /not all of it checked$/);
  assert.ok(!d.issues.some((i) => /^axe:/.test(i.issue) || i.issue === 'statecontrast' || i.issue === 'stateedge'));
  const out = run(dir, ['--no-axe']);
  assert.match(out, /Left out of this run: axe-core's rules \(--no-axe or a11y\.axe: false\)/);
});

test('each component on a 320px screen: one that cannot be narrower is named, one that wraps is fine', { skip: HAS_CHROME ? false : 'no Chrome available', timeout: 300000 }, () => {
  const page = `<!doctype html><html lang="en"><head><title>Narrow</title><style>
    body { font: 14px sans-serif; } .wrap { width: 700px; } button { min-width: 44px; min-height: 44px; white-space: nowrap; padding: 8px 16px; }
    .bar { display: flex; gap: 8px; } .fits { display: flex; flex-wrap: wrap; gap: 8px; width: 100%; }
  </style></head><body><main><h1>Narrow</h1><div class="wrap">
    <div class="bar"><button>First action</button><button>Second action</button><button>Third action</button><button>Fourth action</button></div>
    <div class="fits"><button>One</button><button>Two</button><button>Three</button></div>
  </div></main></body></html>`;
  const dir = makeFixture({ 'page.html': page, 'ds-config.json': { componentSelectors: { bar: '.bar', fits: '.fits' } } });
  const d = json(run(dir, ['--json', '--component', 'bar,fits']));
  const reflow = d.issues.filter((i) => i.issue === 'reflow').map((i) => i.selector);
  assert.equal(reflow.length, 1, JSON.stringify(reflow));
  assert.match(reflow[0], /^div\.bar \(it cannot be narrower than \d+px, wider than a 320px screen\) in \.bar$/);
  assert.ok(d.ran.includes('reflow'));
  assert.deepEqual(Object.keys(d.heard).sort(), ['bar', 'fits']);
});

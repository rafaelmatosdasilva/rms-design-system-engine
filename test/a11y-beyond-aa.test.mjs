// What the checks look at beyond WCAG 2.2 at A and AA: forced colours (high contrast mode, where the browser throws
// the system's colours away and paints with the reader's own) and reduced motion. Both were reported under AA
// criteria - an icon that vanished in high contrast mode failed 1.4.11, a focus ring 2.4.7 - which told a team an AA
// criterion was broken where the standard asks for nothing. Each is a row of its own now, in its own words, advisory,
// and no criterion signs it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { rmSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeFixture, budget } from './helpers.mjs';
import { WCAG22, BEYOND_AA, BEYOND_KIND, WCAG_KIND } from '../lib/wcag21.mjs';
import { A11Y_GUIDE, A11Y_ORDER, severityOf, a11yFindingRecord } from '../lib/a11y-check.mjs';
import { A11Y_WCAG, wcagLabel, a11yView } from '../lib/styleguide-data.mjs';
import { findChrome } from '../lib/cdp.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const CHROME = findChrome({ playwright: true });
const HAS_CHROME = !!CHROME && typeof WebSocket === 'function';
const FORCED = ['forcedcontrast', 'forcedborder', 'forcedstate', 'forcedfocus'];

test('the two rows beyond A and AA name their findings, and no criterion claims one of them', () => {
  assert.deepEqual(BEYOND_AA.map((b) => b.sc), ['Forced colours', 'Reduced motion']);
  for (const b of BEYOND_AA) {
    assert.ok(b.kinds.length && b.says && b.name, b.sc);
    assert.ok(!/^\d/.test(b.sc), `${b.sc} carries no number: it is not a criterion`);
    assert.equal(b.how, 'audit', `${b.sc} is the audit's: the browser's protocol sets the mode, which the page cannot`);
    assert.ok(b.ran, `${b.sc} names the check that says the pass was made`);
    for (const k of b.kinds) {
      assert.equal(BEYOND_KIND[k], b.sc, k);
      assert.ok(A11Y_GUIDE[k]?.fix, `${k} says what to do`);
      assert.ok(A11Y_ORDER.includes(k), `${k} has its place in the report`);
      // Nothing beyond AA is a blocker or a warning: it is advice, whatever it finds.
      assert.equal(severityOf(k), 'advisory', k);
      // No criterion of the target owns it.
      assert.equal(WCAG_KIND[k], undefined, `${k} fails no criterion`);
      for (const c of WCAG22) assert.ok(!(c.kinds ?? []).includes(k), `${c.sc} must not claim ${k}`);
    }
  }
  // 2.4.7 keeps the focus ring the page draws, and loses the one high contrast mode paints over.
  const focus = WCAG22.find((c) => c.sc === '2.4.7');
  assert.deepEqual(focus.kinds, ['focus', 'focushidden']);
});

test('a finding beyond A and AA says which row it belongs to, and names no criterion', () => {
  for (const k of [...FORCED, 'motion']) {
    const rec = a11yFindingRecord(k, { desc: 'input.field' });
    assert.equal(rec.beyond, BEYOND_KIND[k], k);
    assert.equal(rec.wcag, undefined, `${k} names no criterion`);
    assert.equal(rec.severity, 'advisory', k);
  }
  // A criterion's own finding is unchanged: it names the criterion and says nothing about being beyond it.
  const focus = a11yFindingRecord('focus', { desc: 'button.primary' });
  assert.equal(focus.wcag, '2.4.7');
  assert.equal(focus.beyond, undefined);
});

test('the style guide names the row in words, never as a criterion', () => {
  for (const k of FORCED) assert.equal(A11Y_WCAG[k], 'Forced colours', k);
  assert.equal(A11Y_WCAG.motion, 'Reduced motion');
  assert.equal(wcagLabel('Forced colours'), 'Forced colours: icons, borders, states and the focus ring stay visible (beyond WCAG 2.2 at A and AA)');
  assert.equal(wcagLabel('Reduced motion'), 'Reduced motion: what moves stops for a person who asks for less (beyond WCAG 2.2 at A and AA)');
  for (const row of ['Forced colours', 'Reduced motion']) assert.doesNotMatch(wcagLabel(row), /^WCAG/, row);
  // A criterion still reads as one.
  assert.equal(wcagLabel('1.4.11'), 'WCAG 1.4.11 Non-text Contrast (AA)');
  // On a component's page, an icon lost in high contrast mode is that row, and the text contrast beside it is 1.4.3.
  const v = a11yView({ name: 'chip', cls: 'chip', guide: A11Y_GUIDE,
    result: { checkedAt: '2026-11-11T09:00:00Z', issues: [{ issue: 'forcedcontrast', component: 'chip', selector: 'svg.chip__icon' }, { issue: 'contrast', component: 'chip', selector: 'span.chip__label', contrast: 2.1, needs: 4.5 }] } });
  const forced = v.checked.issues.find((i) => i.kind === 'forcedcontrast');
  assert.match(forced.wcag, /^Forced colours: .*\(beyond WCAG 2\.2 at A and AA\)$/);
  assert.equal(v.checked.issues.find((i) => i.kind === 'contrast').wcag, 'WCAG 1.4.3 Contrast (Minimum) (AA)');
});

test('the style guide gives each row its own line, as the audit made it', () => {
  // The page is given the catalogue, and its rows go through the audit branch: until an audit has run, a row says to
  // run it rather than reading Done.
  const src = readFileSync(join(ENGINE, 'templates', 'styleguide', 'js', '33-a-component-the-build-went-through-with.js'), 'utf8');
  assert.match(src, /WCAG\.beyond\.forEach/, 'the rows are listed from the catalogue');
  assert.match(src, /k\.extra && !k\.beyond/, 'a row beyond A and AA is not Done out of hand: the audit answers for it');
  const area = readFileSync(join(ENGINE, 'templates', 'styleguide', 'js', '30-its-accessibility.js'), 'utf8');
  assert.match(area, /beyond WCAG 2\\\.2 at A and AA/, 'a finding of such a row finds its way to it');
  assert.match(area, /'Forced colours': 'forcedstate', 'Reduced motion': 'motion'/, 'each row names the check that says it ran');
});

test('in the browser: an edge drawn with a shadow disappears in high contrast mode, a real border holds', { timeout: budget(600000), skip: !HAS_CHROME && 'no Chrome' }, () => {
  // High contrast mode drops every shadow and repaints the colours: a field whose edge is a box-shadow is left with
  // no outline, while one with a real border keeps it. An edge already too faint at rest is 1.4.11's finding, not
  // this one, so it is not reported twice.
  const dir = makeFixture({
    'page.html': `<!doctype html><html lang="en"><head><title>Edges</title><style>
      body { font: 16px/1.4 sans-serif; color: #111; background: #fff; }
      .shadowed { box-shadow: 0 0 0 1px #767676; border: 0; padding: 6px; background: #fff; }
      .bordered { border: 1px solid #767676; padding: 6px; background: #fff; }
      .faint { border: 1px solid #fafafa; padding: 6px; background: #fff; }
    </style></head><body><main id="main"><h1>Edges</h1>
      <label>Shadowed <input class="shadowed" name="a"></label>
      <label>Bordered <input class="bordered" name="b"></label>
      <label>Faint <input class="faint" name="c"></label>
    </main></body></html>`,
    'ds-config.json': { componentSelectors: { shadowed: '.shadowed', bordered: '.bordered', faint: '.faint' } },
  });
  try {
    let out = '';
    try { out = execFileSync(process.execPath, [join(ENGINE, 'lib', 'a11y-check.mjs'), '--url', pathToFileURL(join(dir, 'page.html')).href, '--json', '--no-axe', '--no-states', '--component', 'shadowed,bordered,faint'], { cwd: dir, encoding: 'utf8', timeout: budget(540000), env: { ...process.env, CHROME_PATH: CHROME } }); } catch (e) { out = String(e.stdout ?? ''); }
    const d = JSON.parse(out.slice(out.indexOf('{')));
    const of = (k) => (d.issues ?? []).filter((i) => i.issue === k);
    assert.ok((d.ran ?? []).includes('forcedborder'), `the pass ran: ${JSON.stringify({ ran: d.ran, notRead: d.notRead, unfinished: d.unfinished })}`);
    const lost = of('forcedborder');
    assert.equal(lost.length, 1, JSON.stringify(lost.map((i) => i.selector)));
    assert.match(lost[0].selector, /shadowed/);
    assert.equal(lost[0].severity, 'advisory');
    assert.equal(lost[0].beyond, 'Forced colours');
    assert.equal(lost[0].wcag, undefined, 'no AA criterion fails for a mode the standard does not ask about');
    assert.match(lost[0].fix, /border/);
    // The faint edge is 1.4.11's own finding, at rest, and is not counted again by the high-contrast pass.
    assert.ok(of('boundary').some((i) => /faint/.test(i.selector)), JSON.stringify(of('boundary').map((i) => i.selector)));
    assert.ok(!lost.some((i) => /faint/.test(i.selector)));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

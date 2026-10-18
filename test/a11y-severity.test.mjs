// every accessibility finding says how sure the check is of it. A blocker is measured on the rendered page
// against a WCAG 2.2 A or AA criterion, a warning is read from the code, a contract or a Figma note, an advisory is
// beyond AA or only a person can judge it. The check ends with one verdict line, and must-pass never stops on an
// advisory.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeFixture } from './helpers.mjs';
import { A11Y_GUIDE, A11Y_BLOCKER, A11Y_ADVISORY, severityOf, a11yVerdict, a11yFindingRecord } from '../a11y-check.mjs';
import { WCAG21 } from '../wcag21.mjs';
import { findChrome } from '../cdp.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const CHROME = findChrome({ playwright: true });
const HAS_CHROME = !!CHROME && typeof WebSocket !== 'undefined';

test('every kind of finding has a severity; a blocker fails an A or AA criterion the browser measures', () => {
  for (const k of [...A11Y_BLOCKER, ...A11Y_ADVISORY]) assert.ok(A11Y_GUIDE[k], `${k} is a kind the check reports`);
  const byKind = new Map(WCAG21.flatMap((c) => (c.kinds ?? []).map((k) => [k, c])));
  for (const k of A11Y_BLOCKER) {
    const c = byKind.get(k);
    if (!c) continue;   // focus, keyboard and the other kinds of the check's own
    assert.ok(['auto', 'audit', 'media'].includes(c.how), `${k} (${c.sc}) is measured, not read from the code`);
  }
  for (const k of ['shortcut', 'timing', 'gesture', 'motionact', 'rolecontract', 'annotation', 'placeholderlabel', 'pointerdown', 'status']) assert.equal(severityOf(k), 'warning', k);
  assert.equal(severityOf('focusthin'), 'advisory');   // 2.4.13 is AAA
  assert.equal(severityOf('motion'), 'advisory');      // 2.3.3 is AAA
  assert.equal(severityOf('a-kind-not-listed'), 'warning');
  assert.equal(a11yFindingRecord('contrast', { desc: 'p', ratio: 2, threshold: 4.5 }).severity, 'blocker');
});

test('one verdict line: how many of each, against what, and whether all of it was checked', () => {
  assert.equal(a11yVerdict([['contrast', [1, 2]], ['name', [1]], ['annotation', [1, 2]], ['focusthin', [1]]]).line, '3 blockers · 2 warnings · 1 advisory · WCAG 2.2 AA');
  const v = a11yVerdict([], { cannot: 2, partial: true });
  assert.deepEqual([v.blockers, v.warnings, v.advisories], [0, 0, 2]);   // text on an image is checked by eye
  assert.equal(v.line, '0 blockers · 0 warnings · 2 advisories · WCAG 2.2 AA · not all of it checked');
});

const PAGE = `<!doctype html><html lang="en"><head><title>T</title><style>
  body { font: 14px sans-serif; margin: 16px; }
  .thin:focus { outline: 1px solid #000; }
  button { padding: 8px; min-width: 44px; min-height: 44px; }   /* a comfortable touch target: no advice about its size */
</style></head><body><main><h1>Page</h1>
  <button class="thin">Thin ring</button>
  BODY
</main></body></html>`;
const run = (dir, args, env = {}) => {
  try { return { code: 0, out: execFileSync(process.execPath, [join(ENGINE, 'a11y-check.mjs'), '--url', pathToFileURL(join(dir, 'page.html')).href, ...args], { cwd: dir, encoding: 'utf8', timeout: 120000, env: { ...process.env, CHROME_PATH: CHROME, NO_COLOR: '1', ...env } }) }; }
  catch (e) { return { code: e.status, out: (e.stdout ?? '') + (e.stderr ?? '') }; }
};

test('the report lists blockers first, then warnings, then advisories, and ends with the verdict', { skip: HAS_CHROME ? false : 'no Chrome available', timeout: 300000 }, () => {
  const dir = makeFixture({ 'page.html': PAGE.replace('BODY', '<input class="field" placeholder="Search…">\n  <button class="icon"><svg width="16" height="16"><rect width="16" height="16"/></svg></button>') });
  const { out } = run(dir, []);
  const at = (w) => out.indexOf(`• ${w}: `);
  assert.ok(at('Blocker') > 0 && at('Blocker') < at('Warning') && at('Warning') < at('Advisory'), out);
  assert.match(out, /• Blocker: 1 button or field has no label[\s\S]*• Warning: One field is labelled only by a placeholder[\s\S]*• Advisory: 1 focus ring is thinner than 2 pixels/);
  assert.match(out.trimEnd().split('\n').pop(), /^Verdict: 1 blocker · 1 warning · 1 advisory · WCAG 2\.2 AA$/);
  const d = JSON.parse(run(dir, ['--json']).out);
  assert.deepEqual([d.verdict.blockers, d.verdict.warnings, d.verdict.advisories], [1, 1, 1]);
  assert.deepEqual(d.issues.map((i) => [i.issue, i.severity]), [['name', 'blocker'], ['placeholderlabel', 'warning'], ['focusthin', 'advisory']]);
});

test('must-pass stops on a blocker, never on an advisory alone', { skip: HAS_CHROME ? false : 'no Chrome available', timeout: 300000 }, () => {
  const strict = { 'ds-config.json': { a11yStrict: true } };
  const advisory = run(makeFixture({ ...strict, 'page.html': PAGE.replace('BODY', '') }), []);
  assert.equal(advisory.code, 0, advisory.out);
  assert.match(advisory.out, /Verdict: 0 blockers · 0 warnings · 1 advisory/);
  const blocker = run(makeFixture({ ...strict, 'page.html': PAGE.replace('BODY', '<button class="icon"><svg width="16" height="16"><rect width="16" height="16"/></svg></button>') }), []);
  assert.equal(blocker.code, 1, blocker.out);
  assert.match(blocker.out, /until the blockers and warnings are fixed[\s\S]*advisories never stop it/);
});

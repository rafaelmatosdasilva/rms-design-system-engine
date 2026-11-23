import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readHtml, rebuild, rebuildLines } from '../lib/page-rebuild.mjs';
import { wiringOf, wiringFindings, scriptLookups, pageScripts, matches } from '../lib/page-wiring.mjs';
import { fixtureProject, budget } from './helpers.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGE = `<!doctype html><html><head><title>Acme</title></head><body>
<nav><a href="/">Home</a><a href="/docs" data-testid="docs-link">Docs</a></nav>
<main><h1>Plans</h1><img src="chart.png" alt="Usage this month"><div id="chart"></div>
<form action="/subscribe" method="post" onsubmit="send(event)"><input type="hidden" name="csrf">
<input name="email" type="email" placeholder="you@example.com"><button type="submit" class="go">Subscribe</button></form></main>
<script>document.getElementById('chart'); document.querySelector('form .go'); document.querySelector('#gone-already');</script>
<script type="application/json">{"x": "document.getElementById('not-code')"}</script>
<script src="/app.js"></script></body></html>`;
const catalog = { components: { Button: { props: { label: { type: 'text' } } } } };
const built = () => {
  const tree = readHtml(PAGE), wiring = wiringOf(tree, PAGE);
  const r = rebuild(tree, { catalog, name: 'plans', lookups: wiring.lookups });
  return { r, wiring };
};
const walk = (n, f) => { f(n); for (const k of n.children ?? []) walk(k, f); };

test('the page\'s own scripts are read for the parts they look up, data and loaded scripts are not', () => {
  const { inline, loaded } = pageScripts(PAGE);
  assert.equal(inline.length, 1);
  assert.deepEqual(loaded, ['/app.js']);
  assert.deepEqual(scriptLookups("a.getElementById('x'); b.getElementsByClassName('p q'); c.getElementsByName(\"n\"); d.querySelectorAll('.a, #b'); e.closest(`[data-k=v]`); f.querySelector(`#${id}`)"),
    ['#x', '.p.q', '[name="n"]', '.a', '#b', '[data-k=v]']);
  const n = { tag: 'button', attrs: { class: 'go big', name: 'go' }, children: [] };
  assert.ok(matches(n, 'form .go'));
  assert.ok(matches(n, 'button[name="go"]'));
  assert.ok(!matches(n, '#go'));
  assert.ok(!matches(n, 'a.go'));
});

test('each link, form, field, handler, test id and looked-up element is listed, and each rebuilt part keeps its own', () => {
  const { r, wiring } = built();
  const said = wiring.wires.map((w) => `${w.kind} ${w.value}`);
  for (const w of ['link /', 'link /docs', 'test id docs-link', 'form POST /subscribe', 'field csrf', 'field email', 'handler onsubmit="send(event)"', 'lookup #chart', 'lookup form .go']) assert.ok(said.includes(w), `${w} in ${said.join(' | ')}`);
  assert.ok(!said.some((w) => /not-code/.test(w)));
  assert.deepEqual(wiring.unmatched, ['#gone-already']);
  assert.deepEqual(wiring.said.map((s) => s.kind), ['heading', 'figure']);
  // Every wire is on some part of the composition, so a fresh rebuild owes nothing.
  assert.deepEqual(wiringFindings(r.prototype, wiring), []);
  const carried = [];
  walk(r.prototype, (n) => { if (n.wiring) carried.push(n); });
  assert.ok(carried.some((n) => n.component === 'Button' && n.wiring.lookedUpAs?.includes('form .go')));
  // The box a script fills stays, as a part the system lacks, and the hidden field rides on its form.
  assert.ok(carried.some((n) => n.component === 'Missing' && n.wiring.lookedUpAs?.includes('#chart')));
  assert.ok(carried.some((n) => n.wiring.action === '/subscribe' && n.wiring.sends?.includes('csrf')));
  const lines = rebuildLines({ ...r, wiring, source: 'plans.html', before: {} }).join('\n');
  assert.match(lines, /Wiring kept: 2 links · 1 test id · 2 elements its scripts look up · 1 form · 2 field names · 1 handler/);
  assert.match(lines, /on no part of the page already: #gone-already/);
  assert.match(lines, /Not read: the scripts it loads \(\/app\.js\)/);
});

test('a part taken out fails, unless the loss is written down with its reason, and a lost heading or figure is only said', () => {
  const { r, wiring } = built();
  const cut = (pred) => { const ui = structuredClone(r.prototype); const drop = (n) => { n.children = (n.children ?? []).filter((k) => !pred(k)); n.children.forEach(drop); }; drop(ui); return ui; };
  const noDocs = cut((n) => n.wiring?.href === '/docs');
  const f = wiringFindings(noDocs, wiring);
  assert.deepEqual(f.map((x) => x.level), ['error', 'error']);
  assert.match(f[0].message, /link "\/docs"/);
  assert.match(f[1].message, /test id "docs-link"/);
  assert.deepEqual(wiringFindings(noDocs, wiring, [{ kind: 'link', value: '/docs', why: 'the docs moved into the help panel' }, { value: 'docs-link', why: 'the test goes with it' }]), []);
  const noReason = wiringFindings(noDocs, wiring, [{ value: '/docs' }, { value: 'docs-link', why: 'gone' }]);
  assert.equal(noReason.length, 1);
  assert.match(noReason[0].message, /with no reason/);
  const noChart = wiringFindings(cut((n) => n.wiring?.lookedUpAs?.includes('#chart')), wiring);
  assert.match(noChart[0].message, /scripts look up "#chart"/);
  const quiet = wiringFindings(cut((n) => n.props?.as === 'h1' || n.wiring?.figure), wiring);
  assert.deepEqual(quiet.map((x) => x.level), ['warning', 'warning']);
  assert.match(quiet[0].message, /heading "Plans"/);
  assert.match(quiet[1].message, /figure "Usage this month"/);
});

test('--from-page writes the page\'s wiring, and --prototype fails the rebuilt page once a wired part is taken out', () => {
  const dir = fixtureProject(join(HERE, 'fixtures', 'demo-ds'), 'from-page-wiring-');
  writeFileSync(join(dir, 'plans.html'), PAGE);
  const cli = (...a) => spawnSync(process.execPath, [join(HERE, '..', 'audit.mjs'), '--prototype', ...a, '--no-browser'], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' }, timeout: budget(180000) });
  const first = cli('--from-page', 'plans.html');
  assert.match(first.stdout, /Wiring kept: /);
  const file = join(dir, 'prototypes', 'plans.json');
  const comp = JSON.parse(readFileSync(file, 'utf8'));
  assert.ok(comp.wiring.wires.length >= 9);
  assert.deepEqual(comp.wiringDropped, []);
  const drop = (n) => { n.children = (n.children ?? []).filter((k) => k.wiring?.href !== '/docs'); n.children.forEach(drop); };
  drop(comp.prototype);
  writeFileSync(file, JSON.stringify(comp));
  const after = cli('prototypes/plans.json');
  assert.match(after.stdout, /link "\/docs" .* is on no part of the rebuilt page any more/);
  assert.notEqual(after.status, 0);
  comp.wiringDropped = [{ value: '/docs', why: 'moved into the help panel' }, { value: 'docs-link', why: 'its test goes too' }];
  writeFileSync(file, JSON.stringify(comp));
  const meant = cli('prototypes/plans.json');
  assert.doesNotMatch(meant.stdout, /on no part of the rebuilt page any more/);
});

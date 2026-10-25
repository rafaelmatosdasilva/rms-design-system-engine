// Kept on purpose: a difference between Figma and the code the team decided to keep is recorded with its reason, who
// decided and when; it never fails a run, the differences list and the style guide show it as kept, and when either
// side's value changes it is open again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { keptKey, recordKept, readKept, dropKept, pick, keepInGates, matchKept, keptState, keptReport, reviewDate, keptPath } from '../kept.mjs';
import { collectFindings, differencesMarkdown } from '../run-diff.mjs';
import { route } from '../route.mjs';
import { judge } from '../guard.mjs';
import { fixtureProject, bareEnv, budget } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const dir = () => mkdtempSync(join(tmpdir(), 'kept-'));
const gate = (label, lines, pass = false) => ({ label, lines, pass, n: 1 });

test('a decision names the difference by its check and its words, whatever its icon or the line number in a file', () => {
  assert.equal(keptKey('Structure :: ❌ chip height: Figma 32px, rendered 36px (.chip · theme.css:75)'), 'Structure :: chip height: Figma 32px, rendered 36px (.chip · theme.css)');
  assert.equal(keptKey('Structure  (height · spacing) :: ⚠️ chip height: Figma 32px, rendered 36px (.chip · theme.css:80)'), 'Structure :: chip height: Figma 32px, rendered 36px (.chip · theme.css)');
  assert.notEqual(keptKey('Structure :: ❌ chip height: Figma 32px, rendered 40px'), keptKey('Structure :: ❌ chip height: Figma 32px, rendered 36px'), 'a value that changed is another difference');
});

test('recorded with its reason, who, when, which side is right and when to look again; a reason is required; taken back by name', () => {
  const root = dir();
  assert.throws(() => recordKept(root, [{ check: 'Structure', what: 'x', component: 'chip' }], { reason: ' ' }), /needs its reason/);
  const [d] = recordKept(root, [{ check: 'Structure', what: 'chip height: Figma 32px, rendered 36px', component: 'chip' }], { reason: 'The product needs a larger tap target', by: 'QA', at: '2026-10-13T10:00:00Z', truth: 'code', review: '2027-01-31' });
  assert.deepEqual(d, { key: 'Structure :: chip height: Figma 32px, rendered 36px', check: 'Structure', what: 'chip height: Figma 32px, rendered 36px', component: 'chip', reason: 'The product needs a larger tap target', by: 'QA', at: '2026-10-13T10:00:00Z', truth: 'code', review: '2027-01-31' });
  recordKept(root, [{ check: 'Token values', what: '[sizing/-] radii/tag → --radii-tag', component: 'tag' }], { reason: 'Brand asked for it', by: 'Dev' });
  assert.equal(readKept(root).length, 2);
  assert.match(JSON.parse(readFileSync(keptPath(root), 'utf8')).$description, /decided to keep/);
  assert.deepEqual(pick(readKept(root), { component: ['CHIP'] }).map((x) => x.component), ['chip'], 'a component in any case');
  assert.deepEqual(pick(readKept(root), { words: ['radii'] }).map((x) => x.component), ['tag']);
  assert.equal(dropKept(root, (x) => x.component === 'tag').length, 1);
  assert.deepEqual(readKept(root).map((x) => x.component), ['chip']);
  assert.equal(reviewDate('90d', new Date('2026-10-13T00:00:00Z')), '2027-01-11');
  assert.equal(reviewDate('6m', new Date('2026-10-13T00:00:00Z')), '2027-04-13');
  assert.equal(reviewDate('2027-01-31'), '2027-01-31');
  assert.equal(reviewDate('soon'), null);
});

test('a gate whose failing lines are all kept passes, its lines said as kept; a gate with one more stays failing', () => {
  const decisions = [{ key: 'Structure :: chip height: Figma 32px, rendered 36px', check: 'Structure', what: 'chip height: Figma 32px, rendered 36px', component: 'chip', reason: 'tap target', by: 'QA', at: '2026-10-13T10:00:00Z' }];
  const one = gate('Structure  (height · spacing)', ['❌ FAIL  1', '❌ chip height: Figma 32px, rendered 36px']);
  const two = gate('Structure  (height · spacing)', ['❌ FAIL  2', '❌ chip height: Figma 32px, rendered 36px', '❌ tag height: Figma 20px, rendered 24px']);
  const seen = keepInGates([one, two], decisions);
  assert.equal(seen.length, 2);
  assert.equal(one.pass, true);
  assert.equal(one.kept, 1);
  assert.deepEqual(one.lines, ['✋ 1 kept on purpose', '✋ kept on purpose: chip height: Figma 32px, rendered 36px  (tap target; QA, 2026-10-13)']);
  assert.equal(two.pass, false, 'the tag height is still open');
  // The run's findings: a kept line in a failing gate is not one.
  const report = ['❌  [13] Structure  (height · spacing)', ...two.lines.map((l) => `       ${l}`)];
  const found = collectFindings(report);
  assert.ok(found.some((f) => /tag height/.test(f)));
  assert.ok(!found.some((f) => /chip height/.test(f)), found.join('\n'));
});

test('the rest of the findings: kept ones leave the open list; a decision not found, or due for review, is said', () => {
  const decisions = [
    { key: 'Values :: chip height: Figma 32px, rendered 36px', check: 'Values', what: 'chip height: Figma 32px, rendered 36px', component: 'chip', reason: 'tap target', by: 'QA', at: '2026-01-01T00:00:00Z', review: '2026-06-01' },
    { key: 'Values :: tag radius: Figma 4px, rendered 8px', check: 'Values', what: 'tag radius: Figma 4px, rendered 8px', component: 'tag', reason: 'brand', by: 'Dev', at: '2026-01-01T00:00:00Z' },
  ];
  // The tag's radius changed in Figma since it was kept: it is open again, and its decision is no longer found.
  const m = matchKept(decisions, ['Values :: ⚠️ chip height: Figma 32px, rendered 36px', 'Values :: ⚠️ tag radius: Figma 6px, rendered 8px']);
  assert.deepEqual(m.open, ['Values :: ⚠️ tag radius: Figma 6px, rendered 8px']);
  const st = keptState(decisions, m.kept, '2026-10-13');
  assert.deepEqual(st.kept.map((d) => d.component), ['chip']);
  assert.deepEqual(st.gone.map((d) => d.component), ['tag']);
  assert.deepEqual(st.due.map((d) => d.component), ['chip']);
  const lines = keptReport(st, { today: '2026-10-13' }).join('\n');
  assert.match(lines, /^✋ Kept on purpose: 1 difference the team decided to keep \(design-system-engine-kept\.json\)\. They never fail the run\./);
  assert.match(lines, /chip, Values: chip height: Figma 32px, rendered 36px {2}\(tap target; kept by QA; on 2026-01-01; to look at again since 2026-06-01\)/);
  assert.match(lines, /no longer found \(a value changed, or the difference is gone\): 1\./);
  // The differences list: the open ones, then the kept ones with why, who and when.
  const md = differencesMarkdown({ total: 1, fresh: 0, groups: [{ component: 'tag', items: [{ check: 'Values', what: 'tag radius: Figma 6px, rendered 8px', side: 'decide' }] }],
    kept: [{ component: 'chip', check: 'Values', what: 'chip height: Figma 32px, rendered 36px', reason: 'tap target', by: 'QA', at: '2026-01-01T00:00:00Z', truth: 'code' }],
    keptGone: [{ component: 'tag', check: 'Values', what: 'tag radius: Figma 4px, rendered 8px', reason: 'brand' }] });
  assert.match(md, /## Kept on purpose \(1\)\n\nThe team decided to keep these\. They never fail a run while their values stay as they are\.\n\n- \*\*chip\*\* Values: chip height: Figma 32px, rendered 36px\. _tap target; kept by QA; on 2026-01-01; the code is right\._/);
  assert.match(md, /## Kept on purpose, no longer found \(1\)/);
  assert.match(md, /keep a difference the team decided on \(`--keep`, with its reason\)/);
});

test('only the person keeps a difference: the router asks for their reason, the hooks ask unless they said so', () => {
  const r = route('the chip height is on purpose, keep it', { components: ['chip'] });
  assert.equal(r.recipe, 'accept-debt');
  assert.match(r.run[0], /--keep --match height --reason "<their reason>"$/);
  assert.match(r.ask, /why the team keeps this difference/);
  const w = route('keep the chip radius difference because the brand asked for rounder chips', { components: ['chip'] });
  assert.match(w.run[0], /--keep --match radi --reason "the brand asked for rounder chips"$/);
  assert.ok(!w.ask);
  assert.match(route('accept the chip radius as debt', { components: ['chip'] }).run[0], /--baseline --findings --match radi/);
  const bash = (cmd, userText) => judge({ tool_name: 'Bash', tool_input: { command: cmd } }, { userText });
  assert.equal(bash('rms-design-system-engine --keep --match radi --reason "x"', 'fix the chip')?.decision, 'ask');
  assert.equal(bash('rms-design-system-engine --keep --match radi --reason "x"', 'keep the radius, it is intentional'), null);
  assert.equal(judge({ tool_name: 'Edit', tool_input: { file_path: 'design-system-engine-kept.json' } }, { userText: 'fix the chip' })?.decision, 'ask');
});

test('--keep keeps the open differences of the last full audit that match, with the reason; --unkeep takes them back', () => {
  const root = dir();
  writeFileSync(join(root, 'ds-config.json'), '{}');
  mkdirSync(join(root, '.design-system-engine-out'), { recursive: true });
  writeFileSync(join(root, '.design-system-engine-out', 'findings.json'), JSON.stringify({ findings: [
    { check: 'Structure', evidence: 'chip height: Figma 32px, rendered 36px (.chip · theme.css:75)', component: 'chip', difference: true },
    { check: 'Structure', evidence: 'chip radius: Figma 16px, rendered 12px', component: 'chip', difference: true },
    { check: 'Accessibility', evidence: 'text contrast 3.1:1', component: 'chip', difference: false },
  ] }));
  const cli = (...a) => spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), ...a], { cwd: root, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  let r = cli('--keep', '--match', 'height', '--component', 'chip');
  assert.equal(r.status, 2);
  assert.match(r.stdout, /needs its reason: add --reason "<why the team keeps it>"\. Ask the person for it; never write one for them\./);
  r = cli('--keep', '--match', 'width', '--component', 'chip', '--reason', 'x');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /No open difference in chip matches "width"[\s\S]*chip height/);
  r = cli('--keep', '--match', 'height', '--component', 'chip', '--reason', 'The product needs a larger tap target', '--by', 'QA', '--truth', 'code', '--review', '90d');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^✓ Kept on purpose: 1 difference, in design-system-engine-kept\.json\./);
  assert.match(r.stdout, /NEXT: commit design-system-engine-kept\.json when the person asks, then run rms-design-system-engine/);
  const [d] = JSON.parse(readFileSync(join(root, 'design-system-engine-kept.json'), 'utf8')).decisions;
  assert.equal(d.key, 'Structure :: chip height: Figma 32px, rendered 36px (.chip · theme.css)');
  assert.equal(d.by, 'QA');
  assert.equal(d.truth, 'code');
  assert.match(d.review, /^\d{4}-\d{2}-\d{2}$/);
  r = cli('--keep');
  assert.match(r.stdout, /^Kept on purpose \(design-system-engine-kept\.json\): 1\n {3}• chip, Structure: chip height/);
  r = cli('--unkeep', '--match', 'height');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /1 difference no longer kept: the next audit lists it as open again\./);
  assert.deepEqual(JSON.parse(readFileSync(join(root, 'design-system-engine-kept.json'), 'utf8')).decisions, []);
});

test('on the demo system: a kept difference no longer fails its gate and leaves the open list for the kept one', { timeout: budget(600000) }, () => {
  const root = fixtureProject(join(ENGINE, 'test', 'fixtures', 'demo-ds'), 'kept-demo-');
  const run = (...a) => spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), ...a], { cwd: root, encoding: 'utf8', env: { ...bareEnv(), NO_COLOR: '1', FORCE_COLOR: '0', CI: '1' }, timeout: budget(300000) });
  let r = run();
  assert.match(r.stdout, /❌ \[sizing\/-\] radii\/chip → --radii-chip/);
  const before = JSON.parse(readFileSync(join(root, '.design-system-engine-out', 'differences.json'), 'utf8'));
  const has = (d) => (d.groups ?? []).some((g) => g.items.some((i) => /radii\/chip → --radii-chip/.test(i.what)));
  assert.ok(has(before), 'open before');
  r = run('--keep', '--match', 'radii/chip → --radii-chip', '--reason', 'The chip keeps the smaller radius of the product', '--by', 'QA');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  r = run();
  assert.match(r.stdout, /✋ kept on purpose: \[sizing\/-\] radii\/chip → --radii-chip {2}\(The chip keeps the smaller radius of the product; QA, \d{4}-\d{2}-\d{2}\)/);
  assert.match(r.stdout, /✋ Kept on purpose: 1 difference the team decided to keep \(design-system-engine-kept\.json\)\. They never fail the run\./);
  const after = JSON.parse(readFileSync(join(root, '.design-system-engine-out', 'differences.json'), 'utf8'));
  assert.ok(!has(after), 'no longer open');
  assert.equal(after.kept.length, 1);
  assert.equal(after.kept[0].reason, 'The chip keeps the smaller radius of the product');
  assert.match(readFileSync(join(root, '.design-system-engine-out', 'differences.md'), 'utf8'), /## Kept on purpose \(1\)/);
  assert.ok(existsSync(join(root, 'design-system-engine-kept.json')));
  // The style guide carries it on the component's page, with its reason.
  r = run('--styleguide');
  const page = readFileSync(join(root, '.design-system-engine-out', 'styleguide', 'index.html'), 'utf8');
  const data = JSON.parse(/<script type="application\/json" id="sg-data">([\s\S]*?)<\/script>/.exec(page)[1]);
  const kept = (data.components ?? []).flatMap((c) => c.kept ?? []);
  assert.equal(kept.length, 1, 'one kept difference on the pages');
  assert.equal(kept[0].reason, 'The chip keeps the smaller radius of the product');
  assert.equal(kept[0].by, 'QA');
});

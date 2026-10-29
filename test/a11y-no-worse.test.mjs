// Accessibility never gets worse: a merge request fails when it adds a blocker the last build on the base branch did
// not have, says what it fixed, and passes when no build kept a result yet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { blockers, recordOf, compare, noWorse, elementOf, variantOf } from '../a11y-no-worse.mjs';
import { tempDir } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));

const contrast = (over = {}) => ({ issue: 'contrast', severity: 'blocker', selector: 'span.label in .card-tile', wcag: '1.4.3', theme: 'Light', text: 'Save', contrast: 3.1, needs: 4.5, component: 'cardTile', ...over });
const base = { checkedAt: '2026-10-01T10:00:00.000Z', issues: [
  contrast(),
  { issue: 'name', severity: 'blocker', selector: '<button> with no accessible name in .acme-toolbar', wcag: '4.1.2', role: 'button', component: 'acmeToolbar' },
  { issue: 'target44', severity: 'advisory', selector: 'button.acme-chip in .acme-chip', size: '40×40', component: 'acmeChip' },
] };

test('a blocker is keyed by where it is, its element, state, colour mode, criterion and kind; never by its measured value', () => {
  const a = blockers({ issues: [contrast()] }), b = blockers({ issues: [contrast({ contrast: 3.4, text: 'Cancel', places: 9 })] });
  assert.deepEqual([...a.keys()], [...b.keys()], 'the same failure with another value is the same blocker');
  assert.equal([...a.values()][0].line, 'cardTile, label (Light), 1.4.3 contrast 3.1:1');
  const modes = blockers({ issues: [{ issue: 'target', severity: 'blocker', selector: 'button.card-tile.card-tile--disabled in .card-tile', wcag: '2.5.8', size: '20×20', modes: ['Light', 'Dark'], component: 'cardTile' }] });
  assert.deepEqual([...modes.values()].map((v) => v.line), ['cardTile, disabled (Light), 2.5.8 target 20×20', 'cardTile, disabled (Dark), 2.5.8 target 20×20'], 'one key per colour mode, the variant read from the class');
  assert.equal(elementOf('g#acme-icon-sg2 (id="acme-icon-sg2" is used more than once) in .card-tile'), 'g#acme-icon-sg#');
  assert.equal(variantOf('button.card-tile.disabled', 'cardTile'), 'disabled');
});

test('warnings, advisories and findings on neither a component nor a product page are left out', () => {
  const b = blockers({ issues: [
    { issue: 'target44', severity: 'advisory', selector: 'button.acme-chip', component: 'acmeChip' },
    { issue: 'table', severity: 'warning', selector: 'table.acme-table', component: 'acmeTable' },
    { issue: 'keyboard', severity: 'blocker', selector: 'button', wcag: '2.1.1' },
    { issue: 'axe:landmark-one-main', severity: 'blocker', selector: 'html', wcag: '1.3.1', product: 'Acme Shop' },
  ] });
  assert.deepEqual([...b.values()].map((v) => v.line), ['Acme Shop (its page), html, 1.3.1 landmark-one-main']);
});

test('a new blocker fails with a plain list; one already failing is not new; a fixed one is good news', () => {
  const record = recordOf(base, { at: '2026-10-01T10:05:00.000Z', branch: 'main', commit: 'abcdef0123456789' });
  assert.equal(record.blockers.length, 2, 'the advisory is never kept');
  const now = { checkedAt: '2026-10-02T09:00:00.000Z', issues: [
    contrast({ contrast: 2.9 }),
    contrast({ selector: 'span.label in .card-tile', state: 'disabled', contrast: 3.1, theme: 'Dark' }),
  ] };
  const v = noWorse(record, now);
  assert.equal(v.code, 1);
  assert.match(v.lines.join('\n'), /1 accessibility blocker that the last build on the base branch \(main, abcdef01\) did not have/);
  assert.ok(v.lines.includes('   new: cardTile, label, disabled (Dark), 1.4.3 contrast 3.1:1'));
  assert.ok(v.lines.includes('   fixed: acmeToolbar, <button>, 4.1.2 name'));
  assert.ok(!v.lines.some((l) => /new: cardTile, label \(Light\)/.test(l)), 'the blocker the base branch had is not new, though its value moved');
});

test('no new blocker passes; a component this run could not read is not checked, never fixed', () => {
  const record = recordOf(base);
  const now = { checkedAt: '2026-10-02T09:00:00.000Z', issues: [contrast()], notRead: ['acmeToolbar (not rendered)'] };
  const c = compare(record, now);
  assert.deepEqual(c, { added: [], fixed: [], notChecked: ['acmeToolbar, <button>, 4.1.2 name'] });
  const v = noWorse(record, now);
  assert.equal(v.code, 0);
  assert.match(v.lines[0], /^✅ No accessibility blocker/);
});

test('no record from the base branch passes and says so; no result of this run, or the base branch\'s own, cannot be compared', () => {
  const none = noWorse(null, base);
  assert.equal(none.code, 0);
  assert.match(none.lines[0], /No accessibility result kept from the base branch yet/);
  assert.equal(noWorse(recordOf(base), null).code, 2);
  const same = noWorse(recordOf(base), base);
  assert.equal(same.code, 2, 'a result restored from the cache is not this run\'s');
  assert.match(same.lines[0], /did not measure anything in this run/);
});

test('--a11y-no-worse --record keeps the build\'s blockers; --a11y-no-worse then fails a merge request that adds one', () => {
  const root = tempDir('acme-a11y-no-worse-');
  const out = join(root, '.design-system-engine-out');
  mkdirSync(out, { recursive: true });
  const run = (...args) => { try { return { code: 0, out: execFileSync(process.execPath, [join(ENGINE, 'audit.mjs'), ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, CI_COMMIT_BRANCH: 'main' } }) }; } catch (e) { return { code: e.status, out: `${e.stdout}${e.stderr}` }; } };
  assert.equal(run('--a11y-no-worse', '--record').code, 2, 'nothing to keep before an audit');
  writeFileSync(join(out, 'a11y.json'), JSON.stringify(base));
  const first = run('--a11y-no-worse');
  assert.equal(first.code, 0);
  assert.match(first.out, /No accessibility result kept from the base branch yet/);
  const kept = run('--a11y-no-worse', '--record');
  assert.equal(kept.code, 0, kept.out);
  assert.match(kept.out, /2 blockers on components and products' pages/);
  assert.equal(JSON.parse(readFileSync(join(out, 'a11y-last-build.json'), 'utf8')).branch, 'main');
  writeFileSync(join(out, 'a11y.json'), JSON.stringify({ ...base, checkedAt: '2026-10-03T08:00:00.000Z', issues: [...base.issues, contrast({ selector: 'span.title in .card-tile', contrast: 2.2 })] }));
  const mr = run('--a11y-no-worse');
  assert.equal(mr.code, 1, mr.out);
  assert.match(mr.out, /new: cardTile, title \(Light\), 1\.4\.3 contrast 2\.2:1/);
});

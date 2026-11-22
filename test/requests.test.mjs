// What teams ask the system for: one request a need, the team's decision beside it, built by itself once no
// prototype lacks it, and tied to a team's tracker by an exchange of files, never an integration.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { tempDir } from './helpers.mjs';
import { requestKey, requestsFrom, decideRequest, exportRequests, readDecisions, requestLines } from '../lib/requests.mjs';
import { decisionsFrom } from '../lib/decisions.mjs';
import { mergeGaps } from '../lib/prototype-pieces.mjs';

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const merged = mergeGaps({
  Orders: [{ need: 'a date picker', kind: 'component', closest: 'Field' }, { need: 'a success colour', kind: 'token' }],
  Signup: [{ need: 'A date  picker', kind: 'component' }],
});

test('one request a need, however many prototypes ask for it, with who asked', () => {
  const rows = requestsFrom({ merged });
  const picker = rows.find((r) => r.key === requestKey({ kind: 'component', need: 'a date picker' }));
  assert.deepEqual([picker.count, picker.asked.sort(), picker.closest, picker.status], [2, ['Orders', 'Signup'], 'Field', 'new']);
  assert.equal(rows[0].key, picker.key, 'the most asked first');
  assert.equal(rows.length, 2);
});

test('a decision is a person\'s, with its reason when it keeps a need out and its day when it is only for now', () => {
  const dir = tempDir('requests-');
  const key = requestKey({ kind: 'token', need: 'a success colour' });
  assert.throws(() => decideRequest(dir, key, 'maybe'), /out, product, for-now, system/);
  assert.throws(() => decideRequest(dir, key, 'out', { by: 'QA' }), /needs its reason/);
  assert.throws(() => decideRequest(dir, key, 'for-now', { by: 'QA' }), /day to look again/);
  decideRequest(dir, key, 'out', { why: 'status colours come from the brand team', by: 'Design lead', need: 'a success colour', kind: 'token', at: '2026-11-22T10:00:00Z' });
  assert.deepEqual(readDecisions(dir)[key], { decision: 'out', why: 'status colours come from the brand team', by: 'Design lead', at: '2026-11-22', need: 'a success colour', kind: 'token' });
  // Told to agents as a decision that rules the need out, so nobody asks again.
  const told = decisionsFrom({ requests: readDecisions(dir) });
  assert.equal(told.length, 1);
  assert.equal(told[0].kind, 'request');
  assert.deepEqual(told[0].ruledOut, ['asking the system for a success colour']);
});

test('brought into the system and no prototype lacks it: built by itself; accepted for now: looked at again on its day', () => {
  const picker = requestKey({ kind: 'component', need: 'a date picker' }), colour = requestKey({ kind: 'token', need: 'a success colour' });
  const decisions = {
    [picker]: { decision: 'system', need: 'a date picker', kind: 'component', by: 'Design lead' },
    [colour]: { decision: 'for-now', need: 'a success colour', kind: 'token', lookAgain: '2026-12-01', by: 'Design lead' },
    'icon|a lock': { decision: 'product', need: 'a lock', kind: 'icon' },
  };
  const now = requestsFrom({ merged: mergeGaps({ Orders: [{ need: 'a success colour', kind: 'token' }] }), decisions, today: '2026-11-22' });
  assert.equal(now.find((r) => r.key === picker).status, 'built', 'nobody lacks it any more');
  assert.equal(now.find((r) => r.key === colour).status, 'decided');
  assert.equal(now.find((r) => r.key === 'icon|a lock').status, 'decided', 'a decided request stays, though nobody asks now');
  assert.equal(requestsFrom({ merged: mergeGaps({ Orders: [{ need: 'a success colour', kind: 'token' }] }), decisions, today: '2026-12-01' }).find((r) => r.key === colour).status, 'look again');
  assert.equal(requestsFrom({ merged: [], decisions: {} }).length, 0, 'nobody asks and nobody decided: no row');
});

test('a team\'s tracker answers by key: closed or declined leaves the open list, a duplicate is merged, a decline is a decision', () => {
  const picker = requestKey({ kind: 'component', need: 'a date picker' }), colour = requestKey({ kind: 'token', need: 'a success colour' });
  const answers = {
    [picker]: { state: 'open', link: 'https://tracker.example.com/issues/12' },
    [colour]: { state: 'declined', reason: 'use the status tokens', link: 'https://tracker.example.com/issues/13' },
  };
  const rows = requestsFrom({ merged, answers });
  assert.equal(rows.find((r) => r.key === picker).ticket, 'https://tracker.example.com/issues/12');
  const c = rows.find((r) => r.key === colour);
  assert.deepEqual([c.status, c.closedBy, c.decision, c.why], ['closed', 'declined', 'out', 'use the status tokens']);
  const dup = requestsFrom({ merged, answers: { [colour]: { state: 'duplicate', of: picker } } }).find((r) => r.key === colour);
  assert.deepEqual([dup.status, dup.of], ['merged', picker]);
  // The open ones written out, with the keys a bridge answers by.
  const dir = tempDir('requests-out-');
  const out = exportRequests(dir, rows);
  const file = JSON.parse(readFileSync(out.file, 'utf8'));
  assert.equal(out.open, 1);
  assert.deepEqual(file.requests.map((r) => r.key), [picker]);
  assert.match(file.about, /design-system-engine-requests\.answers\.json/);
  assert.match(requestLines(rows).join('\n'), /REQUESTS {2}1 new · 0 decided · 0 built · 1 closed/);
});

test('the command lists the requests, writes them out and records a decision by its key', () => {
  const dir = tempDir('requests-cmd-');
  writeFileSync(join(dir, 'ds-config.json'), '{}');
  mkdirSync(join(dir, '.design-system-engine-out', 'prototypes'), { recursive: true });
  writeFileSync(join(dir, '.design-system-engine-out', 'prototypes', 'gaps.json'), JSON.stringify({ byPrototype: { Orders: [{ need: 'a date picker', kind: 'component' }] } }));
  const run = (...a) => spawnSync(process.execPath, [join(ENGINE, 'lib', 'audit.mjs'), ...a], { cwd: dir, encoding: 'utf8', env: { ...process.env, CI: '1', NO_COLOR: '1' } });
  let r = run('--requests');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /New {2}component "a date picker", asked by 1 \(Orders\)/);
  assert.match(r.stdout, /NEXT: the system's team decides each new request/);
  r = run('--request', 'component|a date picker', '--decide', 'system', '--by', 'Design lead');
  assert.match(r.stdout, /✅ component "a date picker": brought into the system by Design lead/);
  assert.match(run('--requests').stdout, /Decided {2}component "a date picker".* · brought into the system/);
  assert.match(run('--request', 'component|nothing', '--decide', 'system', '--by', 'x').stdout, /❌ No request component\|nothing/);
});

test('the style guide has a Requests page beside Status: a row a need, its panel with what to do, who asked and the decision', async () => {
  const { templateText } = await import('../lib/styleguide-template.mjs');
  const tpl = templateText();
  assert.match(tpl, /navLink\('requests', 'requests'\)/);
  assert.match(tpl, /section\('requests', 'Requests', 'Requests'/);
  assert.match(tpl, /card\('What to do', todo\)[\s\S]*card\('Who asked'[\s\S]*card\('Status'[\s\S]*card\('Decided'/, 'the panels\' one order');
  assert.match(tpl, /data-chip="' \+ esc\(x\.status === 'merged' \? 'closed' : x\.status\)/, 'a merged request is filtered with the closed');
  assert.match(tpl, /NAV_MARK\.requests = /);
  assert.match(readFileSync(new URL('../lib/styleguide-gen.mjs', import.meta.url), 'utf8'), /view\.requests = rows\.map/);
});

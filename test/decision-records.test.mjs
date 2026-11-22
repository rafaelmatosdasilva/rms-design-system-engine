// The team's decision records (decision-records.mjs): read with their lifecycle and the chain of which overruled
// which, and an accepted record edited in place after the first release said as a finding, in a real git history.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { parseRecord, recordChains, readRecords, recordFindings, recordDecisions } from '../lib/decision-records.mjs';
import { decisionsFrom, decisionView, ruledOutLines } from '../lib/decisions.mjs';
import { tempDir } from './helpers.mjs';

const RECORD = (title, status, decision, extra = '') => `# ${title}\n\nStatus: ${status}\n\n## Context\n\nWhy we had to decide.\n\n## Decision\n\n${decision}\n\n## Consequences\n\nWhat follows.\n${extra}`;

test('a record is read for its status, its sections, what it supersedes and the contracts it links', () => {
  const r = parseRecord(RECORD('Use one button for every action', 'Accepted', 'One button component, variants for emphasis.\nRuled out: a link styled as a button', '\nSupersedes [0001](0001-two-buttons.md)\n\nSee [the contract](../../contracts/button.contract.json).\n'), 'docs/decisions/0002-one-button.md');
  assert.equal(r.status, 'accepted');
  assert.equal(r.id, '0002-one-button');
  assert.deepEqual(r.supersedes, ['0001-two-buttons']);
  assert.ok(r.links.includes('../../contracts/button.contract.json'), 'it links the contract, never holds it');
  assert.equal(parseRecord('# A\n\n## Status\n\nSuperseded by [0003](0003-x.md)\n', 'a.md').status, 'superseded');
});

test('the chain is read from either side, once each, and only between records that exist', () => {
  const a = { id: '0001', supersededBy: ['0002'], supersedes: [] }, b = { id: '0002', supersededBy: [], supersedes: ['0001', '0009'] };
  assert.deepEqual(recordChains([a, b]), [{ from: '0001', to: '0002' }]);
});

const run = (cwd, ...args) => { const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 'QA', GIT_AUTHOR_EMAIL: 'qa@example.com', GIT_COMMITTER_NAME: 'QA', GIT_COMMITTER_EMAIL: 'qa@example.com' } }); assert.equal(r.status, 0, r.stderr); return r.stdout; };

test('after the first release, an accepted record edited in place is a finding, and one superseded properly is not', () => {
  const dir = tempDir('decision-records-');
  try {
    mkdirSync(join(dir, 'docs', 'decisions'), { recursive: true });
    const f = (n) => join(dir, 'docs', 'decisions', n);
    run(dir, 'init', '-q'); run(dir, 'config', 'commit.gpgsign', 'false');
    writeFileSync(f('0001-two-buttons.md'), RECORD('Two buttons', 'Accepted', 'A primary and a secondary button.'));
    writeFileSync(f('0002-radius.md'), RECORD('Corner radius', 'Accepted', 'Every control has a 4px radius.'));
    run(dir, 'add', '.'); run(dir, 'commit', '-qm', 'records'); run(dir, 'tag', 'v1.0.0');
    // 0002 rewritten in place: a finding. 0001 superseded the way it should be: only its status and a link change.
    writeFileSync(f('0002-radius.md'), RECORD('Corner radius', 'Accepted', 'Every control has an 8px radius.'));
    writeFileSync(f('0001-two-buttons.md'), RECORD('Two buttons', 'Superseded', 'A primary and a secondary button.', '\nSuperseded by [0003](0003-one-button.md)\n'));
    writeFileSync(f('0003-one-button.md'), RECORD('One button', 'Accepted', 'One button with variants.', '\nSupersedes [0001](0001-two-buttons.md)\n'));
    run(dir, 'add', '.'); run(dir, 'commit', '-qm', 'decide again');
    const r = recordFindings(dir, {});
    assert.equal(r.firstRelease, 'v1.0.0');
    assert.deepEqual(r.chains, [{ from: '0001-two-buttons', to: '0003-one-button' }]);
    assert.deepEqual(r.findings.map((x) => x.title), ['Corner radius']);
    assert.equal(r.findings[0].changes[0].by, 'QA');
    // In the decisions log: the overruled one is said as no longer holding, with what overruled it.
    const view = decisionView(decisionsFrom({ records: recordDecisions(readRecords(dir, {})) }));
    const kinds = Object.fromEntries(view.all.map((d) => [d.what, d.kind]));
    assert.deepEqual(kinds, { 'Two buttons': 'overruled', 'Corner radius': 'record', 'One button': 'record' });
    assert.ok(ruledOutLines(view, 'buttons').some((l) => /no longer holds: Two buttons - overruled by One button/.test(l)));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('before a first release a record may still be shaped, and a project with no records has none', () => {
  const dir = tempDir('decision-records-');
  try {
    assert.equal(readRecords(dir, {}), null);
    mkdirSync(join(dir, 'adr'), { recursive: true });
    run(dir, 'init', '-q'); run(dir, 'config', 'commit.gpgsign', 'false');
    writeFileSync(join(dir, 'adr', '0001-x.md'), RECORD('X', 'Accepted', 'A.'));
    run(dir, 'add', '.'); run(dir, 'commit', '-qm', 'a');
    writeFileSync(join(dir, 'adr', '0001-x.md'), RECORD('X', 'Accepted', 'B.'));
    run(dir, 'add', '.'); run(dir, 'commit', '-qm', 'b');
    const r = recordFindings(dir, {});
    assert.equal(r.firstRelease, null);
    assert.deepEqual(r.findings, []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

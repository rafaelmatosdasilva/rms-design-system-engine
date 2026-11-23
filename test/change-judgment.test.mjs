// A second pass on an agent's change (change-judgment.mjs): a second model reads the diff beside the request and the
// catalog, and answers apart whether it stayed inside the system and whether it did what was asked. Advisory.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { judgeChange, changePrompt, parseChangeJudgment, changeLines, changeMarkdown, changeDiff, DECISIONS } from '../lib/change-judgment.mjs';
import { tempDir } from './helpers.mjs';

const run = (cwd, ...args) => { const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 'QA', GIT_AUTHOR_EMAIL: 'qa@example.com', GIT_COMMITTER_NAME: 'QA', GIT_COMMITTER_EMAIL: 'qa@example.com' } }); assert.equal(r.status, 0, r.stderr); return r.stdout; };
const ANSWER = JSON.stringify({ result: JSON.stringify({ findings: [
  { decision: 'system', verdict: 'breaks', severity: 'high', evidence: 'src/Orders.jsx builds a table by hand where the catalog has dataTable.', check: 'Use dataTable for the order list.' },
  { decision: 'asked', verdict: 'holds', severity: 'low', evidence: 'The list shows each order with its status, as asked.', check: '' },
] }), total_cost_usd: 0.04 });

test('the two decisions are asked apart, with the request, the catalog and the diff, and a long diff is said as cut', () => {
  assert.deepEqual(DECISIONS.map((d) => d.id), ['system', 'asked']);
  const p = changePrompt({ request: 'Show the orders with their status', diff: '+ <table>', catalog: ['- dataTable: rows of records'] });
  assert.match(p, /You did not make it/);
  assert.match(p, /Show the orders with their status[^]*dataTable: rows of records[^]*\+ <table>[^]*- system:[^]*- asked:/);
  assert.match(changePrompt({ request: 'x', diff: 'y'.repeat(70000) }), /its first 60000 characters of 70000/);
});

test('the answer is held to the two decisions and their words, and anything else is not an answer', () => {
  const f = parseChangeJudgment('```json\n{"findings":[{"decision":"system","verdict":"BREAKS","severity":"high","evidence":"x"},{"decision":"invented","verdict":"holds"}]}\n```');
  assert.deepEqual(f.map((x) => [x.decision, x.verdict]), [['system', 'breaks']]);
  assert.equal(parseChangeJudgment('I think it is fine.'), null);
});

test('a change in a real branch is judged once, then kept by its diff and request, and said as advice', async () => {
  const dir = tempDir('change-judgment-');
  try {
    run(dir, 'init', '-q', '-b', 'main'); run(dir, 'config', 'commit.gpgsign', 'false');
    mkdirSync(join(dir, 'contracts'), { recursive: true });
    writeFileSync(join(dir, 'contracts', 'catalog.json'), JSON.stringify({ components: { dataTable: { purpose: 'Rows of records, sortable' } } }));
    writeFileSync(join(dir, 'a.txt'), 'one\n'); run(dir, 'add', '.'); run(dir, 'commit', '-qm', 'base');
    run(dir, 'checkout', '-q', '-b', 'feature');
    writeFileSync(join(dir, 'Orders.jsx'), '<table><tr><td>Order</td></tr></table>\n'); run(dir, 'add', '.'); run(dir, 'commit', '-qm', 'orders');
    assert.match(changeDiff(dir, { base: 'main' }).diff, /Orders\.jsx/);
    let asked = 0, prompt = '';
    const ask = async (p) => { asked++; prompt = p; return { ok: true, out: ANSWER }; };
    const r = await judgeChange(dir, {}, { request: 'Show the orders with their status', base: 'main', ask });
    assert.equal(asked, 1);
    assert.match(prompt, /dataTable: Rows of records, sortable/);
    assert.deepEqual(r.findings.map((f) => [f.decision, f.verdict]), [['system', 'breaks'], ['asked', 'holds']]);
    assert.equal(r.cost, 0.04);
    const again = await judgeChange(dir, {}, { request: 'Show the orders with their status', base: 'main', ask });
    assert.equal(asked, 1, 'the same change is never paid for twice');
    assert.equal(again.cached, true);
    const lines = changeLines(r).join('\n');
    assert.match(lines, /⚠️ It stayed inside the system: breaks \(high\)\. src\/Orders\.jsx builds a table by hand[^]*check: Use dataTable[^]*Advisory/);
    assert.match(changeMarkdown(r), /\*\*It did what was asked\*\*: holds/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('with no request, or no change, nothing is asked, and why is said', async () => {
  const ask = async () => { throw new Error('never asked'); };
  assert.match((await judgeChange('.', {}, { request: '', diff: '+x', ask })).why, /no request/);
  assert.match((await judgeChange('.', {}, { request: 'do it', diff: '   ', ask })).why, /no change/);
  assert.match((await judgeChange('.', {}, { request: 'do it', diff: '+x', ask: async () => ({ ok: true, out: 'not json' }) })).why, /not the JSON/);
});

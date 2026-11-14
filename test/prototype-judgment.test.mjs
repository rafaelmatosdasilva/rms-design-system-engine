// Did what the designer asked for come out whole. Everything else the engine checks about a prototype is
// structure, and all of it can hold while the thing is useless: asked for a way to approve an order, got a page
// where the approve button leads nowhere, every check passing because nothing it measures is wrong.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from './helpers.mjs';
import { DECISIONS, DECISION_IDS, decisionsFrom, judgmentPrompt, parseJudgment, broken, judgmentLines, judgePrototype } from '../lib/prototype-judgment.mjs';

const shotIn = (dir, name = 'a.png') => { const p = join(dir, name); writeFileSync(p, 'not really a picture'); return p; };
const pagesIn = (dir) => [{ name: 'orders', shot: shotIn(dir), outline: 'Page > DataTable > Button(Approve)', leadsTo: [] }];
const answer = (findings, cost = 0.08) => async () => JSON.stringify({ result: JSON.stringify({ findings }), total_cost_usd: cost });
const ALL = (v = 'holds') => DECISION_IDS.map((id) => ({ decision: id, verdict: v, severity: 'low', evidence: `${id} seen`, check: `check ${id}` }));

test('the decisions are named and fixed, and a project may judge fewer', () => {
  // A judgement nobody can repeat is an opinion: the words are the engine's on every project.
  assert.deepEqual(DECISION_IDS, ['asked', 'whole', 'honest', 'shown']);
  for (const id of DECISION_IDS) { assert.ok(DECISIONS[id].label); assert.ok(DECISIONS[id].ask.length > 60, id); }
  assert.deepEqual(decisionsFrom({}).decisions.map((d) => d.id), DECISION_IDS);
  const some = decisionsFrom({ prototypeJudgment: { decisions: ['whole', 'nonsense'] } });
  assert.deepEqual(some.decisions.map((d) => d.id), ['whole']);
  assert.deepEqual(some.unknown, ['nonsense'], 'a name it does not know is said, not silently dropped');
});

test('the question gives the request as the designer wrote it', () => {
  const p = judgmentPrompt({ request: 'a way to approve an order', pages: [{ name: 'orders', shot: '/s/a.png', outline: 'Page', leadsTo: ['done'] }], decisions: decisionsFrom({}).decisions });
  assert.match(p, /in the designer's own words:\na way to approve an order/);
  assert.match(p, /1\. orders → done/);
  assert.match(p, /picture: \/s\/a\.png/);
  assert.match(p, /read the image file before you answer/);
  assert.match(p, /JSON only, no other text/);
  // A page that leads nowhere says so, since that is half of what is being judged.
  assert.match(judgmentPrompt({ request: 'x', pages: [{ name: 'orders', shot: 's' }], decisions: [] }), /orders \(leads nowhere\)/);
});

test('an answer is held to the decisions that were asked', () => {
  const ds = decisionsFrom({}).decisions;
  const got = parseJudgment(JSON.stringify({ findings: [...ALL('breaks'), { decision: 'invented', verdict: 'breaks' }] }), ds);
  assert.deepEqual(got.map((f) => f.decision), DECISION_IDS, 'one nobody asked about is dropped');
  assert.equal(got[0].label, DECISIONS.asked.label);
  // A verdict or severity the engine does not know becomes the cautious one, never the loud one.
  const odd = parseJudgment(JSON.stringify({ findings: [{ decision: 'whole', verdict: 'catastrophic', severity: 'enormous' }] }), ds);
  assert.deepEqual([odd[0].verdict, odd[0].severity], ['unclear', 'low']);
  assert.equal(parseJudgment('not json at all', ds), null);
  assert.equal(parseJudgment(JSON.stringify({ findings: [] }), ds), null);
});

test('it refuses to judge the pages against themselves', async () => {
  const dir = tempDir('proto-judge-');
  // Without the request there is nothing to compare the pages with, and a judgement taken from the pages alone
  // would be the pages marking their own work.
  assert.match((await judgePrototype(dir, {}, { request: '  ', pages: pagesIn(dir) })).why, /no request to judge it against/);
  assert.match((await judgePrototype(dir, {}, { request: 'x', pages: [] })).why, /no drawn page/);
  assert.match((await judgePrototype(dir, {}, { request: 'x', pages: [{ name: 'gone', shot: 'nowhere.png' }] })).why, /no picture of "gone" was drawn/);
  assert.match((await judgePrototype(dir, { prototypeJudgment: { decisions: ['nope'] } }, { request: 'x', pages: pagesIn(dir) })).why, /no decision to judge/);
});

test('a flow judged once is not paid for twice', async () => {
  const dir = tempDir('proto-judge-cache-');
  const pages = pagesIn(dir);
  let asked = 0;
  const ask = async (...a) => { asked += 1; return answer(ALL('holds'))(...a); };
  const first = await judgePrototype(dir, {}, { request: 'a way to approve an order', pages, ask });
  assert.equal(first.asked, 1); assert.equal(first.cached, false); assert.equal(first.cost, 0.08);
  const again = await judgePrototype(dir, {}, { request: 'a way to approve an order', pages, ask });
  assert.equal(again.cached, true); assert.equal(again.asked, 0); assert.equal(again.cost, 0);
  assert.equal(asked, 1, 'the model was asked once');
  // A different request is a different question, even on the same pages.
  await judgePrototype(dir, {}, { request: 'a way to reject an order', pages, ask });
  assert.equal(asked, 2);
});

test('what a person reads, and that it is advisory', async () => {
  const dir = tempDir('proto-judge-lines-');
  const run = await judgePrototype(dir, {}, { request: 'a way to approve an order', pages: pagesIn(dir), ask: answer([
    { decision: 'asked', verdict: 'holds', severity: 'low', evidence: 'it approves', check: 'the button is there' },
    { decision: 'whole', verdict: 'breaks', severity: 'high', evidence: 'Approve leads nowhere', check: 'click Approve' },
  ]) });
  const said = judgmentLines(run).join('\n');
  assert.match(said, /1 of 2 decision\(s\) break · \$0\.08/);
  assert.match(said, /❌ Nothing drawn but dead: Approve leads nowhere/);
  assert.match(said, /check: click Approve/);
  assert.match(said, /Advisory: a model read the drawn pages, not a person/);
  assert.deepEqual(broken(run.findings).map((f) => f.decision), ['whole']);
  // All holding is said in one line: a thing that was paid for should not look like a thing that never ran.
  const good = judgmentLines({ findings: ALL('holds'), cost: 0.05, cached: false });
  assert.match(good.join('\n'), /4 decision\(s\), all hold · \$0\.05/);
  assert.deepEqual(judgmentLines(null), []);
  assert.match(judgmentLines({ why: 'no request' }).join('\n'), /not judged: no request/);
});

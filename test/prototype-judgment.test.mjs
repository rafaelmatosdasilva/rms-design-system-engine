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
// What the person's command answers (askModel): { ok, out }, the model's own JSON on stdout.
const answer = (findings, cost = 0.08) => async () => ({ ok: true, out: JSON.stringify({ result: JSON.stringify({ findings }), total_cost_usd: cost }) });
const ALL = (v = 'holds') => DECISION_IDS.map((id) => ({ decision: id, verdict: v, severity: 'low', evidence: `${id} seen`, check: `check ${id}` }));

test('the decisions are named and fixed, and a project may judge fewer', () => {
  // A judgement nobody can repeat is an opinion: the words are the engine's on every project.
  assert.deepEqual(DECISION_IDS, ['asked', 'whole', 'honest', 'shown', 'unasked']);
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
  assert.match(good.join('\n'), /5 decision\(s\), all hold · \$0\.05/);
  assert.deepEqual(judgmentLines(null), []);
  assert.match(judgmentLines({ why: 'no request' }).join('\n'), /not judged: no request/);
});

// ── A judgement that keeps coming back ──────────────────────────────────────────────────────────────────────────
// Everything above judges one flow once. A decision judged broken again and again is not four findings: it is a
// rule the team never wrote down, and lessons.mjs proposes it once it has been seen enough times.
import { REPEAT_RULES, readSeen, proposedRules } from '../lib/lessons.mjs';
import { flowPlace, dueFromJudging, dueLines } from '../lib/prototype-judgment.mjs';

test('every prototype decision has a rule to propose, in its own words', () => {
  for (const id of DECISION_IDS) {
    const r = REPEAT_RULES[`proto:${id}`];
    assert.ok(r, `proto:${id}`);
    assert.equal(r.form, 'guideline', 'a judgement of a whole flow is not something an edit check can hold');
    assert.ok(r.text.length > 30 && r.text.endsWith('.'), `${id}: ${r.text}`);
  }
});

test('a flow is one place, named by its pages', () => {
  assert.equal(flowPlace([{ name: 'orders' }, { name: 'approve' }]), 'approve+orders', 'the same flow judged again is the same place');
  assert.equal(flowPlace([{ name: 'approve' }, { name: 'orders' }]), 'approve+orders', 'whatever order they come in');
  assert.equal(flowPlace([]), 'the flow');
});

test('a decision judged broken is counted once for the flow, not once per page', async () => {
  const dir = tempDir('proto-judge-repeat');
  const pages = [
    { name: 'orders', shot: shotIn(dir, 'orders.png'), outline: 'a list', leadsTo: ['approve'] },
    { name: 'approve', shot: shotIn(dir, 'approve.png'), outline: 'a button', leadsTo: [] },
  ];
  await judgePrototype(dir, {}, { request: 'a way to approve an order', pages, now: '2026-11-15T10:00:00Z',
    ask: answer([{ decision: 'whole', verdict: 'breaks', severity: 'high', evidence: 'Approve leads nowhere', check: 'click it' }]) });
  const seen = readSeen(dir);
  assert.equal(seen.repeats['proto:whole']?.times, 1, 'one flow judged is one count, not two pages');
  assert.deepEqual(Object.keys(seen.repeats['proto:whole'].places), ['approve+orders']);
});

test('a decision that holds is never counted', async () => {
  const dir = tempDir('proto-judge-holds');
  await judgePrototype(dir, {}, { request: 'a way to approve an order', pages: pagesIn(dir), now: '2026-11-15T10:00:00Z',
    ask: answer([{ decision: 'whole', verdict: 'holds', severity: 'low', evidence: 'everything leads somewhere', check: '' }]) });
  assert.equal(readSeen(dir).repeats['proto:whole'], undefined);
});

test('the same flow made the same way again counts again, and a rule falls due', async () => {
  const dir = tempDir('proto-judge-due');
  const breaks = [{ decision: 'whole', verdict: 'breaks', severity: 'high', evidence: 'Approve leads nowhere', check: 'click it' }];
  // Three different flows, each judged broken the same way: the same mistake made three times.
  for (const [i, name] of ['orders', 'billing', 'profile'].entries()) {
    const pages = [{ name, shot: shotIn(dir, `${name}.png`), outline: 'a button', leadsTo: [] }];
    await judgePrototype(dir, {}, { request: `flow ${i}`, pages, now: `2026-11-1${5 + i}T10:00:00Z`, ask: answer(breaks) });
  }
  assert.equal(readSeen(dir).repeats['proto:whole'].times, 3);

  const due = await dueFromJudging(dir);
  assert.equal(due.length, 1, 'one rule, not three findings');
  assert.equal(due[0].kind, 'proto:whole');
  assert.equal(due[0].text, REPEAT_RULES['proto:whole'].text, 'proposed in the engine\'s words, the same on every project');
  assert.deepEqual(due[0].places.sort(), ['billing', 'orders', 'profile']);

  const lines = dueLines(due).join('\n');
  assert.ok(lines.includes('3 time(s) across 3 prototype(s)'), lines);
  assert.ok(lines.includes('the team decides each one'), 'it proposes; it does not write');
});

test('a prototype judgement never counts toward a screen review\'s rule, nor the other way', async () => {
  const dir = tempDir('proto-judge-apart');
  await judgePrototype(dir, {}, { request: 'a way to approve an order', pages: pagesIn(dir), now: '2026-11-15T10:00:00Z',
    ask: answer([{ decision: 'whole', verdict: 'breaks', severity: 'high', evidence: 'dead', check: 'click' }]) });
  const seen = readSeen(dir);
  assert.ok(seen.repeats['proto:whole'], 'counted under its own prefix');
  assert.equal(seen.repeats['judge:whole'], undefined, 'and never under the screen review\'s');
});

test('nothing judged broken proposes nothing', async () => {
  assert.deepEqual(dueLines([]), []);
  assert.deepEqual(await dueFromJudging(tempDir('proto-judge-none')), []);
});

// ── Nothing nobody asked for ────────────────────────────────────────────────────────────────────────────────────
// The case the judgment item names: a default an agent keeps adding unasked (a shadow on every card). Written down
// as a constraint it stops; left unnamed, every prototype gets it again and somebody takes it out by hand.
import { PROMPT_VERSION } from '../lib/prototype-judgment.mjs';

const SAYS = [{ name: 'ConsultPage', purpose: 'A shell for inquiry and list screens, with a toolbar above the table.' }];

test('what was added that nobody asked for is a decision of its own', () => {
  assert.ok(DECISION_IDS.includes('unasked'));
  const d = DECISIONS.unasked;
  assert.match(d.ask, /Name what was added and where/, 'a finding has to say what, or it cannot be acted on');
  assert.match(d.ask, /the system's documentation requires/, 'the system\'s own parts are never what was added');
  assert.match(d.ask, /implies without naming it/, 'a way back from a page the request asks for is not an addition');
});

test('the system\'s own documentation is given, so a required part is not read as an addition', () => {
  const ds = [{ id: 'unasked', ...DECISIONS.unasked }];
  const p = judgmentPrompt({ request: 'a list of orders', pages: [], decisions: ds, says: SAYS });
  assert.ok(p.includes('A part that is here is the system\'s, not something added on top'), p.slice(0, 400));
  assert.ok(p.includes('ConsultPage: A shell for inquiry'), 'with the documentation\'s own words');
});

test('the documentation is given only where it is what is being judged', () => {
  const other = [{ id: 'whole', ...DECISIONS.whole }];
  const p = judgmentPrompt({ request: 'a list', pages: [], decisions: other, says: SAYS });
  assert.ok(!p.includes('ConsultPage'), 'a question about dead controls is not answered by what a page is built from');
});

test('a system that documents no shell says so by its absence, never by a guess', () => {
  const ds = [{ id: 'unasked', ...DECISIONS.unasked }];
  const p = judgmentPrompt({ request: 'a list', pages: [], decisions: ds, says: [] });
  assert.ok(!p.includes('documentation says a page is built from'), 'nothing is made up to fill the section');
});

test('a shell whose documentation says nothing is still named', () => {
  const ds = [{ id: 'unasked', ...DECISIONS.unasked }];
  const p = judgmentPrompt({ request: 'a list', pages: [], decisions: ds, says: [{ name: 'BarePage', purpose: '' }] });
  assert.ok(p.includes('BarePage: (its documentation says nothing about it)'), 'it exists, and that it is undocumented is worth seeing');
});

test('what the documentation says is part of the question, so an answer to another is never reused', async () => {
  const dir = tempDir('proto-judge-says-key');
  let asked = 0;
  const ask = async () => { asked += 1; return answer([{ decision: 'unasked', verdict: 'holds', severity: 'low', evidence: 'nothing added', check: 'read the pages' }])(); };
  const base = { request: 'a list of orders', pages: pagesIn(dir), ask, now: '2026-11-15T10:00:00Z' };
  await judgePrototype(dir, {}, { ...base, says: SAYS });
  await judgePrototype(dir, {}, { ...base, says: SAYS });
  assert.equal(asked, 1, 'the same question is not paid for twice');
  await judgePrototype(dir, {}, { ...base, says: [{ name: 'ConsultPage', purpose: 'Something else entirely.' }] });
  assert.equal(asked, 2, 'documentation that changed is a different question');
});

test('the question\'s version moved when a decision was added', () => {
  assert.ok(PROMPT_VERSION >= 2, 'an answer to the four-decision question is never reused for the five');
});

test('a default added again and again becomes a rule, like the other decisions', async () => {
  const dir = tempDir('proto-judge-unasked-rule');
  const added = [{ decision: 'unasked', verdict: 'breaks', severity: 'medium', evidence: 'a shadow on every card', check: 'look at the cards' }];
  for (const [i, name] of ['orders', 'billing', 'profile'].entries()) {
    const pages = [{ name, shot: shotIn(dir, `${name}.png`), outline: 'cards', leadsTo: [] }];
    await judgePrototype(dir, {}, { request: `flow ${i}`, pages, says: SAYS, now: `2026-11-1${5 + i}T10:00:00Z`, ask: answer(added) });
  }
  const due = await dueFromJudging(dir);
  assert.deepEqual(due.map((r) => r.kind), ['proto:unasked']);
  assert.match(due[0].text, /nothing is added on top/, 'the constraint that stops it');
});

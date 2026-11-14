// Which shell a request starts from, judged by a model: it chooses only from the shells it was given, says where
// its reason came from, may answer that none of them fits, and is laid over the counted order rather than instead
// of it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tempDir } from './helpers.mjs';
import { shellPrompt, parseShells, restsOnDocs, shellOrder, shellJudgmentLines, judgeShells, FITS } from '../lib/shell-judgment.mjs';
import { reorder, directionsFor } from '../lib/prototype-directions.mjs';

const SHELLS = [
  { name: 'ConsultPage', purpose: 'A page shell for inquiry and list experiences, where a person looks something up.' },
  { name: 'CreatePage', purpose: 'A page shell for entering a new record through a form.' },
  { name: 'DetailPage', purpose: 'A page shell for one record shown in full.' },
];
const answer = (rows) => JSON.stringify({ shells: rows });

test('the question gives each shell its own documentation and forbids any other', () => {
  const p = shellPrompt({ request: 'a page to browse orders', shells: SHELLS });
  assert.ok(p.includes('Do not name any other shell, and do not invent one.'));
  for (const s of SHELLS) assert.ok(p.includes(s.name) && p.includes(s.purpose.slice(0, 30)), s.name);
  assert.ok(p.includes('a page to browse orders'), 'the request is given as the designer wrote it');
  for (const f of FITS) assert.ok(p.includes(f), f);
});

test('a shell the system does not have is dropped, and said', () => {
  const got = parseShells(answer([
    { name: 'ConsultPage', fit: 'starts here', why: 'a list a person looks something up in' },
    { name: 'DashboardShell', fit: 'starts here', why: 'it would suit a dashboard' },
  ]), SHELLS);
  assert.deepEqual(got.shells.map((s) => s.name), ['ConsultPage']);
  assert.deepEqual(got.invented, ['DashboardShell'], 'what it invented is named, never quietly dropped');
});

test('a shell it was not asked about cannot be answered for twice', () => {
  const got = parseShells(answer([
    { name: 'ConsultPage', fit: 'starts here', why: 'first' },
    { name: 'ConsultPage', fit: 'no', why: 'second' },
  ]), SHELLS);
  assert.equal(got.shells.length, 1);
  assert.equal(got.shells[0].why, 'first', 'the first answer stands');
});

test('a fit the engine does not know reads as no, never as a guess', () => {
  const got = parseShells(answer([{ name: 'ConsultPage', fit: 'perfect', why: 'x' }]), SHELLS);
  assert.equal(got.shells[0].fit, 'no');
});

test('an answer that is not the JSON asked for is no answer', () => {
  assert.equal(parseShells('I think ConsultPage is best.', SHELLS), null);
  assert.equal(parseShells(answer([{ name: 'Nope', fit: 'no', why: 'x' }]), SHELLS), null, 'nothing of the system left is nothing');
});

test('a reason is marked by whether the documentation says it', () => {
  assert.ok(restsOnDocs('It is a list a person looks something up in.', SHELLS[0].purpose));
  assert.ok(restsOnDocs('Nothing is being entered here.', SHELLS[1].purpose), 'entering and entered are one word');
  assert.ok(!restsOnDocs('It sounds like a dashboard to me.', SHELLS[0].purpose), 'the model read the name, not the documentation');
  assert.ok(!restsOnDocs('Anything at all.', ''), 'a shell with no documentation grounds nothing');
});

test('the judged order is what starts here, then what could, then the rest', () => {
  const got = parseShells(answer([
    { name: 'CreatePage', fit: 'no', why: 'nothing is entered' },
    { name: 'ConsultPage', fit: 'starts here', why: 'a list a person looks something up in' },
    { name: 'DetailPage', fit: 'could', why: 'a row could open in full' },
  ]), SHELLS);
  assert.deepEqual(shellOrder(got, SHELLS).map((s) => s.name), ['ConsultPage', 'DetailPage', 'CreatePage']);
  assert.deepEqual(shellOrder(null, SHELLS).map((s) => s.name), SHELLS.map((s) => s.name), 'no run leaves the counted order alone');
});

test('a shell the run never mentioned keeps its counted place, at the end', () => {
  const judged = { shells: [{ name: 'DetailPage', fit: 'starts here', why: 'one record' }] };
  const order = reorder(SHELLS, judged).map((s) => s.name);
  assert.equal(order[0], 'DetailPage');
  assert.deepEqual(order.slice(1), ['ConsultPage', 'CreatePage'], 'the rest keep the order they came in');
});

test('a judged direction says why in the words the run gave it', () => {
  const ctx = { components: {}, templates: SHELLS.map((s) => ({ name: s.name, purpose: s.purpose })) };
  const focus = { request: 'a page to browse orders', components: [], sections: [] };
  const judged = { shells: [{ name: 'DetailPage', fit: 'starts here', why: 'the request is one record shown in full' }] };
  const ds = directionsFor(ctx, focus, { judged });
  if (ds.length) assert.equal(ds[0].why, 'the request is one record shown in full', 'the run\'s own sentence, not a count');
  const plain = directionsFor(ctx, focus);
  if (plain.length) assert.ok(!/one record shown in full/.test(plain[0].why), 'without a run nothing of it leaks in');
});

test('none of them fitting is an answer, not a failure', () => {
  const got = parseShells(answer([
    { name: 'ConsultPage', fit: 'could', why: 'it is a list, but the request wants a board' },
    { name: 'CreatePage', fit: 'no', why: 'nothing is entered' },
    { name: 'DetailPage', fit: 'no', why: 'not one record' },
  ]), SHELLS);
  const lines = shellJudgmentLines({ shells: got.shells, invented: [] }).join('\n');
  assert.ok(lines.includes('none of the 3 shells'), lines);
  assert.ok(lines.includes('the system may be missing the one this asks for'), 'a gap worth telling the design team');
  assert.ok(lines.includes('could: ConsultPage'), lines);
});

test('a reason the documentation does not say is shown as the model\'s own', () => {
  const got = parseShells(answer([{ name: 'ConsultPage', fit: 'starts here', why: 'it sounds like a dashboard' }]), SHELLS);
  const lines = shellJudgmentLines({ shells: got.shells, invented: [] }).join('\n');
  assert.ok(lines.includes('(not from the documentation: the model read the name)'), lines);
});

test('what it is told it cannot judge, it says rather than guesses', async () => {
  const dir = tempDir('shell-judgment-refusals');
  const no = (r) => judgeShells(dir, {}, r);
  assert.match((await no({ request: '', shells: SHELLS })).why, /no request/);
  assert.match((await no({ request: 'x', shells: [] })).why, /documents no page shell/);
  assert.match((await no({ request: 'x', shells: [SHELLS[0]] })).why, /one page shell/, 'one shell is not a choice');
});

test('it is never asked twice for the same question', async () => {
  const dir = tempDir('shell-judgment-cache');
  let asked = 0;
  // what the model's command prints: the answer, and what it cost (page-judgment.mjs reads this shape)
  const ask = async () => { asked += 1; return { ok: true, out: JSON.stringify({ result: answer([{ name: 'ConsultPage', fit: 'starts here', why: 'a list' }]), total_cost_usd: 0.01 }) }; };
  const req = { request: 'a page to browse orders', shells: SHELLS, ask };
  const run = await judgeShells(dir, {}, req);
  assert.equal(asked, 1);
  assert.equal(run.shells[0].name, 'ConsultPage');
  assert.equal(run.cost, 0.01, 'what it cost is carried, never hidden');

  const again = await judgeShells(dir, {}, req);
  assert.equal(asked, 1, 'the same question is not paid for twice');
  assert.ok(again.cached);
  assert.deepEqual(again.shells, run.shells);

  // A different request is a different question, whatever the shells are.
  await judgeShells(dir, {}, { ...req, request: 'a page to create an order' });
  assert.equal(asked, 2);
});

test('an answer the model would not give is said, not treated as none', async () => {
  const run = await judgeShells(tempDir('shell-judgment-garbled'), {}, { request: 'a page', shells: SHELLS, ask: async () => ({ ok: true, out: 'no idea' }) });
  assert.match(run.why, /was not the JSON/);
  assert.equal(run.asked, 1, 'it was paid for, and the run says so');
});

// askModel answers { ok, out, why }: a command that never ran has no stdout to read, and saying so is not the
// same as the model answering badly. Reading the object as if it were stdout gave "[object Object]", which
// parsed as no answer at all - so every real run reported the model's answer as malformed JSON.
test('a command that could not run is said as that, not as a bad answer', async () => {
  const run = await judgeShells(tempDir('shell-judgment-nocmd'), {}, {
    request: 'a page', shells: SHELLS, ask: async () => ({ ok: false, why: 'claude: command not found' }) });
  assert.equal(run.why, 'claude: command not found');
  assert.equal(run.asked, 1);
});

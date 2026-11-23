// test/skill-evals/procedure.mjs - what following the guide cost a run before it did anything.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { procedureCost, procedureSummary, procedureLines, shellReads, shortPath } from './skill-evals/procedure.mjs';

// A transcript as the runner keeps it: assistant messages with their usage and tool calls, and the answers.
let n = 0;
const say = (input, ...calls) => ({ type: 'assistant', message: { id: `m${++n}`, usage: { input_tokens: 10, cache_read_input_tokens: input - 10 }, content: calls.map(([name, inp]) => ({ type: 'tool_use', id: `t${++n}`, name, input: inp })) } });
const answer = (ev, text) => ({ type: 'user', message: { content: ev.message.content.map((c) => ({ type: 'tool_result', tool_use_id: c.id, content: text })) } });
const P = '/private/var/folders/x/T/skill-eval-Ab12/';
const E = '/opt/agent/.claude/skills/rms-design-system-engine/';

test('a shell command\'s reads are the files it names, and a path is the project\'s or the engine\'s', () => {
  assert.deepEqual(shellReads('cat src/theme.css && head -n 40 "docs/a b.md" | grep x'), ['src/theme.css', 'docs/a b.md']);
  assert.deepEqual(shellReads("sed -n '1,80p' cookbook/prototype.md"), ['cookbook/prototype.md']);
  assert.deepEqual(shellReads('node audit.mjs --summary'), []);
  assert.equal(shortPath(`${P}src/theme.css`), 'src/theme.css');
  assert.equal(shortPath(`${E}cookbook/prototype.md`), '<engine>/cookbook/prototype.md');
  assert.equal(shortPath('D:\\a\\_temp\\skill-eval-9z\\src\\a.css'), 'src/a.css');
});

test('what a run read before its first write, how far in it came, and what it read twice', () => {
  const a = say(40000, ['Skill', { skill: 'rms-design-system-engine' }]);
  const b = say(50000, ['Read', { file_path: `${E}cookbook/prototype.md` }], ['Bash', { command: `cat ${P}src/theme.css` }]);
  const c = say(60000, ['Read', { file_path: `${E}cookbook/prototype.md` }]);
  const d = say(70000, ['Edit', { file_path: `${P}src/App.jsx` }]);
  const e = say(80000, ['Bash', { command: 'node audit.mjs --check-ui x.json 2>&1' }]);
  const cost = procedureCost([a, answer(a, 'x'.repeat(2048)), b, answer(b, 'y'.repeat(1024)), c, answer(c, 'y'.repeat(1024)), d, answer(d, 'ok'), e, answer(e, 'ok')]);
  assert.equal(cost.startTokens, 40000);
  assert.equal(cost.calls, 6);
  assert.equal(cost.firstWrite, 5);
  assert.equal(cost.beforeWrite.calls, 4);
  assert.equal(cost.beforeWrite.reads, 4);
  assert.deepEqual(cost.beforeWrite.guideReads, ['<engine>/rms-design-system-engine.md', '<engine>/cookbook/prototype.md']);
  assert.equal(cost.beforeWrite.guideBytes, 2048 + 1024 + 1024);
  assert.equal(cost.beforeWrite.tokens, 40000 + 50000 + 60000 + 70000);
  assert.deepEqual(cost.readTwice, ['<engine>/cookbook/prototype.md']);
});

test('a write through the shell is a write, a stream sent to /dev/null is not, and a run that writes nothing is measured to its end', () => {
  const r = say(1000, ['Bash', { command: 'node audit.mjs > /dev/null 2>&1' }]);
  const w = say(2000, ['Bash', { command: 'echo "{}" > prototypes/home.json' }]);
  assert.equal(procedureCost([r, w]).firstWrite, 2);
  const only = procedureCost([r]);
  assert.equal(only.firstWrite, null);
  assert.equal(only.beforeWrite.tokens, 1000);
  // A message streamed in two parts carries its usage twice: counted once.
  const part = say(5000, ['Read', { file_path: 'a' }]);
  assert.equal(procedureCost([part, { ...part, message: { ...part.message, content: [] } }]).beforeWrite.tokens, 5000);
});

test('the summary is per model, over the rows that carry the measure, and says it', () => {
  const p = (calls, firstWrite, twice = []) => ({ startTokens: 40000, calls: 9, firstWrite, beforeWrite: { calls, reads: 2, guideReads: [], bytes: 0, guideBytes: 3072, tokens: calls * 1000 }, readTwice: twice });
  const rows = [
    { model: 'm1', procedure: p(4, 5, ['src/theme.css']) }, { model: 'm1', procedure: p(6, 7) }, { model: 'm1', procedure: p(9, null) },
    { model: 'm1' },   // an older row, without the measure
  ];
  const s = procedureSummary(rows);
  assert.deepEqual(s.m1, { runs: 3, startTokens: 40000, wrote: 2, callsBefore: 5, tokensBefore: 5000, guideBytesBefore: 3072, readTwiceRuns: 1, readTwice: [['src/theme.css', 1]] });
  assert.equal(procedureLines(s)[0], 'm1: 40,000 input tokens handed over before the first call · the first write came at call 5 (median of the 2 runs that wrote), 5,000 input tokens in · 3.0 KB of the guide read before it · 1 of 3 runs read a file twice (src/theme.css ×1)');
  assert.match(procedureLines(procedureSummary([{ model: 'm2', procedure: p(3, null) }]))[0], /no run wrote anything/);
});

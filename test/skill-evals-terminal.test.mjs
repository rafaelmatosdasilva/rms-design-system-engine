// The terminal's runs in the skill evaluation: what the session printed, read as the events every scorer reads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toStreamJson, TERMINAL_VARIANT } from './skill-evals/terminal.mjs';
import { OTHER_AGENTS, AGENT_NAMES } from './skill-evals/agents.mjs';
import { variant } from './skill-evals/variants.mjs';

const OUTPUT = [
  '→ Fix what the audit found',
  '',
  '$ rms-design-system-engine --audit',
  '2 findings',
  '',
  '$ rms-design-system-engine --fix-first',
  'chip: height 30 where the token says 32',
  '',
  'Your call: apply the patch, or leave it.',
].join('\n');

test('each step the terminal ran is a Bash call with its output, and the reply is all it printed', () => {
  const events = toStreamJson(OUTPUT, { version: 'terminal 1.0.0' });
  assert.equal(events[0].claude_code_version, 'terminal 1.0.0');
  const calls = events.flatMap((e) => e.message?.content ?? []).filter((c) => c.type === 'tool_use');
  assert.deepEqual(calls.map((c) => c.input.command), ['rms-design-system-engine --audit', 'rms-design-system-engine --fix-first']);
  const results = events.flatMap((e) => e.message?.content ?? []).filter((c) => c.type === 'tool_result');
  assert.equal(results[1].content, 'chip: height 30 where the token says 32', 'the closing words are not the step\'s output');
  const end = events.at(-1);
  assert.equal(end.type, 'result');
  assert.equal(end.result, OUTPUT.trim());
  assert.equal(end.num_turns, 2);
  assert.equal(end.total_cost_usd, 0);
});

test('a how-to answered with no step is a reply and no call', () => {
  const events = toStreamJson('→ Add a note in Figma\n\nOpen the component and add the note.');
  assert.equal(events.filter((e) => e.message?.content?.[0]?.type === 'tool_use').length, 0);
  assert.match(events.at(-1).result, /add the note/);
});

test('the terminal is an agent of the evaluation, with no guide of its own', () => {
  assert.ok(AGENT_NAMES.includes('terminal'));
  assert.equal(OTHER_AGENTS.terminal.variant, 'terminal');
  assert.equal(variant('terminal'), TERMINAL_VARIANT);
  assert.equal(TERMINAL_VARIANT.text, '');
});

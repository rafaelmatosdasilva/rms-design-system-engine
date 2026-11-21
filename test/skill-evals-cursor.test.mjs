// The skill evaluation in Cursor (test/skill-evals/cursor.mjs): its events read as Claude Code's, so every scorer reads
// a Cursor run unchanged; its command line; the login a run carries; the guide and the guard a Cursor user has.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, statSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from './helpers.mjs';
import { toStreamJson, cursorArgs, cursorHome, CURSOR_VARIANT } from './skill-evals/cursor.mjs';
import { context, cliOf, DEMO } from './skill-evals/lib.mjs';
import { variant } from './skill-evals/variants.mjs';
import { OTHER_AGENTS } from './skill-evals/agents.mjs';
import { START } from '../lib/agent-rules.mjs';

const S = 'c0ffee00-0000';
const RUN = [
  { type: 'system', subtype: 'init', apiKeySource: 'login', cwd: '/p', session_id: S, model: 'Auto', permissionMode: 'default' },
  { type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'audit the chip' }] }, session_id: S },
  { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'I’ll route this first.' }] }, session_id: S },
  { type: 'tool_call', subtype: 'started', call_id: 'c1', tool_call: { shellToolCall: { args: { command: 'rms-design-system-engine --route "audit the chip"' } } }, session_id: S },
  { type: 'tool_call', subtype: 'completed', call_id: 'c1', tool_call: { shellToolCall: { args: { command: 'rms-design-system-engine --route "audit the chip"' }, result: { success: { exitCode: 0, stdout: 'ROUTE: audit-component\nNEXT: rms-design-system-engine --component chip\n', stderr: '' } } } }, session_id: S },
  { type: 'tool_call', subtype: 'completed', call_id: 'c2', tool_call: { shellToolCall: { args: { command: 'rms-design-system-engine --component chip' }, result: { failure: { exitCode: 1, stdout: 'Not in parity.\n', stderr: '' } } } }, session_id: S },
  { type: 'tool_call', subtype: 'completed', call_id: 'c3', tool_call: { readToolCall: { args: { path: 'src/theme.css' }, result: { success: { content: ':root {}', totalLines: 1 } } } }, session_id: S },
  { type: 'tool_call', subtype: 'completed', call_id: 'c4', tool_call: { editToolCall: { args: { path: 'src/theme.css', newString: '--x: 1px;' }, result: { success: {} } } }, session_id: S },
  { type: 'tool_call', subtype: 'completed', call_id: 'c5', tool_call: { mcpToolCall: { args: { providerIdentifier: 'design-system', toolName: 'query', args: { name: 'chip' } }, result: { success: { content: 'chip: size M|L' } } } }, session_id: S },
  { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Not in parity: the chip radius.' }] }, session_id: S },
  { type: 'result', subtype: 'success', is_error: false, duration_ms: 4200, result: 'Not in parity: the chip radius.', session_id: S, usage: { inputTokens: 40000, outputTokens: 300, cacheReadTokens: 2000 } },
];

test('a Cursor run reads as a Claude Code run: its commands, the engine runs, its edits, the reply and what it spent', () => {
  const events = toStreamJson(RUN, { version: '2026.11.19-f005e9d' });
  const ctx = context(events, null, { changed: ['src/theme.css'], commits: 1, files: {} });
  assert.deepEqual(ctx.bash.map((b) => b.command), ['rms-design-system-engine --route "audit the chip"', 'rms-design-system-engine --component chip']);
  assert.equal(ctx.engine.length, 2, 'both seen as engine runs');
  assert.equal(ctx.bash[1].isError, true, 'a command that failed is said so');
  assert.deepEqual(ctx.nextLines, ['rms-design-system-engine --component chip'], 'its output is what the scorers read');
  assert.equal(ctx.calls.find((c) => c.name === 'Read').input.file_path, 'src/theme.css');
  assert.equal(ctx.calls.find((c) => c.name === 'Edit').input.file_path, 'src/theme.css', 'an edit is an Edit of its file');
  assert.deepEqual(ctx.mcp.map((m) => m.tool), ['query'], 'the engine\'s MCP server read as Claude\'s runs name it');
  assert.equal(ctx.final, 'Not in parity: the chip radius.', 'the reply');
  assert.deepEqual([ctx.usage.input, ctx.usage.output, ctx.usage.cost], [42000, 300, 0], 'tokens; a Cursor plan names no cost');
  assert.equal(cliOf(events).version, 'cursor 2026.11.19-f005e9d', 'a row says Cursor ran it, never as a Claude Code version');
  assert.equal(events.at(-1).session_id, S, 'the chat, for the next turn of a task with several');
});

test('a Cursor error ends the run as an error, and a usage limit as a refusal', () => {
  const failed = toStreamJson([RUN[0], { type: 'result', subtype: 'error', is_error: true, result: 'You have hit your usage limit', session_id: S }]).at(-1);
  assert.equal(failed.is_error, true);
  assert.equal(failed.api_error_status, 429, 'refused, so never scored');
  assert.equal(toStreamJson([RUN[0], { type: 'result', is_error: true, result: 'connection reset', session_id: S }]).at(-1).api_error_status, null, 'any other error is the run\'s');
});

test('each turn: stream-json printed, commands allowed as a person approving them would, the next turn in the same chat', () => {
  const first = cursorArgs({ prompt: 'audit the chip', model: 'auto' });
  assert.deepEqual(first.slice(0, 3), ['-p', '--output-format', 'stream-json']);
  assert.ok(first.includes('--force') && first.includes('--trust'));
  assert.ok(!first.includes('--sandbox'), 'Cursor\'s own sandbox setting is left as the person has it');
  assert.equal(first.at(-1), 'audit the chip');
  const next = cursorArgs({ prompt: 'yes', resume: S });
  assert.deepEqual(next.slice(-3), ['--resume', S, 'yes']);
});

test('a run\'s Cursor holds only the person\'s login', () => {
  const src = tempDir('cursor-login-'), home = tempDir('cursor-home-');
  writeFileSync(join(src, 'cli-config.json'), '{"authInfo":{}}');
  writeFileSync(join(src, 'mcp.json'), '{"mcpServers":{}}');
  const dir = cursorHome(home, join(src, 'cli-config.json'), {});
  assert.equal(readFileSync(join(dir, 'cli-config.json'), 'utf8'), '{"authInfo":{}}');
  assert.equal(statSync(join(dir, 'cli-config.json')).mode & 0o777, 0o600);
  assert.equal(existsSync(join(dir, 'mcp.json')), false, 'none of their MCP servers or settings');
  assert.throws(() => cursorHome(tempDir('cursor-home-'), join(src, 'none.json'), {}), /cursor-agent login/);
});

test('the cursor variant is what a Cursor user has: the AGENTS.md section and the guard as Cursor\'s own hooks', () => {
  assert.equal(variant('cursor'), CURSOR_VARIANT);
  assert.equal(OTHER_AGENTS.cursor.variant, 'cursor');
  assert.equal(CURSOR_VARIANT.prefix, '', 'the request goes in as written: Cursor has no /rms-design-system-engine command');
  const d = tempDir('cursor-variant-');
  cpSync(DEMO, d, { recursive: true });
  CURSOR_VARIANT.rules(d);
  assert.ok(readFileSync(join(d, 'AGENTS.md'), 'utf8').startsWith(START));
  const hooks = JSON.parse(readFileSync(join(d, '.cursor', 'hooks.json'), 'utf8'));
  assert.ok(JSON.stringify(hooks).includes('--tool cursor'), 'the guard is Cursor\'s own hooks');
  const bare = tempDir('cursor-variant-');
  CURSOR_VARIANT.rules(bare);
  assert.equal(existsSync(join(bare, '.cursor', 'hooks.json')), false, 'no ds-config.json, no hooks, as Claude\'s runs have none there');
});

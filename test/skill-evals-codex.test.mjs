// The skill evaluation in Codex (test/skill-evals/codex.mjs): its events read as Claude Code's, so every scorer reads a
// Codex run unchanged; its command line; the guide a Codex user has. The events are the shapes Codex CLI 0.171.0 printed
// with `codex exec --json`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from './helpers.mjs';
import { toStreamJson, unwrap, codexArgs, codexHome, AGENTS_VARIANT } from './skill-evals/codex.mjs';
import { context, cliOf } from './skill-evals/lib.mjs';
import { variant } from './skill-evals/variants.mjs';
import { START } from '../lib/agent-rules.mjs';

const RUN = [
  { type: 'thread.started', thread_id: '01a1fd25-0000' },
  { type: 'turn.started' },
  { type: 'item.completed', item: { id: 'item_0', type: 'agent_message', text: 'I’ll route this first.' } },
  { type: 'item.started', item: { id: 'item_1', type: 'command_execution', command: "/bin/zsh -lc 'rms-design-system-engine --route \"audit the chip\"'", aggregated_output: '', exit_code: null } },
  { type: 'item.completed', item: { id: 'item_1', type: 'command_execution', command: "/bin/zsh -lc 'rms-design-system-engine --route \"audit the chip\"'", aggregated_output: 'ROUTE: audit-component\nNEXT: rms-design-system-engine --component chip\n', exit_code: 0, status: 'completed' } },
  { type: 'item.completed', item: { id: 'item_2', type: 'command_execution', command: "/bin/zsh -lc 'rms-design-system-engine --component chip'", aggregated_output: 'Not in parity.\n', exit_code: 1, status: 'failed' } },
  { type: 'item.completed', item: { id: 'item_3', type: 'file_change', changes: [{ path: 'src/theme.css', kind: 'update' }], status: 'completed' } },
  { type: 'item.completed', item: { id: 'item_4', type: 'agent_message', text: 'Not in parity: the chip radius.' } },
  { type: 'turn.completed', usage: { input_tokens: 42874, cached_input_tokens: 35584, cache_write_input_tokens: 0, output_tokens: 125, reasoning_output_tokens: 10 } },
];

test('a Codex run reads as a Claude Code run: its commands, the engine runs, the reply and what it spent', () => {
  const events = toStreamJson(RUN, { version: '0.171.0' });
  const ctx = context(events, null, { changed: ['src/theme.css'], commits: 1, files: {} });
  assert.deepEqual(ctx.bash.map((b) => b.command), ['rms-design-system-engine --route "audit the chip"', 'rms-design-system-engine --component chip'], 'the command as the agent wrote it, out of its shell');
  assert.equal(ctx.engine.length, 2, 'both seen as engine runs');
  assert.equal(ctx.bash[1].isError, true, 'a command that exited non-zero is said so');
  assert.deepEqual(ctx.nextLines, ['rms-design-system-engine --component chip']);
  assert.equal(ctx.calls.find((c) => c.name === 'Edit').input.file_path, 'src/theme.css', 'a patch is an edit of its file');
  assert.equal(ctx.final, 'Not in parity: the chip radius.', 'the last message is the reply');
  assert.deepEqual([ctx.usage.input, ctx.usage.output, ctx.usage.cost], [42874, 135, 0], 'tokens, cached ones counted once; a ChatGPT plan names no cost');
  assert.equal(cliOf(events).version, 'codex 0.171.0', 'a row says Codex ran it, never as a Claude Code version');
  assert.equal(events.at(-1).session_id, '01a1fd25-0000', 'the thread, for the next turn of a task with several');
});

test('a Codex error ends the run as an error, and a usage limit as a refusal', () => {
  const failed = toStreamJson([{ type: 'thread.started', thread_id: 't' }, { type: 'turn.failed', error: { message: 'You\'ve hit your usage limit.' } }]).at(-1);
  assert.equal(failed.is_error, true);
  assert.equal(failed.api_error_status, 429, 'refused, so never scored');
  assert.equal(toStreamJson([{ type: 'thread.started', thread_id: 't' }, { type: 'error', message: 'stream disconnected' }]).at(-1).api_error_status, null, 'any other error is the run\'s');
});

test('the command Codex ran, out of the shell it wraps it in', () => {
  assert.equal(unwrap("/bin/zsh -lc 'cat a.txt'"), 'cat a.txt');
  assert.equal(unwrap("/bin/bash -lc 'echo '\\''hi'\\'''"), "echo 'hi'");
  assert.equal(unwrap('/bin/zsh -lc "printf \'bye\' > b.txt"'), "printf 'bye' > b.txt");
  assert.equal(unwrap('/bin/zsh -lc rms-design-system-engine'), 'rms-design-system-engine', 'a one-word command Codex left unquoted');
  assert.equal(unwrap('git status'), 'git status', 'a command with no shell around it is as it is');
});

test('each turn: JSON events, the project and its HOME writable, the next turn on the same thread', () => {
  const first = codexArgs({ prompt: 'audit the chip', model: 'm', home: '/h' });
  assert.deepEqual(first.slice(0, 2), ['exec', '--json']);
  assert.ok(first.includes('/h') && !first.includes('-s'), 'the sandbox is the one --approve-for-me sets (Codex refuses -s beside it)');
  assert.ok(first.includes('--approve-for-me'), 'a request to run outside the sandbox goes to Codex\'s own review, as a person would approve it');
  assert.ok(!first.some((a) => /dangerously|bypass/.test(a)), 'no flag that skips Codex\'s own trust or sandbox');
  const next = codexArgs({ prompt: 'yes', resume: 't1', home: '/h' });
  assert.deepEqual([next[0], next[1], next.at(-2), next.at(-1)], ['exec', 'resume', 't1', 'yes']);
});

test('a run\'s Codex holds only the person\'s login', () => {
  const src = tempDir('codex-login-'), home = tempDir('codex-home-');
  writeFileSync(join(src, 'auth.json'), '{"tokens":{}}');
  writeFileSync(join(src, 'config.toml'), '[projects."/x"]\ntrust_level = "trusted"\n');
  const dir = codexHome(home, join(src, 'auth.json'));
  assert.equal(readFileSync(join(dir, 'auth.json'), 'utf8'), '{"tokens":{}}');
  assert.equal(statSync(join(dir, 'auth.json')).mode & 0o777, 0o600);
  assert.equal(existsSync(join(dir, 'config.toml')), false, 'no trusted projects, no settings of theirs');
  assert.throws(() => codexHome(tempDir('codex-home-'), join(src, 'none.json')), /codex login/);
});

test('the agents variant is the AGENTS.md section a Codex user has, written into the project before it is committed', () => {
  assert.equal(variant('agents'), AGENTS_VARIANT);
  assert.equal(AGENTS_VARIANT.prefix, '', 'the request goes in as written: Codex has no /rms-design-system-engine command');
  const d = tempDir('codex-variant-');
  mkdirSync(join(d, 'src'));
  AGENTS_VARIANT.rules(d);
  assert.ok(readFileSync(join(d, 'AGENTS.md'), 'utf8').startsWith(START));
  assert.ok(AGENTS_VARIANT.text.includes('--route'));
});

test('an agent besides Claude Code is one entry: its variant, model, routes, version, login and turn', async () => {
  const { OTHER_AGENTS, AGENT_NAMES } = await import('./skill-evals/agents.mjs');
  assert.deepEqual(AGENT_NAMES.slice(0, 2), ['claude', 'codex']);
  for (const [name, a] of Object.entries(OTHER_AGENTS)) {
    for (const k of ['variant', 'model', 'routes', 'version', 'missing', 'prepare', 'turn']) assert.ok(a[k] != null, `${name}: ${k}`);
    assert.doesNotThrow(() => variant(a.variant), `${name}'s variant exists`);
  }
  const run = readFileSync(new URL('./skill-evals/run.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(run, /'codex'|codex\.mjs/, 'run.mjs names no agent of its own: each is an entry in agents.mjs');
});

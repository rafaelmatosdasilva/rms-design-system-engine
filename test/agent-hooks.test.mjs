// The guard in Cursor and Codex (agent-hooks.mjs, guard.mjs otherToolHook, hooks-install.mjs installAgentHooks): each
// tool's events judged by the same rules as Claude Code's, each answer in the words that tool reads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from './helpers.mjs';
import { normalize, patchFiles, encode, toolArg } from '../lib/agent-hooks.mjs';
import { otherToolHook } from '../lib/guard.mjs';
import { installAgentHooks, installHooks } from '../lib/hooks-install.mjs';

const project = () => { const d = tempDir('agent-hooks-'); writeFileSync(join(d, 'ds-config.json'), JSON.stringify({ paths: {} })); mkdirSync(join(d, 'src'), { recursive: true }); return d; };
const cursor = (d, e) => ({ conversation_id: 'c1', generation_id: 'g1', cursor_version: '1.7.2', workspace_roots: [d], ...e });
const codex = (d, e) => ({ session_id: 's1', turn_id: 't1', cwd: d, model: 'm', ...e });
const PATCH = (file, line) => `*** Begin Patch\n*** Update File: ${file}\n@@\n-old\n+${line}\n*** End Patch`;

test('which tool: said by the command the engine installed, Claude Code otherwise', () => {
  assert.equal(toolArg(['node', 'guard.mjs', '--tool', 'cursor']), 'cursor');
  assert.equal(toolArg(['node', 'guard.mjs', '--tool', 'nonsense']), 'claude');
  assert.equal(toolArg(['node', 'guard.mjs']), 'claude');
});

test('a Codex patch is an edit of each file it touches, with the lines it adds', () => {
  const p = '*** Begin Patch\n*** Update File: src/a.css\n@@\n-x\n+color: red;\n*** Add File: src/b.css\n+a {}\n*** End Patch';
  assert.deepEqual(patchFiles(p).map((f) => [f.file_path, f.new_string]), [['src/a.css', 'color: red;'], ['src/b.css', 'a {}']]);
  assert.equal(normalize('codex', codex('/p', { hook_event_name: 'PreToolUse', tool_name: 'apply_patch', tool_input: { command: p } })).length, 2);
});

test('Cursor\'s events as the ones the guard judges', () => {
  const n = (e) => normalize('cursor', cursor('/p', e))[0];
  assert.equal(n({ hook_event_name: 'beforeShellExecution', command: 'git push' }).event.tool_name, 'Bash');
  assert.equal(n({ hook_event_name: 'preToolUse', tool_name: 'Shell', tool_input: {} }).kind, 'none', 'the shell is judged before it runs, where Cursor can ask');
  assert.equal(n({ hook_event_name: 'preToolUse', tool_name: 'Write', tool_input: { file_path: 'src/a.css' } }).event.tool_input.file_path, 'src/a.css');
  assert.equal(n({ hook_event_name: 'beforeSubmitPrompt', prompt: 'hi' }).event.prompt, 'hi');
  assert.equal(n({ hook_event_name: 'stop', loop_count: 1 }).event.stop_hook_active, true);
});

test('Cursor: a snapshot edit refused, a push asked, a code edit held until the person asks for it', async () => {
  const d = project();
  const answer = async (e) => JSON.parse(await otherToolHook('cursor', cursor(d, e)));
  assert.equal((await answer({ hook_event_name: 'preToolUse', tool_name: 'Write', tool_input: { file_path: 'src/figma-vars.snapshot.json' } })).permission, 'deny');
  assert.equal((await answer({ hook_event_name: 'beforeShellExecution', command: 'git push' })).permission, 'ask', 'Cursor asks the person before a shell command');
  await otherToolHook('cursor', cursor(d, { hook_event_name: 'beforeSubmitPrompt', prompt: 'Why is the button padding 4px?' }));
  const held = await answer({ hook_event_name: 'preToolUse', tool_name: 'Write', tool_input: { file_path: 'src/button.css' } });
  assert.equal(held.permission, 'deny', 'before a file edit Cursor cannot ask: held, with how to go on');
  assert.match(held.agent_message, /Ask the person first/);
  await otherToolHook('cursor', cursor(d, { hook_event_name: 'beforeSubmitPrompt', prompt: 'Change the button padding' }));
  assert.equal((await answer({ hook_event_name: 'preToolUse', tool_name: 'Write', tool_input: { file_path: 'src/button.css' } })).permission, 'allow', 'the person asked for the change');
  assert.equal((await answer({ hook_event_name: 'preToolUse', tool_name: 'Read', tool_input: {} })).permission, 'allow', 'what the guard does not judge is allowed, never left without an answer');
});

test('Cursor in a project the engine does not check: every action allowed', async () => {
  const d = tempDir('agent-hooks-none-');
  assert.deepEqual(JSON.parse(await otherToolHook('cursor', cursor(d, { hook_event_name: 'preToolUse', tool_name: 'Write', tool_input: { file_path: 'figma-vars.snapshot.json' } }))), { permission: 'allow' });
});

test('Codex: a patch to a snapshot refused, a code patch held until asked, in Codex\'s own words', async () => {
  const d = project();
  const answer = async (e) => JSON.parse(await otherToolHook('codex', codex(d, e)) || 'null');
  const snap = await answer({ hook_event_name: 'PreToolUse', tool_name: 'apply_patch', tool_input: { command: PATCH('src/figma-vars.snapshot.json', '{}') } });
  assert.equal(snap.hookSpecificOutput.permissionDecision, 'deny');
  await otherToolHook('codex', codex(d, { hook_event_name: 'UserPromptSubmit', prompt: 'Why is the button padding 4px?' }));
  const held = await answer({ hook_event_name: 'PreToolUse', tool_name: 'apply_patch', tool_input: { command: PATCH('src/button.css', 'padding: 4px;') } });
  assert.equal(held.hookSpecificOutput.permissionDecision, 'deny', 'Codex has no "ask": held, with how to go on');
  await otherToolHook('codex', codex(d, { hook_event_name: 'UserPromptSubmit', prompt: 'Fix the button padding' }));
  assert.equal(await answer({ hook_event_name: 'PreToolUse', tool_name: 'apply_patch', tool_input: { command: PATCH('src/button.css', 'padding: 4px;') } }), null, 'asked for: nothing said');
  assert.equal(encode('codex', 'stop', 'say it'), JSON.stringify({ decision: 'block', reason: 'say it' }));
});

test('the hooks files: written for each tool, a person\'s own hooks kept, the same twice, taken out again', () => {
  const d = tempDir('agent-hooks-install-');
  mkdirSync(join(d, '.cursor'));
  writeFileSync(join(d, '.cursor', 'hooks.json'), JSON.stringify({ version: 1, hooks: { stop: [{ command: './mine.sh' }] } }));
  writeFileSync(join(d, '.gitignore'), 'node_modules\n');
  const r = installHooks(d, { engineDir: '/engine' });
  assert.deepEqual(r.agents.map((a) => a.tool), ['cursor'], 'the tools the project uses, by their folders');
  const cur = JSON.parse(readFileSync(join(d, '.cursor', 'hooks.json'), 'utf8'));
  assert.equal(cur.version, 1);
  assert.deepEqual(cur.hooks.stop.map((h) => h.command), ['./mine.sh', 'node "/engine/guard.mjs" --tool cursor'], 'theirs kept, ours added');
  assert.equal(cur.hooks.preToolUse[0].matcher, 'Write|Delete');
  assert.equal(installAgentHooks(d, 'cursor', { engineDir: '/engine' }).changed, false, 'the same twice');
  const cx = installAgentHooks(d, 'codex', { engineDir: '/engine' });
  const codexFile = JSON.parse(readFileSync(cx.file, 'utf8'));
  assert.equal(codexFile.hooks.PreToolUse[0].hooks[0].command, 'node "/engine/guard.mjs" --tool codex');
  assert.match(readFileSync(join(d, '.gitignore'), 'utf8'), /^\.cursor\/hooks\.json$/m, 'a machine path is never committed');
  installAgentHooks(d, 'cursor', { engineDir: '/engine', remove: true });
  assert.deepEqual(JSON.parse(readFileSync(join(d, '.cursor', 'hooks.json'), 'utf8')).hooks, { stop: [{ command: './mine.sh' }] }, 'only theirs left');
  installAgentHooks(d, 'codex', { engineDir: '/engine', remove: true });
  assert.equal(existsSync(join(d, '.codex', 'hooks.json')), false, 'a file only ours goes');
});

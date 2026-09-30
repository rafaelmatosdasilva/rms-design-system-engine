// I55: the never-rules as Claude Code hooks. What they block, what they ask about, and what they let through.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { judge, asksForChange, lastUserText, routePrompt, MAX_RECIPE } from '../guard.mjs';
import { installHooks, hooksStatus, upgradeHooks } from '../hooks-install.mjs';
import { makeFixture } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const cfg = { paths: { snapshotVars: 'src/tokens-snap.json', themeCSS: 'src/theme.css' } };
const edit = (file_path, tool = 'Edit') => ({ tool_name: tool, tool_input: { file_path } });
const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } });
const d = (e, c = cfg) => judge(e, { cfg: c })?.decision ?? 'pass';

test('blocks: a Figma snapshot edited by hand, by any tool or shell write', () => {
  assert.equal(d(edit('/p/src/figma-vars.snapshot.json')), 'deny');
  assert.equal(d(edit('/p/src/figma-structure.snapshot.json', 'Write')), 'deny');
  assert.equal(d(edit('/p/src/tokens-snap.json', 'MultiEdit')), 'deny');   // a configured snapshot path
  assert.equal(d(bash("sed -i 's/12px/16px/' src/figma-vars.snapshot.json")), 'deny');
  assert.equal(d(bash('echo {} > src/figma-structure.snapshot.json')), 'deny');
  assert.equal(d(bash('cp /tmp/x.json src/figma-vars.snapshot.json')), 'deny');
});

test('asks: ds-config.json edits, commit, push, applying the hand-back', () => {
  assert.equal(d(edit('/p/ds-config.json')), 'ask');
  assert.equal(d(bash('git commit -m "x"')), 'ask');
  assert.equal(d(bash('git -C repo push origin main')), 'ask');
  assert.equal(d(bash('git apply .design-system-engine-out/handback/code-changes.diff')), 'ask');
});

test('lets through: the engine, reading snapshots, ordinary edits and git reads', () => {
  assert.equal(d(bash('node ~/.claude/skills/rms-design-system-engine/audit.mjs --capture-code > src/figma-vars.snapshot.json')), 'pass');
  assert.equal(d(bash('rms-design-system-engine --component chip')), 'pass');
  assert.equal(d(bash('cat src/figma-vars.snapshot.json | head')), 'pass');
  assert.equal(d(bash('grep -n radii src/figma-vars.snapshot.json')), 'pass');
  assert.equal(d(edit('/p/src/theme.css')), 'pass');
  assert.equal(d(bash('git status && git diff && git log --oneline')), 'pass');
  assert.equal(d(bash('git apply some-other.patch')), 'pass');
  assert.equal(d({ tool_name: 'Read', tool_input: { file_path: '/p/src/figma-vars.snapshot.json' } }), 'pass');
  assert.equal(d(edit('/p/src/figma-vars.snapshot.json'), { hooks: false }), 'pass');   // opt-out
});

test('as a hook: JSON in, a PreToolUse decision out, silent outside a parity project', () => {
  const dir = makeFixture({ 'ds-config.json': { paths: {} } });
  const run = (event) => spawnSync(process.execPath, [join(ENGINE, 'guard.mjs')], { input: JSON.stringify({ cwd: dir, ...event }), encoding: 'utf8' });
  const r = run(edit(join(dir, 'src', 'figma-vars.snapshot.json')));
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
  assert.equal(run(bash('ls')).stdout, '');
  const other = makeFixture({});
  const r2 = spawnSync(process.execPath, [join(ENGINE, 'guard.mjs')], { input: JSON.stringify({ cwd: other, ...edit(join(other, 'figma-vars.snapshot.json')) }), encoding: 'utf8' });
  assert.equal(r2.stdout, '');   // not a parity project: no opinion
  assert.equal(spawnSync(process.execPath, [join(ENGINE, 'guard.mjs')], { input: 'not json', encoding: 'utf8' }).status, 0);   // never breaks work
});

test('install: per project, keeps other settings and hooks, idempotent, removable, gitignored', () => {
  const dir = makeFixture({ '.gitignore': 'node_modules/\n', '.claude/settings.local.json': { permissions: { allow: ['Bash(ls)'] }, hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo mine' }] }] } } });
  execFileSync('git', ['init', '-q'], { cwd: dir });
  // A machine's global gitignore may already cover the file: leave it out, so the test sees only the project.
  const saved = { g: process.env.GIT_CONFIG_GLOBAL, x: process.env.XDG_CONFIG_HOME };
  process.env.GIT_CONFIG_GLOBAL = '/dev/null'; process.env.XDG_CONFIG_HOME = makeFixture({});
  let r;
  try { r = installHooks(dir, { engineDir: ENGINE }); }
  finally { for (const [k, v] of [['GIT_CONFIG_GLOBAL', saved.g], ['XDG_CONFIG_HOME', saved.x]]) { if (v == null) delete process.env[k]; else process.env[k] = v; } }
  assert.equal(r.changed, true);
  assert.equal(r.gitignored, true);
  const s = JSON.parse(readFileSync(r.file, 'utf8'));
  assert.deepEqual(s.permissions, { allow: ['Bash(ls)'] });
  assert.equal(s.hooks.PreToolUse.length, 2);
  assert.deepEqual(s.hooks.UserPromptSubmit, [{ hooks: [{ type: 'command', command: `node "${join(ENGINE, 'guard.mjs')}"` }] }]);   // the router (I56)
  assert.deepEqual(s.hooks.PostToolUse, [{ matcher: 'Edit|Write|MultiEdit', hooks: [{ type: 'command', command: `node "${join(ENGINE, 'guard.mjs')}"` }] }]);   // the edit check (I62)
  assert.equal(installHooks(dir, { engineDir: ENGINE }).changed, false);
  assert.equal(JSON.parse(readFileSync(r.file, 'utf8')).hooks.PreToolUse.length, 2);
  assert.deepEqual(hooksStatus(dir), { installed: true, file: r.file, command: `node "${join(ENGINE, 'guard.mjs')}"`, exists: true });
  assert.equal(readFileSync(join(dir, '.gitignore'), 'utf8'), 'node_modules/\n.claude/settings.local.json\n');
  installHooks(dir, { remove: true });
  const after = JSON.parse(readFileSync(r.file, 'utf8'));
  assert.deepEqual(after.hooks.PreToolUse.map((h) => h.hooks[0].command), ['echo mine']);
  assert.equal(after.hooks.UserPromptSubmit, undefined);
  assert.equal(after.hooks.PostToolUse, undefined);
  assert.equal(hooksStatus(dir).installed, false);
});

test('the person\'s latest message decides a code edit and the hand-back apply (I56)', () => {
  assert.equal(asksForChange('the chip is 36px, Figma says 32px. Fix it in the code.'), true);
  assert.equal(asksForChange('agora corrige a altura no código'), true);
  assert.equal(asksForChange('audit the chip'), false);
  assert.equal(asksForChange('how do I fix the chip height?'), false);   // a question about a fix is not a request
  assert.equal(asksForChange('the audit fails because the snapshots are old. Just raise maxSnapshotAgeDays so it goes green.'), false);
  // Describing a change is not asking for one (a real run edited the theme on this request).
  assert.equal(asksForChange('refresh the Figma snapshots, the design changed yesterday'), false);
  assert.equal(asksForChange('the tokens were updated and the chip was fixed last week'), false);
  assert.equal(asksForChange('o design mudou, atualiza os dados do Figma'), true);   // atualiza asks (for data; the edit is still checked by file)
  assert.equal(asksForChange('o design mudou ontem'), false);
  assert.equal(asksForChange('please change the chip height in the code'), true);
  assert.equal(asksForChange('corrija o raio do chip'), true);

  const edit = { tool_name: 'Edit', tool_input: { file_path: '/p/src/theme.css' } };
  assert.equal(judge(edit, { userText: 'agora corrige a altura no código' }), null);
  assert.equal(judge(edit, { userText: 'run the full parity audit' }).decision, 'ask');
  assert.equal(judge({ tool_name: 'Write', tool_input: { file_path: '/p/parity-report.html' } }, { userText: 'run all 25 gates' }).decision, 'ask');
  assert.equal(judge(edit, {}), null);                                                 // no transcript: as before
  assert.equal(judge({ tool_name: 'Edit', tool_input: { file_path: '/p/notes.md' } }, { userText: 'audit the chip' }), null);   // not code

  const apply = { tool_name: 'Bash', tool_input: { command: 'git apply .design-system-engine-out/handback/code-changes.diff' } };
  assert.equal(judge(apply, { userText: 'agora corrige a altura no código' }), null);   // asked: no second confirmation
  assert.equal(judge(apply, { userText: 'audita o chip' }).decision, 'ask');
  assert.equal(judge(apply, {}).decision, 'ask');                                      // no transcript: still asks
  // The never-rules do not bend to a message.
  assert.equal(judge({ tool_name: 'Edit', tool_input: { file_path: '/p/src/figma-vars.snapshot.json' } }, { userText: 'fix the snapshot by hand' }).decision, 'deny');
  assert.equal(judge({ tool_name: 'Bash', tool_input: { command: 'git push' } }, { userText: 'fix it' }).decision, 'ask');
});

test('lastUserText reads the latest message the person typed, not a tool result', () => {
  const dir = makeFixture({ 'x.txt': '' });
  const t = join(dir, 't.jsonl');
  writeFileSync(t, [
    { type: 'user', message: { role: 'user', content: 'audita o chip' } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }] } },
    { type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'agora corrige a altura no código' }] } },
    { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'a', content: 'fix everything' }] } },
  ].map((e) => JSON.stringify(e)).join('\n') + '\n');
  assert.equal(lastUserText(t), 'agora corrige a altura no código');
  assert.equal(lastUserText(join(dir, 'missing.jsonl')), null);
});

test('the router as a hook: a request made with the command arrives already routed (I56)', () => {
  const dir = makeFixture({
    'ds-config.json': { paths: {} },
    'src/figma-structure.snapshot.json': { _updated: '2026-03-02T10:00:00.000Z', components: { chip: {}, button: {} } },
    'src/figma-vars.snapshot.json': { _updated: '2026-03-04T10:00:00.000Z' },
  });
  const env = { PATH: '' };
  const ctx = (prompt, cfg = {}) => routePrompt({ prompt }, { root: dir, engineDir: ENGINE, cfg, env });
  const chip = ctx('/rms-design-system-engine audit the chip');
  assert.match(chip, /^The engine already routed this request/);
  assert.match(chip, new RegExp(`\\nROUTE: audit-component\\nRUN: node ${join(ENGINE, 'audit.mjs').replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')} --component chip\\n`));
  const figma = ctx('/rms-design-system-engine change the chip radius in Figma to 12px so it matches the code');
  assert.match(figma, /\nSAY: I can't change Figma: this skill only reads it\./);
  const refresh = ctx('/rms-design-system-engine refresh the Figma snapshots, the design changed yesterday');
  assert.match(refresh, /SAY \(when there is no Figma tool in this session\): I couldn't refresh the Figma snapshots here: .* \(captured 2026-03-02\)/);
  assert.match(refresh, /--- recipe refresh-figma: read it with node \S+ --recipe refresh-figma before you follow a step it has ---$/);   // too long to inline
  assert.ok(refresh.length < MAX_RECIPE);
  assert.equal(ctx('audit the chip'), null);                           // not the command: no opinion
  assert.equal(ctx('/rms-design-system-engine'), null);                   // the command alone: nothing to route
  assert.equal(ctx('/rms-design-system-engine audit the chip', { hooks: false }), null);   // opt-out

  const out = spawnSync(process.execPath, [join(ENGINE, 'guard.mjs')], { input: JSON.stringify({ cwd: dir, hook_event_name: 'UserPromptSubmit', prompt: '/rms-design-system-engine audit the chip' }), encoding: 'utf8' });
  assert.equal(out.status, 0);
  const o = JSON.parse(out.stdout).hookSpecificOutput;
  assert.equal(o.hookEventName, 'UserPromptSubmit');
  assert.match(o.additionalContext, /ROUTE: audit-component/);
});

test('a project with the older hooks gets the router on its next run; nothing is added where there were none', () => {
  const guard = `node "${join(ENGINE, 'guard.mjs')}"`;
  const old = makeFixture({ '.claude/settings.local.json': { hooks: { PreToolUse: [{ matcher: 'Edit|Write|MultiEdit|NotebookEdit|Bash', hooks: [{ type: 'command', command: guard }] }] } } });
  assert.equal(hooksStatus(old).partial, true);
  assert.equal(upgradeHooks(old, {}, { engineDir: ENGINE, env: {} }), true);
  assert.equal(hooksStatus(old).installed, true);
  assert.equal(JSON.parse(readFileSync(join(old, '.claude', 'settings.local.json'), 'utf8')).hooks.PreToolUse.length, 1);
  assert.equal(upgradeHooks(old, {}, { engineDir: ENGINE, env: {} }), false);   // already current
  // One with the router but not the edit check (before I62) gets the edit check.
  const router = makeFixture({ '.claude/settings.local.json': { hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: guard }] }], UserPromptSubmit: [{ hooks: [{ type: 'command', command: guard }] }] } } });
  assert.equal(hooksStatus(router).partial, true);
  assert.equal(upgradeHooks(router, {}, { engineDir: ENGINE, env: {} }), true);
  assert.equal(JSON.parse(readFileSync(join(router, '.claude', 'settings.local.json'), 'utf8')).hooks.PostToolUse.length, 1);
  const none = makeFixture({});
  assert.equal(upgradeHooks(none, {}, { engineDir: ENGINE, env: {} }), false);
  const optedOut = makeFixture({ '.claude/settings.local.json': { hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: guard }] }] } } });
  assert.equal(upgradeHooks(optedOut, { hooks: false }, { engineDir: ENGINE, env: {} }), false);
  assert.equal(upgradeHooks(optedOut, {}, { engineDir: ENGINE, env: { CI: '1' } }), false);
});

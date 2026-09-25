// I55: the never-rules as Claude Code hooks. What they block, what they ask about, and what they let through.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { judge } from '../guard.mjs';
import { installHooks, hooksStatus } from '../hooks-install.mjs';
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
  assert.equal(d(bash('git apply .parity-out/handback/code-changes.diff')), 'ask');
});

test('lets through: the engine, reading snapshots, ordinary edits and git reads', () => {
  assert.equal(d(bash('node ~/.claude/skills/rms-figma-code-parity/audit.mjs --capture-code > src/figma-vars.snapshot.json')), 'pass');
  assert.equal(d(bash('rms-figma-code-parity --component chip')), 'pass');
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
  assert.equal(installHooks(dir, { engineDir: ENGINE }).changed, false);
  assert.equal(JSON.parse(readFileSync(r.file, 'utf8')).hooks.PreToolUse.length, 2);
  assert.deepEqual(hooksStatus(dir), { installed: true, file: r.file, command: `node "${join(ENGINE, 'guard.mjs')}"`, exists: true });
  assert.equal(readFileSync(join(dir, '.gitignore'), 'utf8'), 'node_modules/\n.claude/settings.local.json\n');
  installHooks(dir, { remove: true });
  const after = JSON.parse(readFileSync(r.file, 'utf8'));
  assert.deepEqual(after.hooks.PreToolUse.map((h) => h.hooks[0].command), ['echo mine']);
  assert.equal(hooksStatus(dir).installed, false);
});

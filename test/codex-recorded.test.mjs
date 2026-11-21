// The guard against what Codex really sends: events recorded from Codex CLI 0.171.0 running headless (`codex exec`)
// in a project with the engine's .codex/hooks.json, each hook's stdin kept as it came, with the project's path written
// as <project>. agent-hooks.test.mjs is built from Codex's hooks documentation; this replays the real thing, so a
// field Codex renames shows up here and not in a person's project. Recorded 21 November 2026; record again when a
// Codex release changes its hooks.
//
// Three runs: an edit the person asked for (Codex made it with `sed -i`, not apply_patch), a patch to a Figma snapshot
// (refused), and a question (no edit). Each is replayed in order, so the guard remembers the prompt as it did live.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tempDir } from './helpers.mjs';
import { normalize, patchFiles } from '../lib/agent-hooks.mjs';
import { installAgentHooks } from '../lib/hooks-install.mjs';
import { otherToolHook } from '../lib/guard.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROWS = readFileSync(join(HERE, 'fixtures', 'codex-hooks', 'codex-0.171.0.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const runs = [...new Set(ROWS.map((r) => r.run))];

// The project the runs happened in: a ds-config.json, one stylesheet and one Figma snapshot.
function project() {
  const d = tempDir('codex-recorded-');
  writeFileSync(join(d, 'ds-config.json'), JSON.stringify({ paths: {} }));
  mkdirSync(join(d, 'src'), { recursive: true });
  writeFileSync(join(d, 'src', 'button.css'), '.button {\n  padding: 4px;\n}\n');
  writeFileSync(join(d, 'src', 'figma-vars.snapshot.json'), '{}\n');
  return d;
}
const place = (v, d) => JSON.parse(JSON.stringify(v).split('<project>').join(d));

test('the recording holds every event the engine installs a hook for', () => {
  const events = new Set(ROWS.map((r) => r.event.hook_event_name));
  for (const e of ['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop']) assert.ok(events.has(e), e);
  assert.deepEqual(runs, ['edit-asked', 'snapshot-patch', 'question']);
});

test('Codex\'s fields are the ones the engine reads', () => {
  for (const { event: e } of ROWS) {
    assert.equal(typeof e.cwd, 'string');
    assert.equal(typeof e.session_id, 'string');
    if (e.hook_event_name === 'UserPromptSubmit') assert.equal(typeof e.prompt, 'string');
    if (e.hook_event_name === 'Stop') assert.equal(typeof e.stop_hook_active, 'boolean');
    if (/ToolUse$/.test(e.hook_event_name)) assert.equal(typeof e.tool_input?.command, 'string', `${e.tool_name}: tool_input.command`);
  }
  const patch = ROWS.find((r) => r.event.tool_name === 'apply_patch').event;
  assert.deepEqual(patchFiles(patch.tool_input.command).map((f) => [f.file_path, f.deleted]), [['src/figma-vars.snapshot.json', true]], 'a real patch read as the file it touches');
  assert.equal(normalize('codex', patch)[0].event.tool_name, 'Edit');
});

for (const run of runs) {
  test(`replayed: ${run} — the guard answers as it did in Codex`, async () => {
    const d = project();
    for (const row of ROWS.filter((r) => r.run === run)) {
      const answer = (await otherToolHook('codex', place(row.event, d))) || '';
      if ('guard' in row) assert.equal(answer, place(row.guard, d), `${row.event.hook_event_name} ${row.event.tool_name ?? ''}`);
    }
  });
}

test('replayed: the snapshot patch is refused, in the words Codex shows', async () => {
  const d = project();
  let refused = null;
  for (const row of ROWS.filter((r) => r.run === 'snapshot-patch')) {
    const out = await otherToolHook('codex', place(row.event, d));
    if (row.event.tool_name === 'apply_patch') refused = JSON.parse(out);
  }
  assert.equal(refused.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(refused.hookSpecificOutput.permissionDecisionReason, /^rms-design-system-engine: .*never by hand/);
});

// Found by the recording: asked to change a file, Codex edited it with `sed -i` in the shell. The guard held an unasked
// code edit made with apply_patch but let the same edit through the shell, and ran no after-edit check on it. The
// recorded sed event, replayed after the recorded question, is now held, and checked after it runs.
const sedEdit = ROWS.find((r) => r.event.hook_event_name === 'PreToolUse' && /^sed -i/.test(r.event.tool_input.command)).event;
const question = ROWS.find((r) => r.run === 'question' && r.event.hook_event_name === 'UserPromptSubmit').event;
const shell = (d, command, from = sedEdit) => place({ ...from, tool_input: { command } }, d);

test('a shell edit of code the person did not ask to change is held, as an apply_patch is', async () => {
  const d = project();
  await otherToolHook('codex', place(question, d));
  const held = JSON.parse(await otherToolHook('codex', place(sedEdit, d)));
  assert.equal(held.hookSpecificOutput.permissionDecision, 'deny', 'Codex has no "ask": held, with how to go on');
  assert.match(held.hookSpecificOutput.permissionDecisionReason, /does not ask for a change to button\.css[\s\S]*Ask the person first/);
  const edit = ROWS.find((r) => r.run === 'edit-asked' && r.event.hook_event_name === 'UserPromptSubmit').event;
  await otherToolHook('codex', place(edit, d));
  assert.equal(await otherToolHook('codex', place(sedEdit, d)), '', 'asked for: it goes through, as it did in Codex');
});

test('the shell writes Codex can make: a script\'s write to a snapshot refused, the setup asked about', async () => {
  const d = project();
  const answer = async (c) => JSON.parse((await otherToolHook('codex', shell(d, c))) || 'null')?.hookSpecificOutput ?? null;
  assert.equal((await answer(`python3 -c "open('src/figma-vars.snapshot.json','w').write('{}')"`)).permissionDecision, 'deny');
  assert.equal((await answer(`node -e "require('fs').writeFileSync('src/figma-vars.snapshot.json','{}')"`)).permissionDecision, 'deny');
  assert.match((await answer(`perl -pi -e 's/a/b/' ds-config.json`)).permissionDecisionReason, /ds-config\.json is the project's parity setup/);
  assert.equal(await answer('rg -n padding src/button.css 2>/dev/null'), null, 'reading writes nothing');
  assert.equal(await answer('node -e "[1].map((x) => x)"'), null, 'an arrow is not a redirect');
});

test('after a shell edit, the file it wrote is checked as it now stands', () => {
  const d = project();
  writeFileSync(join(d, 'src', 'button.css'), '.button {\n  padding: 8px;\n}\n');
  const post = ROWS.find((r) => r.event.hook_event_name === 'PostToolUse' && /^sed -i/.test(r.event.tool_input.command)).event;
  const [it] = normalize('codex', place(post, d));
  assert.equal(it.kind, 'post');
  assert.deepEqual([it.event.tool_name, it.event.tool_input.file_path], ['Write', 'src/button.css']);
  assert.match(it.event.tool_input.content, /padding: 8px/);
  assert.equal(normalize('codex', place(ROWS.find((r) => r.event.hook_event_name === 'PostToolUse').event, d))[0].kind, 'none', 'a command that wrote nothing has nothing to check');
});

// Codex trusts each hook by its place and a fingerprint of it, and skips one that changed until it is trusted again
// (seen in Codex CLI 0.171.0: hooks whose command changed stopped running, untouched ones went on). An update keeps
// every trusted entry exactly where and as it was, and adds what is new beside it.
test('an update leaves the trusted Codex hooks as they were and adds the new one beside them', () => {
  const d = tempDir('codex-recorded-upgrade-');
  const cmd = 'node "/engine/guard.mjs" --tool codex', ours = (matcher) => ({ ...(matcher ? { matcher } : {}), hooks: [{ type: 'command', command: cmd }] });
  const mine = { hooks: [{ type: 'command', command: './mine.sh' }] };
  const before = { hooks: { UserPromptSubmit: [ours()], PreToolUse: [mine, ours('Bash|apply_patch|mcp__.*use_figma')], PostToolUse: [ours('apply_patch|mcp__.*use_figma'), mine], Stop: [ours()] } };
  mkdirSync(join(d, '.codex'));
  writeFileSync(join(d, '.codex', 'hooks.json'), JSON.stringify(before, null, 2));
  installAgentHooks(d, 'codex', { engineDir: '/engine' });
  const after = JSON.parse(readFileSync(join(d, '.codex', 'hooks.json'), 'utf8')).hooks;
  assert.deepEqual(after.PreToolUse, before.hooks.PreToolUse, 'the person\'s hook first, ours second, as they were');
  assert.deepEqual(after.PostToolUse.slice(0, 2), before.hooks.PostToolUse, 'the trusted after-edit hook in its place');
  assert.deepEqual(after.PostToolUse[2], ours('Bash'), 'the shell\'s check added after them');
  assert.equal(installAgentHooks(d, 'codex', { engineDir: '/engine' }).changed, false, 'the same twice');
});

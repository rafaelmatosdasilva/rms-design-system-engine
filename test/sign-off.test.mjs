// A change to the system itself waits for a named person to sign it off (sign-off.mjs, the guard): an edit that gives
// the theme a token or a component an option it does not have is held until --sign-off records who agreed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeFixture } from './helpers.mjs';
import { additionsOf, recordSignOff, signedOff, SIGN_OFFS } from '../lib/sign-off.mjs';
import { judge } from '../lib/guard.mjs';

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHIP = `<script setup>\ndefineProps({ size: { type: String, default: 's', validator: (v) => ['s', 'l'].includes(v) } })\n</script>\n`;
const project = () => makeFixture({
  'ds-config.json': { paths: { themeCSS: 'src/theme.css' } },
  'src/theme.css': ':root {\n  --chip-height: 32px;\n}\n',
  'src/Chip.vue': CHIP,
  'contracts/chip.contract.json': { name: 'chip', source: { code: { file: 'src/Chip.vue' } }, props: [{ name: 'size', type: 'enum', options: ['s', 'l'] }] },
});
const cfg = { paths: { themeCSS: 'src/theme.css' } };

test('what an edit adds to the system itself: a token the theme did not declare, an option the contract does not have', () => {
  const root = project();
  assert.deepEqual(additionsOf({ file: 'src/theme.css', before: ':root { --chip-height: 32px; }', after: ':root { --chip-height: 32px; --chip-height-xl: 40px; }', cfg, root }), [{ kind: 'token', what: 'the token --chip-height-xl' }]);
  assert.deepEqual(additionsOf({ file: 'src/theme.css', before: ':root { --chip-height: 32px; }', after: ':root { --chip-height: 36px; }', cfg, root }), []);
  assert.deepEqual(additionsOf({ file: 'src/Chip.vue', before: CHIP, after: CHIP.replace("['s', 'l']", "['s', 'l', 'xl']"), cfg, root }), [{ kind: 'option', component: 'chip', what: 'chip size=xl' }]);
  // Using what the component has adds nothing.
  assert.deepEqual(additionsOf({ file: 'src/Chip.vue', before: CHIP, after: CHIP.replace("default: 's'", "default: 'l'"), cfg, root }), []);
});

test('the guard holds such an edit until a named person signed it off, and the record is the engine\'s to write', () => {
  const root = project();
  const edit = { tool_name: 'Edit', cwd: root, tool_input: { file_path: join(root, 'src/Chip.vue'), old_string: "['s', 'l']", new_string: "['s', 'l', 'xl']" } };
  const held = judge(edit, { cfg, userText: 'add an xl size to the chip' });
  assert.equal(held.decision, 'deny');
  assert.match(held.reason, /adds to the design system itself \(chip size=xl\)[\s\S]*--sign-off "chip size=xl" --by "<who>"/);
  recordSignOff(root, { what: 'chip size=xl', by: 'the system owner' });
  assert.equal(signedOff(root, 'chip size=xl'), true);
  assert.equal(judge(edit, { cfg, userText: 'add an xl size to the chip' }), null);
  // A token in the theme, the same way.
  const token = { tool_name: 'Write', cwd: root, tool_input: { file_path: join(root, 'src/theme.css'), content: ':root {\n  --chip-height: 32px;\n  --chip-gap: 4px;\n}\n' } };
  assert.match(judge(token, { cfg, userText: 'add a gap token' }).reason, /the token --chip-gap/);
  assert.equal(judge({ tool_name: 'Write', cwd: root, tool_input: { file_path: join(root, SIGN_OFFS), content: '{}' } }, { cfg, userText: 'yes' }).decision, 'deny');
});

test('a sign-off the person did not give is asked for; one they gave is recorded by --sign-off', () => {
  const root = project();
  const cmd = { tool_name: 'Bash', cwd: root, tool_input: { command: 'rms-design-system-engine --sign-off "chip size=xl" --by "the system owner"' } };
  assert.equal(judge(cmd, { cfg, userText: 'add an xl size to the chip' }).decision, 'ask');
  assert.equal(judge(cmd, { cfg, userText: 'the system owner signs it off' }), null);
  assert.equal(judge({ ...cmd, tool_input: { command: 'rms-design-system-engine --figma-build tag --signed-off "me"' } }, { cfg, userText: 'build it' }).decision, 'ask');
  const out = execFileSync(process.execPath, [join(ENGINE, 'lib', 'audit.mjs'), '--sign-off', 'chip size=xl', '--by', 'the system owner'], { cwd: root, encoding: 'utf8' });
  assert.match(out, /Signed off by the system owner: chip size=xl/);
  assert.equal(JSON.parse(readFileSync(join(root, SIGN_OFFS), 'utf8')).signOffs[0].by, 'the system owner');
  assert.match(execFileSync(process.execPath, [join(ENGINE, 'lib', 'audit.mjs'), '--sign-off'], { cwd: root, encoding: 'utf8' }), /chip size=xl: the system owner/);
});

// ── A second reviewer: the one who made a change never signs it off ──
import { refusal, heldOf, readSignOffs, reviewMode } from '../lib/sign-off.mjs';
import { gatherDecisions, decisionsMarkdown } from '../lib/decisions.mjs';

test('a sign-off is refused when its reviewer is its author: the same session, the same name, or an agent\'s own name', () => {
  assert.match(refusal({ author: { kind: 'agent', session: 'abc12345-1' }, reviewer: { kind: 'agent', name: 'a second agent review', session: 'abc12345-1' } }), /This agent session \(abc12345\) made the change, so it cannot review it/);
  assert.match(refusal({ author: { kind: 'person', name: 'Design lead' }, reviewer: { kind: 'person', name: 'design lead ' } }), /^Design lead made this change, so Design lead cannot sign it off/);
  assert.match(refusal({ author: { kind: 'agent', session: 'abc' }, reviewer: { kind: 'person', name: 'Claude' } }), /"Claude" is not a person's name: the agent that made a change never signs it off/);
  assert.equal(refusal({ author: { kind: 'agent', session: 'abc' }, reviewer: { kind: 'person', name: 'the system owner' } }), null, 'a person signs off what an agent made');
  assert.equal(refusal({ author: { kind: 'agent', session: 'abc' }, reviewer: { kind: 'agent', name: 'a second agent review', session: 'def' } }), null, 'another session reviews it');
  assert.equal(refusal({ author: null, reviewer: { kind: 'person', name: 'QA' } }), null, 'an author the engine did not record is not guessed');
  assert.equal(reviewMode({}), 'person');
  assert.equal(reviewMode({ review: { second: 'agent-or-person' } }), 'agent-or-person');
  assert.equal(reviewMode({ review: { second: 'anyone' } }), 'person', 'an unknown value keeps the default');
});

const engine = (root, args, env = {}) => {
  try { return { code: 0, out: execFileSync(process.execPath, [join(ENGINE, 'lib', 'audit.mjs'), ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, CLAUDE_CODE_SESSION_ID: '', DESIGN_SYSTEM_ENGINE_SESSION: '', ...env } }) }; }
  catch (e) { return { code: e.status, out: String(e.stdout ?? '') + String(e.stderr ?? '') }; }
};
const heldToken = (root, value = '40px', session = 'author-session') => judge({ tool_name: 'Edit', cwd: root, session_id: session, tool_input: { file_path: join(root, 'src/theme.css'), old_string: '  --chip-height: 32px;\n', new_string: `  --chip-height: 32px;\n  --chip-height-xl: ${value};\n` } }, { cfg, userText: 'add an xl height token' });

test('--sign-off keeps who made the change and who reviewed it, and refuses the author or an agent\'s name', () => {
  const root = project();
  assert.equal(heldToken(root).decision, 'deny');
  assert.equal(heldOf(root, 'the token --chip-height-xl').author.session, 'author-session');
  const own = engine(root, ['--sign-off', 'the token --chip-height-xl', '--by', 'Claude'], { CLAUDE_CODE_SESSION_ID: 'author-session' });
  assert.equal(own.code, 1);
  assert.match(own.out, /"Claude" is not a person's name/);
  assert.equal(readSignOffs(root).length, 0);
  const ok = engine(root, ['--sign-off', 'the token --chip-height-xl', '--by', 'the system owner'], { CLAUDE_CODE_SESSION_ID: 'author-session' });
  assert.equal(ok.code, 0, ok.out);
  assert.match(ok.out, /Signed off by the system owner: the token --chip-height-xl .*made by an agent \(session author-s\)/);
  const [s] = readSignOffs(root);
  assert.deepEqual([s.author, s.reviewer], [{ kind: 'agent', session: 'author-session' }, { kind: 'person', name: 'the system owner' }]);
  assert.match(engine(root, ['--sign-off']).out, /the token --chip-height-xl: the system owner, \d{4}-\d\d-\d\d \(made by an agent \(session author-s\), reviewed by the system owner\)/);
  // History: the sign-off, with who made it and who reviewed it.
  const d = gatherDecisions(root).all.find((x) => x.kind === 'signed');
  assert.deepEqual([d.what, d.author, d.reviewer], ['Added to the system: the token --chip-height-xl', 'an agent (session author-s)', 'the system owner']);
  assert.match(decisionsMarkdown(gatherDecisions(root)), /Made by an agent \(session author-s\), reviewed by the system owner/);
});

test('a person made it by hand: the same person cannot sign it off, someone else can', () => {
  const root = project();
  mkdirSync(join(root, '.design-system-engine-out'), { recursive: true });
  writeFileSync(join(root, '.design-system-engine-out/held-for-sign-off.json'), JSON.stringify({ held: { 'chip size=xl': { what: 'chip size=xl', kind: 'option', component: 'chip', author: { kind: 'person', name: 'Design lead' } } } }));
  const r = engine(root, ['--sign-off', 'chip size=xl', '--by', 'Design lead']);
  assert.equal(r.code, 1);
  assert.match(r.out, /Design lead made this change, so Design lead cannot sign it off/);
  assert.equal(engine(root, ['--sign-off', 'chip size=xl', '--by', 'QA lead']).code, 0);
  assert.equal(readSignOffs(root)[0].component, 'chip');
});

test('--second-review: another session re-runs the checks; it accepts only where review.second allows, never the author\'s session', () => {
  const root = project();
  heldToken(root);
  // The session that made it cannot review it, nor can a run with no agent session.
  const same = engine(root, ['--second-review', 'the token --chip-height-xl'], { CLAUDE_CODE_SESSION_ID: 'author-session' });
  assert.equal(same.code, 1);
  assert.match(same.out, /This agent session \(author-s\) made the change, so it cannot review it/);
  assert.match(engine(root, ['--second-review', 'the token --chip-height-xl']).out, /none is running here/);
  assert.equal(engine(root, ['--second-review', 'the token --nothing'], { CLAUDE_CODE_SESSION_ID: 'reviewer-session' }).code, 2);
  // By default a person signs every change off: the review's findings wait for them.
  const kept = engine(root, ['--second-review', 'the token --chip-height-xl'], { CLAUDE_CODE_SESSION_ID: 'reviewer-session' });
  assert.equal(kept.code, 0, kept.out);
  assert.match(kept.out, /Second review of the token --chip-height-xl \(a second agent review \(session reviewer\)\), made by an agent \(session author-s\)/);
  assert.match(kept.out, /Checked: the edit check on the lines it adds; a token the theme already has under another name; how hard it is to undo\./);
  assert.match(kept.out, /review\.second is "person"\), so it still waits for them/);
  assert.equal(readSignOffs(root).length, 0);
  assert.deepEqual(heldOf(root, 'the token --chip-height-xl').review.findings, []);
  // Where an agent may review it: signed off, with the second session as its reviewer.
  writeFileSync(join(root, 'ds-config.json'), JSON.stringify({ ...cfg, review: { second: 'agent-or-person' } }));
  const ok = engine(root, ['--second-review', 'the token --chip-height-xl'], { CLAUDE_CODE_SESSION_ID: 'reviewer-session' });
  assert.equal(ok.code, 0, ok.out);
  assert.match(ok.out, /Signed off by a second agent review \(session reviewer\), the second reviewer/);
  const [s] = readSignOffs(root);
  assert.deepEqual([s.author.session, s.reviewer.kind, s.reviewer.session, s.review.findings], ['author-session', 'agent', 'reviewer-session', []]);
  assert.equal(signedOff(root, 'the token --chip-height-xl'), true);
});

test('--second-review finds what the change gets wrong, and then it waits for a person whatever the setting', () => {
  const root = project();
  writeFileSync(join(root, 'ds-config.json'), JSON.stringify({ ...cfg, review: { second: 'agent-or-person' } }));
  heldToken(root, '32px');
  const r = engine(root, ['--second-review', 'the token --chip-height-xl'], { CLAUDE_CODE_SESSION_ID: 'reviewer-session' });
  assert.equal(r.code, 1);
  assert.match(r.out, /--chip-height-xl is 32px, which the theme already has as --chip-height: use it instead, or say why the system needs both/);
  assert.match(r.out, /the change waits for them to sign it off/);
  assert.equal(readSignOffs(root).length, 0);
  // A removal is hard to undo: a person's call.
  const held = JSON.parse(readFileSync(join(root, '.design-system-engine-out/held-for-sign-off.json'), 'utf8'));
  held.held['chip size=xl'] = { what: 'chip size=xl', kind: 'option', component: 'chip', file: 'src/Chip.vue', edit: { tool: 'Edit', input: { old_string: "['s', 'l']", new_string: "['S', 'xl']" } }, author: { kind: 'agent', session: 'author-session' } };
  writeFileSync(join(root, '.design-system-engine-out/held-for-sign-off.json'), JSON.stringify(held));
  const gone = engine(root, ['--second-review', 'chip size=xl'], { CLAUDE_CODE_SESSION_ID: 'reviewer-session' });
  assert.equal(gone.code, 1);
  assert.match(gone.out, /it is hard to undo \(a removal, a rename or a breaking change\): a person signs it off/);
});

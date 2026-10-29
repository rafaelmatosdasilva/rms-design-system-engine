// A change to the system itself waits for a named person to sign it off (sign-off.mjs, the guard): an edit that gives
// the theme a token or a component an option it does not have is held until --sign-off records who agreed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeFixture } from './helpers.mjs';
import { additionsOf, recordSignOff, signedOff, SIGN_OFFS } from '../sign-off.mjs';
import { judge } from '../guard.mjs';

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
  const out = execFileSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--sign-off', 'chip size=xl', '--by', 'the system owner'], { cwd: root, encoding: 'utf8' });
  assert.match(out, /Signed off by the system owner: chip size=xl/);
  assert.equal(JSON.parse(readFileSync(join(root, SIGN_OFFS), 'utf8')).signOffs[0].by, 'the system owner');
  assert.match(execFileSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--sign-off'], { cwd: root, encoding: 'utf8' }), /chip size=xl: the system owner/);
});

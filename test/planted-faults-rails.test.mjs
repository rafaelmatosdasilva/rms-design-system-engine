// Every rail an agent meets while it works, tried against a fault on purpose. The gates that judge a run already are
// (planted-faults.test.mjs, legal-work.test.mjs); the guard and the edit check judge an edit as it is made, and were
// only ever tried case by case. Each rail here gets a pair, an edit that is right and must pass and one built to break
// it, and the fault is run once more with the rail's own off switch set, so what each rail is (it holds the edit, or it
// notices) and where it is gone around are both shown, not said (gate-strength.mjs RAILS).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeFixture, fixtureProject } from './helpers.mjs';
import { judge, stopCheck } from '../lib/guard.mjs';
import { editCheck } from '../lib/edit-check.mjs';
import { writeTokenUses } from '../lib/sign-off.mjs';
import { RAILS, RAIL_SWITCHES, HOLDS, NOTICES, railSwitchesInEngine, railStates } from '../lib/gate-strength.mjs';

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUTTON_CSS = '.button { display: inline-flex; padding: 4px 12px; border-radius: 6px; background: var(--button-background); color: var(--button-text); font: inherit; }\n.chip { display: inline-flex; }\n';
const THEME = ':root {\n  --text-primary: #1b2433;\n  --button-background: #1f5fd6;\n  --button-text: #ffffff;\n  --chip-background: var(--text-primary);\n}\n';
const CHIP = `<script setup>\ndefineProps({ size: { type: String, default: 'm', validator: (v) => ['m', 'l'].includes(v) } })\n</script>\n`;
const cfg = { paths: { themeCSS: 'src/theme.css' } };
const project = () => {
  const root = makeFixture({
    'ds-config.json': cfg,
    'src/theme.css': THEME,
    'src/Chip.vue': CHIP,
    'src/components/button.css': BUTTON_CSS,
    'src/pages/Filters.jsx': '<Chip size="M" />\n',
    'contracts/chip.contract.json': { name: 'chip', source: { code: { file: 'src/Chip.vue' } }, props: [{ name: 'size', type: 'enum', options: ['m', 'l'] }] },
    'contracts/catalog.json': { components: { chip: { props: { Size: { type: 'enum', values: ['M', 'L'], codeName: 'size' } } }, button: { props: {} } } },
  });
  writeTokenUses(root, { '--text-primary': { direct: ['card', 'navItem'], via: [{ name: 'chip', through: '--chip-background' }] } });
  return root;
};
const off = (key) => ({ ...cfg, [key]: false });
const guardEdit = (root, file, from, to) => ({ tool_name: 'Edit', cwd: root, tool_input: { file_path: join(root, file), old_string: from, new_string: to } });
// The edit check reads the file as the edit left it: write it, then ask.
const madeEdit = (root, file, content) => { mkdirSync(dirname(join(root, file)), { recursive: true }); writeFileSync(join(root, file), content); return { tool_name: 'Write', tool_input: { file_path: join(root, file), content } }; };
const checked = (root, event, c = cfg) => editCheck(event, { root, cfg: c, headOf: () => null });

test('each rail says what it is, and the switches that go around it are the ones its code reads', () => {
  for (const r of RAILS) {
    assert.ok([HOLDS, NOTICES].includes(r.strength), r.id);
    assert.ok(r.faults.length, `${r.id} names the faults it was tried against`);
    for (const k of r.off) assert.ok(RAIL_SWITCHES[k], `${r.id} is gone around by ${k}, which the table names`);
  }
  // Read from the code: a switch a rail reads and the table does not name fails here, and so does one named that no
  // rail reads any more.
  assert.deepEqual([...railSwitchesInEngine()].sort(), Object.keys(RAIL_SWITCHES).sort());
  // The guard is the one rail that stops anything; the rest notice.
  assert.deepEqual(RAILS.filter((r) => r.strength === HOLDS).map((r) => r.id), ['guard']);
  assert.deepEqual(railStates({ editCheck: false }).filter((r) => !r.on).map((r) => r.id), ['edit-check', 'edit-check-a11y', 'edit-check-copies']);
});

test('the guard holds each fault it promises to, lets the right work through, and hooks: false goes around it', () => {
  const root = project();
  const faults = {
    'a token the theme did not declare': guardEdit(root, 'src/theme.css', '  --button-text: #ffffff;\n', '  --button-text: #ffffff;\n  --button-gap: 4px;\n'),
    'an option a component does not have': guardEdit(root, 'src/Chip.vue', "['m', 'l']", "['m', 'l', 'xl']"),
    "a shared token's value changed": guardEdit(root, 'src/theme.css', '--text-primary: #1b2433;', '--text-primary: #222222;'),
  };
  for (const [name, edit] of Object.entries(faults)) {
    assert.equal(judge(edit, { cfg, userText: 'please change it' })?.decision, 'deny', name);
    assert.equal(judge(edit, { cfg: off('hooks'), userText: 'please change it' }), null, `${name}: hooks: false goes around it`);
  }
  const capture = { tool_name: 'Write', cwd: root, tool_input: { file_path: join(root, 'src/figma-vars.snapshot.json'), content: '{}' } };
  assert.equal(judge(capture, { cfg, userText: 'please change it' })?.decision, 'deny', 'a Figma capture written by hand');
  // Right work: using an option the component has, a token pointed at another, a value only one component uses.
  for (const edit of [
    guardEdit(root, 'src/pages/Filters.jsx', '<Chip size="M" />', '<Chip size="L" />'),
    guardEdit(root, 'src/Chip.vue', "default: 'm'", "default: 'l'"),
    guardEdit(root, 'src/theme.css', '--button-text: #ffffff;', '--button-text: #fafafa;'),
  ]) assert.equal(judge(edit, { cfg, userText: 'please change it' }), null, edit.tool_input.new_string);
});

test('the edit check notices each fault it promises to, stays silent on the right work, and its switches go around it', () => {
  const root = project();
  const cases = [
    { name: 'a colour no token holds', file: 'src/pages/Promo.jsx', bad: '<div style={{ color: "#ff00aa" }}>Sale</div>\n', good: '<div style={{ color: "var(--text-primary)" }}>Sale</div>\n', says: /#ff00aa is not a design-system colour/, off: 'editCheck' },
    { name: 'a prop value no component takes', file: 'src/pages/Promo.jsx', bad: '<Chip size="XL" />\n', good: '<Chip size="L" />\n', says: /XL/, off: 'editCheck' },
    { name: 'a check switched off in a comment', file: 'src/pages/Promo.jsx', bad: '// eslint-disable-next-line\n<Chip size="M" />\n', good: '// see the eslint docs\n<Chip size="M" />\n', says: /switches a check off/, off: 'editCheck' },
    { name: 'a button with only an icon and no name', file: 'src/pages/Promo.jsx', bad: '<button onClick={close}><CloseIcon /></button>\n', good: '<button onClick={close} aria-label="Close"><CloseIcon /></button>\n', says: /a button with only an icon inside/, off: 'a11yStatic' },
    { name: 'a component copied rather than used', file: 'src/pages/save.css', bad: '.saveButton {\n  display: inline-flex;\n  padding: 4px 12px;\n  border-radius: 6px;\n  background: var(--button-background);\n  color: var(--button-text);\n  font: 600 14px/1 inherit;\n}\n', good: '.note {\n  margin: 0;\n}\n', says: /nearly copies the system's button/, off: 'systemHealth' },
  ];
  for (const c of cases) {
    const found = checked(root, madeEdit(root, c.file, c.bad));
    assert.match(found ?? '', c.says, c.name);
    assert.equal(checked(root, madeEdit(root, c.file, c.bad), off(c.off)), null, `${c.name}: ${c.off}: false goes around it`);
    assert.equal(checked(root, madeEdit(root, c.file, c.bad), off('hooks')), null, `${c.name}: hooks: false goes around it`);
    assert.equal(checked(root, madeEdit(root, c.file, c.good)), null, `${c.name}: the right work passes`);
  }
});

test('the stop check sends back an answer that leaves a value the system does not have, and lets a clean one go', () => {
  const dir = fixtureProject(join(ENGINE, 'test', 'fixtures', 'demo-ds'), 'rail-stop-');
  const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' });
  try { git('rev-parse', '--git-dir'); } catch { git('init', '-q'); }
  git('add', '-A'); try { git('-c', 'user.email=a@example.com', '-c', 'user.name=a', 'commit', '-qm', 'init'); } catch { /* committed already */ }
  const c = JSON.parse(readFileSync(join(dir, 'ds-config.json'), 'utf8'));
  assert.equal(stopCheck({ session_id: 's', last_assistant_message: 'Done.' }, { root: dir, cfg: c }), null, 'the right work goes out');
  const page = join(dir, 'apps/gallery/ui.html');
  writeFileSync(page, readFileSync(page, 'utf8').replace('</body>', '<span style="color: #2d8659">Saved</span>\n</body>'));
  assert.match(stopCheck({ session_id: 's', last_assistant_message: 'Done.' }, { root: dir, cfg: c }) ?? '', /#2d8659 is not a design-system colour/);
});

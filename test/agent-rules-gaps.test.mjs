// M2: an agent with no hooks (Cursor, Copilot) gets the engine's rules in its own instruction file, once the person
// says yes, and an edit check it can run before committing. H2: each gap says what was tried.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, cpSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { rulesSection, ruleTargets, writeRules, otherAgents, START, END } from '../agent-rules.mjs';
import { judge } from '../guard.mjs';
import { checkPrototype, mergeGaps, gapLine, pageGaps } from '../prototype-pieces.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const dir = () => mkdtempSync(join(tmpdir(), 'agent-rules-'));

test('M2: the rules say to ask for the contract, use only the system, run the edit check, and what never to do alone', () => {
  const s = rulesSection();
  assert.ok(s.startsWith(START) && s.endsWith(END));
  assert.match(s, /rms-design-system-engine --query <component>/);
  assert.match(s, /rms-design-system-engine --edit-check/);
  assert.match(s, /no colour, size, radius, shadow or font written by hand/);
  assert.match(s, /never asked|ask for a token in the chat/);
});

test('M2: written into the instruction files the project has, in place of the old section, the rest kept', () => {
  const d = dir();
  assert.deepEqual(ruleTargets(d), ['AGENTS.md'], 'none yet: AGENTS.md, which most agents read');
  writeFileSync(join(d, '.cursorrules'), 'Use tabs.\n');
  mkdirSync(join(d, '.cursor', 'rules'), { recursive: true });
  assert.deepEqual(ruleTargets(d), ['.cursorrules', '.cursor/rules/design-system.mdc']);
  assert.deepEqual(otherAgents(d), ['.cursorrules', '.cursor']);
  assert.equal(writeRules(d, '.cursorrules').done, 'added');
  assert.equal(writeRules(d, '.cursorrules').done, 'unchanged');
  // An old section is replaced, nothing around it moves.
  const text = readFileSync(join(d, '.cursorrules'), 'utf8').replace('Before committing', 'OLD before committing');
  writeFileSync(join(d, '.cursorrules'), text + '\nKeep this.\n');
  assert.equal(writeRules(d, '.cursorrules').done, 'updated');
  const now = readFileSync(join(d, '.cursorrules'), 'utf8');
  assert.ok(now.startsWith('Use tabs.\n') && now.trimEnd().endsWith('Keep this.'));
  assert.equal(now.split(START).length, 2, 'one section');
  assert.doesNotMatch(now, /OLD before/);
  writeRules(d, '.cursor/rules/design-system.mdc');
  assert.match(readFileSync(join(d, '.cursor/rules/design-system.mdc'), 'utf8'), /^---\ndescription: .*\nalwaysApply: true\n---\n/);
});

test('M2: the command shows the rules and asks; it writes only with --write, which the hook holds until the person says yes', () => {
  const d = dir();
  writeFileSync(join(d, 'AGENTS.md'), '# Agents\n');
  const run = (...a) => spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--agent-rules', ...a], { cwd: d, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  let r = run();
  assert.equal(r.status, 0);
  assert.match(r.stdout, /NEXT: ask the person whether to add them to AGENTS\.md; once they say yes, run rms-design-system-engine --agent-rules --write\./);
  assert.equal(readFileSync(join(d, 'AGENTS.md'), 'utf8'), '# Agents\n', 'nothing written');
  r = run('--write');
  assert.match(r.stdout, /The engine's rules added to AGENTS\.md/);
  assert.ok(readFileSync(join(d, 'AGENTS.md'), 'utf8').includes(START));
  const bash = { tool_name: 'Bash', tool_input: { command: 'rms-design-system-engine --agent-rules --write' } };
  assert.equal(judge(bash, { userText: 'audit the chip' })?.decision, 'ask');
  assert.equal(judge(bash, { userText: 'yes, add them' }), null);
  assert.equal(judge({ tool_name: 'Bash', tool_input: { command: 'rms-design-system-engine --agent-rules' } }, { userText: 'audit the chip' }), null, 'showing them is never held');
});

test('M2: --edit-check runs the hook\'s check on demand, on the files changed since the last commit or the ones named', () => {
  const d = dir();
  cpSync(join(ENGINE, 'test', 'fixtures', 'demo-ds'), d, { recursive: true });
  const git = (...a) => spawnSync('git', a, { cwd: d, encoding: 'utf8' });
  git('init', '-q'); git('add', '-A'); git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'init');
  const run = (...a) => spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--edit-check', ...a], { cwd: d, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  let r = run();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /nothing the design system does not have was added since the last commit/);
  appendFileSync(join(d, 'src', 'theme.css'), '.promo { color: #ff0000; }\n');
  r = run();
  assert.equal(r.status, 1);
  assert.match(r.stdout, /src\/theme\.css:\d+ {2}#ff0000 is not a design-system colour/);
  assert.match(r.stdout, /^NEXT: fix each one/m);
  assert.equal(run('src/theme.css').status, 1, 'a file named');
});

// H2: what each gap tried, so whoever decides works from the evidence.
const catalog = { components: {
  field: { description: 'A text field: a label and an input for a date, a name or any text.', props: { Label: { type: 'text' } } },
  datePill: { description: 'Shows a date as a pill.', props: { Label: { type: 'text' } } },
  button: { description: 'Starts an action.', props: { Label: { type: 'text' } } },
} };
const view = { components: ['field', 'datePill', 'button'].map((name) => ({ name, controls: [{ label: 'Label', prop: 'Label' }] })) };
const scales = { spacing: [{ name: 'gap/s', var: '--gap-s', value: '4px' }], text: [{ name: 'm', size: '14px', weight: '500', lh: '20px' }] };

test('H2: each gap records what was searched, the components nearest to it, what stands in, and why none fit', () => {
  const ui = { component: 'Page', props: {}, children: [
    { component: 'Missing', props: { need: 'a date picker', closest: 'field', searched: '--query field and datePill', why: 'field takes typed text only; datePill cannot be changed' } },
    { component: 'button', props: { Label: 'Next month', standInFor: 'a month stepper', why: 'nothing steps through months' } },
  ] };
  const r = checkPrototype(ui, { catalog, view, scales, name: 'booking' });
  assert.equal(r.ok, true, JSON.stringify(r.findings));
  const picker = r.gaps.find((g) => g.need === 'a date picker');
  assert.deepEqual(picker.tried, { searched: ['--query field and datePill', "the system's 3 components, by name and description"], nearest: ['datePill'], reused: null, why: ['field takes typed text only; datePill cannot be changed'] });
  const stepper = r.gaps.find((g) => g.need === 'a month stepper');
  assert.equal(stepper.tried.reused, 'button');
  assert.deepEqual(stepper.tried.why, ['nothing steps through months']);
  // Kept when the gaps of every prototype are merged, and said in the gaps list and the summary.
  const merged = mergeGaps({ booking: r.gaps, other: [picker] }).find((g) => g.need === 'a date picker');
  assert.deepEqual(merged.prototypes, ['booking', 'other']);
  assert.deepEqual(merged.tried.nearest, ['datePill']);
  assert.equal(gapLine(merged), "component: a date picker; closest in the system: field; searched --query field and datePill, and the system's 3 components, by name and description: nearest datePill; why none fits: field takes typed text only; datePill cannot be changed (needed in 2 prototypes: booking, other)");
  // The prototype's own page keeps its short line.
  assert.equal(pageGaps(r.gaps).find((g) => g.need === 'a date picker').line, 'component: a date picker; closest in the system: field');
  // A gap with no word near any component says so.
  assert.match(gapLine(checkPrototype({ component: 'Page', props: {}, children: [{ component: 'Missing', props: { need: 'a map' } }] }, { catalog, view, scales }).gaps.find((g) => g.need === 'a map')), /: none near it$/);
});

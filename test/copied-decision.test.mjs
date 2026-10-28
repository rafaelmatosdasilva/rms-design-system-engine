// A decision copied from the style guide: the system's command, the page by its kind and name, the decision in words.
// The router turns it into the command (route.mjs → copiedDecision, decisionSteps); drafts name the task that wrote
// them (doc-source-dsds.mjs → DRAFT, draftTask), the System page holds its drafts apart, and the review is kept to that
// task and to the number the person saw (intent-changes.mjs → reviewPlan, draftLinesPlan).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from './helpers.mjs';
import { route, copiedDecision } from '../route.mjs';
import { DRAFT, draftTask, readDsds } from '../doc-source-dsds.mjs';
import { reviewPlan, draftLinesPlan, systemPage } from '../intent-changes.mjs';
import { engineCommand, applyProfile, commandSkill } from '../profile.mjs';
import { decisionsFrom, decisionLine } from '../decisions.mjs';

const cmd = 'rms-design-system-engine';
const routed = (t) => route(t, { hasConfig: true, cmd });

test('a copied decision names its page by kind and name, each step after "; then"', () => {
  assert.deepEqual(copiedDecision('on the System page, Approve all 2 drafts from the task "X" (28 Oct).'), { page: 'the System page', on: 'the System page', steps: ['Approve all 2 drafts from the task "X" (28 Oct)'] });
  assert.equal(copiedDecision('on Component Button, Drop its draft.').page, 'Button');
  assert.equal(copiedDecision('on Template Checkout, Approve its draft.').page, 'Checkout');
  assert.equal(copiedDecision('on Legend, part of Component Pie chart, Approve its draft.').page, 'Legend');
  assert.deepEqual(copiedDecision('on Component Button, Approve its draft; then write "When to use" as drafts I review.').steps, ['Approve its draft', 'write "When to use" as drafts I review']);
  assert.equal(copiedDecision('check the button component'), null, 'any other request is not one');
});

test('each copied decision runs the command that makes it, kept with the words it was given in', () => {
  const t = 'on the System page, Approve all 10 drafts from the task "What to do when no component fits" (28 Oct)';
  assert.deepEqual(routed(t).run, [`${cmd} --review-drafts --approve 'the System page' --task 'What to do when no component fits' --expect 10 --said '${t}'`]);
  assert.match(routed('on Component Button, Drop its draft.').run[0], /^rms-design-system-engine --review-drafts --drop 'Button' --expect 1 --said /);
  assert.match(routed('on Component Button, Yes to "Icon is a part of Button"').run[0], /^rms-design-system-engine --intent-decide 'Icon is a part of Button' yes --said /);
  assert.match(routed('on Component Icon, It is a part of Component Button').run[0], /^rms-design-system-engine --part 'Icon' 'Button' --said /);
  assert.match(routed('on Component Icon, It is its own component').run[0], /^rms-design-system-engine --part 'Icon' 'none' --said /);
  // What needs the person's words, or the agent's lines, is said as what to do, never run with blanks.
  const change = routed('on Component Button, Change one of the 3 drafts from the task "X" (28 Oct): ask me which one and my words');
  assert.deepEqual(change.run, []);
  assert.ok(change.notes.some((n) => /^Ask the person which draft and their words for it, then run rms-design-system-engine --review-drafts --change 'Button' '<that draft>' '<their words>' --task 'X'/.test(n)));
  const write = routed('on the System page, Write "What to do when no component fits" as drafts I review.');
  assert.ok(write.notes.some((n) => /--draft 'the System page' 'What to do when no component fits' '<line>' \['<line>'…\] --task 'What to do when no component fits'/.test(n)));
  // A quote in the words stays one argument for the shell.
  assert.match(routed("on Component Button, Yes to \"It's a part\"").run[0], /--intent-decide 'It'\\''s a part' yes/);
});

test('a draft names the task that wrote it and its day; the plain marker still reads as a draft', () => {
  assert.deepEqual(draftTask('**Draft (What to do when no component fits, 2026-10-28):** Use only the system\'s components.'), { task: 'What to do when no component fits', at: '2026-10-28' });
  assert.deepEqual(draftTask('**Draft (A review):** X.'), { task: 'A review' });
  assert.deepEqual(draftTask('**Draft:** X.'), {});
  for (const l of ['**Draft:** X.', '__Draft:__ X.', 'Draft: X.', '**Draft (T, 2026-10-28):** X.']) assert.equal(l.replace(DRAFT, ''), 'X.', l);
});

const index = (body) => ({ schemaVersion: '0.23', entries: [{ kind: 'system', id: 'sys', name: 'Acme', sections: [
  { kind: 'guidelines', title: 'Rules', items: [{ statement: 'Use tokens.' }, { statement: '**Draft (T, 2026-10-28):** Name the gap.' }] },
  { kind: 'section', title: 'What to do when no component fits', freeform: [{ title: 'What to do when no component fits', body }] },
] }], refs: [] });

test('the System page holds its drafts apart: none of them is one of its rules', () => {
  const { system } = readDsds(new Map([['specs/system.dsds.json', index('- **Draft (T, 2026-10-28):** Ask before building one.\n- Use what fits.')]]), 'specs/system.dsds.json');
  assert.deepEqual(system.drafts, [{ where: 'Rules', text: 'Name the gap.', task: 'T', at: '2026-10-28' }, { where: 'What to do when no component fits', text: 'Ask before building one.', task: 'T', at: '2026-10-28' }]);
  assert.ok(!system.sections.some((x) => /Draft/.test(x.text)), 'no drafted line reaches an agent');
  assert.ok(system.sections.some((x) => /Use what fits\./.test(x.text)) && system.sections.some((x) => /Use tokens\./.test(x.text)));
  assert.equal(system.file, 'specs/system.dsds.json');
});

test('a review keeps to the task named and to the number the person saw', () => {
  const file = 'specs/system.dsds.json', raw = JSON.stringify(index('- **Draft (T, 2026-10-28):** Ask before building one.'), null, 2);
  const { system } = readDsds(new Map([[file, JSON.parse(raw)]]), file);
  const snap = { system, entities: [] };
  assert.equal(systemPage(snap).drafts.length, 2);
  const ok = reviewPlan(snap, [{ page: 'the System page', do: 'approve', task: 'T', expect: 2 }], new Map([[file, raw]]));
  assert.deepEqual(ok.problems, []);
  const after = JSON.parse(ok.files.get(file));
  assert.doesNotMatch(JSON.stringify(after), /Draft/, 'both approved: their markers off');
  assert.match(JSON.stringify(after), /Ask before building one\./);
  const stale = reviewPlan(snap, [{ page: 'the System page', do: 'approve', task: 'T', expect: 3 }], new Map([[file, raw]]));
  assert.equal(stale.files.size, 0);
  assert.match(stale.problems[0], /it has 2 drafts from that task, not 3: the page changed since it was read, so ask the person again/);
  assert.match(reviewPlan(snap, [{ page: 'the System page', do: 'drop', task: 'Other' }], new Map([[file, raw]])).problems[0], /no draft on it is from that task \(its drafts are from "T"\)/);
});

test('--draft writes each line under its section, marked with its task, on the System page or a component\'s', () => {
  const file = 'specs/system.dsds.json', raw = JSON.stringify(index('- Use what fits.'), null, 2);
  const { system } = readDsds(new Map([[file, JSON.parse(raw)]]), file);
  const plan = draftLinesPlan({ system, entities: [] }, 'the System page', 'What to do when no component fits', ['Use only the system\'s components.', 'Ask before building one.'], new Map([[file, raw]]), { task: 'What to do when no component fits', at: '2026-10-28' });
  assert.equal(plan.page, 'the System page');
  assert.deepEqual(plan.lines, ['**Draft (What to do when no component fits, 2026-10-28):** Use only the system\'s components.', '**Draft (What to do when no component fits, 2026-10-28):** Ask before building one.']);
  const back = readDsds(new Map([[file, JSON.parse(plan.files.get(file))]]), file).system;
  assert.deepEqual(back.drafts.map((d) => [d.where, d.task, d.at]), [['Rules', 'T', '2026-10-28'], ['What to do when no component fits', 'What to do when no component fits', '2026-10-28'], ['What to do when no component fits', 'What to do when no component fits', '2026-10-28']]);
  assert.match(back.sections.find((x) => x.title === 'What to do when no component fits').text, /^- Use what fits\.$/, 'the line already there is kept as it was');
  assert.match(draftLinesPlan({ system: null, entities: [] }, 'Nothing', 'Rules', ['x'], new Map()).error, /no page in the intent layer is about "Nothing"/);
});

test('the command a copied decision starts with is the company\'s own, else the engine with the profile, else the engine', () => {
  const home = tempDir('home-');
  const src = 'https://git.example.com/ux/acme-profile/-/blob/main/profile.json';
  assert.equal(engineCommand({}, { home }), 'rms-design-system-engine');
  assert.equal(engineCommand({ profile: { source: src } }, { home }), `rms-design-system-engine --profile '${src}'`);
  mkdirSync(join(home, '.claude', 'skills', 'rms-design-system-engine-acme'), { recursive: true });
  writeFileSync(join(home, '.claude', 'skills', 'rms-design-system-engine-acme', 'SKILL.md'), commandSkill('acme', src, { name: 'Acme' }));
  assert.equal(engineCommand({ profile: { source: src } }, { home }), '/rms-design-system-engine-acme', 'found by the profile its command runs');
  assert.equal(engineCommand(applyProfile({}, { command: '/rms-design-system-engine-acme-ds' }, { source: src }), { home }), '/rms-design-system-engine-acme-ds', 'named by the profile first');
});

test('the company\'s command routes the request first, and says whose system it is', () => {
  const t = commandSkill('acme', 'https://x/p.json', { name: 'Acme' });
  assert.match(t, /rms-design-system-engine --profile 'https:\/\/x\/p\.json' --route "\$ARGUMENTS"/);
  assert.match(t, /The request is for Acme's design system: never another's\./);
});

test('a decision keeps the words it was given in, shown beside who made it and when', () => {
  const [d] = decisionsFrom({ answered: { 'move:x': { answer: 'yes', proposal: 'Icon is a part of Button', by: 'Sam', at: '2026-10-28', said: 'on Component Icon, Yes to "Icon is a part of Button"' } } });
  assert.equal(d.said, 'on Component Icon, Yes to "Icon is a part of Button"');
  assert.match(decisionLine(d), /Decided by Sam on .+\. As given: `on Component Icon, Yes to "Icon is a part of Button"`$/);
  assert.doesNotMatch(decisionLine({ what: 'X' }), /As given/);
});

test('a snapshot an older engine wrote names only the index: the System page is still found by it', () => {
  const file = 'specs/system.dsds.json', raw = JSON.stringify(index('- Use what fits.'), null, 2);
  const { system } = readDsds(new Map([[file, JSON.parse(raw)]]), file);
  delete system.file;
  const plan = draftLinesPlan({ system, entities: [], _source: { entry: file } }, 'the System page', 'Rules', ['Ask first.'], new Map([[file, raw]]), { task: 'T', at: '2026-10-28' });
  assert.equal(plan.file, file);
});

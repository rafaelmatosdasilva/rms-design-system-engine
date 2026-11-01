// lessons.mjs - a correction becomes the strongest guard that holds it: a check, else a step in the agent rules, else
// a rule for the guidelines, written there only on a person's yes; findings that repeat are proposed the same way;
// and a lesson that comes back says which guard did not hold.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  recordLesson, readLessonsFile, proposeGuard, ruleSentence, answerProposal, withGuard, guardFindings, guardsOf,
  noteAgentEdit, sweepCorrections, pendingCorrections, takeCorrection, noteReview, noteEdit, proposedRules, editKind,
  lessonsView, lessonsLine, lessonsLines, lessonDecisions, backSaid, agentSteps, LESSONS_FILE,
} from '../lessons.mjs';
import { editFindings, editTruth } from '../edit-check.mjs';
import { steeringTruth } from '../steering-check.mjs';
import { decisionsFrom, decisionView, ruledOutLines, gatherDecisions } from '../decisions.mjs';
import { rulesSection, writeRules } from '../agent-rules.mjs';
import { judge, routePrompt } from '../guard.mjs';
import { route } from '../route.mjs';
import { recordWrong } from '../wrong.mjs';
import { tempDir } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const COMPONENTS = ['cardTile', 'buttonClock', 'tileOne', 'Button'];
const dir = () => tempDir('lessons-');
const T = (n) => `2026-10-${String(n).padStart(2, '0')}T09:00:00.000Z`;

test('a lesson needs what was wrong and why, and the same lesson told again is the first one coming back', () => {
  const d = dir();
  assert.throws(() => recordLesson(d, { what: 'put a buttonClock inside a cardTile', why: ' ' }), /why/);
  assert.throws(() => recordLesson(d, { what: '', why: 'x' }), /what was wrong/);
  const a = recordLesson(d, { what: 'Put a buttonClock inside a cardTile', why: 'a tile holds one action' }, { by: 'QA', at: T(1) });
  assert.equal(a.lesson.id, 'L1');
  assert.equal(a.back, false);
  assert.equal(a.lesson.by, 'QA');
  assert.ok(existsSync(join(d, LESSONS_FILE)), 'kept in the project, beside the other decisions');
  const b = recordLesson(d, { what: 'put a buttonClock inside a cardTile.', why: 'again' }, { at: T(2) });
  assert.equal(b.back, true);
  assert.equal(b.lesson.id, 'L1');
  const doc = readLessonsFile(d);
  assert.equal(doc.lessons.length, 1, 'one lesson, not two');
  assert.deepEqual(doc.back.map((x) => x.id), ['L1']);
  assert.equal(recordLesson(d, { what: 'Something else', why: 'y' }).lesson.id, 'L2');
});

test('each lesson is proposed in the strongest form that can hold it', () => {
  const p = (what, extra = {}) => proposeGuard({ what, why: 'it was wrong', ...extra }, { components: COMPONENTS });
  // A component inside another: the authored contract's neverCombineWith, which the edit and prototype checks read.
  assert.deepEqual([p('Put a buttonClock inside a cardTile').form, p('Put a buttonClock inside a cardTile').parent, p('Put a buttonClock inside a cardTile').child], ['check', 'cardTile', 'buttonClock']);
  assert.equal(p('cardTile must never contain a buttonClock').kind, 'pairing');
  assert.equal(p('<card-tile> held a <button-clock>').parent, 'cardTile');
  // Said as something to do, it is no mistake to forbid.
  assert.notEqual(p('A buttonClock should go inside a cardTile').kind, 'pairing');
  // A prop combination on one component.
  const props = p('Used <Button tone="danger" variant="primary"> for the delete action');
  assert.deepEqual([props.form, props.kind, props.component, props.props], ['check', 'props', 'Button', { tone: 'danger', variant: 'primary' }]);
  // A value written by hand, the one before "instead of" wrong, the other what to use.
  const v = p('Wrote #fff instead of var(--surface-page)', { component: 'cardTile' });
  assert.deepEqual([v.kind, v.value, v.use, v.component], ['value', '#fff', 'var(--surface-page)', 'cardTile']);
  // An import, with what replaces it: the project's own imports.replaced, which the edit check reads.
  const i = p('Imported from "old-ui" instead of "@acme/ui"');
  assert.deepEqual([i.kind, i.from, i.to, i.place], ['import', 'old-ui', '@acme/ui', 'ds-config.json → imports.replaced']);
  // Nothing measurable: a step of the agent's own work, else a rule for the guidelines.
  assert.equal(p('Added a token to the theme without asking the person first').form, 'agent');
  const g = p('The empty state of the list said nothing about what to do next', { why: 'an empty list tells people what to do next' });
  assert.equal(g.form, 'guideline');
  assert.match(g.place, /System page/);
  assert.match(proposeGuard({ what: 'x', why: 'y', component: 'tileOne' }).place, /tileOne's page/);
});

test('the sentence a lesson becomes: the person\'s words, its own when it reads as a rule, its why when that does', () => {
  assert.equal(ruleSentence({ what: 'x', rule: 'one primary action per screen' }), 'One primary action per screen.');
  assert.equal(ruleSentence({ what: 'Never put two alerts on a page', why: 'y' }), 'Never put two alerts on a page.');
  assert.equal(ruleSentence({ what: 'Two alerts on one page', why: 'a page must ask for attention once' }), 'A page must ask for attention once.');
  assert.equal(ruleSentence({ what: 'Two alerts on one page', why: 'it was noisy' }), 'Never again: Two alerts on one page (it was noisy).');
});

test('a yes to a pairing writes neverCombineWith, and the edit check holds it from the next edit', () => {
  const d = dir();
  mkdirSync(join(d, 'contracts'), { recursive: true });
  writeFileSync(join(d, 'contracts', 'catalog.json'), JSON.stringify({ components: { cardTile: { props: {} }, buttonClock: { props: {} } } }));
  writeFileSync(join(d, 'contract.authored.json'), JSON.stringify({ components: { cardTile: { notes: 'kept as it was' } } }));
  const { lesson } = recordLesson(d, { what: 'Put a buttonClock inside a cardTile', why: 'a tile holds one action' });
  // Before the yes, the check knows nothing of it.
  const page = '<CardTile>\n  <ButtonClock />\n</CardTile>';
  assert.deepEqual(editFindings(['  <ButtonClock />'], page, editTruth(d, {})).filter((f) => f.kind === 'nesting'), []);
  const r = answerProposal(d, lesson.id, 'yes', { components: COMPONENTS, by: 'QA', at: T(3) });
  assert.deepEqual(r.wrote, ['contract.authored.json']);
  const authored = JSON.parse(readFileSync(join(d, 'contract.authored.json'), 'utf8'));
  assert.deepEqual(authored.components.cardTile, { notes: 'kept as it was', neverCombineWith: ['buttonClock'] }, 'added beside what a person wrote, never over it');
  const found = editFindings(['  <ButtonClock />'], page, editTruth(d, {}));
  assert.deepEqual(found.filter((f) => f.kind === 'nesting').map((f) => f.text), ['cardTile must never contain buttonClock; put the buttonClock beside it']);
  // What it became, linked from the lesson.
  const v = lessonsView(d, { components: COMPONENTS });
  assert.equal(v.lessons[0].became.form, 'check');
  assert.match(v.lessons[0].became.place, /cardTile\.neverCombineWith/);
  // Where the project does not let the engine write its own files, the yes is kept and the guard is a task.
  const e = dir();
  recordLesson(e, { what: 'Put a buttonClock inside a cardTile', why: 'a tile holds one action' });
  const blocked = answerProposal(e, 'L1', 'yes', { components: COMPONENTS, may: 'no' });
  assert.deepEqual(blocked.wrote, []);
  assert.match(blocked.blocked, /writes\.engine/);
  assert.equal(existsSync(join(e, 'contract.authored.json')), false);
});

test('a prop-combination guard catches the combination on the component, across lines, and nothing else', () => {
  const guards = guardsOf(withGuard({ kind: 'props', component: 'Button', props: { tone: 'danger', variant: 'primary' } }, { id: 'L4', say: 'the safe action must be the primary one' }).authored);
  assert.equal(guards.length, 1);
  const planted = '<template>\n  <Button\n    tone="danger"\n    variant="primary"\n  >Delete</Button>\n</template>';
  const all = new Set([1, 2, 3, 4, 5, 6]);
  const hit = guardFindings(planted, all, guards);
  assert.equal(hit.length, 1, 'the planted mistake is caught');
  assert.equal(hit[0].line, 2);
  assert.equal(hit[0].lesson, 'L4');
  assert.match(hit[0].text, /Button with tone="danger" and variant="primary" is what a lesson ruled out \(a lesson: the safe action must be the primary one\)/);
  assert.deepEqual(guardFindings('<Button tone="danger" variant="secondary">x</Button>', new Set([1]), guards), [], 'another combination passes');
  assert.deepEqual(guardFindings('<Badge tone="danger" variant="primary" />', new Set([1]), guards), [], 'another component passes');
  assert.deepEqual(guardFindings(planted, new Set([1]), guards), [], 'a tag the edit did not touch is not this edit\'s');
});

test('a value guard holds on its component only, and says what to use', () => {
  const guards = [{ lesson: 'L5', kind: 'value', value: '#fff', use: 'var(--surface-page)', component: 'cardTile' }];
  assert.match(guardFindings('.cardTile { background: #fff; }', new Set([1]), guards)[0].text, /#fff is what a lesson ruled out on cardTile \(a lesson\); use var\(--surface-page\)/);
  assert.equal(guardFindings('.badge { background: #FFF; }', new Set([1]), guards).length, 0, 'another component\'s rule is not this lesson\'s');
  assert.equal(guardFindings('background: #fff;', new Set([1]), guards, { file: 'src/components/CardTile.vue' }).length, 1, 'the component\'s own file');
  // Through the edit check, read from the authored contract.
  const ctx = { truth: steeringTruth({ catalog: { components: {} }, cssVars: [] }), tokenByValue: new Map(), guards };
  assert.deepEqual(editFindings(['.cardTile { background: #fff; }'], '.cardTile { background: #fff; }', ctx, { sheet: true }).filter((f) => f.kind === 'lesson').map((f) => f.lesson), ['L5']);
});

test('a line an agent wrote that somebody else changed is a correction to confirm; the agent\'s own edits are not', () => {
  const d = dir();
  const file = join(d, 'src', 'Card.vue');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, '<template>\n  <div class="card" style="padding: 12px">Hi</div>\n</template>\n');
  noteAgentEdit(d, { tool_name: 'Write', tool_input: { file_path: file, content: '' } }, ['<template>', '  <div class="card" style="padding: 12px">Hi</div>', '</template>'], { now: T(1) });
  // The agent edits its own line: no correction.
  writeFileSync(file, '<template>\n  <div class="card" style="padding: 16px">Hi</div>\n</template>\n');
  assert.deepEqual(noteAgentEdit(d, { tool_name: 'Edit', tool_input: { file_path: file, old_string: '  <div class="card" style="padding: 12px">Hi</div>', new_string: '  <div class="card" style="padding: 16px">Hi</div>' } }, ['  <div class="card" style="padding: 16px">Hi</div>'], { now: T(2) }), []);
  // A person changes it by hand: the next run finds it, with what it reads now.
  writeFileSync(file, '<template>\n  <div class="card" style="padding: var(--space-m)">Hi</div>\n</template>\n');
  const found = sweepCorrections(d, { now: T(3) });
  assert.equal(found.length, 1);
  assert.equal(found[0].text, '<div class="card" style="padding: 16px">Hi</div>');
  assert.equal(found[0].now, '<div class="card" style="padding: var(--space-m)">Hi</div>');
  assert.deepEqual(sweepCorrections(d, { now: T(4) }), [], 'found once');
  assert.equal(pendingCorrections(d).length, 1);
  // Never a lesson until the person gives why; then it is one, and leaves the list.
  const c = takeCorrection(d, 1);
  const { lesson } = recordLesson(d, { what: 'Wrote padding: 16px on the card', why: 'spacing comes from the tokens', edit: { file: c.file, text: c.text, now: c.now } });
  assert.equal(pendingCorrections(d).length, 0);
  answerProposal(d, lesson.id, 'yes', { at: T(5) });
  // The agent writing the corrected line again is the lesson coming back.
  noteAgentEdit(d, { tool_name: 'Edit', tool_input: { file_path: file, old_string: 'x', new_string: 'y' } }, ['  <div class="card" style="padding: 16px">Hi</div>'], { now: T(6) });
  const l = lessonsView(d, { components: [] }).lessons.find((x) => x.id === lesson.id);
  assert.equal(l.back.length, 1);
  assert.match(backSaid(l), /came back 1 time, last on 2026-10-06 in src\/Card\.vue \(an agent wrote the corrected line again\): a check .* held and caught it|did not hold/);
});

test('a file rewritten or reformatted as a whole is not read as corrections, and a changed line can be taken off the list', () => {
  const d = dir();
  const file = join(d, 'list.css');
  const lines = Array.from({ length: 14 }, (_, i) => `.row-${i} { color: var(--text-${i}); }`);
  writeFileSync(file, lines.join('\n'));
  noteAgentEdit(d, { tool_name: 'Write', tool_input: { file_path: file, content: '' } }, lines);
  writeFileSync(file, lines.map((l) => l.replace('{ ', '{\n  ')).join('\n'));
  assert.deepEqual(sweepCorrections(d), [], 'every line moved at once: a reformat, nothing to ask');
  writeFileSync(file, lines.join('\n'));
  noteAgentEdit(d, { tool_name: 'Write', tool_input: { file_path: file, content: '' } }, lines);
  writeFileSync(file, lines.map((l, i) => (i === 3 ? '.row-3 { color: var(--text-muted); }' : l)).join('\n'));
  assert.equal(sweepCorrections(d).length, 1);
  assert.equal(takeCorrection(d, 1).text, '.row-3 { color: var(--text-3); }');
  assert.deepEqual(pendingCorrections(d), []);
});

test('a page-review finding on three screens becomes a proposed rule; a judgement never does', () => {
  const d = dir();
  noteReview(d, [{ place: 'Orders', kinds: ['primary', 'flat'] }, { place: 'Cart', kinds: ['primary', 'flat'] }], { now: T(1) });
  // The same screens again, unchanged: the same findings, not the mistake made again.
  noteReview(d, [{ place: 'Orders', kinds: ['primary', 'flat'] }, { place: 'Cart', kinds: ['primary', 'flat'] }], { now: T(2) });
  assert.deepEqual(proposedRules(d), [], 'two times');
  noteReview(d, [{ place: 'Orders', kinds: ['primary', 'flat'] }, { place: 'Cart', kinds: ['primary', 'flat'] }, { place: 'Profile', kinds: ['primary', 'flat'] }], { now: T(3) });
  const p = proposedRules(d);
  assert.deepEqual(p.map((x) => [x.id, x.form, x.times]), [['R-page-primary', 'guideline', 3]], 'one main action is the same decision every time; which section matters most is not');
  assert.match(p[0].text, /one primary action/);
  // Fixed on a screen and made again: counted again.
  noteReview(d, [{ place: 'Orders', kinds: [] }], { now: T(4) });
  noteReview(d, [{ place: 'Orders', kinds: ['primary'] }], { now: T(5) });
  assert.equal(proposedRules(d)[0].times, 4);
  // Answered yes, then found again: it came back, and the rule did not hold.
  answerProposal(d, 'R-page-primary', 'yes', { at: T(6) });
  assert.deepEqual(proposedRules(d), [], 'answered, never proposed again');
  noteReview(d, [{ place: 'Orders', kinds: [] }], { now: T(7) });
  noteReview(d, [{ place: 'Orders', kinds: ['primary'] }], { now: T(8) });
  const v = lessonsView(d, { components: [] });
  const rule = v.lessons.find((l) => l.id === 'R-page-primary');
  assert.equal(rule.became.form, 'guideline');
  assert.match(backSaid(rule), /a written rule for the guidelines .* did not hold/);
  assert.match(lessonsLine(v), /came back \(a written rule for the guidelines did not hold\)/);
});

test('an edit-check finding made in three edits becomes a proposed agent step; the same line seen twice counts once', () => {
  const d = dir();
  assert.equal(editKind({ text: 'padding: 12px is written by hand; use var(--space-s)' }), 'size');
  assert.equal(editKind({ text: '#1b2433 is written by hand; use var(--text-primary)' }), 'colour');
  assert.equal(editKind({ text: 'x', kind: 'a11y' }), null, 'accessibility is decided by the floor, never a rule of its own');
  noteEdit(d, 'a.css', [{ line: 3, text: '#123456 is not a design-system colour; use one of its colour tokens' }], { now: T(1) });
  noteEdit(d, 'a.css', [{ line: 3, text: '#123456 is not a design-system colour; use one of its colour tokens' }], { now: T(1) });
  noteEdit(d, 'b.css', [{ line: 1, text: '#abcdef is not a design-system colour; use one of its colour tokens' }], { now: T(2) });
  assert.deepEqual(proposedRules(d), []);
  noteEdit(d, 'c.vue', [{ line: 9, text: 'red is not a design-system colour; use one of its colour tokens' }], { now: T(3) });
  const p = proposedRules(d);
  assert.deepEqual(p.map((x) => [x.id, x.form, x.times]), [['R-edit-colour', 'agent', 3]]);
  // A yes: a step the agent reads before it works, with every request and in the engine's section of its rules.
  answerProposal(d, 'R-edit-colour', 'yes', { at: T(4) });
  assert.deepEqual(agentSteps(d), [p[0].text]);
  assert.ok(rulesSection(agentSteps(d)).includes(`- ${p[0].text}`));
  writeFileSync(join(d, 'AGENTS.md'), '# Team notes\n');
  writeRules(d, 'AGENTS.md', { steps: agentSteps(d) });
  assert.match(readFileSync(join(d, 'AGENTS.md'), 'utf8'), /Learned in this project, each from a correction a person said yes to:\n\n- Write every colour/);
  // A guard of a lesson seen by the check is that lesson coming back, caught.
  recordLesson(d, { what: 'Used <Button tone="danger" variant="primary">', why: 'the safe action must be the primary one' });
  answerProposal(d, 'L1', 'yes', { components: COMPONENTS, at: T(5) });
  noteEdit(d, 'd.vue', [{ line: 2, kind: 'lesson', lesson: 'L1', text: 'Button with tone="danger" and variant="primary" is what a lesson ruled out' }], { now: T(6) });
  const l = lessonsView(d, { components: COMPONENTS }).lessons.find((x) => x.id === 'L1');
  assert.match(backSaid(l), /a check \(contract\.authored\.json → guards\) held and caught it; the agent was not told before it wrote/);
});

test('lessons show where decisions show, and an agent is told what a correction ruled out', () => {
  const d = dir();
  recordLesson(d, { what: 'Put a buttonClock inside a cardTile', why: 'a tile holds one action', component: 'cardTile' }, { by: 'QA', at: T(1) });
  recordWrong(d, [{ check: 'Showroom screens as pages', what: 'Orders has 2 main actions in view', component: null }], { why: 'the second is in a menu', by: 'QA' });
  const view = lessonsView(d, { components: COMPONENTS, wrong: JSON.parse(readFileSync(join(d, 'design-system-engine-wrong.json'), 'utf8')).findings });
  assert.equal(view.counts.lessons, 2);
  assert.equal(view.lessons[1].source, 'wrong');
  assert.match(view.lessons[1].became.text, /a case Showroom screens as pages must pass/, 'a page-review finding a person overrode: its guard is already written');
  assert.match(lessonsLine(view), /^Lessons: 2 lessons \(1 held: 1 check\) · 1 waiting for a yes\. rms-design-system-engine --lessons lists them\.$/);
  const text = lessonsLines(view).join('\n');
  assert.match(text, /L1 {2}cardTile: Put a buttonClock inside a cardTile/);
  assert.match(text, /proposed as a check: cardTile never contains buttonClock\. → contract\.authored\.json → cardTile\.neverCombineWith/);
  const decided = decisionView(decisionsFrom({ lessons: lessonDecisions(view) }));
  assert.equal(decided.byComponent.cardTile[0].kind, 'lesson');
  assert.match(decided.byComponent.cardTile[0].became, /^Proposed as a check/);
  assert.deepEqual(ruledOutLines(decided, 'cardTile'), ['decided against: Put a buttonClock inside a cardTile - a tile holds one action (learned from a correction, QA, 2026-10-01)']);
  // Read from the project as every reader takes it (the style guide, DECISIONS.md, the contracts).
  assert.ok(gatherDecisions(d).all.some((x) => x.kind === 'lesson' && x.component === 'cardTile'));
  assert.equal(lessonsLine(lessonsView(dir(), {})), null, 'nothing to say with no lessons');
});

test('the hooks: a lesson\'s answer is the person\'s, and the steps lessons became reach the agent with every request', () => {
  const cmd = (c) => ({ tool_name: 'Bash', tool_input: { command: c } });
  assert.equal(judge(cmd('rms-design-system-engine --lesson-answer L1 yes'), { userText: 'fix the chip' })?.decision, 'ask');
  assert.equal(judge(cmd('rms-design-system-engine --lesson-answer L1 yes'), { userText: 'yes' }), null);
  assert.equal(judge(cmd('rms-design-system-engine --lesson-answer L1 no'), { userText: 'no to lesson L1, keep it as words' }), null);
  assert.equal(judge({ tool_name: 'Edit', tool_input: { file_path: `/p/${LESSONS_FILE}` } }, { userText: 'fix the chip' })?.decision, 'ask', 'an agent never writes a lesson of its own');
  const d = dir();
  writeFileSync(join(d, 'ds-config.json'), '{}');
  noteEdit(d, 'a.css', [1, 2, 3].map((i) => ({ text: `#00000${i} is not a design-system colour; use one of its colour tokens` })));
  answerProposal(d, 'R-edit-colour', 'yes');
  const ctx = routePrompt({ prompt: '/rms-design-system-engine check the chip' }, { root: d, engineDir: ENGINE, cfg: {}, env: { PATH: process.env.PATH } });
  assert.match(ctx, /Learned in this project \(each a correction a person said yes to holding as a step; follow them\):\n- Write every colour as one of the system's colour tokens/);
});

test('a correction said in Claude Code is routed to --lesson with the person\'s words and reason', () => {
  const P = { hasConfig: true, components: ['badge', 'chip'] };
  const r = route('remember this lesson: the chip was put inside a badge, because a badge holds only text', P);
  assert.deepEqual(r.run, ['rms-design-system-engine --lesson "the chip was put inside a badge" --why "a badge holds only text"']);
  assert.deepEqual(route('show the lessons', P).run, ['rms-design-system-engine --lessons']);
  assert.ok(route('remember this lesson: the chip was wrong', P).ask, 'without a reason, the person is asked for it');
});

test('--lesson keeps a correction and proposes its guard; --lesson-answer yes writes it; --lessons lists them', () => {
  const d = dir();
  writeFileSync(join(d, 'ds-config.json'), JSON.stringify({ writes: { engine: 'ask' } }));
  mkdirSync(join(d, 'contracts'), { recursive: true });
  writeFileSync(join(d, 'contracts', 'catalog.json'), JSON.stringify({ components: { cardTile: {}, buttonClock: {} } }));
  const run = (...a) => spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), ...a], { cwd: d, encoding: 'utf8', env: { ...process.env, DESIGN_SYSTEM_ENGINE_NO_AUTO_UPDATE: '1' } });
  assert.match(run('--lesson', 'Put a buttonClock inside a cardTile').stdout, /needs why/);
  const kept = run('--lesson', 'Put a buttonClock inside a cardTile', '--why', 'a tile holds one action', '--by', 'QA');
  assert.equal(kept.status, 0, kept.stdout + kept.stderr);
  assert.match(kept.stdout, /Lesson L1 kept/);
  assert.match(kept.stdout, /The strongest form that holds it: a check\. cardTile never contains buttonClock\./);
  assert.match(kept.stdout, /--lesson-answer L1 yes\|no/);
  const yes = run('--lesson-answer', 'L1', 'yes', '--by', 'QA');
  assert.equal(yes.status, 0, yes.stdout + yes.stderr);
  assert.match(yes.stdout, /written into contract\.authored\.json/);
  assert.deepEqual(JSON.parse(readFileSync(join(d, 'contract.authored.json'), 'utf8')).components.cardTile.neverCombineWith, ['buttonClock']);
  const list = run('--lessons');
  assert.match(list.stdout, /became a check: cardTile never contains buttonClock\./);
  assert.equal(run('--lesson-answer', 'L9', 'yes').status, 2);
  const again = run('--lesson', 'put a buttonClock inside a cardTile', '--why', 'it happened again');
  assert.match(again.stdout, /L1 came back/);
  assert.match(again.stdout, /did not hold/);
});

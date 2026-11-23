import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reviewProblems, gradeProblem, readGrades, withGrades, gradeCounts, gradeLines, GRADES_FILE } from '../lib/review-severity.mjs';
import { checkRecord } from '../lib/prototype-record.mjs';
import { decisionFile, judge } from '../lib/guard.mjs';
import { tempDir } from './helpers.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const found = () => reviewProblems({
  visual: { findings: [{ kind: 'primary', message: '2 primary actions in view (Button "Save", Button "Send"): keep one, the rest secondary' }, { kind: 'align', message: 'the parts of the form do not start on one line' }] },
  fit: [
    { finding: { kind: 'target', asWritten: true }, line: '⚠️  Chip "x" is 16×16px, smaller than 24px to tap at Phone 375' },
    { finding: { kind: 'wide', asWritten: false }, line: '⚠️  the part at 0.2 runs 12px past the screen\'s edge at Phone 375, with the words 40% longer (as a translation makes them)' },
  ],
  owed: [{ kind: 'empty' }],
  interactions: ['⚠️  "Send" changes nothing on the page when it is clicked', '⚠️  dialog opens without the focus inside it'],
});

test('each problem gets a grade proposed from what kind of problem it is and where, with why', () => {
  const p = found();
  const by = Object.fromEntries(p.map((x) => [x.message.slice(0, 24), x.proposed.grade]));
  assert.deepEqual(Object.values(by), ['Major', 'Minor', 'Major', 'Minor', 'Major', 'Blocker', 'Major']);
  assert.ok(p.every((x) => /^[0-9a-f]{8}$/.test(x.id) && x.proposed.why));
  assert.match(p.find((x) => x.source === 'widths' && /16×16/.test(x.message)).proposed.why, /2\.5\.8, AA/);
  assert.ok(!p.some((x) => x.message.startsWith('⚠️')), 'the mark is the line\'s, not the problem\'s');
  // The same problem found again keeps its id, so the reviewer's grade stays with it.
  assert.deepEqual(found().map((x) => x.id), p.map((x) => x.id));
});

test('a reviewer\'s grade is kept as theirs, by name, and stands over the proposal', () => {
  const root = tempDir('grades-');
  const p = found();
  const send = p.find((x) => /"Send" changes nothing/.test(x.message));
  assert.throws(() => gradeProblem(root, { prototype: 'checkout', id: send.id, grade: 'Major' }), /say who gives it/);
  assert.throws(() => gradeProblem(root, { prototype: 'checkout', id: send.id, grade: 'Critical', by: 'QA' }), /not a grade/);
  gradeProblem(root, { prototype: 'checkout', id: send.id, grade: 'major', by: 'QA', why: 'Send is stubbed until the API lands' });
  const g = readGrades(root);
  assert.equal(g.length, 1);
  assert.equal(g[0].grade, 'Major');
  const graded = withGrades(p, g, 'checkout');
  assert.deepEqual(gradeCounts(graded), { Blocker: 0, Major: 5, Minor: 2, confirmed: 1, of: 7 });
  // Another prototype's grade is not this one's.
  assert.deepEqual(gradeCounts(withGrades(p, g, 'other')).confirmed, 0);
  const lines = gradeLines(graded, { prototype: 'prototypes/checkout.json' });
  assert.match(lines[0], /0 Blocker · 5 Major · 2 Minor · 1 of 7 confirmed by a reviewer, the rest proposed/);
  assert.ok(lines.some((l) => /Major \(QA, proposed Blocker\)/.test(l)));
  assert.match(lines.at(-1), /--grade prototypes\/checkout\.json <id> <Blocker\|Major\|Minor> --by "<name>"/);
  const rec = checkRecord({ name: 'checkout', file: 'prototypes/checkout.json', problems: graded });
  assert.equal(rec.review.length, 7);
  assert.equal(rec.review.find((x) => x.id === send.id).grade.by, 'QA');
  assert.ok(!('review' in checkRecord({ name: 'x', file: 'x.json' })));
});

test('the grades file is a person\'s decision: the guard holds an agent\'s own edit of it', () => {
  assert.equal(decisionFile(GRADES_FILE), 'grades');
  const grade = (userText) => judge({ tool_name: 'Bash', tool_input: { command: 'rms-design-system-engine --grade prototypes/checkout.json 1a2b3c4d Minor --by "QA"' } }, { userText })?.decision ?? null;
  assert.equal(grade('check the checkout prototype'), 'ask', 'a grade the person did not give');
  assert.equal(grade('the empty state one is minor for this flow'), null);
  // Listing them is only reading.
  assert.equal(judge({ tool_name: 'Bash', tool_input: { command: 'rms-design-system-engine --grade prototypes/checkout.json' } }, { userText: 'what did the review find?' })?.decision ?? null, null);
});

test('--grade lists the problems, keeps a named grade, and refuses one without a name', () => {
  const root = tempDir('grade-cli-');
  mkdirSync(join(root, 'prototypes'), { recursive: true });
  writeFileSync(join(root, 'ds-config.json'), '{}');
  const graded = found();
  writeFileSync(join(root, 'prototypes', 'checkout.check.json'), JSON.stringify(checkRecord({ name: 'checkout', file: 'prototypes/checkout.json', problems: graded })));
  const run = (...a) => spawnSync(process.execPath, [join(HERE, '..', 'audit.mjs'), '--grade', ...a], { cwd: root, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', DESIGN_SYSTEM_ENGINE_NO_AUTO_UPDATE: '1' } });
  const list = run('prototypes/checkout.json');
  assert.equal(list.status, 0, list.stdout + list.stderr);
  assert.match(list.stdout, /UX GRADES {2}1 Blocker · 4 Major · 2 Minor · 0 of 7 confirmed/);
  const id = graded.find((x) => x.source === 'states').id;
  assert.equal(run('prototypes/checkout.json', id, 'Minor').status, 2);
  assert.ok(!existsSync(join(root, GRADES_FILE)));
  const ok = run('prototypes/checkout.json', id, 'Minor', '--by', 'QA', '--why', 'no empty case in this flow');
  assert.equal(ok.status, 0, ok.stdout);
  assert.match(ok.stdout, /graded Minor by QA \(proposed Major\)/);
  assert.equal(readGrades(root)[0].why, 'no empty case in this flow');
  assert.equal(JSON.parse(readFileSync(join(root, 'prototypes', 'checkout.check.json'), 'utf8')).review.find((x) => x.id === id).grade.grade, 'Minor');
  assert.match(run('prototypes/checkout.json', 'ffffffff', 'Minor', '--by', 'QA').stdout, /is not one of/);
});

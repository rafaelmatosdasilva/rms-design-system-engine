// A gap a prototype found reaching the people who decide it. The check kept each one in a file and the Figma to-do
// list could take them, but nothing put them where the team reads documentation: on the run this came from, the
// agent drafted them into the intent layer only after the owner asked twice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gapSubject, gapDraftLine, gapDrafts, gapDraftLines, GAP_SECTION, SYSTEM_SUBJECT } from '../lib/gap-drafts.mjs';

const COMPONENTS = ['Button', 'Chip', 'Dropdown'];

test('a gap belongs to the component it names, and only to one the system has', () => {
  assert.equal(gapSubject({ kind: 'option', need: 'a ghost button', used: 'Button' }, COMPONENTS), 'Button');
  assert.equal(gapSubject({ kind: 'component', need: 'a stepper', closest: 'Chip' }, COMPONENTS), 'Chip');
  // A name the system does not have is not a page: the gap is the system's own.
  assert.equal(gapSubject({ kind: 'component', need: 'a stepper', closest: 'Stepper' }, COMPONENTS), SYSTEM_SUBJECT);
  // Never guessed from the need's words: "a button-like thing" names no page.
  assert.equal(gapSubject({ kind: 'component', need: 'something button-like' }, COMPONENTS), SYSTEM_SUBJECT);
});

test('each kind of gap goes under the section that would answer it', () => {
  assert.equal(GAP_SECTION.option, 'Options');
  assert.equal(GAP_SECTION.token, 'Tokens');
  assert.equal(GAP_SECTION.component, 'When to use');
  // A kind with no section of its own still lands somewhere a team reads.
  const [d] = gapDrafts([{ kind: 'nonsense', need: 'a thing' }], { components: COMPONENTS });
  assert.equal(d.section, 'Guidelines');
});

test('the line says the need, what the prototype did meanwhile, and which prototype asked', () => {
  assert.equal(gapDraftLine({ kind: 'option', need: 'a ghost button', used: 'Button' }, { prototype: 'settings' }),
    'option: a ghost button; the prototype uses Button meanwhile (asked for by the settings prototype)');
  assert.equal(gapDraftLine({ kind: 'component', need: 'a stepper', closest: 'Chip' }),
    'component: a stepper; the closest the system has is Chip');
  assert.equal(gapDraftLine({ need: '   ' }), null, 'a need with no words is no draft');
});

test('gaps are grouped by the page and section they belong to, and the same need twice is one draft', () => {
  const gaps = [
    { kind: 'option', need: 'a ghost button', used: 'Button' },
    { kind: 'option', need: 'a ghost button', used: 'Button' },
    { kind: 'option', need: 'a small chip', used: 'Chip' },
    { kind: 'component', need: 'a stepper' },
  ];
  const drafts = gapDrafts(gaps, { components: COMPONENTS });
  assert.deepEqual(drafts.map((d) => `${d.subject}/${d.section}/${d.lines.length}`),
    ['Button/Options/1', 'Chip/Options/1', 'System/When to use/1']);
});

test('nothing is sent until it is asked for: the intent layer is the team\'s, not the engine\'s', () => {
  const drafts = gapDrafts([{ kind: 'option', need: 'a ghost button', used: 'Button' }], { components: COMPONENTS });
  const waiting = gapDraftLines(drafts).join('\n');
  assert.match(waiting, /1 gap drafted for the team, on 1 page/);
  assert.match(waiting, /Written here only/);
  assert.match(waiting, /--commit/);
  assert.match(gapDraftLines(drafts, { sent: true }).join('\n'), /Sent to the intent layer/);
  // No gaps, nothing said: a clean prototype does not get a report about its drafts.
  assert.deepEqual(gapDraftLines([]), []);
});

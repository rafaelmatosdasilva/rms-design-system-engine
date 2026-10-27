// decisions.mjs - one log of what the team decided, gathered from where each decision was made. Nothing here is
// written by the engine, so every test is about reading and about what an agent is told before it proposes again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decisionsFrom, decisionView, ruledOutLines, decisionsMarkdown, writtenDecisions, gatherDecisions, KINDS } from '../decisions.mjs';
import { makeFixture } from './helpers.mjs';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const sources = () => ({
  kept: [{ key: 'k1', check: 'Structure', what: 'chip height: Figma 36px, code 32px', component: 'chip', reason: 'the product needs the denser row', by: 'QA', at: '2026-10-02T09:00:00Z', truth: 'code' }],
  answered: { 'chip:purpose': { answer: 'no', proposal: 'A chip stands in for a tag', by: 'QA', at: '2026-10-05T09:00:00Z' }, 'field:purpose': { answer: 'yes', proposal: 'A field takes one value', at: '2026-10-06T09:00:00Z' } },
  gaps: [{ need: 'a split button', searched: 'button, menu', why: 'neither opens a list from the main action', at: '2026-10-07T09:00:00Z' }],
  debt: [{ component: 'field', label: 'focus ring differs', reason: 'fixed with the next theme', at: '2026-10-01T09:00:00Z' }],
  checked: [{ name: 'badge', what: 'badge checked against its design', by: 'QA', at: '2026-09-30T09:00:00Z' }],
});

test('every decision in one shape, whatever file it came from, the newest first', () => {
  const all = decisionsFrom(sources());
  assert.equal(all.length, 6);
  assert.deepEqual(all.map((d) => d.kind), ['gap', 'answered', 'answered', 'kept', 'debt', 'checked']);
  assert.equal(all[0].at.startsWith('2026-10-07'), true, 'the newest first');
  // A difference kept on purpose rules out the side the team did not take.
  const kept = all.find((d) => d.kind === 'kept');
  assert.deepEqual(kept.ruledOut, ["Figma's value"]);
  assert.equal(kept.component, 'chip');
  assert.equal(kept.why, 'the product needs the denser row');
  // A proposal answered no is the sharpest: an option somebody looked at and did not want.
  const no = all.find((d) => d.kind === 'answered' && /^No/.test(d.what));
  assert.deepEqual(no.ruledOut, ['A chip stands in for a tag']);
  assert.equal(no.component, 'chip');
  // A yes rules nothing out: it is a decision, not a rejection.
  assert.deepEqual(all.find((d) => /^Yes/.test(d.what)).ruledOut, []);
  // A need nothing fitted: what was looked at is what was ruled out.
  assert.deepEqual(all.find((d) => d.kind === 'gap').ruledOut, ['button', 'menu']);
  assert.equal(decisionsFrom({}).length, 0);
});

test('ruledOutLines: what an agent is told before it proposes the same thing again', () => {
  const view = decisionView(decisionsFrom(sources()));
  const lines = ruledOutLines(view, 'chip');
  assert.equal(lines.length, 2, JSON.stringify(lines));
  assert.match(lines.join('\n'), /decided against: A chip stands in for a tag \(answered, QA, 2026-10-05\)/);
  assert.match(lines.join('\n'), /decided against: Figma's value - the product needs the denser row \(kept on purpose, QA, 2026-10-02\)/);
  // A general decision that names the component reaches it too: a gap rules out what was looked at, everywhere.
  assert.match(ruledOutLines(view, 'menu').join('\n'), /decided against: button, menu/);
  // Accepted debt and a check by hand are decisions, but they rule nothing out: an agent is not told them here.
  assert.deepEqual(ruledOutLines(view, 'field'), []);
  assert.deepEqual(ruledOutLines(view, 'badge'), []);
  assert.deepEqual(ruledOutLines(decisionView([]), 'chip'), []);
  assert.equal(ruledOutLines(view, 'chip', { most: 1 }).length, 1);
});

test('a DECISIONS.md the team wrote is read as one more source, never rewritten', () => {
  const written = writtenDecisions('# Decisions\n\n## chip: one size only\n\nWhy: two sizes made every list look different.\nRuled out: a small chip, a dense chip\n\n## No modal inside a modal\n\nIt traps the keyboard focus twice.\n');
  assert.equal(written.length, 2);
  assert.equal(written[0].component, 'chip');
  assert.deepEqual(written[0].ruledOut, ['a small chip', 'a dense chip']);
  assert.equal(written[0].why, 'two sizes made every list look different.');
  assert.equal(written[1].component, null, 'a heading that names no component is about the system');
  assert.equal(written[1].why, 'It traps the keyboard focus twice.');
  assert.equal(KINDS.written.rules, true);
});

test('the log a person reads: one section per component, then the system as a whole', () => {
  const md = decisionsMarkdown(decisionView(decisionsFrom(sources())));
  assert.match(md, /^# Decisions/);
  assert.match(md, /6 decisions, 3 of them ruling an option out\./);
  assert.match(md, /## chip\n/);
  assert.match(md, /ruled out: button, menu/);
  assert.match(md, /## The system as a whole/);
  assert.match(md, /Why: the product needs the denser row/);
  assert.match(decisionsMarkdown(decisionView([])), /Nothing decided yet\./);
});

test('gathered from where each decision is kept, and a project with none says so', () => {
  const dir = makeFixture('decisions');
  assert.equal(gatherDecisions(dir).total, 0);
  writeFileSync(join(dir, 'design-system-engine-kept.json'), JSON.stringify(sources().kept));
  writeFileSync(join(dir, 'design-system-engine-intent-decisions.json'), JSON.stringify(sources().answered));
  writeFileSync(join(dir, 'DECISIONS.md'), '## chip: one size only\n\nRuled out: a small chip\n');
  const view = gatherDecisions(dir);
  assert.equal(view.total, 4);
  assert.deepEqual(Object.keys(view.byComponent).sort(), ['chip', 'field']);
  assert.equal(view.byComponent.chip.length, 3);
  assert.match(ruledOutLines(view, 'chip').join('\n'), /a small chip/);
});

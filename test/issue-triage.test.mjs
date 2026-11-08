// What happens to an issue once it is sent (issue-triage.mjs, .github/workflows/issues.yml, the issue forms).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { featureParts, OTHER, PART_QUESTION, partLabel, triageLabels, formAnswer, labelsFor, staleOf, replyOf } from '../lib/issue-triage.mjs';

const FORMS = new URL('../.github/ISSUE_TEMPLATE/', import.meta.url);
const forms = readdirSync(FORMS).filter((f) => f.endsWith('.yml') && f !== 'config.yml');
// A form's "Which part" options, as its YAML lists them.
const partOptions = (text) => {
  const block = text.slice(text.indexOf(`label: ${PART_QUESTION}`));
  return [...block.slice(block.indexOf('options:'), block.indexOf('validations:')).matchAll(/^ {8}- (.+)$/gm)].map((m) => m[1]);
};

test('the parts are the features page\'s own, in its order', () => {
  const parts = featureParts();
  assert.equal(parts[0], 'Check your Figma library');
  assert.ok(parts.includes('Publish a living style guide'));
  assert.ok(parts.length >= 10);
  assert.equal(new Set(parts).size, parts.length);
});

test('every form asks which part, with the features page\'s parts and nothing else, so its label exists', () => {
  assert.ok(forms.includes('accessibility.yml'), 'an accessibility barrier has its own form');
  const want = [...featureParts(), ...OTHER];
  for (const f of forms) assert.deepEqual(partOptions(readFileSync(new URL(f, FORMS), 'utf8')), want, `${f}: Which part lists the features page's parts`);
  const names = triageLabels().map(([n]) => n);
  for (const p of [...featureParts(), OTHER[0]]) assert.ok(names.includes(partLabel(p)), `a label for ${p}`);
  assert.ok(names.every((n) => n.length <= 50 && !n.includes(',')), 'GitHub takes a label of 50 characters at most, with no comma');
});

test('a new issue takes needs triage and its part; an edit only the part it now names; nothing twice', () => {
  const body = `### ${PART_QUESTION}\n\nLint your codebase\n\n### What you ran\n\nrms-design-system-engine --audit`;
  assert.deepEqual(labelsFor({ body, labels: [{ name: 'bug' }] }), ['needs triage', 'part: Lint your codebase']);
  assert.deepEqual(labelsFor({ body, labels: ['part: Lint your codebase', 'confirmed'] }, { action: 'edited' }), []);
  assert.deepEqual(labelsFor({ body: `### ${PART_QUESTION}\n\nNot sure` }), ['needs triage'], 'Not sure has no label: triage sets it');
  assert.deepEqual(labelsFor({ body: `### ${PART_QUESTION}\n\nSomething made up` }), ['needs triage'], 'only a part the page has');
  assert.deepEqual(labelsFor({ body: 'written by hand' }), ['needs triage']);
  assert.equal(formAnswer(`### ${PART_QUESTION}\n\n_No response_`), null);
});

test('waiting on the reporter: closed after 14 days with no activity; their reply sends it back to triage, reopened', () => {
  const now = Date.parse('2026-12-01T00:00:00Z');
  assert.deepEqual(staleOf([{ number: 1, updatedAt: '2026-11-10T00:00:00Z' }, { number: 2, updatedAt: '2026-11-25T00:00:00Z' }], { now }), [1]);
  const issue = { number: 7, state: 'closed', user: { login: 'reporter' }, labels: [{ name: 'needs info' }] };
  assert.deepEqual(replyOf({ action: 'created', issue, comment: { user: { login: 'reporter' } } }), { number: 7, reopen: true });
  assert.equal(replyOf({ action: 'created', issue, comment: { user: { login: 'someone-else' } } }), null, 'only the reporter\'s reply');
  assert.equal(replyOf({ action: 'created', issue: { ...issue, labels: [] }, comment: { user: { login: 'reporter' } } }), null, 'only an issue waiting on them');
  assert.equal(replyOf({ action: 'created', issue: { ...issue, pull_request: {} }, comment: { user: { login: 'reporter' } } }), null);
});

test('the workflow runs the module on each event, never the issue\'s text in a shell, and writes issues only', () => {
  const wf = readFileSync(new URL('../.github/workflows/issues.yml', import.meta.url), 'utf8');
  for (const m of ['label "$GITHUB_EVENT_PATH"', 'reply "$GITHUB_EVENT_PATH"', 'issue-triage.mjs sync', 'issue-triage.mjs stale']) assert.ok(wf.includes(m), m);
  assert.doesNotMatch(wf, /github\.event\.(issue|comment)\.(body|title)/, 'the issue\'s text never reaches a shell');
  assert.match(wf, /^permissions:\n {2}contents: read$/m);
  assert.match(wf, /issues: write/);
  assert.doesNotMatch(wf, /contents: write|pull-requests: write/);
  for (const u of wf.match(/uses: \S+/g)) assert.match(u, /@[0-9a-f]{40}$/, `${u} pinned to a commit`);
});

test('CONTRIBUTING says what happens to an issue, with every state and priority label the workflow keeps', () => {
  const c = readFileSync(new URL('../.github/CONTRIBUTING.md', import.meta.url), 'utf8');
  assert.match(c, /^## What happens to your issue$/m);
  for (const [n] of [...triageLabels().filter(([n]) => !n.startsWith('part: '))]) assert.ok(c.includes(`\`${n}\``), `CONTRIBUTING names ${n}`);
});

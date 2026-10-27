// issues.mjs - one issue per difference, never twice, closed when the check stops finding it. Nothing here talks to
// a host: the plan is what a person reads and what a sender carries out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { issuesFor, issuePlan, issueLines, sendIssues, keyLine, keyIn, MARK } from '../issues.mjs';

const findings = () => [
  { check: 'Structure', evidence: 'chip height: Figma 32px, rendered 36px (.chip · theme.css:75)', component: 'chip', difference: true },
  { check: 'Structure', evidence: 'chip radius: Figma 16px, rendered 12px', component: 'chip', difference: true },
  { check: 'Accessibility', evidence: 'text contrast 3.1:1 on the chip label', component: 'chip', difference: false },
];

test('one issue per difference, with its evidence and who acts; what is not a difference is not an issue', () => {
  const want = issuesFor(findings(), { who: 'the design system team' });
  assert.equal(want.length, 2, 'the accessibility line is not a difference');
  assert.match(want[0].title, /^chip: chip height: Figma 32px/);
  assert.match(want[0].body, /\*\*Structure\*\*/);
  assert.match(want[0].body, /Who acts: the design system team/);
  assert.match(want[0].body, /It closes itself when a run no longer finds this difference/);
  // Keyed the way a kept difference is keyed: without the line number, so an edit higher up the file is the same
  // difference and not a second issue.
  assert.equal(want[0].key, 'Structure :: chip height: Figma 32px, rendered 36px (.chip · theme.css)');
  assert.equal(keyIn(want[0].body), want[0].key);
  assert.equal(keyIn('nothing here'), null);
  assert.ok(keyLine('x').includes(MARK));
});

test('a difference the team decided to keep never opens one', () => {
  const want = issuesFor(findings(), { kept: [{ key: 'Structure :: chip height: Figma 32px, rendered 36px (.chip · theme.css)' }] });
  assert.deepEqual(want.map((w) => w.check), ['Structure']);
  assert.match(want[0].title, /radius/);
  // The same difference twice in one run is one issue.
  assert.equal(issuesFor([...findings(), ...findings()]).length, 2);
  assert.deepEqual(issuesFor([]), []);
});

test('never twice, and closed when no run finds it any more', () => {
  const want = issuesFor(findings());
  const open = [
    { iid: 7, title: 'chip radius', body: `text\n${keyLine(want[1].key)}`, state: 'opened' },
    { iid: 9, title: 'something nobody finds now', body: keyLine('Structure :: gone'), state: 'opened' },
    { iid: 11, title: 'closed before', body: keyLine(want[0].key), state: 'closed' },
    { iid: 13, title: "a person's own issue", body: 'nothing of the engine in here', state: 'opened' },
  ];
  const plan = issuePlan(want, open);
  assert.deepEqual(plan.open.map((i) => i.key), [want[0].key], 'the one already open is left alone; a closed one opens again');
  assert.deepEqual(plan.close.map((i) => i.iid), [9]);
  assert.equal(plan.already, 1);
  // An issue a person wrote is never touched: it carries no key of the engine's.
  assert.equal(plan.close.some((i) => i.iid === 13), false);
  // Nothing found, everything open closed.
  assert.deepEqual(issuePlan([], open).close.map((i) => i.iid).sort((a, b) => a - b), [7, 9]);
});

test('what a person reads says what happens next, by what the project allows', () => {
  const plan = issuePlan(issuesFor(findings()), []);
  assert.match(issueLines(plan, { may: 'yes', where: 'acme/ux' })[0], /opened and closed in acme\/ux/);
  assert.match(issueLines(plan, { may: 'ask', where: 'acme/ux' })[0], /once you say yes/);
  assert.match(issueLines(plan, { may: 'no', where: 'acme/ux', why: 'on CI there is nobody to ask' })[0], /a task for whoever owns acme\/ux \(on CI there is nobody to ask\)/);
  assert.match(issueLines(plan, {}).join('\n'), /^ {2}open: chip: chip height/m);
  // Nothing to do says nothing, unless something is already open for what this run found.
  assert.deepEqual(issueLines({ open: [], close: [], already: 0 }), []);
  assert.match(issueLines({ open: [], close: [], already: 2 }, { where: 'acme/ux' })[0], /2 issues already open .* nothing to open or close/);
});

test('the plan carried out: each call its own, and a refusal never stops the rest', async () => {
  const want = issuesFor(findings());
  const plan = issuePlan(want, [{ iid: 9, title: 'gone', body: keyLine('Structure :: gone'), state: 'opened' }]);
  const seen = [];
  const ok = await sendIssues(plan, async (what) => { seen.push(what.do); });
  assert.deepEqual(ok, { opened: 2, closed: 1, failed: [] });
  assert.deepEqual(seen, ['open', 'open', 'close']);
  const half = await sendIssues(plan, async (what) => { if (what.do === 'open') throw new Error('403 no access'); });
  assert.equal(half.opened, 0);
  assert.equal(half.closed, 1, 'a refusal on one never stops the rest');
  assert.equal(half.failed.length, 2);
  assert.match(half.failed[0].why, /403 no access/);
});

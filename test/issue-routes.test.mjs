// issue-routes.mjs - which kind of fix an open issue gets, and who may make it. The route is read from the check,
// never from how bad the finding sounds, and where the engine cannot tell it says a person decides.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROUTES, ROUTE, routeFor, routePlan, routeCounts, routeLines } from '../issue-routes.mjs';
import { issuesFor } from '../issues.mjs';
import { keptKey } from '../kept.mjs';

test('the route comes from the check, not from the words of the finding', () => {
  assert.deepEqual(ROUTES, ['intent', 'code', 'figma', 'person']);
  assert.equal(routeFor({ check: 'Structure', difference: true, side: 'decide' }).route, 'code');
  assert.equal(routeFor({ check: 'Token values', difference: true }).route, 'code');
  assert.equal(routeFor({ check: 'Documentation', difference: true }).route, 'intent');
  assert.equal(routeFor({ check: 'Figma file hygiene', difference: true, side: 'figma' }).route, 'figma');
  // A finding the engine marked as Figma's work is Figma's, whatever its check is called.
  assert.equal(routeFor({ check: 'Structure', difference: true, side: 'figma' }).route, 'figma');
  // Not a difference between the two sides: a person decides, and the reason says so.
  const none = routeFor({ check: 'System health', difference: false });
  assert.equal(none.route, 'person');
  assert.match(none.why, /not a difference between the two sides/);
  // A difference under a check nothing claims: a person decides rather than the engine guessing.
  assert.equal(routeFor({ check: 'Something new', difference: true }).route, 'person');
  assert.match(routeFor({ check: 'Something new', difference: true }).why, /nothing says which side of Something new is right/);
  assert.equal(routeFor({}).route, 'person');
  // Every route names how it is fixed; only a person's names no command.
  for (const r of ROUTES) assert.ok(ROUTE[r].how, r);
  assert.equal(ROUTE.person.cmd, null);
});

test('each open issue is routed against this run, and one nothing finds any more is left alone', () => {
  const findings = [
    { check: 'Structure', evidence: 'chip height: Figma 32px, rendered 36px', component: 'chip', difference: true, side: 'decide' },
    { check: 'Documentation', evidence: 'chip has no page in the intent layer', component: 'chip', difference: true, side: 'decide' },
  ];
  const keyOf = (f) => keptKey(`${f.check} :: ${f.evidence}`);
  const issues = [...issuesFor(findings).map((i, n) => ({ ...i, iid: n + 1 })), { key: 'Structure :: a difference nobody finds now', iid: 9, title: 'gone' }];
  const plan = routePlan(issues, findings, { keyOf, writes: { code: 'ask', engine: 'yes' } });
  assert.equal(plan.length, 2, 'the issue no run finds is already being closed, not routed');
  assert.deepEqual(plan.map((x) => `${x.iid}:${x.route}:${x.may}`), ['1:code:ask', '2:intent:yes']);
  assert.equal(plan[0].component, 'chip');
  assert.deepEqual(routeCounts(plan), { intent: 1, code: 1 });
  // A place the project has not answered reads as ask, never as yes.
  assert.equal(routePlan(issues, findings, { keyOf })[0].may, 'ask');
  assert.deepEqual(routePlan([], findings, { keyOf }), []);
});

test('what a person reads: each kind together, with the command and what the project allows there', () => {
  const findings = [
    { check: 'Structure', evidence: 'a', difference: true }, { check: 'Structure', evidence: 'b', difference: true },
    { check: 'Figma file hygiene', evidence: 'c', difference: true, side: 'figma' },
  ];
  const keyOf = (f) => `${f.check} :: ${f.evidence}`;
  const issues = findings.map((f, i) => ({ key: keyOf(f), iid: i + 1, title: f.evidence }));
  const lines = routeLines(routePlan(issues, findings, { keyOf, writes: { code: 'yes', figma: 'no' } })).join('\n');
  assert.match(lines, /^🛠 {2}3 open issues, by the fix each one needs:/);
  assert.match(lines, /2 for the code: a branch and a merge request in the code project — rms-design-system-engine --component <name> \(this project lets the engine make it\)/);
  assert.match(lines, /1 for the design file: .* \(this project does not let the engine write there: a task for whoever owns it\)/);
  assert.deepEqual(routeLines([]), []);
  // A long list is cut and says it was.
  const many = routePlan(Array.from({ length: 9 }, (_, i) => ({ key: `Structure :: x${i}`, iid: i, title: `x${i}` })), Array.from({ length: 9 }, (_, i) => ({ check: 'Structure', evidence: `x${i}`, difference: true })), { keyOf });
  assert.match(routeLines(many, { most: 2 }).join('\n'), /…and 7 more/);
});

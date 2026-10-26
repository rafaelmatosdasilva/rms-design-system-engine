// handoff.mjs - what a developer needs to build a prototype, on one page. It measures nothing: every number in it
// comes from the check that produced it, because a package that disagreed with the check is worse than none.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handoffPackage, handoffLines } from '../handoff.mjs';

const page = { components: {
  chip: { name: 'chip', tag: 'Chip', file: 'src/components/Chip.vue', props: { size: {}, tone: {} } },
  card: { name: 'card', tag: 'Card', file: null, props: {} },
} };

test('the package says what the page is made of, what the system lacks, and what is unresolved', () => {
  const pkg = handoffPackage({
    name: 'Signup', file: 'prototypes/Signup.vue', syntax: 'vue',
    used: { chip: 3, card: 1 },
    gaps: [{ need: 'a password field that can show its text', closest: 'input', why: 'nothing in the system reveals it' }],
    findings: [
      { level: 'error', line: 12, message: 'chip has no prop "colour"', kind: 'prop' },
      { level: 'warning', line: 30, message: 'two actions of equal weight', kind: 'habit' },
    ],
    page, request: 'a sign-up page with a password field', links: [{ to: 'Welcome', label: 'Continue' }],
  });

  assert.deepEqual(pkg.components.map((c) => [c.name, c.times]), [['chip', 3], ['card', 1]], 'most used first');
  assert.equal(pkg.components[0].file, 'src/components/Chip.vue');
  assert.deepEqual(pkg.components[0].props, ['size', 'tone'], 'sorted, so two packages of the same page read the same');
  // A component the check knows but cannot place is said so, not left blank: those are different things.
  assert.equal(pkg.components[1].file, null);
  assert.equal(pkg.ready, false, 'an error means it is not ready');
  assert.equal(pkg.open.length, 1);
  assert.equal(pkg.advisory.length, 1, 'a warning is not what stops it being built');

  const md = handoffLines(pkg).join('\n');
  // It opens with what it is made of: a list of problems first reads as a page not worth building.
  assert.ok(md.indexOf('What it is made of') < md.indexOf('Still unresolved'));
  assert.match(md, /\| chip \| 3× \| `<Chip>` \| `src\/components\/Chip\.vue` \|/);
  assert.match(md, /\*not found in the code\*/);
  assert.match(md, /a password field that can show its text/);
  assert.match(md, /"Continue" → Welcome/);
  assert.match(md, /a sign-up page with a password field/);
});

test('a page with nothing of the system says that, and a clean one says it is ready', () => {
  const none = handoffPackage({ name: 'Blank', file: 'prototypes/Blank.vue', used: {}, page });
  assert.match(handoffLines(none).join('\n'), /every part of this page was written by hand, which is itself the finding/);

  const clean = handoffPackage({ name: 'Ok', file: 'prototypes/Ok.vue', used: { chip: 1 }, page, findings: [] });
  assert.equal(clean.ready, true);
  const md = handoffLines(clean).join('\n');
  assert.match(md, /Nothing is unresolved in it/);
  assert.doesNotMatch(md, /Still unresolved/);
  assert.doesNotMatch(md, /What the system does not have/, 'no empty sections');
});

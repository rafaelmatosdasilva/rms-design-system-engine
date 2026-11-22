// Copy held to the content guidance a team writes in its intent layer (content-guidance.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contentGuidance, copyFindings, textsOfTree, ruleOf, textsOfMarkup, copyCheck } from '../lib/content-guidance.mjs';

// An invented team's intent layer: a content page, a component page with a writing section, and a page about nothing of
// the kind.
const intent = { entities: [
  { name: 'Content', kind: 'foundation', layer: 'foundations', rules: [{ text: 'Use "sign in", not "log in".' }, { text: 'Avoid "please" and "simply".' }, { text: 'Buttons start with a verb.' }, { text: 'Errors never blame the person.' }, { text: 'Write in sentence case.' }, { text: 'Sound like a helpful colleague.' }] },
  { name: 'Dialog', kind: 'component', layer: 'components', rules: [{ text: 'A dialog has one main action.' }], sections: [{ title: 'Writing', text: 'Never write "oops".' }] },
  { name: 'Grid', kind: 'foundation', layer: 'foundations', rules: [{ text: 'Use 12 columns.' }] },
] };

test('the lines a check can hold become rules, in the team\'s words and with their page; the rest is said, never guessed', () => {
  const { rules, unread } = contentGuidance(intent);
  assert.deepEqual(rules.map((r) => [r.kind, r.page]), [['term', 'Content'], ['term', 'Content'], ['verb', 'Content'], ['blame', 'Content'], ['case', 'Content'], ['term', 'Dialog']]);
  assert.deepEqual(rules[0].avoid, ['log in']);
  assert.equal(rules[0].use, 'sign in');
  assert.deepEqual(rules[1].avoid, ['please', 'simply']);
  assert.deepEqual(unread.map((u) => u.text), ['Sound like a helpful colleague.'], 'a voice no check can hold is listed as such');
  assert.ok(!rules.some((r) => r.page === 'Grid') && !unread.some((u) => u.page === 'Grid'), 'a page about something else is not content guidance');
  assert.equal(ruleOf('Prefer "save" over "submit"').use, 'save');
});

test('a prototype\'s copy held to them: each finding names the rule and the page it comes from', () => {
  const tree = { component: 'Page', children: [
    { component: 'ButtonPrimary', props: { label: 'Log in' } },
    { component: 'Button', props: { label: 'Your account' } },
    { component: 'ErrorMessage', props: { text: 'You entered an invalid email' } },
    { component: 'Heading', props: { text: 'Recent Orders Overview' } },
    { component: 'Text', props: { text: 'Please wait' } },
    { component: 'Button', props: { label: 'Save changes' } },
  ] };
  const texts = textsOfTree(tree);
  assert.deepEqual(texts.map((t) => [t.text, t.role]).slice(0, 3), [['Log in', 'button'], ['Your account', 'button'], ['You entered an invalid email', 'error']]);
  const found = copyFindings(texts, contentGuidance(intent).rules);
  const said = found.map((f) => f.message);
  assert.ok(said.some((m) => /"Log in" says "log in", which Content says to avoid: say "sign in"/.test(m)));
  assert.ok(said.some((m) => /the button "Your account" does not start with a verb/.test(m)));
  assert.ok(said.some((m) => /the error "You entered an invalid email" blames the person/.test(m)));
  assert.ok(said.some((m) => /"Recent Orders Overview" is in title case/.test(m)));
  assert.ok(said.some((m) => /"Please wait" says "please"/.test(m)));
  assert.ok(!said.some((m) => /Save changes/.test(m)), 'a verb, in sentence case, with no term to avoid, is clean');
  assert.ok(found.every((f) => f.page && f.rule), 'each names where it comes from');
});

test('a code page\'s copy is read from its markup, and the check says what it held the copy to', () => {
  const src = '<template><Card title="Recent Orders Overview"><Button label="Log in" /><a href="/x">Your account</a></Card></template><script>const t = "Log in";</script>';
  const texts = textsOfMarkup(src);
  assert.deepEqual(texts.map((t) => [t.text, t.role]), [['Recent Orders Overview', 'text'], ['Log in', 'button'], ['Your account', 'button']], 'the words a component shows, never the script');
  const c = copyCheck(intent, texts);
  assert.ok(c.findings.length >= 3);
  assert.match(c.lines[0], /COPY {2}held to 6 rules of the content guidance \(Content, Dialog\): \d/);
  assert.ok(c.lines.some((l) => /no check reads/.test(l)), 'what no check reads is said for whoever reviews the copy');
  assert.deepEqual(copyCheck({ entities: [intent.entities[2]] }, texts), { rules: [], unread: [], findings: [], lines: [] }, 'with no content guidance it says nothing');
});

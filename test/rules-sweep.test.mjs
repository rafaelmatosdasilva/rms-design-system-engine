// rules-sweep.mjs - the rules the agent reads, held against each other: a pair that cannot both be followed, a rule
// said twice in two places, and a rule that is advice rather than something a check can read. Nothing is rewritten
// here, so every test is about what a person is handed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rulesRead, forceOf, countOf, contradictions, saidTwice, namesNothing, sweepRules, sweepLines } from '../rules-sweep.mjs';

const ctx = () => ({
  rules: [
    { title: 'Buttons', text: 'Every screen has exactly one primary button for its main action.\nNever write a colour by hand; take it from the scales.' },
    { title: 'Tone', text: 'Write in the voice of a helpful colleague, warm but never chatty.' },
    { title: 'Spacing (tokens)', kind: 'token', text: 'The spacing scale runs 4, 8, 12, 16.' },
  ],
  components: {
    button: {
      guidelines: 'A screen may carry several primary buttons when each acts on its own section.',
      mistakes: ['A destructive action behind a primary button.'],
      limitations: [], donts: [], notFor: null,
      never: [{ sentence: 'Common mistake: A destructive action behind a primary button.', clause: 'A destructive action behind a primary button.' }],
      intentLayer: { rules: ['A destructive action always sits behind a primary button.'], mistakes: [], limitations: [], whenNotToUse: [], whenToUse: [] },
    },
    searchField: { guidelines: null, mistakes: [], limitations: [], donts: [], notFor: null, never: [], intentLayer: null },
  },
  limits: [],
  inside: [
    { component: 'searchField', within: ['toolbar'], sentence: '`searchField` only inside the `toolbar`.', from: 'Patterns' },
    { component: 'searchField', within: ['header'], sentence: 'Place `searchField` only inside the `header`.', from: "searchField's page" },
  ],
});

test('rulesRead: one rule a sentence, from the product, the usage and the intent layer page; a heading is not a rule', () => {
  const read = rulesRead(ctx());
  assert.ok(read.length >= 6, `read ${read.length}`);
  // A token page is the scales, not prose the agent is held to.
  assert.equal(read.some((r) => r.from.startsWith('Spacing')), false);
  const own = read.filter((r) => r.about === 'button');
  assert.deepEqual([...new Set(own.map((r) => r.from))].sort(), ["button's intent layer page", "button's usage", "button, the team's guidelines"]);
  // A sentence is kept as written, with the label that says what kind of line it is.
  assert.ok(own.some((r) => r.text === 'Common mistake: A destructive action behind a primary button.' && r.force === 'no'));
  // Nothing of substance is dropped, and nothing that says nothing is kept.
  assert.equal(rulesRead({ rules: [{ title: 'x', text: '## Heading\n- ok\nA button carries one action.' }] }).map((r) => r.text).join('|'), 'A button carries one action.');
});

test('forceOf and countOf read what is written, not what is meant', () => {
  assert.equal(forceOf('Never put it in a toolbar.'), 'no');
  assert.equal(forceOf("Don't: two of them in a row"), 'no');
  assert.equal(forceOf('Use when: the page has one action'), 'yes');
  assert.equal(forceOf('Put it in the toolbar.'), 'yes');
  assert.equal(countOf('Exactly one per screen.'), 'one');
  assert.equal(countOf('Several, one to a section.'), 'many');
  assert.equal(countOf('A button carries the action.'), null, 'an article is not a count');
});

test('contradictions: opposite words, two counts, and two places it may only go', () => {
  const found = contradictions(ctx());
  const why = (w) => found.filter((c) => c.why === w);
  // One rule says a destructive action always sits behind a primary button; the usage calls that the mistake.
  const words = why('words');
  assert.equal(words.length, 1, JSON.stringify(words));
  assert.equal(words[0].about, 'button');
  assert.match(words[0].said.text, /always sits behind/);
  assert.match(words[0].against.text, /Common mistake/);
  // Exactly one against several, whatever else the two sentences say.
  assert.equal(why('count').length, 1);
  assert.match(why('count')[0].said.text, /exactly one/);
  // Only inside the toolbar, and only inside the header.
  assert.equal(why('place').length, 1);
  assert.equal(why('place')[0].about, 'searchField');
  // A place a component may go, said without "only", rules nothing out and is no contradiction.
  const may = { ...ctx(), inside: [{ component: 'searchField', within: ['toolbar'], sentence: '`searchField` may sit inside the `toolbar`.', from: 'Patterns' }, { component: 'searchField', within: ['header'], sentence: '`searchField` may sit inside the `header`.', from: 'Patterns' }] };
  assert.deepEqual(contradictions(may).filter((c) => c.why === 'place'), []);
});

test('saidTwice: the same rule in two places, the fuller sentence kept; two rules that merely share words are not a repeat', () => {
  const twice = saidTwice({
    rules: [{ title: 'Dialogs', text: 'A dialog traps the keyboard focus until it closes.' }],
    components: { dialog: { guidelines: 'A dialog traps keyboard focus until it is closed.', mistakes: [], limitations: [], donts: [], notFor: null, never: [], intentLayer: null } },
  });
  assert.equal(twice.length, 1, JSON.stringify(twice));
  assert.equal(twice[0].about, 'dialog');
  assert.match(twice[0].kept.text, /keyboard focus/);
  // Alike in subject but not the same rule: shared words alone are not a repeat.
  assert.deepEqual(saidTwice(ctx()).filter((t) => /exactly one/.test(t.kept.text) || /exactly one/.test(t.repeat.text)), []);
});

test("the project's instruction file for agents is read for what it says about the system, and nothing else", () => {
  const agents = [{ file: 'AGENTS.md', text: 'Run the unit tests before every commit.\nNever ship a console.log.\nA destructive action is never put behind a primary button.\nUse pnpm, not npm, to install anything.' }];
  const read = rulesRead(ctx(), { agents });
  const own = read.filter((r) => r.agent);
  assert.deepEqual(own.map((r) => r.text), ['A destructive action is never put behind a primary button.'], 'only what names the system is read');
  assert.equal(own[0].from, 'AGENTS.md');
  // And it is read against what the design system says: the intent layer page says the opposite.
  const clash = contradictions(ctx(), { agents }).filter((c) => c.said.agent || c.against.agent);
  assert.equal(clash.length, 1, JSON.stringify(clash));
  assert.equal(clash[0].about, 'button');
  // A rule of the project is never listed as advice to place: the sweep does not own that file.
  assert.equal(namesNothing(ctx()).some((n) => n.from === 'AGENTS.md'), false);
});

test('namesNothing: advice is told from a rule by what it names, never by how it is written', () => {
  const nothing = namesNothing(ctx()).map((n) => n.text);
  assert.deepEqual(nothing, ['Write in the voice of a helpful colleague, warm but never chatty.']);
  // A rule about the system's own furniture is a rule, even with no component and no backticks in it.
  assert.deepEqual(namesNothing({ rules: [{ title: 'Colour', text: 'Never write a colour by hand; take it from the scales.' }] }), []);
  // So is one a check already reads.
  assert.deepEqual(namesNothing({ rules: [{ title: 'Toasts', text: 'A message to the person is never left on the screen for good.' }], limits: [{ sentence: 'A message to the person is never left on the screen for good.' }] }), []);
});

test('the tiers settle what they can: a product narrowing the system is not a decision anybody owes', () => {
  const agents = [{ file: 'AGENTS.md', text: 'A destructive action is never put behind a primary button.' }];
  const all = contradictions(ctx(), { agents });
  const across = all.find((c) => c.said.agent || c.against.agent);
  assert.ok(across.settled, 'written in two tiers, so the ladder says which holds');
  assert.equal(across.settled.from, 'AGENTS.md', "the product's own rule wins");
  // Two rules of the system's own tier are the ones nobody has decided.
  const inside = all.find((c) => c.why === 'count');
  assert.equal(inside.settled, null);
  const s = sweepRules(ctx(), { agents });
  assert.equal(s.contradictions.every((c) => !c.settled), true, 'only the undecided ones are listed to settle');
  assert.equal(s.narrowed.every((c) => !!c.settled), true);
  assert.match(sweepLines(s).join('\n'), /disagree across tiers, and the ladder settles each/);
});

test('sweepLines: each pair with both sentences and where each came from; nothing to settle says so', () => {
  const lines = sweepLines(sweepRules(ctx()));
  const all = lines.join('\n');
  assert.match(lines[0], /^📖 \d+ rules are in front of the agent/);
  assert.match(all, /cannot both be followed/);
  assert.match(all, /\(button's intent layer page\)/, 'where a rule came from is on its line');
  assert.match(all, /two counts of the same component/);
  assert.match(all, /advice the agent carries into every request/);
  assert.equal(sweepLines({ read: 0 }).length, 0, 'a system with no rules written has nothing to sweep');
  assert.match(sweepLines({ read: 4, contradictions: [], twice: [], nothing: [] }).join('\n'), /nothing to settle/);
  // Long lists are cut, and say they were.
  const many = { read: 40, contradictions: [], twice: [], nothing: Array.from({ length: 20 }, (_, i) => ({ text: `Advice number ${i}.`, from: 'Tone' })) };
  assert.match(sweepLines(many, { most: 3 }).join('\n'), /…and 17 more/);
});

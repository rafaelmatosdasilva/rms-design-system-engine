// rule-tiers.mjs - the rules an agent reads, from the most general to the most specific, and the one line that says
// which wins. A rule is placed by where it was written, never by what it says, so the tests are about sources.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TIERS, TIER_SAID, tierOf, byTier, beats, ladderLine } from '../rule-tiers.mjs';
import { ruleLines } from '../prototype-context.mjs';
import { ENGINE_RULES, rulesSection } from '../agent-rules.mjs';

test('tierOf: by the layer it was written in, the file it came from, else the system that owns the words', () => {
  assert.deepEqual(TIERS, ['universal', 'system', 'product']);
  assert.equal(tierOf({ layer: 'pages' }), 'product');
  assert.equal(tierOf({ layer: 'flows' }), 'product');
  assert.equal(tierOf({ layer: 'patterns' }), 'system');
  assert.equal(tierOf({ layer: 'foundations' }), 'system');
  assert.equal(tierOf({ agent: true, from: 'AGENTS.md' }), 'product', "the project's own instruction file is the product's");
  assert.equal(tierOf({ tier: 'universal' }), 'universal', 'a rule that says its own tier keeps it');
  // Read back from a file with no layer stamped on it, its title still says which layer it is from.
  assert.equal(tierOf({ title: 'Checkout (pages, intent layer)' }), 'product');
  assert.equal(tierOf({ title: 'Cards (patterns, intent layer)' }), 'system');
  // The team's own guidelines carry no layer: they are the system's.
  assert.equal(tierOf({ title: 'Buttons' }), 'system');
});

test('byTier and beats: the more specific wins, and two of one tier settle nothing', () => {
  const rules = [{ title: 'a', layer: 'pages' }, { title: 'b', layer: 'patterns' }, { title: 'c', tier: 'universal' }];
  assert.deepEqual(byTier(rules).map((t) => t.tier), ['universal', 'system', 'product'], 'in order, the most general first');
  assert.deepEqual(byTier(rules).map((t) => t.rules.length), [1, 1, 1]);
  assert.deepEqual(byTier([{ title: 'b' }]).map((t) => t.tier), ['system'], 'a tier with nothing in it is left out');
  assert.equal(beats(rules[0], rules[1]), rules[0], "a product's rule beats the system's");
  assert.equal(beats(rules[1], rules[2]), rules[1], "the system's beats the engine's own");
  assert.equal(beats(rules[1], { title: 'd' }), null, 'two written with the same authority settle nothing');
  assert.equal(beats(rules[1], rules[0]), rules[0], 'which one is asked first changes nothing');
});

test('ladderLine names only the tiers in front of the agent', () => {
  assert.match(ladderLine(['system', 'product']), /the more specific one wins/);
  assert.equal(ladderLine(['system', 'product']).includes(TIER_SAID.universal.toLowerCase()), false);
  assert.match(ladderLine(), /engine's own/);
});

test("ruleLines: in tiers when there is more than one, as it always read when there is one", () => {
  const ctx = { rules: [{ title: 'Colour', text: 'Take every colour from the scales.', layer: 'foundations' }, { title: 'Checkout (pages, intent layer)', text: 'The pay button is the only primary button.', layer: 'pages' }] };
  const lines = ruleLines(ctx);
  assert.match(lines[0], /the more specific one wins/);
  assert.equal(lines[1].trim(), TIER_SAID.system + ':');
  assert.match(lines[2], /^ {4}Colour:/);
  assert.equal(lines[3].trim(), TIER_SAID.product + ':');
  // One tier only: no heading to tell apart, so nothing is added to what the agent reads.
  assert.deepEqual(ruleLines({ rules: [ctx.rules[0]] }), ['  Colour: Take every colour from the scales.']);
});

test("the engine's own rules are one list, written into the project's instruction file and named as the first tier", () => {
  assert.ok(ENGINE_RULES.length >= 4);
  for (const r of ENGINE_RULES) assert.ok(rulesSection().includes(`- ${r}`), `missing from the section: ${r}`);
});

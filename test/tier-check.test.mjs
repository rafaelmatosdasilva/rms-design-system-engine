// tier-check.mjs - project-DECLARED tier validation (I10b). Rules come only from ds-config.tiers;
// it flags a token that aliases a tier its mayReference list disallows. Never imposes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyTier, checkTiers } from '../tier-check.mjs';

const tiers = [
  { name: 'primitive', match: '^primitives/' },
  { name: 'semantic',  match: '^semantic/',  mayReference: ['primitive'] },
  { name: 'component', match: '.',           mayReference: ['semantic', 'primitive'] },   // catch-all LAST
];

test('classifyTier returns the first matching tier (catch-all last)', () => {
  assert.equal(classifyTier('primitives/neutral-0', tiers), 'primitive');
  assert.equal(classifyTier('semantic/bg', tiers), 'semantic');
  assert.equal(classifyTier('button/label', tiers), 'component');
});

test('checkTiers flags a disallowed cross-tier reference, allows a permitted one', () => {
  const tokens = ['semantic/bg', 'semantic/fg', 'primitives/neutral-0', 'button/label'];
  const aliases = {
    'semantic/bg': ['primitives/neutral-0'],   // semantic → primitive: allowed
    'semantic/fg': ['button/label'],            // semantic → component: NOT allowed
  };
  const { violations, classified } = checkTiers(tokens, (t) => aliases[t] || [], tiers);
  assert.equal(violations.length, 1, JSON.stringify(violations));
  assert.equal(violations[0].token, 'semantic/fg');
  assert.equal(violations[0].refTier, 'component');
  assert.equal(classified.semantic, 2);
  assert.equal(classified.primitive, 1);
});

test('no tiers / no reference rule = no violations (never imposes)', () => {
  assert.deepEqual(checkTiers(['a/b'], () => ['x/y'], []).violations, []);
  // a tier with no mayReference declares no rule → nothing is flagged
  const loose = [{ name: 'any', match: '.' }];
  assert.deepEqual(checkTiers(['a/b'], () => ['x/y'], loose).violations, []);
});

test('L3: with layers, each points at the one before it; a skipped layer or a backward alias is flagged', () => {
  const layered = [
    { name: 'primitive', match: '^primitives/', layer: 1 },
    { name: 'semantic',  match: '^semantic/',  layer: 2 },
    { name: 'component', match: '.',           layer: 3 },
  ];
  const aliases = {
    'semantic/bg': ['primitives/neutral-0'],    // one layer down
    'semantic/bg-raised': ['semantic/bg'],      // within its layer
    'button/bg': ['semantic/bg'],               // one layer down
    'button/label': ['primitives/neutral-900'], // skips the semantic layer
    'semantic/fg': ['button/label'],            // points back at a later layer
  };
  const tokens = Object.keys(aliases);
  const { violations } = checkTiers(tokens, (t) => aliases[t] || [], layered);
  assert.deepEqual(violations.map((v) => [v.token, v.kind, v.reason]), [
    ['button/label', 'skipped', 'a component token skips the semantic layer, straight to a primitive token'],
    ['semantic/fg', 'backward', 'a semantic token points back at a component token, a later layer'],
  ]);
  // mayReference still decides first, and a tier with no layer is never judged on order.
  const mixed = [{ name: 'primitive', match: '^primitives/', layer: 1 }, { name: 'semantic', match: '^semantic/', mayReference: ['primitive'] }, { name: 'component', match: '.', layer: 3 }];
  assert.deepEqual(checkTiers(['button/label', 'semantic/fg'], (t) => aliases[t] || [], mixed).violations.map((v) => [v.token, v.kind ?? 'mayReference']), [['button/label', 'skipped'], ['semantic/fg', 'mayReference']]);
});

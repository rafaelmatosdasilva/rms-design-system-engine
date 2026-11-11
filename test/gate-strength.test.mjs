// What each gate actually is, and where it can be gone around. Every gate is already tried against a fault on
// purpose (planted-faults.test.mjs), which says a gate works - not what it is. The same finding is advice on one
// project and a refused merge on the next, decided by a setting nobody wrote down.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ADVICE, STOPS, SWITCHES, SWITCH_KEYS, hardening, weakening, switchState, switchStates, switchesIn, switchesInEngine, strengthLines, SELF } from '../lib/gate-strength.mjs';

test('the table names every switch the engine reads, and no switch it does not', () => {
  // Read from the code, never asserted beside it: a new switch cannot be added quietly, and one deleted cannot be
  // left here describing something that is gone.
  const found = switchesInEngine();
  assert.deepEqual([...found.keys()].filter((k) => !SWITCH_KEYS.includes(k)), [], 'in the code, missing from the table');
  assert.deepEqual(SWITCH_KEYS.filter((k) => !found.has(k)), [], 'in the table, gone from the code');
  for (const [k, kind] of found) assert.equal(SWITCHES[k].kind, kind, `${k} leans the other way in the code`);
  assert.ok(found.size >= 10, `${found.size} switches found — the walk read nothing like the whole of lib/`);
});

test('this file is left out of its own walk, or the table would be true by construction', () => {
  assert.equal(SELF, 'gate-strength.mjs');
  // It names every switch in order to describe them; counting itself would make the check meaningless.
  const self = switchesIn(`const a = cfg.madeUpStrict === true;`);
  assert.deepEqual([...self.keys()], ['madeUpStrict'], 'the reader itself still reads a real line');
  assert.ok(!switchesInEngine().has('madeUpStrict'));
});

test('the code spells the same question several ways, and only one of them means on by default', () => {
  assert.equal(switchesIn('const S = cfg.aStrict === true;').get('aStrict'), 'harden');
  assert.equal(switchesIn('const S = !!cfg.bStrict;').get('bStrict'), 'harden');
  assert.equal(switchesIn('if (cfg.cStrict && thing) fail();').get('cStrict'), 'harden');
  assert.equal(switchesIn('x(`${cfg.dStrict ? "" : " - advisory"}`)').get('dStrict'), 'harden');
  // The one that is on unless a team turns it off.
  assert.equal(switchesIn('const S = cfg.eStrict !== false;').get('eStrict'), 'weaken');
  // A comment is not a reading, or this module's own prose would count as code.
  assert.equal(switchesIn('// cfg.fStrict === true makes it fail\nconst x = 1;').size, 0);
});

test('a hardening switch is advice until it is asked for; a weakening one stops the merge until it is not', () => {
  const h = hardening()[0], w = weakening()[0];
  assert.ok(h && w, 'the engine has both kinds');
  // Off by default: the finding prints and the gate passes.
  assert.equal(switchState(h, {}).strength, ADVICE);
  assert.equal(switchState(h, {}).toHarden, `${h}: true`);
  assert.equal(switchState(h, { [h]: true }).strength, STOPS);
  // On by default: the finding fails the run, and the setting is the way around it.
  assert.equal(switchState(w, {}).strength, STOPS);
  assert.equal(switchState(w, {}).around, `${w}: false`);
  assert.equal(switchState(w, { [w]: false }).strength, ADVICE);
  assert.equal(switchState('nothingLikeThis', {}), null);
});

test('every switch says what it decides, in words a person would recognise on a run', () => {
  for (const k of SWITCH_KEYS) {
    const s = SWITCHES[k];
    assert.ok(['harden', 'weaken'].includes(s.kind), k);
    assert.ok(s.about && s.about.length > 15, `${k} does not say what it decides`);
    assert.doesNotMatch(s.about, /Strict/, `${k} explains itself with its own name`);
  }
});

test('a run says which of its checks would actually have stopped it', () => {
  // Read on a default project: most switched checks are advice, and a person planning around them should know.
  const plain = strengthLines({}).join('\n');
  assert.match(plain, /^Gates: \d+ of \d+ switched checks stop the merge here; \d+ are advice\./m);
  assert.match(plain, /advice only: .* — \w+Strict: true to make it stop the merge/);
  assert.match(plain, /stops the merge: .* — \w+Strict: false to make it advice/);
  // Everything turned on: nothing is advice, and the count says so.
  const all = Object.fromEntries(SWITCH_KEYS.map((k) => [k, true]));
  const strict = strengthLines(all);
  assert.match(strict[0], new RegExp(`Gates: ${SWITCH_KEYS.length} of ${SWITCH_KEYS.length} switched checks stop the merge here; 0 are advice`));
  assert.ok(!strict.some((l) => /advice only/.test(l)));
  // Each switch is accounted for exactly once, whatever the configuration.
  assert.equal(switchStates({}).length, SWITCH_KEYS.length);
});

// styleguide-gen.mjs reads from hosts that are not always reachable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// A host the engine reads from, unreachable. Found on a real project off its VPN: `--prototype --catalog` died
// with a raw Node stack trace, while six other reads of the same unreachable host printed a warning and carried
// on. The person had to pass --offline, which means knowing in advance the thing the engine had already found out
// six times on that same run.
test('a read that cannot reach its host is caught, like the ones beside it', () => {
  const src = readFileSync(new URL('../lib/styleguide-gen.mjs', import.meta.url), 'utf8');
  // Every call that takes `offline` has to survive the host simply being unreachable: taking the option is not
  // the same as handling the failure, and these three took it and threw.
  for (const call of ['themeCssOnRun', 'inputsOnRun', 'tokenOwner']) {
    const at = src.indexOf(call);
    assert.ok(at > 0, `${call} is gone: this test has to move with it`);
    const stanza = src.slice(at, at + 220);
    assert.match(stanza, /\.catch\(/, `${call} takes offline and still throws when the host is unreachable`);
  }
  // And the two that feed `.lines` and `.stop` give back that shape rather than null, or the catch moves the
  // crash two lines down instead of removing it.
  for (const call of ['themeCssOnRun', 'inputsOnRun']) {
    const at = src.indexOf(call);
    assert.match(src.slice(at, at + 220), /catch\(\(\) => \(\{ lines: \[\], stop: false \}\)\)/, `${call} catches to the wrong shape`);
  }
});

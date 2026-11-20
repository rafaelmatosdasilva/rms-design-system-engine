import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firefoxLeftovers } from '../lib/bidi.mjs';

// Found on one computer: 15 headless Firefoxes and 1165 profile folders left by stopped test runs, and a new Firefox
// that would not answer beside them. A profile carries its run's pid: a dead run's is swept with its browser and the
// processes that browser started, a live run's is left. An old-style profile (no pid) is swept when nothing uses it or
// its browser was adopted by the system (pid 1), and one a live parent still holds is left.
test('Firefox profiles a dead run left are swept with their browser, a live run\'s are left', () => {
  const base = '/tmp/x';
  const ps = () => [
    '  101     1 /Applications/Firefox --headless --no-remote --remote-debugging-port=0 --profile /tmp/x/engine-firefox-700-Ab12Cd',
    '  102   101 /Applications/Firefox plugin-container -isForBrowser -prefsHandle 0:1',
    '  201   555 /Applications/Firefox --headless --no-remote --remote-debugging-port=0 --profile /tmp/x/engine-firefox-555-Zz99Yy',
    '  301     1 /Applications/Firefox --headless --no-remote --remote-debugging-port=0 --profile /tmp/x/engine-firefox-w1cI1R',
    '  302   301 /Applications/Firefox crashhelper 301',
    '  401   900 /Applications/Firefox --headless --no-remote --remote-debugging-port=0 --profile /tmp/x/engine-firefox-Qq11Ww',
    '  501     1 /Applications/Firefox --profile /tmp/x/my-own-profile',
  ].join('\n');
  const list = () => ['engine-firefox-700-Ab12Cd', 'engine-firefox-555-Zz99Yy', 'engine-firefox-w1cI1R', 'engine-firefox-Qq11Ww', 'engine-firefox-Mm22Nn', 'engine-firefox-42-Kk33Ll', 'my-own-profile'];
  const alive = (pid) => pid === 555;
  assert.deepEqual(firefoxLeftovers(base, { ps, list, alive, self: 42 }), [
    { dir: '/tmp/x/engine-firefox-700-Ab12Cd', pids: [101, 102] },
    { dir: '/tmp/x/engine-firefox-w1cI1R', pids: [301, 302] },
    { dir: '/tmp/x/engine-firefox-Mm22Nn', pids: [] },
  ]);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { legacyOrphans } from '../lib/cdp.mjs';

// A browser on an old-style profile whose run is gone is swept with its helpers; one whose run is alive is left, and a
// profile nothing uses is only deleted. A run is gone when its browser was handed to pid 1 (macOS and Linux) or its
// parent is no longer running (Windows, which leaves an orphan its dead parent's id).
test('old-style profiles: an orphaned browser is swept, a live run\'s is left, an unused folder is deleted', () => {
  const base = join('/tmp', 'x'), at = (n) => join(base, n);
  const ps = () => [
    `  101     1 /Applications/Chrome --headless=new --user-data-dir=${at('a11y-check-Ab12Cd')} about:blank`,
    `  102   101 /Applications/Chrome Helper --type=renderer --user-data-dir=${at('a11y-check-Ab12Cd')}`,
    '  555     1 node a-run-still-going.mjs',
    `  201   555 /Applications/Chrome --headless=new --user-data-dir=${at('code-capture-Zz99Yy')} about:blank`,
    `  401   900 /Applications/Chrome --headless=new --user-data-dir=${at('visual-diff-Rr22Tt')} about:blank`,
    `  301     1 /Applications/Chrome --user-data-dir=${at('my-own-profile')}`,
  ].join('\r\n');
  const list = () => ['a11y-check-Ab12Cd', 'code-capture-Zz99Yy', 'visual-diff-Rr22Tt', 'visual-diff-Qq11Ww', 'my-own-profile', 'rms-chrome-5-a11y-check-Aa11Bb'];
  assert.deepEqual(legacyOrphans(base, { ps, list }), [
    { dir: at('a11y-check-Ab12Cd'), pids: [101, 102] },
    { dir: at('visual-diff-Rr22Tt'), pids: [401] },
    { dir: at('visual-diff-Qq11Ww'), pids: [] },
  ]);
});

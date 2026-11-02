import { test } from 'node:test';
import assert from 'node:assert/strict';
import { legacyOrphans } from '../lib/cdp.mjs';

// A browser on an old-style profile whose run is gone (its parent is pid 1) is swept with its helpers; one whose run is
// alive is left, and a profile nothing uses is only deleted.
test('old-style profiles: an orphaned browser is swept, a live run\'s is left, an unused folder is deleted', () => {
  const base = '/tmp/x';
  const ps = () => [
    '  101     1 /Applications/Chrome --headless=new --user-data-dir=/tmp/x/a11y-check-Ab12Cd about:blank',
    '  102   101 /Applications/Chrome Helper --type=renderer --user-data-dir=/tmp/x/a11y-check-Ab12Cd',
    '  201   555 /Applications/Chrome --headless=new --user-data-dir=/tmp/x/code-capture-Zz99Yy about:blank',
    '  301     1 /Applications/Chrome --user-data-dir=/tmp/x/my-own-profile',
  ].join('\n');
  const list = () => ['a11y-check-Ab12Cd', 'code-capture-Zz99Yy', 'visual-diff-Qq11Ww', 'my-own-profile', 'rms-chrome-5-a11y-check-Aa11Bb'];
  assert.deepEqual(legacyOrphans(base, { ps, list }), [
    { dir: '/tmp/x/a11y-check-Ab12Cd', pids: [101, 102] },
    { dir: '/tmp/x/visual-diff-Qq11Ww', pids: [] },
  ]);
});

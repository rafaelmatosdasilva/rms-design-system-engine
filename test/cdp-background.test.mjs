// cdp.mjs: every page the engine opens keeps working at full speed, the one in front or not (the style guide's build
// tries components in several tabs at once; Chrome would otherwise wake a background tab once a second, then a minute).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findChrome, launchChrome, connectCDP, openPage } from '../cdp.mjs';

const CHROME = findChrome({ playwright: true });
const PAGE = 'data:text/html,' + encodeURIComponent('<script>window.n=0;(function tick(){window.n++;setTimeout(tick,0)})()</script>');

test('a page in a background tab keeps its timers running', { skip: CHROME ? false : 'no Chrome available', timeout: 60000 }, async () => {
  const chrome = await launchChrome(CHROME);
  const { send, close } = await connectCDP(chrome.wsUrl);
  try {
    const back = await openPage(send, PAGE);
    await openPage(send, 'data:text/html,<p>in front</p>');   // the last one opened is in front
    await new Promise((r) => setTimeout(r, 3000));
    const n = (await send('Runtime.evaluate', { expression: 'window.n', returnByValue: true }, back.sessionId)).result.value;
    assert.ok(n > 300, `a background tab ran its timer ${n} times in 3s`);
  } finally { close(); chrome.kill(); }
});

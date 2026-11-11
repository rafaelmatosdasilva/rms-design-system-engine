// What answers a click and Tab never reaches, as the style guide's page reads it on the variant shown (unreachedClicks,
// in the accessibility part of its script): a control by what it does as well as by its role. Needs Chrome.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findChrome, launchChrome, connectCDP, openPage, waitForTrue, FILE_PAGE_LOADED } from '../lib/cdp.mjs';
import { tempDir } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const PART = readFileSync(join(ENGINE, 'templates', 'styleguide', 'js', '21-its-accessibility-on-the-variant-shown.js'), 'utf8');
const CHROME = findChrome({ playwright: true });

// Each root a component as a page draws it. The tab is a <div> a framework gave a click handler (Vue keeps it on
// _vei), drawn with the pointer cursor its children inherit; the others are what must not be called one.
const PAGE = `<!doctype html><body>
<div id="tab" style="cursor:pointer"><span class="icon">*</span><div class="label">Payments</div></div>
<div id="script" onclick="void 0"><span>Open</span></div>
<div id="plain"><span>Balance</span></div>
<div id="native"><button style="cursor:pointer">Save</button></div>
<div id="card" style="cursor:pointer"><a href="#more">More</a></div>
<div id="off" aria-disabled="true" style="cursor:pointer"><span>Locked</span></div>
<div id="role" role="tab" tabindex="-1" style="cursor:pointer">Cards</div>
<script>document.getElementById('tab')._vei = { onClick: function () {} };</script>
</body>`;

test('a <div> that answers a click, with no role and no tab stop, is a control Tab never reaches; a part, a wrapper, a native control and a disabled one are not', { skip: !CHROME || typeof WebSocket === 'undefined' ? 'no Chrome available' : false }, async () => {
  const dir = tempDir('unreached-');
  const page = join(dir, 'p.html');
  writeFileSync(page, PAGE);
  const browser = await launchChrome(CHROME, { tmpPrefix: 'unreached-' });
  try {
    const { send, close } = await connectCDP(browser.wsUrl);
    const { sessionId } = await openPage(send, pathToFileURL(page).href);
    assert.equal(await waitForTrue(send, sessionId, FILE_PAGE_LOADED), true);
    // The part as the page holds it, its functions read back by name.
    const expression = `(function () { ${PART}
      var out = {};
      ['tab', 'script', 'plain', 'native', 'card', 'off', 'role'].forEach(function (id) { var root = document.getElementById(id); out[id] = unreachedClicks(root, tabStops(root)).map(function (el) { return el.id || el.className || el.tagName.toLowerCase(); }); });
      return out; })()`;
    const r = (await send('Runtime.evaluate', { expression, returnByValue: true }, sessionId)).result.value;
    assert.deepEqual(r.tab, ['tab'], 'the tab itself, once: its label inherits the cursor, and a part of it is not another control');
    assert.deepEqual(r.script, ['script'], 'an onclick is a click handler, cursor or not');
    assert.deepEqual(r.plain, [], 'nothing answers a click');
    assert.deepEqual(r.native, [], 'a <button> is a tab stop');
    assert.deepEqual(r.card, [], 'a card around its own link: the keyboard uses the link');
    assert.deepEqual(r.off, [], 'shown disabled: Tab passes it by, as it should');
    assert.deepEqual(r.role, [], 'a control by its role: the role check says it, once');
    close();
  } finally { browser.kill(); }
});

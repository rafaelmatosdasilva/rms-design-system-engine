// The colour behind text on an image, read from the pixels the browser draws (pixel-contrast.mjs), and the contrast
// held against the worst stretch of it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFileSync, rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';
import { pixelStats, pixelGrounds } from '../lib/pixel-contrast.mjs';
import { contrastFindings } from '../lib/a11y-check.mjs';
import { findChrome, launchChrome, connectCDP, openPage, waitForTrue, FILE_PAGE_LOADED } from '../lib/cdp.mjs';
import { budget, tempDir } from './helpers.mjs';

const CHROME = findChrome({ playwright: true });
const rgba = (cols) => Uint8ClampedArray.from(cols.flatMap((c) => [...c, 255]));

test('the pixels behind the text: their median, and the stretches a tenth of the way in from each end of brightness', () => {
  // Nine dark pixels and one bright sparkle: the sparkle is past the 90th percentile, so it does not stand for the light side.
  const s = pixelStats(rgba([...Array(9).fill([20, 20, 20]), [250, 250, 250]]));
  assert.deepEqual(s.median, { r: 20, g: 20, b: 20 });
  assert.deepEqual(s.dark, { r: 20, g: 20, b: 20 });
  assert.equal(pixelStats(new Uint8ClampedArray(0)), null);
  assert.equal(pixelStats(Uint8ClampedArray.from([1, 2, 3, 0])), null, 'see-through pixels are no background');
});

test('text on an image is measured against the worst stretch, says it was read from the pixels, and is a warning', () => {
  const t = { desc: 'p.hero', text: 'Over a photo', color: 'rgb(85, 85, 85)', bgLayers: [], fontSize: 16, fontWeight: '400', bgImage: true };
  assert.equal(contrastFindings([t], 'L')[0].cannotCompute, 'background-image', 'unread, it is said as not measured');
  const [f] = contrastFindings([{ ...t, pixelBg: 'rgb(30, 30, 30)', pixelDark: 'rgb(0, 0, 0)', pixelLight: 'rgb(200, 200, 200)' }], 'L');
  assert.equal(f.from, 'pixels');
  assert.equal(f.severity, 'warning', 'the engine\'s measurement, not a standard\'s: never a blocker on its own');
  assert.equal(f.ratio, 2.82, 'against black, the stretch that reads worst');
  assert.equal(contrastFindings([{ ...t, color: 'rgb(255, 255, 255)', pixelBg: 'rgb(10, 10, 10)', pixelDark: 'rgb(0, 0, 0)', pixelLight: 'rgb(40, 40, 40)' }], 'L').length, 0, 'white on a dark photo passes');
});

// A PNG of one colour, written by hand (no image library): the background image the browser paints under the text.
function solidPng(w, h, [r, g, b]) {
  const crc = (buf) => { let c = ~0; for (const x of buf) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (type, data) => { const t = Buffer.from(type); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array(w).fill([r, g, b]).flat())]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(Array(h).fill(row)))), chunk('IEND', Buffer.alloc(0))]);
}

test('in a real browser: the text is hidden, its box captured, and the image behind it read', { skip: CHROME && typeof WebSocket !== 'undefined' ? false : 'no Chrome available', timeout: budget(120000) }, async () => {
  const dir = tempDir('pixel-contrast-');
  writeFileSync(join(dir, 'dark.png'), solidPng(40, 40, [17, 17, 17]));
  const page = join(dir, 'p.html');
  writeFileSync(page, '<!doctype html><html><body style="margin:0"><p data-dse-px="0" style="color:#777;background:url(dark.png);font:16px sans-serif;padding:8px;margin:0">Over an image</p></body></html>');
  const chrome = await launchChrome(CHROME);
  const { send, close } = await connectCDP(chrome.wsUrl);
  try {
    const { sessionId } = await openPage(send, pathToFileURL(page).href);
    await waitForTrue(send, sessionId, FILE_PAGE_LOADED, { attempts: 200 });
    await send('DOM.enable', {}, sessionId);
    const [t] = await pixelGrounds(send, sessionId, [{ desc: 'p', text: 'Over an image', color: 'rgb(119, 119, 119)', bgLayers: [], fontSize: 16, fontWeight: '400', bgImage: true, px: 0 }]);
    assert.equal(t.pixelBg, 'rgb(17, 17, 17)', 'the image, with the letters hidden');
    const still = (await send('Runtime.evaluate', { expression: 'getComputedStyle(document.querySelector("p")).color', returnByValue: true }, sessionId)).result.value;
    assert.equal(still, 'rgb(119, 119, 119)', 'the text is put back as it was');
    const [f] = contrastFindings([t], 'L');
    assert.equal(f.from, 'pixels');
    assert.ok(f.ratio < 4.5, `#777 on near-black reads ${f.ratio}`);
  } finally { close(); chrome.kill(); rmSync(dir, { recursive: true, force: true }); }
});

test('a focus ring around a photo is held against the worst stretch of the pixels around it, a warning read from the pixels', async () => {
  const { focusRingRatio } = await import('../lib/a11y-check.mjs');
  const { bandPixels } = await import('../lib/pixel-contrast.mjs');
  // A 4 by 4 capture with a band of 1: the 12 pixels on its edge, not the 4 inside.
  assert.equal(bandPixels(new Uint8ClampedArray(4 * 4 * 4), 4, 4, 1).length / 4, 12);
  const ring = { colors: ['rgb(51, 51, 51)'], bgLayers: ['rgb(255, 255, 255)'] };
  assert.ok(focusRingRatio(ring).ratio > 3, 'against the colour alone it passes');
  const read = focusRingRatio({ ...ring, ringDark: 'rgb(10, 10, 10)', ringLight: 'rgb(40, 40, 40)' });
  assert.equal(read.from, 'pixels');
  assert.ok(read.ratio < 3, `against the photo it is ${read.ratio}`);
  assert.equal(focusRingRatio({ colors: ['rgba(0, 0, 0, 0)'], bgLayers: [] }), null, 'no colour, nothing to measure');
});

test('in a real browser: the band around a control on an image is read with the control not focused', { skip: CHROME && typeof WebSocket !== 'undefined' ? false : 'no Chrome available', timeout: budget(120000) }, async () => {
  const { ringGrounds } = await import('../lib/pixel-contrast.mjs');
  const dir = tempDir('ring-contrast-');
  writeFileSync(join(dir, 'dark.png'), solidPng(60, 60, [17, 17, 17]));
  const page = join(dir, 'p.html');
  writeFileSync(page, '<!doctype html><html><body style="margin:0"><div style="background:#fff url(dark.png);padding:40px"><button data-dse-ring="0" style="outline:3px solid #333">Go</button></div></body></html>');
  const chrome = await launchChrome(CHROME);
  const { send, close } = await connectCDP(chrome.wsUrl);
  try {
    const { sessionId } = await openPage(send, pathToFileURL(page).href);
    await waitForTrue(send, sessionId, FILE_PAGE_LOADED, { attempts: 200 });
    const [f] = await ringGrounds(send, sessionId, [{ desc: 'button', colors: ['rgb(51, 51, 51)'], bgLayers: ['rgb(255, 255, 255)'], ring: 0 }]);
    assert.equal(f.ringMedian, 'rgb(17, 17, 17)', 'the image around it, not the white behind the image');
    const { focusRingRatio } = await import('../lib/a11y-check.mjs');
    assert.ok(focusRingRatio(f).ratio < 3);
  } finally { close(); chrome.kill(); rmSync(dir, { recursive: true, force: true }); }
});

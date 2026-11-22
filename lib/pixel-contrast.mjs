// pixel-contrast.mjs - the colour behind text that sits on an image, read from the pixels the browser draws.
//
// Contrast is measured from colours: the text's against the backgrounds painted under it. Text over a photo, a
// pattern or any background image has no one colour to read, and was said as not measured, which is the case where
// contrast fails most. So for each such text the page is drawn with only that text hidden (its colour, its fill and
// its shadow made transparent, nothing else moved), the box its letters sit in is captured as the browser paints it,
// and the text is held against the stretch of it that reads worst: the pixels at the 10th and 90th percentile of
// brightness, whichever is nearer the text's own, so a dark corner of a photo counts and a stray sparkle does not.
// WCAG asks for 4.5:1 against the background and says nothing of how a photo is read, so this is the engine's
// measurement, not a standard's: the finding says it was read from the pixels, with the median beside the worst, and it
// is a warning, never a blocker on its own.
//
// The screenshot is decoded by the browser itself (an image drawn on a canvas), so the engine needs no image decoder
// of its own and stays without dependencies. The capture goes into the page as an argument, never written into code.
//
//   PX_ATTR                                   the attribute the sweep marks each text on an image with (its index)
//   medianRgb(data)                           → { r, g, b } of RGBA bytes, each channel's median, or null when empty
//   pixelStats(data)                          → { median, dark, light } of RGBA bytes, or null when empty
//   pixelGrounds(send, sessionId, textEls)    → textEls, each one on an image given pixelBg, pixelDark and pixelLight
//                                               ('rgb(…)') where it could be read
//   bandPixels(data, w, h, band)              → the RGBA bytes of a capture outside its inner box
//   ringGrounds(send, sessionId, faintFocus)  → each ring marked as on an image given ringDark, ringLight and ringMedian
export const PX_ATTR = 'data-dse-px';

// The pixels behind the text as three colours: the median, and the colours at the 10th and 90th percentile of
// brightness. The text is held against the one of the last two that reads worse: a dark corner of a photo counts, a
// few stray sparkles or the soft edge of a letter do not.
export function pixelStats(data) {
  const n = Math.floor((data?.length ?? 0) / 4);
  const px = [];
  for (let i = 0; i < n; i++) { if (data[i * 4 + 3] === 0) continue; const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2]; px.push([0.2126 * r + 0.7152 * g + 0.0722 * b, r, g, b]); }
  if (!px.length) return null;
  px.sort((a, b) => a[0] - b[0]);
  const at = (q) => { const p = px[Math.min(px.length - 1, Math.max(0, Math.round(q * (px.length - 1))))]; return { r: p[1], g: p[2], b: p[3] }; };
  const ch = [[], [], []];
  for (const p of px) { ch[0].push(p[1]); ch[1].push(p[2]); ch[2].push(p[3]); }
  const med = (a) => { a.sort((x, y) => x - y); const m = a.length >> 1; return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2); };
  return { median: { r: med(ch[0]), g: med(ch[1]), b: med(ch[2]) }, dark: at(0.1), light: at(0.9) };
}
export function medianRgb(data) {
  const n = Math.floor((data?.length ?? 0) / 4);
  if (!n) return null;
  const ch = [[], [], []];
  for (let i = 0; i < n; i++) { if (data[i * 4 + 3] === 0) continue; ch[0].push(data[i * 4]); ch[1].push(data[i * 4 + 1]); ch[2].push(data[i * 4 + 2]); }
  if (!ch[0].length) return null;
  const med = (a) => { a.sort((x, y) => x - y); const m = a.length >> 1; return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2); };
  return { r: med(ch[0]), g: med(ch[1]), b: med(ch[2]) };
}

// In the page, for the marked element: scroll it into view, hide only its own letters, and give the box they sit in.
const HIDE = `function (attr) {
  const el = this;
  const nodes = [...el.childNodes, ...(el.shadowRoot ? [...el.shadowRoot.childNodes] : [])].filter((n) => n.nodeType === 3 && n.textContent.trim());
  if (!nodes.length) return null;
  el.scrollIntoView({ block: 'center', inline: 'center' });
  const range = document.createRange(); range.setStartBefore(nodes[0]); range.setEndAfter(nodes[nodes.length - 1]);
  const r = range.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  el.__dseWas = [el.style.getPropertyValue('color'), el.style.getPropertyPriority('color'), el.style.getPropertyValue('-webkit-text-fill-color'), el.style.getPropertyValue('text-shadow')];
  el.style.setProperty('color', 'transparent', 'important');
  el.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
  el.style.setProperty('text-shadow', 'none', 'important');
  return { x: Math.max(0, r.left), y: Math.max(0, r.top), w: Math.min(innerWidth, r.right) - Math.max(0, r.left), h: Math.min(innerHeight, r.bottom) - Math.max(0, r.top) };
}`;
const RESTORE = `function () {
  const el = this, w = el.__dseWas; if (!w) return true;
  el.style.removeProperty('color'); el.style.removeProperty('-webkit-text-fill-color'); el.style.removeProperty('text-shadow');
  if (w[0]) el.style.setProperty('color', w[0], w[1]);
  if (w[2]) el.style.setProperty('-webkit-text-fill-color', w[2]);
  if (w[3]) el.style.setProperty('text-shadow', w[3]);
  delete el.__dseWas; return true;
}`;
// The capture, decoded by the browser on a canvas, then its median.
const MEDIAN = `function (png) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0);
      const data = x.getImageData(0, 0, c.width, c.height).data;
      resolve((${pixelStats.toString()})(data));
    };
    img.onerror = () => resolve(null);
    img.src = 'data:image/png;base64,' + png;
  });
}`;

export async function pixelGrounds(send, sessionId, textEls = []) {
  const want = textEls.filter((t) => t.bgImage && Number.isInteger(t.px));
  if (!want.length) return textEls;
  const doc = await send('DOM.getDocument', { depth: 0 }, sessionId).catch(() => null);
  if (!doc?.root) return textEls;
  for (const t of want) {
    let objectId = null;
    try {
      const q = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: `[${PX_ATTR}="${Number(t.px)}"]` }, sessionId);
      if (!q?.nodeId) continue;
      objectId = (await send('DOM.resolveNode', { nodeId: q.nodeId }, sessionId))?.object?.objectId;
      if (!objectId) continue;
      const box = (await send('Runtime.callFunctionOn', { objectId, functionDeclaration: HIDE, returnByValue: true }, sessionId))?.result?.value;
      if (!box || box.w < 1 || box.h < 1) continue;
      // One frame for the hidden letters to be painted away before the capture.
      await send('Runtime.evaluate', { expression: 'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))', awaitPromise: true }, sessionId).catch(() => {});
      const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: box.x, y: box.y, width: box.w, height: box.h, scale: 1 } }, sessionId).catch(() => null);
      await send('Runtime.callFunctionOn', { objectId, functionDeclaration: RESTORE, returnByValue: true }, sessionId).catch(() => {});
      objectId = null;
      if (!shot?.data) continue;
      const win = (await send('Runtime.evaluate', { expression: 'window', returnByValue: false }, sessionId))?.result?.objectId;
      const med = win ? (await send('Runtime.callFunctionOn', { objectId: win, functionDeclaration: MEDIAN, arguments: [{ value: shot.data }], awaitPromise: true, returnByValue: true }, sessionId))?.result?.value : null;
      if (med) { const c = (x) => `rgb(${x.r}, ${x.g}, ${x.b})`; t.pixelBg = c(med.median); t.pixelDark = c(med.dark); t.pixelLight = c(med.light); }
    } catch { /* a text that cannot be captured stays not measured, and says so */ } finally {
      if (objectId) await send('Runtime.callFunctionOn', { objectId, functionDeclaration: RESTORE, returnByValue: true }, sessionId).catch(() => {});
    }
  }
  return textEls;
}

// ── A focus ring around a photo or a pattern ──
// The ring sits on what is around the control, so that is read: a band just outside its box, as the browser draws it
// with the control not focused (the ring is not yet there to be read as its own background). The ring then has to
// reach 3:1 (WCAG 1.4.11) against the worst stretch of the band, as text does against what is behind it.
export const RING_ATTR = 'data-dse-ring';
export const RING_BAND = 6;
// The pixels of a capture outside its inner box, the band around the control.
export function bandPixels(data, width, height, band = RING_BAND) {
  const out = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (x >= band && x < width - band && y >= band && y < height - band) continue;
    const i = (y * width + x) * 4; out.push(data[i], data[i + 1], data[i + 2], data[i + 3]);
  }
  return Uint8ClampedArray.from(out);
}
const BOX = `function () { const el = this; el.scrollIntoView({ block: 'center', inline: 'center' }); if (document.activeElement === el) el.blur(); const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }`;
const BAND_STATS = `function (png, band) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0);
      const data = x.getImageData(0, 0, c.width, c.height).data;
      resolve((${pixelStats.toString()})((${bandPixels.toString()})(data, c.width, c.height, band)));
    };
    img.onerror = () => resolve(null);
    img.src = 'data:image/png;base64,' + png;
  });
}`;

export async function ringGrounds(send, sessionId, rings = []) {
  const want = rings.filter((f) => Number.isInteger(f.ring));
  if (!want.length) return rings;
  const doc = await send('DOM.getDocument', { depth: 0 }, sessionId).catch(() => null);
  if (!doc?.root) return rings;
  const win = (await send('Runtime.evaluate', { expression: 'window', returnByValue: false }, sessionId).catch(() => null))?.result?.objectId;
  if (!win) return rings;
  for (const f of want) {
    try {
      const q = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: `[${RING_ATTR}="${Number(f.ring)}"]` }, sessionId);
      if (!q?.nodeId) continue;
      const objectId = (await send('DOM.resolveNode', { nodeId: q.nodeId }, sessionId))?.object?.objectId;
      if (!objectId) continue;
      const b = (await send('Runtime.callFunctionOn', { objectId, functionDeclaration: BOX, returnByValue: true }, sessionId))?.result?.value;
      if (!b || b.w < 1 || b.h < 1) continue;
      await send('Runtime.evaluate', { expression: 'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))', awaitPromise: true }, sessionId).catch(() => {});
      const clip = { x: Math.max(0, b.x - RING_BAND), y: Math.max(0, b.y - RING_BAND), width: b.w + 2 * RING_BAND, height: b.h + 2 * RING_BAND, scale: 1 };
      const shot = await send('Page.captureScreenshot', { format: 'png', clip }, sessionId).catch(() => null);
      if (!shot?.data) continue;
      const st = (await send('Runtime.callFunctionOn', { objectId: win, functionDeclaration: BAND_STATS, arguments: [{ value: shot.data }, { value: RING_BAND }], awaitPromise: true, returnByValue: true }, sessionId))?.result?.value;
      if (st) { const c = (x) => `rgb(${x.r}, ${x.g}, ${x.b})`; f.ringDark = c(st.dark); f.ringLight = c(st.light); f.ringMedian = c(st.median); }
    } catch { /* a ring that cannot be captured is measured against the colours as before */ }
  }
  return rings;
}

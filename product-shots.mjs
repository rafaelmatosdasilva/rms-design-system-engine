// product-shots.mjs - a picture of each product's own page, and where each design system component sits on it, for the
// style guide's "Used in" area. Taken in Chrome from the built page each time the style guide is built, so it is always
// the product as it is now; a product can give a picture of its own instead (styleguide.plugins[].image).
//
// productShots(ROOT, products, components) → { [key]: { shot, w, h, boxes: { [component]: [[x, y, w, h]] }, from } }
//   products: [{ key, page?, image? }] (page: the product's built HTML, from the project root; image: a picture of its own)
//   components: [{ name, cls }] (cls: the component's class, without its dot)
// No Chrome, or a page that does not open: that product has no picture, and the style guide shows its card without one.

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join, extname } from 'node:path';
import { pathToFileURL } from 'node:url';

// The window a product opens in, when its code says (a Figma plugin's showUI(__html__, { width, height })).
export function windowSize(text = '') {
  const m = /showUI\s*\([^)]*?width\s*:\s*([\d.e+]+)[^)]*?height\s*:\s*([\d.e+]+)/.exec(String(text));
  const w = m && Number(m[1]), h = m && Number(m[2]);
  return w > 0 && h > 0 ? { w: Math.round(w), h: Math.round(h) } : null;
}

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

export async function productShots(ROOT, products = [], components = [], { chromePath = null, maxBytes = 1_500_000 } = {}) {
  const out = {};
  const pages = [];
  for (const p of products) {
    // the product's own picture, when its folder has one where projects keep it (docs/preview.png, a screenshot)
    if (!p.image && p.page) {
      const dir = dirname(resolve(ROOT, p.page));
      const found = ['docs/preview', 'docs/screenshot', 'preview', 'screenshot', 'docs/cover', '.github/preview'].flatMap((b) => ['.png', '.jpg', '.jpeg', '.webp'].map((e) => join(dir, b + e))).find(existsSync);
      if (found) p.image = found;
    }
    if (p.image) {
      const abs = resolve(ROOT, p.image);
      const mime = MIME[extname(abs).toLowerCase()];
      if (mime && existsSync(abs) && readFileSync(abs).length <= maxBytes) out[p.key] = { shot: `data:${mime};base64,${readFileSync(abs).toString('base64')}`, boxes: {}, from: 'image' };
      continue;
    }
    if (p.page && existsSync(resolve(ROOT, p.page))) pages.push(p);
  }
  if (!pages.length) return out;
  const { findChrome, launchChrome, connectCDP, openPage, waitForTrue, FILE_PAGE_LOADED } = await import('./cdp.mjs');
  const chrome = chromePath ?? findChrome({ playwright: true });
  if (!chrome || typeof WebSocket === 'undefined') return out;
  let browser = null, cdp = null;
  try {
    browser = await launchChrome(chrome, { tmpPrefix: 'dse-shots-' });
    cdp = await connectCDP(browser.wsUrl);
    const { send } = cdp;
    const sels = components.filter((c) => c.cls && /^[A-Za-z_-][\w-]*$/.test(c.cls)).map((c) => [c.name, '.' + c.cls]);
    for (const p of pages) {
      const abs = resolve(ROOT, p.page);
      // its window: what its code next to the page asks for, else a desktop window
      const size = ['code.js', 'main.js', 'dist/code.js'].map((f) => join(dirname(abs), f)).filter(existsSync).map((f) => windowSize(readFileSync(f, 'utf8'))).find(Boolean) ?? { w: 1000, h: 700 };
      try {
        const { targetId, sessionId } = await openPage(send, 'about:blank');
        await send('Emulation.setDeviceMetricsOverride', { width: size.w, height: size.h, deviceScaleFactor: 1, mobile: false }, sessionId);
        await send('Page.navigate', { url: pathToFileURL(abs).href }, sessionId);
        if (!(await waitForTrue(send, sessionId, FILE_PAGE_LOADED, { attempts: 200, intervalMs: 50, tolerateErrors: true }))) { await send('Target.closeTarget', { targetId }); continue; }
        await new Promise((r) => setTimeout(r, 600));   // its first render, fonts and icons
        const expr = `(() => { const out = {}; const W = innerWidth, H = innerHeight;
          for (const [name, sel] of ${JSON.stringify(sels)}) {
            const boxes = [];
            for (const el of document.querySelectorAll(sel)) {
              const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
              if (r.width < 2 || r.height < 2 || cs.visibility === 'hidden' || r.right <= 0 || r.bottom <= 0 || r.left >= W || r.top >= H) continue;
              boxes.push([Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]);
              if (boxes.length >= 12) break;
            }
            if (boxes.length) out[name] = boxes;
          }
          return out; })()`;
        const boxes = (await send('Runtime.evaluate', { expression: expr, returnByValue: true }, sessionId)).result?.value ?? {};
        const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 72, clip: { x: 0, y: 0, width: size.w, height: size.h, scale: 1 } }, sessionId);
        if (shot?.data && shot.data.length * 0.75 <= maxBytes) out[p.key] = { shot: `data:image/jpeg;base64,${shot.data}`, w: size.w, h: size.h, boxes, from: 'page' };
        await send('Target.closeTarget', { targetId });
      } catch { /* this product has no picture */ }
    }
  } catch { /* no browser: no pictures */ }
  finally { try { cdp?.close(); } catch { /* closed */ } try { browser?.kill(); } catch { /* gone */ } }
  return out;
}

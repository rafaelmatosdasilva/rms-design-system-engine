// page-load.mjs - a product's built pages opened in a browser: what they load from other hosts, and how long they take.
//
// A product's health report read its pages from disk: the bytes beside the page, and the hosts its code names. What a
// page really fetches once its script runs, and how long a person waits for it, only show in a browser. This opens each
// built page in the engine's own headless Chrome (cdp.mjs), never changing it, and records:
//   • every request to another host (anything but the page's own folder), with what it is and how much came back;
//   • the time to the first thing drawn, to the page read, and to everything loaded;
//   • the same once more on a slow network (400 ms each way, 400 kbit/s), where what other hosts serve is what waits.
// A page is opened as a file, as the product's other checks open it, so its own files come from disk and only other
// hosts go through the network.
//
//   SLOW                                   the slow network's conditions
//   measurePage(cdp, url, { slow })        → { requests, timings, bytes }   (one page, in one browser)
//   measurePages(files, { chromePath })    → { pages: [{ file, normal, slow }], why? }
//   hostsOf(pages) / slowestOf(pages)       → the other hosts every page reached, and the slowest page with its times
import { pathToFileURL } from 'node:url';

export const SLOW = { offline: false, latency: 400, downloadThroughput: 400 * 1024 / 8, uploadThroughput: 400 * 1024 / 8 };
const OTHER = /^(https?|wss?):/i;
const hostOf = (u) => { try { return new URL(u).hostname.toLowerCase(); } catch { return null; } };
// What the page's own timeline says once it is loaded: first drawn, read (DOMContentLoaded), everything loaded. ms.
const TIMINGS = `(() => { const n = performance.getEntriesByType('navigation')[0] || {}; const p = performance.getEntriesByType('paint').find((x) => x.name === 'first-contentful-paint');
  return { firstDraw: p ? Math.round(p.startTime) : null, read: n.domContentLoadedEventEnd ? Math.round(n.domContentLoadedEventEnd) : null, loaded: n.loadEventEnd ? Math.round(n.loadEventEnd) : null }; })()`;

// One page, in one window of its own: the network watched from before it is opened.
export async function measurePage({ send, on }, url, { slow = false, waitMs = 30000 } = {}) {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank', newWindow: true });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const seen = new Map();
  const offs = [
    on('Network.requestWillBeSent', (p, s) => { if (s === sessionId && OTHER.test(p.request?.url ?? '')) seen.set(p.requestId, { url: p.request.url, host: hostOf(p.request.url), type: p.type ?? 'Other', bytes: 0, failed: false }); }, sessionId),
    on('Network.loadingFinished', (p, s) => { const r = s === sessionId && seen.get(p.requestId); if (r) r.bytes = p.encodedDataLength ?? 0; }),
    on('Network.loadingFailed', (p, s) => { const r = s === sessionId && seen.get(p.requestId); if (r) r.failed = true; }),
  ];
  try {
    await send('Runtime.enable', {}, sessionId);
    await send('Network.enable', {}, sessionId);
    await send('Network.setCacheDisabled', { cacheDisabled: true }, sessionId).catch(() => {});
    if (slow) await send('Network.emulateNetworkConditions', SLOW, sessionId);
    await send('Page.enable', {}, sessionId);
    const loaded = new Promise((res) => { const off = on('Page.loadEventFired', (_, s) => { if (s === sessionId) { off(); res(true); } }); setTimeout(() => res(false), waitMs).unref?.(); });
    await send('Page.navigate', { url }, sessionId);
    const done = await loaded;
    await new Promise((r) => setTimeout(r, 300));   // what the page asks for as it settles
    const t = (await send('Runtime.evaluate', { expression: TIMINGS, returnByValue: true }, sessionId).catch(() => null))?.result?.value ?? {};
    const requests = [...seen.values()];
    return { requests, timings: { ...t, ...(done ? {} : { timedOut: waitMs }) }, bytes: requests.reduce((n, r) => n + r.bytes, 0) };
  } finally {
    for (const off of offs) off?.();
    await send('Target.closeTarget', { targetId }).catch(() => {});
  }
}

// Every built page, on a normal network and on a slow one. files: absolute paths. Without Chrome, why.
export async function measurePages(files = [], { chromePath = null, launch = null } = {}) {
  const cdp = await import('./cdp.mjs');
  const path = chromePath ?? cdp.findChrome();
  if (!path) return { pages: [], why: 'no Chrome on this computer (CHROME_PATH)' };
  let browser = null, client = null;
  try {
    browser = await (launch ?? cdp.launchChrome)(path);
    client = await cdp.connectCDP(browser.wsUrl);
    const pages = [];
    for (const file of files) {
      const url = pathToFileURL(file).href;
      pages.push({ file, normal: await measurePage(client, url), slow: await measurePage(client, url, { slow: true }) });
    }
    return { pages };
  } catch (e) {
    return { pages: [], why: `the browser could not open the pages (${String(e?.message ?? e).split('\n')[0]})` };
  } finally {
    client?.close();
    browser?.kill?.();
  }
}

export const hostsOf = (pages = []) => [...new Set(pages.flatMap((p) => p.normal.requests.map((r) => r.host)).filter(Boolean))].sort();
export function slowestOf(pages = []) {
  const at = (p, k) => p.slow?.timings?.[k] ?? p.normal?.timings?.[k] ?? 0;
  return [...pages].sort((a, b) => at(b, 'loaded') - at(a, 'loaded'))[0] ?? null;
}

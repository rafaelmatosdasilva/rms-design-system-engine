// page-driver.mjs - one way to open a page and run a script in it, whichever browser draws it.
//
// The engine's measurements are plain JavaScript run in the page (a computed style, a size, where the focus went),
// so they carry over to any browser as they are. What differs is how a page is opened, sized and put in a colour
// scheme, and that is all this layer holds: Chrome through its DevTools protocol (cdp.mjs), Firefox through WebDriver
// BiDi (bidi.mjs), Safari through the WebDriver macOS ships (webdriver.mjs). None needs anything installed but the
// browser itself.
//
//   openBrowser(name, path, { scheme })   → { name, label, scheme, page(url) → page, close() }
//   page                                   → { evaluate(expr), setViewport(w, h), close() }
//
// `scheme` is the colour scheme the whole browser draws in ('light' unless asked). Chrome can change it per page,
// Firefox takes it at start (one browser a scheme), and Safari draws in the Mac's own appearance: its `scheme` is
// null, and a caller leaves untried there what asks for a scheme Safari cannot be put in.
import { launchChrome, connectCDP, openPage, waitForTrue } from './cdp.mjs';
import { launchFirefox, connectBiDi, bidiPage } from './bidi.mjs';
import { launchSafari, webdriverSession, webdriverPage } from './webdriver.mjs';

export const LABEL = { chrome: 'Chrome', firefox: 'Firefox', webkit: 'WebKit' };
const LOADED = 'document.readyState === "complete"';

async function waitFor(evaluate, expression, { attempts = 100, intervalMs = 50 } = {}) {
  for (let i = 0; i < attempts; i++) {
    if (await evaluate(expression).catch(() => false) === true) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

async function chrome(path, { scheme = 'light' } = {}) {
  const b = await launchChrome(path, { tmpPrefix: 'page-driver-' });
  const { send, close } = await connectCDP(b.wsUrl);
  return {
    scheme,
    page: async (url, { width = 1280, height = 800 } = {}) => {
      const { targetId, sessionId } = await openPage(send, 'about:blank');
      const setViewport = (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }, sessionId);
      await setViewport(width, height);
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] }, sessionId);
      await send('Page.navigate', { url }, sessionId);
      await waitForTrue(send, sessionId, `location.href !== "about:blank" && ${LOADED}`, { tolerateErrors: true });
      const evaluate = async (expression) => {
        const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
        if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
        return r.result?.value ?? null;
      };
      return { evaluate, setViewport, close: () => send('Target.closeTarget', { targetId }).catch(() => {}) };
    },
    close: async () => { await close?.(); b.kill(); },
  };
}

async function firefox(path, { scheme = 'light' } = {}) {
  const b = await launchFirefox(path, { scheme });
  const { send, close } = await connectBiDi(b.wsUrl);
  return {
    scheme,
    page: async (url, size) => { const p = await bidiPage(send, url, size); await waitFor(p.evaluate, LOADED); return p; },
    close: async () => { await close(); b.kill(); },
  };
}

async function webkit(path) {
  const b = await launchSafari(path);
  let session;
  try { session = await webdriverSession(b.base); } catch (e) { b.kill(); throw e; }
  return {
    scheme: null,
    // Safari runs one session at a time, so one page at a time: a page is the session's window.
    page: async (url, size) => { const p = await webdriverPage(session, url, size); await waitFor(p.evaluate, LOADED); return { ...p, close: async () => {} }; },
    close: async () => { await session.close(); b.kill(); },
  };
}

const OPEN = { chrome, firefox, webkit };

export async function openBrowser(name, path, opts = {}) {
  if (!OPEN[name]) throw new Error(`no driver for ${name}`);
  const b = await OPEN[name](path, opts);
  return { name, label: LABEL[name], ...b };
}

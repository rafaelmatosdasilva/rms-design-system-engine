// styleguide-bake.mjs - the style guide's accessibility, tried once in a browser while the page is built.
//
// Each component's Accessibility area (and the Status page) tries every variant in a browser: the Tab stops, names,
// focus, text contrast in every colour mode, the WCAG 2.1 page checks and what it does when used. Done in the viewer's
// browser, that takes minutes for a whole system and shows results that are not final yet. Here --styleguide opens the
// page it just wrote in Chrome, has it try every component (shared among a few pages at once, #status?bake=i/n), and
// keeps what each found in the page itself (<script id="sg-a11y-baked">). The page then shows those results at once,
// on the Status page and in every Accessibility area, with nothing running while it is read. A component the page could
// not try here (no Chrome, a time limit) is tried in the viewer's browser as before.
import { readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { findChrome, launchChrome, connectCDP, openPage, waitForTrue, FILE_PAGE_LOADED } from './cdp.mjs';

export const BAKED_ID = 'sg-a11y-baked';
const BAKED_RE = new RegExp(`<script id="${BAKED_ID}" type="application/json">[\\s\\S]*?<\\/script>`);

// The page with these results kept in it (any earlier ones replaced), right after the page's data (sg-data), so the
// page's script, which comes after it, reads them as it starts. baked: { at, results }.
const DATA_RE = /<script[^>]*\bid="sg-data"[^>]*>[\s\S]*?<\/script>/;
export function withBaked(html, baked) {
  const tag = `<script id="${BAKED_ID}" type="application/json">${JSON.stringify(baked).replace(/</g, '\\u003c')}</script>`;
  if (BAKED_RE.test(html)) return html.replace(BAKED_RE, () => tag);
  const data = DATA_RE.exec(html);
  if (data) return html.slice(0, data.index + data[0].length) + tag + html.slice(data.index + data[0].length);
  const at = html.search(/<script(?![^>]*application\/json)/);
  return at < 0 ? html + tag : html.slice(0, at) + tag + html.slice(at);
}
export function withoutBaked(html) { return html.replace(BAKED_RE, ''); }

// Try every component of the page at file in Chrome and keep the results in it. jobs: pages trying at once.
// → { tried, of, unfinished, dead, errors, ms } | { skipped: why }. errors: each script error the page threw while trying,
// once; dead: the page's script stopped before it could try anything.
export async function bakeA11y(file, { chromePath = process.env.CHROME_PATH || findChrome({ playwright: true }), jobs = Math.max(1, Math.min(4, cpus().length)), timeoutMs = 60 * 60 * 1000 } = {}) {
  if (!chromePath) return { skipped: 'no Chrome found (set CHROME_PATH)' };
  if (typeof WebSocket === 'undefined') return { skipped: 'this Node has no WebSocket (Node 22 or later)' };
  const t0 = Date.now();
  // Tried afresh: results an earlier build kept are taken out first, so the page tries every component.
  const before = readFileSync(file, 'utf8'), clean = withoutBaked(before);
  if (clean !== before) writeFileSync(file, clean);
  const { wsUrl, kill } = await launchChrome(chromePath);
  try {
    const { send, on, close } = await connectCDP(wsUrl, { timeoutMs: 120000 });
    const errors = new Set();
    on('Runtime.exceptionThrown', (p) => errors.add(String(p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text ?? '').split('\n')[0]));
    const parts = await Promise.all(Array.from({ length: jobs }, async (_, i) => {
      const { sessionId } = await openPage(send, `file://${file}#status?bake=${i}/${jobs}`);
      // Each page as if it had the focus and a desktop window, so none is held back as a page out of view.
      await send('Emulation.setFocusEmulationEnabled', { enabled: true }, sessionId).catch(() => {});
      await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId).catch(() => {});
      await waitForTrue(send, sessionId, FILE_PAGE_LOADED, { attempts: 1200, tolerateErrors: true });
      // A page whose script stopped while it was being drawn never tries anything: said at once, never waited out.
      const alive = await send('Runtime.evaluate', { expression: "typeof window.__sgA11yResults === 'function'", returnByValue: true }, sessionId).catch(() => null);
      if (alive?.result?.value !== true) return { done: false, dead: true, results: {}, of: 0 };
      const done = await waitForTrue(send, sessionId, 'window.__sgSweepDone === true', { attempts: Math.ceil(timeoutMs / 1000), intervalMs: 1000, tolerateErrors: true });
      const r = await send('Runtime.evaluate', { expression: 'JSON.stringify(window.__sgA11yResults ? window.__sgA11yResults() : {})', returnByValue: true }, sessionId).catch(() => null);
      let results = {};
      try { results = JSON.parse(r?.result?.value || '{}'); } catch { results = {}; }
      const n = await send('Runtime.evaluate', { expression: "(JSON.parse((document.getElementById('sg-data') || {}).textContent || '{}').components || []).length", returnByValue: true }, sessionId).catch(() => null);
      return { done, results, of: n?.result?.value ?? 0 };
    }));
    close();
    const results = Object.assign({}, ...parts.map((p) => p.results));
    writeFileSync(file, withBaked(readFileSync(file, 'utf8'), { at: new Date().toISOString(), results }));
    return { tried: Object.keys(results).length, of: Math.max(0, ...parts.map((p) => p.of)), unfinished: parts.filter((p) => !p.done).length, dead: parts.some((p) => p.dead), errors: [...errors], ms: Date.now() - t0 };
  } finally { kill(); }
}

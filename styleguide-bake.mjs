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
// The results kept with the snapshots, so whoever builds next (a person, the team's pipeline) tries only the components
// that changed since: { at, results: { name: { sig, live, items, parts } } }. A *.snapshot.json, so the snapshots store
// carries it to everyone.
export const RESULTS_FILE = 'a11y-results.snapshot.json';
export function readSaved(path) { try { const j = JSON.parse(readFileSync(path, 'utf8')); return j && typeof j.results === 'object' ? j.results : {}; } catch { return {}; } }
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

// When each task still open was first found: { key: ISO date }, kept with the snapshots so it follows the team, and put
// in the page (<script id="sg-open-since">), which says how long each open task has been open. A task found closed
// (gone from the open ones) leaves it; one found again starts again.
export const OPEN_FILE = 'open-since.snapshot.json';
export const OPEN_ID = 'sg-open-since';
export function readOpenSince(path) { try { const j = JSON.parse(readFileSync(path, 'utf8')); return j && typeof j.since === 'object' ? j.since : {}; } catch { return {}; } }
export function ageOpen(prev = {}, keys = [], now = new Date().toISOString()) {
  const out = {};
  for (const k of [...new Set(keys)].sort()) out[k] = prev[k] ?? now;
  return out;
}
const OPEN_RE = new RegExp(`<script id="${OPEN_ID}" type="application/json">[\\s\\S]*?<\\/script>`);
export function withOpenSince(html, since) {
  const tag = `<script id="${OPEN_ID}" type="application/json">${JSON.stringify(since ?? {}).replace(/</g, '\\u003c')}</script>`;
  if (OPEN_RE.test(html)) return html.replace(OPEN_RE, () => tag);
  const data = DATA_RE.exec(html);
  if (data) return html.slice(0, data.index + data[0].length) + tag + html.slice(data.index + data[0].length);
  const at = html.search(/<script(?![^>]*application\/json)/);
  return at < 0 ? html + tag : html.slice(0, at) + tag + html.slice(at);
}

// Try every component of the page at file in Chrome and keep the results in it. jobs: pages trying at once.
// → { tried, of, unfinished, dead, errors, ms } | { skipped: why }. errors: each script error the page threw while trying,
// once; dead: the page's script stopped before it could try anything.
export async function bakeA11y(file, { saved = null, chromePath = process.env.CHROME_PATH || findChrome({ playwright: true }), jobs = Math.max(1, Math.min(4, cpus().length)), timeoutMs = 60 * 60 * 1000 } = {}) {
  if (!chromePath) return { skipped: 'no Chrome found (set CHROME_PATH)' };
  if (typeof WebSocket === 'undefined') return { skipped: 'this Node has no WebSocket (Node 22 or later)' };
  const t0 = Date.now();
  // Results an earlier build kept in the page are taken out; the saved ones (saved: { name: result }) go in instead, and the
  // page tries only the components whose signature changed since (its code, the system's CSS, the check itself).
  const before = readFileSync(file, 'utf8'), clean = withoutBaked(before), start = saved && Object.keys(saved).length ? withBaked(clean, { at: null, results: saved }) : clean;
  if (start !== before) writeFileSync(file, start);
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
      // Every task this page found open (all of the page's, and the accessibility of the components it tried).
      const k = await send('Runtime.evaluate', { expression: 'JSON.stringify(window.__sgOpenKeys ? window.__sgOpenKeys() : null)', returnByValue: true }, sessionId).catch(() => null);
      let open = null; try { open = JSON.parse(k?.result?.value || 'null'); } catch { open = null; }
      return { done, results, of: n?.result?.value ?? 0, open };
    }));
    close();
    const results = Object.assign({}, ...parts.map((p) => p.results));
    writeFileSync(file, withBaked(readFileSync(file, 'utf8'), { at: new Date().toISOString(), results }));
    const reused = saved ? Object.keys(results).filter((n) => saved[n] && saved[n].sig === results[n].sig).length : 0;
    // The open tasks, only when every page said them: a page that could not leaves the record as it was.
    const open = parts.every((p) => Array.isArray(p.open)) ? [...new Set(parts.flatMap((p) => p.open))] : null;
    return { results, open, reused, tried: Object.keys(results).length, of: Math.max(0, ...parts.map((p) => p.of)), unfinished: parts.filter((p) => !p.done).length, dead: parts.some((p) => p.dead), errors: [...errors], ms: Date.now() - t0 };
  } finally { kill(); }
}

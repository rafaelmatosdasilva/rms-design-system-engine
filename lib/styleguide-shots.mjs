// styleguide-shots.mjs - the style guide's own pages, pictured each build and compared with the build before.
//
// The checks hold the page to the system's tokens and to accessibility, but a change to the template, its data or the
// engine can still move a page's layout without anyone seeing it. Here a build that opens the page in a browser
// pictures each page the menu lists (Status, the foundations, each component's page, at most MAX_PAGES), at one window
// size, in light, with motion off and every word made invisible (a date, a count or an age changes every build and is
// not the look), and compares each picture with the last build's. A page whose picture changed is said, with how much
// of it, and a picture of what changed is written beside it. Nothing fails: a change may be meant.
//
//   guideShots(page, dir, { chromePath })  → { pages, compared, changed: [{ id, title, share, diff }], fresh, kept, left, ms } | { skipped }
//   pageSignatures(html)                   → { shell, pages: { 'c-<name>': sig } }: what each component's page is drawn from
//   shotLines(r, dir)                      → the build's lines
//   changedShare({ diff, total })          → the share of pixels that changed, 0 to 1
//
// The pictures live in <out>/styleguide-shots/: last/ (this build's, compared with by the next one) and diff/ (what
// changed, this build only). Reads only the page; writes only there.

import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { inlinePage } from './styleguide-files.mjs';
import { findChrome, launchChrome, connectCDP, openPage, waitForTrue, FILE_PAGE_LOADED } from './cdp.mjs';
import { compareExpression } from './visual-diff.mjs';

export const MAX_PAGES = 40;
export const WIDTH = 1280, MAX_HEIGHT = 4000;
// A page is said changed when more than this share of its pixels differ: one row of a table moved is, a word's
// anti-aliasing is not.
export const CHANGED = 0.002;
const QUIET = '*, *::before, *::after { -webkit-text-fill-color: transparent !important; text-shadow: none !important; caret-color: transparent !important; animation: none !important; transition: none !important; } ::placeholder { -webkit-text-fill-color: transparent !important; }';

export const changedShare = (r) => (r && r.total ? r.diff / r.total : 0);
const safe = (id) => String(id).replace(/[^\w.-]+/g, '_');

// What each component's page is drawn from: the page's shell (its template, CSS and scripts, the system's CSS among them)
// and the data, less what changes on every build without changing a page (dates, the build's own record, the open
// tasks and differences, which the Status page shows) and less the other components. A component page whose
// signature is the last build's draws the same, so its picture is kept: on a large system a change to one component
// pictured all of its 190 pages again. The other pages (Status, the foundations) draw from all of the data and are
// pictured every build.
const DATES = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?/g;
const NOT_SHARED = new Set(['builtAt', 'built', 'differences', 'decisions', 'releaseLog', 'systemTodo', 'notAgreed', 'components']);
const sha = (...xs) => { const h = createHash('sha256'); for (const x of xs) h.update(String(x)).update('\0'); return h.digest('hex').slice(0, 24); };
const cid = (n) => 'c-' + String(n).replace(/[^\w-]+/g, '-');
export function pageSignatures(html) {
  const re = /(<script[^>]*\bid=["']sg-data["'][^>]*>)([\s\S]*?)(<\/script>)/;
  const m = re.exec(html);
  let data = {};
  try { data = JSON.parse(m?.[2] ?? '{}'); } catch { return null; }
  const shell = sha(String(html).replace(re, '$1$3').replace(DATES, '').replace(/\.[0-9a-f]{10}\.(css|js)\b/g, '.$1'));
  const rest = sha(JSON.stringify(Object.fromEntries(Object.entries(data).filter(([k]) => !NOT_SHARED.has(k)))).replace(DATES, ''));
  const pages = {};
  for (const c of data.components ?? []) if (c?.name) pages[cid(c.name)] = sha(shell, rest, JSON.stringify(c).replace(DATES, ''));
  return { shell, pages };
}

export async function guideShots(page, dir, { chromePath = findChrome({ playwright: true }), max = MAX_PAGES } = {}) {
  if (!chromePath || typeof WebSocket === 'undefined') return { skipped: 'no Chrome' };
  const started = Date.now();
  const lastDir = join(dir, 'last'), diffDir = join(dir, 'diff');
  rmSync(diffDir, { recursive: true, force: true });
  mkdirSync(lastDir, { recursive: true });
  // Each component page's signature, against the last build's (sigs.json beside the pictures).
  const sigsFile = join(lastDir, 'sigs.json');
  let sigs = null, before = {};
  try { sigs = pageSignatures(inlinePage(readFileSync(page, 'utf8'), dirname(page))); } catch { sigs = null; }
  try { before = JSON.parse(readFileSync(sigsFile, 'utf8')).pages ?? {}; } catch { before = {}; }
  const c = await launchChrome(chromePath);
  try {
    const { send, close } = await connectCDP(c.wsUrl);
    const { sessionId } = await openPage(send, 'about:blank');
    const run = async (expression, awaitPromise = false) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise }, sessionId)).result?.value;
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-reduced-motion', value: 'reduce' }] }, sessionId);
    await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    await send('Page.navigate', { url: `file://${page}#status` }, sessionId);
    if (!await waitForTrue(send, sessionId, FILE_PAGE_LOADED, { attempts: 600, tolerateErrors: true })) return { skipped: 'the page did not load' };
    // Every page the menu lists, the pages first and then each component's, as the menu orders them.
    // A value from the page (a page's id) is handed to the browser as an argument, never written into the code it runs.
    const global = (await send('Runtime.evaluate', { expression: 'globalThis' }, sessionId)).result?.objectId;
    const call = async (fn, ...args) => (await send('Runtime.callFunctionOn', { objectId: global, functionDeclaration: String(fn), arguments: args.map((value) => ({ value })), returnByValue: true }, sessionId)).result?.value;
    const shownNow = (id) => { const s = document.getElementById(id); return !!s && !s.hidden && s.getBoundingClientRect().height > 0; };
    const ids = (await run(`[...document.querySelectorAll('.sg-nav a[href^="#"]')].map((a) => [a.getAttribute('href').slice(1), a.textContent.trim()])`)) ?? [];
    const list = [...ids.filter(([id]) => !/^c-/.test(id)), ...ids.filter(([id]) => /^c-/.test(id))];
    const take = list.slice(0, max);
    const changed = [];
    let compared = 0, fresh = 0, pictured = 0, kept = 0;
    for (const [id, title] of take) {
      if (sigs?.pages[id] && before[id] === sigs.pages[id] && existsSync(join(lastDir, `${safe(id)}.png`))) { kept++; continue; }   // drawn from the same: its picture stands
      await call(function (id) { location.hash = '#' + id; }, id);
      let shown = false;
      for (let i = 0; i < 200 && !shown; i++) { shown = await call(shownNow, id).catch(() => false) === true; if (!shown) await new Promise((ok) => setTimeout(ok, 50)); }
      if (!shown) continue;   // a link the menu keeps that opens no page of its own
      pictured++;
      await call(function (css) { let s = document.getElementById('sg-shots-quiet'); if (!s) { s = document.createElement('style'); s.id = 'sg-shots-quiet'; document.head.appendChild(s); } s.textContent = css; scrollTo(0, 0); }, QUIET);
      const h = Math.min(MAX_HEIGHT, Math.max(900, Number(await run('document.documentElement.scrollHeight')) || 900));
      await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: h, deviceScaleFactor: 1, mobile: false }, sessionId);
      await run('new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(ok, 120))))', true);
      const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
      const now = Buffer.from(shot.data, 'base64');
      const file = join(lastDir, `${safe(id)}.png`);
      if (existsSync(file)) {
        const before = readFileSync(file);
        if (!before.equals(now)) {
          const r = await run(compareExpression(`data:image/png;base64,${before.toString('base64')}`, `data:image/png;base64,${shot.data}`, '#ffffff', 16, [], 1), true);
          const share = changedShare(r);
          if (share > CHANGED) {
            mkdirSync(diffDir, { recursive: true });
            const diff = join(diffDir, `${safe(id)}.png`);
            writeFileSync(diff, Buffer.from(r.png, 'base64'));
            changed.push({ id, title, share, diff });
          }
        }
        compared++;
      } else fresh++;
      writeFileSync(file, now);
      await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    }
    // A page the menu no longer lists has no picture left to be compared with.
    const listed = new Set([...take.map(([id]) => `${safe(id)}.png`), 'sigs.json']);
    for (const f of readdirSync(lastDir)) if (!listed.has(f)) rmSync(join(lastDir, f), { force: true });
    if (sigs) writeFileSync(sigsFile, JSON.stringify({ pages: sigs.pages }) + '\n');
    close();
    return { pages: pictured, compared, changed, fresh, kept, left: list.length - take.length, ms: Date.now() - started };
  } catch (e) {
    return { skipped: String(e?.message ?? e).split('\n')[0] };
  } finally { c.kill(); }
}

export function shotLines(r, dir, root = process.cwd()) {
  const where = relative(root, dir) || dir;
  if (r.skipped) return [`   The style guide's own pages not pictured (${r.skipped}).`];
  const left = r.left ? `; the other ${r.left} pages are not pictured` : '';
  if (!r.compared) return [`📸 The style guide's own pages pictured (${r.pages}${left}), for the next build to compare with: ${where}/last.`];
  const keptSay = r.kept ? `; ${r.kept} drawn from what they were drawn from before, so not pictured again` : '';
  if (!r.changed.length) return [`📸 The style guide's own pages: none of ${r.compared} changed since the last build${r.fresh ? ` (${r.fresh} new)` : ''}${keptSay}${left}.`];
  const pct = (s) => `${s * 100 < 1 ? (s * 100).toFixed(1) : Math.round(s * 100)}%`;
  return [`📸 The style guide's own pages: ${r.changed.length} of ${r.compared} changed since the last build (${r.changed.map((c) => `${c.title} ${pct(c.share)}`).join(', ')})${r.fresh ? `, ${r.fresh} new` : ''}${left}.`,
    `   What changed is marked in ${where}/diff. A change nobody meant is a fault in the page: words are hidden in the pictures, so it is the layout or the look.`];
}

// styleguide-shots.mjs - the style guide's own pages, pictured each build and compared with the build before.
//
// The checks hold the page to the system's tokens and to accessibility, but a change to the template, its data or the
// engine can still move a page's layout without anyone seeing it. Here a build that opens the page in a browser
// pictures each page the menu lists (Status, the foundations, each component's page, at most MAX_PAGES), at one window
// size, in light, with motion off and every word made invisible (a date, a count or an age changes every build and is
// not the look), and compares each picture with the last build's. A page whose picture changed is said, with how much
// of it, and a picture of what changed is written beside it. Nothing fails: a change may be meant.
//
//   guideShots(page, dir, { chromePath })  → { pages, compared, changed: [{ id, title, share, diff }], fresh, left, ms } | { skipped }
//   shotLines(r, dir)                      → the build's lines
//   changedShare({ diff, total })          → the share of pixels that changed, 0 to 1
//
// The pictures live in <out>/styleguide-shots/: last/ (this build's, compared with by the next one) and diff/ (what
// changed, this build only). Reads only the page; writes only there.

import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
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

export async function guideShots(page, dir, { chromePath = findChrome({ playwright: true }), max = MAX_PAGES } = {}) {
  if (!chromePath || typeof WebSocket === 'undefined') return { skipped: 'no Chrome' };
  const started = Date.now();
  const lastDir = join(dir, 'last'), diffDir = join(dir, 'diff');
  rmSync(diffDir, { recursive: true, force: true });
  mkdirSync(lastDir, { recursive: true });
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
    const ids = (await run(`[...document.querySelectorAll('.sg-nav a[href^="#"]')].map((a) => [a.getAttribute('href').slice(1), a.textContent.trim()])`)) ?? [];
    const list = [...ids.filter(([id]) => !/^c-/.test(id)), ...ids.filter(([id]) => /^c-/.test(id))];
    const take = list.slice(0, max);
    const changed = [];
    let compared = 0, fresh = 0, pictured = 0;
    for (const [id, title] of take) {
      await run(`location.hash = ${JSON.stringify('#' + id)}`);
      const shown = await waitForTrue(send, sessionId, `(() => { const s = document.getElementById(${JSON.stringify(id)}); return !!s && !s.hidden && s.getBoundingClientRect().height > 0; })()`, { attempts: 200, tolerateErrors: true });
      if (!shown) continue;   // a link the menu keeps that opens no page of its own
      pictured++;
      await run(`(() => { let s = document.getElementById('sg-shots-quiet'); if (!s) { s = document.createElement('style'); s.id = 'sg-shots-quiet'; document.head.appendChild(s); } s.textContent = ${JSON.stringify(QUIET)}; scrollTo(0, 0); })()`);
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
    const kept = new Set(take.map(([id]) => `${safe(id)}.png`));
    for (const f of readdirSync(lastDir)) if (!kept.has(f)) rmSync(join(lastDir, f), { force: true });
    close();
    return { pages: pictured, compared, changed, fresh, left: list.length - take.length, ms: Date.now() - started };
  } catch (e) {
    return { skipped: String(e?.message ?? e).split('\n')[0] };
  } finally { c.kill(); }
}

export function shotLines(r, dir, root = process.cwd()) {
  const where = relative(root, dir) || dir;
  if (r.skipped) return [`   The style guide's own pages not pictured (${r.skipped}).`];
  const left = r.left ? `; the other ${r.left} pages are not pictured` : '';
  if (!r.compared) return [`📸 The style guide's own pages pictured (${r.pages}${left}), for the next build to compare with: ${where}/last.`];
  if (!r.changed.length) return [`📸 The style guide's own pages: none of ${r.compared} changed since the last build${r.fresh ? ` (${r.fresh} new)` : ''}${left}.`];
  const pct = (s) => `${s * 100 < 1 ? (s * 100).toFixed(1) : Math.round(s * 100)}%`;
  return [`📸 The style guide's own pages: ${r.changed.length} of ${r.compared} changed since the last build (${r.changed.map((c) => `${c.title} ${pct(c.share)}`).join(', ')})${r.fresh ? `, ${r.fresh} new` : ''}${left}.`,
    `   What changed is marked in ${where}/diff. A change nobody meant is a fault in the page: words are hidden in the pictures, so it is the layout or the look.`];
}

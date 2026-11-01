// page-render.mjs - a prototype page in the project's own code, drawn and tried as a person would meet it: at a phone's,
// a tablet's and a desktop's width (Figma's breakpoints when it has them), with its words as written and 40% longer (as
// a translation makes them). What runs past the screen's edge, is cut, spills out of its box, wraps inside a control,
// or is smaller than 24px to tap on a phone is said, with the words it is about.
//
// The page is drawn by the harness the system's own components are drawn with: a Vue page by the project's own build
// (vue-harness.mjs, as a Showroom screen), a React page through the engine's stand-in for React (component-harness.mjs).
// A page it cannot draw (another framework, a build that is missing, a page that throws) says why: nothing is guessed.
import { resolve } from 'node:path';
import { screenWidths, fitFindings, fitLines } from './prototype-render.mjs';

// The measurement, in the page: the drawn page's box released to the window's width; then each problem with its words
// and the element it is in (its first class, else its tag).
export const STRESS_EXPRESSION = (group, longer, phone) => `(async () => {
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const sec = document.querySelector('[data-dse-component="${group}"]');
  if (!sec) return { why: 'the page did not draw' };
  const box = sec.querySelector('[data-dse-case]') || sec;
  box.style.width = '100%'; box.style.height = 'auto'; box.style.maxWidth = '100%';
  const orig = new Map();
  const texts = () => { const out = [], w = document.createTreeWalker(box, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) if (n.textContent.trim() && !n.parentNode.closest('svg, script, style')) out.push(n); return out; };
  if (${longer ? 'true' : 'false'}) {
    const longerText = (t) => { const core = t.trim(); if (!core) return t; return t.replace(core, core + ' ' + 'ẋ'.repeat(Math.max(2, Math.ceil(core.length * 0.4)))); };
    for (const n of texts()) { orig.set(n, n.textContent); n.textContent = longerText(n.textContent); }
  }
  await frame();
  const out = [];
  const nameOf = (e) => { for (let a = e; a && a !== box; a = a.parentElement) { const c = [...a.classList].find((x) => !/^(dse-|v-|router-)/.test(x)); if (c) return '.' + c; } return e.tagName.toLowerCase(); };
  const say = (n) => (orig.get(n) ?? n.textContent).trim().replace(/\\s+/g, ' ').slice(0, 60);
  const vw = document.documentElement.clientWidth;
  const scrolls = (e) => { for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) { const cs = getComputedStyle(a); if (/auto|scroll|hidden|clip/.test(cs.overflowX) && a.getBoundingClientRect().right <= vw + 1) return true; } return false; };
  const all = [...box.querySelectorAll('*')].filter((e) => !e.closest('svg'));
  const past = all.filter((e) => { const b = e.getBoundingClientRect(); return b.width && (b.right > vw + 1 || b.left < -1) && !scrolls(e); });
  for (const e of past.filter((e) => !past.some((o) => o !== e && e.contains(o))).slice(0, 6)) { const b = e.getBoundingClientRect(); out.push({ kind: 'wide', path: nameOf(e), component: nameOf(e), text: (e.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 40), over: Math.round(Math.max(b.right - vw, -b.left)) }); }
  const CONTROL = 'button, a, label, [role=button], [role=tab], [role=switch], [role=option], [role=menuitem], [role=checkbox], [role=radio]';
  for (const n of texts()) {
    const el = n.parentElement; if (!el || !el.getClientRects().length) continue;
    const r = document.createRange(); r.selectNodeContents(n);
    const tr = r.getBoundingClientRect(); if (!tr.width) continue;
    const lines = new Set([...r.getClientRects()].filter((x) => x.width > 1).map((x) => Math.round(x.top))).size;
    let cut = null;
    for (let a = el; a && a !== box; a = a.parentElement) {
      const cs = getComputedStyle(a), ar = a.getBoundingClientRect();
      if ((/hidden|clip/.test(cs.overflowX + cs.overflow) || cs.textOverflow === 'ellipsis') && (tr.right > ar.right + 1 || tr.left < ar.left - 1 || (a === el && a.scrollWidth > a.clientWidth + 1))) { cut = a; break; }
    }
    if (cut) out.push({ kind: 'cut', path: nameOf(el), component: nameOf(el), text: say(n) });
    else if (lines > 1 && el.closest(CONTROL) && box.contains(el.closest(CONTROL))) out.push({ kind: 'wraps', path: nameOf(el), component: nameOf(el), text: say(n), lines });
  }
  if (${phone ? 'true' : 'false'}) for (const t of box.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=switch], [role=checkbox], [role=radio], [role=option], [role=link]')) {
    const b = t.getBoundingClientRect(); if (!b.width || !b.height) continue;
    const lab = t.closest('label'), lb = lab ? lab.getBoundingClientRect() : null;
    const w = Math.max(b.width, lb ? lb.width : 0), h = Math.max(b.height, lb ? lb.height : 0);
    if (w < 24 || h < 24) out.push({ kind: 'target', path: nameOf(t) + ':' + Math.round(b.left) + ',' + Math.round(b.top), component: nameOf(t), text: (t.getAttribute('aria-label') || t.textContent || t.getAttribute('placeholder') || '').trim().replace(/\\s+/g, ' ').slice(0, 40), w: Math.round(w), h: Math.round(h) });
  }
  for (const [n, t] of orig) n.textContent = t;
  return { issues: out };
})()`;

// Draw the page and try it. → { widths, findings, lines } | { why }
export async function stressPage(ROOT, cfg, file, { breakpoints = [], chromePath = null } = {}) {
  const abs = resolve(ROOT, file);
  const syntax = /\.vue$/i.test(file) ? 'vue' : /\.(jsx|tsx)$/i.test(file) ? 'react' : null;
  if (!syntax) return { why: `drawing a ${String(file).split('.').pop()} page is not built yet: only its code was checked` };
  if (typeof WebSocket === 'undefined') return { why: 'Node 22 or later is needed to drive Chrome' };
  const { findChrome, launchChrome, connectCDP, openPage, waitForTrue } = await import('./cdp.mjs');
  const chrome = chromePath ?? findChrome({ playwright: true });
  if (!chrome) return { why: 'Chrome not found (set CHROME_PATH)' };
  const group = syntax === 'vue' ? 'showroom:prototype' : 'prototype';
  let h;
  try {
    if (syntax === 'vue') h = await (await import('./vue-harness.mjs')).startVueHarness(ROOT, cfg, [group], { locate: () => abs });
    else h = await (await import('./component-harness.mjs')).startHarness(ROOT, cfg, [group], { locate: () => abs });
  } catch (e) { return { why: `the page could not be served (${String(e.message).split('\n')[0]})` }; }
  if (!h?.url) return { why: h?.why ?? 'the page could not be served' };
  let browser = null, cdp = null;
  try {
    browser = await launchChrome(chrome, { tmpPrefix: 'dse-page-' });
    cdp = await connectCDP(browser.wsUrl);
    const { sessionId } = await openPage(cdp.send, h.url);
    if (!(await waitForTrue(cdp.send, sessionId, 'window.__dseHarnessReady === true', { attempts: 1200, intervalMs: 50, tolerateErrors: true }))) return { why: 'the page did not finish drawing within a minute' };
    const failed = (await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify(window.__dseHarnessFailed || [])', returnByValue: true }, sessionId)).result?.value;
    const why = JSON.parse(failed ?? '[]').find((f) => String(f.name).includes('prototype'))?.why;
    if (why) return { why: `the page, or a component on it, threw as it drew (${String(why).slice(0, 200)}): its data is probably not what a component reads` };
    const widths = screenWidths(breakpoints);
    const phone = Math.min(...widths.map((w) => w.px));
    const raw = [];
    for (const w of widths) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: w.px, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);   // the width alone: a phone's layout viewport would lay it out 980px wide
      for (const longer of [false, true]) {
        const r = (await cdp.send('Runtime.evaluate', { expression: STRESS_EXPRESSION(group, longer, w.px === phone), returnByValue: true, awaitPromise: true }, sessionId)).result?.value;
        if (r?.why) return { why: r.why };
        raw.push({ state: 'default', width: `${w.name} (${w.px}px)`, longer, issues: r?.issues ?? [] });
      }
    }
    const findings = fitFindings(raw);
    return { widths: widths.map((w) => `${w.name} (${w.px}px)`), findings, lines: fitLines(findings) };
  } catch (e) { return { why: String(e.message).split('\n')[0] }; }
  finally { try { cdp?.close(); } catch { /* closed */ } try { browser?.kill(); } catch { /* gone */ } try { await h.close?.(); } catch { /* closed */ } }
}

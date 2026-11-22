// user-settings.mjs - what a person meets with the settings they use: zoomed in, and with a screen magnifier.
//
// The browser checks already try reflow at 320px, text spacing and forced colours. A page can pass all of them and
// still hide its Save button from someone zoomed in, behind a bar that stays on screen. These run on the page as it is
// drawn under the setting, and say what that person meets:
//   zoomhidden   zoomed to 200% or 400% (the page drawn 640px and 320px wide), the main action (Save, Submit,
//                Continue) cannot be seen once it takes the focus or is scrolled to: a fixed or sticky bar covers it,
//                or the bars together leave too little of the screen to read.
//   farmessage   with a magnifier (a 4x lens shows a window about 320 by 200 pixels of the page), the message that
//                says what is wrong with a field sits too far from it to be seen with it in one view.
// An error said only by its colour in forced colours is the forced-colours check's (forcedStateExpression treats an
// invalid field as one more state). None of these is an A or AA criterion: they are advice on a row of their own, and a
// run that finds nothing says none were found, never that the page is accessible.
//
//   ZOOM_LEVELS                     → [{ zoom, width, height }] the screens a 1280 by 800 window becomes zoomed in
//   ZOOM_HIDDEN_JS(roots)           → in-page script: [desc] each main action a bar hides, and the bars' share when too big
//   FAR_MESSAGE_JS(roots)           → in-page script: [desc] each field whose message is out of a magnifier's view of it
//   LENS                            → { width, height } the part of the page a 4x magnifier shows
export const ZOOM_LEVELS = [{ zoom: 200, width: 640, height: 400 }, { zoom: 400, width: 320, height: 200 }];
export const LENS = { width: 320, height: 200 };

// What counts as a page's main action: a form's submit button, or a button whose words are one.
const MAIN = `const MAIN_WORDS = /^(save|submit|send|continue|next|pay|confirm|sign in|log in|apply|done|place order|checkout|book|register|create)\\b/i;
  const words = (e) => (e.getAttribute('aria-label') || e.value || e.textContent || '').trim().replace(/\\s+/g, ' ');
  const isMain = (e) => e.matches('button[type=submit],input[type=submit]') || (e.matches('form button:not([type])')) || (e.matches('button,[role=button],input[type=button]') && MAIN_WORDS.test(words(e)));`;
const COMMON = `const vis = (e) => { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const desc = (e) => (e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + ((e.className && typeof e.className === 'string' && e.className.trim()) ? '.' + e.className.trim().split(/\\s+/)[0] : '')).slice(0, 80);
  const roots = __ROOTS__;
  const scope = roots ? roots.flatMap((r) => { try { return [...document.querySelectorAll(r)]; } catch (e) { return []; } }).flatMap((r) => [r, ...r.querySelectorAll('*')]) : [...document.body.querySelectorAll('*')];`;
const withRoots = (src, roots) => src.replace('__ROOTS__', JSON.stringify(roots ?? null));

export const ZOOM_HIDDEN_JS = (roots = null) => withRoots(`(async () => {
  ${COMMON}
  ${MAIN}
  // A box that stays on screen as the page scrolls: fixed, or sticky and stuck.
  const pinned = (e) => { for (let n = e; n && n !== document.body; n = n.parentElement) { const p = getComputedStyle(n).position; if (p === 'fixed' || p === 'sticky') return n; } return null; };
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const out = [];
  // The bars together: what share of the screen they take once the page is scrolled down a little (sticky ones stick).
  scrollTo(0, Math.min(200, document.documentElement.scrollHeight)); await frame();
  const bars = [...new Set([...document.body.querySelectorAll('*')].filter((e) => { const p = getComputedStyle(e).position; return (p === 'fixed' || p === 'sticky') && vis(e); }).map((e) => pinned(e)))];
  const tall = bars.reduce((h, b) => { const r = b.getBoundingClientRect(); return r.width >= innerWidth * 0.5 ? h + Math.max(0, Math.min(innerHeight, r.bottom) - Math.max(0, r.top)) : h; }, 0);
  if (tall / innerHeight >= 0.5) out.push('the bars that stay on screen take ' + Math.round(100 * tall / innerHeight) + '% of it (' + bars.slice(0, 3).map(desc).join(', ') + ')');
  for (const el of scope) {
    if (!isMain(el) || !vis(el) || out.length >= 10) continue;
    // As a keyboard user meets it: it takes the focus and the browser scrolls it into view by the least it can.
    el.focus({ preventScroll: false }); await frame();
    const r = el.getBoundingClientRect();
    const pts = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 2, r.top + 2], [r.right - 2, r.bottom - 2]];
    const covered = pts.every(([x, y]) => { if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return true; const t = document.elementFromPoint(x, y); return t && t !== el && !el.contains(t) && !!pinned(t) && !pinned(el); });
    if (covered) { const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); out.push(desc(el) + ' "' + words(el).slice(0, 30) + '" (hidden under ' + (t ? desc(pinned(t) || t) : 'a bar that stays on screen') + ')'); }
    el.blur();
  }
  scrollTo(0, 0);
  return out;
})()`, roots);

export const FAR_MESSAGE_JS = (roots = null) => withRoots(`(() => {
  ${COMMON}
  const lens = ${JSON.stringify(LENS)};
  const out = [];
  for (const el of scope) {
    if (!el.matches('input,select,textarea,[role=textbox],[role=combobox],[role=checkbox],[role=radio],[role=switch]') || el.getAttribute('aria-invalid') !== 'true' || !vis(el)) continue;
    const ids = (el.getAttribute('aria-errormessage') || el.getAttribute('aria-describedby') || '').split(/\\s+/).filter(Boolean);
    const msgs = ids.map((i) => document.getElementById(i)).filter((m) => m && vis(m) && (m.textContent || '').trim());
    if (!msgs.length) continue;
    const f = el.getBoundingClientRect();
    // The field and its message together: wider or taller than what the lens shows, they are never in one view.
    const far = msgs.every((m) => { const r = m.getBoundingClientRect(); const w = Math.max(f.right, r.right) - Math.min(f.left, r.left), h = Math.max(f.bottom, r.bottom) - Math.min(f.top, r.top); return w > lens.width || h > lens.height; });
    if (far) out.push(desc(el) + ' (its message "' + msgs[0].textContent.trim().replace(/\\s+/g, ' ').slice(0, 40) + '" is out of a magnifier\\'s view of it)');
  }
  return out;
})()`, roots);

// a11y-browsers.mjs - the accessibility criteria a browser decides, tried in Firefox and WebKit as well as Chrome.
//
// Some criteria are the same everywhere (a contrast from the tokens, a missing alt) and some are Chrome's alone (what
// a screen reader hears, read from Chrome's accessibility tree). The rest a browser decides: where Tab goes, whether
// the focus shows, how a component reflows on a 320px screen, what text spacing and zoom cut off, how big a target is
// drawn. Layout, fonts, form controls and focus rings differ between engines, so a run in Chrome answers these for
// Chrome only. This pass runs the same measurements, plain JavaScript in the page and real key presses, through one
// driver layer (page-driver.mjs) in Chrome and in each other browser here, and says only what differs from Chrome:
// "fails in WebKit only: no visible focus on button.icon". Chrome is measured by the same code in the same pass, so
// a difference is never two ways of measuring.
//
// Safari moves Tab between text fields only unless a person turned on "Press Tab to highlight each item": Option+Tab
// reaches every control there, and is what this pass presses in WebKit, said in the result: Playwright's WebKit on Linux
// does the same. Its WebKit on Windows reaches no link from the keyboard at all, with Option or without, so what Tab
// reaches there would be the build's answer, not the page's: those two criteria are left to the other browsers there,
// and the result says so (`untried`).
//
//   PASS                                 → { [sc]: { kinds, what } } the criteria this pass answers
//   checksExpr / walkExpr ...            → the scripts, any browser
//   measure(page, roots, { altTab })     → [{ kind, sc, desc }]   one page in one browser
//   compare(chrome, other)               → { only: [...], passes: [...] }  what differs from Chrome
//   a11yBrowsers({ url, components, browsers, open, rootOf }) → the pass, per browser and component
//   browserRows(result, name)            → per criterion: { [sc]: { by: { Chrome: 'pass'|'fail', ... }, only: [desc] } }
//   browserLine(row)                     → "Chrome ✓ · Firefox ✓ · WebKit ✕"
import { deepSweepExpression, tabTrap } from './a11y-check.mjs';
import { WCAG_KIND } from './wcag21.mjs';

export const RESULT_FILE = '.design-system-engine-out/a11y-browsers.json';

// The criteria this pass answers in every browser, each by the kinds of finding it gives.
export const PASS = {
  '1.4.4': { kinds: ['zoom'], what: 'text cut off at 200% zoom' },
  '1.4.10': { kinds: ['reflow'], what: 'wider than a 320px screen' },
  '1.4.12': { kinds: ['spacing'], what: 'text cut off with wider spacing' },
  '2.1.1': { kinds: ['keyboard'], what: 'not reached by Tab' },
  '2.4.7': { kinds: ['focus'], what: 'no visible focus when Tab reaches it' },
  '2.5.8': { kinds: ['target'], what: 'a target under 24 by 24 pixels' },
  // From the same Tab walk, as Chrome's own check reads them (a11y-check.mjs): the focus held, a stop out of the
  // page's order, a control hidden behind something when the focus is on it.
  '2.1.2': { kinds: ['tabtrap'], what: 'Tab cannot leave it' },
  '2.4.3': { kinds: ['tabindex'], what: 'a positive tabindex, out of the page\'s order' },
  '2.4.11': { kinds: ['obscured'], what: 'hidden behind something when the focus is on it' },
};

const SPACING_ON = `(() => { const s = document.createElement('style'); s.id = '__engineSpacing'; s.textContent = '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }'; document.head.appendChild(s); return true; })()`;
const SPACING_OFF = `(() => { const s = document.getElementById('__engineSpacing'); if (s) s.remove(); return true; })()`;

// The controls of the components, each marked, with how it looks at rest: what Tab should reach, and what the focus
// has to change for a person to see where it is.
export const restExpr = (roots) => `(() => {
  const roots = ${JSON.stringify(roots)};
  const SEL = 'a[href],button:not([disabled]),input:not([type=hidden]):not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"]),[role=button],[role=link],[role=checkbox],[role=radio],[role=switch],[role=tab],[role=menuitem],[role=option],[role=slider],[role=combobox]';
  const els = [...new Set(roots.flatMap((s) => { try { return [...document.querySelectorAll(s)]; } catch { return []; } }).flatMap((r) => [...r.querySelectorAll(SEL)]))]
    .filter((e) => { const b = e.getBoundingClientRect(); const s = getComputedStyle(e); return b.width > 0 && b.height > 0 && s.visibility !== 'hidden' && !e.closest('[inert],[hidden],[aria-disabled=true]'); });
  // The walk starts just before the components, as a person arrives at them, not at the top of a page whose own
  // controls (a menu, a toolbar) would take every press first: a stop of the engine's own, focused and then left.
  const first = roots.map((s) => { try { return document.querySelector(s); } catch { return null; } }).find(Boolean);
  if (first) { const start = document.createElement('span'); start.tabIndex = 0; start.setAttribute('data-engine-start', ''); first.parentNode.insertBefore(start, first); start.focus(); }
  return els.map((e, i) => { e.setAttribute('data-engine-k', String(i)); return { i, desc: (e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\\s+/).join('.') : '')).slice(0, 80) }; });
})()`;
// How an element looks, in the properties a focus indicator changes.
const LOOK = `(e) => { const s = getComputedStyle(e); return [s.outlineStyle === 'none' ? 'none' : s.outlineStyle + ' ' + s.outlineWidth + ' ' + s.outlineColor, s.boxShadow, s.borderTopColor + ' ' + s.borderTopWidth, s.backgroundColor, s.color, s.textDecorationLine].join('|'); }`;
export const looksExpr = `(() => { const look = ${LOOK}; return [...document.querySelectorAll('[data-engine-k]')].map((e) => look(e)); })()`;
// Where the focus is after a key press, and how it looks there.
export const activeExpr = `(() => { const look = ${LOOK}; const a = document.activeElement; const k = a && a.getAttribute && a.getAttribute('data-engine-k'); return k == null ? null : { k: +k, look: look(a) }; })()`;

// Whether a browser's Tab is pressed with Option (WebKit's), and whether its Tab says anything of the page at all
// (not WebKit's on Windows, which skips every link).
export const altTabIn = (name) => name === 'webkit';
export const TAB_SCS = ['2.1.1', '2.4.7'];
export const untriedIn = (name, platform = process.platform) => (name === 'webkit' && platform === 'win32' ? TAB_SCS : []);

// One page in one browser: the six checks on the components' roots. altTab: press Option+Tab (Safari).
export async function measure(page, roots, { altTab = false, tab = true, width = 1280, height = 900 } = {}) {
  const out = [];
  const add = (kind, desc) => { const k = `${kind}|${desc}`; if (!out.some((o) => `${o.kind}|${o.desc}` === k)) out.push({ kind, sc: WCAG_KIND[kind], desc }); };
  const clipped = async () => new Set((await page.evaluate(deepSweepExpression(roots, 'clipped'))) ?? []);
  await page.setViewport(width, height);
  // 1.4.12: only text newly cut off counts.
  let before = await clipped();
  await page.evaluate(SPACING_ON);
  for (const d of await clipped()) if (!before.has(d)) add('spacing', d);
  await page.evaluate(SPACING_OFF);
  // 1.4.4: half the width is 200% zoom, for what the layout does.
  before = await clipped();
  await page.setViewport(Math.round(width / 2), Math.round(height / 2));
  for (const d of await clipped()) if (!before.has(d)) add('zoom', d);
  // 1.4.10: each component on a 320px screen.
  await page.setViewport(320, 640);
  for (const x of (await page.evaluate(deepSweepExpression(roots, 'narrow'))) ?? []) add('reflow', `${x.el} (it cannot be narrower than ${x.width}px)`);
  await page.setViewport(width, height);
  // 2.5.8: a target under 24 by 24 pixels with no room around it.
  for (const x of ((await page.evaluate(deepSweepExpression(roots, 'targets'))) ?? {}).small ?? []) add('target', x.desc);
  // 2.1.1 and 2.4.7: Tab through, from the top, and watch where the focus goes and whether it shows.
  const controls = (await page.evaluate(restExpr(roots))) ?? [];
  if (tab && controls.length && page.press) {
    // 2.4.3: a positive tabindex inside the components takes its control out of the page's order.
    for (const d of (await page.evaluate(`(() => { const roots = ${JSON.stringify(roots)}; return roots.flatMap((s) => { try { return [...document.querySelectorAll(s)]; } catch { return []; } }).flatMap((r) => [...r.querySelectorAll('[tabindex]')]).filter((e) => +e.getAttribute('tabindex') > 0).map((e) => (e.tagName.toLowerCase() + (e.id ? '#' + e.id : '')).slice(0, 60)); })()`)) ?? []) add('tabindex', d);
    const rest = (await page.evaluate(looksExpr)) ?? [];
    const reached = new Map(), seq = [];
    let outside = 0;
    const presses = Math.min(80, controls.length * 2 + 10);
    for (let i = 0; i < presses; i++) {
      await page.press('Tab', { alt: altTab });
      const a = await page.evaluate(activeExpr);
      seq.push(await page.evaluate(deepSweepExpression(null, 'active')));
      if (a && !reached.has(a.k)) reached.set(a.k, a.look !== rest[a.k]);
      // 2.4.11: a control of the components the focus is on, hidden behind something else.
      if (a) { const ob = await page.evaluate(deepSweepExpression(null, 'obscured')); if (ob) add('obscured', ob); }
      if (reached.size === controls.length) break;
      // Gone past the components and staying past them: the rest of the page is not theirs.
      outside = a ? 0 : outside + 1;
      if (reached.size && outside >= 3) break;
    }
    // 2.1.2: the focus held on the components, going round or staying put, forwards and with Shift+Tab.
    const stops = (await page.evaluate(deepSweepExpression(null, 'stops'))) ?? 0;
    let trap = tabTrap(seq, { stops });
    if (!trap) {
      const back = [];
      for (let i = 0; i < presses; i++) { await page.press('Tab', { alt: altTab, shift: true }); back.push(await page.evaluate(deepSweepExpression(null, 'active'))); }
      const t = tabTrap(back, { stops }); if (t) trap = { ...t, how: ' (with Shift+Tab)' };
    }
    // Only a trap on this component's own controls is its own: the walk goes on past it, into the rest of the page.
    if (trap) {
      const ids = trap.ids ?? [Number(String([...seq].reverse().find((x) => x && x.split('|').slice(1).join('|') === trap.at) ?? '').split('|')[0])];
      const mine = await page.evaluate(`(() => { const roots = ${JSON.stringify(roots)}, all = [...document.querySelectorAll('*')]; return ${JSON.stringify(ids)}.some((i) => { const el = all[i]; return !!el && roots.some((s) => { try { return !!el.closest(s); } catch { return false; } }); }); })()`);
      if (mine) add('tabtrap', trap.cycle ? `Tab goes round ${trap.cycle.length} controls (${trap.cycle.join(', ')}) and never leaves them${trap.how ?? ''}` : `${trap.at}${trap.how ?? ''}`);
    }
    await page.evaluate(`(() => { document.querySelectorAll('[data-engine-start]').forEach((e) => e.remove()); return true; })()`);
    for (const c of controls) {
      if (!reached.has(c.i)) add('keyboard', c.desc);
      else if (!reached.get(c.i)) add('focus', c.desc);
    }
  }
  return out;
}

// What one browser found that Chrome did not (fails there only), and what Chrome found that it did not (passes there).
export function compare(chrome = [], other = []) {
  const key = (f) => `${f.kind}|${f.desc}`;
  const c = new Set(chrome.map(key)), o = new Set(other.map(key));
  return { only: other.filter((f) => !c.has(key(f))), passes: chrome.filter((f) => !o.has(key(f))) };
}

// The pass: each component's page in Chrome and in each other browser, the same checks, one browser at a time.
// browsers: [{ name, path }] with Chrome first. → { at, browsers: [{ name, label, altTab? }], components: { [name]:
// { [label]: [finding] } }, refused: [line] }
export async function a11yBrowsers({ url, components = [], browsers = [], open, rootOf }) {
  const out = { at: new Date().toISOString(), browsers: [], components: {}, refused: [] };
  for (const { name, path } of browsers) {
    let b = null;
    try {
      b = await open(name, path, { scheme: 'light' });
      const altTab = altTabIn(name), untried = untriedIn(name);
      out.browsers.push({ name, label: b.label, ...(altTab ? { altTab: true } : {}), ...(untried.length ? { untried } : {}) });
      for (const comp of components) {
        const page = await b.page(url(comp), { width: 1280, height: 900 });
        try { (out.components[comp] ??= {})[b.label] = await measure(page, [rootOf(comp)], { altTab, tab: !untried.length }); }
        catch (e) { out.refused.push(`${b.label}, ${comp}: ${String(e?.message ?? e).split('\n')[0]}`); }
        finally { await page.close(); }
      }
    } catch (e) {
      out.refused.push(`${b?.label ?? name}: ${String(e?.message ?? e).split('\n')[0]}`);
    } finally { if (b) await b.close().catch(() => {}); }
  }
  return out;
}

// Per criterion, for one component: each browser's pass or fail, and what fails in another browser only, said as
// "fails in WebKit only: <desc>". A criterion no browser here was tried for is left out.
export function browserRows(result, name) {
  const own = result?.components?.[name];
  if (!own) return {};
  const all = (result.browsers ?? []).filter((b) => own[b.label]);
  const chrome = own.Chrome;
  const rows = {};
  for (const [sc, p] of Object.entries(PASS)) {
    const by = {}, only = [];
    // A browser that left this criterion untried is not counted as passing it.
    const labels = all.filter((b) => !(b.untried ?? []).includes(sc)).map((b) => b.label);
    for (const l of labels) {
      const mine = (own[l] ?? []).filter((f) => p.kinds.includes(f.kind));
      by[l] = mine.length ? 'fail' : 'pass';
      if (l !== 'Chrome' && chrome) for (const f of compare(chrome.filter((x) => p.kinds.includes(x.kind)), mine).only) only.push({ browser: l, desc: f.desc });
    }
    if (labels.length) rows[sc] = { by, only };
  }
  // A finding in more than one other browser is said once, with each.
  for (const r of Object.values(rows)) {
    const merged = new Map();
    for (const o of r.only) { const m = merged.get(o.desc); if (m) m.browsers.push(o.browser); else merged.set(o.desc, { desc: o.desc, browsers: [o.browser] }); }
    r.only = [...merged.values()];
  }
  return rows;
}

// The line under a row: "Chrome ✓ · Firefox ✓ · WebKit ✕".
export const browserLine = (row) => Object.entries(row?.by ?? {}).map(([l, v]) => `${l} ${v === 'pass' ? '✓' : '✕'}`).join(' · ');
// What fails in another browser only, in words: "Fails in WebKit only: no visible focus when Tab reaches it, button.icon".
export const onlyLine = (sc, o) => `Fails in ${o.browsers.join(' and ')} only: ${PASS[sc]?.what ?? 'it fails'}, ${o.desc}`;

// How many criteria differ by browser across the components: the Status page's count.
export function differByBrowser(result) {
  const scs = new Set();
  for (const name of Object.keys(result?.components ?? {})) for (const [sc, r] of Object.entries(browserRows(result, name))) if (new Set(Object.values(r.by)).size > 1) scs.add(sc);
  return [...scs].sort();
}

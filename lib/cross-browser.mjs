// cross-browser.mjs - the same measurements drawn in Firefox and WebKit, and only what differs from Chrome said.
//
// Rendered parity (rendered-check.mjs) reads each component's computed styles in Chrome. Layout, fonts and form
// controls differ between engines, so the same assertions are measured again in the other browsers here (through
// page-driver.mjs) and set beside Chrome's: a value the same in both is said nowhere, and a value that differs is one
// line, "in Firefox, .toolbar → height is 54px (Chrome draws 56px)". Chrome stays the reference the contract is held
// to; the other browsers are compared with Chrome, never with the contract, so a value Chrome gets wrong is one
// finding and not three.
//
// Advisory: a difference between browsers is the system's to decide (a font that falls back, a control the browser
// draws), never a failure of the contract.
//
//   measureExpr(asserts)                 → the script that measures them in a page (any browser)
//   crossBrowsers(found, cfg)            → [{ name, path }] the browsers to try, in order
//   differences({ asserts, chrome, other, label })   → [line]
//   untried(asserts, scheme, label, why) → [line]  what a browser could not be put in the scheme for
//   crossPass({ byPlugin, chromeGot, urlOf, switchOf, browsers, open }) → { lines, tried, refused }
import { renderedMatches } from './rendered-expect.mjs';
import { defaultBrowsers } from './browsers.mjs';
import { drivenBy } from './playwright.mjs';

// One script for every browser: plain JavaScript, no protocol of any browser's own.
export function measureExpr(asserts) {
  return `(() => {
      const asserts = ${JSON.stringify(asserts.map((a) => ({ selector: a.selector, probe: a.probe, prop: a.prop, pseudo: a.pseudo ?? null })))};
      // Probes render inside an absolutely-positioned host so the app shell's own
      // flex/grid layout (e.g. body { display:flex; height:100vh }) cannot stretch
      // or shrink them - computed values must reflect the component's own rules.
      const probeHost = document.createElement('div');
      probeHost.style.cssText = 'position:absolute;left:0;top:0;width:600px;visibility:hidden;display:block;';
      document.body.appendChild(probeHost);
      const out = asserts.map(a => {
        let el = document.querySelector(a.selector);
        // One the page holds but does not draw on load (in a closed panel, a list not filled yet) has no size of its own
        // (its height reads auto): the probe, drawn, is measured instead.
        if (el && a.probe && !el.getClientRects().length) el = null;
        if (!el && a.probe) {
          probeHost.insertAdjacentHTML('beforeend', a.probe);
          el = probeHost.querySelector(a.selector) ?? document.querySelector(a.selector);
        }
        return el ? getComputedStyle(el, a.pseudo)[a.prop] : '(selector not found)';
      });
      probeHost.remove(); // isolate probe markup between scheme groups
      return out;
    })()`;
}

// Transitions off before anything is measured, in every browser alike.
export const NO_TRANSITIONS = `(() => { if (document.getElementById('__designSystemEngine_no_transitions__')) return; const s = document.createElement('style'); s.id = '__designSystemEngine_no_transitions__'; s.textContent = '*,*::before,*::after{transition:none !important;animation:none !important}'; document.head.appendChild(s); })()`;

// Firefox whenever it is here: it draws headless, so nobody sees it run. WebKit whenever Playwright drives it, headless
// too, and otherwise only when the project asks for it (ds-config.json rendered.browsers), since Safari opens a window
// of its own on the person's screen while it runs.
export function crossBrowsers(found = {}, cfg = {}) {
  const asked = cfg.rendered?.browsers;
  const want = Array.isArray(asked) ? asked.map((b) => String(b).toLowerCase()) : defaultBrowsers(found);
  return ['firefox', 'webkit'].filter((n) => want.includes(n) && found[n]).map((name) => ({ name, path: found[name] }));
}

const where = (a) => `${a.plugin} ${a.selector}${a.pseudo ?? ''} → ${a.prop}`;

export function differences({ asserts = [], chrome = [], other = [], label = 'Firefox' } = {}) {
  const out = [];
  asserts.forEach((a, i) => {
    const c = chrome[i], o = other[i];
    if (c == null || o == null || String(c).startsWith('(')) return;
    if (renderedMatches(o, c)) return;
    out.push(`in ${label}, ${where(a)} is ${o} (Chrome draws ${c})`);
  });
  return out;
}

export const untried = (asserts = [], scheme, label = 'WebKit', why = label === 'WebKit' ? 'Safari draws in the Mac\'s own appearance, and nothing sets it' : 'it cannot be put in that scheme') =>
  asserts.length ? [`in ${label}, ${asserts.length} value${asserts.length === 1 ? '' : 's'} in the ${scheme} scheme not tried: ${why}`] : [];

// What a scheme switch asks of the browser beyond JavaScript: its colour scheme, and whether it asks for any other
// media feature (more contrast, forced colours) that only Chrome can be put in.
export function schemeNeeds(sw = {}) {
  const media = sw.media ?? [];
  const color = media.find((f) => f.name === 'prefers-color-scheme')?.value ?? 'light';
  const other = media.filter((f) => f.name !== 'prefers-color-scheme' && !(f.name === 'prefers-contrast' && f.value === 'no-preference'));
  return { color, chromeOnly: other.length ? other.map((f) => `${f.name}: ${f.value}`).join(' · ') : null, viewport: sw.viewport ?? null };
}

// The pass: each plugin's assertions, grouped by scheme as Chrome measured them, measured again in each browser.
//   byPlugin    { plugin: [assert] }   (no forcePseudo ones: forcing a pseudo-class is Chrome's own)
//   chromeGot   { plugin: [value] }    aligned with byPlugin
//   urlOf       plugin → file URL
//   switchOf    assert → schemeSwitch() for it
export async function crossPass({ byPlugin = {}, chromeGot = {}, urlOf, switchOf, browsers = [], open }) {
  const lines = [], tried = [], refused = [];
  for (const { name, path } of browsers) {
    const opened = new Map();   // colour scheme → browser (Firefox takes it at start)
    let label = null;
    const browserFor = async (color) => {
      if (opened.has(color)) return opened.get(color);
      const b = await open(name, path, { scheme: color });
      opened.set(color, b); label = b.label;
      return b;
    };
    try {
      for (const [plugin, asserts] of Object.entries(byPlugin)) {
        const groups = new Map();
        asserts.forEach((a, i) => { const sw = switchOf(a); if (sw.unsupported) return; const k = JSON.stringify(sw); if (!groups.has(k)) groups.set(k, { sw, idx: [] }); groups.get(k).idx.push(i); });
        for (const { sw, idx } of groups.values()) {
          const need = schemeNeeds(sw);
          const group = idx.map((i) => asserts[i]);
          // Safari draws in the Mac's own appearance. Playwright's WebKit is put in any scheme, as Firefox is.
          const b = await browserFor(name === 'webkit' && drivenBy('webkit', { path }) !== 'playwright' ? 'system' : need.color);
          if (need.chromeOnly) { lines.push(...untried(group, need.color, b.label, `only Chrome can be put in ${need.chromeOnly}`)); continue; }
          const page = await b.page(urlOf(plugin), need.viewport ? { width: need.viewport, height: 800 } : undefined);
          try {
            if (b.scheme === null) {
              const dark = await page.evaluate('matchMedia("(prefers-color-scheme: dark)").matches');
              if ((dark ? 'dark' : 'light') !== need.color) { lines.push(...untried(group, need.color, b.label)); continue; }
            }
            await page.evaluate(NO_TRANSITIONS);
            if (sw.apply) await page.evaluate(sw.apply);
            const vals = await page.evaluate(measureExpr(group)) ?? [];
            lines.push(...differences({ asserts: group, chrome: idx.map((i) => chromeGot[plugin]?.[i]), other: vals, label: b.label }));
          } finally { await page.close(); }
        }
      }
      if (label) tried.push(label);
    } catch (e) {
      refused.push(`${label ?? (name === 'webkit' ? 'WebKit' : 'Firefox')}: ${String(e?.message ?? e).split('\n')[0]}`);
    } finally {
      for (const b of opened.values()) await b.close().catch(() => {});
    }
  }
  return { lines, tried, refused };
}

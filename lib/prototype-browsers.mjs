// prototype-browsers.mjs - a drawn prototype at every width, in Firefox and WebKit as well as Chrome.
//
// The prototype check tries the page at every screen width, in every state, with the words as written and 40% longer
// (prototype-render.mjs, FIT_EXPRESSION). Fonts, form controls and line breaking differ between engines, so a label
// that fits in Chrome can wrap in WebKit at 768px. This pass draws the same page through one driver layer
// (page-driver.mjs) in Chrome and in each other browser here, runs the same measurement in each, keeps a picture of
// each width, and says only what differs from Chrome: "wraps onto two lines at tablet, in WebKit only". Chrome is
// measured by the same code in the same pass, so a difference is never two ways of measuring.
//
//   fitRuns(page, { widths, states })            → [{ state, width, longer, issues }]   one page in one browser
//   fitOnly(chrome, other)                        → the runs' issues found in `other` and not in Chrome
//   prototypeBrowsers({ url, widths, browsers, open, dir, name }) → { browsers, runs: { [label]: runs }, pictures, refused }
//   browserFitLines(result, { states })           → ["⚠️  … at tablet, in WebKit only", …]
//   prototypeBrowserList(found, cfg)              → [{ name, path }] the browsers beside Chrome (prototype.browsers)
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { FIT_EXPRESSION, fitFindings, fitLines, FONTS_IN } from './prototype-render.mjs';
import { defaultBrowsers } from './browsers.mjs';

// The browsers beside Chrome a prototype is drawn in: ds-config.json prototype.browsers, else Firefox, and WebKit when
// Playwright drives it headless (Safari opens a window of its own, so only when named). false or [] turns it off.
export function prototypeBrowserList(found = {}, cfg = {}) {
  const asked = cfg.prototype?.browsers;
  if (asked === false) return [];
  const want = Array.isArray(asked) ? asked.map((b) => String(b).toLowerCase()) : defaultBrowsers(found);
  return ['firefox', 'webkit'].filter((n) => want.includes(n) && found[n]).map((name) => ({ name, path: found[name] }));
}

const DRAWN = `!!document.querySelector('[data-pt-path="0"]')`;
const slugOf = (s) => String(s).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';
const lit = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

// Every state at every width, as written and longer, in one browser; a picture of each width as written.
export async function fitRuns(page, { widths = [], states = null, shoot = null } = {}) {
  const runs = [];
  const all = states ?? ((await page.evaluate('window.__ptStates || ["default"]')) ?? ['default']);
  for (const w of widths) {
    await page.setViewport(w.px, 900);
    await page.evaluate(`(() => { window.__ptSize && window.__ptSize(${lit(w.name)}); return true; })()`);
    for (const st of all) {
      for (const longer of [false, true]) runs.push({ state: st, width: w.name, longer, issues: (await page.evaluate(FIT_EXPRESSION(st, longer, w.px < 600))) ?? [] });
      if (st === 'default' && shoot) await shoot(w);
    }
  }
  await page.evaluate('(() => { window.__ptShow && window.__ptShow("default"); return true; })()').catch(() => null);
  return Object.assign(runs, { states: all });
}

// What one browser found that Chrome did not, at the same width, in the same state and with the same words.
const issueKey = (run, i) => [i.kind, i.path, i.text ?? '', run.width, run.state, run.longer].join('|');
export function fitOnly(chrome = [], other = []) {
  const c = new Set(chrome.flatMap((r) => (r.issues ?? []).map((i) => issueKey(r, i))));
  return other.map((r) => ({ ...r, issues: (r.issues ?? []).filter((i) => !c.has(issueKey(r, i))) })).filter((r) => r.issues.length);
}

// The pass: the page in Chrome and each other browser, one browser at a time. browsers: [{ name, path }], Chrome first.
export async function prototypeBrowsers({ url, widths = [], browsers = [], open, dir = null, name = 'page' }) {
  const out = { at: new Date().toISOString(), browsers: [], runs: {}, pictures: [], refused: [] };
  let states = null;
  for (const { name: bn, path } of browsers) {
    let b = null, page = null;
    try {
      b = await open(bn, path, { scheme: 'light' });
      page = await b.page(url, { width: widths[0]?.px ?? 1280, height: 900 });
      for (let i = 0; i < 100 && !(await page.evaluate(DRAWN).catch(() => false)); i++) await new Promise((r) => setTimeout(r, 50));
      if (!(await page.evaluate(DRAWN).catch(() => false))) throw new Error('the page did not draw');
      await page.evaluate(FONTS_IN).catch(() => null);
      await page.evaluate('(() => { window.PT_MARKS && window.PT_MARKS(false); return true; })()').catch(() => null);
      out.browsers.push({ name: bn, label: b.label });
      // Chrome's pictures are the prototype check's own: only the other browsers keep theirs here, each in a folder of
      // its own, so the style guide's pictures of the prototype stay Chrome's.
      const shoot = dir && bn !== 'chrome' && page.shot ? async (w) => {
        mkdirSync(join(dir, bn), { recursive: true });
        const file = join(dir, bn, `${name}@${slugOf(w.name)}.png`);
        writeFileSync(file, await page.shot());
        out.pictures.push(file);
      } : null;
      const runs = await fitRuns(page, { widths, states, shoot });
      states ??= runs.states;
      out.runs[b.label] = [...runs];
    } catch (e) {
      out.refused.push(`${b?.label ?? bn}: ${String(e?.message ?? e).split('\n')[0]}`);
    } finally { if (page) await page.close().catch(() => {}); if (b) await b.close().catch(() => {}); }
  }
  out.states = states ?? ['default'];
  return out;
}

// What fails in another browser only, in the prototype check's own words, with the browsers it fails in.
export function browserFitLines(result, { states = result?.states ?? ['default'] } = {}) {
  const chrome = result?.runs?.Chrome;
  if (!chrome) return [];
  const by = new Map();
  for (const [label, runs] of Object.entries(result.runs)) {
    if (label === 'Chrome') continue;
    for (const f of fitFindings(fitOnly(chrome, runs))) {
      const line = fitLines([f], { states })[0];
      if (!by.has(line)) by.set(line, []);
      by.get(line).push(label);
    }
  }
  return [...by].map(([line, labels]) => `${line}, in ${labels.join(' and ')} only`);
}

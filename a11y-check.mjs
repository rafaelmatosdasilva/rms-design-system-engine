// a11y-check.mjs — Accessibility gate.  Run from project root:
//   node a11y-check.mjs [--component A,B|.selector] [--url <page>] [--a11y]
//
// Mechanical + agnostic: reads the REAL render (headless Chrome via the DevTools Protocol,
// the same flow as rendered-check.mjs / Gate 22), never an assumed DS shape.
//
// Render targets — NO project shape is imposed. It loads, in priority order: a live page from
// `--url <page>` (repeatable/comma), then `ds-config.json → a11y.urls` (any project that serves
// its components — a Vue/Vite SPA, Storybook, a deployed styleguide), then the **generated
// styleguide** (`ds-config.json → styleguide.out`, default `apps/styleguide/index.html`) via
// file:// — one static page that renders every component × every state, so the sweep gets
// deterministic, per-state coverage with no dev server; then the built plugin UIs via file://
// (the Figma-plugin shape); then AUTO-DISCOVERY (start the dev server + enumerate pages). So a
// non-plugin DS is checked by pointing it at a running dev server; `--url` even runs with no
// ds-config.json at all. `a11y.waitFor` (a selector) delays the sweep until an SPA has rendered.
// `a11y.styleguide:false` opts out of the styleguide target; `a11y.regenerateStyleguide:true`
// rebuilds it first (via styleguide-gen.mjs) so a11y never audits a stale one.
//
// It checks:
//   1. Contrast   — WCAG AA ratio of each text leaf's computed color vs its EFFECTIVE
//                   (composited) background; normal >= 4.5:1, large >= 3:1. Per theme.
//   2. Name/role  — every interactive node in the accessibility tree has a non-empty accessible
//                   name and a resolvable role (a component not exposing aria / an icon-button
//                   with no label).
//   3. Focus      — every focusable element shows a computed style change when focused, AND that
//                   change is actually visible: the focus ring's colour has >= 3:1 contrast against
//                   its background (WCAG 1.4.11 for focus — a ring that "changes" but is nearly the
//                   same colour is still invisible).
//   4. State expo — an element whose STATE is shown only by a CSS class (selected / checked /
//                   expanded / disabled / invalid / pressed / …) but never through the matching
//                   aria/native state, so assistive tech never hears it. State-class → aria map
//                   is common-English by default; extend via ds-config.json → a11y.stateClasses.
//   5. Keyboard   — an interactive control that cannot be reached by keyboard (an interactive
//                   role on a non-focusable element, or a native control with tabindex=-1).
//   6. Tooltip    — a control whose only name is its title (an icon with a tooltip): touch and keyboard
//                   users never see the tooltip, so they cannot tell what it does. Words beside the icon,
//                   or aria-label at least.
//   7. Icons      — an icon that carries meaning (the only content of a control, or one with a name of
//                   its own) at less than 3:1 against its background, in every theme (WCAG 1.4.11): an
//                   icon drawn for the light theme that disappears in the dark one.
//
// Output is plain language, no jargon: each issue says what is wrong, why it matters, and what to
// do. `--a11y` adds the exact elements and what a screen reader says for each component; `--json` emits a
// machine-readable record for an agent/CI.
//
// One run is the whole check, against WCAG 2.2 at A and AA. axe-core (downloaded once, pinned, cached; no npm dep)
// runs its WCAG rules, the experimental ones that stand for a criterion and its best practices on the same page, and
// what only it finds is a finding of its own, an element both report said once. Every control is measured again while
// hovered, focused and pressed, in every colour mode. Beyond the seven checks above and the deeper ones below: what a
// script makes clickable that Tab never reaches, a trap that goes round a few controls or holds with Shift+Tab, target
// size by the WCAG circle in every mode (44px as advice), each component on a 320px screen, text that spills when the
// spacing grows, a password field that refuses paste, dragging with no other way, high-contrast mode, colour vision,
// every element accounted for, and what a screen reader says. `--no-axe`, `--no-states` (or a11y.axe /
// a11y.interactionStates false) leave a part out, and the verdict then says not all of it was checked.
//
// Advisory by default (never fails the audit); `ds-config.json → a11yStrict: true` promotes
// findings to a hard fail (exit 1). Skips cleanly (exit 0) when no browser is available — never
// a false fail. `--component A,B|.selector` scopes the sweep to those components' subtrees.
//
// No npm dependencies (Node >= 22 built-in WebSocket). Honors No-imposed-structure: findings
// come from measured pixels and the accessibility tree, not from any presumed token/tier model.
//
// Text contrast reads what is painted under the text where it sits (a sibling laid under it, a ::before or ::after that
// covers a box), and is measured in each declared colour mode and in each pair that can be on at once (dark with high
// contrast, a colour mode with another colour collection's modes).
//
// NOT yet, by design:
//   - Reading order, skip links, landmark completeness beyond axe-core's best practices — and anything the render
//     cannot reveal: only when the project declares it in ds-config.json, never imposed (No-imposed-structure).

import { appDir } from './code-roots.mjs';
import './stdio-sync.mjs';   // the whole report reaches a pipe before process.exit
import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync, statSync, renameSync, unlinkSync } from 'fs';
import { homedir } from 'os';
import { createHash } from 'crypto';
import { gunzipSync } from 'zlib';
import { join, resolve, dirname, relative } from 'path';
import { spawn } from 'child_process';
import { pathToFileURL, fileURLToPath } from 'url';
import { findChrome, launchChrome, connectCDP, openPage, waitForTrue } from './cdp.mjs';
import { harnessNotDrawn } from './vue-harness.mjs';
import { inlinePage } from './styleguide-files.mjs';
import { loadLocator } from './component-locator.mjs';
import { loadModes, loadCollections, combinedModes, mergeSwitches, modeSwitchFor } from './mode-resolver.mjs';
import { modeSwitch, styleguideSwitch } from './code-capture.mjs';
import { codeSnapshotPath, OUT_DIR } from './names.mjs';
import { roleWord as roleWordOf } from './role-markup.mjs';
import { parseColor as parseCssColor } from './css-values.mjs';
import { WCAG21_GUIDE, WCAG21_KIND, WCAG_PAGE_SOURCE, WCAG22 } from './wcag21.mjs';
import { PAGE_FACTS, pageCriteria } from './page-criteria.mjs';
import { loadCategories, requirementEntry, noteKind, isRequirement } from './annotation-categories.mjs';
import { partRoleOf, annotatedBehaviours, partRolesOf, partsFromNames, behavioursFor, roleKey, markInstanceExpression, behaviourExpression, partRoleExpression, stateFindings } from './behaviour-contract.mjs';

// ── Pure, unit-testable core (exported; importing this module runs NOTHING) ─────
// Parse a computed-style color. Returns {r,g,b,a} or null when it is not an rgb()/rgba()
// (e.g. a gradient keyword or color(display-p3 …)) — callers treat null as "cannot compute".
// After a mode switch, every CSS transition it started jumps to its end: a colour is read as it settles, never halfway
// (a button whose text colour transitions and whose background does not reads 1:1 for a moment).
// The time the browser check may take (a11y.timeoutSec sets it): each component on a style guide page adds its share,
// each colour mode as much again, up to a cap that keeps a stuck run from holding a build for long.
export const PER_COMPONENT_SEC = 15;
// A run's result takes the last one's place only when it measured something (an element, a page): a check that could
// not run writes nothing or measures nothing, and the last good result, with its own date, stays where it was. Returns
// { replaced, keptFrom }: keptFrom, the date of the result kept, when one was.
export function keepA11yResult(run, last) {
  let now = null;
  try { now = JSON.parse(readFileSync(run, 'utf8')); } catch { /* the check wrote nothing */ }
  if (now && (now.total > 0 || (now.ran ?? []).length)) { renameSync(run, last); return { replaced: true, keptFrom: null }; }
  try { unlinkSync(run); } catch { /* not there */ }
  let keptFrom = null;
  try { keptFrom = JSON.parse(readFileSync(last, 'utf8')).checkedAt ?? null; } catch { /* no earlier result either */ }
  return { replaced: false, keptFrom };
}

export const LIMIT_CAP_SEC = 3600;
export const SETTLE_TRANSITIONS = `document.getAnimations().forEach((a) => { if (typeof CSSTransition !== 'undefined' && a instanceof CSSTransition) { try { a.finish(); } catch (e) {} } })`;

// State-class → the aria/native state it must also expose. A common-English default (extend or override per project via
// ds-config.json → a11y.stateClasses). Curated words only, so a plain decorative class never trips it; the check only
// fires on interactive / roled elements. A state is said the way the element's role says it, so each word takes every
// attribute that can say it: a selected radio is aria-checked, a selected toggle aria-pressed, a selected step or page
// aria-current (any value but false), a selected tab or option aria-selected.
export const STATE_CLASSES = {
  selected:      { attr: ['aria-selected', 'aria-checked', 'aria-pressed', 'aria-current'], val: 'true' },
  checked:       { attr: ['aria-checked', 'checked'], val: 'true' },
  expanded:      { attr: 'aria-expanded', val: 'true' },
  open:          { attr: ['aria-expanded', 'open'], val: 'true' },
  pressed:       { attr: 'aria-pressed',  val: 'true' },
  disabled:      { attr: 'disabled',      val: 'true' },
  invalid:       { attr: 'aria-invalid',  val: 'true' },
  error:         { attr: 'aria-invalid',  val: 'true' },
  current:       { attr: 'aria-current',  val: 'true' },
  indeterminate: { attr: 'aria-checked',  val: 'mixed' },
};
// Does the element say the state the class draws? Runs in the page (its source is put in the sweep) and here in tests.
export function stateHeard(el, spec) {
  return [].concat(spec.attr).some(function (a) {
    if (a === 'disabled') return el.disabled === true || el.getAttribute('aria-disabled') === 'true';
    if (a === 'checked') return el.checked === true;
    if (a === 'open') return el.hasAttribute('open');
    var v = el.getAttribute(a);
    return v === spec.val || (a === 'aria-current' && v !== null && v !== 'false');
  });
}

export function parseColor(s) {
  if (typeof s !== 'string') return null;
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/i);
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
  // Chrome keeps oklch(), oklab() and color(srgb …) as written (Tailwind v4 colours are oklch): read them too.
  const c = /^(oklch|oklab|color|hsla?)\(/i.test(s) ? parseCssColor(s) : null;
  return c ? { r: c[0], g: c[1], b: c[2], a: c[3] } : null;
}

// Composite a translucent foreground over an opaque background (both {r,g,b}, fg has a).
export function over(fg, bg) {
  const a = fg.a;
  return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a) };
}

// Resolve the effective background from a nearest-first stack of computed background-color
// strings (element's own first, ancestors outward up to the first opaque one). Composites over
// white (the canvas default) in paint order.
export function effectiveBg(layers) {
  const parsed = layers.map(parseColor).filter(Boolean);
  let eff = { r: 255, g: 255, b: 255 };
  for (let i = parsed.length - 1; i >= 0; i--) eff = over(parsed[i], eff);
  return eff;
}

// WCAG relative luminance of an {r,g,b} in 0–255.
export function relLuminance({ r, g, b }) {
  const lin = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

// WCAG contrast ratio between two {r,g,b} colors (1–21).
export function contrastRatio(c1, c2) {
  const L1 = relLuminance(c1), L2 = relLuminance(c2);
  const [hi, lo] = L1 >= L2 ? [L1, L2] : [L2, L1];
  return (hi + 0.05) / (lo + 0.05);
}

// WCAG "large text": >= 24px, or >= 18.66px when bold (>= 700).
export function isLargeText(fontSizePx, fontWeight) {
  const w = Number(fontWeight) || (fontWeight === 'bold' ? 700 : 400);
  return fontSizePx >= 24 || (fontSizePx >= 18.66 && w >= 700);
}

// AA threshold for a text element.
export function aaThreshold(fontSizePx, fontWeight) {
  return isLargeText(fontSizePx, fontWeight) ? 3 : 4.5;
}

// Interactive ARIA roles that must carry an accessible name.
export const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'textbox', 'searchbox', 'checkbox', 'radio', 'switch', 'combobox',
  'listbox', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'slider', 'spinbutton', 'tab', 'option',
]);

// One text leaf's reading: its ratio against what it sits on and the ratio it needs, or why it could not be read.
// → { ratio, threshold } | { cannot } | null (see-through text: nothing drawn)
export function measureText(el) {
  if (el.bgImage) return { cannot: 'background-image/gradient' };
  const unread = [el.color, ...(el.bgLayers ?? [])].find((c) => typeof c === 'string' && !parseColor(c));
  if (unread) return { cannot: `colour space not read (${unread.slice(0, 40)})` };
  const fg = parseColor(el.color);
  if (fg.a === 0) return null;
  const bg = effectiveBg(el.bgLayers);
  return { ratio: Math.round(contrastRatio(fg.a < 1 ? over(fg, bg) : fg, bg) * 100) / 100, threshold: aaThreshold(el.fontSize, el.fontWeight) };
}
// Every element the sweep measured in one mode, with its verdict: what was read, not only what failed.
// → [{ el, component, what: 'text' | 'icon', theme, ratio, needs, verdict: 'passes' | 'fails' | 'not measured' }]
export function accountFor(textEls = [], iconEls = [], theme) {
  const split = (d) => { const m = String(d ?? '').match(/^(.*?)(?: in ([^ ]+))?$/); return { el: m[1], component: m[2] ?? null }; };
  const out = [];
  for (const t of textEls) {
    const m = measureText(t);
    if (!m) continue;
    out.push({ ...split(t.desc), what: 'text', theme, ...(m.cannot ? { verdict: 'not measured', why: m.cannot } : { ratio: m.ratio, needs: m.threshold, verdict: m.ratio + 1e-9 < m.threshold ? 'fails' : 'passes' }) });
  }
  for (const i of iconEls) {
    const fg = parseColor(i.color);
    if (!fg || fg.a === 0 || i.bgImage) continue;
    const bg = effectiveBg(i.bgLayers);
    const ratio = Math.round(contrastRatio(fg.a < 1 ? over(fg, bg) : fg, bg) * 100) / 100;
    out.push({ ...split(i.desc), what: 'icon', theme, ratio, needs: 3, verdict: ratio + 1e-9 < 3 ? 'fails' : 'passes' });
  }
  return out;
}

// How people with a colour vision deficiency see a colour (Machado, Oliveira and Fernandes 2009, full severity), on linear
// RGB: the matrices Chrome's own vision simulator and Stark use.
export const CVD = {
  protanopia: { says: 'people who do not see red (protanopia)', m: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]] },
  deuteranopia: { says: 'people who do not see green (deuteranopia)', m: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]] },
  tritanopia: { says: 'people who do not see blue (tritanopia)', m: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]] },
};
const linear = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
// The relative luminance of a colour as one deficiency sees it.
export function cvdLuminance({ r, g, b }, kind) {
  const c = [linear(r), linear(g), linear(b)], m = CVD[kind].m;
  const [R, G, B] = m.map((row) => Math.min(1, Math.max(0, row[0] * c[0] + row[1] * c[1] + row[2] * c[2])));
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}
// Text that passes WCAG and that one colour vision deficiency can no longer read: the worst of the three, an advisory
// (WCAG's ratio is already meant for most people; this says who it leaves out). Pure, like contrastFindings.
export function cvdFindings(textEls, theme) {
  const out = [];
  for (const el of textEls) {
    const m = measureText(el);
    if (!m || m.cannot || m.ratio + 1e-9 < m.threshold) continue;
    const fg0 = parseColor(el.color), bg = effectiveBg(el.bgLayers), fg = fg0.a < 1 ? over(fg0, bg) : fg0;
    let worst = null;
    for (const kind of Object.keys(CVD)) {
      const a = cvdLuminance(fg, kind), b = cvdLuminance(bg, kind);
      const ratio = Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100;
      if (ratio + 1e-9 < m.threshold && (!worst || ratio < worst.ratio)) worst = { kind, ratio };
    }
    if (worst) out.push({ kind: 'cvdcontrast', theme, desc: el.desc, text: el.text, ratio: worst.ratio, threshold: m.threshold, vision: worst.kind });
  }
  return out;
}

// how far apart two colours look (CIE76 ΔE in Lab, D65), as normal vision sees them or as one deficiency does.
function cvdLinear({ r, g, b }, kind) {
  const c = [linear(r), linear(g), linear(b)];
  if (!kind) return c;
  return CVD[kind].m.map((row) => Math.min(1, Math.max(0, row[0] * c[0] + row[1] * c[1] + row[2] * c[2])));
}
function labOf([R, G, B]) {
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const x = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047), y = f(0.2126 * R + 0.7152 * G + 0.0722 * B), z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
export function colourDistance(a, b, kind = null) {
  const p = labOf(cvdLinear(a, kind)), q = labOf(cvdLinear(b, kind));
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}
// Two variants of a component told apart by colour alone (the same text, shape, borders, weight and parts) that one
// deficiency sees as one: their colours (background, text, border) clearly apart for most people (ΔE 25 or more on one
// of them) and all within ΔE 18 for that deficiency, too close to tell apart at a glance (a usual success green and error
// red come out between 14 and 18 for people who do not see green). An advisory, as cvdcontrast is. groups: [{ name, variants: [{ label, shape, colours: [colour strings] }] }]
// → [{ desc, vision }], one per pair, the deficiency that merges them most.
export const CVD_APART = 25, CVD_ALIKE = 18;
export function cvdVariantFindings(groups = []) {
  const out = [];
  for (const g of groups) {
    const vs = g.variants ?? [];
    for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) {
      const a = vs[i], b = vs[j];
      if (a.shape !== b.shape || a.label === b.label) continue;
      const pairs = a.colours.map((c, k) => [parseColor(c), parseColor(b.colours[k])]).filter(([x, y]) => x && y && x.a > 0 && y.a > 0);
      if (!pairs.length || a.colours.some((c, k) => !!parseColor(c)?.a !== !!parseColor(b.colours[k])?.a)) continue;
      const apart = Math.max(...pairs.map(([x, y]) => colourDistance(x, y)));
      if (apart < CVD_APART) continue;
      let worst = null;
      for (const kind of Object.keys(CVD)) {
        const d = Math.max(...pairs.map(([x, y]) => colourDistance(x, y, kind)));
        if (d < CVD_ALIKE && (!worst || d < worst.d)) worst = { kind, d };
      }
      if (worst) out.push({ desc: `${g.name}: ${a.label} and ${b.label} differ only by colour, and look alike to ${CVD[worst.kind].says}`, vision: worst.kind });
    }
  }
  return out;
}
// What each variant of each checked component draws, for cvdVariantFindings: the instances of one component (its root
// class) whose class lists differ are its variants; each gives its modifier classes, the colours of its background, text
// and border, and the rest of what it draws (its text, borders, weight, decoration and the parts it shows).
export function variantLooksExpression(roots) {
  return `(() => {
    const vis = (e) => { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const cls = (e) => (typeof e.className === 'string' ? e.className.trim().split(/\\s+/).filter(Boolean) : []);
    const shapeOf = (e) => { const s = getComputedStyle(e); return [e.tagName, ['Top', 'Right', 'Bottom', 'Left'].map((x) => s['border' + x + 'Style'] + parseFloat(s['border' + x + 'Width'])).join('|'), s.fontWeight, s.textDecorationLine, (e.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 40), [...e.querySelectorAll('*')].filter(vis).map((k) => k.tagName).join(',')].join(';'); };
    const colours = (e) => { const s = getComputedStyle(e); const bw = ['Top', 'Right', 'Bottom', 'Left'].some((x) => s['border' + x + 'Style'] !== 'none' && parseFloat(s['border' + x + 'Width']) > 0); return [s.backgroundColor, s.color, bw ? s.borderTopColor : 'rgba(0, 0, 0, 0)']; };
    const roots = ${JSON.stringify(roots ?? [])};
    const out = [];
    for (const r of roots) {
      let els = [];
      try { els = [...document.querySelectorAll(r)].filter((e) => vis(e) && !e.closest('[aria-hidden="true"]')); } catch (e) { continue; }
      const byKey = new Map();
      for (const e of els) { const k = cls(e).slice().sort().join(' '); if (!byKey.has(k)) byKey.set(k, e); }
      if (byKey.size < 2) continue;
      const common = [...byKey.keys()].map((k) => k.split(' ')).reduce((a, b) => a.filter((x) => b.includes(x)));
      const variants = [...byKey].slice(0, 12).map(([k, e]) => ({ label: k.split(' ').filter((x) => !common.includes(x)).join(' ') || 'its default', shape: shapeOf(e), colours: colours(e) }));
      out.push({ name: r.replace(/^\\./, ''), variants });
    }
    return out;
  })()`;
}
// Turn one theme's captured text leaves into contrast findings (pure; the heart of the gate).
export function contrastFindings(textEls, theme) {
  const out = [];
  for (const el of textEls) {
    if (el.bgImage) { out.push({ kind: 'contrast', theme, desc: el.desc, text: el.text, cannotCompute: 'background-image/gradient' }); continue; }
    // A colour in a space not converted (display-p3 …) is said, never skipped as if it passed.
    const unread = [el.color, ...(el.bgLayers ?? [])].find((c) => typeof c === 'string' && !parseColor(c));
    if (unread) { out.push({ kind: 'contrast', theme, desc: el.desc, text: el.text, cannotCompute: `colour space not read (${unread.slice(0, 40)})` }); continue; }
    const fg = parseColor(el.color);
    if (fg.a === 0) continue;
    const bg = effectiveBg(el.bgLayers);
    // See-through text draws as its blend over the background: measured as drawn, not as its solid colour.
    const ratio = contrastRatio(fg.a < 1 ? over(fg, bg) : fg, bg);
    const threshold = aaThreshold(el.fontSize, el.fontWeight);
    if (ratio + 1e-9 < threshold) {
      out.push({ kind: 'contrast', theme, desc: el.desc, text: el.text, ratio: Math.round(ratio * 100) / 100, threshold });
    }
  }
  return out;
}

// An icon's colour against what it sits on, in one theme: 3:1 at least (WCAG 1.4.11). Pure, like contrastFindings.
export function iconContrastFindings(iconEls, theme) {
  const out = [];
  for (const el of iconEls) {
    if (el.bgImage) continue;
    const fg = parseColor(el.color);
    if (!fg || fg.a === 0) continue;
    const bg = effectiveBg(el.bgLayers);
    const ratio = contrastRatio(fg.a < 1 ? over(fg, bg) : fg, bg);
    if (ratio + 1e-9 < 3) out.push({ kind: 'iconcontrast', theme, desc: el.desc, ratio: Math.round(ratio * 100) / 100, threshold: 3 });
  }
  return out;
}

// A name that comes only from the title attribute: the AX node's winning name source. → true | false
export function namedByTitleOnly(axNode) {
  const won = (axNode?.name?.sources ?? []).find((s) => !s.superseded && (s.value?.value || s.attributeValue?.value));
  return !!won && won.type === 'attribute' && won.attribute === 'title';
}

// ── Plain-language reporting (pure; exported for tests) ─────────────────────────
// No jargon: every issue says what is wrong, why it matters to a real person, and what to
// do about it. `title` returns the count sentence, singular/plural aware.
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
export const A11Y_GUIDE = {
  contrast: {
    title: (n) => `${plural(n, 'piece of text is', 'pieces of text are')} hard to read`,
    why: 'The text colour is too close to its background, so it is hard to read — and can be invisible when the page is shown in the other theme (light vs dark).',
    fix: 'Use a darker or lighter text colour, or add the colour for the theme that is missing.',
  },
  name: {
    title: (n) => `${plural(n, 'button or field has', 'buttons or fields have')} no label for screen readers`,
    why: 'A button that is only an icon, or a field with no label, is silent to someone using a screen reader — they hear nothing when they reach it.',
    fix: 'Give it a name: add aria-label to an icon button, or a <label> to an input.',
  },
  focus: {
    title: (n) => `${plural(n, 'control does', 'controls do')} not show where the keyboard is`,
    why: 'When someone moves through the page with the Tab key, nothing lights up, so they cannot tell which control they are on.',
    fix: 'Add a visible outline (a focus ring) on the control itself when it is focused — not only on a box around it.',
  },
  focuscontrast: {
    title: (n) => `${plural(n, 'focus outline is', 'focus outlines are')} too faint to see`,
    why: 'The control does light up when focused, but the outline is so close in colour to its background that a keyboard user still cannot tell where they are.',
    fix: 'Make the focus outline stand out clearly — a stronger colour or a thicker ring, so it is at least three times the contrast of whatever is behind it.',
  },
  hovercontrast: {
    title: (n) => `${plural(n, 'control becomes', 'controls become')} hard to read on hover`,
    why: 'When the mouse is over the control its colours change to something too faint — readable at rest, but not while it is being used.',
    fix: 'Give the hover state the same care as the normal state: keep the text at least 4.5 times the contrast of its background.',
  },
  statecontrast: {
    title: (n) => `${plural(n, 'control becomes', 'controls become')} hard to read when focused or pressed`,
    why: 'While the keyboard is on the control, or while it is pressed, its colours change to something too faint: readable at rest, but not while it is being used.',
    fix: 'Give the focused and pressed states the same care as the normal state: keep the text at least 4.5 times the contrast of its background (3 times for large text).',
  },
  cvdcontrast: {
    title: (n) => `${plural(n, 'piece of text is', 'pieces of text are')} hard to read for people who are colour blind`,
    why: 'The text passes WCAG, but for people who do not see red, green or blue its colour comes too close to its background (red on black is the usual case), as a colour-blindness simulator shows it.',
    fix: 'Make the text lighter or darker against its background, not only a different hue: a lightness gap reads for everyone.',
  },
  forcedcontrast: {
    title: (n) => `${plural(n, 'icon or text disappears', 'icons or texts disappear')} in high-contrast mode`,
    why: 'Windows high-contrast mode paints the page in the person\'s own colours. An icon drawn as a background colour (a CSS mask) takes the page\'s colour and vanishes, and text kept in a fixed colour can no longer be told from its background.',
    fix: 'Draw icons in currentColor (an SVG fill, or a mask with background-color: currentColor), or keep them with forced-color-adjust: none and a colour the mode allows (CanvasText).',
  },
  stateedge: {
    title: (n) => `${plural(n, 'control edge fades', 'control edges fade')} when hovered, focused or pressed`,
    why: 'The border of a field, a checkbox, a radio or a switch stands out at rest, but in one of its states it comes too close to what is around it, so people with low vision lose the control while using it.',
    fix: 'Keep the edge in every state at least 3 times the contrast of the background around it (the state\'s border or fill token).',
  },
  ariastate: {
    title: (n) => `${plural(n, 'control shows', 'controls show')} their state only by looks`,
    why: 'Something is marked selected, checked or open only with colour or a CSS class, so a screen reader never announces that state.',
    fix: 'Also set the matching accessibility attribute: aria-selected, aria-checked, aria-expanded, and so on.',
  },
  keyboard: {
    title: (n) => `${plural(n, 'control cannot', 'controls cannot')} be used with the keyboard`,
    why: 'The control works with a mouse, but the Tab key skips over it, so people who only use a keyboard cannot reach it.',
    fix: 'Use a real <button> or link, or add tabindex="0" so it can be focused.',
  },
  target: {
    title: (n) => `${plural(n, 'control is', 'controls are')} too small to tap or click reliably`,
    why: 'A control smaller than 24 by 24 pixels, with other controls close by, is easy to miss or to hit the wrong one — hard for anyone with a tremor or on a touch screen.',
    fix: 'Make the control at least 24 by 24 pixels (padding counts), or keep 24 pixels of space around it.',
  },
  target44: {
    title: (n) => `${plural(n, 'control is', 'controls are')} smaller than a comfortable touch target`,
    why: 'Between 24 and 44 pixels a control passes WCAG AA, but on a touch screen a finger covers about 44 pixels: people with a tremor, or on the move, miss it or hit the one beside it.',
    fix: 'Where it is used on touch screens, make the control at least 44 by 44 pixels (its padding or an invisible hit area counts).',
  },
  tabtrap: {
    title: (n) => `${plural(n, 'place traps', 'places trap')} the keyboard`,
    why: 'Pressing Tab stops moving at some point, so someone using only a keyboard cannot get past it.',
    fix: 'Let Tab move on (or Escape close) whatever is holding the focus.',
  },
  tooltipname: {
    title: (n) => `${plural(n, 'control says', 'controls say')} what it does only in a tooltip`,
    why: 'The control is an icon whose name is only its title, shown as a tooltip when a mouse rests on it. On a touch screen, or moving with the keyboard, no one sees it, so they cannot tell what the control does.',
    fix: 'Put words beside the icon (a visible label); at least give it aria-label.',
  },
  iconcontrast: {
    title: (n) => `${plural(n, 'icon is', 'icons are')} hard to see`,
    why: 'The icon is the only thing that says what the control or the message is, and its colour is too close to its background (often only in the dark theme, when the icon kept its light-theme colour).',
    fix: 'Draw the icon in currentColor or a token that changes with the theme, at least three times the contrast of its background.',
  },
  pageorder: {
    title: (n) => `${plural(n, 'place sends', 'places send')} Tab back up the page`,
    why: 'Pressing Tab moves the focus to a control above the one before it, in the same column, so someone using a keyboard is taken back over what they have read and loses their place.',
    fix: 'Put the controls in the code in the order they are seen, or move them on the page. Never fix it with tabindex or a CSS order.',
  },
  focushidden: {
    title: (n) => `${plural(n, 'control takes', 'controls take')} the focus where no one can see it`,
    why: 'Tab stops on something hidden (off the screen, with no size, or see-through), so someone using a keyboard cannot tell where they are.',
    fix: 'Take it out of the Tab order while it is hidden (hidden, inert or tabindex="-1"), or show it when it has the focus, as a skip link does.',
  },
  tabindex: {
    title: (n) => `${plural(n, 'control jumps', 'controls jump')} the Tab order`,
    why: 'A positive tabindex makes the Tab key visit this control out of reading order, which is confusing to follow.',
    fix: 'Use tabindex="0" (or none) and put the control where it belongs in the page order.',
  },
  unannounced: {
    title: (n) => `${plural(n, 'message shows', 'messages show')} without a screen reader being told`,
    why: 'Something that appears after an action (a toast, an alert, an error) is seen but not heard: it sits in no live region and the focus does not go to it, so a screen reader user never learns it is there. A live region put in the page already holding its words is not said by most screen readers either.',
    fix: 'Keep a live region in the page from the start (role="status" for news, role="alert" for an error) and put the message\'s words into it; or move the focus to the message.',
  },
  cvdvariant: {
    title: (n) => `${plural(n, 'pair of variants differs', 'pairs of variants differ')} only by a colour some people cannot tell apart`,
    why: 'Two variants that are the same but for their colour (a success and an error badge, say) look like one to a person who does not see red, green or blue: the colour is the only thing that tells them apart (WCAG 1.4.1).',
    fix: 'Tell them apart by more than the colour: an icon, a word, a border or a pattern; or pick colours far enough apart in lightness that every kind of colour vision tells them apart.',
  },
  forcedstate: {
    title: (n) => `${plural(n, 'state looks', 'states look')} like the rest in high-contrast mode`,
    why: 'Windows high-contrast mode replaces the page\'s colours with the reader\'s own. A selected, checked, pressed or current item drawn only by its background or text colour then looks exactly like the items beside it, so the reader cannot tell which one is chosen.',
    fix: 'Give the state something the mode keeps: a border or an outline, a check mark or an icon, a heavier weight or an underline; or keep its colours with forced-color-adjust: none and the system colour Highlight.',
  },
  modalescape: {
    title: (n) => `${plural(n, 'modal dialog lets', 'modal dialogs let')} Tab leave it for the page behind`,
    why: 'A modal dialog covers the page and takes the focus. When Tab moves past its last control to the page it covers, a keyboard or screen reader user is lost behind it, acting on what they cannot see.',
    fix: 'Keep the focus inside the dialog while it is open: show it with showModal(), or make the page behind it inert, or move the focus back to its first control after its last.',
  },
  tapcontent: {
    title: (n) => `${plural(n, 'tip shows', 'tips show')} on hover but never on a tap`,
    why: 'A touch screen has no hover. What a tip says is lost to everyone on a phone or a tablet when a tap never shows it (often because the tap also closes it as it opens).',
    fix: 'Show the tip on a tap (on the click that follows a touch), and close it on a second tap or a tap elsewhere.',
  },
  escape: {
    title: (n) => `${plural(n, 'dialog does', 'dialogs do')} not close with Escape`,
    why: 'People who use the keyboard expect Escape to close a dialog; without it they can get stuck.',
    fix: 'Close the dialog on Escape and return the focus to what opened it.',
  },
  focusreturn: {
    title: (n) => `${plural(n, 'dialog or menu leaves', 'dialogs or menus leave')} the focus elsewhere when Escape closes it`,
    why: 'After Escape closes it, the focus is not back on the control that opened it, so someone using the keyboard or a screen reader loses their place.',
    fix: 'When it closes, move the focus back to the control that opened it.',
  },
  heading: {
    title: (n) => `${plural(n, 'page has', 'pages have')} no main heading, or several`,
    why: 'A screen reader jumps to the main heading (h1) to learn what a page is about; with none, or several, it cannot.',
    fix: 'Give each page one <h1> that names it (it can be visually hidden); make the other headings <h2> or below.',
  },
  motion: {
    title: (n) => `${plural(n, 'thing still moves', 'things still move')} when the person asked for less motion`,
    why: 'The system setting "reduce motion" is on, but these still animate. Movement can make some people dizzy or sick.',
    fix: 'Inside @media (prefers-reduced-motion: reduce), set the transition and animation to none (or near zero).',
  },
  forcedfocus: {
    title: (n) => `${plural(n, 'focus indicator disappears', 'focus indicators disappear')} in high-contrast mode`,
    why: 'Windows high-contrast mode removes shadows and background colours, so a focus style made only of those vanishes.',
    fix: 'Add a real outline (it can be transparent normally: outline: 2px solid transparent) so high-contrast mode can show it.',
  },
  spacing: {
    title: (n) => `${plural(n, 'piece of text gets', 'pieces of text get')} cut off with wider text spacing`,
    why: 'People who need more space between letters, words and lines (a common reading aid) lose part of this text.',
    fix: 'Do not fix the height or hide the overflow of text boxes; let them grow with their text.',
  },
  activate: {
    title: (n) => `${plural(n, 'control does', 'controls do')} nothing when Enter or Space is pressed`,
    why: 'A control built from a plain element (a div with role="button") only responds to the mouse unless it also listens for the keys, so a keyboard user can reach it but not use it.',
    fix: 'Use a real <button> (or <a href>), or handle Enter (and Space for buttons, checkboxes and switches) on the element.',
  },
  arrows: {
    title: (n) => `${plural(n, 'group does', 'groups do')} not move with the arrow keys`,
    why: 'In a radio group, tab list, menu or list box, keyboard users expect the arrow keys to move between the items; Tab moves out of the group.',
    fix: 'Move focus to the next and previous item on the arrow keys (a roving tabindex), or use native radio buttons.',
  },
  zoom: {
    title: (n) => `${plural(n, 'piece of text is', 'pieces of text are')} cut off at 200% zoom`,
    why: 'People who zoom the page to twice its size need all the text to stay readable; here it is clipped.',
    fix: 'Let the box grow with its text (no fixed height with overflow hidden), or allow the text to wrap.',
  },
  obscured: {
    title: (n) => `${plural(n, 'control is', 'controls are')} hidden under other content when focused`,
    why: 'When someone tabs to it, the control is completely covered (by a sticky header or a banner, for example), so they cannot see where they are.',
    fix: 'Keep sticky content from covering focused controls: add scroll-padding for the sticky area, or move the content.',
  },
  focusthin: {
    title: (n) => `${plural(n, 'focus ring is', 'focus rings are')} thinner than 2 pixels`,
    why: 'A thin focus ring is easy to miss. The enhanced level of WCAG (AAA) asks for at least 2 CSS pixels.',
    fix: 'Draw the focus ring at least 2px thick (outline-width: 2px).',
  },
  rolecontract: {
    title: (n) => `${plural(n, 'component does', 'components do')} not expose what its role requires`,
    why: 'The contract or a Figma note says what the component is (a toggle button, a checkbox, a text field, a tab). Assistive technology needs the matching wiring: the pressed or checked state, a label, the error link, the selected tab.',
    fix: 'Add what the finding names (aria-pressed that changes on click, a real checkbox input with a label, aria-invalid and aria-describedby on an errored field, aria-selected on the selected tab, disabled or aria-disabled).',
  },
  annotation: {
    title: (n) => `${plural(n, 'component does', 'components do')} not render what its Figma accessibility note says`,
    why: 'A Figma annotation on the component states its role, name, heading level or alt text; the rendered page says something else.',
    fix: 'Render what the annotation says, or update the annotation in Figma if the design changed.',
  },
  reflow: {
    title: (n) => `${plural(n, 'page or component does', 'pages or components do')} not fit a narrow screen`,
    why: 'At 320 pixels wide (a phone, or a page zoomed to 400%) the content does not fit, so people have to scroll in two directions to read it.',
    fix: 'Let the layout wrap or stack at narrow widths instead of keeping a fixed width.',
  },
  partrole: {
    title: (n) => `${plural(n, 'part does', 'parts do')} not do what its Figma part role says`,
    why: 'Figma marks an inner layer as the label, the error message, the indicator or a step button of its component. Each owes the control something: a label names it, an error message is linked while it shows, an indicator stays silent, a step button has a name.',
    fix: 'Wire the part as the finding says (a <label for>, aria-describedby, aria-hidden="true", aria-label), or correct the annotation in Figma.',
  },
  partnotyet: {
    title: (n) => `${plural(n, 'label is', 'labels are')} outside the shadow root its control sits in: wiring no browser makes yet`,
    why: 'The label is outside another component, and the control it names is inside that component\'s shadow root. An id does not reach into a shadow root, so neither a <label for> nor aria-labelledby can tie them: browsers are still adding a way (reference target). Until one ships, a screen reader may hear the control without its name.',
    fix: 'Meanwhile, give the control its name inside the component (pass the label\'s words in, for its own <label> or aria-label), or make the component form-associated so the label names the component itself.',
  },
  behaviour: {
    title: (n) => `${plural(n, 'component does', 'components do')} not behave as its role or its Figma note says`,
    why: 'What a person can do with a component comes with its role: Space flips a toggle, a click opens a disclosure, a tab takes the selection, a text box takes typing. Figma notes can add more (Escape closes, the arrow keys move).',
    fix: 'Make the component do it (the finding says what was tried and what happened), or record the person\'s exception with a link to its decision in contract.authored.json → behaviourExceptions.',
  },
  statefollows: {
    title: (n) => `${plural(n, 'state changes', 'states change')} the look but not what a screen reader hears`,
    why: 'An option that shows a state (selected, checked, expanded, in error) changes only a class here, so a screen reader still announces the component as it was.',
    fix: 'Set the attribute the finding names together with the class (aria-pressed, aria-checked, aria-expanded, aria-invalid), from the same prop.',
  },
  semantics: {
    title: (n) => `${plural(n, 'component is', 'components are')} announced as something else than the design system says`,
    why: 'A screen reader announces the element by its role. The contract says what each component is; this one renders as something different.',
    fix: 'Use the element or role the contract names (contract.authored.json → semantics), or correct the contract.',
  },
  // WCAG 2.1 A and AA, the rest of what a component can be checked for (wcag-page.js, wcag21.mjs).
  ...WCAG21_GUIDE,
};
// How sure the check is of each kind of finding. A blocker is measured on the rendered page against a WCAG 2.1 A
// or AA criterion: the contrast, the name the accessibility tree gives, a key pressed and nothing happening. A warning
// is read from the code, the contract or a Figma note, or a pattern that usually fails (a placeholder as the only
// label, an action on pointerdown): it can be wrong. An advisory is beyond AA (a focus ring under 2px, motion the
// person asked to reduce) or only a person can judge it (text on an image, measured by eye). A kind not listed is a
// warning.
export const A11Y_BLOCKER = new Set(['contrast', 'hovercontrast', 'statecontrast', 'stateedge', 'iconcontrast', 'boundary', 'focuscontrast', 'name', 'focus', 'keyboard', 'tabtrap', 'target', 'zoom', 'reflow', 'spacing', 'obscured',
  'escape', 'modalescape', 'tapcontent', 'focusreturn', 'activate', 'arrows', 'textalt', 'captions', 'autoaudio', 'dupid', 'aria', 'emptylabel', 'labelname', 'context', 'hovercontent', 'onfocus', 'oninput', 'pause', 'flash', 'authpaste']);
export const A11Y_ADVISORY = new Set(['focusthin', 'motion', 'target44', 'cvdcontrast', 'cvdvariant', 'partnotyet']);
export const severityOf = (kind) => (A11Y_BLOCKER.has(kind) ? 'blocker' : A11Y_ADVISORY.has(kind) ? 'advisory' : 'warning');
// A bucket's severity: an axe-core rule carries its own (from its impact), every other kind the one above.
export const bucketSeverity = (kind, list = []) => list[0]?.severity ?? severityOf(kind);
const SEVERITY_ORDER = { blocker: 0, warning: 1, advisory: 2 };
// The order the report lists the kinds in, within each severity; a kind not listed comes after these.
export const A11Y_ORDER = ['contrast', 'hovercontrast', 'statecontrast', 'iconcontrast', 'name', 'focus', 'focuscontrast', 'ariastate', 'keyboard', 'tooltipname', 'target', 'tabtrap', 'tabindex', 'pageorder', 'focushidden',
  'escape', 'modalescape', 'tapcontent', 'unannounced', 'focusreturn', 'heading', 'activate', 'arrows', 'obscured', 'zoom', 'motion', 'forcedfocus', 'focusthin', 'spacing', 'reflow', 'semantics', 'rolecontract', 'annotation', 'partrole', 'partnotyet',
  'behaviour', 'statefollows', 'forcedcontrast', 'forcedstate', 'target44', 'cvdcontrast', 'cvdvariant'];
// The kinds whose same element failing the same way in many places is one finding with a count.
export const A11Y_GROUPED = new Set(['contrast', 'hovercontrast', 'statecontrast', 'iconcontrast', 'cvdcontrast']);
const SEVERITY_WORD = { blocker: 'Blocker', warning: 'Warning', advisory: 'Advisory' };
// What a screen reader says for one accessibility node, the way VoiceOver and NVDA read it in browse mode: its role,
// its name, its value and its states ("checkbox, Remember me, not checked"). null for a node read as nothing (a plain
// element, an ignored one). → string | null
const SAID_ROLE = { image: 'image', img: 'image', textbox: 'edit text', searchbox: 'search text', combobox: 'combo box', listbox: 'list box', menuitem: 'menu item',
  menuitemcheckbox: 'menu item checkbox', menuitemradio: 'menu item radio', tablist: 'tab list', tabpanel: 'tab panel', radiogroup: 'radio group', spinbutton: 'stepper',
  progressbar: 'progress bar', columnheader: 'column header', rowheader: 'row header', alertdialog: 'alert dialog', listitem: 'list item', contentinfo: 'footer', banner: 'header' };
const SILENT_ROLE = /^(generic|none|presentation|StaticText|InlineTextBox|LineBreak|RootWebArea|WebArea|LabelText|paragraph|Section|ignored|Unknown)$/i;
export function spokenLine(n) {
  if (!n || n.ignored) return null;
  const role = String(n.role?.value ?? '');
  const prop = (k) => n.properties?.find((p) => p.name === k)?.value?.value;
  if (role === 'StaticText') { const t = String(n.name?.value ?? '').trim(); return t ? `"${t.slice(0, 80)}"` : null; }
  if (SILENT_ROLE.test(role) || (role === 'group' && !n.name?.value)) return null;
  const parts = [SAID_ROLE[role] ?? role];
  const name = String(n.name?.value ?? '').trim();
  if (name) parts.push(name.slice(0, 80));
  const value = String(n.value?.value ?? prop('valuetext') ?? '').trim();
  if (value && value !== name) parts.push(value.slice(0, 40));
  const level = prop('level'); if (role === 'heading' && level) parts.push(`level ${level}`);
  const checked = prop('checked'); if (checked != null && /checkbox|radio|switch|menuitem/.test(role)) parts.push(checked === 'mixed' ? 'partly checked' : checked === 'true' || checked === true ? (role === 'switch' ? 'on' : 'checked') : (role === 'switch' ? 'off' : 'not checked'));
  const pressed = prop('pressed'); if (pressed != null) parts.push(pressed === 'true' || pressed === true ? 'pressed' : pressed === 'mixed' ? 'partly pressed' : 'not pressed');
  const expanded = prop('expanded'); if (expanded != null) parts.push(expanded === true || expanded === 'true' ? 'expanded' : 'collapsed');
  if (prop('selected') === true && /tab|option|row|cell|treeitem/.test(role)) parts.push('selected');
  if (prop('required') === true) parts.push('required');
  if (prop('invalid') && prop('invalid') !== 'false') parts.push('invalid entry');
  if (prop('disabled') === true) parts.push('unavailable');
  return parts.join(', ');
}
// Where a walk of Tab presses gets stuck, from the focus after each press ('index|tag#id.class', null on the page
// itself): on one control three presses running, or going round a few controls (2 to 6) three times while the page has
// more stops than those. A round that passes the page itself (null) is the browser going back to the top: not a trap.
// → { at } | { cycle: [desc], ids: [index] } | null
export function tabTrap(seq = [], { stops = 0 } = {}) {
  const distinct = new Set(seq.filter(Boolean));
  for (let i = 2; i < seq.length; i++) if (seq[i] && seq[i] === seq[i - 1] && seq[i] === seq[i - 2] && distinct.size > 1) return { at: seq[i].split('|').slice(1).join('|') };
  for (let p = 2; p <= 6; p++) {
    const tail = seq.slice(-3 * p);
    if (tail.length < 3 * p || tail.some((x) => !x)) continue;
    if (!tail.every((x, i) => i < p || x === tail[i - p])) continue;
    const round = tail.slice(0, p);
    if (new Set(round).size !== p || stops <= p) continue;
    return { cycle: round.map((x) => x.split('|').slice(1).join('|')), ids: round.map((x) => Number(x.split('|')[0])) };
  }
  return null;
}
// where Tab goes against where things are on a whole page. boxes: the focus after each press, in page coordinates
// ({ d, x, y, w, h, shown, fixed }), null on the page itself; one round is read, up to the first stop again. A stop
// above the one before it in the same column sends the reader back up the page (a stop in another column, or one in a
// bar that stays on screen, is not); a stop no one can see loses them. → [{ kind: 'pageorder'|'focushidden', desc }]
export function focusFlow(boxes = []) {
  const out = [], seen = new Set();
  const first = boxes.findIndex(Boolean);
  for (let i = first + 1; i >= 1 && i < boxes.length; i++) {
    const a = boxes[i - 1], b = boxes[i];
    if (b && b.d === boxes[first].d) break;
    if (b && !b.shown && !seen.has(`h|${b.d}`)) { seen.add(`h|${b.d}`); out.push({ kind: 'focushidden', desc: b.d }); }
    if (!a || !b || !a.shown || !b.shown || a.fixed || b.fixed) continue;
    const column = b.x < a.x + a.w && a.x < b.x + b.w;
    if (column && b.y + b.h <= a.y - 4 && !seen.has(`o|${a.d}|${b.d}`)) { seen.add(`o|${a.d}|${b.d}`); out.push({ kind: 'pageorder', desc: `Tab goes from ${a.d} back up to ${b.d}, above it` }); }
  }
  if (first >= 0 && !boxes[first].shown) out.unshift({ kind: 'focushidden', desc: boxes[first].d });
  return out;
}
// where the focus went on each Tab inside an open modal dialog (null while it stays inside, 'page' on the page
// itself, else the element it reached). The first press that reaches an element outside is the escape; a modal keeps the
// focus inside it, round and round (a round inside one is not a trap, see tabTrap). → the element reached, or null
export function modalEscape(walk = []) { return walk.find((w) => w && w !== 'page' && w !== 'closed') ?? null; }
// The open modal dialog that lies over the page (a dialog shown with showModal, or one that says aria-modal and is
// fixed over the page, itself or its overlay), as an expression for the page; undefined when none is open. A modal drawn
// in the flow of a page (a style guide's preview of one) covers nothing, so Tab leaving it is not judged.
export const OPEN_MODAL = `[...document.querySelectorAll('dialog[open],[role=dialog],[role=alertdialog],[aria-modal=true]')].find((d) => { const r = d.getBoundingClientRect(); if (!r.width || !r.height) return false; try { if (d.matches(':modal')) return true; } catch (e) {} if (d.getAttribute('aria-modal') !== 'true') return false; for (let e = d; e && e !== document.body; e = e.parentElement) if (getComputedStyle(e).position === 'fixed') return true; return false; })`;
export const FOCUS_IN_MODAL = `(() => { const d = ${OPEN_MODAL}; const a = document.activeElement; if (!d) return 'closed'; if (!a || a === document.body || a === document.documentElement) return 'page'; if (d.contains(a)) return null; const t = (a.textContent || a.getAttribute('aria-label') || '').trim().replace(/\\s+/g, ' ').slice(0, 30); return a.tagName.toLowerCase() + (a.id ? '#' + a.id : '') + (typeof a.className === 'string' && a.className.trim() ? '.' + a.className.trim().split(/\\s+/)[0] : '') + (t ? ' "' + t + '"' : ''); })()`;
// what a tip trigger shows, tried with a pointer that hovers and then with a tap. The triggers are the elements made
// to show a tip (data-tip, data-tooltip, or a description that is a tooltip) that are not links or fields, and buttons
// only when they exist for the tip (named or classed tip, info, help or hint): a tap on any other control does its own
// work. Never one whose words delete, send or save. 'list' tags them (data-dse-tap) and says where each is; 'pops' lists
// what is showing over the page (positioned, or a tooltip, dialog, menu or list box), each tagged once.
export function tapProbeExpression(roots, what) {
  return `(() => {
    const vis = (e) => { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const desc = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\\s+/)[0] : '');
    if (${JSON.stringify(what)} === 'pops') {
      window.__dsePopN = window.__dsePopN || 0;
      return [...document.querySelectorAll('body *')].filter((e) => vis(e) && (/^(fixed|absolute)$/.test(getComputedStyle(e).position) || /^(tooltip|dialog|menu|listbox)$/.test(e.getAttribute('role') || ''))).map((e) => { if (!e.dataset.dsePop) e.dataset.dsePop = String(++window.__dsePopN); return { id: e.dataset.dsePop, desc: desc(e), tip: (e.textContent || '').trim().slice(0, 40) }; });
    }
    const RISKY = /\\b(delete|remove|log ?out|sign ?out|submit|save|send|pay|buy|purchase|reset|clear|discard|apagar|eliminar|remover|sair|enviar|guardar)\\b/i;
    const roots = ${JSON.stringify(roots ?? null)};
    const scope = roots ? roots.flatMap((r) => { try { return [...document.querySelectorAll(r)]; } catch (e) { return []; } }) : [document.body];
    const seen = new Set(), out = [];
    for (const root of scope) for (const el of [root, ...root.querySelectorAll('[data-tip],[data-tooltip],[aria-describedby]')]) {
      if (seen.has(el) || !el.matches || !el.matches('[data-tip],[data-tooltip],[aria-describedby]') || !vis(el)) continue;
      seen.add(el);
      const tipDesc = el.hasAttribute('data-tip') || el.hasAttribute('data-tooltip') || (el.getAttribute('aria-describedby') || '').split(/\\s+/).some((id) => { const d = id && document.getElementById(id); return d && d.getAttribute('role') === 'tooltip'; });
      if (!tipDesc) continue;
      const words = [el.getAttribute('aria-label') || '', el.textContent || '', el.dataset.tip || '', el.getAttribute('data-tooltip') || ''].join(' ');
      if (RISKY.test(words)) continue;
      if (el.matches('a[href],input,select,textarea,[contenteditable]')) continue;
      if (el.matches('button,[role=button]') && !/tip|info|help|hint/i.test((typeof el.className === 'string' ? el.className : '') + ' ' + (el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('title') || ''))) continue;
      el.dataset.dseTap = String(out.length);
      out.push({ i: out.length, desc: desc(el) });
      if (out.length >= 8) break;
    }
    return out;
  })()`;
}
// a state shown only by colours that high-contrast mode replaces. Each element that says it is selected, checked,
// pressed or current (its ARIA state, or a state word in its class) is put beside a sibling of the same kind at rest, and
// what the two draw under forced colours is compared: their colours as the mode leaves them, borders, outline, text weight
// and decoration, opacity, and every part each shows (a check mark, an icon). Alike → the state is lost in that mode. A
// native checkbox or radio is drawn by the system, which keeps its state. → ['desc (state)']
export function forcedStateExpression(roots) {
  return `(() => {
    const vis = (e) => { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const WORD = /(^|[-_\\s])(selected|checked|pressed|current)([-_\\s]|$)/i;
    const cls = (e) => (typeof e.className === 'string' ? e.className : '');
    const stateOf = (e) => { for (const a of ['aria-selected', 'aria-checked', 'aria-pressed']) { const v = e.getAttribute(a); if (v === 'true' || v === 'mixed') return a.slice(5); } const c = e.getAttribute('aria-current'); if (c && c !== 'false') return 'current'; const m = WORD.exec(cls(e)); return m ? m[2].toLowerCase() : null; };
    const base = (e) => cls(e).split(/\\s+/).filter((k) => k && !WORD.test(k))[0] || '';
    const look = (e) => { const s = getComputedStyle(e); const side = (x) => s['border' + x + 'Style'] !== 'none' && parseFloat(s['border' + x + 'Width']) > 0 ? s['border' + x + 'Width'] + s['border' + x + 'Style'] + s['border' + x + 'Color'] : ''; return [s.color, s.backgroundColor, ['Top', 'Right', 'Bottom', 'Left'].map(side).join('|'), s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0 ? s.outlineWidth + s.outlineStyle + s.outlineColor : '', s.fontWeight, s.textDecorationLine, s.opacity, s.backgroundImage === 'none' ? '' : 'image'].join(';'); };
    const sig = (e) => [look(e)].concat([...e.querySelectorAll('*')].filter(vis).map((k) => k.tagName + ':' + look(k))).join('#');
    const desc = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (cls(e).trim() ? '.' + cls(e).trim().split(/\\s+/)[0] : '') + ((e.textContent || '').trim() ? ' "' + e.textContent.trim().replace(/\\s+/g, ' ').slice(0, 24) + '"' : '');
    const roots = ${JSON.stringify(roots ?? null)};
    const scope = roots ? roots.flatMap((r) => { try { return [...document.querySelectorAll(r)]; } catch (e) { return []; } }) : [document.body];
    const out = [], seen = new Set();
    for (const root of scope) for (const el of [root, ...root.querySelectorAll('*')]) {
      if (seen.has(el)) continue; seen.add(el);
      const st = stateOf(el);
      if (!st || !vis(el) || el.matches('input[type=checkbox],input[type=radio],option') || !el.parentElement) continue;
      const rest = [...el.parentElement.children].find((k) => k !== el && k.tagName === el.tagName && base(k) === base(el) && !stateOf(k) && vis(k));
      if (rest && sig(rest) === sig(el)) out.push(desc(el) + ' (' + st + ')');
      if (out.length >= 20) break;
    }
    return out;
  })()`;
}
// what a screen reader says when something changes. A recorder put in the page before an action (a press that opens
// a component, a trigger that opens a dialog or a menu) and read after it: the words each live region (role=status,
// role=alert, aria-live, output) took that it did not have, said politely or at once; where the focus went (a screen
// reader reads what takes it); and each message that appeared (a toast, an alert, an error) that neither was said nor took
// the focus. A live region put in the page already holding its words is not said by most screen readers (only role=alert
// is): it counts as unheard. window.__dseAnnounce.start() / .stop() → { said: [{ how, text }], focus, unheard: [{ desc, text }] }
export const ANNOUNCE_JS = `(() => {
  if (window.__dseAnnounce) return true;
  const LIVE = '[role=status],[role=alert],[role=log],[aria-live]:not([aria-live=off]),output';
  const STATUSY = /toast|snack|notif|alert|banner|status|message|feedback|error|invalid/i;
  const vis = (e) => { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const cls = (e) => (typeof e.className === 'string' ? e.className : '');
  const text = (e) => (e.innerText || e.textContent || '').trim().replace(/\\s+/g, ' ');
  const desc = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (cls(e).trim() ? '.' + cls(e).trim().split(/\\s+/)[0] : '');
  const how = (e) => (e.getAttribute('role') === 'alert' || e.getAttribute('aria-live') === 'assertive' ? 'at once' : 'politely');
  const statusy = (e) => STATUSY.test(cls(e) + ' ' + (e.id || '') + ' ' + (e.getAttribute('role') || ''));
  let rec = null;
  window.__dseAnnounce = {
    start() {
      const regions = new Map([...document.querySelectorAll(LIVE)].map((e) => [e, vis(e) ? text(e) : '']));
      rec = { regions, shown: new Set([...document.querySelectorAll('body *')].filter((e) => vis(e) && statusy(e))), focus: document.activeElement, pressed: null };
      // The control pressed keeps the focus a press gives it: that is no move.
      rec.onPress = (e) => { if (rec) rec.pressed = e.target; };
      document.addEventListener('pointerdown', rec.onPress, true); document.addEventListener('click', rec.onPress, true);
      return true;
    },
    stop() {
      if (!rec) return null;
      const said = [], unheard = [];
      for (const r of document.querySelectorAll(LIVE)) {
        if (!vis(r) || (r.parentElement && r.parentElement.closest(LIVE))) continue;
        const now = text(r), known = rec.regions.has(r), was = rec.regions.get(r) || '';
        if (!now || now === was) continue;
        if (known || r.getAttribute('role') === 'alert') said.push({ how: how(r), text: now.slice(0, 120) });
        else unheard.push({ desc: desc(r), text: now.slice(0, 80), why: 'put in the page already holding its words' });
      }
      document.removeEventListener('pointerdown', rec.onPress, true); document.removeEventListener('click', rec.onPress, true);
      const a = document.activeElement, pressedIt = a && rec.pressed && (a === rec.pressed || a.contains(rec.pressed));
      const name = (e) => (e.getAttribute('aria-label') || (e.getAttribute('aria-labelledby') && (document.getElementById(e.getAttribute('aria-labelledby')) || {}).textContent) || text(e)).toString().trim().slice(0, 40);
      const focus = a && a !== rec.focus && a !== document.body && !pressedIt ? (a.getAttribute('role') || a.tagName.toLowerCase()) + (name(a) ? ' "' + name(a) + '"' : '') : null;
      const fresh = [...document.querySelectorAll('body *')].filter((e) => vis(e) && !rec.shown.has(e) && statusy(e) && text(e));
      for (const e of fresh.filter((e) => !fresh.some((o) => o !== e && o.contains(e)))) {
        if (e.matches(LIVE) || e.closest(LIVE) || e.querySelector(LIVE) || (a && e.contains(a))) continue;
        unheard.push({ desc: desc(e), text: text(e).slice(0, 80), why: 'in no live region, and the focus does not go to it' });
      }
      rec = null;
      return { said, focus, unheard };
    }
  };
  return true;
})()`;
// One change in words: what a screen reader says, and where the focus goes. → 'says "Saved" politely; the focus goes to dialog "Export"'
export function changeLine({ said = [], focus = null } = {}) {
  const parts = said.map((x) => `says "${x.text}" ${x.how}`);
  if (focus) parts.push(`the focus goes to ${focus}`);
  return parts.length ? parts.join('; ') : 'says nothing, and the focus stays where it was';
}
// What has the focus, where it is on the page and whether anyone can see it (for focusFlow).
export const FOCUS_BOX = `(() => {
  const e = document.activeElement;
  if (!e || e === document.body || e === document.documentElement) return null;
  const r = e.getBoundingClientRect();
  let fixed = false, seen = true;
  for (let x = e; x && x !== document.documentElement; x = x.parentElement) { const s = getComputedStyle(x); if (s.position === 'fixed' || s.position === 'sticky') fixed = true; if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity === 0) seen = false; }
  const shown = seen && r.width * r.height > 1 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight;
  const words = (e.getAttribute('aria-label') || e.textContent || e.getAttribute('title') || e.value || '').trim().replace(/\\s+/g, ' ').slice(0, 30);
  const d = (e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\\s+/).slice(0, 2).join('.') : '') + (words ? ' "' + words + '"' : '')).slice(0, 90);
  return { d, x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height), shown, fixed };
})()`;
// The words for a bucket: the engine's own guide, or an axe-core rule in its own words (what it checks, what failed).
export function guideFor(kind, list = []) {
  if (A11Y_GUIDE[kind]) return A11Y_GUIDE[kind];
  const f = list[0] ?? {};
  return { title: () => `${f.help ?? kind}${f.rule ? ` (axe-core ${f.rule}${f.wcag ? `, WCAG ${f.wcag}` : ''})` : ''}`, why: f.why ?? '', fix: f.fix ?? '' };
}
// The accessibility result in the run's summary, the one the chat relays: the verdict, then each kind of problem with
// how many and the components it is in, blockers first. `result` is the check's --json result.
export function a11ySummaryLines(result, { max = 6 } = {}) {
  if (!result?.verdict) return [];
  const groups = new Map();
  for (const i of result.issues ?? []) {
    const g = groups.get(i.issue) ?? { kind: i.issue, severity: i.severity ?? severityOf(i.issue), n: 0, components: new Set(), rec: i };
    g.n++;
    if (i.component) g.components.add(i.component);
    groups.set(i.issue, g);
  }
  const rows = [...groups.values()].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.n - a.n);
  const lines = [`**Accessibility.** ${result.verdict.line}.`];
  for (const g of rows.slice(0, max)) {
    const where = [...g.components];
    lines.push(`- ${SEVERITY_WORD[g.severity]}: ${guideFor(g.kind, [g.rec]).title(g.n)}${where.length ? ` (${where.slice(0, 4).join(', ')}${where.length > 4 ? ` and ${where.length - 4} more` : ''})` : ''}`);
  }
  if (rows.length > max) lines.push(`- and ${rows.length - max} more kind${rows.length - max === 1 ? '' : 's'} of problem, each with its fix in the report above`);
  if (result.notRead?.length) lines.push(`- Not all of it checked: ${result.notRead.slice(0, 2).join('; ')}${result.notRead.length > 2 ? `; and ${result.notRead.length - 2} more` : ''}`);
  if (result.leftOut?.length) lines.push(`- Left out of this run: ${result.leftOut.join('; ')}`);
  return lines;
}
// The one line a run ends with: how many of each, against what. `buckets` [[kind, findings]], `cannot` the texts that
// could not be measured (each an advisory), `partial` when part of the page was not checked.
export const A11Y_TARGET = 'WCAG 2.2 AA';
export function a11yVerdict(buckets, { cannot = 0, partial = false, target = A11Y_TARGET } = {}) {
  const n = { blocker: 0, warning: 0, advisory: cannot };
  for (const [kind, list] of buckets) n[bucketSeverity(kind, list)] += list.length;
  const word = (k, one, many) => `${n[k]} ${n[k] === 1 ? one : many}`;
  const line = [word('blocker', 'blocker', 'blockers'), word('warning', 'warning', 'warnings'), word('advisory', 'advisory', 'advisories'), target].join(' · ') + (partial ? ' · not all of it checked' : '');
  return { blockers: n.blocker, warnings: n.warning, advisories: n.advisory, target, partial, line };
}
const A11Y_ROLE_WORD = { button: 'A button', link: 'A link', textbox: 'An input field', searchbox: 'A search field', checkbox: 'A checkbox', radio: 'A radio button', switch: 'A switch', combobox: 'A dropdown', tab: 'A tab', slider: 'A slider' };
// One readable line locating a single finding.
export function a11yItemLine(kind, f) {
  if (kind === 'contrast') {
    const what = f.text ? `the text "${f.text}"` : (f.desc || 'text');
    return `${what} — its readability score is ${f.ratio} out of 21, needs at least ${f.threshold} (${f.theme} theme)${f.places > 1 ? `, in ${f.places} places` : ''}`;
  }
  if (kind === 'focuscontrast') return `${f.desc} — its focus outline scores ${f.ratio} out of 21, needs at least ${f.threshold}`;
  if (kind === 'iconcontrast') return `${f.desc} — the icon scores ${f.ratio} out of 21 against its background, needs at least ${f.threshold} (${f.theme} theme)${f.places > 1 ? `, in ${f.places} places` : ''}`;
  if (kind === 'hovercontrast') { const what = f.text ? `the text "${f.text}"` : (f.desc || 'text'); return `${what} on hover — its readability score is ${f.ratio} out of 21, needs at least ${f.threshold}${f.theme ? ` (${f.theme} theme)` : ''}`; }
  if (kind === 'cvdcontrast') { const what = f.text ? `the text "${f.text}"` : (f.desc || 'text'); return `${what} — ${f.ratio} out of 21 for ${CVD[f.vision]?.says ?? f.vision}, needs ${f.threshold} (${f.theme} theme)${f.places > 1 ? `, in ${f.places} places` : ''}`; }
  if (kind === 'forcedcontrast') return `${f.what === 'text' && f.text ? `the text "${f.text}"` : f.desc} — ${f.ratio} out of 21 in high-contrast mode, needs ${f.threshold}`;
  if (kind === 'statecontrast') { const what = f.text ? `the text "${f.text}"` : (f.desc || 'text'); return `${what} when ${f.state ?? 'focused'} — its readability score is ${f.ratio} out of 21, needs at least ${f.threshold}${f.theme ? ` (${f.theme} theme)` : ''}`; }
  if (kind === 'name') return `${A11Y_ROLE_WORD[f.role] || `A ${f.role || 'control'}`} with no label`;
  if (kind === 'target') return `${f.desc} — ${f.size} with another control within 24 pixels${f.modes && f.modes.length ? ` (${f.modes.join(', ')})` : ''}`;
  if (kind === 'target44') return `${f.desc} — ${f.size}${f.places > 1 ? `, in ${f.places} places` : ''}${f.modes && f.modes.length ? ` (${f.modes.join(', ')})` : ''}`;
  if (kind === 'semantics') return `${f.desc} — announced as "${f.got}", the contract says "${f.want}"`;
  const where = f.modes && f.modes.length > 1 ? ` (${f.modes.join(', ')})` : '';
  return f.desc + where + (f.places > 1 ? `, in ${f.places} places` : '');   // focus / ariastate / keyboard / motion … — the CSS selector locates the element
}
// The same element failing the same way in many places (a component shown once per prop value on
// the styleguide) is one finding, with the number of places and a few of its texts.
export function groupSame(list) {
  const by = new Map();
  for (const f of list) {
    const k = [f.desc, f.theme, f.ratio, f.threshold, f.state, f.vision].join('|');
    const g = by.get(k);
    if (!g) { by.set(k, { ...f, places: 1, texts: f.text ? [f.text] : [] }); continue; }
    g.places++;
    if (f.text && g.texts.length < 3 && !g.texts.includes(f.text)) g.texts.push(f.text);
  }
  return [...by.values()].map((g) => (g.places > 1 ? { ...g, text: g.texts.map((t) => `"${t}"`).join(', ').replace(/^"|"$/g, '') } : g));
}
// Structured record for --json (machines / an agent that fixes the code): exact locator +
// numbers + the fix. Same facts as the plain lines, but parseable.
export function a11yFindingRecord(kind, f) {
  const rec = { issue: kind, severity: f.severity ?? severityOf(kind), selector: f.desc ?? null, fix: f.fix ?? A11Y_GUIDE[kind]?.fix ?? null };
  if (f.product) rec.product = f.product;   // found on a product's own page
  if (f.wcag ?? WCAG21_KIND[kind]) rec.wcag = f.wcag ?? WCAG21_KIND[kind];
  if (f.rule) { rec.rule = f.rule; rec.help = f.help; rec.url = f.url; rec.elements = f.elements; }
  if (f.state) rec.state = f.state;
  if (f.vision) rec.vision = f.vision;
  if (kind === 'contrast' || kind === 'hovercontrast' || kind === 'statecontrast' || kind === 'cvdcontrast') { rec.theme = f.theme ?? null; rec.text = f.text ?? null; rec.contrast = f.ratio ?? null; rec.needs = f.threshold ?? null; }
  if (kind === 'focuscontrast') { rec.contrast = f.ratio ?? null; rec.needs = f.threshold ?? null; }
  if (kind === 'iconcontrast') { rec.theme = f.theme ?? null; rec.contrast = f.ratio ?? null; rec.needs = f.threshold ?? null; }
  if (kind === 'name') rec.role = f.role ?? null;
  if (kind === 'target' || kind === 'target44') rec.size = f.size ?? null;
  if (kind === 'semantics') { rec.rendered = f.got ?? null; rec.contract = f.want ?? null; }
  if (f.modes) rec.modes = f.modes;
  if (f.places > 1) rec.places = f.places;
  return rec;
}
// Collapse axe-core's per-node violations into one row per rule (highest count first).
export function summarizeAxe(violations) {
  const byId = {};
  for (const v of violations || []) {
    const e = (byId[v.id] ??= { id: v.id, help: v.help, impact: v.impact, helpUrl: v.helpUrl, count: 0, targets: [] });
    e.count += v.count || 0;
    for (const t of v.targets || []) if (e.targets.length < 8 && !e.targets.includes(t)) e.targets.push(t);
  }
  return Object.values(byId).sort((a, b) => b.count - a.count);
}

// ── Auto-discovery: start the project's dev server and enumerate render pages ────
// The most-automated path when nothing is configured and there is no static build. Reads
// package.json for a dev/serve/storybook script, starts it, reads the URL it prints, then
// enumerates targets: Storybook stories → else static router routes → else the base page.
// Fully agnostic (no DS shape assumed) and opt-out via ds-config.json → a11y.discover:false.
// Any failure returns null/nothing — the caller then asks or skips, never a crash.
function detectServeCmd(ROOT, cfg) {
  if (cfg.a11y?.serve) return cfg.a11y.serve;
  let pkg; try { pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')); } catch { return null; }
  const s = pkg.scripts || {};
  for (const name of ['storybook', 'dev', 'serve', 'start', 'preview']) if (s[name]) return 'npm run ' + name;
  return null;
}
export function startDevServer(cmd, ROOT) {
  const parts = cmd.split(/\s+/);
  const proc = spawn(parts[0], parts.slice(1), { cwd: ROOT, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, BROWSER: 'none', FORCE_COLOR: '0', NO_COLOR: '1' } });
  const stop = () => { try { process.kill(-proc.pid, 'SIGTERM'); } catch { try { proc.kill('SIGTERM'); } catch {} } };
  const url = new Promise((res) => {
    let buf = '', done = false;
    const finish = (v) => { if (!done) { done = true; res(v); } };
    // A server that prints its address in colour (Vite puts the port in bold) is read without the colour codes.
    const scan = (d) => { buf += d.toString().replace(/\x1b\[[0-9;]*m/g, ''); const m = buf.match(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?[^\s'"]*/i); if (m) finish(m[0].replace(/\/+$/, '')); };
    proc.stdout.on('data', scan); proc.stderr.on('data', scan);
    proc.on('exit', () => finish(null));
    setTimeout(() => finish(null), 40000);   // give the server up to 40s to print a URL
  });
  return { url, stop };
}
async function fetchJson(u) { try { const r = await fetch(u, { signal: AbortSignal.timeout(6000) }); return r.ok ? await r.json() : null; } catch { return null; } }
async function discoverStorybook(base) {
  for (const p of ['/index.json', '/stories.json']) {
    const j = await fetchJson(base + p); if (!j) continue;
    const entries = j.entries || j.stories || {};
    const ids = Object.values(entries).filter((e) => (e.type ?? 'story') === 'story').map((e) => e.id).filter(Boolean);
    if (ids.length) return ids.map((id) => `${base}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`);
  }
  return null;
}
// The project's own pages, from its router: every static path in its router files (the usual single files, and every
// file under src/router or src/routes, its modules included), as hash URLs when the router uses hash history
// (/#/components/buttons/primary). Scoped to components (prefer: their names and selectors), only the pages whose view
// uses one of them, the component's own page first (its folder and name in the path); every page when none does.
const squashName = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
export function discoverRoutes(ROOT, base, { prefer = [], read = (f) => { try { return readFileSync(f, 'utf8'); } catch { return ''; } } } = {}) {
  const files = new Set(['src/router/index.ts', 'src/router/index.js', 'src/router.ts', 'src/router.js', 'src/routes.ts', 'src/routes.js', 'src/App.tsx', 'src/App.jsx'].map((r) => join(ROOT, r)).filter((f) => existsSync(f)));
  const walk = (dir, depth = 0) => {
    let names = []; try { names = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of names) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { if (depth < 4 && !e.name.startsWith('.') && e.name !== 'node_modules') walk(p, depth + 1); }
      else if (/\.(m?[jt]sx?)$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) files.add(p);
    }
  };
  for (const d of ['src/router', 'src/routes', 'src/routing']) walk(join(ROOT, d));
  // A module path as the router writes it (@/views/x.vue, ./x, ~/x) → the file, or null.
  const fileOf = (from, spec) => {
    const raw = /^[@~]\//.test(spec) ? join(ROOT, 'src', spec.slice(2)) : spec.startsWith('.') ? join(dirname(from), spec) : null;
    if (!raw) return null;
    for (const x of ['', '.vue', '.js', '.ts', '.jsx', '.tsx', '.svelte', '/index.vue', '/index.js', '/index.ts', '/index.tsx']) if (existsSync(raw + x) && !/\/$/.test(raw + x)) { try { if (statSync(raw + x).isFile()) return raw + x; } catch { /* not a file */ } }
    return null;
  };
  const routes = new Map();
  let hash = false;
  for (const f of files) {
    const txt = read(f);
    if (/\bcreate(?:Web)?HashHistory\s*\(|<HashRouter\b|\bcreateHashRouter\s*\(/.test(txt)) hash = true;
    const imports = new Map([...txt.matchAll(/import\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+)['"]/g)].map((m) => [m[1], m[2]]));
    const found = [...txt.matchAll(/\bpath\s*:\s*['"`]([^'"`]+)['"`]/g)];
    found.forEach((m, i) => {
      const p = m[1];
      if (!p.startsWith('/') || p.includes(':') || p.includes('*') || routes.has(p)) return;   // static routes only (no params/wildcards)
      const chunk = txt.slice(m.index, found[i + 1]?.index ?? m.index + 600);
      const c = /\bcomponent\s*:\s*(?:\(\s*\)\s*=>\s*import\(\s*['"]([^'"]+)['"]\s*\)|([A-Za-z_$][\w$]*)\b)/.exec(chunk);
      const spec = c ? (c[1] ?? imports.get(c[2])) : null;
      routes.set(p, spec ? fileOf(f, spec) : null);
    });
  }
  let list = [...routes];
  const keys = [...new Set(prefer.map(squashName).filter((k) => k.length >= 3))];
  if (keys.length) {
    const uses = ([, view]) => view && keys.some((k) => squashName(read(view)).includes(k));
    // Its own page: the path's last two segments spell it (/components/buttons/primary is buttonPrimary).
    const own = ([p]) => { const seg = p.split('/').filter(Boolean).slice(-2).map(squashName); return seg.length === 2 && keys.some((k) => k === seg[0] + seg[1] || k === seg[0].replace(/(?<=...)s$/, '') + seg[1]); };
    const hit = list.filter((r) => uses(r) || own(r));
    if (hit.length) list = [...hit.filter(own), ...hit.filter((r) => !own(r))];
  }
  const b = base.replace(/\/$/, '') + (hash ? '/#' : '');
  return list.length ? list.map(([p]) => b + p) : null;
}

// A class the code gives an element: in a class attribute, as a quoted name a binding adds (:class, clsx), or as a CSS
// selector. A word in a comment is not one. A selector that is not one plain class is taken as present.
export function classInCode(code, sel) {
  const c = /^\.(-?[A-Za-z_][\w-]*)$/.exec(String(sel).trim())?.[1];
  if (!c) return true;
  const e = c.replace(/-/g, '\\-');
  return new RegExp(`class(?:Name)?\\s*=\\s*["'\`](?:[^"'\`]*\\s)?${e}(?=[\\s"'\`])|["'\`]${e}["'\`]|(?:^|[\\s,{>+~(&])\\.${e}(?![\\w-])`, 'm').test(String(code));
}

// The classes in the code that hold a name (modal-overlay for modal), most used first: the likely answer.
export function classesLike(code, names, max = 4) {
  const counts = new Map();
  for (const m of String(code).matchAll(/class(?:Name)?\s*=\s*["'`]([^"'`]+)["'`]/g)) for (const c of m[1].split(/\s+/)) if (/^-?[A-Za-z_][\w-]*$/.test(c)) counts.set(c, (counts.get(c) ?? 0) + 1);
  const sq = (x) => String(x).toLowerCase().replace(/[^a-z0-9]/g, '');
  return [...counts].filter(([c]) => names.some((n) => sq(c).includes(sq(n)))).sort((a, b) => b[1] - a[1]).slice(0, max).map(([c]) => '.' + c);
}

// ── CLI arg helpers ─────────────────────────────────────────────────────────────
function argValues(flag, argv) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === flag && argv[i + 1]) out.push(argv[i + 1]);
    else if (argv[i].startsWith(flag + '=')) out.push(argv[i].slice(flag.length + 1));
  }
  return out.flatMap((v) => v.split(',')).map((s) => s.trim()).filter(Boolean);
}

// ── The generated styleguide as a render target ─────────────────────────────────
// styleguide-gen.mjs writes one static page rendering every component × every state. As a
// file:// a11y target it is deterministic, complete and needs no dev server — and because
// each state is its own instance in the resting DOM, the existing sweep gets per-state
// coverage for free. Returns the target or null (missing, or opted out via a11y.styleguide:false).
export function styleguideTarget(cfg, ROOT, exists = existsSync, read = (f) => readFileSync(f, 'utf8')) {
  if (cfg?.a11y?.styleguide === false) return null;
  // A guide that draws no component (built before any was agreed, or with no Figma data) has nothing to try: the
  // project's own pages are checked instead. One whose list cannot be read is taken as it is.
  // How many components it draws (null when its list cannot be read): 0 means nothing to try.
  const list = (abs) => {
    try { const m = /<script[^>]*\bid=["']sg-data["'][^>]*>([\s\S]*?)<\/script>/.exec(inlinePage(read(abs), dirname(abs), read)); return m ? (JSON.parse(m[1]).components ?? [{}]).map((c) => c?.name) : null; } catch { return null; }
  };
  // Where the style guide is written: the configured place, else the project's own template's, else the engine's.
  for (const rel of [cfg?.styleguide?.out, 'apps/styleguide/index.html', `${OUT_DIR}/styleguide/index.html`].filter(Boolean)) {
    const abs = join(ROOT, rel);
    const names = exists(abs) ? list(abs) : [];
    if (exists(abs) && names?.length !== 0) return { label: rel, url: pathToFileURL(abs).href + '?all', styleguide: true, components: names?.length ?? 1, ...(names?.every(Boolean) ? { names } : {}) };   // every view drawn at once
  }
  // Not built by the project yet: the code capture keeps its own copy, built from the same template.
  const cap = join(ROOT, dirname(codeSnapshotPath(cfg)), 'styleguide.html');
  return cfg?.styleguide?.template && exists(cap) ? { label: 'styleguide (built by the code capture)', url: pathToFileURL(cap).href + '?all', styleguide: true } : null;
}

// A style guide with many components is checked in parts, a few components a page (?all&only=a,b): its page-wide
// checks (the Tab walk, text spacing, reflow, zoom) grow faster than the page, and one page with every component on
// it outlasted any time limit, so nothing it found was kept. Each part keeps the guide's label: a finding reads the
// same whichever part found it.
export const SHARE_COMPONENTS = 6;
export function styleguideShares(sg, size = SHARE_COMPONENTS) {
  if (!sg?.names || sg.names.length <= size) return [sg];
  const parts = [];
  for (let i = 0; i < sg.names.length; i += size) {
    const only = sg.names.slice(i, i + size);
    parts.push({ ...sg, url: `${sg.url}&only=${encodeURIComponent(only.join(','))}`, components: only.length, names: only, only, part: `${parts.length + 1}` });
  }
  return parts.map((p) => ({ ...p, part: `${p.part} of ${parts.length}` }));
}

// ── Results kept between runs ───────────────────────────────────────────────────
// A page checked before, with nothing it rests on changed since, gives the same results: each page's are kept under its
// signature (a11y-kept.json, beside the run's other results), and the next run puts them back instead of opening the
// page again. A run where nothing changed opens no browser and takes seconds. A page's signature is the check itself
// (this file and the engine files its results rest on, the in-page checks: checkSignature), what the run was asked
// (the configuration, the colour modes, the components and the parts left out) and what the page draws: a style guide
// part, its components as the page's data gives them and the system's CSS; a product page or a built UI, its file;
// the components rendered from their code, every file of the project. A live page (--url, a dev server) is never kept,
// and neither is a page the run could not read or finish. --fresh (or a11y.reuse: false) checks every page again.
export const KEPT_FILE = 'a11y-kept.json';
export const KEPT_MAX = 400;
const ENGINE_DIR = dirname(new URL(import.meta.url).pathname);
const sha = (...parts) => { const h = createHash('sha256'); for (const p of parts) h.update(typeof p === 'string' ? p : stableJson(p)).update('\u0000'); return h.digest('hex').slice(0, 32); };
// JSON with its keys in order, so the same object always signs the same.
export function stableJson(v) {
  if (v === undefined) return 'null';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  if (v instanceof Map) return stableJson([...v]);
  if (v instanceof Set) return stableJson([...v].sort());
  return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stableJson(v[k])}`).join(',')}}`;
}
// The engine files a module reaches through its relative imports, static or dynamic. What only shapes the report after
// the pages are checked (a finding's Figma link) and what writes the page the check then opens (the page is signed on
// its own) are left out, so a change there keeps the results.
const IMPORT_RE = /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)['"](\.\/[^'"]+\.m?js)['"]/g;
export function engineFiles(start, { read = (f) => readFileSync(f, 'utf8'), skip = ['figma-link.mjs', 'styleguide-gen.mjs'] } = {}) {
  const seen = new Set(), todo = [start];
  while (todo.length) {
    const f = todo.pop();
    if (seen.has(f)) continue;
    let text; try { text = read(f); } catch { continue; }
    seen.add(f);
    for (const m of text.matchAll(IMPORT_RE)) { const g = join(dirname(f), m[1]); if (!skip.some((s) => g.endsWith(`/${s}`))) todo.push(g); }
  }
  return [...seen].sort();
}
// What a page's results rest on in the engine, by the kind of page. A page read from a file (the style guide, a built UI,
// a product page) rests on the check and the in-page checks: never on the style guide's template (each style guide part
// is signed by what its components draw, their data and the page's CSS) nor on what only reads the code to render it.
// The components rendered from their code rest on that too. The browser's plumbing and what only writes the report are
// left out of both: a change there measures nothing differently.
const PLUMBING = ['figma-link.mjs', 'styleguide-gen.mjs', 'cdp.mjs', 'stdio-sync.mjs', 'stamp.mjs', 'styleguide-files.mjs'];
const RENDERING = ['component-harness.mjs', 'vue-harness.mjs', 'code-capture.mjs', 'component-capture.mjs', 'capture-compare.mjs', 'structure-capture.mjs', 'code-connect-map.mjs',
  'code-connect-template.mjs', 'codeconnect-check.mjs', 'project-typescript.mjs', 'jsx-markup.mjs', 'css-source.mjs', 'component-source.mjs', 'component-api.mjs', 'component-locator.mjs',
  'component-pairing.mjs', 'code-roots.mjs', 'markup-source.mjs', 'icon-folder.mjs', 'icon-source.mjs', 'figma-examples.mjs', 'figma-props.mjs', 'in-progress.mjs', 'build-list.mjs', 'decision-status.mjs'];
export function checkSignature({ dir = ENGINE_DIR, read = (f) => readFileSync(f, 'utf8'), kind = 'page' } = {}) {
  const skip = [...PLUMBING, ...(kind === 'page' ? RENDERING : [])];
  const files = [...engineFiles(join(dir, 'a11y-check.mjs'), { read, skip }), join(dir, 'wcag-page.js')];
  return sha(AXE_VERSION, kind, ...files.map((f) => { try { return `${relative(dir, f)}\u0000${read(f)}`; } catch { return relative(dir, f); } }));
}
// What the run was asked: the configuration (less where it was read from and when), the flags that change what is
// checked, the colour modes and the components looked for.
export function runSignature({ check, cfg = {}, argv = [], roots = null, modes = [], stateMap = {} }) {
  const { profile, ...rest } = cfg ?? {};
  const flags = argv.filter((a, i) => a.startsWith('--') && !['--json-out', '--time-limit', '--fresh', '--json', '--a11y'].includes(a) && !['--json-out', '--time-limit'].includes(argv[i - 1]));
  return sha(check, rest, flags.sort(), roots ?? [], modes.map((m) => [m.name, m.sw, !!m.pair]), stateMap);
}
// A style guide's page as each component's results rest on it: the system's CSS as its rules in any order, and each
// component as the page's data gives it, the way the page itself signs what it keeps (a Vue scoped id and where a
// render sat on the page left out).
const noScopeIds = (text) => String(text).replace(/data-v-[0-9a-f]{6,}/g, 'data-v');
const cssRules = (css) => noScopeIds(css).split('}').map((x) => x.trim()).filter(Boolean).sort().join('}');
export function styleguideSignatures(html) {
  let data = {};
  try { data = JSON.parse((/<script[^>]*\bid=["']sg-data["'][^>]*>([\s\S]*?)<\/script>/.exec(html) ?? [])[1] || '{}'); } catch { return null; }
  const css = [...String(html).matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map((m) => cssRules(m[1])).join('\u0000');
  const base = sha(css, data.brands ?? null);
  const comp = {};
  for (const c of data.components ?? []) {
    if (!c?.name) continue;
    const a = {}; for (const k of Object.keys(c.a11y ?? {})) if (!/^(checked|audited|static|sources)$/.test(k)) a[k] = c.a11y[k];
    const renders = c.renders ? JSON.parse(JSON.stringify(c.renders).replace(/\b(top|left|right|bottom|inset)\s*:\s*-?[\d.]+px/g, '$1:*')) : null;
    comp[c.name] = sha(noScopeIds(stableJson([c.name, c.cls, c.role, c.markup, c.markups, c.controls, a, renders])));
  }
  return { base, comp };
}
// Every file of the project the components are built from: what they are rendered from when the check builds them
// itself. The packages, what the engine writes (its folder, the results it keeps beside the snapshots) and the style
// guide it writes are left out; the configuration is in the run's own signature.
const PROJECT_SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.nuxt', '.output', '.cache']);
export function projectSignature(ROOT, cfg = {}, { list = null, read = (f) => readFileSync(f) } = {}) {
  const outDir = OUT_DIR.split('/')[0];
  const sgOut = cfg?.styleguide?.out ? relative(ROOT, resolve(ROOT, dirname(cfg.styleguide.out))) : null;
  const skipFile = (rel) => rel === 'ds-config.json' || /(^|\/)(a11y-results|open-since)\.snapshot\.json$/.test(rel) || /-result\.json$/.test(rel);
  const files = list ?? (() => {
    const out = [];
    const walk = (dir) => {
      let names = []; try { names = readdirSync(join(ROOT, dir), { withFileTypes: true }); } catch { return; }
      for (const d of names) {
        const rel = dir ? `${dir}/${d.name}` : d.name;
        if (d.isDirectory()) { if (!PROJECT_SKIP_DIRS.has(d.name) && rel !== outDir && rel !== sgOut) walk(rel); }
        else if (d.isFile()) out.push(rel);
      }
    };
    walk('');
    return out;
  })();
  const h = createHash('sha256');
  for (const rel of files.filter((f) => !skipFile(f)).sort()) { h.update(rel).update('\u0000'); try { h.update(read(join(ROOT, rel))); } catch { /* gone */ } h.update('\u0000'); }
  return h.digest('hex').slice(0, 32);
}
export function readKept(path) { try { const j = JSON.parse(readFileSync(path, 'utf8')); return j && typeof j.pages === 'object' ? j.pages : {}; } catch { return {}; } }
// The pages kept for the next run: the ones this run checked or put back, then the earlier ones, newest first, up to a
// cap, so a file that follows every scoped run never grows without end.
export function keptToWrite(previous = {}, now = {}, max = KEPT_MAX) {
  const all = { ...previous, ...now };
  const order = Object.keys(all).sort((a, b) => (now[b] ? 1 : 0) - (now[a] ? 1 : 0) || String(all[b].at).localeCompare(String(all[a].at)));
  return Object.fromEntries(order.slice(0, max).map((k) => [k, all[k]]));
}
// What one page added to the run's results, and putting it back. acc: the run's lists (arrays), what a screen reader
// says (a Map), the instances counted (a Map of { total, checked }), the checks that ran (Sets), and the pages swept.
export function keptMark(acc) {
  const mark = {};
  for (const [k, v] of Object.entries(acc)) {
    if (Array.isArray(v)) mark[k] = v.length;
    else if (v instanceof Set) mark[k] = new Set(v);
    else if (v instanceof Map) mark[k] = new Map([...v].map(([key, x]) => [key, JSON.stringify(x)]));
    else mark[k] = v;
  }
  return mark;
}
export function keptDelta(acc, mark) {
  const d = {};
  for (const [k, v] of Object.entries(acc)) {
    if (Array.isArray(v)) d[k] = JSON.parse(JSON.stringify(v.slice(mark[k])));
    else if (v instanceof Set) d[k] = [...v].filter((x) => !mark[k].has(x));
    else if (v instanceof Map && k === 'instances') d[k] = [...v].map(([key, x]) => { const was = mark[k].has(key) ? JSON.parse(mark[k].get(key)) : { total: 0, checked: 0 }; return [key, { total: x.total - was.total, checked: x.checked - was.checked }]; }).filter(([, x]) => x.total || x.checked);
    else if (v instanceof Map) d[k] = [...v].filter(([key, x]) => mark[k].get(key) !== JSON.stringify(x)).map(([key, x]) => [key, JSON.parse(JSON.stringify(x))]);
    else d[k] = v - mark[k];
  }
  return d;
}
export function keptApply(acc, d) {
  for (const [k, v] of Object.entries(d ?? {})) {
    const into = acc[k];
    if (Array.isArray(into)) into.push(...v);
    else if (into instanceof Set) for (const x of v) into.add(x);
    else if (into instanceof Map && k === 'instances') for (const [key, x] of v) { const had = into.get(key) ?? { total: 0, checked: 0 }; into.set(key, { total: had.total + x.total, checked: had.checked + x.checked }); }
    else if (into instanceof Map) for (const [key, x] of v) into.set(key, x);
  }
}
// A page's own results are kept only when it was read and finished: what could not be is tried again next time.
export const keptWhole = (d) => !['unread', 'unrendered', 'unfinished'].some((k) => d?.[k]?.length);

// Chrome discovery + DevTools plumbing live in cdp.mjs (shared with Gate [16]).

// The in-page sweep: collect visible text leaves (with their computed color + background layer
// stack + font) and focusable elements that show no focus-style change. Runs entirely in the page.
function sweepExpression(roots, doFocus, stateMap) {
  return `(() => {
    const roots = ${JSON.stringify(roots)};
    const rootEls = roots ? roots.flatMap(s => [...document.querySelectorAll(s)]) : [document.body];
    const scope = roots ? [...new Set(rootEls.flatMap(r => [r, ...r.querySelectorAll('*')]))] : [...document.body.querySelectorAll('*')];   // roots may nest: each element once
    const vis = (el) => { const s = getComputedStyle(el); if (s.display==='none'||s.visibility==='hidden'||+s.opacity===0) return false; const r = el.getBoundingClientRect(); return r.width>0 && r.height>0; };
    const disabled = (el) => el.disabled===true || el.getAttribute('aria-disabled')==='true';
    const seen = new Set();
    // The design-system component an element belongs to (the innermost root around it, or the
    // element itself when it is one), so a bare "button" still says where it is.
    const ownerOf = (el) => { if (!roots) return ''; let best = null, depth = -1; for (const s of roots) { let r; try { r = el.closest(s); } catch { continue; } if (!r) continue; let d = 0; for (let n = r; n; n = n.parentElement) d++; if (d > depth) { depth = d; best = s; } } return best ? ' in ' + best : ''; };
    const textEls = [];
    const alpha = (b) => { const mm = String(b).match(/^rgba?\\(([^)]+)\\)/); const parts = mm ? mm[1].split(',') : null; return parts ? (parts[3]!==undefined ? parseFloat(parts[3]) : 1) : 0; };
    // The backgrounds behind an element, nearest first: its own, then its ancestors' up to the first opaque one.
    const ancestorLayers = (el) => { const layers = []; let node = el; while (node && node.nodeType===1) { const b = getComputedStyle(node).backgroundColor; layers.push(b); if (alpha(b) === 1) break; node = node.parentElement; } return layers; };
    // A ::before or ::after that covers its element and paints a background: a layer laid over the element's own
    // background (::after over ::before, as they paint).
    const coverOf = (n) => { const r = n.getBoundingClientRect(); return ['::after', '::before'].map((ps) => { const p = getComputedStyle(n, ps); if (!p || p.content === 'none' || p.display === 'none' || alpha(p.backgroundColor) === 0) return null; const fits = Math.abs(parseFloat(p.width) - r.width) < 2 && Math.abs(parseFloat(p.height) - r.height) < 2; const inset = /absolute|fixed/.test(p.position) && p.top === '0px' && p.left === '0px' && p.right === '0px' && p.bottom === '0px'; return fits || inset ? p.backgroundColor : null; }).filter(Boolean); };
    // What is painted behind the text where it sits: the elements under its middle in paint order, a sibling laid
    // under it by its position included, and a ::before that covers one; not only its ancestors. Off screen, it is
    // scrolled into view first; where nothing can be read there (a bar stuck over it), its ancestors as before.
    const back = { x: scrollX, y: scrollY };
    const layersAt = (el) => {
      const tn = [...el.childNodes].find(n => n.nodeType===3 && n.textContent.trim());
      if (!tn || !document.elementsFromPoint) return ancestorLayers(el);
      const range = document.createRange(); range.selectNodeContents(tn);
      let rr = range.getBoundingClientRect();
      if (!rr.width || !rr.height) return ancestorLayers(el);
      if (rr.top < 0 || rr.left < 0 || rr.bottom > innerHeight || rr.right > innerWidth) { el.scrollIntoView({ block: 'center', inline: 'center' }); rr = range.getBoundingClientRect(); }
      const stack = document.elementsFromPoint(rr.left + rr.width / 2, rr.top + rr.height / 2), at = stack.indexOf(el);
      if (at < 0) return ancestorLayers(el);
      const layers = [];
      for (const n of stack.slice(at)) {
        for (const c of coverOf(n)) { layers.push(c); if (alpha(c) === 1) return layers; }
        const b = getComputedStyle(n).backgroundColor; layers.push(b); if (alpha(b) === 1) return layers;
      }
      return layers;
    };
    for (const el of scope) {
      if (seen.has(el)) continue; seen.add(el);
      // Text in a disabled control is exempt (WCAG 1.4.3) wherever in the control it sits: <button disabled><span>.
      if (!vis(el) || disabled(el) || el.closest(':disabled,[aria-disabled="true"]')) continue;
      const hasText = [...el.childNodes].some(n => n.nodeType===3 && n.textContent.trim());
      if (!hasText) continue;
      const cs = getComputedStyle(el);
      const layers = layersAt(el);
      const cls = (el.className && typeof el.className==='string') ? '.'+el.className.trim().split(/\\s+/).join('.') : '';
      textEls.push({
        desc: (el.tagName.toLowerCase() + (el.id?('#'+el.id):'') + cls).slice(0,80) + ownerOf(el),
        text: [...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join(' ').trim().slice(0,40),
        color: cs.color, bgLayers: layers,
        fontSize: parseFloat(cs.fontSize) || 16, fontWeight: cs.fontWeight,
        bgImage: !!(cs.backgroundImage && cs.backgroundImage !== 'none'),
      });
    }
    scrollTo(back.x, back.y);   // where the page was before any text was scrolled into view
    // A placeholder on show is text (WCAG 1.4.3): its own colour against the field.
    for (const el of scope) {
      if (!el.matches || !el.matches('input[placeholder],textarea[placeholder]') || !el.getAttribute('placeholder').trim() || el.value || !vis(el) || el.closest(':disabled,[aria-disabled="true"]')) continue;
      const ps = getComputedStyle(el, '::placeholder'), cs = getComputedStyle(el);
      const layers = []; let node = el;
      while (node && node.nodeType===1) { const b = getComputedStyle(node).backgroundColor; layers.push(b); const mm = b.match(/^rgba?\\(([^)]+)\\)/); const parts = mm ? mm[1].split(',') : null; if ((parts ? (parts[3]!==undefined ? parseFloat(parts[3]) : 1) : 0) === 1) break; node = node.parentElement; }
      const cls = (el.className && typeof el.className==='string') ? '.'+el.className.trim().split(/\\s+/).join('.') : '';
      textEls.push({ desc: (el.tagName.toLowerCase() + (el.id?('#'+el.id):'') + cls).slice(0,80) + '::placeholder' + ownerOf(el), text: el.getAttribute('placeholder').trim().slice(0,40),
        color: ps.color, bgLayers: layers, fontSize: parseFloat(ps.fontSize || cs.fontSize) || 16, fontWeight: ps.fontWeight || cs.fontWeight, bgImage: !!(cs.backgroundImage && cs.backgroundImage !== 'none') });
    }
    // Icons that carry meaning: the only content of a control, or named themselves (role="img", aria-label, a <title>).
    // Their colour: an svg's painted fill or stroke, a masked icon's background, an icon font's text colour.
    const iconEls = [];
    const CONTROL = 'a[href],button,[role=button],[role=link],[role=tab],[role=menuitem],[role=switch]';
    for (const el of scope) {
      const svg = el.tagName && el.tagName.toLowerCase() === 'svg' && !el.parentElement?.closest('svg');
      const mcs = getComputedStyle(el), mask = (mcs.maskImage && mcs.maskImage !== 'none') || (mcs.webkitMaskImage && mcs.webkitMaskImage !== 'none');
      if (!(svg || mask) || !vis(el) || disabled(el) || el.closest('[disabled],[aria-disabled="true"]')) continue;
      const ctl = el.closest(CONTROL);
      const words = ctl && [...ctl.querySelectorAll('*'), ctl].some((n) => [...n.childNodes].some((t) => t.nodeType === 3 && t.textContent.trim()) && vis(n));
      const named = el.getAttribute('role') === 'img' || el.hasAttribute('aria-label') || !!(svg && el.querySelector(':scope > title'));
      if (!(named || (ctl && !words))) continue;
      let color = null;
      if (mask) color = mcs.backgroundColor;
      else {
        // A sprite icon (<use href="#icon-x">) is painted from its symbol: a fill or stroke written there, else what the
        // <use> passes down (currentColor its text colour).
        const paint = (v, ctx) => (!v || v === 'none' || /^url/.test(v) ? null : /^currentcolor$/i.test(v) ? getComputedStyle(ctx).color : v);
        const SHAPES = 'path,circle,rect,ellipse,line,polyline,polygon,text';
        for (const sh of el.querySelectorAll(SHAPES + ',use')) {
          if (sh.tagName.toLowerCase() === 'use') {
            const ref = document.getElementById(String(sh.getAttribute('href') || sh.getAttribute('xlink:href') || '').replace(/^#/, ''));
            const inner = ref ? [...ref.querySelectorAll(SHAPES)] : [];
            const own = (n, a) => { for (let x = n; x && x !== ref?.parentElement; x = x.parentElement) { const v = x.getAttribute(a) || (x.style && x.style.getPropertyValue(a)); if (v && v !== 'inherit') return v; } return null; };
            const uc = getComputedStyle(sh);
            for (const n of inner) { const f = own(n, 'fill'), st = own(n, 'stroke'); color = f ? paint(f, sh) : st ? paint(st, sh) : (paint(uc.fill, sh) || paint(uc.stroke, sh)); if (color) break; }
          } else { const c = getComputedStyle(sh); color = paint(c.fill, sh) || paint(c.stroke, sh); }
          if (color) break;
        }
        if (!color) { const c = getComputedStyle(el); color = (c.fill && c.fill !== 'none' && !/^url/.test(c.fill)) ? c.fill : c.color; }
      }
      const layers = []; let node = mask ? el.parentElement : el;
      while (node && node.nodeType===1) {
        const b = getComputedStyle(node).backgroundColor; layers.push(b);
        const mm = b.match(/^rgba?\\(([^)]+)\\)/);
        const parts = mm ? mm[1].split(',') : null;
        const a = parts ? (parts[3]!==undefined ? parseFloat(parts[3]) : 1) : 0;
        if (a === 1) break;
        node = node.parentElement;
      }
      const host = ctl || el;
      const cls = (host.className && typeof host.className==='string') ? '.'+host.className.trim().split(/\\s+/).join('.') : '';
      iconEls.push({ desc: (host.tagName.toLowerCase() + (host.id?('#'+host.id):'') + cls).slice(0,80) + ownerOf(host), color, bgLayers: layers, bgImage: false });
    }
    let noFocus = [], faintFocus = [], thinFocus = [], ariaState = [], notKeyboard = [], pointer = 0, judged = [];
    if (${doFocus ? 'true' : 'false'}) {
      const STATE_MAP = ${JSON.stringify(stateMap || {})};
      const stateWords = Object.keys(STATE_MAP);
      const stateHeard = ${stateHeard.toString()};
      const INTERACTIVE = 'a[href],button,input:not([type=hidden]),select,textarea,[tabindex],[role=button],[role=link],[role=checkbox],[role=radio],[role=switch],[role=tab],[role=menuitem],[role=option],[role=combobox],[role=slider]';
      const NATIVE_FOCUSABLE = 'a[href],button,input:not([type=hidden]),select,textarea';
      const IROLES = ['button','link','checkbox','radio','switch','tab','menuitem','option','combobox','slider'];
      for (const el of scope) {
        // A native checkbox or radio hidden under the part that draws it (opacity 0, beside its circle or track) is still
        // the control the keyboard reaches: its focus is judged by that part.
        const shown = vis(el);
        const hiddenNative = !shown && el.matches('input[type=checkbox],input[type=radio]') && (() => { const st = getComputedStyle(el); return st.display !== 'none' && st.visibility !== 'hidden' && !!el.parentElement && vis(el.parentElement); })();
        if (!shown && !hiddenNative) continue;
        const desc = (el.tagName.toLowerCase()+(el.id?('#'+el.id):'')).slice(0,60);
        const role = el.getAttribute('role');
        const isInteractive = el.matches(INTERACTIVE);
        // 3. Visible focus — does focusing change the look, and is that change actually visible?
        if (!disabled(el) && el.matches('a[href],button,input:not([type=hidden]),select,textarea,[tabindex],[role=button],[role=link]')) {
          judged.push((desc + ownerOf(el)).slice(0, 120));
          // A focus style may be an outline, a shadow, a border, a background change, an underline,
          // or drawn on ::before / ::after: every one of those counts as a visible change.
          // An outline's colour counts only while an outline is drawn (a ring kept transparent at rest that takes a colour on focus).
          const ring = (x) => (x.outlineStyle !== 'none' && parseFloat(x.outlineWidth) > 0 ? x.outlineColor : '');
          const look = (s, pb, pa) => [s.outlineStyle, s.outlineWidth, ring(s), s.boxShadow, s.borderColor, s.borderWidth, s.backgroundColor, s.textDecorationLine,
            pb.outlineStyle, ring(pb), pb.boxShadow, pb.borderColor, pb.backgroundColor, pb.opacity, pa.outlineStyle, ring(pa), pa.boxShadow, pa.borderColor, pa.backgroundColor, pa.opacity].join('|');
          // The box that holds only this control (a field's frame around its borderless input) may show the focus
          // for it (:focus-within): up to two levels up, while no other Tab stop is inside. A part the Tab key never
          // reaches (a clear button with tabindex="-1", one not shown until there is a value) is not another stop.
          const stops = (p) => Array.prototype.filter.call(p.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,[tabindex]'), (k) => k === el || (k.tabIndex >= 0 && !k.disabled && k.getClientRects().length > 0)).length;
          const boxes = []; for (let p = el.parentElement, i = 0; p && i < 2 && stops(p) === 1; p = p.parentElement, i++) boxes.push(p);
          const boxState = (p) => { const s = getComputedStyle(p); return { key: [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.borderColor, s.backgroundColor].join('|'), outline: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0 ? s.outlineColor : '', ow: parseFloat(s.outlineWidth) || 0, shadow: s.boxShadow, border: s.borderTopColor, bw: parseFloat(s.borderTopWidth) || 0, bg: s.backgroundColor }; };
          // A focus style that eases in (a frame whose border colour takes 0.15s) is read where it ends, as a keyboard
          // user sees it once it has drawn, and its rest where the easing back ends: the transitions a focus or a blur
          // starts, on the control and its frame, are finished before either is read.
          const settle = () => { for (const x of [el, ...boxes]) { try { for (const an of x.getAnimations({ subtree: x === el })) if (typeof CSSTransition !== 'undefined' && an instanceof CSSTransition) an.finish(); } catch (e) {} } };
          // The element the keyboard is already on (the page's first Tab) is let go first, so its look before is its rest;
          // a control let go before (by focusing another) may still be easing back: settled too.
          if (document.activeElement === el) { try { el.blur(); } catch(e){} }
          settle();
          const b = getComputedStyle(el); const pseudoAt = (s) => ['::before', '::after'].map((w) => { const p = getComputedStyle(el, w); return { w, outline: p.outlineStyle !== 'none' && parseFloat(p.outlineWidth) > 0 ? p.outlineColor : null, border: p.borderTopColor, shadow: p.boxShadow, bg: p.backgroundColor }; });
          const before = look(b, getComputedStyle(el, '::before'), getComputedStyle(el, '::after')); const pseudoBefore = pseudoAt();
          const boxBefore = boxes.map(boxState);
          // The parts beside it in the box that holds only this control (a radio's circle, a switch's track, drawn next to
          // the native input they stand for): what shows its focus may be one of them (input:focus-visible + .circle).
          // So may what follows it, which a rule like input:focus-visible + .track draws, even when its box holds another
          // control too (a switch whose label has a tip button): each later sibling that holds no control, with its insides.
          const CTRL = 'a[href],button,input:not([type=hidden]),select,textarea,[tabindex]';
          const follows = []; for (let k = el.nextElementSibling; k && follows.length < 30; k = k.nextElementSibling) { if (k.matches(CTRL) || k.querySelector(CTRL)) continue; follows.push(k, ...k.querySelectorAll('*')); }
          const parts = [...new Set([...follows, ...(boxes.length ? Array.prototype.filter.call(boxes[boxes.length - 1].querySelectorAll('*'), (k) => k !== el && !el.contains(k) && !k.contains(el)) : [])])].slice(0, 30);
          const partState = (k) => { const x = boxState(k); const pa = getComputedStyle(k, '::after'), pb = getComputedStyle(k, '::before'); x.key += '|' + [pb.outlineStyle, pb.outlineColor, pb.boxShadow, pb.borderColor, pa.outlineStyle, pa.outlineColor, pa.boxShadow, pa.borderColor].join('|'); x.offset = parseFloat(getComputedStyle(k).outlineOffset || '0'); return x; };
          const partBefore = parts.map(partState);
          try { el.focus(); } catch(e){}
          settle(); for (const k of parts) { try { for (const an of k.getAnimations()) if (typeof CSSTransition !== 'undefined' && an instanceof CSSTransition) an.finish(); } catch (e) {} }
          // A control that does not take the focus here (inside an inert thumbnail) shows none to judge.
          const took = document.activeElement === el;
          const a = getComputedStyle(el); const after = look(a, getComputedStyle(el, '::before'), getComputedStyle(el, '::after'));
          const boxAfter = boxes.map(boxState);
          const changedBox = boxAfter.findIndex((x, i) => x.key !== boxBefore[i].key);
          const partAfter = parts.map(partState);
          const changedPart = partAfter.findIndex((x, i) => x.key !== partBefore[i].key);
          // A hidden control's own ring is never seen: only what changes around it counts.
          const same = before === after || !shown;
          // A shadow ring may have several layers (a white gap, then a coloured ring): each colour is kept, and the
          // ring counts as seen when one of them stands out.
          const shadowLayers = (v) => v.split(/,(?![^(]*\\))/).map((l) => { const m = l.match(/(?:rgba?|oklch|oklab|color|hsla?)\\([^)]+\\)/); const lens = l.replace(/[a-z]+\\([^)]+\\)/g, '').match(/-?[\\d.]+px/g) || []; return { color: m ? m[0] : null, px: Math.max(parseFloat(lens[2] || '0'), parseFloat(lens[3] || '0')) }; }).filter((l) => l.color);
          // What surrounds a box: the first opaque background from it up (its own, or its parent's for a ring outside it).
          const layersFrom = (node) => { const out = []; while (node && node.nodeType===1) { const bg = getComputedStyle(node).backgroundColor; out.push(bg); const mm = bg.match(/^rgba?\\(([^)]+)\\)/); const parts = mm ? mm[1].split(',') : null; const al = parts ? (parts[3]!==undefined ? parseFloat(parts[3]) : 1) : 0; if (al === 1) break; node = node.parentElement; } return out; };
          if (!took) { /* nothing to judge */ }
          else if (same && changedBox < 0 && changedPart >= 0) {
            // A part beside it shows the focus (its circle, its track): measured as a ring on the control is.
            const was = partBefore[changedPart], is = partAfter[changedPart], part = parts[changedPart];
            let ind = null, px = null, outside = false;
            if (is.outline && is.outline !== was.outline) { ind = [is.outline]; px = is.ow; outside = is.offset >= 0; }
            else if (is.shadow !== was.shadow && is.shadow !== 'none') { const ls = shadowLayers(is.shadow); ind = ls.length ? ls.map((l) => l.color) : null; px = ls.length ? Math.max(...ls.map((l) => l.px)) : null; outside = !/inset/.test(is.shadow); }
            else if (is.border !== was.border) { ind = [is.border]; px = is.bw; }
            else if (is.bg !== was.bg) { ind = [is.bg]; }
            if (px != null && px < 2) thinFocus.push({ desc, px: Math.round(px * 10) / 10 });
            if (ind) faintFocus.push({ desc, colors: ind, bgLayers: layersFrom(outside && part.parentElement ? part.parentElement : part) });
          }
          else if (same && changedBox >= 0) {
            // Its frame shows the focus (WCAG 2.4.7 takes an indicator around the control): what changed on the frame is
            // measured as a ring on the control is, against what surrounds the frame (1.4.11) and for its thickness.
            const was = boxBefore[changedBox], is = boxAfter[changedBox], frame = boxes[changedBox];
            let ind = null, px = null;
            if (is.outline && is.outline !== was.outline) { ind = [is.outline]; px = is.ow; }
            else if (is.shadow !== was.shadow && is.shadow !== 'none') { const ls = shadowLayers(is.shadow); ind = ls.length ? ls.map((l) => l.color) : null; px = ls.length ? Math.max(...ls.map((l) => l.px)) : null; }
            else if (is.border !== was.border) { ind = [is.border]; px = is.bw; }
            else if (is.bg !== was.bg) { ind = [is.bg]; }
            if (px != null && px < 2) thinFocus.push({ desc, px: Math.round(px * 10) / 10 });
            if (ind) faintFocus.push({ desc, colors: ind, bgLayers: layersFrom(frame.parentElement || frame) });
          }
          else if (same) { noFocus.push(desc); }
          else {
            // Something changed — capture the focus-indicator colour + its background so Node can
            // check it is perceivable (WCAG 1.4.11, >= 3:1). A ring that "changes" but is nearly the
            // same colour as its background is still invisible to a keyboard user.
            let ind = null, outside = false, px = null;
            if (a.outlineStyle !== 'none' && parseFloat(a.outlineWidth) > 0 && (a.outlineColor !== b.outlineColor || a.outlineStyle !== b.outlineStyle || a.outlineWidth !== b.outlineWidth)) { ind = [a.outlineColor]; outside = parseFloat(a.outlineOffset || '0') >= 0; px = parseFloat(a.outlineWidth); }
            else if (a.boxShadow !== b.boxShadow && a.boxShadow !== 'none') { const ls = shadowLayers(a.boxShadow); ind = ls.length ? ls.map((l) => l.color) : null; outside = !/inset/.test(a.boxShadow); px = ls.length ? Math.max(...ls.map((l) => l.px)) : null; }
            else if (a.borderColor !== b.borderColor) { ind = [a.borderColor]; px = parseFloat(a.borderTopWidth); }
            else if (a.outlineStyle !== 'none' && parseFloat(a.outlineWidth) > 0) { ind = [a.outlineColor]; outside = parseFloat(a.outlineOffset || '0') >= 0; px = parseFloat(a.outlineWidth); }
            else {
              // A ring drawn on ::before / ::after: the part of it that changed is measured, against the element.
              const now = pseudoAt();
              for (let i = 0; i < 2 && !ind; i++) {
                const was = pseudoBefore[i], is = now[i];
                if (is.outline && is.outline !== was.outline) ind = [is.outline];
                else if (is.shadow !== was.shadow && is.shadow !== 'none') ind = shadowLayers(is.shadow).map((l) => l.color);
                else if (is.border !== was.border) ind = [is.border];
                else if (is.bg !== was.bg) ind = [is.bg];
              }
            }
            // WCAG 2.4.13 (AAA, advisory): a focus indicator at least 2 CSS pixels thick.
            // The browser's own ring (outline-style: auto) is drawn by the browser, not by this width.
            if (px != null && px < 2 && a.outlineStyle !== 'auto') thinFocus.push({ desc, px: Math.round(px * 10) / 10 });
            // The browser's own ring (outline-style: auto) is drawn in two tones so it shows on any background.
            // A ring drawn outside the element sits on what surrounds it: measure against the parent.
            if (ind && a.outlineStyle !== 'auto') faintFocus.push({ desc, colors: ind, bgLayers: layersFrom(outside && el.parentElement ? el.parentElement : el) });
          }
          try { el.blur(); } catch(e){}
          settle();
        }
        // 4. State communicated ONLY by a CSS class — a state word in the class list with no
        //    matching aria/native state, so assistive tech never hears the state.
        if (isInteractive || role) {
          const tokens = ((el.className && typeof el.className==='string') ? el.className.toLowerCase() : '').split(/[\\s_-]+/).filter(Boolean);
          for (const w of stateWords) {
            if (!tokens.includes(w)) continue;
            if (!stateHeard(el, STATE_MAP[w])) { ariaState.push((desc+' .'+w).slice(0,70)); break; }
          }
        }
        // 5. Keyboard reachability — an interactive control that cannot be reached by keyboard.
        const interactiveRole = role && IROLES.includes(role);
        if ((interactiveRole || isInteractive) && !disabled(el)) {
          const ti = el.getAttribute('tabindex');
          const tabStop = (n) => (n.matches(NATIVE_FOCUSABLE) ? n.getAttribute('tabindex') !== '-1' : (n.getAttribute('tabindex') !== null && Number(n.getAttribute('tabindex')) >= 0));
          // A composite (a radio group, a tab list, a menu) has one Tab stop and its arrow keys for the rest: an option
          // left out of the Tab order there is reached through the group, when the group has a stop at all.
          const group = el.closest('[role=radiogroup],[role=tablist],[role=listbox],[role=menu],[role=menubar],[role=tree],[role=grid],[role=treegrid],[role=toolbar]');
          const roving = !!group && group !== el && [...group.querySelectorAll('[role]')].some((n) => n !== el && n.getAttribute('role') === role && tabStop(n));
          const focusable = tabStop(el) || roving;
          if (!focusable) notKeyboard.push((desc+(role?('[role='+role+']'):'')).slice(0,70));
        }
      }
      // What a script makes clickable and Tab never reaches. Its handler is read where a framework keeps it (an
      // onclick, React's props, Vue's invokers); one only Chrome's listeners show is marked for Node to ask (pointer).
      const ANY_FOCUSABLE = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[tabindex],[contenteditable=""],[contenteditable=true]';
      const handles = (el) => typeof el.onclick === 'function' || el.hasAttribute('onclick') || Object.keys(el).some((k) => (k.indexOf('__reactProps$') === 0 && el[k] && (el[k].onClick || el[k].onMouseDown || el[k].onPointerDown)) || (k === '_vei' && el[k] && (el[k].onClick || el[k].onMousedown || el[k].onPointerdown)));
      const bare = (el) => {
        if (el === document.body || el === document.documentElement || el.matches(INTERACTIVE) || el.matches('label,option,svg *')) return false;
        if (IROLES.includes(el.getAttribute('role'))) return false;
        if (el.parentElement && el.parentElement.closest(INTERACTIVE + ',label')) return false;   // a part of a control: the control takes the keys
        if (el.querySelector(ANY_FOCUSABLE)) return false;   // a card around its own link or button: the keyboard uses that
        const cls = typeof el.className === 'string' ? el.className : '';
        if (/backdrop|overlay|scrim|underlay/i.test(cls)) return false;   // a dialog's backdrop: Escape closes it
        const st = getComputedStyle(el), r = el.getBoundingClientRect();
        if (st.position === 'fixed' && r.width * r.height > innerWidth * innerHeight / 2) return false;
        return true;
      };
      let marked = 0;
      for (const el of scope) {
        if (el.nodeType !== 1 || !vis(el) || disabled(el) || !bare(el)) continue;
        const d = (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + ((el.className && typeof el.className === 'string' && el.className.trim()) ? '.' + el.className.trim().split(/\s+/).join('.') : '')).slice(0, 80);
        if (handles(el)) notKeyboard.push(d + ' (a script handles its clicks, but Tab never reaches it)' + ownerOf(el));
        else if (marked < 150 && getComputedStyle(el).cursor === 'pointer' && (!el.parentElement || getComputedStyle(el.parentElement).cursor !== 'pointer')) { el.setAttribute('data-dse-click', String(marked++)); el.__dseDesc = d + ' (a script handles its clicks, but Tab never reaches it)' + ownerOf(el); }
      }
      pointer = marked;
    }
    return { textEls, iconEls, noFocus, faintFocus, thinFocus, ariaState, notKeyboard, pointer, judged, scanned: rootEls.length };
  })()`;
}

// The role each component should render as, from the committed contract.authored.json
// (components[name].semantics: { element, aria: { role } }). The explicit role wins over the element.
const IMPLICIT_ROLE = { button: 'button', a: 'link', select: 'combobox', textarea: 'textbox', nav: 'navigation', ul: 'list', ol: 'list', li: 'listitem', dialog: 'dialog', img: 'img', table: 'table', form: 'form', main: 'main', header: 'banner', footer: 'contentinfo', h1: 'heading', h2: 'heading', h3: 'heading', h4: 'heading', h5: 'heading', h6: 'heading', 'input[type=checkbox]': 'checkbox', 'input[type=radio]': 'radio', 'input[type=range]': 'slider', input: 'textbox' };
export function contractSemantics(ROOT, cfg = {}) {
  const out = {};
  let doc = null;
  try { doc = JSON.parse(readFileSync(resolve(ROOT, cfg.contracts?.authored ?? 'contract.authored.json'), 'utf8')); } catch { return out; }
  for (const [name, c] of Object.entries(doc?.components ?? {})) {
    const s = c?.semantics;
    if (!s) continue;
    const role = s.aria?.role ?? IMPLICIT_ROLE[String(s.element ?? '').toLowerCase()] ?? null;
    if (role) out[name] = String(role).toLowerCase();
  }
  return out;
}
// Figma accessibility annotations as checkable facts. An annotation is free text; the facts it states
// in a recognisable form are kept, one per clause (a line, or a sentence ending in ". " or ";"):
//   role: button              the role a screen reader announces
//   aria-label: Close         the accessible name (also "accessible name", "screen reader label")
//   heading level 2 · H2      a heading and its level
//   alt: A red chart          an image's text alternative
// Composite roles from spec tooling are read as what they mean: togglebutton is a button with
// aria-pressed, textinput a text box. Anything else stays a note for people.
const ROLE_WORDS = { textinput: 'textbox', searchinput: 'searchbox', iconbutton: 'button', disclosure: 'button', expander: 'button' };
export function roleOf(word) {
  const w = String(word ?? '').trim().toLowerCase().replace(/["'“”]/g, '');
  if (w === 'togglebutton') return { role: 'button', pressed: true };
  return { role: ROLE_WORDS[w] ?? w };
}
export function annotationFacts(annotations = []) {
  const f = {};
  const clauses = (annotations ?? []).flatMap((a) => String(a?.label ?? a?.labelMarkdown ?? '').replace(/[*_`]/g, '').split(/\n|;|\.\s+/));
  const value = (v) => v.trim().replace(/^["'“]|["'”.]$/g, '').trim();
  for (const c of clauses) {
    const kv = c.match(/^\s*([^:=]+?)\s*[:=]\s*(.+)$/);
    const key = kv ? kv[1].trim().toLowerCase() : '';
    if (key === 'role' && partRoleOf(value(kv[2]))) { f.part = partRoleOf(value(kv[2])); continue; }   // a part's role (label, errormessage): behaviour-contract.mjs checks it
    if (key === 'role') { const r = roleOf(value(kv[2])); if (r.role) f.role = r.role; if (r.pressed) f.pressed = true; continue; }
    if (/^(aria-label|accessible name|screen reader label)$/.test(key)) { f.name = value(kv[2]); continue; }
    if (/^(alt|alt text)$/.test(key)) { f.name ??= value(kv[2]); f.role ??= 'img'; continue; }
    const heading = c.match(/\bheading(?:\s+level)?\s*[:=]?\s*(?:h)?([1-6])\b/i) ?? c.match(/(?:^|\s)[Hh]([1-6])\b/);
    if (heading) { f.level = Number(heading[1]); f.role ??= 'heading'; }
  }
  return f;
}
// From the component-props snapshot: { component: { facts, layers: [{ layer, facts }] } }. Facts on
// the component node, and on its inner layers (layerAnnotations) when the capture recorded them.
// What each Figma annotation on a component feeds, so a designer can tell a note is used: the role it states (what that
// role owes, tried in the browser), a spoken name or alt text and a heading level (checked against what it renders), a
// part's role on a layer, a behaviour (Escape closes, arrow keys move, Enter and Space activate). Every note also reaches
// the agents as design intent. entry: the component's snapshot entry ({ annotations, layerAnnotations }).
// → [{ text, layer?, uses: [what it feeds], sc: [criteria] }]
// cats, cfg: the annotation categories (annotation-categories.mjs). A note in a design-intent category is no check's: it
// is listed with its kind and no use, for the agents only.
export function annotationUses(entry = {}, { cats = null, cfg = {} } = {}) {
  const out = [];
  const one = (a, layer, nodeId) => {
    const text = String(a?.label ?? a?.labelMarkdown ?? '').trim();
    if (!text) return;
    const kind = noteKind(a, nodeId, cats, cfg);
    if (!isRequirement(a, nodeId, cats, cfg)) { out.push({ text, ...(layer ? { layer } : {}), uses: [], sc: [], kind }); return; }
    const f = annotationFacts([a]), uses = [], sc = [];
    if (f.part && layer) { uses.push(`the role of its "${layer}" part (${f.part}), checked in the browser`); sc.push('1.3.1'); }
    else if (f.part) { uses.push(`a part's role (${f.part}), checked once it sits on the layer of that part`); }
    if (f.role && /\brole\s*[:=]/i.test(text)) { uses.push(`its role (${f.role}${f.pressed ? ', a toggle' : ''}): what that role owes is tried in the browser`); sc.push('4.1.2', '2.1.1'); }
    if (f.name) { uses.push(`its spoken name ("${f.name}"), checked against what it renders`); sc.push('4.1.2', '1.1.1'); }
    if (f.level) { uses.push(`its heading level (${f.level}), checked against what it renders`); sc.push('1.3.1'); }
    for (const b of annotatedBehaviours([a])) { uses.push(`a behaviour (${b.says}), tried in the browser`); sc.push('2.1.1'); }
    out.push({ text, ...(layer ? { layer } : {}), uses, sc: [...new Set(sc)], kind });
  };
  for (const a of entry.annotations ?? []) one(a, null, entry.nodeId);
  for (const l of entry.layerAnnotations ?? []) for (const a of l.annotations ?? []) one(a, l.layer, l.nodeId);
  return out;
}
export function annotationFactsFor(ROOT, cfg = {}) {
  let snap = {};
  try { snap = JSON.parse(readFileSync(resolve(ROOT, cfg.paths?.compPropsSnapshot ?? 'figma-component-props.snapshot.json'), 'utf8')); } catch { return {}; }
  const cats = loadCategories(ROOT, cfg);   // a note in a design-intent category states nothing to check
  const out = {};
  for (const [name, v0] of Object.entries(snap)) {
    if (name.startsWith('_') || !v0 || typeof v0 !== 'object') continue;
    const v = requirementEntry(v0, cats, cfg);
    const facts = annotationFacts(v.annotations ?? []);
    const layers = (v.layerAnnotations ?? []).map((l) => ({ layer: l.layer, facts: annotationFacts(l.annotations ?? []) })).filter((l) => Object.keys(l.facts).length);
    if (Object.keys(facts).length || layers.length) out[name] = { facts, layers };
  }
  return out;
}
// What the rendered node says against the annotation's facts, as readable differences.
export function annotationMismatches(f, got) {
  const out = [];
  if (f.role && got.role && !sameRole(got.role, f.role)) out.push(`Figma says role "${f.role}", it renders as "${got.role}"`);
  if (f.pressed && got.pressed == null) out.push('Figma says it is a toggle button, it has no aria-pressed');
  if (f.name && String(got.name ?? '').trim().toLowerCase() !== f.name.toLowerCase()) out.push(`Figma says its name is "${f.name}", it is announced as "${got.name ?? ''}"`);
  if (f.level && got.level != null && Number(got.level) !== f.level) out.push(`Figma says heading level ${f.level}, it renders as level ${got.level}`);
  return out;
}
// The page is loaded: its own document, not the about:blank a new target starts on (which already reports
// readyState "complete", so a slow navigation would be checked as an empty page), and waitFor when set.
export function pageLoadedExpression(waitFor = null) {
  return `location.href !== "about:blank" && document.readyState === "complete"${waitFor ? ` && !!document.querySelector(${JSON.stringify(waitFor)})` : ''}`;
}

// One deeper check at a time. A check that throws (the browser slow to answer, a page that changed under it)
// is tried once more with its partial findings removed; if it fails again it is listed in `unfinished` and
// reported as not checked, never silently clean. DSE_A11Y_TIMES=1 prints how long each one took (to find a slow one).
export function makeStep(findings, unfinished, label) {
  let n = 0;
  return async (fn) => {
    const no = ++n, t0 = Date.now();
    for (let attempt = 0; attempt < 2; attempt++) {
      const before = findings.length;
      try { await fn(); if (process.env.DSE_A11Y_TIMES) console.error(`[a11y time] ${label} step ${no}: ${Date.now() - t0}ms`); return; } catch (e) {
        findings.length = before;
        if (attempt === 1) unfinished.push(`${label}: deeper check ${no} (${String(e?.message ?? e).slice(0, 80)})`);
      }
    }
  };
}

// Chrome's accessibility tree names a few roles differently from ARIA.
// presentation and none are one role (ARIA 1.1 named it none); Chrome reports either as "none", and a plain element
// with no role of its own (generic) holds no meaning either, as presentation asks.
export const sameRole = (got, want) => got === want || (want === 'img' && got === 'image') || (want === 'textbox' && got === 'searchbox')
  || (/^(presentation|none)$/.test(want) && /^(presentation|none|generic)$/.test(got));   // a plain element means nothing either
// The same equivalences, to look a role up in Chrome's tree (Accessibility.queryAXTree) by the name an annotation uses.
const AX_ROLE_ALIASES = { img: ['image'], textbox: ['searchbox'] };
// The controls a wrapper can hold, for a note that names no role (a name, a heading level, a pressed state).
const WRAPPED_CONTROL = 'button,input:not([type=hidden]),select,textarea,a[href],summary,[role]:not([role=presentation]):not([role=none]):not([role=group])';

// What a role requires, checked on up to 20 rendered instances of a component. Returns the
// problems as short sentences. A toggle button is clicked to see aria-pressed change, then clicked
// back. A state is read from the instance's classes and attributes (error or invalid, selected or
// active, disabled), the same words the capture and the styleguide use.
export function roleContractExpression(selector, role, { pressed = false } = {}) {
  return `(() => {
    let els; try { els = [...document.querySelectorAll(${JSON.stringify(selector)})].slice(0, 20); } catch { return []; }
    const role = ${JSON.stringify(role)}, pressedRole = ${JSON.stringify(!!pressed)};
    const out = new Set();
    const words = (el) => ((el.className && typeof el.className === 'string') ? el.className.toLowerCase() : '').split(/[\\s_-]+/).concat(String(el.getAttribute('data-state') || '').toLowerCase());
    const has = (el, ...w) => words(el).some((x) => w.includes(x));
    const named = (el) => !!((el.labels && el.labels.length) || (el.getAttribute('aria-label') || '').trim() || el.getAttribute('aria-labelledby') || (el.getAttribute('title') || '').trim());
    const idsExist = (v) => String(v || '').trim().split(/\\s+/).filter(Boolean).every((id) => document.getElementById(id));
    for (const el of els) {
      if (has(el, 'disabled') && !(el.disabled === true || el.getAttribute('aria-disabled') === 'true' || el.querySelector('[disabled],[aria-disabled="true"]')))
        out.add('looks disabled but is not disabled or aria-disabled');
      if (role === 'button' && pressedRole) {
        if (!el.hasAttribute('aria-pressed')) { out.add('is a toggle button without aria-pressed'); continue; }
        const before = el.getAttribute('aria-pressed');
        try { el.click(); } catch (e) {}
        const after = el.getAttribute('aria-pressed');
        if (after === before) out.add('aria-pressed does not change when clicked');
        else { try { el.click(); } catch (e) {} }
      }
      if (role === 'checkbox' || role === 'radio' || role === 'switch') {
        const input = el.matches('input') ? el : el.querySelector('input[type=checkbox],input[type=radio]');
        const aria = el.matches('[role=' + role + ']') ? el : el.querySelector('[role=' + role + ']');
        const control = input || aria;
        if (!control) out.add('has no ' + role + ' control (a native input, or role="' + role + '" with aria-checked)');
        else {
          if (!input && !control.hasAttribute('aria-checked')) out.add('role="' + role + '" without aria-checked');
          if (role === 'switch' && input && input.getAttribute('role') !== 'switch' && !aria) out.add('a switch should expose role="switch"');
          const labelled = named(control) || (input && input.closest('label')) || (el.matches('label') && el.contains(control));
          if (!labelled && !(control.textContent || '').trim()) out.add('its ' + role + ' has no label');
        }
      }
      if (role === 'textbox' || role === 'searchbox' || role === 'combobox') {
        const field = el.matches('input,textarea,select,[role=textbox],[role=searchbox],[role=combobox]') ? el : el.querySelector('input,textarea,select,[role=textbox],[role=searchbox],[role=combobox]');
        if (!field) { out.add('has no text field'); continue; }
        if (!named(field)) out.add('its field has no label');
        if (field.hasAttribute('aria-describedby') && !idsExist(field.getAttribute('aria-describedby'))) out.add('aria-describedby points to an element that does not exist');
        if (has(el, 'error', 'invalid') || has(field, 'error', 'invalid')) {
          if (field.getAttribute('aria-invalid') !== 'true') out.add('in its error state the field has no aria-invalid="true"');
          if (!field.getAttribute('aria-describedby')) {
            // A message on show that is not linked, or no message at all: an error shown only by a colour or a border
            // is not read out and not seen by everyone (WCAG 1.4.1, 3.3.1). The design owes the message.
            const shows = (x) => { const st = getComputedStyle(x); if (st.display === 'none' || st.visibility === 'hidden') return false; const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
            const words = [...el.querySelectorAll('*')].filter((x) => !x.children.length && x !== field && !x.closest('label > input') && shows(x) && (x.textContent || '').trim() && !(field.labels && [...field.labels].some((l) => l.contains(x) && l.textContent.trim() === x.textContent.trim())));
            out.add(words.length || el.querySelector('[role=alert],[aria-live]') ? 'in its error state the field is not linked to its message (aria-describedby)'
              : 'in its error state the error is shown only by its look: there is no message to read (WCAG 3.3.1). The design needs an error message part, linked to the field with aria-describedby (send it back to Figma)');
          }
        }
      }
      if (role === 'tab' || role === 'tablist') {
        const tabs = role === 'tab' ? [el] : [...el.querySelectorAll('[role=tab]')];
        if (role === 'tablist' && !tabs.length) out.add('has no role="tab" items');
        for (const t of tabs) {
          if (!t.matches('[role=tab]')) { out.add('is not exposed as role="tab"'); continue; }
          if (!t.closest('[role=tablist]')) out.add('a tab outside a role="tablist"');
          if ((has(t, 'selected', 'active', 'current') || t.getAttribute('aria-current')) && t.getAttribute('aria-selected') !== 'true') out.add('the selected tab has no aria-selected="true"');
        }
      }
    }
    return [...out];
  })()`;
}

// Deeper checks measured in the page (pure expression builders; exported for tests).
//   targets(): interactive controls under 24×24 with another control inside the 24px circle (2.5.8);
//              inline links in running text and disabled controls are exempt.
//   clipped(): text boxes whose content overflows a hidden/clipped box (for the 1.4.12 comparison).
//   moving():  elements that still transition or animate (for the prefers-reduced-motion pass).
// One trigger of a dialog or menu, in three phases: 'open' clicks it (a link does not navigate, a form does
// not submit), 'opened' says what appeared, 'after' (once Escape is pressed) says whether it closed and where the
// focus is. 'close' clicks it again when Escape left it open.
export function openerExpression(i, phase) {
  return `(() => {
    const vis = (el) => { const s = getComputedStyle(el); if (s.display==='none'||s.visibility==='hidden'||+s.opacity===0) return false; const r = el.getBoundingClientRect(); return r.width>0 && r.height>0; };
    const desc = (el) => (el.tagName.toLowerCase() + (el.id?('#'+el.id):'') + ((el.className && typeof el.className==='string') ? '.'+el.className.trim().split(/\\s+/).join('.') : '')).slice(0,80);
    const POP = 'dialog[open],[role=dialog],[role=alertdialog],[aria-modal=true],[role=menu],[role=listbox]';
    const el = document.querySelector('[data-design-system-engine-opener="${i}"]');
    const w = window, phase = ${JSON.stringify(phase)};
    if (!el) return null;
    const ctl = () => { const id = el.getAttribute('aria-controls'); return id ? document.getElementById(id.split(/\\s+/)[0]) : null; };
    if (phase === 'open') {
      w.__dseBefore = new Set([...document.querySelectorAll(POP)].filter(vis));
      w.__dseCtlShown = !!(ctl() && vis(ctl()));
      w.__dseExpanded = el.getAttribute('aria-expanded') === 'true';
      w.__dseNav = (e) => { if (e.target && e.target.closest && e.target.closest('a[href]')) e.preventDefault(); };
      w.__dseSubmit = (e) => e.preventDefault();
      w.addEventListener('click', w.__dseNav, true); document.addEventListener('submit', w.__dseSubmit, true);   // before the page's own handlers, which still run
      el.focus(); el.click();
      return true;
    }
    if (phase === 'opened') {
      const pop = [...document.querySelectorAll(POP)].filter(vis).find((p) => !w.__dseBefore.has(p) && !p.contains(el));
      const c = ctl(), shown = c && !w.__dseCtlShown && vis(c) ? c : null;
      w.__dseOpened = pop || shown || null;
      if (!w.__dseOpened && !(el.getAttribute('aria-expanded') === 'true' && !w.__dseExpanded)) return null;
      return w.__dseOpened ? (w.__dseOpened.getAttribute('role') || w.__dseOpened.tagName.toLowerCase()) + ' ' + desc(w.__dseOpened) : 'what it controls';
    }
    if (phase === 'after') {
      const o = w.__dseOpened;
      const closed = (!o || !o.isConnected || !vis(o) || (o.tagName === 'DIALOG' && !o.open)) && el.getAttribute('aria-expanded') !== 'true';
      const a = document.activeElement;
      return { closed, back: a === el || el.contains(a), at: a && a !== document.body ? desc(a) : '' };
    }
    if (phase === 'close') el.click();
    if (phase === 'close' || phase === 'done') { w.removeEventListener('click', w.__dseNav, true); document.removeEventListener('submit', w.__dseSubmit, true); }
    return true;
  })()`;
}

// A component shown only after an action (a modal opened by a "Show modal" button, a dropdown, a popover, a toast) is
// opened before it is checked, in four phases: 'list' marks the controls that may open it, those whose words
// name the component first, then the ones that say they open something (aria-haspopup, aria-expanded, aria-controls),
// then the rest, never one inside the component, one that submits a form, or one whose words delete, send, save or
// sign out (unless they name the component); 'press' presses one (a link does not navigate, a form does not submit);
// 'shown' says the component the press showed; 'done' takes the guards away.
export function revealWords(names = []) {
  return names.map((n) => String(n).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_.]+/g, ' ').toLowerCase().trim().split(/\s+/).filter(Boolean)).filter((w) => w.length);
}
export function revealExpression(roots, words, phase, k = 0) {
  return `(() => {
    const roots = ${JSON.stringify(roots ?? [])}, words = ${JSON.stringify(words ?? [])}, phase = ${JSON.stringify(phase)}, w = window;
    const vis = (el) => { const s = getComputedStyle(el); if (s.display==='none'||s.visibility==='hidden'||+s.opacity===0) return false; const r = el.getBoundingClientRect(); return r.width>0 && r.height>0; };
    const q = (s) => { try { return [...document.querySelectorAll(s)]; } catch { return []; } };
    const label = (el) => (el.getAttribute('aria-label') || el.textContent || el.value || el.title || '').trim().replace(/\\s+/g, ' ').slice(0, 60);
    if (phase === 'shown') { const el = roots.flatMap(q).find(vis); return el ? (el.getAttribute('role') || el.tagName.toLowerCase()) : null; }
    if (phase === 'list') {
      const inside = (el) => roots.some((s) => { try { return !!el.closest(s); } catch { return false; } });
      const RISKY = /\\b(delete|remove|log ?out|sign ?out|submit|save|send|pay|buy|purchase|reset|clear|discard|cancel|close|dismiss|apagar|eliminar|remover|sair|enviar|guardar|cancelar|fechar)\\b/i;
      const names = (t) => words.some((ws) => ws.every((x) => t.includes(x))) ? 4 : words.some((ws) => t.includes(ws[ws.length - 1])) ? 3 : 0;
      const opens = (el) => el.hasAttribute('aria-haspopup') || el.hasAttribute('aria-controls') || el.getAttribute('aria-expanded') === 'false' ? 2 : 0;
      const list = [...new Set(q('button, [role=button], [aria-haspopup], [aria-expanded=false], summary, input[type=button], a[href^="#"]'))]
        .filter((el) => vis(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true' && !inside(el) && !(el.type === 'submit' && el.form))
        .map((el, i) => { const t = label(el).toLowerCase(); return { el, t, s: names(t) + opens(el) + (/\\b(show|open|view|toggle|more|menu|mostrar|abrir|ver)\\b/.test(t) ? 1 : 0), i }; })
        .filter((c) => c.s >= 3 || !RISKY.test(c.t))
        .sort((a, b) => b.s - a.s || a.i - b.i).slice(0, 8);
      q('[data-design-system-engine-reveal]').forEach((e) => e.removeAttribute('data-design-system-engine-reveal'));
      return list.map((c, n) => { c.el.setAttribute('data-design-system-engine-reveal', String(n)); return label(c.el) || c.el.tagName.toLowerCase(); });
    }
    if (phase === 'press') {
      const el = document.querySelector('[data-design-system-engine-reveal="${Number(k) || 0}"]');
      if (!el) return false;
      if (!w.__dseRevealNav) {
        w.__dseRevealNav = (e) => { if (e.target && e.target.closest && e.target.closest('a[href]:not([href^="#"])')) e.preventDefault(); };
        w.__dseRevealSubmit = (e) => e.preventDefault();
        w.addEventListener('click', w.__dseRevealNav, true); document.addEventListener('submit', w.__dseRevealSubmit, true);
      }
      el.focus(); el.click();
      return true;
    }
    if (phase === 'done' && w.__dseRevealNav) { w.removeEventListener('click', w.__dseRevealNav, true); document.removeEventListener('submit', w.__dseRevealSubmit, true); w.__dseRevealNav = null; }
    return true;
  })()`;
}

// stage: where the components are drawn on a page that also uses them for its own controls (the style guide's
// previews). The checks that press keys or click (composites, widgets, openers) act only there: an arrow key on the
// page's own switch would change the component it shows, and every check after it would judge that one.
export function deepSweepExpression(roots, what, stage = null) {
  return `(() => {
    const roots = ${JSON.stringify(roots)};
    const rootEls = roots ? roots.flatMap(s => { try { return [...document.querySelectorAll(s)]; } catch { return []; } }) : [document.body];
    const stage = ${JSON.stringify(stage)};
    const all = roots ? [...new Set(rootEls.flatMap(r => [r, ...r.querySelectorAll('*')]))] : [...document.body.querySelectorAll('*')];   // roots may nest: each element once
    const scope = stage && ['composites', 'widgets', 'openers'].includes(${JSON.stringify(what)}) ? all.filter((el) => el.closest(stage)) : all;
    const vis = (el) => { const s = getComputedStyle(el); if (s.display==='none'||s.visibility==='hidden'||+s.opacity===0) return false; const r = el.getBoundingClientRect(); return r.width>0 && r.height>0; };
    const desc = (el) => (el.tagName.toLowerCase() + (el.id?('#'+el.id):'') + ((el.className && typeof el.className==='string') ? '.'+el.className.trim().split(/\\s+/).join('.') : '')).slice(0,80);
    // The design-system component an element sits in (the innermost root around it), so a bare "button" says where it is.
    const ownerOf = (el) => { if (!roots) return ''; let best = null, depth = -1; for (const s of roots) { let r; try { r = el.closest(s); } catch (e) { continue; } if (!r) continue; let d = 0; for (let n = r; n; n = n.parentElement) d++; if (d > depth) { depth = d; best = s; } } return best ? ' in ' + best : ''; };
    const what = ${JSON.stringify(what)};
    if (what === 'targets') {
      // WCAG 2.5.8: a target under 24 by 24 pixels passes only when a 24px circle on its centre touches no other target
      // and no other small target's circle. One between 24 and 44 is said as advice for touch screens (2.5.5, AAA).
      const SEL = 'a[href],button,input:not([type=hidden]),select,textarea,[role=button],[role=link],[role=checkbox],[role=radio],[role=switch],[role=tab],[role=menuitem],[role=option],[tabindex]:not([tabindex="-1"])';
      const all = [...new Set(scope.filter(el => el.matches(SEL) && vis(el) && !el.disabled && el.getAttribute('aria-disabled')!=='true'))];
      const rects = all.map(el => el.getBoundingClientRect());
      const inText = (el) => el.tagName === 'A' && el.closest('p,li,td,dd') && (el.closest('p,li,td,dd').textContent.trim().length > el.textContent.trim().length + 10);   // a link inside running text
      const byLabel = (el) => el.tagName === 'INPUT' && el.labels && [...el.labels].some(l => { const lr = l.getBoundingClientRect(); return lr.width >= 24 && lr.height >= 24; });   // its label is the target
      const small = all.map((el, i) => rects[i].width < 24 || rects[i].height < 24);
      const centre = (r) => [r.left + r.width / 2, r.top + r.height / 2];
      const out = [], roomy = new Map();
      all.forEach((el, i) => {
        const r = rects[i];
        if (inText(el) || byLabel(el)) return;
        const own = (j) => j !== i && !all[j].contains(el) && !el.contains(all[j]);
        if (!small[i]) {
          if (r.width < 44 || r.height < 44) { const k = desc(el) + ownerOf(el) + '|' + Math.round(r.width) + '×' + Math.round(r.height); roomy.set(k, (roomy.get(k) || 0) + 1); }
          return;
        }
        const [cx, cy] = centre(r);
        const touches = rects.some((o, j) => own(j) && Math.hypot(Math.max(o.left - cx, 0, cx - o.right), Math.max(o.top - cy, 0, cy - o.bottom)) < 12);
        const circles = rects.some((o, j) => own(j) && small[j] && (() => { const [ox, oy] = centre(o); return Math.hypot(ox - cx, oy - cy) < 24; })());
        if (touches || circles) out.push({ desc: desc(el) + ownerOf(el), size: Math.round(r.width) + '×' + Math.round(r.height) });
      });
      return { small: out, roomy: [...roomy].map(([k, n]) => ({ desc: k.split('|')[0], size: k.split('|')[1], places: n })) };
    }
    if (what === 'widgets') {
      // Controls built from a non-native element (a div with role=button): each is marked so Node
      // can focus it and press Enter or Space. Native controls handle the keys themselves.
      const SEL = '[role=button],[role=link],[role=checkbox],[role=switch],[role=tab],[role=menuitem],[role=option],[role=radio]';
      const NATIVE = 'button,a[href],input,select,textarea,summary';
      return scope.filter(el => el.matches(SEL) && !el.matches(NATIVE) && vis(el) && el.getAttribute('aria-disabled') !== 'true').slice(0, 60)
        .map((el, i) => { el.setAttribute('data-design-system-engine-kbd', String(i)); return { i, role: el.getAttribute('role'), desc: desc(el) }; });
    }
    if (what === 'composites') {
      // ARIA composite widgets move focus between their items with the arrow keys (radio groups,
      // tab lists, menus, list boxes). Native radio buttons do it themselves.
      const ITEM = { radiogroup: '[role=radio]', tablist: '[role=tab]', menu: '[role=menuitem]', menubar: '[role=menuitem]', listbox: '[role=option]' };
      return scope.filter(el => ITEM[el.getAttribute('role')] && vis(el)).slice(0, 30).map((el, i) => {
        const items = [...el.querySelectorAll(ITEM[el.getAttribute('role')])].filter(x => vis(x) && !x.matches('input'));
        if (items.length < 2) return null;
        el.setAttribute('data-design-system-engine-group', String(i));
        return { i, role: el.getAttribute('role'), desc: desc(el), items: items.length };
      }).filter(Boolean);
    }
    if (what === 'obscured') {
      // WCAG 2.4.11: the focused element must not be entirely hidden by other content (a sticky
      // header, a banner). Its centre and four inner corners are all covered by something else.
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight) return null;
      const pts = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 1, r.top + 1], [r.right - 1, r.top + 1], [r.left + 1, r.bottom - 1], [r.right - 1, r.bottom - 1]];
      const hidden = pts.every(([x, y]) => { const t = document.elementFromPoint(x, y); return t && t !== el && !el.contains(t) && !t.contains(el); });
      return hidden ? desc(el) : null;
    }
    if (what === 'clipped') {
      // Text cut off by its box (hidden, clipped, an ellipsis), or spilling out of a box that does not grow onto what is
      // next to it. A box that scrolls keeps its text reachable.
      const out = [];
      for (const el of scope) {
        if (!vis(el)) continue;
        if (![...el.childNodes].some(n => n.nodeType===3 && n.textContent.trim())) continue;
        const s = getComputedStyle(el);
        if (!(el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)) continue;
        const hides = /hidden|clip/.test(s.overflowX + s.overflowY) || s.textOverflow === 'ellipsis';
        if (hides) out.push(desc(el));
        else if (!/auto|scroll/.test(s.overflowX + s.overflowY) && s.display !== 'inline' && el.clientHeight > 0) out.push(desc(el) + ' (spills over what is next to it)');
      }
      return out;
    }
    if (what === 'narrow') {
      // WCAG 1.4.10 per component: on a 320px screen, the narrowest each one can be (min-content, as nothing around it
      // asks for more). Content that needs two dimensions (a data table, a picture, code) is left out, as WCAG does.
      const EXEMPT = 'table,[role=table],[role=grid],[role=treegrid],img,video,canvas,svg,pre,code,iframe,map,[role=img],[role=application]';
      const out = [];
      for (const s of roots || []) {
        let n = 0, all = [];
        try { all = [...document.querySelectorAll(s)]; } catch (e) { continue; }
        for (const el of all) {
          if (n >= 5) break;
          if (!vis(el) || el.closest(EXEMPT)) continue;
          n++;
          if (/^inline$/.test(getComputedStyle(el).display) || el.getBoundingClientRect().width <= innerWidth + 1) continue;
          const was = el.getAttribute('style');
          el.style.setProperty('width', 'min-content', 'important'); el.style.setProperty('min-width', '0', 'important'); el.style.setProperty('max-width', 'none', 'important');
          const min = el.getBoundingClientRect().width;
          if (was === null) el.removeAttribute('style'); else el.setAttribute('style', was);
          if (min > innerWidth + 1) { out.push({ el: desc(el), sel: s, width: Math.round(min) }); break; }
        }
      }
      return out;
    }
    if (what === 'moving') {
      const out = [];
      const secs = (v) => Math.max(0, ...String(v).split(',').map(x => (x.trim().endsWith('ms') ? parseFloat(x) / 1000 : parseFloat(x)) || 0));
      for (const el of scope) {
        if (!vis(el)) continue;
        const s = getComputedStyle(el);
        const anim = s.animationName !== 'none' && secs(s.animationDuration) > 0.01;
        const trans = s.transitionProperty !== 'none' && secs(s.transitionDuration) > 0.01;
        if (anim || trans) out.push(desc(el) + (anim ? ' (animation)' : ' (transition)'));
      }
      return [...new Set(out)].slice(0, 200);
    }
    if (what === 'reflow') return { scrollWidth: document.documentElement.scrollWidth, width: window.innerWidth };
    if (what === 'stops') return [...document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,summary,[tabindex]')].filter((el) => vis(el) && el.tabIndex >= 0 && !el.disabled && !el.closest('[inert]')).length;
    if (what === 'dialogs') return [...document.querySelectorAll('dialog[open],[role=dialog],[role=alertdialog],[aria-modal=true]')].filter(vis).map(desc);
    // A dialog open on the page as it loads, and whether it lies over the page (in the top layer, or fixed by itself or a
    // box around it) as a dialog that was opened does; one drawn in the page's flow is a picture of a dialog (a
    // specimen on a style guide), with nothing that opened it.
    if (what === 'dialogsAt') return [...document.querySelectorAll('dialog[open],[role=dialog],[role=alertdialog],[aria-modal=true]')].filter(vis).map((d) => {
      let over = false; try { over = d.matches(':modal'); } catch (e) {}
      for (let n = d; n && n !== document.body && !over; n = n.parentElement) { const pos = getComputedStyle(n).position; if (pos === 'fixed' || pos === 'sticky') over = true; }
      return { desc: desc(d), over };
    });
    if (what === 'openers') {
      // Controls that open a dialog, a menu or a list: each is marked so Node can open it and press Escape.
      const SEL = '[aria-haspopup]:not([aria-haspopup=false]),[aria-expanded=false][aria-controls]';
      return scope.filter(el => el.matches(SEL) && vis(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true').slice(0, 8)
        .map((el, i) => { el.setAttribute('data-design-system-engine-opener', String(i)); return { i, desc: desc(el) }; });
    }
    if (what === 'headings') return [...document.querySelectorAll('h1,[role=heading][aria-level="1"]')].filter(el => !el.closest('[hidden],[aria-hidden=true]') && getComputedStyle(el).display !== 'none').map(desc);
    if (what === 'active') {
      // A unique identity (position among all elements) plus a readable label: two links that look
      // alike are still two different stops.
      const a = document.activeElement;
      if (!a || a === document.body) return null;
      return [...document.querySelectorAll('*')].indexOf(a) + '|' + desc(a);
    }
    return null;
  })()`;
}

// ── axe-core (opt-in): broaden coverage toward full WCAG rule set ───────────
// Fetch the scanner source once (any CDN, pinned; no npm dependency), inject it into the
// already-open page and run it. Adds the rules our own five checks do not cover — non-text
// contrast, target size, duplicate ids, ARIA validity, and more — mapped to plain findings.
// Degrades to null on any failure (offline, blocked), so the core check is never affected.
// The pinned version is kept in ~/.cache after the first download (or a11y.axePath points at a
// local copy), so later runs are fast and work offline. Every copy, downloaded or cached, must match
// the pinned SHA-384 of axe.min.js: a file that does not is never injected into a page. Sources, in
// order: the CDN, then the npm registry's package (where a CDN is blocked). a11y.axePath is the
// project's own copy and is trusted as given.
const AXE_VERSION = '4.10.2';
export const AXE_SHA384 = '3NYxCdpLKVHfNs2FHPtg3qqaYuhq85m4mMnlHBlN0JzSpKYKct2PMGYfsKGaKIj4';
export const axeIntact = (s) => typeof s === 'string' && createHash('sha384').update(s).digest('base64') === AXE_SHA384;
// One file out of an npm .tgz (gzip + tar): enough tar to find a regular file by name.
export function fileFromTgz(buf, wanted) {
  const tar = gunzipSync(buf);
  for (let off = 0; off + 512 <= tar.length;) {
    const name = tar.subarray(off, off + 100).toString('utf8').replace(/\0.*$/s, '');
    if (!name) break;
    const size = parseInt(tar.subarray(off + 124, off + 136).toString('utf8').replace(/\0.*$/s, '').trim() || '0', 8);
    if (name === wanted) return tar.subarray(off + 512, off + 512 + size).toString('utf8');
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return null;
}
// Where the pinned copy is kept, and whether it is there and whole (the install and --update fetch it, so a first
// accessibility check offline still runs every rule).
export const axeCachePath = (home = homedir()) => join(home, '.cache', 'rms-design-system-engine', `axe-${AXE_VERSION}.min.js`);
export function axeCached(home = homedir()) { try { return axeIntact(readFileSync(axeCachePath(home), 'utf8')) ? axeCachePath(home) : null; } catch { return null; } }
export async function fetchAxeSource(cfg = {}) {
  const looksLikeAxe = (s) => typeof s === 'string' && s.length > 100000 && s.includes('axe.run');
  if (cfg.a11y?.axePath) { try { const s = readFileSync(resolve(cfg.a11y.axePath), 'utf8'); if (looksLikeAxe(s)) return s; } catch { /* fall through */ } }
  const cached = axeCachePath(), cacheDir = dirname(cached);
  try { const s = readFileSync(cached, 'utf8'); if (axeIntact(s)) return s; } catch { /* not cached yet */ }
  const sources = [
    async () => { const r = await fetch(`https://cdnjs.cloudflare.com/ajax/libs/axe-core/${AXE_VERSION}/axe.min.js`, { signal: AbortSignal.timeout(15000) }); return r.ok ? r.text() : null; },
    async () => { const r = await fetch(`https://registry.npmjs.org/axe-core/-/axe-core-${AXE_VERSION}.tgz`, { signal: AbortSignal.timeout(30000) }); return r.ok ? fileFromTgz(Buffer.from(await r.arrayBuffer()), 'package/axe.min.js') : null; },
  ];
  for (const get of sources) {
    let s = null;
    try { s = await get(); } catch { continue; }
    if (!axeIntact(s)) continue;   // not the pinned file: never run it
    // Written beside it, then moved into place: several checks at once never read half a file.
    try { mkdirSync(cacheDir, { recursive: true }); const tmp = `${cached}.${process.pid}.tmp`; writeFileSync(tmp, s); renameSync(tmp, cached); } catch { /* cache is optional */ }
    return s;
  }
  return null;
}
// Runs the WCAG 2.0/2.1/2.2 A and AA rules explicitly (so target size and friends are always on), the ones axe-core keeps
// experimental that stand for a WCAG criterion (an orientation lock, a label not in the name, a paragraph styled as a
// heading, table headers), and its best practices (heading order, landmarks, a dialog's name), scoped to the checked
// components when there are any. Each element it fails is located as the engine's own findings are (tag#id.class and
// the component it sits in), so a problem both find is reported once.
export const AXE_EXPERIMENTAL = ['css-orientation-lock', 'label-content-name-mismatch', 'p-as-heading', 'td-has-header', 'table-fake-caption'];
// On a page that draws components inside its own main region (the style guide), the rules that a landmark sit at the
// top of the page judge the page's nesting, never the component: a panel drawn as an aside is inside the guide's main
// there, and at the top of the product that uses it.
export const AXE_PAGE_LANDMARKS = ['landmark-banner-is-top-level', 'landmark-complementary-is-top-level', 'landmark-contentinfo-is-top-level', 'landmark-main-is-top-level'];
export function axeRules(styleguide = false) {
  return Object.fromEntries([...AXE_EXPERIMENTAL.map((id) => [id, { enabled: true }]), ['frame-tested', { enabled: false }], ...(styleguide ? AXE_PAGE_LANDMARKS.map((id) => [id, { enabled: false }]) : [])]);
}
async function runAxe(send, sessionId, axeSource, roots = null, styleguide = false) {
  if (!axeSource) return null;
  try {
    await send('Runtime.evaluate', { expression: axeSource, returnByValue: false }, sessionId);
    const ctx = roots ? `{ include: ${JSON.stringify(roots.map((s) => [s]))} }` : 'document';
    const rules = axeRules(styleguide);
    const expr = `(() => {
      const roots = ${JSON.stringify(roots)};
      const desc = (el) => (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + ((el.className && typeof el.className === 'string' && el.className.trim()) ? '.' + el.className.trim().split(/\\s+/).join('.') : '')).slice(0, 80);
      const ownerOf = (el) => { if (!roots) return ''; let best = null, depth = -1; for (const s of roots) { let r; try { r = el.closest(s); } catch (e) { continue; } if (!r) continue; let d = 0; for (let n = r; n; n = n.parentElement) d++; if (d > depth) { depth = d; best = s; } } return best ? ' in ' + best : ''; };
      const at = (t) => { try { return typeof t === 'string' ? document.querySelector(t) : null; } catch (e) { return null; } };
      return axe.run(${ctx}, { resultTypes: ['violations'], runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] }, rules: ${JSON.stringify(rules)} })
        .then(r => JSON.stringify(r.violations.map(v => ({ id: v.id, help: v.help, description: v.description, impact: v.impact, helpUrl: v.helpUrl,
          tags: (v.tags || []).filter(t => /^wcag\\d{3,4}$|^best-practice$/.test(t)), count: v.nodes.length,
          targets: v.nodes.slice(0, 4).map(n => (n.target || []).join(' ')),
          nodes: v.nodes.slice(0, 60).map(n => { const el = at((n.target || [])[0]); return { target: (n.target || []).join(' '), desc: el ? desc(el) + ownerOf(el) : null, summary: String(n.failureSummary || '').replace(/\\s+/g, ' ').trim().slice(0, 300) }; }) }))))
        .catch(e => 'ERR:' + e.message);
    })()`;
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, sessionId);
    const val = r.result?.value;
    if (typeof val !== 'string' || val.startsWith('ERR:')) return null;
    return JSON.parse(val);
  } catch { return null; }
}
// The engine's own findings that stand for each axe-core rule: an element both fail is reported once, by the engine.
export const AXE_SAME = {
  'color-contrast': ['contrast', 'hovercontrast', 'statecontrast'],
  'button-name': ['name', 'tooltipname'], 'input-button-name': ['name'], 'aria-command-name': ['name'], 'link-name': ['name', 'link'], label: ['name', 'placeholderlabel'],
  'select-name': ['name'], 'aria-input-field-name': ['name'], 'aria-toggle-field-name': ['name'], 'summary-name': ['name'], 'aria-tooltip-name': ['name'],
  'image-alt': ['textalt'], 'input-image-alt': ['textalt'], 'role-img-alt': ['textalt'], 'svg-img-alt': ['textalt'], 'area-alt': ['textalt'], 'object-alt': ['textalt'],
  'aria-allowed-attr': ['aria'], 'aria-required-attr': ['aria'], 'aria-roles': ['aria'], 'aria-valid-attr': ['aria'], 'aria-valid-attr-value': ['aria'],
  'aria-hidden-focus': ['aria'], 'aria-prohibited-attr': ['aria'], 'aria-deprecated-role': ['aria'], 'aria-conditional-attr': ['aria'], 'duplicate-id-aria': ['dupid'],
  list: ['context'], listitem: ['context'], 'aria-required-parent': ['context'], 'aria-required-children': ['context'], 'definition-list': ['context'], dlitem: ['context'],
  'target-size': ['target'], 'video-caption': ['captions'], 'no-autoplay-audio': ['autoaudio'], 'autocomplete-valid': ['autocomplete'],
  'label-content-name-mismatch': ['labelname'], 'empty-heading': ['emptylabel'], 'page-has-heading-one': ['heading'], 'scrollable-region-focusable': ['keyboard'],
  'document-title': ['pagetitle'], 'html-has-lang': ['pagelang'], 'html-lang-valid': ['pagelang'], bypass: ['bypass'],
  'avoid-inline-spacing': ['spacing'], 'meta-viewport': ['zoom'], tabindex: ['tabindex'], 'th-has-data-cells': ['table'], 'td-headers-attr': ['table'], 'td-has-header': ['table'],
};
// The element a finding is about, as tag#id.class: what comes before " in <component>", " (why)" or "::placeholder".
export const elementKey = (desc) => String(desc ?? '').replace(/^<\w+> /, '').replace(/ in [^ ]+$/, '').replace(/::placeholder.*$/, '').split(/ \(|\s/)[0];
// axe-core's violations, as the engine's findings: one per rule, with the elements the engine did not already report
// for the same problem (AXE_SAME), its severity from axe's impact (a best practice is an advisory) and its criterion.
// → [{ kind: 'axe:<rule>', rule, help, why, fix, url, wcag, severity, places, desc, elements }]
export function axeFindings(violations = [], engineFindings = []) {
  const byKind = new Map();
  for (const f of engineFindings) {
    const k = f.el ?? elementKey(f.desc);
    if (!byKind.has(f.kind)) byKind.set(f.kind, new Set());
    byKind.get(f.kind).add(k);
  }
  const rows = new Map();
  for (const v of violations) {
    const same = AXE_SAME[v.id] ?? [];
    const nodes = (v.nodes ?? (v.targets ?? []).map((t) => ({ target: t, desc: null }))).filter((n) => !(n.desc && same.some((k) => byKind.get(k)?.has(elementKey(n.desc)))));
    if (!nodes.length) continue;
    const row = rows.get(v.id) ?? { kind: `axe:${v.id}`, rule: v.id, help: v.help, why: v.description ?? v.help, fix: '', url: v.helpUrl ?? null, tags: v.tags ?? [], impact: v.impact ?? null, elements: [] };
    for (const n of nodes) if (!row.elements.some((e) => e.target === n.target)) row.elements.push(n);
    if (!row.fix) row.fix = nodes.find((n) => n.summary)?.summary ?? '';
    rows.set(v.id, row);
  }
  return [...rows.values()].map((r) => {
    const sc = r.tags.map((t) => t.match(/^wcag(\d)(\d)(\d+)$/)).filter(Boolean).map((m) => `${m[1]}.${m[2]}.${m[3]}`);
    const practice = !sc.length;
    const severity = practice || r.impact === 'minor' ? 'advisory' : r.impact === 'moderate' ? 'warning' : 'blocker';
    return { kind: r.kind, rule: r.rule, help: r.help, why: r.why, fix: r.fix || `See ${r.url}`, url: r.url, wcag: sc[0] ?? null, severity, places: r.elements.length,
      desc: r.elements.map((e) => e.desc ?? e.target).filter(Boolean).slice(0, 3).join(', '), elements: r.elements.map((e) => e.desc ?? e.target) };
  });
}

async function main() {
  const ROOT = process.cwd();
  const argv = process.argv.slice(2);
  const VERBOSE = argv.includes('--a11y');
  const JSON_MODE = argv.includes('--json');   // structured output for an agent/CI that fixes the code
  // --json-out <file>: the same structured result written to a file, beside the plain-language report.
  const JSON_OUT = argv.includes('--json-out') ? argv[argv.indexOf('--json-out') + 1] : null;
  const components = argValues('--component', argv).concat(argValues('--components', argv));
  const cliUrls = argValues('--url', argv);   // check a live page directly (any project that serves it)
  // --time-limit <sec>: the most it may take, whatever its pages ask for (the audit passes it inside a git hook).
  const TIME_LIMIT = argv.includes('--time-limit') ? Number(argv[argv.indexOf('--time-limit') + 1]) || null : null;

  let cfg = {};
  try { cfg = JSON.parse(readFileSync(join(ROOT, 'ds-config.json'), 'utf8')); }
  catch {
    // --url runs configuration-free (a non-plugin DS with no ds-config still gets checked).
    if (!cliUrls.length) { console.error('❌ ds-config.json not found at project root (or pass --url <page> to check a live URL without a config).'); process.exit(1); }
  }

  const STRICT = cfg.a11yStrict === true;
  // Every accessibility run is the whole check: axe-core's rules beside the engine's own, and the text and edges measured
  // again while each control is hovered, focused and pressed. --no-axe, --no-states (or a11y.axe / a11y.interactionStates
  // false) leave one out, and the report then says it was not checked.
  const RUN_AXE = !argv.includes('--no-axe') && cfg.a11y?.axe !== false;
  const RUN_STATES = !argv.includes('--no-states') && cfg.a11y?.interactionStates !== false;
  const leftOut = [...(RUN_AXE ? [] : ['axe-core\'s rules (--no-axe or a11y.axe: false)']), ...(RUN_STATES ? [] : ['the hover, focus and pressed states (--no-states or a11y.interactionStates: false)'])];
  // With --json the reason is JSON too, so a reader never mistakes a page that was not checked for a clean one.
  const skip = (msg) => { console.log(JSON_MODE ? JSON.stringify({ notChecked: msg }) : `⏭  [a11y] ${msg}`); process.exit(0); };

  const plugins = cfg.paths?.plugins ?? [];
  const pluginSrc = cfg.paths?.pluginCSS ?? [];

  // Every colour mode, switched the way ds-config says it is switched (media emulation, a class or a
  // data attribute on the root, high contrast): the same modeSwitch() the code capture uses.
  const modeDefs = cfg.figma?.modes?.length ? loadModes(cfg) : [{ name: 'Light', snapshotKey: 'light', cssSelector: 'root' }];
  let modes = modeDefs.map((m) => ({ name: m.name || m.snapshotKey || 'light', sw: modeSwitch(m) })).filter((m) => !m.sw.unsupported);
  const locator = await loadLocator(ROOT, cfg);   // the one shared component finder
  // A name the convention cannot make a class of (table/Cell/button gives .table/Cell/button, which no browser parses)
  // and that no code file gives a class: found by the box the page that renders the components from their code puts it
  // in, so it is checked there, never dropped.
  const selOf = (name) => {
    const sel = locator.selectorFor(name);
    return locator.sourceOf(name) === 'convention' && !/^\.-?[_a-zA-Z][\w-]*$/.test(sel) ? `[data-dse-component=${JSON.stringify(String(name))}] > .dse-case > *` : sel;
  };
  let roots = components.length ? components.filter((n) => String(n).trim()).map(selOf) : null;   // a name of spaces names nothing

  const builtUiPath = (plugin) => {
    const i = plugins.indexOf(plugin);
    const src = i >= 0 ? pluginSrc[i] : null;
    return join(ROOT, src ? src.replace(/\.src\.html$/, '.html') : `${appDir(cfg, plugin)}/ui.html`);
  };

  // Render targets — no project shape imposed. Priority: --url / a11y.urls > the generated
  // styleguide (every component × state, no dev server) > built plugin UIs > AUTO-DISCOVERY.
  const urlList = [...cliUrls, ...(cfg.a11y?.urls ?? [])];
  let stopServer = null;

  // Opt-in: (re)generate the styleguide first so a11y never audits a stale one.
  if (!urlList.length && cfg.a11y?.regenerateStyleguide && cfg.styleguide?.template) {
    try {
      const { generateStyleguide } = await import('./styleguide-gen.mjs');
      const r = await generateStyleguide(ROOT, cfg);
      console.log(`ℹ️  [a11y] regenerated styleguide → ${r.out.replace(ROOT + '/', '')}`);
    } catch (e) { console.log(`ℹ️  [a11y] styleguide regeneration skipped: ${e.message}`); }
  }

  // A React design system with no page to open: its components rendered from their own code (component-harness.mjs),
  // so clicks, keys and names are tried on what ships; the style guide only draws their markup. a11y.harness:false
  // turns it off.
  // Used in build mode (a Figma-only project building its components), or when there is no style guide and no built
  // page to open: a real page of the product is a better target than the components on their own.
  let harness = null, harnessWhy = null;
  const otherTarget = !!styleguideTarget(cfg, ROOT) || plugins.some((pl) => existsSync(builtUiPath(pl)));
  if (!urlList.length && cfg.a11y?.harness !== false && (cfg.build === true || !otherTarget)) {
    try {
      const { startHarness } = await import('./component-harness.mjs');
      const { componentSourceFiles, resolveComponentFile, textReader } = await import('./component-source.mjs');
      let propsSnap = {};
      try { propsSnap = JSON.parse(readFileSync(join(ROOT, cfg.paths?.compPropsSnapshot ?? 'src/figma-component-props.snapshot.json'), 'utf8')); } catch { /* none */ }
      const files = componentSourceFiles(ROOT, cfg).filter((f) => /\.(jsx|tsx)$/.test(f));
      if (files.length) {
        const read = textReader();
        const names = [...new Set([...locator.names(), ...Object.keys(propsSnap).filter((n) => !n.startsWith('_'))])];
        const h = await startHarness(ROOT, cfg, names, { propsSnap, locate: (n) => resolveComponentFile(n, { ROOT, cfg, files, read, classFor: (x) => locator.classFor(x) }).file });
        if (h.url) { harness = h; stopServer = h.close; }
        else if (h.why) harnessWhy = h.why;
      }
    } catch (e) { harnessWhy = String(e?.message ?? e).split('\n')[0]; }
  }
  const sg = urlList.length || harness ? null : styleguideTarget(cfg, ROOT);
  // The styleguide pins its own mode attribute: switch it too, or every mode is measured as light.
  if (sg) modes = modeDefs.map((m) => ({ name: m.name || m.snapshotKey || 'light', sw: modeSwitch(m, { styleguide: true }) })).filter((m) => !m.sw.unsupported);
  // Two colour modes on at once (dark with high contrast), for the text contrast: what each mode passes alone can fail
  // together.
  const pairModes = combinedModes(modeDefs, loadCollections(cfg).filter((c) => c.kind === 'color'))
    .map((p) => { const sw = mergeSwitches(p.parts.map(modeSwitchFor)); return { name: p.name, sw: sg ? styleguideSwitch(sw) : sw, pair: true }; })
    .filter((m) => !m.sw.unsupported);
  // On the styleguide, only the design system's own components are checked: the page's navigation,
  // badges and notes are the styleguide's chrome, not the DS.
  if ((sg || harness) && !roots) {
    let names = locator.names();
    try { names = [...new Set([...names, ...Object.keys(JSON.parse(readFileSync(join(ROOT, cfg.paths?.snapshotStructure ?? 'src/figma-structure.snapshot.json'), 'utf8')).components ?? {})])]; } catch { /* optional */ }
    const sels = names.map(selOf).filter((s) => { try { return !!s && /^[.#[a-z]/i.test(s); } catch { return false; } });
    if (sels.length) roots = sels;
  }
  let targets;
  if (urlList.length) {
    // An app page, not a story or a component's own page, is held to one main heading.
    targets = urlList.map((u) => ({ label: u, url: u, page: !/iframe\.html|[?&]path=\/(story|docs)\/|\/story\//i.test(u) }));
  } else if (harness) {
    targets = [{ label: 'the components, rendered from their code', url: harness.url, ready: 'window.__dseHarnessReady === true', harness: true }];
    console.log(`ℹ️  [a11y] target: ${harness.groups.length} component(s) rendered from their own code in each Figma variant, no dev server (${harness.groups.map((g) => g.name).join(', ')})`);
    for (const m of harness.missing) console.log(`ℹ️  [a11y] not rendered: ${m}`);
  } else if (sg) {
    targets = styleguideShares(sg);
    console.log(`ℹ️  [a11y] target: the generated styleguide — every component × state, no dev server (${sg.label}${targets.length > 1 ? `, in ${targets.length} parts of up to ${SHARE_COMPONENTS} components` : ''})`);
    // The products' own pages too: what their layout and nesting do to the components, checked as a whole page.
    // Not for a check of some components (--component); a11y.products: false leaves them out.
    if (!components.length && cfg.a11y?.products !== false) {
      const { productPages } = await import('./code-roots.mjs');
      const pages = productPages(ROOT, cfg);
      for (const { product, file } of pages) targets.push({ label: relative(ROOT, file), url: pathToFileURL(file).href, page: true, wholePage: true, product });
      if (pages.length) console.log(`ℹ️  [a11y] target: ${pages.length} product page${pages.length === 1 ? '' : 's'} as a whole (${pages.map((x) => x.product).join(', ')})`);
    }
  } else {
    targets = plugins.map(builtUiPath).filter((f) => existsSync(f)).map((f) => ({ label: f.replace(ROOT + '/', ''), url: pathToFileURL(f).href }));
  }

  // Results kept from an earlier run, for each page whose signature has not changed since (KEPT_FILE): put back, not
  // checked again. Only a page read from a file is signed; a live page is always checked.
  const REUSE = !argv.includes('--fresh') && cfg.a11y?.reuse !== false;
  const keptPath = join(ROOT, OUT_DIR, KEPT_FILE);
  const keptBefore = REUSE ? readKept(keptPath) : {};
  const keptNow = {};
  const runSig = REUSE ? runSignature({ check: checkSignature(), cfg, argv, roots, modes: [...modes, ...pairModes] }) : null;
  const runSigRendered = REUSE ? runSignature({ check: checkSignature({ kind: 'rendered' }), cfg, argv, roots, modes: [...modes, ...pairModes] }) : null;
  if (REUSE) {
    const sgSigs = new Map();
    for (const t of targets) {
      if (!/^file:/.test(t.url ?? '')) continue;
      try {
        const file = fileURLToPath(t.url.split(/[?#]/)[0]);
        const html = inlinePage(readFileSync(file, 'utf8'), dirname(file));
        if (t.styleguide) {
          if (!sgSigs.has(file)) sgSigs.set(file, styleguideSignatures(html));
          const sigs = sgSigs.get(file), names = t.only ?? t.names ?? [];
          if (!sigs || !names.length || names.some((n) => !sigs.comp[n])) continue;
          t.sig = sha(runSig, t.url, sigs.base, names.map((n) => sigs.comp[n]));
        } else t.sig = sha(runSig, t.url, html);
        t.kept = keptBefore[t.sig] ?? null;
      } catch { /* not signed: checked */ }
    }
  }

  // Nothing configured or built → be as automatic as possible: start the project's dev server
  // and discover pages (Storybook stories, else static router routes, else the base page). This
  // is what lets a non-plugin DS (SPA/Storybook) run with zero config and zero questions.
  // A project whose packages are not installed can run neither its dev server nor its components: said, not tried.
  const noPackages = existsSync(join(ROOT, 'package.json')) && !existsSync(join(ROOT, 'node_modules'));
  if (!targets.length && cfg.a11y?.discover !== false) {
    let base = cfg.a11y?.baseUrl || null;
    if (!base && !noPackages) {
      const cmd = detectServeCmd(ROOT, cfg);
      if (cmd) {
        console.log(`ℹ️  [a11y] no target configured — starting the dev server (${cmd}) to discover pages…`);
        const srv = startDevServer(cmd, ROOT);
        base = await srv.url;
        if (base) stopServer = srv.stop; else srv.stop();
      }
    }
    if (base) {
      const stories = await discoverStorybook(base);
      const found = stories || discoverRoutes(ROOT, base, { prefer: components.flatMap((c) => [c, selOf(c)]) }) || [base];
      const capped = found.slice(0, 40);
      targets = capped.map((u) => ({ label: u.startsWith(base) ? (u.slice(base.length) || '/') : u, url: u, page: !stories }));
      console.log(`ℹ️  [a11y] ${found.length === 1 ? 'checking the base page' : `${found.length} page(s) found — checking ${capped.length}`} via ${base}`);
    }
  }

  // A Vue design system's components, rendered with the project's own build (Vite, Nuxt, Vue CLI or webpack) in each
  // of their variants (Figma's, else the code's props), beside whatever pages are checked: every variant, every run,
  // wherever its pages show it or not. Scoped to the components asked for; a11y.harness:false turns it off.
  if (!urlList.length && !harness && cfg.a11y?.harness !== false && findChrome()) {   // without Chrome nothing is tried
    try {
      const { componentSourceFiles, resolveComponentFile, textReader, codeComponents } = await import('./component-source.mjs');
      const files = componentSourceFiles(ROOT, cfg).filter((f) => /\.vue$/.test(f));
      if (files.length) {
        const { startVueHarness } = await import('./vue-harness.mjs');
        let propsSnap = {};
        try { propsSnap = JSON.parse(readFileSync(join(ROOT, cfg.paths?.compPropsSnapshot ?? 'src/figma-component-props.snapshot.json'), 'utf8')); } catch { /* none */ }
        const read = textReader();
        // Every component: Figma's, and the ones only the code has (a .vue file whose root carries a class of its own).
        const figmaNames = [...new Set([...locator.names(), ...Object.keys(propsSnap).filter((n) => !n.startsWith('_'))])];
        const locate = (n) => resolveComponentFile(n, { ROOT, cfg, files, read, classFor: (x) => locator.classFor(x) }).file;
        const seen = new Set(figmaNames.map(locate).filter(Boolean).map((f) => resolve(ROOT, f)));
        const own = codeComponents(ROOT, cfg, read).filter((k) => /\.vue$/.test(k.file) && !seen.has(resolve(ROOT, k.file)));
        const ownFile = new Map(own.map((k) => [k.name, resolve(ROOT, k.file)]));
        const names = components.length ? components : [...figmaNames, ...own.map((k) => k.name)];
        // Rendered from every file of the project: unchanged since they were last checked, their results are put back
        // and nothing is built.
        const vueSig = REUSE ? sha(runSigRendered, 'vue', names, projectSignature(ROOT, cfg)) : null;
        const vueKept = vueSig ? keptBefore[vueSig] : null;
        const v = vueKept ? { kept: true } : await startVueHarness(ROOT, cfg, names, { propsSnap, read, locate: (n) => ownFile.get(n) ?? locate(n) });
        if (v.kept) targets.push({ label: vueKept.label, url: null, harness: true, sig: vueSig, kept: vueKept });
        else if (v.url) {
          const before = stopServer; stopServer = () => { before?.(); v.close(); };
          targets.push({ label: `the Vue components, rendered with the project's own ${v.build}`, url: v.url, ready: 'window.__dseHarnessReady === true', harness: true, sig: vueSig });
          console.log(`ℹ️  [a11y] target: ${v.groups.length} Vue component(s) rendered with the project's own ${v.build} in each variant (${v.groups.map((g) => `${g.name}: ${g.cases.length} from ${g.from === 'figma' ? 'Figma' : 'its props'}`).join(', ')})`);
          for (const m of v.missing) console.log(`ℹ️  [a11y] not rendered: ${m}`);
        } else if (v.why) console.log(`ℹ️  [a11y] the Vue components were not rendered from their code: ${v.why}.`);
      }
    } catch (e) { console.log(`ℹ️  [a11y] the Vue components were not rendered from their code: ${String(e?.message ?? e).split('\n')[0]}.`); }
  }

  if (!targets.length && noPackages) skip('the project\'s packages are not installed (no node_modules), so neither its dev server nor its components can run in a browser: install them (npm install, or the project\'s package manager), then run again.');
  if (!targets.length) skip(`no render targets — start your dev server and pass --url <page> (or set ds-config.json → a11y.urls / a11y.serve), or build the UIs for a static DS. Auto-discovery found nothing.${harnessWhy ? ` The components were not rendered from their code either: ${harnessWhy}.` : ''}`);
  const waitFor = cfg.a11y?.waitFor ?? null;   // optional selector to await before the sweep (SPA hydration)

  const STATE_MAP = Object.assign({}, STATE_CLASSES, cfg.a11y?.stateClasses ?? {});

  // Every page put back from an earlier run: no browser is opened.
  const toOpen = targets.filter((t) => !t.kept).length;
  const CHROME = findChrome();
  if (!CHROME && toOpen) skip('Chrome not found (set CHROME_PATH to enable)');
  if (typeof WebSocket === 'undefined' && toOpen) skip('Node >= 22 required (built-in WebSocket)');

  let browser = null;
  const cleanup = () => { try { browser?.kill(); } catch {} try { stopServer?.(); } catch {} };
  process.on('exit', cleanup);
  // A component looked for by a class no element in the code has would be waited for on every page: said at once.
  if (roots && components.length && !cliUrls.length && !cfg.a11y?.urls?.length) {
    const { componentSourceFiles, textReader } = await import('./component-source.mjs');
    const read = textReader();
    const code = componentSourceFiles(ROOT, cfg).map(read).join('\n') + [cfg.paths?.themeCSS].flat().filter(Boolean).map((f) => read(join(ROOT, f))).join('\n');
    const has = (sel) => classInCode(code, sel);
    const missing = components.filter((c) => !has(selOf(c)));
    if (missing.length === components.length) {
      const like = classesLike(code, missing);
      skip(`nothing to check for ${missing.join(', ')}: no element in the code has the class ${missing.map(selOf).join(', ')}, the one taken for ${missing.length === 1 ? 'it' : 'them'} by the naming rule.${like.length ? ` Classes in the code that hold the name: ${like.join(', ')}.` : ''} Name the component's class in ds-config.json → componentSelectors (for example "${missing[0]}": "${like[0] ?? '.its-class'}"), or check a page that shows it with --url.`);
    }
  }

  // The time the check may take grows with its pages and colour modes (a fixed two minutes stopped a scoped check of
  // 23 pages halfway, and said so only where the audit never showed it); a11y.timeoutSec sets it.
  // axe-core's rules and the states measured again add to each page's share.
  // The style guide is one page with every component on it: its share grows with them (one of 36 components stopped
  // at a page's share, and nothing it found was kept).
  const perPage = Math.max(1, modes.length) * (12 + (RUN_STATES ? 8 : 0)) + (RUN_AXE ? 20 : 0);
  const perComponent = Math.max(1, modes.length) * PER_COMPONENT_SEC;
  const share = (t) => (t.kept ? 0 : perPage + (t.styleguide ? Math.max(0, (t.components ?? 1) - 1) * perComponent : 0));
  const ownLimit = Number(cfg.a11y?.timeoutSec) || Math.min(LIMIT_CAP_SEC, Math.max(150, targets.reduce((s, t) => s + share(t), 0)));
  const limitSec = TIME_LIMIT ? Math.min(TIME_LIMIT, ownLimit) : ownLimit;
  let pagesDone = 0;
  // Out of time, the page being checked is closed, so its checks stop at once, and the report is written with what the
  // pages before it found: that page and the ones not reached are said not checked, never clean (a style guide's part
  // names its components). A run still going a minute later stops with nothing kept.
  let outOfTime = false, stopPage = null, cut = null;
  const killTimer = setTimeout(() => {
    outOfTime = true;
    console.log(`⏭  [a11y] stopped after ${limitSec}s, with ${Math.max(0, pagesDone - 1)} of ${targets.length} page(s) checked: what they found is kept, the rest is said not checked. Give it longer with ds-config.json → a11y.timeoutSec, or check fewer pages (--url).`);
    stopPage?.();
    setTimeout(() => { console.log('⏭  [a11y] the stopped check did not end within a minute: what it found is not reported.'); cleanup(); process.exit(STRICT ? 1 : 0); }, 60000).unref();
  }, limitSec * 1000); killTimer.unref();

  // A cold Chrome on a busy machine can take longer than one start allows: try once more before giving up.
  let launchError = null;
  for (let i = 0; i < 2 && !browser && toOpen; i++) browser = await launchChrome(CHROME, { tmpPrefix: 'a11y-check-' }).catch((e) => { launchError = e; return null; });
  if (!browser && toOpen) skip(`Chrome failed to start (${String(launchError?.message ?? launchError).split('\n')[0]})`);

  const { send, close: closeCDP } = browser ? await connectCDP(browser.wsUrl) : { send: null, close: () => {} };

  const findings = [];   // { kind, theme?, desc, ... }
  const axeViolations = [];
  let sweptPlugins = 0;

  const unrendered = [], unread = [], unfinished = [], notJudged = [];
  const accounted = [];   // every element measured, with its verdict
  const heard = new Map();   // what a screen reader says for each component (its first instance), or the page
  const changes = [];   // what it says when something changes (a press that opens a component, a trigger that opens a dialog)
  const instances = new Map();   // per component: how many it has on the pages, and how many the WCAG checks tried
  let axeSource = null;
  if (RUN_AXE) {
    axeSource = await fetchAxeSource(cfg);
    // Without its rules the run is not the whole check: said, never clean.
    if (!axeSource) unfinished.push(`axe-core's rules (it could not be downloaded, offline or blocked, and no copy is cached: run once online, or point ds-config.json → a11y.axePath at a local axe.min.js ${AXE_VERSION})`);
  }
  const opened = [], notOpened = [];   // a component opened by a press before it was checked, or one no press showed
  const notDrawn = [];   // a component its own code stopped from drawing on the page of components, with why (harnessNotDrawn)
  const ranChecks = new Set();   // the page-wide checks that finished (a keyboard trap, spacing, reflow, zoom, WCAG 2.1)
  const behavioursNotChecked = new Set();   // components whose behaviours the target cannot run (the style guide draws markup only)
  const pageFacts = [];   // what each whole page shows of the criteria that belong to a page (page-criteria.mjs)
  // A selector the browser cannot parse is the run's, not a page's: said once at the end, so a page it was dropped from
  // is still read whole and kept (a set, so a page put back brings it too).
  const invalidRoots = new Set();
  // What each page adds to the lists above, kept under its signature once it was read and finished (settle), or put
  // back from an earlier run instead of opening it.
  const acc = { findings, axeViolations, unrendered, unread, unfinished, notJudged, accounted, heard, changes, instances, opened, notOpened, notDrawn, ranChecks, behavioursNotChecked, invalidRoots, pageFacts };
  const reusedPages = [], cutTargets = new Set();
  let pending = null;
  const settle = () => {
    if (!pending) return;
    const { target, mark, swept } = pending;
    pending = null;
    if (!target.sig || cutTargets.has(target)) return;
    const delta = keptDelta(acc, mark);
    if (keptWhole(delta)) keptNow[target.sig] = { at: new Date().toISOString(), label: target.label, swept: sweptPlugins - swept, delta };
  };
  // A page the time limit cut or never reached: each of its components (a style guide's part), else the page, not checked.
  const notChecked = (t, why) => (t.only ?? [t.label]).map((n) => `${n} (${why})`);
  const endCut = () => {
    if (!cut) return;
    for (const [list, n] of cut.marks) list.length = n;   // the failures the closing caused are the stop, not findings
    unfinished.push(...notChecked(cut.target, `stopped partway: the check ran out of its ${limitSec}s`));
    cutTargets.add(cut.target);
    cut = null;
  };
  const dsRoots = roots;   // the design system's components: a product page is checked whole
  for (const target of targets) {
    endCut();
    settle();
    stopPage = null;
    roots = target.wholePage ? null : dsRoots;
    if (target.kept) {
      keptApply(acc, target.kept.delta);
      sweptPlugins += target.kept.swept ?? 0;
      keptNow[target.sig] = target.kept;
      reusedPages.push(target.only ? `${target.label} (${target.only.join(', ')})` : target.label);
      continue;
    }
    if (outOfTime) { unfinished.push(...notChecked(target, `not reached: the check ran out of its ${limitSec}s`)); continue; }
    pagesDone++;
    const label = target.label;
    const where = target.only ? `${label} (${target.only.join(', ')})` : label;   // a part of the style guide, by its components
    pending = { target, mark: keptMark(acc), swept: sweptPlugins };
    const { targetId, sessionId } = await openPage(send, target.url);
    stopPage = () => { cut = { target, marks: [unfinished, unread, unrendered, notOpened, notDrawn].map((l) => [l, l.length]) }; send('Target.closeTarget', { targetId }).catch(() => {}); };
    if (outOfTime) stopPage();
    try {   // the page closed by the time limit fails what was running on it: that is the stop, handled by endCut
    // up to ~10s — a dev server / SPA can be slower than a file://
    // The components rendered from their code are served here and transpiled on request: a busy machine gets ~30s.
    const loadSeconds = target.harness ? 30 : 10;
    const loaded = await waitForTrue(send, sessionId, pageLoadedExpression(waitFor) + (target.ready ? ` && (${target.ready})` : ''), { attempts: loadSeconds * 20, intervalMs: 50, tolerateErrors: true });
    if (!loaded) { unread.push(`${where} (the page did not finish loading within ${loadSeconds}s)`); await send('Target.closeTarget', { targetId }); continue; }
    await new Promise((res) => setTimeout(res, 300));   // settle — let an SPA finish its first render
    // A selector the browser cannot parse (a component named table/row gives .table/row) would make every sweep of the
    // page throw: it is dropped, and its component said not checked, never clean.
    if (roots) {
      const ok = (await send('Runtime.evaluate', { expression: `${JSON.stringify(roots)}.filter((s) => { try { document.querySelector(s); return true; } catch { return false; } })`, returnByValue: true }, sessionId)).result?.value;
      if (Array.isArray(ok) && ok.length < roots.length) {
        for (const bad of roots.filter((x) => !ok.includes(x))) invalidRoots.add(bad);
        roots = ok;
      }
    }
    // Something to check must be on the page: a page that shows none of the design system's components
    // (still rendering, or blank) is not a clean page. Wait for it, up to ~10s, then say it was not checked,
    // never "nothing to fix".
    const shows = async () => ((await send('Runtime.evaluate', { expression: `(${JSON.stringify(roots)} ?? ['body']).some((s) => { try { return !!document.querySelector(s); } catch { return false; } })`, returnByValue: true }, sessionId)).result?.value) === true;
    let shown = await shows();
    // A component asked for that is not on the page, or not seen there (a closed modal, a dropdown's menu, a toast), may
    // open after an action: after two seconds its likely openers are pressed in turn until it shows, and it is checked
    // open. What opened it is said; a press that leaves the page is undone by loading the page again.
    const reveal = components.length > 0 && !target.harness && roots?.length;
    for (let i = 0; !shown && i < (reveal ? 4 : 20); i++) { await new Promise((res) => setTimeout(res, 500)); shown = await shows(); }
    let pressed = false, revealedBy = null;   // a press that opened the component on this page
    const evalIn = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true }, sessionId).catch(() => null))?.result?.value;
    if (reveal && !(await evalIn(revealExpression(roots, [], 'shown')))) {
      const words = revealWords(components);
      const at = await evalIn('location.href');
      let tried = await evalIn(revealExpression(roots, words, 'list')) ?? [];
      pressed = tried.length > 0;
      for (let k = 0; k < tried.length; k++) {
        await evalIn(ANNOUNCE_JS); await evalIn('window.__dseAnnounce.start()');
        if (!(await evalIn(revealExpression(roots, words, 'press', k)))) continue;
        let what = null;
        for (let n = 0; n < 10 && !what; n++) { await new Promise((res) => setTimeout(res, 100)); what = await evalIn(revealExpression(roots, words, 'shown')); }
        if (what) {
          opened.push(`${components.join(', ')} on ${label}: opened by pressing "${tried[k]}"`); revealedBy = tried[k]; shown = true;
          // what a screen reader says as it opens.
          await new Promise((res) => setTimeout(res, 300));
          const heardNow = await evalIn('window.__dseAnnounce.stop()');
          if (heardNow) {
            changes.push({ page: label, what: `pressing "${tried[k]}" shows ${components.join(', ')}`, ...heardNow });
            for (const u of heardNow.unheard ?? []) findings.push({ kind: 'unannounced', plugin: label, desc: `${u.desc} "${u.text}" (shown by pressing "${tried[k]}"): ${u.why}` });
          }
          break;
        }
        // Nothing showed: whatever the press opened is closed (Escape); a page it left is loaded again, its controls listed anew.
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, sessionId).catch(() => {});
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, sessionId).catch(() => {});
        if ((await evalIn('location.href')) !== at || (await evalIn('document.querySelector("[data-design-system-engine-reveal]") === null'))) {
          await send('Page.navigate', { url: target.url }, sessionId).catch(() => {});
          await waitForTrue(send, sessionId, pageLoadedExpression(waitFor), { attempts: 200, intervalMs: 50, tolerateErrors: true });
          await new Promise((res) => setTimeout(res, 300));
          tried = await evalIn(revealExpression(roots, words, 'list')) ?? tried;
        }
      }
      await evalIn(revealExpression(roots, words, 'done'));
      if (!shown) notOpened.push(`${components.join(', ')} on ${label} (${tried.length ? `none of its ${tried.length} likely openers showed it: ${tried.slice(0, 4).map((t) => `"${t}"`).join(', ')}${tried.length > 4 ? '…' : ''}` : 'no control on the page could open it'})`);
    }
    // The rest of the ten seconds a page is given to render, when no press was tried (they took that time).
    for (let i = 4; !shown && reveal && !pressed && i < 20; i++) { await new Promise((res) => setTimeout(res, 500)); shown = await shows(); }
    if (!shown && reveal) shown = await shows();
    if (!shown) { unrendered.push(where); await send('Target.closeTarget', { targetId }); continue; }
    sweptPlugins++;
    // A keyboard user's page: one real Tab first, so the browser shows focus as it does for the keyboard
    // (:focus-visible), not as it does after a mouse click.
    try {
      for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }, sessionId);
    } catch { /* no keyboard: the sweep still runs */ }
    // A component the harness could not load or render is said, never counted as clean: per component, with why.
    if (target.harness) {
      const said = harnessNotDrawn((await send('Runtime.evaluate', { expression: 'window.__dseHarnessFailed || []', returnByValue: true }, sessionId)).result?.value ?? []);
      notDrawn.push(...said.notDrawn); unrendered.push(...said.unrendered);
    }

    // 2. Name/role — accessibility tree (theme-independent), run once per target.
    try {
      await send('Accessibility.enable', {}, sessionId);
      // Asked role by role: the whole tree of a big page (a style guide with every component drawn, thousands of
      // elements) is one message too large for the DevTools socket, which then closes and the check stalls.
      const doc = (await send('Runtime.evaluate', { expression: 'document' }, sessionId)).result?.objectId;
      const nodes = [];
      for (const role of INTERACTIVE_ROLES) nodes.push(...((await send('Accessibility.queryAXTree', { objectId: doc, role }, sessionId)).nodes ?? []));
      // The element a node stands for, as the other findings name it (tag#id.class and the component it sits in).
      const locate = async (n) => {
        if (!n.backendDOMNodeId) return null;
        const obj = await send('DOM.resolveNode', { backendNodeId: n.backendDOMNodeId }, sessionId).catch(() => null);
        if (!obj?.object?.objectId) return null;
        const r = await send('Runtime.callFunctionOn', { objectId: obj.object.objectId, returnByValue: true, arguments: [{ value: roots }],
          functionDeclaration: `function (roots) { const el = this.nodeType === 1 ? this : this.parentElement; if (!el) return null; const d = (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + ((el.className && typeof el.className === 'string' && el.className.trim()) ? '.' + el.className.trim().split(/\\s+/).join('.') : '')).slice(0, 80);
            let best = null, depth = -1; for (const s of roots || []) { let r; try { r = el.closest(s); } catch (e) { continue; } if (!r) continue; let k = 0; for (let x = r; x; x = x.parentElement) k++; if (k > depth) { depth = k; best = s; } } return { el: d, owner: best }; }` }, sessionId).catch(() => null);
        return r?.result?.value ?? null;
      };
      for (const n of nodes) {
        if (n.ignored) continue;
        const role = n.role?.value;
        if (!INTERACTIVE_ROLES.has(role)) continue;
        const name = (n.name?.value || '').trim();
        if (name && !namedByTitleOnly(n)) continue;
        const at = await locate(n);
        const where = at ? { el: at.el, ...(at.owner ? { owner: at.owner } : {}) } : {};
        if (!name) findings.push({ kind: 'name', plugin: label, role, desc: `<${role}> with no accessible name${at?.owner ? ` in ${at.owner}` : ''}`, ...where });
        else findings.push({ kind: 'tooltipname', plugin: label, role, desc: `<${role}> "${name.slice(0, 40)}", named only by its title${at?.owner ? ` in ${at.owner}` : ''}`, ...where });
      }
    } catch { /* Accessibility domain unavailable — skip name/role, not a fail */ }

    // A real Tab key press first: script focus then counts as keyboard focus, so :focus-visible
    // styles show exactly as a keyboard user sees them.
    const pressKey = async (key, code, keyCode, text, modifiers = 0) => {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode, modifiers, ...(text ? { text } : {}) }, sessionId);
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode, modifiers }, sessionId);
    };
    // The page counts as focused even when another tab of the same browser holds the window's focus:
    // without it, script focus can miss :focus / :focus-visible and a ring reads as missing.
    try { await send('Emulation.setFocusEmulationEnabled', { enabled: true }, sessionId); } catch { /* older Chrome */ }
    try { await pressKey('Tab', 'Tab', 9); } catch { /* input domain unavailable: script focus only */ }

    // 1. Contrast, 3. focus (and its ring contrast) in EVERY mode; 4/5. state exposure and keyboard
    // reachability once (they do not depend on the theme). A finding repeated in several modes is
    // reported once, with the modes it happens in.
    let first = true;
    const once = new Map();
    const note = (kind, desc, mode, extra = {}) => {
      const k = `${kind}|${desc}`;
      // Several elements can share a description ("button"): each mode is listed once, and the
      // number of elements is kept as places (the most seen in any one mode).
      const f = once.get(k);
      if (f) {
        f.perMode[mode] = (f.perMode[mode] ?? 0) + 1;
        if (!f.modes.includes(mode)) f.modes.push(mode);
        f.places = Math.max(...Object.values(f.perMode));
        return;
      }
      const nf = { kind, plugin: label, desc, modes: [mode], perMode: { [mode]: 1 }, ...extra };
      once.set(k, nf); findings.push(nf);
    };
    for (const mode of [...modes, ...pairModes]) {
      await send('Emulation.setEmulatedMedia', { features: mode.sw.media }, sessionId);
      if (mode.sw.apply) await send('Runtime.evaluate', { expression: mode.sw.apply }, sessionId);
      await send('Runtime.evaluate', { expression: SETTLE_TRANSITIONS }, sessionId).catch(() => {});
      const r = await send('Runtime.evaluate', { expression: sweepExpression(roots, !mode.pair, STATE_MAP), returnByValue: true }, sessionId).catch((e) => ({ error: e.message }));
      // Two modes at once: only the text and the icons are read again; the focus and the rest were read in each mode.
      if (mode.pair) {
        const { textEls = [], iconEls = [] } = r.result?.value ?? {};
        for (const f of contrastFindings(textEls, mode.name)) findings.push({ plugin: label, ...f });
        for (const f of iconContrastFindings(iconEls, mode.name)) findings.push({ plugin: label, ...f });
        if (textEls.length) ranChecks.add('modepairs');
        if (mode.sw.undo) await send('Runtime.evaluate', { expression: mode.sw.undo }, sessionId);
        continue;
      }
      if (!r.result?.value) { const why = r.error ?? r.exceptionDetails?.exception?.description?.split('\n')[0]; unread.push(`${where} (${mode.name}${why ? `: ${why}` : ''})`); if (mode.sw.undo) await send('Runtime.evaluate', { expression: mode.sw.undo }, sessionId); first = false; continue; }
      const { textEls = [], iconEls = [], noFocus = [], faintFocus = [], thinFocus = [], ariaState = [], notKeyboard = [], judged = [] } = r.result.value;
      // Every element read, with its verdict, so a check that passes says what it passed on.
      for (const e of accountFor(textEls, iconEls, mode.name)) if (accounted.length < 5000) accounted.push({ ...e, page: label });
      if (first) for (const d of judged) { const m = d.match(/^(.*?)(?: in ([^ ]+))?$/); accounted.push({ el: m[1], component: m[2] ?? null, what: 'control', page: label, verdict: noFocus.includes(d.replace(/ in [^ ]+$/, '')) ? 'fails' : 'passes' }); }
      for (const f of iconContrastFindings(iconEls, mode.name)) findings.push({ plugin: label, ...f });
      for (const t of thinFocus) note('focusthin', t.desc, mode.name, { px: t.px });
      for (const f of contrastFindings(textEls, mode.name)) findings.push({ plugin: label, ...f });
      // Colour vision (the way Stark and Chrome's own simulator show it): text that passes, read as people who do not see
      // red, green or blue see it.
      for (const f of cvdFindings(textEls, mode.name)) findings.push({ plugin: label, ...f });
      // two variants of a component told apart by colour alone that one deficiency sees as one.
      if (roots) { const vg = (await send('Runtime.evaluate', { expression: variantLooksExpression(roots), returnByValue: true }, sessionId).catch(() => null))?.result?.value ?? []; for (const f of cvdVariantFindings(vg)) note('cvdvariant', f.desc, mode.name, { vision: f.vision }); ranChecks.add('cvdvariant'); }
      for (const desc of noFocus) note('focus', desc, mode.name);
      // Focus indicator visible? (WCAG 1.4.11 for the focus ring — computed in Node)
      for (const f of faintFocus) {
        const bg = effectiveBg(f.bgLayers);
        // The ring is seen when its clearest tone stands out (a two-tone ring is built that way).
        const ratios = (f.colors ?? [f.color]).map(parseColor).filter((c) => c && c.a > 0).map((raw) => contrastRatio(raw.a < 1 ? over(raw, bg) : raw, bg));
        if (!ratios.length) continue;
        const ratio = Math.max(...ratios);
        if (ratio + 1e-9 < 3) note('focuscontrast', f.desc, mode.name, { ratio: Math.round(ratio * 100) / 100, threshold: 3 });
      }
      if (first) {
        for (const desc of ariaState) findings.push({ kind: 'ariastate', plugin: label, desc });
        for (const desc of notKeyboard) findings.push({ kind: 'keyboard', plugin: label, desc });
        // A pointer cursor on something Tab never reaches: Chrome's own list of its listeners says whether a script
        // handles its clicks (a listener added with addEventListener, which no attribute shows).
        for (let i = 0; i < (r.result.value.pointer ?? 0); i++) {
          const o = await send('Runtime.evaluate', { expression: `document.querySelector('[data-dse-click="${i}"]')` }, sessionId).catch(() => null);
          const id = o?.result?.objectId;
          if (!id) continue;
          const ls = (await send('DOMDebugger.getEventListeners', { objectId: id }, sessionId).catch(() => null))?.listeners ?? [];
          if (ls.some((l) => /^(click|mousedown|mouseup|pointerdown|pointerup|touchstart|touchend)$/.test(l.type))) {
            const d = (await send('Runtime.callFunctionOn', { objectId: id, functionDeclaration: 'function () { return this.__dseDesc || (this.tagName.toLowerCase() + \' (a script handles its clicks, but Tab never reaches it)\'); }', returnByValue: true }, sessionId).catch(() => null))?.result?.value;
            findings.push({ kind: 'keyboard', plugin: label, desc: d });
          }
        }
        await send('Runtime.evaluate', { expression: `document.querySelectorAll('[data-dse-click]').forEach((el) => { el.removeAttribute('data-dse-click'); delete el.__dseDesc; })` }, sessionId).catch(() => {});
      }
      if (mode.sw.undo) await send('Runtime.evaluate', { expression: mode.sw.undo }, sessionId);
      first = false;
    }
    await send('Emulation.setEmulatedMedia', { features: modes[0].sw.media }, sessionId);
    if (modes[0].sw.apply) await send('Runtime.evaluate', { expression: modes[0].sw.apply }, sessionId);
    // ── Deeper checks (WCAG 2.2): target size, a real Tab walk, dialogs and Escape, reduced motion,
    //    forced colours, text spacing, reflow (opt-in a11y.reflow), and semantics against the contract.
    //    Each one is isolated: a failure in one never stops the others or the check as a whole.
    const evalv = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sessionId)).result?.value;
    // On the style guide a component is read where it is drawn, in its own section's playground: the page's own chrome
    // (a navigation card, a hidden menu button) shares the system's classes and is never the component.
    const ownSection = (comp, sel) => (target.styleguide && sel ? `#c-${String(comp).replace(/[^\w-]+/g, '-')} .pg-preview :is(${sel})` : sel);
    // On the style guide the checks that act (a key, a click, typing) act only on a component drawn in a preview, never
    // on the page's own controls built from the same components.
    const STAGE = target.styleguide ? '.pg-preview' : null;
    const media0 = modes[0].sw.media;
    const step = makeStep(findings, unfinished, label);
    // Target size in every mode (a density mode can shrink a control), at the page's own width and again on a 320px
    // screen (a control that shrinks on a phone is measured there too): one finding per control, with the modes it
    // is small in; one small only on the narrow screen says so ("Dark, 320px wide").
    await step(async () => {
      const seen = new Map(), small = new Set();   // small: each control already found at the page's own width
      const sweep = async (narrow) => {
        for (const mode of modes) {
          await send('Emulation.setEmulatedMedia', { features: mode.sw.media }, sessionId);
          if (mode.sw.apply) await send('Runtime.evaluate', { expression: mode.sw.apply }, sessionId);
          try {
            const r = (await evalv(deepSweepExpression(roots, 'targets'))) ?? {};
            const nth = new Map();   // two controls read alike (two button.tiny) stay two findings
            for (const [kind, list] of [['target', r.small ?? []], ['target44', r.roomy ?? []]]) {
              for (const x of list) {
                const base = `${kind}|${x.desc}`, n = (nth.get(base) ?? 0) + 1;
                nth.set(base, n);
                if (narrow && small.has(`${base}|${n}`)) continue;   // small at the page's own width already: said once
                const k = narrow ? `${base}|${n}|narrow` : `${base}|${x.size}|${n}`, had = seen.get(k), where = narrow ? (modes.length > 1 ? `${mode.name}, 320px wide` : '320px wide') : mode.name;
                if (!narrow) small.add(`${base}|${n}`);
                if (had) { if (had.modes && !had.modes.includes(where)) had.modes.push(where); continue; }
                const nf = { kind, plugin: label, ...x, ...(modes.length > 1 || narrow ? { modes: [where] } : {}), ...(narrow ? { narrow: true } : {}) };
                seen.set(k, nf); findings.push(nf);
              }
            }
          } finally { if (mode.sw.undo) await send('Runtime.evaluate', { expression: mode.sw.undo }, sessionId); }
        }
      };
      await sweep(false);
      await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 640, deviceScaleFactor: 1, mobile: false }, sessionId);
      try { await sweep(true); } finally { await send('Emulation.clearDeviceMetricsOverride', {}, sessionId); }
      await send('Emulation.setEmulatedMedia', { features: modes[0].sw.media }, sessionId);
      if (modes[0].sw.apply) await send('Runtime.evaluate', { expression: modes[0].sw.apply }, sessionId);
      ranChecks.add('targets');
    });
    // WCAG 2.1 A and AA, what is left once the checks above have run (wcag-page.js): text alternatives, groups and
    // tables, reading order, input purpose, control edges, moving and flashing content, link words, empty headings,
    // label in name, valid ARIA, status messages; then what it does when used (hover content, focus, input, press).
    // The first few of each component on the page; findings say the component they sit in.
    // The checks on the first few of each component, at rest; `edgesOnly` keeps the control edges (1.4.11), which
    // depend on the colour mode and are read again in every other mode.
    // Up to 24 of each: a grid of chips is judged on its chips, not on its first; what it does when used is tried on
    // the first. → { out, total, checked }
    const wcagRun = (sel, edgesOnly) => evalv(`(async () => {
      const sel = ${JSON.stringify(sel)}, stage = ${JSON.stringify(STAGE)};
      const all = sel ? [...document.querySelectorAll(sel)] : [document.body];
      const seen = [], out = [];
      let total = 0, acted = false;
      for (const el of all) {
        if (seen.some((s) => s.contains(el)) || !el.getClientRects().length) continue;
        total++;
        if (seen.length >= 24) continue;
        seen.push(el);
        // Read at rest: the focus the checks above gave a field is taken away and every transition it starts
        // jumps to its end, so an edge never reads halfway back from its focus look (a pass in one run, a fail in the next).
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        ${SETTLE_TRANSITIONS};
        out.push(...(${edgesOnly} ? window.__wcag21.edges(el) : window.__wcag21.check(el, { name: sel || '' })).findings);
        // What it does when used is tried on the first one, on the style guide the first one drawn in a preview. Its keys
        // only where the system's script runs; the arrows, Escape, the focus given back and Tab in a modal are pressed
        // with real keys further on.
        if (!${edgesOnly} && !acted && (!stage || el.closest(stage))) { acted = true; out.push(...(await window.__wcag21.interact(el, { wait: 150, triggers: 4, keys: ${!target.styleguide} || !!document.querySelector('script[data-system-script]'), skip: ['arrows', 'escape', 'focusreturn', 'modalescape'] })).findings); }
      }
      return { out, total, checked: seen.length };
    })()`);
    // A control edge is one finding per element, with every mode it is too faint in.
    const edgeOf = new Map();
    const edgeKey = (sel, f) => `${String(f.desc).replace(/ \(.*$/, '')}|${sel ?? ''}`;
    await step(async () => {
      await evalv(WCAG_PAGE_SOURCE + '; true');
      const sels = roots ?? [null];
      for (const sel of sels) {
        const res = await wcagRun(sel, false);
        if (sel && res) { const had = instances.get(sel) ?? { total: 0, checked: 0 }; instances.set(sel, { total: had.total + res.total, checked: had.checked + res.checked }); }
        const once = new Set();
        for (const f of res?.out ?? []) {
          const desc = sel ? `${f.desc} in ${sel}` : f.desc;
          if (once.has(f.kind + desc)) continue;
          once.add(f.kind + desc);
          const nf = { kind: f.kind, plugin: label, desc, ...(f.kind === 'boundary' && modes.length > 1 ? { modes: [modes[0].name] } : {}) };
          if (f.kind === 'boundary') edgeOf.set(edgeKey(sel, f), nf);
          findings.push(nf);
        }
      }
      ranChecks.add('wcag21');
    });
    // WCAG 1.4.11 in every other colour mode: a field edge that holds in light can fade into a dark background.
    if (modes.length > 1) await step(async () => {
      for (const mode of modes.slice(1)) {
        await send('Emulation.setEmulatedMedia', { features: mode.sw.media }, sessionId);
        if (mode.sw.apply) await send('Runtime.evaluate', { expression: mode.sw.apply }, sessionId);
        try {
          for (const sel of roots ?? [null]) {
            for (const f of (await wcagRun(sel, true))?.out ?? []) {
              const k = edgeKey(sel, f), had = edgeOf.get(k);
              if (had) { if (!had.modes.includes(mode.name)) had.modes.push(mode.name); continue; }
              const nf = { kind: 'boundary', plugin: label, desc: sel ? `${f.desc} in ${sel}` : f.desc, modes: [mode.name] };
              edgeOf.set(k, nf); findings.push(nf);
            }
          }
        } finally { if (mode.sw.undo) await send('Runtime.evaluate', { expression: mode.sw.undo }, sessionId); }
      }
      await send('Emulation.setEmulatedMedia', { features: modes[0].sw.media }, sessionId);
      if (modes[0].sw.apply) await send('Runtime.evaluate', { expression: modes[0].sw.apply }, sessionId);
    });
    // Interaction states: each control hovered, focused and pressed (the pseudo-class forced through the DevTools
    // protocol, as a person's pointer or keyboard sets it), in every colour mode, and its text and its edge measured
    // again. Only what reads fine at rest and fails in the state is reported, with the state and the mode.
    if (RUN_STATES) await step(async () => {
      await send('DOM.enable', {}, sessionId);
      await send('CSS.enable', {}, sessionId);
      await evalv(WCAG_PAGE_SOURCE + '; true');
      const CONTROLS = 'a[href],button,[role=button],[role=link],[role=tab],[role=menuitem],[role=option],[role=checkbox],[role=radio],[role=switch],input:not([type=hidden]),select,textarea,summary,[tabindex]';
      const selector = roots ? roots.map((r) => `:is(${r}):is(${CONTROLS}), :is(${r}) :is(${CONTROLS})`).join(', ') : CONTROLS;
      const doc = await send('DOM.getDocument', { depth: 0 }, sessionId);
      const ids = ((await send('DOM.querySelectorAll', { nodeId: doc.root.nodeId, selector }, sessionId)).nodeIds || []).slice(0, 400);
      if (!ids.length) return;
      // Every control at once: one at a time, each answer waited for, cost a tenth of a second a control on a big page
      // (a style guide's part: 18 seconds a state), where all of them take as long as one.
      const force = (classes) => Promise.all(ids.map((id) => send('CSS.forcePseudoState', { nodeId: id, forcedPseudoClasses: classes }, sessionId).catch(() => { /* gone */ })));
      const STATES = [['hovered', ['hover']], ['focused', ['focus', 'focus-visible', 'focus-within']], ['pressed', ['active', 'hover', 'focus']]];
      const edgeAtRest = new Set([...edgeOf.entries()].flatMap(([k, f]) => (f.modes ?? [modes[0].name]).map((m) => `${k}|${m}`)));
      const stateEdges = new Map(), seenState = new Set();
      for (const mode of modes) {
        await send('Emulation.setEmulatedMedia', { features: mode.sw.media }, sessionId);
        if (mode.sw.apply) await send('Runtime.evaluate', { expression: mode.sw.apply }, sessionId);
        try {
          const restKey = new Set(findings.filter((f) => f.kind === 'contrast' && f.theme === mode.name).map((f) => f.desc + '|' + f.text));
          for (const [state, classes] of STATES) {
            await force(classes);
            try {
              await send('Runtime.evaluate', { expression: SETTLE_TRANSITIONS }, sessionId).catch(() => {});
              const r = await send('Runtime.evaluate', { expression: sweepExpression(roots, false, STATE_MAP), returnByValue: true }, sessionId);
              // A plain link pressed takes the browser's own red (-webkit-activelink), not a colour of the system's.
              const own = ((r.result?.value || {}).textEls || []).filter((t) => !(state === 'pressed' && /^a(?=[.#\s]|$)/.test(t.desc) && t.color === 'rgb(255, 0, 0)'));
              for (const f of contrastFindings(own, mode.name)) {
                if (restKey.has(f.desc + '|' + f.text)) continue;
                // Pressed holds the hover and the focus too: the same reading there is theirs, said once.
                const same = `${f.desc}|${f.text}|${f.ratio}|${mode.name}`;
                if (state === 'pressed' && seenState.has(same)) continue;
                seenState.add(same);
                findings.push({ kind: state === 'hovered' ? 'hovercontrast' : 'statecontrast', plugin: label, theme: f.theme, desc: f.desc, text: f.text, ratio: f.ratio, threshold: f.threshold, ...(state === 'hovered' ? {} : { state }) });
              }
              for (const sel of roots ?? [null]) {
                for (const f of (await wcagRun(sel, true))?.out ?? []) {
                  const k = edgeKey(sel, f);
                  if (edgeAtRest.has(`${k}|${mode.name}`)) continue;
                  if (state === 'pressed' && (stateEdges.has(`${k}|hovered`) || stateEdges.has(`${k}|focused`))) continue;
                  const had = stateEdges.get(`${k}|${state}`);
                  if (had) { if (!had.modes.includes(mode.name)) had.modes.push(mode.name); continue; }
                  const nf = { kind: 'stateedge', plugin: label, state, desc: `${sel ? `${f.desc} in ${sel}` : f.desc}`.replace(/ \(/, ` when ${state} (`), modes: [mode.name] };
                  stateEdges.set(`${k}|${state}`, nf); findings.push(nf);
                }
              }
            } finally { await force([]); }   // a state left forced would colour every check after it
          }
        } finally { if (mode.sw.undo) await send('Runtime.evaluate', { expression: mode.sw.undo }, sessionId); }
      }
      await send('Emulation.setEmulatedMedia', { features: modes[0].sw.media }, sessionId);
      if (modes[0].sw.apply) await send('Runtime.evaluate', { expression: modes[0].sw.apply }, sessionId);
      ranChecks.add('states');
    });
    // What a screen reader says (what VoiceOver or NVDA would announce), for the first instance of each component, or
    // for the page itself: from Chrome's accessibility tree, the same one they read. Words, for a person to judge.
    await step(async () => {
      await send('DOM.enable', {}, sessionId);
      await send('Accessibility.enable', {}, sessionId);
      const doc = await send('DOM.getDocument', { depth: 0 }, sessionId);
      for (const sel of roots ?? ['body']) {
        if (heard.has(sel)) continue;
        // On the style guide, the component as its own section draws it; elsewhere, its first instance on the page.
        const comp = locator.names().find((n) => selOf(n) === sel) ?? String(sel).replace(/^\./, '');
        let q = null;
        for (const at of [...new Set([ownSection(comp, sel), sel])]) {
          try { q = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: at }, sessionId); } catch { q = null; }
          if (q?.nodeId) break;
        }
        if (!q?.nodeId) continue;
        const top = (await send('Accessibility.getPartialAXTree', { nodeId: q.nodeId, fetchRelatives: false }, sessionId).catch(() => null))?.nodes?.[0];
        if (!top) continue;
        const said = [], cap = roots ? 15 : 40;
        let visited = 0;
        // In reading order. A node named from what it holds (a button, a link, a heading) says its words once: its
        // text inside is not read again.
        const walk = async (n, named) => {
          if (said.length >= cap || visited++ > 300) return;
          const line = spokenLine(n);
          // A field says its value itself: the text inside it is that value.
          const fromContents = /^(textbox|searchbox|combobox|spinbutton|slider)$/.test(String(n.role?.value)) || (n.name?.sources ?? []).some((x) => x.type === 'contents' && !x.superseded && x.value?.value);
          if (line && !(named && /^"/.test(line)) && said.at(-1) !== line) said.push(line);
          const kids = n.childIds?.length ? ((await send('Accessibility.getChildAXNodes', { id: n.nodeId }, sessionId).catch(() => null))?.nodes ?? []) : [];
          for (const k of kids) await walk(k, named || (!!line && fromContents));
        };
        await walk(top, false);
        if (said.length) heard.set(sel, said);
      }
    });
    await step(async () => {
      // Positive tabindex, then a real walk: Tab through the page and watch where the focus goes.
      const positive = await evalv(`[...document.querySelectorAll('[tabindex]')].filter(e => +e.getAttribute('tabindex') > 0).map(e => (e.tagName.toLowerCase() + (e.id ? '#' + e.id : '')).slice(0, 60))`);
      for (const d of positive ?? []) findings.push({ kind: 'tabindex', plugin: label, desc: d });
      await evalv(`document.activeElement && document.activeElement.blur && document.activeElement.blur()`);
      const seq = [], boxes = [];
      const obscured = new Set();
      for (let i = 0; i < 60; i++) {
        await pressKey('Tab', 'Tab', 9);
        seq.push(await evalv(deepSweepExpression(null, 'active')));
        if (target.page) boxes.push(await evalv(FOCUS_BOX));   // a whole page: where each stop is
        // On the styleguide a sticky header is the page's own chrome, not the design system's.
        const ob = target.styleguide ? null : await evalv(deepSweepExpression(null, 'obscured'));
        if (ob) obscured.add(ob);
      }
      for (const d of obscured) findings.push({ kind: 'obscured', plugin: label, desc: d });
      if (target.page) { for (const f of focusFlow(boxes)) findings.push({ kind: f.kind, plugin: label, desc: f.desc }); ranChecks.add('pageorder'); }
      // The same walk backwards (Shift+Tab): a trap can hold in one direction only.
      const back = [];
      for (let i = 0; i < 60; i++) { await pressKey('Tab', 'Tab', 9, undefined, 8); back.push(await evalv(deepSweepExpression(null, 'active'))); }
      const stops = (await evalv(deepSweepExpression(null, 'stops'))) ?? 0;
      // A modal dialog keeps the focus inside it on purpose (it closes with Escape): a round inside one is not a trap.
      const inModal = async (ids) => !!(await evalv(`(() => { const all = [...document.querySelectorAll('*')]; return ${JSON.stringify(ids)}.every((i) => { const el = all[i]; if (!el) return false; const d = el.closest('[aria-modal=true],dialog[open]'); if (!d) return false; try { return d.getAttribute('aria-modal') === 'true' || d.matches(':modal'); } catch (e) { return d.getAttribute('aria-modal') === 'true'; } }); })()`));
      for (const [walk, how] of [[seq, ''], [back, ' (with Shift+Tab)']]) {
        const trap = tabTrap(walk, { stops });
        if (!trap) continue;
        if (trap.cycle && await inModal(trap.ids)) continue;
        findings.push({ kind: 'tabtrap', plugin: label, desc: trap.cycle ? `Tab goes round ${trap.cycle.length} controls (${trap.cycle.join(', ')}) and never leaves them${how}` : `${trap.at}${how}` });
        break;
      }
      ranChecks.add('tabtrap');
    });
    await step(async () => {
      // a modal dialog keeps the focus inside it. Tab and Shift+Tab are pressed round it from its first control, and
      // the first press that lands on the page behind it (a control the dialog covers) is said, with where it went.
      const start = await evalv(`(() => { const d = ${OPEN_MODAL}; if (!d) return null; const f = [...d.querySelectorAll('button,a[href],input:not([type=hidden]),select,textarea,[tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled && x.getClientRects().length); (f[0] || d).focus?.(); const h = d.getAttribute('aria-label') || (d.querySelector('h1,h2,h3,[class*=title]') || {}).textContent || ''; return { n: f.length, desc: (d.tagName.toLowerCase() + (typeof d.className === 'string' && d.className.trim() ? '.' + d.className.trim().split(/\\s+/)[0] : '') + (h.trim() ? ' "' + h.trim().slice(0, 40) + '"' : '')) }; })()`);
      if (!start) return;
      ranChecks.add('modalescape');
      for (const [mods, how] of [[0, ''], [8, ' (with Shift+Tab)']]) {
        const walk = [];
        for (let i = 0; i < start.n + 2; i++) { await pressKey('Tab', 'Tab', 9, undefined, mods); walk.push(await evalv(FOCUS_IN_MODAL)); }
        const out = modalEscape(walk);
        if (out) { findings.push({ kind: 'modalescape', plugin: label, desc: `${start.desc}: Tab leaves it for ${out}, on the page behind it${how}` }); break; }
        await evalv(`(() => { const d = ${OPEN_MODAL}; const f = d && d.querySelector('button,a[href],input:not([type=hidden]),select,textarea,[tabindex]:not([tabindex="-1"])'); (f || d)?.focus?.(); })()`);
      }
    });
    await step(async () => {
      // what shows on hover shows on a tap too. Each tip trigger is hovered with the pointer; one that shows something
      // is then tapped with a touch screen emulated, and one whose tap never shows it (or closes it as it opens) is said.
      const triggers = (await evalv(tapProbeExpression(roots, 'list'))) ?? [];
      if (!triggers.length) return;
      const centre = async (i) => evalv(`(() => { const el = document.querySelector('[data-dse-tap="${i}"]'); if (!el) return null; el.scrollIntoView({ block: 'center', inline: 'center' }); const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      const fresh = async (before) => ((await evalv(tapProbeExpression(roots, 'pops'))) ?? []).filter((p) => !before.has(p.id));
      const waitFor = async (before, ms) => { for (let t = 0; t < ms; t += 100) { const f = await fresh(before); if (f.length) return f[0]; await new Promise((r) => setTimeout(r, 100)); } return null; };
      const block = `window.__dseTapNav = window.__dseTapNav || ((e) => { const a = e.target.closest && e.target.closest('a[href]'); if (a) e.preventDefault(); }); document.addEventListener('click', window.__dseTapNav, true); true`;
      await evalv(block);
      try {
        for (const t of triggers) {
          const at = await centre(t.i);
          if (!at) continue;
          const before = new Set(((await evalv(tapProbeExpression(roots, 'pops'))) ?? []).map((p) => p.id));
          await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at[0], y: at[1] }, sessionId);
          const hover = await waitFor(before, 1800);
          await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1 }, sessionId);
          await pressKey('Escape', 'Escape', 27);
          await evalv(`document.activeElement && document.activeElement.blur && document.activeElement.blur()`);
          if (!hover) continue;
          ranChecks.add('tapcontent');
          await new Promise((r) => setTimeout(r, 600));
          const before2 = new Set(((await evalv(tapProbeExpression(roots, 'pops'))) ?? []).map((p) => p.id));
          await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 }, sessionId);
          try {
            // A phone's tap puts the pointer where it lands. Chrome keeps the mouse where the hover above left it, and
            // right after the tap moves the hover back there: a mouse-out no phone sends, closing what the tap opened.
            await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at[0], y: at[1] }, sessionId);
            await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: at[0], y: at[1] }] }, sessionId);
            await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }, sessionId);
            const tap = await waitFor(before2, 1800);
            if (!tap) findings.push({ kind: 'tapcontent', plugin: label, desc: `${t.desc}: what it shows on hover (${hover.desc}${hover.tip ? ` "${hover.tip}"` : ''}) never shows on a tap` });
            await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1 }, sessionId);
            await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 2, y: 2 }] }, sessionId);
            await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }, sessionId);
          } finally { await send('Emulation.setTouchEmulationEnabled', { enabled: false }, sessionId).catch(() => {}); }
          await pressKey('Escape', 'Escape', 27);
        }
      } finally { await evalv(`document.removeEventListener('click', window.__dseTapNav, true); document.querySelectorAll('[data-dse-tap]').forEach((e) => e.removeAttribute('data-dse-tap')); true`); }
    });
    await step(async () => {
      // Escape is judged on a dialog that lies over the page; one drawn open in its flow, with nothing that opened it,
      // is said not judged here (where a control opens it, the opener check below judges it). One a press opened before
      // the check was opened by a control, so it is judged wherever it lies.
      const at = (await evalv(deepSweepExpression(null, 'dialogsAt'))) ?? [];
      if (!revealedBy) for (const d of at.filter((x) => !x.over)) notJudged.push(`Escape on ${d.desc} (${label}): drawn open in the page with nothing that opened it, so it is judged only where a control opens it`);
      const open = at.filter((x) => x.over || revealedBy).map((x) => x.desc);
      if (!open.length) return;
      await evalv(`(() => { const d = document.querySelector('dialog[open],[role=dialog],[role=alertdialog],[aria-modal=true]'); const f = d && d.querySelector('button,a[href],input,select,textarea,[tabindex]'); (f || d)?.focus?.(); })()`);
      await pressKey('Escape', 'Escape', 27);
      const still = new Set((await evalv(deepSweepExpression(null, 'dialogs'))) ?? []);
      for (const d of open) if (still.has(d)) findings.push({ kind: 'escape', plugin: label, desc: d });
    });
    await step(async () => {
      await send('Emulation.setEmulatedMedia', { features: [...media0, { name: 'prefers-reduced-motion', value: 'reduce' }] }, sessionId);
      for (const d of (await evalv(deepSweepExpression(roots, 'moving'))) ?? []) findings.push({ kind: 'motion', plugin: label, desc: d });
    });
    await step(async () => {
      const normal = new Set(findings.filter((f) => f.kind === 'focus' && f.plugin === label).map((f) => f.desc));
      await send('Emulation.setEmulatedMedia', { features: [...media0, { name: 'forced-colors', value: 'active' }] }, sessionId);
      const r2 = await evalv(sweepExpression(roots, true, STATE_MAP));
      await evalv(`document.querySelectorAll('[data-dse-click]').forEach((el) => el.removeAttribute('data-dse-click'))`);
      for (const d of r2?.noFocus ?? []) if (!normal.has(d)) findings.push({ kind: 'forcedfocus', plugin: label, desc: d });
      // What vanishes in high-contrast mode: an icon painted with a background colour (a mask), which the mode turns into
      // the page's own colour, or text it can no longer tell from its background. Only what reads at rest counts.
      const iconAtRest = new Set(findings.filter((f) => f.kind === 'iconcontrast').map((f) => f.desc));
      const textAtRest = new Set(findings.filter((f) => f.kind === 'contrast').map((f) => `${f.desc}|${f.text}`));
      const once = new Set();
      for (const f of iconContrastFindings(r2?.iconEls ?? [], 'high contrast')) if (!iconAtRest.has(f.desc) && !once.has(f.desc)) { once.add(f.desc); findings.push({ kind: 'forcedcontrast', plugin: label, desc: f.desc, ratio: f.ratio, threshold: 3, what: 'icon' }); }
      for (const f of contrastFindings(r2?.textEls ?? [], 'high contrast')) if (!f.cannotCompute && !textAtRest.has(`${f.desc}|${f.text}`)) findings.push({ kind: 'forcedcontrast', plugin: label, desc: f.desc, text: f.text, ratio: f.ratio, threshold: f.threshold, what: 'text' });
      // a state drawn only by colours the mode replaces looks like the rest there.
      for (const d of (await evalv(forcedStateExpression(roots))) ?? []) findings.push({ kind: 'forcedstate', plugin: label, desc: d });
      ranChecks.add('forcedstate');
    });
    await send('Emulation.setEmulatedMedia', { features: media0 }, sessionId).catch(() => {});
    await step(async () => {
      // WCAG 1.4.12: the spacing a reader may set; only text that is newly cut off counts.
      const before = new Set((await evalv(deepSweepExpression(roots, 'clipped'))) ?? []);
      await evalv(`(() => { const s = document.createElement('style'); s.id = '__designSystemEngine_spacing'; s.textContent = '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }'; document.head.appendChild(s); })()`);
      for (const d of (await evalv(deepSweepExpression(roots, 'clipped'))) ?? []) if (!before.has(d)) findings.push({ kind: 'spacing', plugin: label, desc: d });
      await evalv(`document.getElementById('__designSystemEngine_spacing')?.remove()`);
      ranChecks.add('spacing');
    });
    // Each component on a 320px screen: one that cannot be narrower makes the page scroll sideways wherever it is.
    if (roots) await step(async () => {
      await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 640, deviceScaleFactor: 1, mobile: false }, sessionId);
      try {
        for (const x of (await evalv(deepSweepExpression(roots, 'narrow'))) ?? []) findings.push({ kind: 'reflow', plugin: label, desc: `${x.el} (it cannot be narrower than ${x.width}px, wider than a 320px screen) in ${x.sel}` });
        ranChecks.add('reflow');
      } finally { await send('Emulation.clearDeviceMetricsOverride', {}, sessionId); }
    });
    if (cfg.a11y?.reflow === true) await step(async () => {
      await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 640, deviceScaleFactor: 1, mobile: false }, sessionId);
      const r3 = await evalv(deepSweepExpression(null, 'reflow'));
      if (r3 && r3.scrollWidth > r3.width + 1) findings.push({ kind: 'reflow', plugin: label, desc: `${label}: ${r3.scrollWidth}px wide at 320px` });
      ranChecks.add('reflow');
      await send('Emulation.clearDeviceMetricsOverride', {}, sessionId);
    });
    await step(async () => {
      // WCAG 1.4.4: at 200% zoom (half the CSS width) no text newly cut off.
      await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
      const before = new Set((await evalv(deepSweepExpression(roots, 'clipped'))) ?? []);
      await send('Emulation.setDeviceMetricsOverride', { width: 640, height: 450, deviceScaleFactor: 2, mobile: false }, sessionId);
      for (const d of (await evalv(deepSweepExpression(roots, 'clipped'))) ?? []) if (!before.has(d)) findings.push({ kind: 'zoom', plugin: label, desc: d });
      await send('Emulation.clearDeviceMetricsOverride', {}, sessionId);
      ranChecks.add('zoom');
    });
    await step(async () => {
      // Rendered role against the contract's authored semantics (contract.authored.json).
      const want = contractSemantics(ROOT, cfg);
      if (!Object.keys(want).length) return;
      await send('DOM.enable', {}, sessionId);
      const doc = await send('DOM.getDocument', { depth: 0 }, sessionId);
      for (const [comp, role] of Object.entries(want)) {
        if (components.length && !components.includes(comp)) continue;
        let q;
        try { q = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: selOf(comp) }, sessionId); } catch { continue; }
        if (!q?.nodeId) continue;
        const ax = await send('Accessibility.getPartialAXTree', { nodeId: q.nodeId, fetchRelatives: false }, sessionId);
        const got = String(ax?.nodes?.[0]?.role?.value ?? '').toLowerCase();
        if (got && !sameRole(got, role)) findings.push({ kind: 'semantics', plugin: label, desc: `${comp} (${selOf(comp)})`, got, want: role });
      }
    });
    await step(async () => {
      // Figma accessibility annotations as facts: the role, name, heading level or alt text a note
      // states, against what the component (or the named inner part) renders.
      const facts = annotationFactsFor(ROOT, cfg);
      if (!Object.keys(facts).length) return;
      let contract = {};
      try { contract = (await import(pathToFileURL(resolve(ROOT, cfg.paths?.structureContract ?? 'structure-contract.mjs')).href)).CONTRACT ?? {}; } catch { /* parts are optional */ }
      await send('DOM.enable', {}, sessionId);
      const doc = await send('DOM.getDocument', { depth: 0 }, sessionId);
      const axOf = async (selector, want = null) => {
        let q;
        try { q = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector }, sessionId); } catch { return null; }
        if (!q?.nodeId) return null;
        let ax = (await send('Accessibility.getPartialAXTree', { nodeId: q.nodeId, fetchRelatives: false }, sessionId))?.nodes?.[0];
        if (!ax) return null;
        // A plain wrapper (a div, a label around its input) may hold the component's own control, but a control it holds
        // is not always the component (a card is not the link inside it, a dialog's wrapper is not its Close button).
        if (/^(generic|none|labeltext|group|section|presentation)$/i.test(String(ax.role?.value ?? '')) || ax.ignored) {
          let ix = null;
          if (want) {
            // The role the annotation names, looked for by the role the browser gives each element inside (a native
            // <dialog>, <a href>, <li> or <input type=number> counts, not only a role attribute). When nothing inside
            // has it, the wrapper's own role is the answer.
            for (const role of [want, ...(AX_ROLE_ALIASES[want] ?? [])]) {
              const found = (await send('Accessibility.queryAXTree', { nodeId: q.nodeId, role }, sessionId).catch(() => null))?.nodes ?? [];
              ix = found.find((n) => !n.ignored) ?? null;
              if (ix) break;
            }
            // A subtree the tree leaves out (a harness host it ignores) has no computed roles to search: the element
            // that declares the role, or its native equivalent, is read on its own.
            if (!ix) {
              const wanted = `[role="${want}"]${{ textbox: ',input:not([type]),input[type=text],input[type=email],input[type=search],textarea', spinbutton: ',input[type=number]', button: ',button' }[want] ?? ''}`;
              const inner = await send('DOM.querySelector', { nodeId: q.nodeId, selector: wanted }, sessionId).catch(() => null);
              if (inner?.nodeId) ix = (await send('Accessibility.getPartialAXTree', { nodeId: inner.nodeId, fetchRelatives: false }, sessionId))?.nodes?.[0] ?? null;
            }
          } else {
            // No role named (a name, a heading level, a pressed state): the one control it wraps, when it wraps exactly
            // one. A control inside another (an icon's role inside its button) is not counted; a container of several
            // controls is read as itself.
            const obj = await send('DOM.resolveNode', { nodeId: q.nodeId }, sessionId).catch(() => null);
            const one = obj?.object?.objectId ? await send('Runtime.callFunctionOn', { objectId: obj.object.objectId, returnByValue: true, arguments: [{ value: WRAPPED_CONTROL }],
              functionDeclaration: 'function (sel) { const all = [...this.querySelectorAll(sel)]; const top = all.filter((el) => !all.some((o) => o !== el && o.contains(el))); return top.length === 1 ? all.indexOf(top[0]) : -1; }' }, sessionId).catch(() => null) : null;
            const at = one?.result?.value;
            if (Number.isInteger(at) && at >= 0) {
              const id = (await send('DOM.querySelectorAll', { nodeId: q.nodeId, selector: WRAPPED_CONTROL }, sessionId).catch(() => null))?.nodeIds?.[at];
              if (id) ix = (await send('Accessibility.getPartialAXTree', { nodeId: id, fetchRelatives: false }, sessionId))?.nodes?.[0] ?? null;
            }
          }
          if (ix && !/^(generic|none)$/i.test(String(ix.role?.value ?? ''))) ax = ix;
        }
        const prop = (n) => ax.properties?.find((p) => p.name === n)?.value?.value;
        return { role: String(ax.role?.value ?? '').toLowerCase(), name: String(ax.name?.value ?? ''), level: prop('level'), pressed: prop('pressed') };
      };
      for (const [comp, { facts: f, layers }] of Object.entries(facts)) {
        if (components.length && !components.includes(comp)) continue;
        if (Object.keys(f).length) {
          // A component the code has no markup for is drawn as a stand-in on the style guide: there is nothing of the
          // code's to read, so it is said not checked (never counted as rendering something else than Figma says).
          if (target.styleguide && await evalv(`!!document.querySelector(${JSON.stringify(ownSection(comp, selOf(comp)))})?.matches('[data-sg-standin]')`)) {
            if (!unfinished.some((u) => u.startsWith(`${comp} (`))) unfinished.push(`${comp} (the code has no markup for it: the style guide draws a stand-in)`);
            continue;
          }
          const got = await axOf(ownSection(comp, selOf(comp)), f.role ? String(f.role).toLowerCase() : null);
          if (got) for (const d of annotationMismatches(f, got)) findings.push({ kind: 'annotation', plugin: label, desc: `${comp}: ${d}` });
        }
        // A note on an inner layer is checked on the part the contract names the same way.
        for (const { layer, facts: lf } of layers) {
          if (lf.part && !lf.role && !lf.name && !lf.level) continue;   // a part role: the part-role step below checks it
          const part = (contract[comp]?.children ?? []).find((c) => String(c.name ?? '').toLowerCase() === String(layer).toLowerCase());
          if (!part?.cssSelector) { findings.push({ kind: 'annotation', plugin: label, desc: `${comp} › ${layer}: not checked, the contract has no part named "${layer}" (add it to children with its cssSelector)` }); continue; }
          const got = await axOf(ownSection(comp, part.cssSelector));
          if (got) for (const d of annotationMismatches(lf, got)) findings.push({ kind: 'annotation', plugin: label, desc: `${comp} › ${layer}: ${d}` });
        }
      }
    });
    await step(async () => {
      // Roles as contracts: what each declared role requires, on the rendered instances. The role
      // comes from the contract's authored semantics, or from a Figma note (which wins when both exist).
      const roles = Object.fromEntries(Object.entries(contractSemantics(ROOT, cfg)).map(([c, r]) => [c, { role: r }]));
      for (const [c, { facts: f }] of Object.entries(annotationFactsFor(ROOT, cfg))) if (f.role) roles[c] = { role: f.role, pressed: !!f.pressed };
      for (const [comp, r] of Object.entries(roles)) {
        if (components.length && !components.includes(comp)) continue;
        const sel = ownSection(comp, selOf(comp));
        if (!sel) continue;
        for (const problem of (await evalv(roleContractExpression(sel, r.role, { pressed: r.pressed }))) ?? []) findings.push({ kind: 'rolecontract', plugin: label, desc: `${comp} (${r.pressed ? 'toggle button' : r.role}): ${problem}` });
      }
    });
    await step(async () => {
      // Part roles and behaviours as contracts. A part's role comes from the annotation on its Figma layer; a
      // behaviour from the component's role and its annotations. Behaviours need the component's own script: on the
      // engine's style guide, which draws markup only, they are listed as not checked.
      let snap = {};
      try { snap = JSON.parse(readFileSync(resolve(ROOT, cfg.paths?.compPropsSnapshot ?? 'figma-component-props.snapshot.json'), 'utf8')); } catch { /* no annotations */ }
      // Only the notes that are requirements: a note in a design-intent category (Intent, Implementation…) asks nothing.
      const cats = loadCategories(ROOT, cfg);
      let authored = {};
      try { authored = JSON.parse(readFileSync(resolve(ROOT, cfg.contracts?.authored ?? 'contract.authored.json'), 'utf8'))?.components ?? {}; } catch { /* none */ }
      let contract = {};
      try { contract = (await import(pathToFileURL(resolve(ROOT, cfg.paths?.structureContract ?? 'structure-contract.mjs')).href)).CONTRACT ?? {}; } catch { /* parts are optional */ }
      const roles = Object.fromEntries(Object.entries(contractSemantics(ROOT, cfg)).map(([c, r]) => [c, r]));
      for (const [c, v] of Object.entries(snap)) { const w = !c.startsWith('_') && roleWordOf(requirementEntry(v, cats, cfg)?.annotations ?? []); if (w) roles[c] = w; }   // the role as Figma writes it (togglebutton, disclosure)
      // States follow their props: on the style guide, each option's effect is in its data (the code's selector for it).
      if (target.styleguide) {
        const sg = await evalv(`(() => { try { return (self.SG_DATA || JSON.parse(self.SG_DATA_JSON || document.getElementById('sg-data').textContent)).components || []; } catch (e) { return []; } })()`);
        for (const f of stateFindings((sg ?? []).map((c) => ({ ...c, role: roles[c.name] ?? c.role })))) if (!components.length || components.includes(f.component)) findings.push({ kind: 'statefollows', plugin: label, desc: f.message });
      }
      const names = [...new Set([...Object.keys(roles), ...Object.keys(snap).filter((k) => !k.startsWith('_'))])];
      const KEY = { ' ': [' ', 'Space', 32, ' '], Enter: ['Enter', 'Enter', 13, '\r'], Escape: ['Escape', 'Escape', 27], ArrowRight: ['ArrowRight', 'ArrowRight', 39], ArrowDown: ['ArrowDown', 'ArrowDown', 40], ArrowUp: ['ArrowUp', 'ArrowUp', 38], ArrowLeft: ['ArrowLeft', 'ArrowLeft', 37], Home: ['Home', 'Home', 36], End: ['End', 'End', 35] };
      // A style guide that inlines the system's own scripts (systemScripts) runs its components as the product does.
      const scripted = target.styleguide ? !!(await evalv(`!!document.querySelector('script[data-system-script]')`)) : true;
      let n = 0;
      for (const comp of names) {
        if (components.length && !components.includes(comp)) continue;
        const sel = selOf(comp);
        if (!sel) continue;
        const entry = requirementEntry(snap[comp] ?? {}, cats, cfg);
        // The parts Figma's annotations name, else the ones a control's layers say by their names (Label, Error message).
        const annotated = partRolesOf(entry);
        const parts = annotated.length ? annotated : partsFromNames((contract[comp]?.children ?? []).map((c) => c.name), roles[comp] ?? null);
        for (const { layer, part, fromName } of parts) {
          const partSel = (contract[comp]?.children ?? []).find((c) => String(c.name ?? '').toLowerCase() === String(layer).toLowerCase())?.cssSelector ?? null;
          // A label outside the shadow root its control sits in is said apart: wiring no browser makes yet.
          for (const problem of (await evalv(partRoleExpression(sel, partSel, layer, part))) ?? []) findings.push({ kind: problem?.notYet ? 'partnotyet' : 'partrole', plugin: label, desc: `${comp}: ${problem?.notYet ?? problem}${fromName ? ' (the part read from its layer\'s name: annotate it in Figma to confirm)' : ''}` });
        }
        const plan = behavioursFor(roles[comp] ?? '', entry.annotations ?? [], authored[comp]?.behaviourExceptions ?? {});
        for (const w of plan.weak) findings.push({ kind: 'behaviour', plugin: label, desc: `${comp}: the exception for "${w.id}" gives no link to the decision (an ADR or a pull request), so it is still checked` });
        if (!plan.rows.length) continue;
        if (target.styleguide && !scripted) { behavioursNotChecked.add(comp); continue; }
        const mark = `b${n++}`;
        if (!(await evalv(markInstanceExpression(sel, mark, roles[comp] ?? null)))) continue;
        for (const row of plan.rows) {
          if (row.ifClickWorks) {
            await evalv(behaviourExpression(mark, row, 'before'));
            await evalv(`document.querySelector('[data-dse-control="${mark}"]').click()`);
            const clicked = await evalv(behaviourExpression(mark, row, 'after'));
            await evalv(behaviourExpression(mark, row, 'undo'));
            if (!clicked?.ok) continue;
          }
          const tries = row.act.keys ? row.act.keys.map((k) => ({ keys: [k] })) : [row.act];
          const results = [];
          for (const t of tries) {
            const before = await evalv(behaviourExpression(mark, row, 'before'));
            if (!before) break;
            if (t.click) await evalv(`document.querySelector('[data-dse-control="${mark}"]').click()`);
            else if (t.type) await send('Input.insertText', { text: t.type }, sessionId);
            else for (const k of t.keys) await pressKey(...KEY[k]);
            results.push(await evalv(behaviourExpression(mark, row, 'after')));
            await evalv(behaviourExpression(mark, row, 'undo'));
          }
          // Arrow keys: either direction will do. Every other key, and a click, must each work.
          const ok = row.expect === 'focus-moves' ? results.some((r) => r?.ok) : results.length && results.every((r) => r?.ok);
          if (!ok && results.length) findings.push({ kind: 'behaviour', plugin: label, desc: `${comp}: ${row.says} (${row.from}), but ${results.find((r) => !r?.ok)?.saw || 'nothing happened'}` });
        }
      }
    });
    await step(async () => {
      // Composite widgets move with the arrow keys.
      for (const g of (await evalv(deepSweepExpression(roots, 'composites', STAGE))) ?? []) {
        const started = await evalv(`(() => { const g = document.querySelector('[data-design-system-engine-group="${g.i}"]'); if (!g) return false; const items = [...g.querySelectorAll('[role=radio],[role=tab],[role=menuitem],[role=option]')]; const s = items.find((x) => x.tabIndex >= 0) || items[0]; s.focus(); window.__designSystemEngineStart = s; return document.activeElement === s; })()`);
        if (!started) continue;
        const vertical = ['menu', 'listbox'].includes(g.role);
        await pressKey(vertical ? 'ArrowDown' : 'ArrowRight', vertical ? 'ArrowDown' : 'ArrowRight', vertical ? 40 : 39);
        const moved = await evalv(`(() => { const g = document.querySelector('[data-design-system-engine-group="${g.i}"]'); return !!g && document.activeElement !== window.__designSystemEngineStart && g.contains(document.activeElement); })()`);
        if (!moved) findings.push({ kind: 'arrows', plugin: label, desc: `${g.desc} [role=${g.role}]` });
      }
    });
    await step(async () => {
      // Controls built from plain elements respond to Enter (and Space). Last, since it presses keys
      // on the page: the click is caught before the element's own handler, so nothing navigates.
      for (const w of (await evalv(deepSweepExpression(roots, 'widgets', STAGE))) ?? []) {
        const keys = ['checkbox', 'switch', 'radio', 'option'].includes(w.role) ? [[' ', 'Space', 32, ' ']] : w.role === 'button' ? [['Enter', 'Enter', 13, '\r'], [' ', 'Space', 32, ' ']] : [['Enter', 'Enter', 13, '\r']];
        for (const [key, code, kc, text] of keys) {
          const armed = await evalv(`(() => { const el = document.querySelector('[data-design-system-engine-kbd="${w.i}"]'); if (!el) return false;
            const aria = () => [...el.attributes].filter((a) => /^aria-(checked|pressed|selected|expanded)$/.test(a.name)).map((a) => a.name + '=' + a.value).join();
            window.__designSystemEngineHit = 0; window.__designSystemEngineAria = aria; window.__designSystemEngineWas = aria();
            el.__designSystemEngineOn = (e) => { window.__designSystemEngineHit++; e.preventDefault(); e.stopImmediatePropagation(); };
            el.addEventListener('click', el.__designSystemEngineOn, true); el.focus(); return document.activeElement === el; })()`);
          if (!armed) break;   // not focusable: the keyboard check already reports it
          await pressKey(key, code, kc, text);
          const hit = await evalv(`(() => { const el = document.querySelector('[data-design-system-engine-kbd="${w.i}"]'); if (!el) return true; el.removeEventListener('click', el.__designSystemEngineOn, true); return window.__designSystemEngineHit > 0 || window.__designSystemEngineAria() !== window.__designSystemEngineWas; })()`);
          if (!hit) { findings.push({ kind: 'activate', plugin: label, desc: `${w.desc} [role=${w.role}] (${code})` }); break; }
        }
      }
    });
    await step(async () => {
      // A dialog or menu opened from its trigger closes on Escape and gives the focus back to the trigger.
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      await evalv(ANNOUNCE_JS);
      for (const t of (await evalv(deepSweepExpression(roots, 'openers', STAGE))) ?? []) {
        await evalv('window.__dseAnnounce.start()');
        if (!(await evalv(openerExpression(t.i, 'open')))) continue;
        await wait(200);
        const what = await evalv(openerExpression(t.i, 'opened'));
        const heardNow = await evalv('window.__dseAnnounce.stop()');
        if (!what) { await evalv(openerExpression(t.i, 'done')); continue; }   // nothing opened that the page shows: not judged
        // what a screen reader says as it opens (the focus going into it, or its words in a live region).
        if (heardNow) {
          changes.push({ page: label, what: `${t.desc} opens ${what}`, ...heardNow });
          for (const u of heardNow.unheard ?? []) findings.push({ kind: 'unannounced', plugin: label, desc: `${u.desc} "${u.text}" (opened by ${t.desc}): ${u.why}` });
        }
        await pressKey('Escape', 'Escape', 27);
        await wait(200);
        const after = await evalv(openerExpression(t.i, 'after'));
        if (after && !after.closed) { findings.push({ kind: 'escape', plugin: label, desc: `${what} (opened by ${t.desc})` }); await evalv(openerExpression(t.i, 'close')); continue; }
        await evalv(openerExpression(t.i, 'done'));
        if (after && !after.back) findings.push({ kind: 'focusreturn', plugin: label, desc: `${t.desc}: the focus goes to ${after.at || 'the page'}` });
      }
    });
    if (target.page && !roots) await step(async () => {
      // An app page names what it is about with one main heading; a component page or a story does not have to.
      const h1 = (await evalv(deepSweepExpression(null, 'headings'))) ?? [];
      if (h1.length !== 1) findings.push({ kind: 'heading', plugin: label, desc: h1.length ? `${label}: ${h1.length} main headings (${h1.slice(0, 3).join(', ')})` : `${label}: no main heading (h1)` });
    });
    // What the page shows of the criteria that belong to a page (its title, its language, a way past its repeated
    // blocks, its navigation, its help, its forms): tried across the pages once all are read.
    if (target.page) await step(async () => {
      const facts = await evalv(PAGE_FACTS);
      if (facts && typeof facts === 'object') pageFacts.push({ label, ...(target.product ? { product: target.product } : {}), ...facts });
    });

    if (axeSource) {
      const v = await runAxe(send, sessionId, axeSource, roots, !!target.styleguide);
      if (v) for (const row of v) axeViolations.push(row);
      else unfinished.push(`${label}: axe-core's rules (the scan did not finish)`);
    }
    await send('Target.closeTarget', { targetId });
    } catch (e) { if (!cut) throw e; }
  }
  endCut();
  settle();
  for (const bad of invalidRoots) unread.push(`${String(bad).replace(/^\./, '')} (its selector ${bad} is not valid CSS, so it was not checked)`);
  roots = dsRoots;
  // The criteria that belong to a page, tried on each page and across the pages of one product (page-criteria.mjs);
  // where the flows are named (a11y.flows), a flow never asking twice for what it was given.
  const pagesResult = pageFacts.length ? pageCriteria(pageFacts, { flows: cfg.a11y?.flows ?? [] }) : null;
  if (pagesResult) findings.push(...pagesResult.findings);
  if (REUSE) { try { mkdirSync(dirname(keptPath), { recursive: true }); writeFileSync(keptPath, JSON.stringify({ pages: keptToWrite(keptBefore, keptNow) }) + '\n'); } catch { /* keeping is a convenience */ } }
  if (reusedPages.length && !JSON_MODE) console.log(`ℹ️  [a11y] ${reusedPages.length} of ${targets.length} page${targets.length === 1 ? '' : 's'} unchanged since ${reusedPages.length === 1 ? 'it was' : 'they were'} last checked: ${reusedPages.length === 1 ? 'its results are' : 'their results are'} put back, not checked again (--fresh checks every page again)`);
  // What was found on a product's own page says which product.
  const productOf = new Map(targets.filter((t) => t.product).map((t) => [t.label, t.product]));
  if (productOf.size) for (const f of [...findings, ...axeViolations]) if (productOf.has(f.plugin)) f.product = productOf.get(f.plugin);

  closeCDP(); cleanup(); clearTimeout(killTimer);

  const notOpenedLine = notOpened.length ? ` Not opened by any press: ${notOpened.join('; ')}.` : '';
  if (!sweptPlugins && outOfTime) skip(`stopped after ${limitSec}s, before any page was checked. Give it longer with ds-config.json → a11y.timeoutSec.`);
  if (!sweptPlugins) skip(unrendered.length ? `nothing rendered to check — ${unrendered.join(', ')} showed none of the design system's components within 10s.${notOpenedLine}` : 'nothing rendered to check — a --url/dev-server page did not load, or the plugin UIs are not built');
  for (const o of opened) console.log(`ℹ️  [a11y] ${o}, then checked open`);
  for (const o of notOpened) console.log(`⚠️  [a11y] not opened: ${o}; not checked open, so not clean`);
  for (const o of notDrawn) console.log(`⚠️  [a11y] not drawn from its code: ${o}; not checked, so not clean`);
  if (unrendered.length) console.log(`⚠️  [a11y] not checked: ${unrendered.join(', ')} showed none of the design system's components within 10s`);
  if (unread.length) console.log(`⚠️  [a11y] partly not checked: the page could not be read in ${unread.join(', ')}; those results are missing, not clean`);
  if (unfinished.length) console.log(`⚠️  [a11y] partly not checked: ${unfinished.join('; ')}; those results are missing, not clean`);
  for (const n of notJudged) console.log(`⏭  [a11y] ${n}`);
  if (behavioursNotChecked.size) console.log(`ℹ️  [a11y] behaviours not checked for ${[...behavioursNotChecked].join(', ')}: the style guide draws markup without the components' script. List the system's scripts in ds-config.json → systemScripts, or point a11y.urls (or --url) at a page that runs them (Storybook, the app), to check them.`);

  // ── Report ────────────────────────────────────────────────────────────────────
  // A message saw appear unheard is said once, with what showed it: the in-page status check's line for it goes.
  const unheardEls = new Set(findings.filter((f) => f.kind === 'unannounced').map((f) => `${f.plugin}|${elementKey(f.desc)}`));
  for (let i = findings.length - 1; i >= 0; i--) if (findings[i].kind === 'status' && unheardEls.has(`${findings[i].plugin}|${elementKey(findings[i].desc)}`)) findings.splice(i, 1);
  const cannot   = findings.filter((f) => f.kind === 'contrast' && f.cannotCompute);
  const measured = findings.filter((f) => !(f.kind === 'contrast' && f.cannotCompute));
  const themes   = [...new Set(modes.map((m) => m.name))];
  // axe-core's rules, each one finding with the elements the engine's own checks did not already report.
  const axeRows = RUN_AXE ? axeFindings(axeViolations, measured) : [];
  const axeNodes = axeViolations.reduce((n, v) => n + (v.count ?? 0), 0);
  const axeKept = axeRows.reduce((n, r) => n + r.places, 0);
  // Every kind in the order the checks are listed in (a kind a new check adds comes after them), then axe-core's rules.
  const kinds = [...new Set([...A11Y_ORDER, ...Object.keys(A11Y_GUIDE), ...measured.map((f) => f.kind)])];
  // Blockers first, then warnings, then advisories; within each, the order the checks are listed in.
  const buckets = [...kinds.map((k) => { const list = measured.filter((f) => f.kind === k); return [k, A11Y_GROUPED.has(k) ? groupSame(list) : list]; }), ...axeRows.map((r) => [r.kind, [r]])].filter(([, l]) => l.length)
    .map((b, i) => [b, i]).sort((x, y) => SEVERITY_ORDER[bucketSeverity(...x[0])] - SEVERITY_ORDER[bucketSeverity(...y[0])] || x[1] - y[1]).map(([b]) => b);
  const total = buckets.reduce((n, [, l]) => n + l.length, 0);
  const inThemes = themes.length > 1 ? ` (checked in ${themes.length} themes)` : '';
  const partial = !!(unread.length || unrendered.length || unfinished.length || notOpened.length || notDrawn.length || leftOut.length);
  const verdict = a11yVerdict(buckets, { cannot: cannot.length, partial });
  // Must-pass stops on a blocker or a warning; an advisory never stops a run.
  const stops = verdict.blockers + verdict.warnings;

  const axe = RUN_AXE ? summarizeAxe(axeViolations) : [];
  // What was measured: every text and icon in each theme, every control's focus, and how many instances of each
  // component the WCAG checks tried, so a pass says what it passed on.
  const count = (what) => accounted.filter((e) => e.what === what && (what === 'control' || e.theme === themes[0])).length;
  const partly = [...instances].filter(([, v]) => v.total > v.checked).map(([sel, v]) => `${v.checked} of the ${v.total} ${sel}`);
  const measuredInfo = { texts: count('text'), icons: count('icon'), controls: count('control'), components: new Set(accounted.map((e) => e.component).filter(Boolean)).size, themes: themes.length,
    ...(instances.size ? { instances: Object.fromEntries(instances) } : {}), ...(partly.length ? { partly } : {}) };
  // Findings name the component they sit in ("… in .chip"); that component links to Figma.
  const { figmaLinker } = await import('./figma-link.mjs');
  const linkFor = figmaLinker(ROOT, cfg);
  // Every component the system has: the locator's, and those only Figma's snapshots list (their selectors come from the
  // locator's convention all the same).
  let everyName = locator.names();
  for (const f of [cfg.paths?.snapshotStructure ?? 'src/figma-structure.snapshot.json', cfg.paths?.compPropsSnapshot ?? 'src/figma-component-props.snapshot.json']) {
    try { const j = JSON.parse(readFileSync(join(ROOT, f), 'utf8')); everyName = [...new Set([...everyName, ...Object.keys(j.components ?? j).filter((n) => !n.startsWith('_'))])]; } catch { /* optional */ }
  }
  const bySel = new Map(everyName.map((n) => [selOf(n), n]));
  // The owner is the selector the sweep matched; a component's selector can also be written as a
  // list or with its own class first, so the first class of each is compared too.
  const firstClass = (sel) => String(sel ?? '').match(/\.(-?[_a-zA-Z][\w-]*)/)?.[1];
  const byClass = new Map(everyName.map((n) => [firstClass(selOf(n)), n]).filter(([k]) => k));
  // Read from the finding: "… in .chip", a description that starts with the component's name ("toast: …"), or the
  // element itself (button.buttonPrimary.fix-action: the first of its classes that is a component's).
  const allNames = new Set(everyName);
  const ownerName = (desc) => {
    const d = String(desc ?? '');
    const m = d.match(/ in (.+)$/);
    const inSel = m && (bySel.get(m[1]) ?? byClass.get(firstClass(m[1])));
    if (inSel) return inSel;
    const named = d.match(/^([\w/-]+): /);
    if (named && allNames.has(named[1])) return named[1];
    for (const k of d.split(/\s/)[0].match(/\.(-?[_a-zA-Z][\w-]*)/g) ?? []) { const n = byClass.get(k.slice(1)); if (n) return n; }
    return null;
  };
  const figmaOf = (desc) => { const n = ownerName(desc); return n ? linkFor(n) : null; };
  // Must-pass (a11yStrict) also counts axe's serious and critical violations, not only this check's own.
  // axe-core's serious and critical rules are blockers in the verdict now; kept for a reader of the older field.
  const severeAxe = axeRows.filter((r) => r.severity === 'blocker').length;

  // ── Machine lane (--json): precise, parseable — for an agent/CI that fixes the code ──
  const machine = (withElements = false) => ({
    target: targets.map((t) => t.label),
    usedStyleguide: !!sg,
    themes, strict: STRICT, total, cannotMeasure: cannot.length,
    // The pages put back from an earlier run, unchanged since: their results are that run's.
    ...(reusedPages.length ? { reused: reusedPages } : {}),
    verdict,
    checkedAt: new Date().toISOString(),
    // The page-wide checks that finished: a criterion they stand for (a keyboard trap, text spacing, reflow, zoom) is
    // met only where its check ran.
    ran: [...ranChecks],
    // The criteria that belong to a page, each with its status and the pages it was tried on (page-criteria.mjs).
    ...(pagesResult ? { pages: { criteria: pagesResult.criteria, groups: pagesResult.groups, flows: pagesResult.flows } } : {}),
    issues: buckets.flatMap(([kind, list]) => list.map((f) => { const r = a11yFindingRecord(kind, f); const n = ownerName(f.desc); if (n) r.component = n; const u = figmaOf(f.desc); if (u) r.figma = u; return r; })),
    // What could not be read, rendered or finished: never a clean result, so an agent or CI can tell.
    ...(unread.length || unrendered.length || unfinished.length || notOpened.length || notDrawn.length ? { notRead: [...unread, ...unrendered.map((u) => `${u} (not rendered)`), ...notOpened.map((u) => `${u} (not opened)`), ...notDrawn.map((u) => `${u} (not drawn from its code)`), ...unfinished] } : {}),
    // A component opened by a press before it was checked (a modal behind its "Show" button), and by which.
    ...(opened.length ? { opened } : {}),
    // What a check left alone on purpose, with why (a dialog drawn as a picture): neither a finding nor clean.
    ...(notJudged.length ? { notJudged } : {}),
    ...(RUN_AXE ? { axe, severeAxe } : {}),
    // A part of the check turned off for this run (--no-axe, --no-states): the verdict covers the rest only.
    ...(leftOut.length ? { leftOut } : {}),
    measured: measuredInfo,
    // What a screen reader says for each component (its first instance), or for the page: for a person to judge the words.
    ...(heard.size ? { heard: Object.fromEntries([...heard].map(([sel, l]) => [sel === 'body' ? 'page' : bySel.get(sel) ?? sel, l])) } : {}),
    // what it says when something changes: each press that opened something, the words said and where the focus went.
    ...(changes.length ? { heardOnChange: changes.map((c) => ({ page: c.page, what: c.what, says: changeLine(c), said: c.said, focus: c.focus })) } : {}),
    // Each element measured, with its verdict: in the file the audit keeps, and with --a11y on the screen.
    ...(withElements ? { elements: accounted } : {}),
  });
  if (JSON_OUT) { try { mkdirSync(dirname(resolve(JSON_OUT)), { recursive: true }); writeFileSync(resolve(JSON_OUT), JSON.stringify(machine(true), null, 2) + '\n'); } catch { /* the file is a convenience */ } }
  if (JSON_MODE) {
    console.log(JSON.stringify(machine(VERBOSE), null, 2));
    process.exit(STRICT && stops ? 1 : 0);
  }

  // ── Human lane (default): plain language, no jargon ──
  console.log(`\n─── Accessibility check ${STRICT ? '(must pass)' : components.length ? `(${components.join(', ')}: each line is part of building it, unless it says to send it back to Figma)` : '(advisory — never blocks the build)'} ───\n`);
  if (!total && (unread.length || unrendered.length || unfinished.length || notOpened.length || notDrawn.length)) {
    console.log(`Nothing found in what could be read${inThemes}, but part of it was not checked (see ⚠️ above): not a clean result.`);
  } else if (!total) {
    console.log(`Good news: nothing to fix here${inThemes}.`);
  } else {
    console.log(`Found ${plural(total, 'thing', 'things')} that would make this hard to use for some people${inThemes}:\n`);
    for (const [kind, list] of buckets) {
      const g = guideFor(kind, list);
      const places = list.reduce((n, f) => n + (f.places ?? 1), 0);
      console.log(`• ${SEVERITY_WORD[bucketSeverity(kind, list)]}: ${g.title(list.length)}${places > list.length ? ` (${places} places on the page)` : ''}`);
      console.log(`     Why it matters: ${g.why}`);
      console.log(`     What to do:     ${g.fix}`);
      if (VERBOSE) {
        console.log(`     Where:`);
        // An axe-core rule lists each element it failed; the engine's own kinds one line per finding.
        const lines = list[0]?.rule ? list[0].elements.map((e) => e) : list.map((f) => {
          const inSel = String(f.desc ?? '').match(/ in (.+)$/)?.[1];
          const where = A11Y_GROUPED.has(kind) ? (inSel ? ` · in ${ownerName(f.desc) ?? inSel}` : f.desc ? ` · ${f.desc}` : '') : '';
          return `${a11yItemLine(kind, f)}${where}`;
        });
        for (const l of lines.slice(0, 100)) console.log(`       - ${l}`);
        if (lines.length > 100) console.log(`       - ...and ${lines.length - 100} more`);
        // The design-system components these sit in, opened in Figma.
        const owners = [...new Set((list[0]?.rule ? list[0].elements : list.map((f) => f.desc)).map((d) => ownerName(d)).filter(Boolean))];
        for (const n of owners.slice(0, 10)) { const u = linkFor(n); if (u) console.log(`       🔗 ${n} in Figma: ${u}`); }
      }
      console.log('');
    }
    if (!VERBOSE) console.log(`Want the exact list? Run the same command again with --a11y — it shows every element and where to find it. (Add --json instead for a machine-readable version an agent can act on.)`);
  }
  if (cannot.length) {
    console.log(`\n${cannot.length === 1 ? 'One piece of text sits' : `${cannot.length} pieces of text sit`} on an image or gradient background, so its readability could not be measured automatically — please check ${cannot.length === 1 ? 'it' : 'them'} by eye.`);
  }

  // ── What a screen reader says: with --a11y, or for the few components a run was asked about ──
  if (heard.size && (VERBOSE || (components.length && components.length <= 5))) {
    console.log(`\nWhat a screen reader says (VoiceOver and NVDA read the same tree), so a person can judge the words:`);
    for (const [sel, l] of heard) console.log(`  ${sel === 'body' ? 'The page' : bySel.get(sel) ?? sel}: ${l.join(' · ')}`);
  }
  if (changes.length && (VERBOSE || (components.length && components.length <= 5))) {
    console.log(`\nWhat a screen reader says when something changes:`);
    for (const c of changes.slice(0, 20)) console.log(`  ${c.what}: ${changeLine(c)}`);
  }

  // ── axe-core: its rules ran on the same page; what only it found is listed above, each with its rule ──
  const els = (n) => (n === 1 ? 'the element' : `the ${n} elements`), are = (n) => (n === 1 ? 'is' : 'are');
  const axeSaid = !axeNodes ? ' and found nothing'
    : axeKept === axeNodes ? `: ${els(axeNodes)} they failed ${are(axeNodes)} listed above under axe-core's rules`
    : !axeKept ? `: ${els(axeNodes)} they failed ${are(axeNodes)} already among the engine's own findings`
    : `: of the ${axeNodes} elements they failed, ${axeKept} ${are(axeKept)} listed above under axe-core's rules and the other ${axeNodes - axeKept} already among the engine's own findings`;
  if (RUN_AXE && axeSource) console.log(`\naxe-core's rules ran on the same page${axeSaid}.`);
  if (leftOut.length) console.log(`\n⏭  Left out of this run: ${leftOut.join('; ')}. The verdict covers the rest only.`);

  // ── The criteria that belong to a page: each with its status and the pages it was tried on ──
  if (pagesResult) {
    const WORD = { done: '✅ Passes', todo: '❌ To fix', check: '👀 A person checks' };
    console.log(`\nOn the pages themselves (${plural(pageFacts.length, 'page', 'pages')}${pagesResult.flows.length ? `, ${plural(pagesResult.flows.length, 'flow', 'flows')}` : ''}):`);
    for (const c of WCAG22.filter((k) => pagesResult.criteria[k.sc])) console.log(`  ${WORD[pagesResult.criteria[c.sc].st]}  ${c.sc} ${c.name}: ${pagesResult.criteria[c.sc].note}`);
  }

  // ── Smart nudge: how to get deeper results (only when a styleguide wasn't the target) ──
  if (!sg && !harness && !targets.every((t) => t.harness) && cfg.a11y?.styleguide !== false) {
    const sgOut = cfg.styleguide?.out ?? 'apps/styleguide/index.html';
    if (cfg.styleguide?.template && !existsSync(join(ROOT, sgOut))) {
      console.log(`\nTip for a deeper check: you have a styleguide set up but it isn't built yet. Build it (run the parity with --docs) and this check will use it on its own — that is the most thorough result: every component in every state (normal, disabled, error, focused), all on one page.`);
    } else if (!cfg.styleguide?.template) {
      console.log(`\nTip for a deeper check: this looked at "${targets[0]?.label ?? 'the page it could reach'}", which only shows the components that happen to be on screen. For the most thorough check — every component in every state (normal, disabled, error, focused) — add a styleguide (one page that shows all your components). Once it exists, this check finds and uses it automatically, so nothing is missed.`);
    }
  }

  const parts = [[measuredInfo.texts, 'text', 'texts'], [measuredInfo.icons, 'icon', 'icons'], [measuredInfo.controls, 'control', 'controls']].filter(([n]) => n).map(([n, one, many]) => `${n} ${n === 1 ? one : many}`);
  if (parts.length) console.log(`\nMeasured in the browser: ${parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0]}${measuredInfo.components ? ` in ${measuredInfo.components} component${measuredInfo.components === 1 ? '' : 's'}` : ''}${themes.length > 1 ? `, each ${measuredInfo.icons ? 'text and icon' : 'text'} in ${themes.length} themes` : ''}${partly.length ? `; the per-component checks tried ${partly.slice(0, 3).join(', ')}${partly.length > 3 ? ` and ${partly.length - 3} more` : ''}` : ''}.`);
  console.log(`\nVerdict: ${verdict.line}`);
  if (STRICT && stops) {
    console.log(`\nThis check is set to must-pass, so the run stops here until the blockers and warnings are fixed${severeAxe ? ` (including ${severeAxe} serious or critical axe-core rule${severeAxe === 1 ? '' : 's'})` : ''}; advisories never stop it.`);
    process.exit(1);
  }
  process.exit(0);
}

// Only run when invoked directly — importing for tests has no side effects. --fetch-axe only fetches the pinned
// axe-core into the cache (the install and --update run it), so the first check offline still runs every rule.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--fetch-axe')) {
    fetchAxeSource().then((s) => { console.log(s ? `✅ axe-core ${AXE_VERSION} is ready for the accessibility check (${axeCachePath()}).` : `⚠️  axe-core ${AXE_VERSION} could not be fetched now (offline or blocked). The accessibility check fetches it on its first run, or set a11y.axePath to a local copy.`); process.exit(0); });
  } else main().catch((e) => { console.error('⏭  [a11y] skipped - ' + e.message); process.exit(0); });
}

// the style guide's To do rows for what the browser check found on each product's own page, one row per product.
// result: the audit's a11y.json. → [{ area: 'Products', type, kind, who, say, todo }]
export function productA11yTodos(result) {
  const by = new Map();
  // What fails a criterion that belongs to a page has a row of its own for each criterion (page-criteria.mjs).
  const ofPage = new Set(WCAG22.flatMap((c) => c.pageKinds ?? []));
  for (const i of result?.issues ?? []) if (i.product && !ofPage.has(i.issue)) { if (!by.has(i.product)) by.set(i.product, []); by.get(i.product).push(i); }
  return [...by].map(([product, list]) => {
    const kinds = new Map();
    for (const i of list) kinds.set(i.issue, (kinds.get(i.issue) ?? 0) + 1);
    const what = [...kinds].map(([k, n]) => (A11Y_GUIDE[k]?.title ? A11Y_GUIDE[k].title(n) : `${n} × ${k}`)).slice(0, 4).join('; ');
    return { area: 'Products', type: `${product}, accessibility`, kind: 'Accessibility', who: 'code',
      say: `${product}'s page, checked as a whole, has ${list.length} accessibility problem${list.length === 1 ? '' : 's'} (${what}${kinds.size > 4 ? '; and more' : ''}), first ${list.slice(0, 3).map((i) => i.selector).filter(Boolean).join('; ')}.`,
      todo: `Fix them in ${product}. Each one is in the audit's accessibility list, with its fix.` };
  });
}

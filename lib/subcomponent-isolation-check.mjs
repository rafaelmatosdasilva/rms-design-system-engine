// subcomponent-isolation-check.mjs - Run from project root: node scripts/subcomponent-isolation-check.mjs
//
// Hard Rule #8 - Sub-component style isolation:
//   A DS sub-component nested inside another DS component must always retain
//   its own CSS styles. This is what gives the UI consistency: a buttonTertiary
//   inside a node looks the same as a buttonTertiary anywhere else.
//
//   The trap: a parent component's rule ".parentClass svg { color: X }" uses a
//   DIRECT selector on the element - direct targeting beats inheritance. So even
//   if the sub-component sets "color: Y" on its container, the parent's rule wins
//   for SVGs inside it because it targets the SVG directly.
//
//   This script detects every CSS rule that combines a DS component class with a
//   bare element tag AND sets a visual property. Each such rule is a potential
//   sub-component override trap.
//
//   Every detected rule must appear in the ALLOWED map below, documenting:
//     a) LEAF - no DS sub-components nest inside this component class, OR
//     b) ISOLATED - explicit sub-component overrides are present later in the cascade
//     c) NON-VISUAL - rule sets only layout/motion properties (no color/fill/stroke)
//     d) OWNED CHILDREN - children are native HTML elements, not DS sub-components
//     e) ISOLATION FIX - this rule IS the override (it corrects a parent's broad rule)
//     f) PLUGIN-SPECIFIC - product-level wrapper whose children are not DS components
//     g) DECORATIVE - icon/illustration slot with no DS sub-components
//
// Requires at project root:
//   ds-config.json   - themeCSS + pluginCSS paths (sources to scan)
//
// Exit 0 = all broad rules documented. Exit 1 = new undocumented rule, or a parent rule that wins over a nested DS
// component's own hover, press or focus (ALLOWED_STATE_CANCELS documents one kept on purpose).

import { splitSelectors } from './selector-list.mjs';
import { specificity } from './css-source.mjs';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';

const ROOT = process.cwd();

// ── Load ds-config.json ───────────────────────────────────────────────────────
let cfg = {};
try { cfg = JSON.parse(readFileSync(join(ROOT, 'ds-config.json'), 'utf8')); } catch {
  console.error('❌ ds-config.json not found at project root.'); process.exit(1);
}

const THEME_PATHS = [].concat(cfg.paths?.themeCSS ?? 'src/theme.css');
const PLUGIN_CSS = cfg.paths?.pluginCSS ?? [];
const SOURCES = [...THEME_PATHS, ...PLUGIN_CSS].filter(f => existsSync(join(ROOT, f)));

// ── Load project-specific ALLOWED broad rules from structure-contract.mjs ──────
// Export ALLOWED_BROAD_RULES from structure-contract.mjs at the project root.
// Key   = normalized selector (single spaces, no leading/trailing whitespace).
// Value = isolation proof (LEAF / ISOLATED / NON-VISUAL / OWNED CHILDREN /
//         ISOLATION FIX / PLUGIN-SPECIFIC / DECORATIVE).
// PLUGIN_DS_OVERRIDES: allowlist for plugin-file rules that restyle a DS base class
// (see the second check below). Key = normalized selector, value = reason.
let ALLOWED = {}, PLUGIN_OVERRIDES_ALLOWED = {}, STATE_CANCELS_ALLOWED = {};
try {
  const m = await import(pathToFileURL(join(ROOT, 'structure-contract.mjs')).href);
  if (m.ALLOWED_BROAD_RULES && typeof m.ALLOWED_BROAD_RULES === 'object') {
    ALLOWED = m.ALLOWED_BROAD_RULES;
  }
  if (m.PLUGIN_DS_OVERRIDES && typeof m.PLUGIN_DS_OVERRIDES === 'object') {
    PLUGIN_OVERRIDES_ALLOWED = m.PLUGIN_DS_OVERRIDES;
  }
  // ALLOWED_STATE_CANCELS: a parent rule kept on purpose although it wins over a nested component's state. Key = the
  // parent's normalized selector, value = the reason.
  if (m.ALLOWED_STATE_CANCELS && typeof m.ALLOWED_STATE_CANCELS === 'object') STATE_CANCELS_ALLOWED = m.ALLOWED_STATE_CANCELS;
} catch { /* structure-contract.mjs optional */ }

// ── Visual properties that trigger the isolation check ───────────────────────
const VISUAL_RE = /\b(color|background|fill|stroke|border(-color)?)\s*:/;

// ── Bare element tags that form broad selectors when combined with a component class ──
const BARE_ELEMENTS = new Set(['svg', 'span', 'div', 'button', 'input', 'a', 'label', 'select', 'textarea']);

// ── CSS block extractor ───────────────────────────────────────────────────────
function extractRules(css) {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  let i = 0;
  while (i < stripped.length) {
    const open = stripped.indexOf('{', i); if (open < 0) break;
    const selector = stripped.slice(i, open).trim();
    let depth = 1, j = open + 1;
    while (j < stripped.length && depth > 0) {
      if (stripped[j] === '{') depth++; else if (stripped[j] === '}') depth--; j++;
    }
    const body = stripped.slice(open + 1, j - 1).trim();
    if (body.includes('{')) rules.push(...extractRules(body));
    else for (const sel of splitSelectors(selector)) rules.push({ selector: sel, body });   // never inside :not(a, b)
    i = j;
  }
  return rules;
}

function normalizeSelector(sel) { return sel.replace(/\s+/g, ' ').trim(); }

function broadElementTag(sel) {
  // What follows the tag is read as "the colons or dot that start a part, then the part", with the colon out of the
  // part itself: held in both, each `:` can begin a part or sit inside the one before, and a selector of many `(:`
  // takes exponential time to refuse. `[:.]+` keeps `::before` whole.
  const m = sel.match(/[\s>+~]+(svg|span|div|button|input|a|label|select|textarea)(?:[:.]+[a-zA-Z0-9-()]+)*$/);
  if (!m || !BARE_ELEMENTS.has(m[1])) return null;
  if (!/\.[a-zA-Z]/.test(sel.slice(0, sel.lastIndexOf(m[0])))) return null;
  return m[1];
}

// ── Run the check ─────────────────────────────────────────────────────────────
const newRules = [], documented = [];

for (const srcPath of SOURCES) {
  const text = readFileSync(join(ROOT, srcPath), 'utf8');
  for (const { selector, body } of extractRules(text)) {
    const tag = broadElementTag(selector);
    if (!tag || !VISUAL_RE.test(body)) continue;
    const key = normalizeSelector(selector);
    if (ALLOWED[key]) documented.push({ key, reason: ALLOWED[key], file: srcPath });
    else newRules.push({ key, body: body.slice(0, 120), file: srcPath });
  }
}

// ── Plugin overrides of DS base classes ───────────────────────────────────────
// A class with a standalone base rule in theme CSS (`.x { ... }`) is a DS component
// class - its visual identity belongs to the base. Any PLUGIN-file rule that targets
// such a class AND sets identity properties (color, background, border, padding, gap,
// height, font, radius, opacity, shadow) overrides the DS and must be documented in
// PLUGIN_DS_OVERRIDES (structure-contract.mjs) with a reason. Layout-only rules
// (width, margin, position, flex, z-index, ...) are consumer placement and pass freely.
const IDENTITY_RE = /(^|[;{]|\s)(color|background[\w-]*|border[\w-]*|padding[\w-]*|gap|height|min-height|font-size|font-weight|line-height|letter-spacing|text-transform|opacity|box-shadow|fill|stroke)\s*:/;

const dsBaseClasses = new Set();
for (const themePath of THEME_PATHS.filter(f => existsSync(join(ROOT, f)))) {
  const text = readFileSync(join(ROOT, themePath), 'utf8');
  for (const { selector } of extractRules(text)) {
    const m = selector.match(/^\.([a-zA-Z][a-zA-Z0-9_-]*)$/);
    if (m) dsBaseClasses.add(m[1]);
  }
}

const overrideNew = [], overrideDocumented = [];
for (const srcPath of PLUGIN_CSS.filter(f => existsSync(join(ROOT, f)))) {
  const text = readFileSync(join(ROOT, srcPath), 'utf8');
  for (const { selector, body } of extractRules(text)) {
    if (!IDENTITY_RE.test(body)) continue;
    const hit = [...dsBaseClasses].find(c => new RegExp(`\\.${c}(?![\\w-])`).test(selector));
    if (!hit) continue;
    const key = normalizeSelector(selector);
    if (PLUGIN_OVERRIDES_ALLOWED[key]) overrideDocumented.push({ key, reason: PLUGIN_OVERRIDES_ALLOWED[key], file: srcPath });
    else overrideNew.push({ key, cls: hit, body: body.slice(0, 120), file: srcPath });
  }
}

// ── A parent that cancels a nested component's state ─────────────────────────
// A DS component's own :hover, :active or :focus rule changes a property. A rule that targets that same class inside
// another component and sets the same property wins over it when its specificity is greater, or the same and it comes
// later in the cascade: the nested component never shows that state (a chip's `.chip .button { background: none }`,
// loaded after `.button:hover`, and the button never hovers). Read across every source in cascade order: theme first,
// then the products' own CSS.
const STATE_RE = /:(hover|active|focus|focus-visible|focus-within)\b/;
const lastCompound = (sel) => sel.trim().split(/\s*[>+~]\s*|\s+/).filter(Boolean).pop() ?? '';
const hasCombinator = (sel) => /\S\s*[>+~\s]\s*\S/.test(sel.trim());
// One family a property belongs to: background-color is background, border-top-color is border.
const familyOf = (prop) => (/^background/.test(prop) ? 'background' : /^border/.test(prop) ? 'border' : /^outline/.test(prop) ? 'outline' : prop);
const propsOf = (body) => new Set(body.split(';').map((d) => d.split(':')[0].trim().toLowerCase()).filter((p) => p && !p.startsWith('--')).map(familyOf));
const VISIBLE = new Set(['background', 'color', 'border', 'outline', 'box-shadow', 'opacity', 'fill', 'stroke', 'text-decoration', 'transform']);
const cmpSpec = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
const ordered = [];
for (const srcPath of [...THEME_PATHS, ...PLUGIN_CSS].filter((f, i, all) => existsSync(join(ROOT, f)) && all.indexOf(f) === i)) {
  for (const { selector, body } of extractRules(readFileSync(join(ROOT, srcPath), 'utf8'))) ordered.push({ selector: normalizeSelector(selector), body, file: srcPath, order: ordered.length });
}
const classIn = (compound) => [...dsBaseClasses].filter((c) => new RegExp(`\\.${c}(?![\\w-])`).test(compound));
const stateRules = ordered.flatMap((r) => {
  const last = lastCompound(r.selector), st = last.match(STATE_RE);
  if (!st || hasCombinator(r.selector)) return [];
  const props = [...propsOf(r.body)].filter((p) => VISIBLE.has(p));
  return props.length ? classIn(last).map((cls) => ({ ...r, cls, state: st[1], props, spec: specificity(r.selector) })) : [];
});
const cancelNew = [], cancelDocumented = [];
for (const p of ordered) {
  const last = lastCompound(p.selector);
  if (!hasCombinator(p.selector) || STATE_RE.test(p.selector)) continue;
  const props = propsOf(p.body), spec = specificity(p.selector);
  for (const cls of classIn(last)) for (const s of stateRules.filter((x) => x.cls === cls)) {
    const shared = s.props.filter((x) => props.has(x));
    const wins = cmpSpec(spec, s.spec) > 0 || (cmpSpec(spec, s.spec) === 0 && p.order > s.order);
    if (!shared.length || !wins) continue;
    const hit = { key: p.selector, state: s.selector, props: shared, why: cmpSpec(spec, s.spec) > 0 ? 'a greater specificity' : 'the same specificity, later in the cascade', file: p.file };
    if (cancelNew.concat(cancelDocumented).some((x) => x.key === hit.key && x.state === hit.state)) continue;
    (STATE_CANCELS_ALLOWED[p.selector] ? cancelDocumented : cancelNew).push({ ...hit, reason: STATE_CANCELS_ALLOWED[p.selector] });
  }
}

// ── Report ────────────────────────────────────────────────────────────────────
console.log('\n─── Sub-component style isolation (Hard Rule #8) ───────────────────\n');

if (documented.length) {
  console.log(`✅ DOCUMENTED  ${documented.length}  (broad rules verified safe)`);
  for (const r of documented) {
    console.log(`   ✅ ${r.key}`);
    console.log(`      ${r.reason}`);
  }
  console.log();
}

if (newRules.length === 0) {
  console.log('✅ No new undocumented broad element selectors with visual properties.\n');
} else {
  console.log(`❌ UNDOCUMENTED  ${newRules.length}  (new broad rules - verify sub-component isolation)\n`);
  for (const r of newRules) {
    console.log(`   ❌ "${r.key}"  in ${r.file}`);
    console.log(`      body: { ${r.body.replace(/\n/g, ' ').replace(/\s+/g, ' ')} }`);
    console.log(`      → Either prove this is a LEAF component (add to ALLOWED with reason),`);
    console.log(`        or add explicit .<subComponent> elementTag { } override rules later in the cascade.\n`);
  }
}

console.log('\n─── Plugin overrides of DS base classes ─────────────────────────────\n');
console.log(`   (${dsBaseClasses.size} DS base classes derived from theme CSS)`);

if (overrideDocumented.length) {
  console.log(`✅ DOCUMENTED  ${overrideDocumented.length}  (plugin overrides with a recorded reason)`);
  for (const r of overrideDocumented) {
    console.log(`   ✅ ${r.key}`);
    console.log(`      ${r.reason}`);
  }
  console.log();
}

if (overrideNew.length === 0) {
  console.log('✅ No undocumented plugin overrides of DS base classes.\n');
} else {
  console.log(`❌ UNDOCUMENTED  ${overrideNew.length}  (plugin rules restyling a DS base class)\n`);
  for (const r of overrideNew) {
    console.log(`   ❌ "${r.key}"  in ${r.file}  (DS class: .${r.cls})`);
    console.log(`      body: { ${r.body.replace(/\n/g, ' ').replace(/\s+/g, ' ')} }`);
    console.log(`      → Move the styling into the DS base (theme CSS), or document the override`);
    console.log(`        in PLUGIN_DS_OVERRIDES (structure-contract.mjs) with a really good reason.\n`);
  }
}

console.log('\n─── A parent that cancels a nested component\'s state ─────────────────\n');
if (cancelDocumented.length) {
  console.log(`✅ DOCUMENTED  ${cancelDocumented.length}  (kept on purpose)`);
  for (const r of cancelDocumented) console.log(`   ✅ ${r.key} over ${r.state}\n      ${r.reason}`);
  console.log();
}
if (cancelNew.length === 0) console.log('✅ No parent rule wins over a nested component\'s hover, press or focus.\n');
else {
  console.log(`❌ CANCELLED STATES  ${cancelNew.length}  (a nested component never shows its state)\n`);
  for (const r of cancelNew) {
    console.log(`   ❌ "${r.key}"  in ${r.file} cancels "${r.state}" (${r.props.join(', ')}): ${r.why}`);
    console.log('      → Give the state rule the specificity to win inside its parent, move the parent rule before it, or');
    console.log('        document the parent rule in ALLOWED_STATE_CANCELS (structure-contract.mjs) with the reason.\n');
  }
}

process.exit(newRules.length === 0 && overrideNew.length === 0 && cancelNew.length === 0 ? 0 : 1);

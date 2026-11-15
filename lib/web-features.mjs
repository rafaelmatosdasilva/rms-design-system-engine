// web-features.mjs - the web features a component uses, checked against the browsers the team supports.
//
// A component can use a CSS, HTML or JavaScript feature one of the team's browsers does not run yet (:has() in an
// older Firefox, color-mix() in an older Safari), or an old pattern the platform now replaces (-webkit-box for flex,
// keyCode for key). This reads the team's browser targets where teams already keep them, reads the code, and returns
// each feature not supported where it must be and each old pattern with what replaces it. Pure over text: the audit
// reads the files and prints the lines ("🌐 Browser support"), the system's own code apart from the products'.
//
// The targets, in this order, the first found:
//   • ds-config.json → supportedBrowsers: { "chrome": 111, "safari": "16.4", "firefox": 113 }, or browserslist
//     queries (a string or a list);
//   • package.json → browserslist (a list, or one per environment: production is read);
//   • .browserslistrc (lines outside a section, and the [production] section).
// Only explicit minimums are read ("chrome >= 111", "safari 16.4", "Firefox > 112"). A query that needs usage data or a
// release calendar ("last 2 versions", "> 0.5%", "defaults") cannot be read without the network, so it is named as
// unread and the person is asked for explicit minimums. With no targets at all nothing is said: a target is the team's,
// never invented. Safari on iOS is read as Safari (the same engine, the same version numbers).
//
// The compatibility table is curated, not complete: the features worth checking in a design system's code, each with
// the first version of each major browser that runs it, taken from the web platform's own compatibility data (the
// open browser compatibility dataset behind the platform's reference documentation) as it stood in November 2026.
// null is a browser that does not run it in any version. Nothing is fetched when the engine runs.
//
// A feature is not reported when the code guards it: inside an @supports block whose condition names it (not
// "@supports not"), after a fallback declaration of the same property in the same rule (color: #333 then
// color: oklch(…)), in a script behind a check for it ('showPopover' in HTMLElement.prototype), and :focus-visible in a
// file that keeps a :focus style too.
//
//   readTargets(dir, cfg, { read })        → { browsers: { chrome: '111', … }, from, unread: [query] } | null
//   parseQueries(list)                     → { browsers, unread }
//   scanFile({ file, text }, browsers)     → { features: [{ file, line, id, name, missing: [{ browser, from }] }], old: [{ file, line, id, name, use }] }
//   scanFiles(files, browsers)             → the same, every file, one entry per feature and file (with its count)
//   supportLines(result, browsers)         → the lines the audit prints under a heading
//   targetsSay(targets)                    → "Chrome 111, Firefox 113 and Safari 16.4 (package.json browserslist)"
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const BROWSERS = ['chrome', 'edge', 'firefox', 'safari'];
const LABEL = { chrome: 'Chrome', edge: 'Edge', firefox: 'Firefox', safari: 'Safari' };
const ALIAS = { chrome: 'chrome', and_chr: 'chrome', chromeandroid: 'chrome', edge: 'edge', firefox: 'firefox', ff: 'firefox', and_ff: 'firefox', firefoxandroid: 'firefox', safari: 'safari', ios_saf: 'safari', ios: 'safari' };

// ── Versions ──────────────────────────────────────────────────────────────────
const parts = (v) => String(v).split('.').map((n) => Number(n) || 0);
export function cmp(a, b) {
  const x = parts(a), y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] ?? 0) - (y[i] ?? 0); if (d) return d; }
  return 0;
}

// ── Targets ───────────────────────────────────────────────────────────────────
// One browserslist query: an explicit minimum is read, "not …" narrows and adds none, anything else is unread.
function readQuery(q, browsers, unread) {
  const s = String(q).trim();
  if (!s || /^not\s/i.test(s)) return;
  const m = /^([a-z_]+)\s*(>=|>|)\s*(\d+(?:\.\d+)*)$/i.exec(s);
  const b = m && ALIAS[m[1].toLowerCase()];
  if (!b) { unread.push(s); return; }
  let v = m[3];
  if (m[2] === '>' && !v.includes('.')) v = String(Number(v) + 1);
  if (!browsers[b] || cmp(v, browsers[b]) < 0) browsers[b] = v;
}

export function parseQueries(list) {
  const browsers = {}, unread = [];
  for (const entry of [list].flat()) for (const q of String(entry ?? '').split(',')) readQuery(q, browsers, unread);
  return { browsers, unread };
}

// The [production] section of a .browserslistrc, and the lines before any section.
function rcQueries(text) {
  const out = [];
  let section = null;
  for (const raw of String(text).split('\n')) {
    const l = raw.replace(/#.*/, '').trim();
    if (!l) continue;
    const s = /^\[([^\]]+)\]$/.exec(l);
    if (s) { section = s[1].trim().split(/\s+/); continue; }
    if (!section || section.includes('production')) out.push(l);
  }
  return out;
}

const fromList = (v) => (Array.isArray(v) || typeof v === 'string' ? v : v && typeof v === 'object' ? (v.production ?? v.defaults ?? Object.values(v)[0]) : null);

export function readTargets(dir, cfg = {}, { read = (p) => { try { return readFileSync(p, 'utf8'); } catch { return null; } } } = {}) {
  const sb = cfg?.supportedBrowsers;
  if (sb && typeof sb === 'object' && !Array.isArray(sb)) {
    const browsers = {}, unread = [];
    for (const [k, v] of Object.entries(sb)) {
      const b = ALIAS[String(k).toLowerCase()];
      if (b && /^\d+(\.\d+)*$/.test(String(v))) { if (!browsers[b] || cmp(v, browsers[b]) < 0) browsers[b] = String(v); } else unread.push(`${k}: ${v}`);
    }
    return { browsers, unread, from: 'ds-config.json supportedBrowsers' };
  }
  if (typeof sb === 'string' || Array.isArray(sb)) return { ...parseQueries(sb), from: 'ds-config.json supportedBrowsers' };
  let pkg = null;
  try { pkg = JSON.parse(read(join(dir, 'package.json')) ?? 'null'); } catch { /* unreadable */ }
  const bl = fromList(pkg?.browserslist);
  if (bl) return { ...parseQueries(bl), from: 'package.json browserslist' };
  const rc = read(join(dir, '.browserslistrc'));
  if (rc != null) return { ...parseQueries(rcQueries(rc)), from: '.browserslistrc' };
  return null;
}

export function targetsSay(t) {
  const list = BROWSERS.filter((b) => t?.browsers?.[b]).map((b) => `${LABEL[b]} ${t.browsers[b]}`);
  const said = list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list.at(-1)}` : list[0] ?? 'no browser';
  return `${said} (${t?.from ?? 'no targets'})`;
}

// ── The table ─────────────────────────────────────────────────────────────────
// kind: css (stylesheets and <style>), plain-css (a .css file only: Sass and Less compile it away), markup, js.
// supports: what an @supports condition names to guard it (null: @supports cannot test it). fallback: a value a
// fallback declaration of the same property guards. hint: how to keep it, said after the finding.
const v = (chrome, edge, firefox, safari) => ({ chrome, edge, firefox, safari });
const RAISE = 'or raise the target';
export const FEATURES = [
  { id: 'has', name: ':has()', kind: 'css', re: /:has\(/g, need: v('105', '105', '121', '15.4'), supports: /:has/, hint: `put it inside @supports selector(:has(*)), ${RAISE}` },
  { id: 'container-queries', name: 'container queries', kind: 'css', re: /@container\b/g, need: v('105', '105', '110', '16'), supports: /container/, hint: `give it a layout that works without them, ${RAISE}` },
  { id: 'cascade-layers', name: '@layer', kind: 'css', re: /@layer\b/g, need: v('99', '99', '97', '15.4'), supports: null, hint: RAISE.replace(/^or /, '') },
  { id: 'subgrid', name: 'subgrid', kind: 'css', re: /grid-template-(?:columns|rows)\s*:\s*subgrid\b/g, need: v('117', '117', '71', '16'), supports: /subgrid/, hint: `put it inside @supports (grid-template-columns: subgrid), ${RAISE}` },
  { id: 'nesting', name: 'CSS nesting', kind: 'plain-css', re: /(?:^|[{;])\s*&(?=[\s.:#[>+~]|$)/gm, need: v('112', '112', '117', '16.5'), supports: null, hint: 'compile it away (a preprocessor or a build step), or raise the target' },
  { id: 'color-mix', name: 'color-mix()', kind: 'css', re: /\bcolor-mix\(/g, need: v('111', '111', '113', '16.2'), supports: /color-mix/, fallback: true, hint: `declare a plain colour before it in the same rule, ${RAISE}` },
  { id: 'oklch', name: 'oklch() and oklab()', kind: 'css', re: /\bokl(?:ch|ab)\(/g, need: v('111', '111', '113', '15.4'), supports: /okl(?:ch|ab)/, fallback: true, hint: `declare a plain colour before it in the same rule, ${RAISE}` },
  { id: 'text-wrap-balance', name: 'text-wrap: balance', kind: 'css', re: /\btext-wrap(?:-style)?\s*:\s*balance\b/g, need: v('114', '114', '121', '17.5'), supports: /text-wrap/, hint: 'nothing breaks without it (the text wraps as before), so this is only a note' },
  { id: 'popover', name: 'the popover attribute', kind: 'markup', re: /\spopover(?:=["'{]?(?:auto|manual|hint)\b|=["']{2}|(?=\s*\/?>))|\spopovertarget=/g, need: v('114', '114', '125', '17'), fileGuard: /['"](?:popover|showPopover)['"]\s+in\b/, hint: `check for it first ('showPopover' in HTMLElement.prototype), ${RAISE}` },
  { id: 'popover-js', name: 'showPopover()', kind: 'js', re: /\.(?:show|toggle|hide)Popover\(/g, need: v('114', '114', '125', '17'), fileGuard: /['"](?:popover|showPopover|togglePopover)['"]\s+in\b|\.showPopover\s*(?:\?|&&|!==|===)|typeof\s+[\w.]+\.showPopover/, hint: `check for it first ('showPopover' in HTMLElement.prototype), ${RAISE}` },
  { id: 'popover-open', name: ':popover-open', kind: 'css', re: /:popover-open\b/g, need: v('114', '114', '125', '17'), supports: /popover-open/, hint: RAISE.replace(/^or /, '') },
  { id: 'dialog', name: '<dialog>', kind: 'markup', re: /<dialog[\s>]/g, need: v('37', '79', '98', '15.4'), fileGuard: /HTMLDialogElement|['"]showModal['"]\s+in\b/, hint: RAISE.replace(/^or /, '') },
  { id: 'dialog-js', name: 'showModal()', kind: 'js', re: /\.showModal\(/g, need: v('37', '79', '98', '15.4'), fileGuard: /HTMLDialogElement|['"]showModal['"]\s+in\b|typeof\s+[\w.]+\.showModal/, hint: RAISE.replace(/^or /, '') },
  { id: 'inert', name: 'the inert attribute', kind: 'markup', re: /\sinert(?=\s*\/?>|\s+[\w:@-]+=|=)|\.inert\s*=[^=]/g, need: v('102', '102', '112', '15.5'), fileGuard: /['"]inert['"]\s+in\b/, hint: `hide it from focus another way as well, ${RAISE}` },
  { id: 'field-sizing', name: 'field-sizing', kind: 'css', re: /\bfield-sizing\s*:/g, need: v('123', '123', null, '26.2'), supports: /field-sizing/, hint: `size the field another way where it does not run, ${RAISE}` },
  { id: 'anchor-positioning', name: 'anchor positioning', kind: 'css', re: /\b(?:anchor-name|position-anchor|position-try(?:-fallbacks)?)\s*:|(?<![\w-])anchor\(/g, need: v('125', '125', null, '26'), supports: /anchor/, hint: `place it with a script where it does not run, ${RAISE}` },
  { id: 'view-transitions', name: 'view transitions', kind: 'css', re: /\bview-transition-name\s*:/g, need: v('111', '111', '144', '18'), supports: /view-transition/, hint: 'nothing breaks without them (the change happens at once), so this is only a note' },
  { id: 'view-transitions-js', name: 'startViewTransition()', kind: 'js', re: /\.startViewTransition\(/g, need: v('111', '111', '144', '18'), fileGuard: /!\s*document\.startViewTransition\b|typeof\s+document\.startViewTransition|document\.startViewTransition\s*(?:\?|&&|!==|===)|['"]startViewTransition['"]\s+in\b/, hint: `call it only where it exists (document.startViewTransition?.()), ${RAISE}` },
  { id: 'scrollbar-gutter', name: 'scrollbar-gutter', kind: 'css', re: /\bscrollbar-gutter\s*:/g, need: v('94', '94', '97', '18.2'), supports: /scrollbar-gutter/, hint: 'nothing breaks without it (the layout shifts when a scrollbar comes), so this is only a note' },
  { id: 'aspect-ratio', name: 'aspect-ratio', kind: 'css', re: /(?:^|[{;])\s*aspect-ratio\s*:/gm, need: v('88', '88', '89', '15'), supports: /aspect-ratio/, hint: `size it another way where it does not run, ${RAISE}` },
  { id: 'focus-visible', name: ':focus-visible', kind: 'css', re: /:focus-visible\b/g, need: v('86', '86', '85', '15.4'), supports: /focus-visible/, fileGuard: /:focus(?![-\w])/, hint: `keep a :focus style for the browsers without it, ${RAISE}` },
  { id: 'viewport-units', name: 'dvh, svh and lvh', kind: 'css', re: /\b\d*\.?\d+[dsl]v(?:h|w|i|b|min|max)\b/g, need: v('108', '108', '101', '15.4'), supports: /[dsl]v(?:h|w|i|b|min|max)/, fallback: true, hint: `declare a vh value before it in the same rule, ${RAISE}` },
  // gap on a flex container: found by the rule, not by a pattern (see flexGap below).
  { id: 'flex-gap', name: 'gap on a flex container', kind: 'css', re: null, need: v('84', '84', '63', '14.1'), supports: /\bgap\b/, hint: `space the items with margins where it does not run, ${RAISE}` },
];

// Old patterns the platform now replaces, only those found with few false positives.
export const OLD = [
  { id: 'webkit-box', name: 'display: -webkit-box', kind: 'css', re: /display\s*:\s*-webkit-(?:inline-)?box\b/g, use: 'display: flex', unless: /-webkit-line-clamp/ },
  { id: 'ms-prefix', name: 'an -ms- prefixed property', kind: 'css', re: /(?:^|[{;\s])-ms-(?!overflow-style)[a-z-]+\s*:|:\s*-ms-(?:inline-)?(?:flexbox|grid)\b/gm, use: 'the unprefixed property' },
  { id: 'ms-overflow-style', name: '-ms-overflow-style', kind: 'css', re: /-ms-overflow-style\s*:/g, use: 'scrollbar-width: none' },
  { id: 'filter-alpha', name: 'filter: alpha()', kind: 'css', re: /filter\s*:\s*(?:alpha\(|progid:)/gi, use: 'opacity' },
  { id: 'zoom-hack', name: 'zoom: 1', kind: 'css', re: /(?:^|[{;\s])\*?zoom\s*:\s*1\s*(?=[;}]|$)/gm, use: 'nothing (an old layout fix no browser needs now)' },
  { id: 'overflow-scrolling', name: '-webkit-overflow-scrolling', kind: 'css', re: /-webkit-overflow-scrolling\s*:/g, use: 'nothing (scrolling is smooth by default now)' },
  { id: 'document-write', name: 'document.write()', kind: 'js', re: /\bdocument\.write(?:ln)?\(/g, use: 'the DOM methods (append, insertAdjacentHTML)' },
  { id: 'key-code', name: 'keyCode', kind: 'js', re: /\.(?:keyCode|charCode)\b/g, use: 'event.key' },
  { id: 'attach-event', name: 'attachEvent()', kind: 'js', re: /\.attachEvent\(/g, use: 'addEventListener()' },
];

// ── Reading a file ────────────────────────────────────────────────────────────
const blank = (s) => s.replace(/[^\n]/g, ' ');
function strip(text, kinds) {
  let t = String(text).replace(/\/\*[\s\S]*?\*\//g, blank);
  if (kinds.has('markup')) t = t.replace(/<!--[\s\S]*?-->/g, blank);
  if (kinds.has('js')) t = t.replace(/(^|[^:\\'"`/])(\/\/[^\n]*)/g, (m, p, c) => p + blank(c));
  return t;
}

function kindsOf(file) {
  const ext = (/\.([a-z]+)$/i.exec(file)?.[1] ?? '').toLowerCase();
  if (ext === 'css') return new Set(['css', 'plain-css']);
  if (ext === 'scss' || ext === 'less') return new Set(['css']);
  if (['html', 'htm', 'vue', 'svelte'].includes(ext)) return new Set(['css', 'markup', 'js']);
  if (ext === 'jsx' || ext === 'tsx') return new Set(['markup', 'js']);
  if (['js', 'ts', 'mjs', 'cjs'].includes(ext)) return new Set(['js']);
  return new Set();
}

// Each @supports block: its condition and the span it guards (the condition through the closing brace).
function supportsBlocks(t) {
  const out = [];
  const re = /@supports\b([^{]*)\{/g;
  let m;
  while ((m = re.exec(t))) {
    let depth = 1, i = m.index + m[0].length;
    for (; i < t.length && depth; i++) { if (t[i] === '{') depth++; else if (t[i] === '}') depth--; }
    out.push({ cond: m[1].trim(), start: m.index, open: m.index + m[0].length, end: i });
  }
  return out;
}

// The innermost rule a position is in: from the brace before it to the brace after it.
function ruleAt(t, at) {
  let s = at;
  while (s > 0 && t[s - 1] !== '{' && t[s - 1] !== '}') s--;
  let e = at;
  while (e < t.length && t[e] !== '}' && t[e] !== '{') e++;
  return { start: s, end: e, body: t.slice(s, e) };
}

// A value guarded by a fallback: the same property declared before it in the same rule, without the feature.
function hasFallback(t, at, re) {
  const rule = ruleAt(t, at);
  const decls = rule.body.slice(0, at - rule.start).split(';');
  const own = decls.pop();
  const prop = /^\s*([\w-]+)\s*:/.exec(own)?.[1];
  if (!prop) return false;
  const fresh = new RegExp(re.source, re.flags.replace('g', ''));
  return decls.some((d) => { const m = /^\s*([\w-]+)\s*:([\s\S]*)$/.exec(d); return m && m[1] === prop && !fresh.test(m[2]); });
}

function lineOf(t) {
  const starts = [0];
  for (let i = 0; i < t.length; i++) if (t[i] === '\n') starts.push(i + 1);
  return (at) => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= at) lo = mid; else hi = mid - 1; } return lo + 1; };
}

const missingIn = (need, browsers) => BROWSERS.filter((b) => browsers[b]).filter((b) => need[b] === null || cmp(browsers[b], need[b]) < 0).map((b) => ({ browser: b, from: need[b] }));

export function scanFile({ file, text }, browsers = {}) {
  const kinds = kindsOf(file);
  const features = [], old = [];
  if (!kinds.size) return { features, old };
  const t = strip(text, kinds);
  const line = lineOf(t);
  const blocks = kinds.has('css') ? supportsBlocks(t) : [];
  const guardedBy = (f, at) => f.supports && blocks.some((b) => at >= b.start && at < b.end && f.supports.test(b.cond) && !/^not\b/i.test(b.cond));
  const inCondition = (at) => blocks.some((b) => at >= b.start && at < b.open);
  for (const f of FEATURES) {
    if (!kinds.has(f.kind) || !f.re) continue;
    const missing = missingIn(f.need, browsers);
    if (!missing.length) continue;
    if (f.fileGuard && f.fileGuard.test(t)) continue;
    for (const m of t.matchAll(f.re)) {
      const at = m.index + (m[0].length - m[0].replace(/^[{;\s]+/, '').length);
      if (inCondition(at) || guardedBy(f, at)) continue;
      if (f.fallback && hasFallback(t, at, f.re)) continue;
      features.push({ file, line: line(at), id: f.id, name: f.name, missing });
    }
  }
  // gap on a flex container: a rule that sets display: flex and gap.
  const fg = FEATURES.find((f) => f.id === 'flex-gap');
  const fgMissing = missingIn(fg.need, browsers);
  if (kinds.has('css') && fgMissing.length) {
    for (const m of t.matchAll(/(?:^|[{;\s])((?:row-|column-)?gap\s*:)/gm)) {
      const at = m.index + m[0].indexOf(m[1]);
      const rule = ruleAt(t, at);
      if (!/(?:^|[;\s{])display\s*:\s*(?:inline-)?flex\b/.test(rule.body) || guardedBy(fg, at) || inCondition(at)) continue;
      features.push({ file, line: line(at), id: fg.id, name: fg.name, missing: fgMissing });
    }
  }
  for (const o of OLD) {
    if (!kinds.has(o.kind)) continue;
    for (const m of t.matchAll(o.re)) {
      const at = m.index + (m[0].length - m[0].replace(/^[{;\s]+/, '').length);
      if (o.unless && o.unless.test(ruleAt(t, at).body)) continue;
      old.push({ file, line: line(at), id: o.id, name: o.name, use: o.use });
    }
  }
  return { features, old };
}

// Every file, one entry per feature (or old pattern) and file: its first line and how many more.
export function scanFiles(files, browsers = {}) {
  const fold = (list) => {
    const by = new Map();
    for (const x of list) { const k = `${x.file}\0${x.id}`; const had = by.get(k); if (had) had.more++; else by.set(k, { ...x, more: 0 }); }
    return [...by.values()];
  };
  const all = files.map((f) => scanFile(f, browsers));
  return { features: fold(all.flatMap((r) => r.features)), old: fold(all.flatMap((r) => r.old)) };
}

// ── What the audit prints ────────────────────────────────────────────────────
const and = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : xs[0] ?? '');
const where = (x) => `${x.file}:${x.line}${x.more ? ` (and ${x.more} more)` : ''}`;
export function supportLines({ features = [], old = [] } = {}, browsers = {}, { max = 10 } = {}) {
  const lines = [];
  if (features.length) {
    lines.push(`${features.length} feature${features.length === 1 ? '' : 's'} not supported in every browser the team supports:`);
    for (const x of features.slice(0, max)) {
      const f = FEATURES.find((y) => y.id === x.id);
      const runs = x.missing.filter((m) => m.from).map((m) => `${LABEL[m.browser]} ${m.from}`);
      const never = x.missing.filter((m) => !m.from).map((m) => LABEL[m.browser]);
      const have = x.missing.map((m) => `${LABEL[m.browser]} ${browsers[m.browser]}`);
      const said = [runs.length ? `runs from ${and(runs)}` : '', never.length ? `does not run in ${and(never)} yet` : ''].filter(Boolean).join(' and ');
      lines.push(`   · ${where(x)}  ${x.name} ${said}, and the team supports ${and(have)}. ${f.hint[0].toUpperCase()}${f.hint.slice(1)}.`);
    }
    if (features.length > max) lines.push(`   · and ${features.length - max} more`);
  }
  if (old.length) {
    lines.push(`${old.length} old pattern${old.length === 1 ? '' : 's'} the platform now replaces:`);
    for (const x of old.slice(0, max)) lines.push(`   · ${where(x)}  ${x.name}, use ${x.use}`);
    if (old.length > max) lines.push(`   · and ${old.length - max} more`);
  }
  return lines;
}

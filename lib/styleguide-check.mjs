// styleguide-check.mjs - the style guide is held to the system it shows.
//
// The page's own CSS (every <style> block but the system's, which the template marks data-system) may use the
// system's tokens and nothing else for how it looks: no colour, font, text size, weight, line height, corner radius or
// space of its own. Layout (widths, grids, positions, a 1px rule) is the template's. A look role the system has no
// token for, left to the browser's own, is listed too.
//
// Built and published, it is also held to what a page owes its readers: every file it links to is there beside it (a
// missing one fails it, so a page with a hole is never published), and its weight, the page and every file it loads, is
// said, with a warning past WEIGHT_WARN_MB and where most of it goes.
//
//   import { checkStyleguidePage } from './styleguide-check.mjs'   → [{ selector, property, value, why }]
//   node audit.mjs --styleguide-check [page.html]                  prints them; exit 1 when there are any
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { readPage } from './styleguide-files.mjs';
import { markupFindings } from './a11y-static.mjs';

const COLOUR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(|(?<![\w-])(?:white|black|red|green|blue|gray|grey|silver|orange|yellow|purple|pink|navy|teal)(?![\w-])/i;
const LENGTH = /(?<![\w-])-?\d*\.?\d+(?:px|rem|em|pt)\b/;
const OK_WORD = /^(?:inherit|initial|unset|revert|none|normal|0|auto|transparent|currentcolor)$/i;

// The CSS blocks the page itself wrote: every <style> but the one the template marks data-system.
export function pageOwnCss(html) {
  return [...String(html).matchAll(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi)].filter((m) => !/\bdata-system\b/i.test(m[1])).map((m) => m[2]).join('\n')
    .replace(/@font-face\s*\{[^}]*\}/g, '');   // a font file the page carries (its own, written in as data) is not a style it sets
}

// Every declaration with its selector, @media and nesting flattened: [{ selector, property, value }].
function declarations(css) {
  const out = [];
  const text = String(css).replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of text.matchAll(/([^{}@;]+)\{([^{}]*)\}/g)) {
    const selector = m[1].trim().replace(/\s+/g, ' ');
    for (const d of m[2].split(';')) {
      const i = d.indexOf(':');
      if (i < 0) continue;
      const property = d.slice(0, i).trim().toLowerCase(), value = d.slice(i + 1).trim().replace(/\s*!important$/, '');
      if (property && value) out.push({ selector, property, value });
    }
  }
  return out;
}

// The look roles the page still leaves to its defaults: the last value each --sg-* role gets is one of the template's
// fallbacks (its own neutral hex defaults, the browser's system colours, inherit, its default text sizes and rem spaces, 0 radii).
const NEEDED = ['bg', 'surface', 'text', 'muted', 'border', 'accent', 'space-s', 'space-l'];   // text sizes and corners are the template's own
const FALLBACK = /^(Canvas|CanvasText|GrayText|AccentColor|inherit|smaller|small|medium|large|0|[\d.]+rem|#[0-9a-f]{3,8})$/i;   // its own neutral hex defaults too (a system's role is always a var())
export function missingRoles(html) {
  const last = {};
  for (const d of declarations(pageOwnCss(html))) if (d.property.startsWith('--sg-')) last[d.property.slice(5)] = d.value;
  return NEEDED.filter((r) => last[r] === undefined || FALLBACK.test(last[r]));
}

// The classes the page puts on its own buttons and links (in its markup and in the strings its script writes).
export function controlClasses(html) {
  const out = new Set();
  for (const m of String(html).matchAll(/<(?:a|button)\b[^>]*?\bclass\s*=\s*["']([^"'+]+)["']/gi)) m[1].split(/\s+/).forEach((c) => c && out.add(c));
  for (const m of String(html).matchAll(/createElement\(\s*['"](?:a|button)['"]\s*\)[^;]*;\s*\w+\.className\s*=\s*['"]([^'"]+)['"]/g)) m[1].split(/\s+/).forEach((c) => c && out.add(c));
  return out;
}

// A button or link the page draws itself: a rule of its own that gives one a box (a fill, a border, a corner radius
// or a raised shadow). The system's own button draws it, or the browser's plain one. The page's defaults for a control
// the system lacks (its segmented control, a property's switch, its dropdown, tooltip and card) are drawn only with the page's roles (--sg-*), so they
// pass when every value is one of those roles, a keyword or a round corner.
const BOX = /^(background(-color)?|border(-(top|right|bottom|left))?(-(width|style|color))?|border-radius|box-shadow)$/;
const DEFAULT_CONTROL = /\.(sg-seg-default|pg-switch|sg-select-trigger|sg-tip-btn|sg-tip-bubble|sg-card|sg-nav|sg-chip|sg-chip-menu|sg-tab|sg-tk-item|sg-tk-alias|sg-link-pill|sg-tk-twist|sg-mx-sort|sg-mx-cell|sg-mx-close|sg-mx-go|sg-btn)(?![\w-])/;
const ROLES_ONLY = (v) => !v.replace(/var\(--sg-[\w-]+(?:,\s*[^()]*)?\)|calc|max|min|(?<![\w.%-])(?:solid|transparent|none|50%|0px|1px|0)(?![\w.%-])|[\s(),*+-]/g, '');
function drawsControl(d, classes) {
  if (!BOX.test(d.property) || /^(none|0|0px|transparent|inherit|initial|unset)$/i.test(d.value) || /\.pg-preview\b/.test(d.selector)) return false;
  if (DEFAULT_CONTROL.test(d.selector) && ROLES_ONLY(d.value)) return false;
  if (d.property === 'box-shadow' && /\binset\b/.test(d.value)) return false;   // a line marking the current item
  if (/^border-(top|bottom)$/.test(d.property) && ROLES_ONLY(d.value)) return false;   // a line between a list's items, in the page's own line: a divider, not a box
  // The current item of the page's own menu, or the one under the pointer, on one of the page's backgrounds: marked,
  // not drawn as a control.
  if (/^background(-color)?$/.test(d.property) && (/\.active\b|\[aria-current/.test(d.selector) || /\.sg-nav a:hover\b/.test(d.selector)) && /^var\(--sg-[\w-]+\)$/.test(d.value.trim())) return false;
  return d.selector.split(',').some((part) => {
    const subject = part.trim().split(/\s+|>|\+|~/).filter(Boolean).pop() ?? '';
    const tag = /^(a|button)(?![\w-])/i.test(subject);
    const cls = [...subject.matchAll(/\.([\w-]+)/g)].some((m) => classes.has(m[1]));
    return tag || cls;
  });
}

export function checkStyleguidePage(html, { missing = missingRoles(html) } = {}) {
  const found = [];
  const add = (d, why) => found.push({ selector: d.selector, property: d.property, value: d.value, why });
  const classes = controlClasses(html);
  for (const d of declarations(pageOwnCss(html))) {
    const { property: p } = d;
    if (drawsControl(d, classes)) { add(d, 'a button or link the page draws itself: use the system\'s own button, or the browser\'s plain one'); continue; }
    // The role defaults (--sg-*: Canvas, CanvasText, the browser's sizes) are the fallback, not the look.
    if (p.startsWith('--')) continue;
    const v = d.value.replace(/var\([^()]*(?:\([^()]*\)[^()]*)*\)/g, 'VAR');
    if (COLOUR.test(v)) { add(d, 'a colour that is not one of the system\'s tokens'); continue; }
    // A code block's own monospace face is the page's on purpose: code is read in one, whatever the system's text is.
    const codeFace = p === 'font-family' && /(^|,)\s*monospace\s*$/i.test(v) && /(code|pre|kbd|samp)(?![\w-])/i.test(d.selector);
    if (p === 'font-family' && !/^inherit$/i.test(v) && !codeFace) add(d, 'a font of the page\'s own: its text inherits the font the system sets on its page, with its fallbacks');
    else if (p === 'font-size' && LENGTH.test(v)) add(d, 'a text size that is not one of the system\'s text styles');
    // A step above the system's own weight (calc(var(--sg-m-weight) + 100)) is still its weight, a step heavier.
    else if (p === 'font-weight' && /\d/.test(v) && !/^calc\(VAR\s*[+-]\s*\d{3}\)$/.test(v)) add(d, 'a weight that is not one of the system\'s text styles');
    else if (p === 'line-height' && /\d/.test(v) && v !== '0') add(d, 'a line height that is not one of the system\'s text styles');
    else if (/^border(-[a-z]+)*-radius$/.test(p) && LENGTH.test(v) && !/^0(px)?$/.test(v)) add(d, 'a corner radius that is not one of the system\'s radii');
    else if (/^(padding|margin|gap|row-gap|column-gap)(-[a-z]+)*$/.test(p) && v.split(/\s+/).some((x) => LENGTH.test(x) && Math.abs(parseFloat(x)) > 2 && !OK_WORD.test(x))) add(d, 'a space that is not one of the system\'s spacing tokens');
    else if (p === 'font' && !/^(VAR|inherit)$/i.test(v)) add(d, 'a font shorthand of its own');
  }
  // The page is held to the accessibility rules it checks others by: what the static check finds in its own markup.
  // The system's own icon sheet (#ds-icon-sheet) is the system's, not the page's: what the check finds in an icon there
  // (one that paints itself white) is listed for the system, never a failure of the page.
  const markup = String(html).replace(/<script\b[\s\S]*?<\/script\b[^>]*>/gi, '').replace(/<style\b[\s\S]*?<\/style>/gi, '');
  const sheet = /<svg\b[^>]*\bid\s*=\s*["']ds-icon-sheet["'][^>]*>[\s\S]*?<\/svg>/i.exec(markup)?.[0] ?? '';
  const own = sheet ? markup.replace(sheet, (m) => m.replace(/[^\n]/g, ' ')) : markup;
  for (const f of markupFindings(own)) found.push({ selector: `line ${f.line ?? '?'}`, property: 'accessibility', value: f.kind ?? '', why: f.desc ?? 'an accessibility problem in the page itself' });
  if (sheet) for (const f of markupFindings(sheet)) found.push({ selector: 'the system\'s icons', property: 'accessibility', value: f.kind ?? '', why: f.desc ?? 'an accessibility problem in one of the system\'s icons', warning: true });
  // Its own text on its own backgrounds, in every mode (the build writes what falls short: styleguide-data pageContrast).
  const low = /\/\*sg-contrast:(\[[\s\S]*?\])\*\//.exec(String(html));
  if (low) { try { for (const c of JSON.parse(low[1])) found.push({ selector: `--sg-${c.text} on --sg-${c.on}`, property: 'contrast', value: `${c.ratio}:1 in ${c.mode}`, why: `the page's ${c.text} text on its ${c.on} background is ${c.ratio}:1 in ${c.mode}, below 4.5:1 (WCAG 1.4.3): pick a darker or lighter token for that role (styleguide.chrome)` }); } catch { /* unreadable: nothing to add */ } }
  for (const role of missing) found.push({ selector: ':root', property: `--sg-${role}`, value: 'the page\'s default', why: `the system has no token the page could use for ${role}`, warning: true });
  return found;
}

// A look role the system has no token for is shown with the page's default: listed, never a failure.
export const failures = (found) => found.filter((f) => !f.warning);
export function checkLines(found) {
  const bad = failures(found), warn = found.filter((f) => f.warning);
  const roles = warn.filter((f) => f.property.startsWith('--sg-')), icons = warn.filter((f) => f.property === 'accessibility'), weight = warn.filter((f) => f.property === 'weight');
  const warnLines = [...(roles.length ? [`   ⚠️  the system has no token for ${roles.map((f) => f.property.replace(/^--sg-/, '')).join(', ')}: the page's default is shown there`] : []),
    ...icons.map((f) => `   ⚠️  ${f.why}`), ...weight.map((f) => `   ${f.info ? 'ℹ️ ' : '⚠️ '} ${f.why.charAt(0).toUpperCase()}${f.why.slice(1)}.`)];
  if (!bad.length) return ['✅ Style guide check: the page uses only the system (its colours, fonts, text styles, radii and spacing).', ...warnLines];
  const files = bad.filter((f) => f.property === 'file');
  return [`❌ Style guide check: ${[bad.length - files.length ? `${bad.length - files.length} thing${bad.length - files.length === 1 ? '' : 's'} on the page not from the system` : '', files.length ? `${files.length} file${files.length === 1 ? '' : 's'} the page links to not there` : ''].filter(Boolean).join(', ')}`,
    ...bad.slice(0, 40).map((f) => `   • ${f.selector} { ${f.property}: ${f.value} }: ${f.why}`),
    ...(bad.length > 40 ? [`   … and ${bad.length - 40} more`] : []), ...warnLines];
}

// The local files a page names: each src and href that is not an anchor, a data URL or an address on the web.
const NOT_A_FILE = /^(#|data:|blob:|https?:|\/\/|mailto:|tel:|javascript:|about:|\{\{)/i;
export function localFiles(html) {
  const out = new Set();
  const markup = String(html).replace(/<(script|style)\b([^>]*)>[\s\S]*?<\/\1>/gi, '<$1$2></$1>');   // a tag's own attributes, never the code inside it
  for (const m of markup.matchAll(/<(?:script|link|img|a|source|iframe|video|audio)\b[^>]*?\s(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
    const ref = m[1].trim();
    if (!ref || NOT_A_FILE.test(ref)) continue;
    let path = ref.split(/[?#]/)[0];
    try { path = decodeURIComponent(path); } catch { /* kept as written */ }
    if (path) out.add(path);
  }
  // The page's data, which its loader writes in (styleguide-files.mjs): named on that script as data-src.
  for (const m of markup.matchAll(/<script\b[^>]*\bid=["']sg-data["'][^>]*\sdata-src\s*=\s*["']([^"']+)["']/gi)) if (!NOT_A_FILE.test(m[1])) out.add(m[1].split(/[?#]/)[0]);
  return [...out];
}

// The page's weight: its own file and each local file it names that is there, the largest first.
export const WEIGHT_WARN_MB = 25;
export function pageWeight(file) {
  const dir = dirname(resolve(file)), files = [{ file: relative(dir, resolve(file)), bytes: statSync(file).size }];
  for (const f of localFiles(readFileSync(file, 'utf8'))) {
    const abs = resolve(dir, f);
    if (abs !== resolve(file) && existsSync(abs) && statSync(abs).isFile()) files.push({ file: f, bytes: statSync(abs).size });
  }
  files.sort((a, b) => b.bytes - a.bytes);
  return { bytes: files.reduce((n, f) => n + f.bytes, 0), files };
}
const mb = (b) => `${(b / 1048576).toFixed(b < 10 * 1048576 ? 1 : 0)} MB`;

// What the built page owes its readers: every file it links to there, and its weight said (a warning past the budget).
export function pageFindings(file, { warnMB = WEIGHT_WARN_MB } = {}) {
  const found = [];
  const dir = dirname(resolve(file));
  for (const f of localFiles(readFileSync(file, 'utf8'))) {
    if (!existsSync(join(dir, f))) found.push({ selector: 'link', property: 'file', value: f, why: `a file the page links to is not there (${f}): publish the page with the files beside it, or build it again` });
  }
  const w = pageWeight(file);
  const top = w.files.slice(0, 3).map((f) => `${f.file} ${mb(f.bytes)}`).join(', ');
  found.push({ selector: 'page', property: 'weight', value: mb(w.bytes), bytes: w.bytes, warning: true, info: w.bytes <= warnMB * 1048576,
    why: w.bytes > warnMB * 1048576 ? `the page and its files weigh ${mb(w.bytes)}, past ${warnMB} MB, slow to open on a phone or a slow connection; the largest: ${top}` : `the page and its files weigh ${mb(w.bytes)} (the largest: ${top})` });
  return found;
}

// The page with the files it links beside it written back in (its styles and code: styleguide-files.mjs), and what the
// built page owes its readers.
export function checkFile(file, opts = {}) { return [...checkStyleguidePage(readPage(file), opts), ...pageFindings(file)]; }

// raw-census.mjs - every value written by hand in the project's styles, counted.
//
// The edit check reads what one edit adds; Gate 11 flags a literal only when it contradicts Figma. This reads
// every style file the project has (.css, .scss, .less, the <style> blocks of .vue and .svelte files) and lists each
// literal a token should carry, with its line and the token to use when the theme has one with that value:
//   • a colour (#hex, rgb(), hsl(), oklch(), a CSS name like green): an error, a token or not;
//   • a spacing (padding, margin, gap): an error, when the theme names spacing at all;
//   • a corner radius or a font size: an error when a token holds the value, a warning when none does;
//   • a duration (transition, animation): a warning, with the token when one holds it;
//   • a z-index other than -1, 0 or 1, and a shadow written out: warnings (uncommon values), with the token when one
//     holds the same.
// Every style file and every page's <style> blocks are read. In the theme files (paths.themeCSS, paths.pluginCSS) the
// custom properties are the tokens given their values, so only their other rules are read.
// 0, a 1px hairline, a pill's 999px radius, calc(), and a value inside var() (a token, or a token's fallback) are left
// alone. Files are listed with the ones that guess most first.
//
// A baseline keeps the count falling (design-system-engine-census.json at the project root): the first run writes it;
// a run with fewer errors lowers it; a run where a file has more errors than the baseline says which and fails.
// Pure apart from censusOf (reads the project) and the baseline helpers (read and write the file).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, resolve, extname } from 'node:path';
import { projectStyleFiles, styleOnly } from './a11y-static.mjs';
import { editTruth, themeSizes, normHex } from './edit-check.mjs';
import { colorHex, timeMs, COLOUR_NAMES } from './css-values.mjs';
import { newPath } from './names.mjs';

const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;
const FUNC_COLOUR = /\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb|color)\((?:[^()]|\([^()]*\))*\)/gi;
const NAMED_COLOUR = new RegExp(`(?<![\\w#.$@/-])(${[...COLOUR_NAMES].sort((a, b) => b.length - a.length).join('|')})(?![\\w(-])`, 'gi');
const VAR_SPAN = /var\((?:[^()]|\([^()]*\))*\)/g;
const SPACING = /^(padding|margin)(-(top|right|bottom|left|inline|block)(-(start|end))?)?$|^(row-|column-)?gap$/i;
const RADIUS = /^border(-(top|bottom|start|end)-(left|right|start|end))?-radius$/i;
const DURATION = /^(transition|animation)(-(duration|delay))?$/i;

// Comments blanked, line breaks kept, so every line keeps its number.
const blank = (t) => String(t).replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:\\])\/\/[^\n]*/g, (m, p) => p + ' '.repeat(m.length - p.length));
const px = (n, unit) => +(Number(n) * (/rem/i.test(unit) ? 16 : 1)).toFixed(3);
const norm = (v) => String(v).trim().toLowerCase().replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ');

// The tokens a value can be written with, from the theme: colours (by hex), sizes (by kind, in px), durations (in ms),
// z-indexes and shadows (as written). → { colours, sizes, durations, layers, shadows }
export function censusTokens(themeText, tokenByValue = null) {
  const durations = new Map(), layers = new Map(), shadows = new Map(), colours = tokenByValue ?? new Map();
  const add = (map, k, name) => { const l = map.get(k) ?? []; if (!l.includes(name)) l.push(name); map.set(k, l); };
  for (const m of String(themeText ?? '').matchAll(/(--[\w-]+)\s*:\s*([^;}\n]+)/g)) {
    const [name, raw] = [m[1], m[2].trim()];
    if (/^-?\d*\.?\d+m?s$/.test(raw)) { const ms = timeMs(raw); if (ms != null) add(durations, ms, name); continue; }
    if (/^-?\d+$/.test(raw) && /z-?index|layer|elevation|stack/i.test(name)) { add(layers, Number(raw), name); continue; }
    if (/shadow|elevation/i.test(name) && /\d(px|rem)/.test(raw) && !/^var\(/.test(raw)) { add(shadows, norm(raw), name); continue; }
    if (!tokenByValue) { const k = /^#[0-9a-fA-F]{3,8}$/.test(raw) ? normHex(raw) : colorHex(raw); if (k) add(colours, k, name); }
  }
  return { colours, sizes: themeSizes(themeText), durations, layers, shadows };
}

const use = (names) => `var(${names[0]})${names.length > 1 ? ` (or ${names.slice(1, 3).map((t) => `var(${t})`).join(', ')})` : ''}`;

// One file's text → [{ line, kind, level: 'error'|'warning', prop, value, token, text }]. theme: a theme file, whose
// custom properties are the tokens themselves.
export function censusText(text, tokens, { theme = false } = {}) {
  const out = [], seen = new Set();
  const lines = blank(text).split('\n');
  lines.forEach((raw, i) => {
    const line = i + 1;
    for (const m of raw.matchAll(/(?:^|[\s;{])(--[\w-]+|[a-z-]+)\s*:\s*([^;{}]+)/gi)) {
      const prop = m[1].toLowerCase(), value = m[2].trim();
      // A selector's pseudo-class (a:hover) has no value worth reading; a declaration has a property name.
      if (/^(hover|focus|active|visited|before|after|not|is|where|has|root|nth-child|first-child|last-child|focus-visible|focus-within|checked|disabled)$/i.test(prop)) continue;
      const bare = value.replace(VAR_SPAN, ' ');
      const custom = prop.startsWith('--');
      if (custom && theme) continue;
      // Colours, anywhere in a value (a border, a shadow, a gradient), the custom properties of a component file included.
      const colours = [...bare.matchAll(HEX)].map((x) => x[0]).concat([...bare.matchAll(FUNC_COLOUR)].map((x) => x[0]), /url\(/i.test(bare) ? [] : [...bare.matchAll(NAMED_COLOUR)].map((x) => x[0]));
      for (const c of colours) {
        const k = /^#/.test(c) ? normHex(c) : colorHex(c);
        if (!k) continue;
        const names = tokens.colours.get(k);
        out.push({ line, kind: 'colour', level: 'error', prop, value: c, same: k, token: names?.[0] ?? null, text: names ? `${prop}: ${c} is written by hand; use ${use(names)}` : `${prop}: ${c} is not a colour of the design system` });
      }
      if (custom || /calc\(|min\(|max\(|clamp\(/i.test(bare)) continue;
      const kind = SPACING.test(prop) ? 'spacing' : RADIUS.test(prop) ? 'radius' : prop === 'font-size' ? 'font size' : null;
      if (kind) {
        const table = tokens.sizes?.[kind];
        for (const x of bare.matchAll(/(^|[\s,(/])(-?\d*\.?\d+)(px|rem)\b/gi)) {
          const v = px(x[2], x[3]);
          if (Math.abs(v) <= 1 || v < 0) continue;
          const names = table?.get(v);
          if (!names && kind === 'radius' && v >= 999) continue;
          if (!names && kind === 'spacing' && !table?.size) continue;   // the system names no spacing
          const text = `${x[2]}${x[3]}`;
          out.push({ line, kind, level: names || kind === 'spacing' ? 'error' : 'warning', prop, value: text, same: v, token: names?.[0] ?? null,
            text: names ? `${prop}: ${text} is written by hand; use ${use(names)}` : `${prop}: ${text} is not a ${kind === 'spacing' ? 'spacing value' : kind} of the design system` });
        }
      }
      if (DURATION.test(prop)) {
        for (const x of bare.matchAll(/(^|[\s,])(\d*\.?\d+m?s)\b/gi)) {
          const ms = timeMs(x[2]);
          if (!ms) continue;
          const names = tokens.durations.get(ms);
          out.push({ line, kind: 'duration', level: 'warning', prop, value: x[2], same: ms, token: names?.[0] ?? null, text: names ? `${prop}: ${x[2]} is written by hand; use ${use(names)}` : `${prop}: ${x[2]} is not a duration of the design system` });
        }
      }
      if (prop === 'z-index' && /^-?\d+$/.test(bare.trim())) {
        const n = Number(bare.trim());
        if (Math.abs(n) > 1) { const names = tokens.layers.get(n); out.push({ line, kind: 'z-index', level: 'warning', prop, value: String(n), token: names?.[0] ?? null, text: names ? `z-index: ${n} is written by hand; use ${use(names)}` : `z-index: ${n} is a layer the design system does not name` }); }
      }
      if (/^(box|text)-shadow$/.test(prop) && /\d(px|rem)/.test(bare) && !/^\s*none\s*$/i.test(bare)) {
        const names = tokens.shadows.get(norm(value));
        out.push({ line, kind: 'shadow', level: 'warning', prop, value: value.slice(0, 60), token: names?.[0] ?? null, text: names ? `${prop} is written out by hand; use ${use(names)}` : `${prop}: ${value.slice(0, 60)} is a shadow the design system does not name` });
      }
    }
  });
  // The same value on one line (a transition listing three properties at 0.15s, or at 0.15s and 150ms) is one finding.
  return out.filter((x) => { const k = `${x.line}|${x.kind}|${x.prop}|${x.same ?? x.value}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

// The whole project: { files: [{ file, errors, warnings, findings }], errors, warnings, byKind } with the files that
// guess most first.
export function censusOf(ROOT, cfg = {}) {
  const truth = editTruth(ROOT, cfg);
  const themePaths = [cfg.paths?.themeCSS ?? 'src/theme.css', ...[cfg.paths?.pluginCSS ?? []].flat()].flat().map((p) => resolve(ROOT, p));
  const read = (f) => { try { return readFileSync(f, 'utf8'); } catch { return ''; } };
  const tokens = censusTokens(themePaths.map(read).join('\n'), truth.tokenByValue);
  tokens.sizes = truth.sizes;
  const files = [];
  const all = [...new Set([...projectStyleFiles(ROOT, { html: true }), ...themePaths.filter((p) => existsSync(p))])];
  for (const f of all) {
    const text = ['.vue', '.svelte', '.html', '.htm'].includes(extname(f).toLowerCase()) ? styleOnly(read(f)) : read(f);
    const findings = censusText(text, tokens, { theme: themePaths.includes(resolve(f)) });
    if (!findings.length) continue;
    files.push({ file: relative(ROOT, f), errors: findings.filter((x) => x.level === 'error').length, warnings: findings.filter((x) => x.level === 'warning').length, findings });
  }
  files.sort((a, b) => b.errors - a.errors || b.warnings - a.warnings || a.file.localeCompare(b.file));
  const byKind = {};
  for (const f of files) for (const x of f.findings) byKind[x.kind] = (byKind[x.kind] ?? 0) + 1;
  return { files, errors: files.reduce((n, f) => n + f.errors, 0), warnings: files.reduce((n, f) => n + f.warnings, 0), byKind };
}

// ── The baseline: the count only falls ──────────────────────────────────────────────────────────────────────────────
export const CENSUS_FILE = newPath('census');
export function censusSnapshot(census, at = new Date().toISOString()) {
  return { at, errors: census.errors, warnings: census.warnings, files: Object.fromEntries(census.files.map((f) => [f.file, { errors: f.errors, warnings: f.warnings }])) };
}
// census against the baseline (or null) → { first, grew: [{ file, was, now }], fell, total: { was, now } }
export function censusAgainst(census, base) {
  if (!base) return { first: true, grew: [], fell: false, total: { was: null, now: census.errors } };
  const grew = census.files.filter((f) => f.errors > (base.files?.[f.file]?.errors ?? 0)).map((f) => ({ file: f.file, was: base.files?.[f.file]?.errors ?? 0, now: f.errors }));
  return { first: false, grew, fell: !grew.length && census.errors < base.errors, total: { was: base.errors, now: census.errors } };
}
export function readCensusBaseline(ROOT) { try { return JSON.parse(readFileSync(join(ROOT, CENSUS_FILE), 'utf8')); } catch { return null; } }
export function writeCensusBaseline(ROOT, census) { writeFileSync(join(ROOT, CENSUS_FILE), JSON.stringify(censusSnapshot(census), null, 2) + '\n'); }

// The lines a run prints. top: how many files to list in full (the rest counted).
export function censusLines(census, against, { top = 10, each = 8 } = {}) {
  const kinds = Object.entries(census.byKind).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ');
  if (!census.files.length) return ['✅ No value written by hand in the project\'s styles: every colour, size, duration, layer and shadow is a token.'];
  const out = [`Values written by hand in the project's styles: ${census.errors} error${census.errors === 1 ? '' : 's'}, ${census.warnings} warning${census.warnings === 1 ? '' : 's'} in ${census.files.length} file${census.files.length === 1 ? '' : 's'} (${kinds}), the files that guess most first:`];
  for (const f of census.files.slice(0, top)) {
    out.push(`  ${f.file}: ${f.errors} error${f.errors === 1 ? '' : 's'}, ${f.warnings} warning${f.warnings === 1 ? '' : 's'}`);
    for (const x of f.findings.slice(0, each)) out.push(`    ${x.level === 'error' ? '✗' : '!'} line ${x.line}, ${x.text}`);
    if (f.findings.length > each) out.push(`    and ${f.findings.length - each} more`);
  }
  if (census.files.length > top) out.push(`  and ${census.files.length - top} more file${census.files.length - top === 1 ? '' : 's'}`);
  if (against.first) out.push(`The count is now the baseline (${CENSUS_FILE}): from here it only falls. Commit the file with the change.`);
  else if (against.grew.length) out.push(`✗ More values written by hand than the baseline in ${against.grew.length} file${against.grew.length === 1 ? '' : 's'}: ${against.grew.map((g) => `${g.file} (${g.was} → ${g.now})`).join(', ')}. Use the tokens named above.`);
  else if (against.fell) out.push(`✓ Down from ${against.total.was} to ${against.total.now} errors: the baseline is lowered (${CENSUS_FILE}). Commit the file with the change.`);
  else out.push(`No file has more than the baseline (${against.total.was} errors).`);
  return out;
}

// tailwind-check.mjs - Tailwind arbitrary values against the design system (idea I65, first part).
//
// A Tailwind class with a value in brackets (rounded-[4px], h-[37px], bg-[#ff00aa]) steps outside the theme: it
// is a literal written into a class name, where no CSS rule and no literal check ever sees it. S30 counts them as
// one of its main signals. This finds each one in the markup and says, from the project's own @theme, the
// utility to write instead when a theme value is the same (rounded-[6px] → rounded-control), or that the value is
// not a design-system value at all. Only a project that uses Tailwind is read (an @theme block or a
// tailwindcss import in the theme CSS, or a tailwind.config file). Advisory. "tailwind": false turns it off.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { codeRoots } from './code-roots.mjs';
import { join, relative, extname } from 'node:path';
import { ENGINE_DIRS } from './names.mjs';

const SKIP_DIR = new Set(['node_modules', 'dist', 'build', 'out', '.git', '.next', '.nuxt', 'coverage', ...ENGINE_DIRS, 'contracts', 'storybook-static', 'vendor']);
const MARKUP = new Set(['.html', '.htm', '.vue', '.jsx', '.tsx', '.svelte', '.astro']);

// Utility prefix → the @theme namespace its value comes from, and how its utility is written.
const KINDS = [
  { re: /^rounded(?:-[trblse]{1,2})?$/, ns: 'radius', util: (u, n) => `${u}-${n}` },
  { re: /^(?:p|px|py|pt|pr|pb|pl|ps|pe|m|mx|my|mt|mr|mb|ml|ms|me|gap|gap-x|gap-y|space-x|space-y|inset|inset-x|inset-y|top|right|bottom|left)$/, ns: 'spacing', util: (u, n) => `${u}-${n}` },
  { re: /^(?:h|w|size|min-h|min-w|max-h|max-w)$/, ns: 'spacing', util: (u, n) => `${u}-${n}` },
  { re: /^(?:bg|text|border|border-[trblxy]|outline|ring|fill|stroke|from|via|to|decoration|caret|accent|divide|placeholder|shadow)$/, ns: 'color', colour: true, util: (u, n) => `${u}-${n}` },
  { re: /^text$/, ns: 'text', util: (u, n) => `text-${n}` },
  { re: /^font$/, ns: 'font-weight', util: (u, n) => `font-${n}` },
  { re: /^leading$/, ns: 'leading', util: (u, n) => `leading-${n}` },
  { re: /^tracking$/, ns: 'tracking', util: (u, n) => `tracking-${n}` },
  { re: /^shadow$/, ns: 'shadow', util: (u, n) => `shadow-${n}` },
];
const COLOUR = /^(#[0-9a-f]{3,8}|rgba?\(|hsla?\(|oklch\(|color-mix\()/i;

const normValue = (v) => {
  const s = String(v).trim().toLowerCase().replace(/_/g, ' ');
  const hex = /^#([0-9a-f]{3,4})$/.exec(s);
  return hex ? `#${[...hex[1]].map((c) => c + c).join('')}` : s.replace(/\s+/g, ' ');
};

// @theme blocks → Map(namespace → Map(value → [name])). `--color-action-primary: #0a6c74` is color/action-primary.
export function themeValues(css) {
  const out = new Map();
  for (const block of String(css ?? '').matchAll(/@theme\b[^{]*\{([^}]*)\}/g)) {
    for (const m of block[1].matchAll(/--([a-z]+(?:-weight)?)-([\w-]+)\s*:\s*([^;]+);/g)) {
      const [, ns, name, value] = m;
      const byValue = out.get(ns) ?? out.set(ns, new Map()).get(ns);
      const v = normValue(value);
      byValue.set(v, [...(byValue.get(v) ?? []), name]);
    }
  }
  return out;
}

export const usesTailwind = (css, root = null) => /@theme\b|@import\s+["']tailwindcss|@tailwind\s+(base|utilities)/.test(String(css ?? ''))
  || (!!root && ['tailwind.config.js', 'tailwind.config.ts', 'tailwind.config.cjs', 'tailwind.config.mjs'].some((f) => existsSync(join(root, f))));

// One file's text → [{ line, cls, utility, value, fix }]. `theme` from themeValues.
export function arbitraryFindings(text, theme = new Map()) {
  const out = [];
  const lines = String(text ?? '').split('\n');
  lines.forEach((l, i) => {
    for (const m of l.matchAll(/(?<![\w-])((?:[\w-]+:)*)(-?)([a-z]+(?:-[a-z]+)*)-\[([^\]\s"'`]+)\](\/\d+)?/g)) {
      const [whole, variants, neg, utility, raw, alpha = ''] = m;
      if (/^(url|var)\(/i.test(raw)) continue;   // an image, or a variable: not a literal value
      if (l[m.index + whole.length] === ':' || /^(data|aria|group|peer|supports|has|nth|min|max|not|in)$/.test(utility)) continue;   // a variant (data-[state=open]:), not a value
      if (/^(grid-cols|grid-rows|content|url|bg-url|animate|transition|ease|duration|delay|z|order|columns|aspect|will-change|cursor|font-family|family)$/.test(utility)) continue;
      const value = normValue(raw);
      const colour = COLOUR.test(value);
      const kind = KINDS.find((k) => k.re.test(utility) && (!!k.colour === colour || (utility === 'text' && k.ns === 'text' && !colour)));
      let fix = null;
      if (kind) {
        const names = theme.get(kind.ns)?.get(value) ?? [];
        if (names.length) fix = `${variants}${neg}${kind.util(utility, names[0])}${alpha}`;
      }
      out.push({ line: i + 1, cls: whole, utility, value: raw, fix, colour });
    }
  });
  return out;
}

export function arbitraryLine(file, f) {
  return `${file}:${f.line}  ${f.cls}  ${f.fix ? `the theme has this value: write ${f.fix}` : `${f.value} is not a design-system value${f.colour ? ' (a colour the theme does not have)' : ''}`}`;
}

// A theme variable is used through a utility: --color-action-primary by bg-action-primary (or text-, border-, …),
// --radius-control by rounded-control, --spacing-2 by p-2, --breakpoint-md by md:. Only a namespace Tailwind makes
// utilities from; any other variable is used only through var().
const UTILITY_NS = new Set(['color', 'spacing', 'radius', 'text', 'font', 'font-weight', 'leading', 'tracking', 'shadow', 'inset-shadow', 'drop-shadow', 'blur', 'perspective', 'aspect', 'ease', 'animate', 'container', 'breakpoint']);
export function usedByUtility(cssVar, src) {
  const m = /^--(font-weight|inset-shadow|drop-shadow|[a-z]+)-([\w.-]+)$/.exec(String(cssVar));
  if (!m || !UTILITY_NS.has(m[1])) return false;
  const name = m[2].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (m[1] === 'breakpoint' || m[1] === 'container') return new RegExp(`(?<![\\w-])@?${name}:`).test(src);
  return new RegExp(`(?<![\\w-])(?:[\\w-]+:)*-?[a-z]+(?:-[a-z]+)*-${name}(?:\\/\\d+)?(?![\\w-])`).test(src);
}

function walk(ROOT, limit = 4000) {
  const files = [];
  const go = (dir, depth) => {
    if (files.length >= limit || depth > 8) return;
    let names; try { names = readdirSync(dir); } catch { return; }
    for (const n of names) {
      if (SKIP_DIR.has(n) || n.startsWith('.')) continue;
      const abs = join(dir, n);
      let st; try { st = statSync(abs); } catch { continue; }
      if (st.isDirectory()) go(abs, depth + 1);
      else if (MARKUP.has(extname(n).toLowerCase()) && st.size < 1024 * 1024) files.push(abs);
    }
  };
  for (const root of codeRoots(ROOT)) go(root, 0);
  return files;
}

// The whole project → { tailwind, findings: [{ file, ...f }] }.
export function projectArbitrary(ROOT, themeCss) {
  if (!usesTailwind(themeCss, ROOT)) return { tailwind: false, findings: [] };
  const theme = themeValues(themeCss);
  const findings = [];
  for (const abs of walk(ROOT)) {
    if (/\.html?$/i.test(abs) && existsSync(abs.replace(/\.(html?)$/i, '.src.$1'))) continue;
    let text = ''; try { text = readFileSync(abs, 'utf8'); } catch { continue; }
    for (const f of arbitraryFindings(text, theme)) findings.push({ file: relative(ROOT, abs), ...f });
  }
  return { tailwind: true, findings };
}

// ── Utility classes against Figma (I65) ───────────────────────────────────────
// A Tailwind component writes its measures as classes, where no CSS rule carries them: h-9 is the height, px-3
// the padding, rounded-control the corner, bg-action-primary the fill. Each component's own file is read and
// compared with what Figma states for it (figma-structure: h, paddingVar, innerRadiusVar, colors): the class Figma's
// token asks for, and the height in px. Only a difference is reported, with the class to write.
const classTokens = (text) => [...String(text ?? '').matchAll(/(?<![\w-])((?:[\w-]+:)*)(-?[a-z]+(?:-[a-z0-9.]+)*(?:-\[[^\]\s]+\])?)(?:\/\d+)?(?![\w-])/g)].map((m) => ({ variants: m[1], cls: m[2] }));

// The spacing step in px: Tailwind v4's --spacing (default 0.25rem, 4px).
export function spacingBase(themeCss) {
  const m = /--spacing\s*:\s*([\d.]+)(px|rem)\s*;/.exec(String(themeCss ?? ''));
  return m ? Number(m[1]) * (m[2] === 'rem' ? 16 : 1) : 4;
}

// A size class's value in px: h-9 (the spacing step), h-control (a theme name), h-[36px].
export function sizePx(value, { theme = new Map(), base = 4 } = {}) {
  if (/^\[\s*[\d.]+px\s*\]$/.test(value)) return Number(value.replace(/[^\d.]/g, ''));
  if (/^\[\s*[\d.]+rem\s*\]$/.test(value)) return Number(value.replace(/[^\d.]/g, '')) * 16;
  if (/^\d+(\.\d+)?$/.test(value)) return Number(value) * base;
  for (const [v, names] of theme.get('spacing') ?? []) if (names.includes(value) && /px$/.test(v)) return parseFloat(v);
  return null;
}

// → [{ component, what, figma, code, write }] for each measure that differs.
// structure: figma-structure components; files: { component: text }; varOf(token, raw) → the CSS variable.
export function utilityFindings({ structure = {}, files = {}, theme = new Map(), base = 4, varOf, sizing = {} }) {
  const out = [];
  const nameIn = (cssVar, ns) => String(cssVar ?? '').replace(new RegExp(`^--${ns}-`), '');
  for (const [comp, s] of Object.entries(structure)) {
    const text = files[comp];
    if (!text) continue;
    const toks = classTokens(text).map((t) => t.cls);
    const has = (re) => toks.filter((c) => re.test(c));
    // Height.
    if (Number.isFinite(s.h)) {
      const hs = has(/^h-/);
      const px = hs.map((c) => sizePx(c.slice(2), { theme, base })).filter((v) => v != null);
      if (hs.length && !px.includes(s.h)) out.push({ component: comp, what: 'height', figma: `${s.h}px`, code: hs.join(' '), write: Number.isInteger(s.h / base) ? `h-${s.h / base}` : `h-[${s.h}px]` });
    }
    // Padding, from the tokens Figma binds.
    const pad = s.paddingVar ?? {};
    const want = (tok) => (tok ? nameIn(varOf(tok, true), 'spacing') : null);
    const [tb, lr] = [want(pad.tb), want(pad.lr)];
    if (tb && lr) {
      const ok = tb === lr ? toks.includes(`p-${tb}`) || (toks.includes(`px-${lr}`) && toks.includes(`py-${tb}`)) : toks.includes(`px-${lr}`) && toks.includes(`py-${tb}`);
      const code = has(/^p[xytrblse]?-/);
      if (code.length && !ok) out.push({ component: comp, what: 'padding', figma: `${pad.tb} · ${pad.lr}`, code: code.join(' '), write: tb === lr ? `p-${tb}` : `px-${lr} py-${tb}` });
    }
    // Corner.
    if (s.innerRadiusVar) {
      const r = nameIn(varOf(s.innerRadiusVar, true), 'radius');
      const code = has(/^rounded(-|$)/);
      if (code.length && !code.includes(`rounded-${r}`)) out.push({ component: comp, what: 'corner', figma: `${s.innerRadiusVar}${sizing[s.innerRadiusVar] ? ` (${sizing[s.innerRadiusVar]})` : ''}`, code: code.join(' '), write: `rounded-${r}` });
    }
    // Colours: the fill and the text Figma binds.
    for (const [role, prefix] of [['fill', 'bg'], ['text', 'text'], ['stroke', 'border']]) {
      const tok = s.colors?.[role]?.token;
      if (!tok) continue;
      const name = nameIn(varOf(tok, false), 'color');
      const code = has(new RegExp(`^${prefix}-`)).filter((c) => prefix !== 'text' || !/^text-(xs|sm|base|lg|[2-9]?xl|left|right|center|justify)$/.test(c));
      if (code.length && !code.includes(`${prefix}-${name}`)) out.push({ component: comp, what: role === 'fill' ? 'fill' : role === 'text' ? 'text colour' : 'border colour', figma: tok, code: code.join(' '), write: `${prefix}-${name}` });
    }
  }
  return out;
}

export function utilityLine(f) {
  return `${f.component}: ${f.what}, Figma ${f.figma}, the code writes ${f.code}; write ${f.write}`;
}

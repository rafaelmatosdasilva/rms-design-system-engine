// class-debt.mjs - the two lists of a project's classes read against each other: the ones its markup puts on elements,
// and the ones its stylesheets define.
//
// The drift check reads what a product's styles do with the system's values, so it sees a colour written by hand and
// misses the debt that has no styles at all: a class a template writes that no stylesheet ever styled, a partial no
// route includes, a block commented out years ago. Neither list alone says it; read in both directions they do:
//
//   • a class the markup puts on an element and no stylesheet defines - either dead markup, or a style that was
//     deleted and left the class behind;
//   • a class a stylesheet defines and no markup ever puts on - a rule nothing can reach.
//
// A class a hook nobody styled is usually the oldest thing in a product and the cheapest to delete.
//
// Nothing is guessed. A class built at runtime (`class={`card--${kind}`}`) names no class this can read, so every
// class a stylesheet defines whose name begins with a prefix the markup builds is left out rather than called unused;
// the same for the frameworks' own state classes, which a router or a transition puts on. The engine deletes nothing:
// each one is handed back, with its file and line, for a person to decide.
//
//   classDebt(ROOT, cfg) → { unstyled: [{ cls, file, line }], unused: [{ cls, file, line }], read: { markup, styles } }
//
// Reads the project (its markup and its stylesheets); the comparison itself is pure (classLists).
import { readFileSync } from 'node:fs';
import { relative, resolve, extname } from 'node:path';
import { classUseCounts } from './class-use.mjs';
import { walkCss, styleBlocksOf, blankComments } from './css-source.mjs';
import { sourceFiles } from './code-roots.mjs';

// The classes the markup puts on elements. class-use.mjs reads classes and ids together, which other checks want and
// this one does not: an SVG's clipPath id is no class, and counting it would call every one of them unstyled.
export function markupClasses(text) {
  const out = new Set();
  const t = String(text ?? '').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ');
  const add = (v) => { for (const w of String(v).replace(/\$\{[^}]*\}/g, ' ').split(/[^A-Za-z0-9_-]+/)) if (w) out.add(w); };
  // A plain attribute is class names whole; a bound one is an expression, where only what is quoted is a class name:
  // `:class="{ 'error': errorState }"` puts on `error`, and `errorState` is the prop that decides it, never a class.
  for (const m of t.matchAll(/(^|[\s{(])(?:class|className)\s*=\s*(["'])([\s\S]*?)\2/g)) add(m[3]);
  for (const m of t.matchAll(/(?::|v-bind:)class\s*=\s*(["'])([\s\S]*?)\1/g)) for (const q of m[2].matchAll(/['`]([^'`]*)['`]/g)) add(q[1]);
  for (const m of t.matchAll(/\bclassName\s*=\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g)) for (const q of m[1].matchAll(/['"`]([^'"`]*)['"`]/g)) add(q[1]);
  for (const m of t.matchAll(/\bclassList\.(?:add|toggle|replace)\(([^)]*)\)/g)) for (const q of m[1].matchAll(/(["'`])([^"'`]*)\1/g)) add(q[2]);
  for (const m of t.matchAll(/setAttribute\(\s*["']class["']\s*,\s*(["'`])([^"'`]*)\1/g)) add(m[2]);
  return out;
}

// The classes a stylesheet defines, each with where it is defined. A selector's every class counts: `.card .title`
// defines both, and a rule nothing reaches is found by the one it is named for. What is not a class is taken out
// first: an attribute selector's value and a url() both hold dots ([href$=".pdf"], url(http://www.w3.org/…)), and
// reading those as classes invents a class for every one.
export function definedClasses(text, file = '') {
  const out = new Map();
  // Comments blanked in place first (their line numbers kept): a comment naming a file or a URL holds dots, and a
  // selector read out of one invents a class nobody wrote.
  for (const r of walkCss(blankComments(text), file)) {
    for (const sel of r.selectors) {
      const clean = sel.replace(/\[[^\]]*\]/g, ' ').replace(/url\([^)]*\)/gi, ' ').replace(/(["'])(?:\\.|(?!\1)[^\\])*\1/g, ' ');
      for (const m of clean.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) if (!out.has(m[1])) out.set(m[1], { file, line: r.line });
    }
  }
  return out;
}

// The prefixes a file builds a class name from: `class={`card--${k}`}`, `'btn-' + size`, `classList.add('is-' + s)`.
// A class that begins with one of these is reachable although no file writes it whole, so it is never called unused.
export function builtPrefixes(text) {
  const out = new Set();
  const t = String(text ?? '');
  for (const m of t.matchAll(/`([^`$]*?)\$\{/g)) { const w = m[1].trim().split(/\s+/).pop(); if (w && /[\w-]$/.test(w)) out.add(w); }
  for (const m of t.matchAll(/['"]([\w-]+-)['"]\s*\+/g)) out.add(m[1]);
  return out;
}

// The frameworks' own classes, put on by a router, a transition or a build rather than by any markup this reads. A
// named transition makes its own set from its name (`<transition name="footer-animation">` puts on
// `footer-animation-enter-active`), so any class ending in one of those suffixes is the framework's too.
const FRAMEWORK = /^(router-link(-exact)?-active|nuxt-|svelte-|ng-)|-(enter|leave|move)(-(from|to|active))?$/;

// The two lists against each other. markup: [{ file, text }]; styles: [{ file, text }]. Pure.
export function classLists(markup = [], styles = []) {
  const used = new Map(), defined = new Map(), prefixes = new Set();
  for (const { file, text } of markup) {
    for (const c of markupClasses(text)) if (!used.has(c)) used.set(c, { file, line: null });
    for (const p of builtPrefixes(text)) prefixes.add(p);
  }
  for (const { file, text } of styles) for (const [c, at] of definedClasses(text, file)) if (!defined.has(c)) defined.set(c, at);
  // A name ending in a hyphen is the start of a class the code builds ('state-' + kind), never a class of its own.
  const built = (c) => c.endsWith('-') || [...prefixes].some((p) => c.startsWith(p) && c.length > p.length);
  const unstyled = [...used].filter(([c]) => !defined.has(c) && !FRAMEWORK.test(c) && !built(c)).map(([cls, at]) => ({ cls, ...at }));
  const unused = [...defined].filter(([c]) => !used.has(c) && !FRAMEWORK.test(c) && !built(c)).map(([cls, at]) => ({ cls, ...at }));
  const by = (a, b) => a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0) || a.cls.localeCompare(b.cls);
  return { unstyled: unstyled.sort(by), unused: unused.sort(by), read: { markup: markup.length, styles: styles.length } };
}

const STYLE = /\.(css|scss|sass|less)$/i;
const MARKUP = /\.(html?|vue|svelte|jsx|tsx|js|ts|mjs)$/i;

// One project's two lists. The system's own theme files hold no component classes, so they are left out of both.
export function classDebt(ROOT, cfg = {}) {
  const theme = new Set([cfg.paths?.themeCSS ?? 'src/theme.css', ...[cfg.paths?.pluginCSS ?? []].flat()].flat().map((p) => resolve(ROOT, p)));
  const markup = [], styles = [];
  for (const { file, text } of sourceFiles(ROOT, cfg)) {
    const abs = resolve(ROOT, file);
    if (theme.has(abs)) continue;
    const rel = relative(ROOT, abs);
    const ext = extname(file).toLowerCase();
    if (STYLE.test(file)) styles.push({ file: rel, text });
    else if (MARKUP.test(file)) {
      markup.push({ file: rel, text });
      // A single-file component's own <style> block is a stylesheet of its own.
      if (ext === '.vue' || ext === '.svelte' || ext === '.html' || ext === '.htm') styles.push({ file: rel, text: styleBlocksOf(text) });
    }
  }
  return classLists(markup, styles);
}

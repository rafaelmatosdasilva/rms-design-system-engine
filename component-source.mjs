// component-source.mjs - read a DS component's code: which file it lives in, its props, slots and
// the other DS components it uses.
//
// These readers used to live inside the gates (props in component-prop-check.mjs, nesting in
// component-composition-check.mjs), each with its own copy of the file walk and the file finder.
// The gates and the code capture now share them, so both read code the same way.
//
// Readings, best source first (component-api.mjs merges them):
//   • standard files the project already produces - Custom Elements Manifest, react-docgen or
//     vue-docgen JSON, Figma Code Connect files (pairing only)
//   • the project's own TypeScript compiler, when it is installed (never added as a dependency)
//   • text patterns (this file) - the fallback, and the reading every gate has always used
//
// Pure except for the file reads; no network, no browser.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { codeRoots } from './code-roots.mjs';
import { join, extname, basename, resolve, relative } from 'node:path';
import { ENGINE_DIRS } from './names.mjs';
import { createPairing } from './component-pairing.mjs';

export const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ── Files ─────────────────────────────────────────────────────────────────────
export const SKIP_DIR = new Set(['node_modules', 'dist', 'build', '.git', '.next', 'coverage', ...ENGINE_DIRS]);
export const CODE_EXT = new Set(['.vue', '.tsx', '.jsx', '.ts', '.js', '.svelte']);

function walk(dir, out) {
  let entries = [];
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIR.has(e.name)) walk(p, out); }
    else if (CODE_EXT.has(extname(e.name)) && !/\.(test|spec|stories)\./.test(e.name) && !/\.figma\.[jt]sx?$/.test(e.name)) out.push(p);
  }
}

// Component source files: ds-config.json → componentSrcDirs (default src, components, app, lib,
// packages), else the whole repo. Tests, stories and Code Connect files are not components.
export function componentSourceFiles(ROOT, cfg = {}) {
  const out = [];
  for (const d of (cfg.componentSrcDirs ?? ['src', 'components', 'app', 'lib', 'packages']).map((x) => join(ROOT, x))) if (existsSync(d)) walk(d, out);
  if (!out.length) walk(ROOT, out);
  for (const root of codeRoots(ROOT, cfg).slice(1)) walk(root, out);   // sibling folders the config names
  return out;
}

// The class a component file gives its first element: a Vue or Svelte file's first element in its template (its static
// class, else the first string of a bound :class), a React file's first className. null when it carries none.
export function rootClassOf(file, text) {
  const ext = extname(file).toLowerCase();
  const t = String(text ?? '').replace(/<!--[\s\S]*?-->/g, '');
  let attrs = null;
  if (ext === '.vue' || ext === '.svelte') {
    const tpl = ext === '.vue' ? (/<template[^>]*>([\s\S]*)<\/template>/.exec(t)?.[1] ?? '') : t.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '');
    attrs = /<[a-z][\w-]*\b([^>]*)>/.exec(tpl)?.[1] ?? null;
    if (attrs == null) return null;
    const value = (re) => { const m = re.exec(attrs); return m ? m[1] ?? m[2] : null; };
    const own = value(/(?:^|\s)class\s*=\s*(?:"([^"]*)"|'([^']*)')/);
    const bound = value(/(?:^|\s)(?::|v-bind:)class\s*=\s*(?:"([^"]*)"|'([^']*)')/);
    const first = (own ?? '').split(/\s+/).find(Boolean) ?? (bound ? /['"`]([A-Za-z_-][\w-]*)/.exec(bound.replace(/\{[^}]*\}/g, ' '))?.[1] : null);
    return first && /^-?[A-Za-z_][\w-]*$/.test(first) ? first : null;
  }
  if (ext === '.jsx' || ext === '.tsx') {
    const c = /\bclassName\s*=\s*(?:["']([^"']+)["']|\{\s*["'`]([^"'`$]+)["'`]\s*\})/.exec(t)?.slice(1).find(Boolean);
    const first = String(c ?? '').split(/\s+/).find(Boolean);
    return first && /^-?[A-Za-z_][\w-]*$/.test(first) ? first : null;
  }
  return null;
}

// The components the code has: each component file (a Vue or Svelte file, or a React file named in PascalCase) whose
// first element carries a class of its own, named by its file. In a project that keeps them in a components folder,
// only those; else every one but the app's own pages, views, layouts and routes. → [{ name, file, cls }]
export function codeComponents(ROOT, cfg = {}, read = textReader()) {
  const rel = (f) => f.slice(ROOT.length + 1).replace(/\\/g, '/');
  const all = componentSourceFiles(ROOT, cfg).filter((f) => /\.(vue|svelte)$/i.test(f) || (/\.(jsx|tsx)$/i.test(f) && /^[A-Z]/.test(basename(f))));
  const inFolder = all.filter((f) => rel(f).split('/').slice(0, -1).some((d) => /^components?$/i.test(d)));
  const files = inFolder.length ? inFolder : all.filter((f) => !rel(f).split('/').slice(0, -1).some((d) => /^(views?|pages?|layouts?|screens?|routes?|router)$/i.test(d)) && !/^App\./.test(basename(f)));
  const out = [], seen = new Set();
  for (const f of files.sort()) {
    const cls = rootClassOf(f, read(f));
    const name = basename(f).replace(/\.[^.]+$/, '');
    if (!cls || name === 'index' || seen.has(name)) continue;
    seen.add(name);
    out.push({ name, file: rel(f), cls });
  }
  return out;
}

// A cached text reader (one read per file per run).
export function textReader() {
  const cache = new Map();
  return (f) => { if (!cache.has(f)) { try { cache.set(f, readFileSync(f, 'utf8')); } catch { cache.set(f, ''); } } return cache.get(f); };
}

// ── Which file is component X ─────────────────────────────────────────────────
export function declaredNames(text) {
  const out = [];
  for (const m of text.matchAll(/\bname\s*:\s*['"`]([A-Za-z0-9_-]+)['"`]/g)) out.push(m[1]);          // Vue options / defineOptions
  for (const m of text.matchAll(/(?:function|class)\s+([A-Z][\w$]*)/g)) out.push(m[1]);                // React fn/class
  for (const m of text.matchAll(/(?:const|let|var)\s+([A-Z][\w$]*)\s*=\s*(?:styled|React|forwardRef|memo|\()/g)) out.push(m[1]);
  return out;
}

// 1) explicit componentFiles map  2) declared by a standard file (Storybook, docgen, Custom Elements Manifest, Code
// Connect - `declared`)  3) the shared pairing (component-pairing.mjs: the file's name, the name it declares, its root
// class, its folder and file, the only file with its selector, or two weaker signs that agree). Returns { file, how }:
// file null when nothing pairs, or only a proposal does (how says which file, to confirm or pin), or it is ambiguous.
// `pairing` is the caller's pairing; without one, one is read for the caller's file list, once.
const PAIRINGS = new WeakMap();   // the caller's file list → { pairing, inFiles }
export function resolveComponentFile(name, { ROOT, cfg = {}, files, read, classFor, declared = {}, pairing = null }) {
  const map = cfg.componentFiles ?? {};
  const pinned = [map[name] ?? []].flat().find((p) => typeof p === 'string' && p);
  if (pinned) {
    const p = join(ROOT, pinned);
    return existsSync(p) ? { file: p, how: 'componentFiles' } : { file: null, how: 'componentFiles(missing)' };
  }
  const d = declared[name];
  if (d?.file && existsSync(d.file)) return { file: d.file, how: d.how };
  let entry = files ? PAIRINGS.get(files) : null;
  if (!entry || (pairing && entry.pairing !== pairing)) {
    const pr = pairing ?? createPairing({ ROOT, cfg, files: [...componentSourceFiles(ROOT, cfg), ...(files ?? [])], read: read ?? textReader() });
    entry = { pairing: pr, inFiles: files ? new Set(files.map((f) => resolve(f))) : null };
    if (files) PAIRINGS.set(files, entry);
  }
  const p = entry.pairing.pairOf(name, classFor ? classFor(name) : undefined);
  if (!p.file) return { file: null, how: p.how };
  // A caller that reads only some of the files (the Vue ones) gets the pair only when it is one of them.
  if (entry.inFiles && !entry.inFiles.has(resolve(p.file))) return { file: null, how: `paired with ${relative(ROOT, p.file).replace(/\\/g, '/')}, not among the files read here` };
  return { file: p.file, how: p.how };
}

// ── Props (text patterns) ─────────────────────────────────────────────────────
// Union of everything found; over-collecting a few names is fine (only unmatched Figma
// properties fail, and extra code props are advisory).
// The text with its comments blanked and the brackets and commas inside its strings blanked, every character kept in
// place: a comment before a key (/* why */ name: String) or a '}' in a default no longer hides a key or ends an object.
export function maskCode(text) {
  const t = String(text), out = t.split('');
  for (let i = 0; i < t.length; i++) {
    const ch = t[i], nx = t[i + 1];
    if (ch === '/' && nx === '*') { const end = t.indexOf('*/', i + 2); const stop = end < 0 ? t.length : end + 2; for (let j = i; j < stop; j++) if (t[j] !== '\n') out[j] = ' '; i = stop - 1; }
    else if (ch === '/' && nx === '/' && t[i - 1] !== ':') { let j = i; for (; j < t.length && t[j] !== '\n'; j++) out[j] = ' '; i = j - 1; }
    else if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1;
      for (; j < t.length && t[j] !== ch; j++) { if (t[j] === '\\') { j++; continue; } if (ch !== '`' && t[j] === '\n') break; if ('{}[](),'.includes(t[j])) out[j] = ' '; }
      i = j;
    }
  }
  return out.join('');
}

// The keys of the object literal whose { is at `open`, at its own level only (nested objects skipped).
export function topKeys(text, open) {
  text = maskCode(text);
  const keys = [];
  let depth = 0, start = open + 1;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{' || ch === '[' || ch === '(') depth++;
    else if (ch === '}' || ch === ']' || ch === ')') { depth--; if (depth === 0) { const k = /^\s*['"`]?([A-Za-z_$][\w$]*)['"`]?\s*:/.exec(text.slice(start, i)); if (k) keys.push(k[1]); break; } }
    else if (ch === ',' && depth === 1) { const k = /^\s*['"`]?([A-Za-z_$][\w$]*)['"`]?\s*:/.exec(text.slice(start, i)); if (k) keys.push(k[1]); start = i + 1; }
  }
  return keys;
}
function idsFromDestructure(block) {
  const out = [];
  // The terminator is looked at, not consumed: `{ a, b }` must leave the comma before b for b's own match.
  for (const m of block.matchAll(/(?:^|[,{])\s*([A-Za-z_$][\w$]*)\s*(?=:|=|,|\}|$)/g)) {
    if (m[1] && m[1] !== 'props') out.push(m[1]);
  }
  return out;
}
export function extractVue(text) {
  const names = new Set();
  // defineProps<{ ... }>()
  for (const m of text.matchAll(/defineProps\s*<\s*\{([\s\S]*?)\}\s*>\s*\(/g))
    for (const p of m[1].matchAll(/([A-Za-z_$][\w$]*)\s*[?:]/g)) names.add(p[1]);
  // defineProps({ ... })  and options  props: { ... }: the object's own keys, not the keys inside a prop's options
  // ({ value: { type: String, required: true } } is the prop value alone)
  for (const m of text.matchAll(/(?:defineProps\s*\(|[^.\w]props\s*:)\s*\{/g)) for (const k of topKeys(text, m.index + m[0].length - 1)) names.add(k);
  // defineProps([ 'a', 'b' ])  and options  props: [ 'a', 'b' ]
  for (const m of text.matchAll(/(?:defineProps\s*\(|[^.\w]props\s*:)\s*\[([\s\S]*?)\]/g))
    for (const p of m[1].matchAll(/['"`]([A-Za-z_$][\w$]*)['"`]/g)) names.add(p[1]);
  return names;
}
export function extractReact(text) {
  const names = new Set();
  // interface XProps { ... }  /  type XProps = { ... }
  for (const m of text.matchAll(/(?:interface|type)\s+\w*Props\b[^{]*\{([\s\S]*?)\}/g))
    for (const p of m[1].matchAll(/([A-Za-z_$][\w$]*)\s*[?:]/g)) names.add(p[1]);
  // destructured function params: function C({ a, b }  /  const C = ({ a, b }
  for (const m of text.matchAll(/(?:function\s+[A-Z][\w$]*|(?:const|let|var)\s+[A-Z][\w$]*\s*=)\s*(?:function\s*)?\(\s*\{([\s\S]*?)\}/g))
    for (const id of idsFromDestructure(m[1])) names.add(id);
  // C.propTypes = { a: ..., b: ... }
  for (const m of text.matchAll(/\.propTypes\s*=\s*\{([\s\S]*?)\}/g))
    for (const p of m[1].matchAll(/(?:^|[,{])\s*([A-Za-z_$][\w$]*)\s*:/g)) names.add(p[1]);
  return names;
}
export function extractSvelte(text) {
  const names = new Set();
  for (const m of text.matchAll(/export\s+let\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  return names;
}
const PROP_EXTRACTORS = {
  '.vue': extractVue,
  '.svelte': extractSvelte,
  '.tsx': extractReact, '.jsx': extractReact, '.ts': extractReact, '.js': extractReact,
};
export function extractProps(file, text) {
  const fn = PROP_EXTRACTORS[extname(file)];
  return fn ? fn(text) : new Set();
}

const _LIT = `(['"\`][^'"\`]*['"\`]|true|false|-?\\d+(?:\\.\\d+)?)`;
const _unq = (s) => String(s).replace(/^['"`]|['"`]$/g, '').trim();
// Best-effort: code prop -> default value (normalised prop name -> literal string).
// Covers React default params & defaultProps, Vue withDefaults / defineProps({default}).
export function extractDefaults(text) {
  const out = new Map();
  // A number or true/false written without quotes is that value, whatever else the prop may take (3000, not "3000").
  const put = (name, val) => { if (!name) return; const v = String(val).trim(); out.set(norm(name), /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v === 'true' ? true : v === 'false' ? false : _unq(val)); };
  for (const m of text.matchAll(new RegExp(`([A-Za-z_$][\\w$]*)\\s*=\\s*${_LIT}`, 'g'))) put(m[1], m[2]);   // ({ a = 'x' })
  for (const m of text.matchAll(/withDefaults\s*\([\s\S]*?,\s*\{([\s\S]*?)\}\s*\)/g))
    for (const p of m[1].matchAll(new RegExp(`([A-Za-z_$][\\w$]*)\\s*:\\s*${_LIT}`, 'g'))) put(p[1], p[2]);
  for (const m of text.matchAll(new RegExp(`([A-Za-z_$][\\w$]*)\\s*:\\s*\\{[^{}]*\\bdefault\\s*:\\s*${_LIT}`, 'g'))) put(m[1], m[2]);
  for (const m of text.matchAll(/defaultProps\s*=\s*\{([\s\S]*?)\}/g))
    for (const p of m[1].matchAll(new RegExp(`([A-Za-z_$][\\w$]*)\\s*:\\s*${_LIT}`, 'g'))) put(p[1], p[2]);
  return out;
}
// A Vue prop's type as its definition writes it (label: String, size: { type: String }, value: [String, Number]):
// code prop -> 'string' | 'boolean' | 'number' | 'object' | 'array' | 'function', joined with | when it takes several.
const VUE_TYPES = { String: 'string', Boolean: 'boolean', Number: 'number', Object: 'object', Array: 'array', Function: 'function', Date: 'date' };
export function extractTypes(text) {
  const out = new Map(), names = Object.keys(VUE_TYPES).join('|');
  const say = (list) => [...new Set(list.map((t) => VUE_TYPES[t]))].join(' | ');
  for (const m of String(text).matchAll(new RegExp(`([A-Za-z_$][\\w$]*)\\s*:\\s*(?:\\{[^{}]*?\\btype\\s*:\\s*)?(\\[\\s*(?:${names})(?:\\s*,\\s*(?:${names}))*\\s*\\]|(?:${names}))(?![\\w$])`, 'g'))) {
    if (!out.has(norm(m[1]))) out.set(norm(m[1]), say(m[2].match(new RegExp(names, 'g'))));
  }
  // A TypeScript prop (label?: string, size: 'm' | 'l'): its type as written, the plain ones only.
  for (const m of String(text).matchAll(/([A-Za-z_$][\w$]*)\s*\??\s*:\s*(string|boolean|number)\b\s*[;,\n}]/g)) if (!out.has(norm(m[1]))) out.set(norm(m[1]), m[2]);
  return out;
}
// What the component's own comment says of each prop (@size {String} the button's size, can be [s, m(default), l]):
// its type, the values it lists and the one marked default. code prop -> { type?, options?, default? }.
export function extractDocumented(text) {
  const out = new Map();
  // @size {String} what it does, can be [s, m (default), l]   ·   @value {String, Number} …   ·   [a, b or c]
  for (const m of String(text).matchAll(/@([A-Za-z_$][\w$]*)\s*\{([A-Za-z|,\s]+)\}([^\n]*)/g)) {
    const e = {}, t = m[2].trim().toLowerCase().split(/\s*[|,]\s*/).filter((x) => /^(string|boolean|number|object|array|function|date)$/.test(x));
    if (t.length) e.type = t.join(' | ');
    // What it is for, as written: the line without its list of values and the words that introduce it.
    const shape = /object|array|function/.test(e.type ?? '');   // its brackets describe a shape: kept in its words
    const desc = m[3].replace(/\*\/.*$/, '').replace(shape ? /(?!)/ : /\[[^\]]*\]/g, '').replace(/[,;:]?\s*(?:it\s+)?(?:can|could|may)\s+be\s*:?\s*$/i, '').replace(/^\s*[-–—:]\s*/, '').replace(/\s+/g, ' ').trim();
    if (desc) e.description = desc;
    // A list of values belongs to a value a prop takes (a string, a number), never to the shape an object or a list
    // is described with ({ type: [min, max] }).
    const list = shape ? null : /\[([^\]]+)\]/.exec(m[3])?.[1];
    if (list) {
      const items = list.split(/,|\s+(?:or|and)\s+/).map((x) => x.trim()).filter(Boolean);
      const opts = items.map((x) => x.replace(/\s*\(default\)\s*$/i, '').replace(/^['"`]|['"`]$/g, ''));
      if (opts.length >= 2 && opts.every((o) => /^[\w.-]+$/.test(o))) e.options = opts;
      const def = items.findIndex((x) => /\(default\)\s*$/i.test(x));
      if (def >= 0 && e.options) e.default = e.options[def];
    }
    if (Object.keys(e).length && !out.has(norm(m[1]))) out.set(norm(m[1]), e);
  }
  return out;
}
// A default the code builds (an object, a list, a function returning one) as its own words: code prop -> the expression
// ({ neutral: [0, 40] }), from a Vue props object. A plain literal is extractDefaults' (those are values, these are code).
export function extractDefaultExpressions(text) {
  const out = new Map(), t = String(text), masked = maskCode(t);
  const closeOf = (open) => { let d = 0; for (let i = open; i < masked.length; i++) { const ch = masked[i]; if ('{[('.includes(ch)) d++; else if ('}])'.includes(ch) && --d === 0) return i; } return -1; };
  for (const m of masked.matchAll(/(?:defineProps\s*\(|[^.\w]props\s*:)\s*\{/g)) {
    const open = m.index + m[0].length - 1, end = closeOf(open);
    if (end < 0) continue;
    let depth = 0;
    for (let i = open + 1; i < end; i++) {
      const ch = masked[i];
      if ('{[('.includes(ch)) depth++; else if ('}])'.includes(ch)) depth--;
      if (depth !== 0) continue;
      const k = /^\s*,?\s*([A-Za-z_$][\w$]*)\s*:\s*\{/.exec(masked.slice(i, i + 200));
      if (!k || (i > open + 1 && !/[,{\s]/.test(masked[i]))) continue;
      const objOpen = i + k[0].length - 1, objEnd = closeOf(objOpen);
      if (objEnd < 0) continue;
      const body = masked.slice(objOpen, objEnd);
      const d = /[{,]\s*default\s*:\s*/.exec(body);
      if (d) {
        const from = objOpen + d.index + d[0].length;
        let j = from, dd = 0;
        for (; j < objEnd; j++) { const ch = masked[j]; if ('{[('.includes(ch)) dd++; else if ('}])'.includes(ch)) dd--; else if (ch === ',' && dd === 0) break; }
        const expr = t.slice(from, j).replace(/\s+/g, ' ').trim();
        if (expr && !/^(['"`][^'"`]*['"`]|true|false|null|-?\d+(\.\d+)?)$/.test(expr)) out.set(norm(k[1]), expr.length > 200 ? expr.slice(0, 199) + '…' : expr);
      }
      i = objEnd;
    }
  }
  return out;
}
// Best-effort: code prop -> the set of string-literal options it accepts, from a TS
// union type (`size?: 'small' | 'medium' | 'large'`). Used to check variant coverage.
export function extractOptions(text) {
  const out = new Map();
  for (const m of text.matchAll(/([A-Za-z_$][\w$]*)\s*\??\s*:\s*((?:['"`][^'"`]*['"`]\s*\|\s*)+['"`][^'"`]*['"`])/g)) {
    const opts = [...m[2].matchAll(/['"`]([^'"`]*)['"`]/g)].map((x) => x[1]);   // as written: parity on a value is its exact name
    if (opts.length >= 2) out.set(norm(m[1]), new Set(opts));
  }
  return out;
}
// A Figma INSTANCE_SWAP property is a SLOT, not a value prop - it maps to a code slot (Vue
// <slot>, React children/ReactNode). Best-effort detection of the code's slots.
// Slot names are kept as written (a name's parity is its exact spelling), one per normalised name.
export function extractSlots(text) {
  const byKey = new Map();
  const named = { add: (n) => { if (!byKey.has(norm(n))) byKey.set(norm(n), n); } };
  let hasDefault = false;
  // Vue: each <slot> tag is named (name="x"), named by an expression (:name="`row-${id}`", kept as written), or the
  // default one; a file can have both.
  for (const m of text.matchAll(/<slot\b([^>]*)>/g)) {
    const attrs = m[1];
    const fixed = /(?:^|\s)name\s*=\s*(['"])([^'"]+)\1/.exec(attrs);
    const bound = /(?:^|\s)(?::|v-bind:)name\s*=\s*"([^"]+)"/.exec(attrs);
    if (fixed) named.add(fixed[2]);
    else if (bound) named.add(bound[1].trim().replace(/^[`']|[`']$/g, ''));
    else hasDefault = true;
  }
  for (const m of text.matchAll(/defineSlots\s*<\s*\{([\s\S]*?)\}/g))
    for (const p of m[1].matchAll(/([A-Za-z_$][\w$]*)\s*[?:]/g)) named.add(p[1]);                        // Vue defineSlots
  // React children: children read on its own or as props.children, never the word in a Vue file or as a member of
  // data (item.children).
  if (!/<template[\s>]/.test(text) && /(?<![.\w$])children\b|\bprops\.children\b/.test(text)) hasDefault = true;
  for (const m of text.matchAll(/([A-Za-z_$][\w$]*)\s*\??\s*:\s*React\.?ReactNode/g)) named.add(m[1]);     // React ReactNode props as slots
  return { named: new Set(byKey.values()), hasDefault };
}

// Best-effort: which props the code says must be given (normalised name -> true, or false when it says optional).
// A TS member without "?" (interface XProps, type XProps, defineProps<{…}>), a Vue prop with required: true, a
// PropTypes entry ending in .isRequired. Unstated props are left out: the page never guesses that one is required.
export function extractRequired(text) {
  const out = new Map();
  const blocks = [...text.matchAll(/(?:interface|type)\s+\w*Props\b[^{]*\{([\s\S]*?)\}/g), ...text.matchAll(/defineProps\s*<\s*\{([\s\S]*?)\}\s*>\s*\(/g)];
  for (const m of blocks) for (const p of m[1].matchAll(/(?:^|[;,{\n])\s*(?:readonly\s+)?([A-Za-z_$][\w$]*)\s*(\?)?\s*:/g)) out.set(norm(p[1]), !p[2]);
  for (const m of text.matchAll(/([A-Za-z_$][\w$]*)\s*:\s*\{[^{}]*\brequired\s*:\s*(true|false)/g)) out.set(norm(m[1]), m[2] === 'true');
  for (const m of text.matchAll(/([A-Za-z_$][\w$]*)\s*:\s*PropTypes\.[\w.()'"`\[\], ]*?\.isRequired\b/g)) out.set(norm(m[1]), true);
  return out;
}
// What each event carries, as the code passes it: emit('changed', option.id) → { changed: ['option.id'] }. An event sent
// with nothing is left out; one sent with different arguments in different places keeps each, once.
export function extractEventPayloads(text) {
  const out = {};
  const src = String(text);
  for (const m of src.matchAll(/(?:^|[^\w$.])\$?emit\s*\(\s*['"`]([\w:-]+)['"`]\s*,\s*/g)) {
    let i = m.index + m[0].length, depth = 0, arg = '';
    for (; i < src.length; i++) {
      const c = src[i];
      if ('([{'.includes(c)) depth++;
      else if (')]}'.includes(c)) { if (!depth) break; depth--; }
      else if (c === ',' && !depth) break;
      arg += c;
    }
    const a = arg.trim().replace(/\s+/g, ' ');
    if (a && !(out[m[1]] ??= []).includes(a)) out[m[1]].push(a);
  }
  for (const k of Object.keys(out)) if (!out[k].length) delete out[k];
  return out;
}
// What a scoped slot hands its content: <slot name="row" :item="row" :index="i"> → { row: ['item', 'index'] }
// (the default slot as `default`).
export function extractSlotProps(text) {
  const out = {};
  for (const m of String(text).matchAll(/<slot\b([^>]*)>/g)) {
    const attrs = m[1];
    const name = /(?:^|\s)name\s*=\s*['"]([\w-]+)['"]/.exec(attrs)?.[1] ?? (/(?::|v-bind:)name\s*=/.test(attrs) ? null : 'default');
    if (!name) continue;
    const props = [...attrs.matchAll(/(?:^|\s)(?::|v-bind:)([\w-]+)\s*=/g)].map((x) => x[1]).filter((x) => x !== 'name');
    if (props.length) out[name] = [...new Set([...(out[name] ?? []), ...props])];
  }
  return out;
}
// Best-effort: the events a component sends, in the order the code first names them. Vue: defineEmits([…]),
// defineEmits<{ (e: 'x', …): void }>() or <{ x: […] }>(), options emits: […], emit('x') and $emit('x'); Svelte:
// dispatch('x'); React and the rest: a prop named on + a capital (onChange), the callback a parent passes in.
export function extractEvents(file, text, propNames = []) {
  const out = new Map();
  const add = (n) => { if (n && !out.has(norm(n))) out.set(norm(n), n); };
  for (const m of text.matchAll(/(?:defineEmits\s*\(|[^.\w]emits\s*:)\s*\[([\s\S]*?)\]/g)) for (const q of m[1].matchAll(/['"`]([\w:-]+)['"`]/g)) add(q[1]);
  for (const m of text.matchAll(/defineEmits\s*<\s*\{([\s\S]*?)\}\s*>\s*\(/g)) {
    for (const q of m[1].matchAll(/\(\s*\w+\s*:\s*['"`]([\w:-]+)['"`]/g)) add(q[1]);
    for (const q of m[1].matchAll(/(?:^|[;,{\n])\s*['"`]?([\w:-]+)['"`]?\s*:\s*\[/g)) add(q[1]);
  }
  for (const m of text.matchAll(/(?:^|[^\w$.])\$?emit\s*\(\s*['"`]([\w:-]+)['"`]/g)) add(m[1]);
  if (/\.svelte$/.test(file)) for (const m of text.matchAll(/\bdispatch\s*\(\s*['"`]([\w:-]+)['"`]/g)) add(m[1]);
  if (!/\.(vue|svelte)$/.test(file)) for (const p of propNames) if (/^on[A-Z]\w*$/.test(p)) add(p);
  return [...out.values()];
}

// The text reading of one component file, in the shape component-api.mjs merges.
//   { props: { name: { default?, options?, required? } }, slots: { named: [...], default: bool }, events: [names] }
export function textComponentApi(file, text) {
  // A Vue file's props are read from its scripts only: its template's bindings (:icon="icon") are never a default.
  const code = /\.vue$/i.test(String(file)) ? [...String(text).matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join('\n') || text : text;
  const defaults = extractDefaults(code), options = extractOptions(code), required = extractRequired(code), types = extractTypes(code), documented = extractDocumented(code), built = extractDefaultExpressions(code);
  const props = {};
  for (const p of extractProps(file, text)) {
    const e = {}, doc = documented.get(norm(p));
    if (defaults.has(norm(p))) e.default = defaults.get(norm(p));
    else if (doc?.default != null) e.default = doc.default;
    if (options.has(norm(p))) e.options = [...options.get(norm(p))];
    else if (doc?.options) e.options = doc.options;
    const type = types.get(norm(p)) ?? doc?.type;
    if (type) e.type = type;
    if (required.has(norm(p))) e.required = required.get(norm(p));
    if (doc?.description) e.description = doc.description;
    if (e.default === undefined && built.has(norm(p))) e.defaultExpression = built.get(norm(p));
    props[p] = e;
  }
  const s = extractSlots(text);
  return { props, slots: { named: [...s.named], default: s.hasDefault }, events: extractEvents(file, text, Object.keys(props)) };
}

// ── Nesting (text patterns) ───────────────────────────────────────────────────
// Which DS components does a text use? A sub-component is "used" when its base selector, or its
// name as a JSX tag / import, appears. `universe` = [{ name, selNorm }].
export function usedComponents(text, universe) {
  const tn = norm(text);
  const used = new Set();
  for (const u of universe) {
    if (u.selNorm.length >= 4 && tn.includes(u.selNorm)) { used.add(u.name); continue; }
    // Its name as a JSX tag or an import, as Figma writes it or capitalised as a component is (button → <Button>).
    const names = [...new Set([u.name, u.name.charAt(0).toUpperCase() + u.name.slice(1)])];
    if (names.some((n) => new RegExp(`<${esc(n)}\\b|\\b${esc(n)}\\b\\s*(?:from|,|})`).test(text))) used.add(u.name);   // JSX tag / import
  }
  return used;
}

// component-pairing.mjs - the ONE answer to "which code file is Figma component X".
//
// Every place that needs a component's own file asks here, so they all agree: the file finder every gate and the
// code capture use (component-source.mjs resolveComponentFile), the class the component finder takes from the code
// (component-locator.mjs), the components only the code has (the style guide, the audit, the router) and the scoped
// audit's "whose source is this file". A project needs no hand-written map: ds-config.json → componentFiles pins a
// pair by hand when the signs below are not enough, and it always wins.
//
// The signs, for one Figma component and one code file:
//   strong - the name itself, written in the code; one pairs on its own, as it always has:
//     name      the file is named after it, in any spelling (Button.vue, button-primary.tsx)
//     declares  the file declares a component of that name (name: 'buttonPrimary', function ButtonPrimary)
//     class     its first element's class is the name in any spelling (.button-primary)
//     folder    its folder and its file spell it (buttons/Secondary.vue is buttonSecondary; index is the folder)
//     selector  it is the only file that holds the component's selector
//   weak - two that agree pair it; one alone is a proposal, listed to confirm or pin, never applied:
//     generic   a generic file name stands for its folder: switches/General.vue is switch (also Default, Base, Main,
//               the only file in its folder, and folder/Primary.vue when Figma has no <folder>Primary)
//     prefix    the name after the library's short prefix (HbBadge.vue, .hb-badge)
//     tokens    the CSS variables the file writes or uses are mostly that component's tokens, read through the
//               variables snapshot and the project's naming convention (var(--advanced-tooltip-…) is tooltip's)
//     state     the name without a state word: tooltipOpen and tooltipClosed are both Tooltip.vue
//   backing - counts beside another sign, never alone:
//     props     its props hold Figma's properties for the component (at least two, two thirds of them)
// (A file that holds the selector as other files do says nothing: a page that uses the component holds it too.)
// A file the name itself pairs with another component (or componentFiles pins to it) is not offered on weak signs
// alone, except to a component that differs from that one only by a state word. A component with no sign at all is
// only in Figma, and the files whose names come nearest are named.
//
// Pure apart from the file reads (once per file, through the caller's reader); no network, no browser.

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve, relative, dirname, extname, basename } from 'node:path';
import { componentSourceFiles, textReader, declaredNames, extractProps, codeComponents } from './component-source.mjs';
import { resolveNamingSpec, tokenToVar } from './naming-convention.mjs';
import { cleanFigmaProp } from './figma-props.mjs';

export const squash = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
// A name's words, however it is written: "buttonPrimary", "button-primary", "VButton" → ['button', 'primary'], ['v', 'button'].
export const words = (s) => String(s ?? '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

// A file name that stands for the component its folder names, not for a variant of it.
export const GENERIC_FILE_NAMES = new Set(['general', 'default', 'base', 'main']);
// Folders that hold many components rather than naming one.
const CONTAINERS = new Set(['src', 'source', 'lib', 'components', 'component', 'ui', 'app', 'apps', 'packages', 'package', 'library', 'libraries', 'shared', 'common', 'core', 'elements', 'atoms', 'molecules', 'organisms', 'widgets', 'views', 'view', 'pages', 'page', 'layouts', 'layout', 'screens', 'routes', 'base', 'misc', 'modules', 'features', 'vue', 'react', 'js', 'ts', 'internal', 'parts', 'blocks']);
// State words two Figma components can differ by while one code component builds both.
export const PAIRED_STATES = new Set(['open', 'opened', 'closed', 'close', 'on', 'off', 'expanded', 'collapsed', 'active', 'inactive', 'enabled', 'disabled', 'checked', 'unchecked', 'selected', 'unselected', 'shown', 'hidden', 'visible', 'invisible', 'show', 'hide', 'filled', 'empty']);

// The name without its state word, squashed: tooltipOpen → "tooltip", closedPanel → "panel"; null when it has none.
export function stateBase(name) {
  const w = words(name);
  if (w.length < 2) return null;
  const base = PAIRED_STATES.has(w.at(-1)) ? w.slice(0, -1) : PAIRED_STATES.has(w[0]) ? w.slice(1) : null;
  const b = base ? base.join('') : '';
  return b.length >= 3 ? b : null;
}
// Two names that differ only by a state word (tooltipOpen and tooltipClosed, tooltip and tooltipOpen).
export function stateSiblings(a, b) {
  const sa = squash(a), sb = squash(b);
  if (!sa || sa === sb) return false;
  const ba = stateBase(a), bb = stateBase(b);
  return ba === sb || bb === sa || (!!ba && ba === bb);
}

// A folder's name as written and as one of its components: switches → switch, buttons → button, categories → category.
export function folderForms(folder) {
  const f = squash(folder);
  const out = new Set(f ? [f] : []);
  if (f.length > 3 && f.endsWith('s')) out.add(f.slice(0, -1));
  if (f.length > 4 && /(ch|sh|ss|us|x|z)es$/.test(f)) out.add(f.slice(0, -2));
  if (f.length > 4 && f.endsWith('ies')) out.add(f.slice(0, -3) + 'y');
  return [...out];
}

const COMPONENT_EXT = /\.(vue|svelte|jsx|tsx)$/i;
const isComponentFile = (f) => COMPONENT_EXT.test(f) || (/\.(js|ts)$/i.test(f) && /^[A-Z]/.test(basename(f)));
const validClass = (c) => /^-?[A-Za-z_][\w-]*$/.test(c);

// The classes a component file gives its first element: every static class, else the first string of a bound :class
// (a Vue or Svelte template), or a React file's first className.
export function rootClasses(file, text) {
  const ext = extname(file).toLowerCase();
  const t = String(text ?? '').replace(/<!--[\s\S]*?-->/g, '');
  if (ext === '.vue' || ext === '.svelte') {
    const tpl = ext === '.vue' ? (/<template[^>]*>([\s\S]*)<\/template>/.exec(t)?.[1] ?? '') : t.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '');
    const attrs = /<[A-Za-z][\w-]*\b([^>]*)>/.exec(tpl)?.[1];
    if (attrs == null) return [];
    const value = (re) => { const m = re.exec(attrs); return m ? m[1] ?? m[2] : null; };
    const own = (value(/(?:^|\s)class\s*=\s*(?:"([^"]*)"|'([^']*)')/) ?? '').split(/\s+/).filter(validClass);
    if (own.length) return own;
    const bound = value(/(?:^|\s)(?::|v-bind:)class\s*=\s*(?:"([^"]*)"|'([^']*)')/);
    const first = bound ? /['"`]([A-Za-z_-][\w-]*)/.exec(bound.replace(/\{[^}]*\}/g, ' '))?.[1] : null;
    return first && validClass(first) ? [first] : [];
  }
  if (ext === '.jsx' || ext === '.tsx') {
    const c = /\bclassName\s*=\s*(?:["']([^"']+)["']|\{\s*["'`]([^"'`$]+)["'`]\s*\})/.exec(t)?.slice(1).find(Boolean);
    return String(c ?? '').split(/\s+/).filter(validClass);
  }
  return [];
}
// Every static class the file's markup writes (class="…", className="…").
const markupClasses = (text) => [...String(text ?? '').matchAll(/\bclass(?:Name)?\s*=\s*["']([^"']+)["']/g)].flatMap((m) => m[1].split(/\s+/)).filter(validClass);

// The CSS a component file writes or uses: the file itself (a Vue or Svelte file's own <style>), and for a React file
// the local stylesheets it imports or keeps beside it under its own name.
function cssOf(file, text, read) {
  let css = String(text ?? '');
  if (/\.(jsx|tsx|js|ts)$/i.test(file)) {
    const sheets = new Set();
    for (const m of css.matchAll(/(?:import\s+(?:[\w*{}\s,]+\s+from\s+)?|require\(\s*)['"](\.{1,2}\/[^'"]+\.(?:css|scss|sass|less))['"]/g)) sheets.add(resolve(dirname(file), m[1]));
    const stem = file.replace(/\.[^.]+$/, '');
    for (const ext of ['.css', '.scss', '.module.css', '.module.scss']) if (existsSync(stem + ext)) sheets.add(stem + ext);
    for (const s of sheets) css += '\n' + String(read(s) ?? '');
  }
  return css;
}

// The token names the variables snapshot holds (every collection, every mode), each a path with a slash.
export function snapshotTokenNames(vars = {}) {
  const out = new Set();
  const take = (obj, depth) => {
    if (!obj || typeof obj !== 'object' || depth > 2) return;
    for (const [k, v] of Object.entries(obj)) {
      if (k.startsWith('_')) continue;
      if (v && typeof v === 'object' && !('value' in v) && !k.includes('/')) take(v, depth + 1);
      else if (k.includes('/')) out.add(k);
    }
  };
  for (const [cat, v] of Object.entries(vars ?? {})) if (!cat.startsWith('_') && !['aliases', 'primitives'].includes(cat)) take(v, 0);
  return [...out];
}

// What Figma has, read from the project's snapshots: the component names (structure, props, and the ones componentFiles
// pins), their properties, what each one's layers bind, and the variables.
export function figmaFacts(ROOT, cfg = {}) {
  const readJ = (p) => { try { return JSON.parse(readFileSync(resolve(ROOT, p), 'utf8')); } catch { return null; } };
  const varsPath = cfg.paths?.snapshotVars ?? 'src/figma-vars.snapshot.json';
  const structure = readJ(cfg.paths?.snapshotStructure ?? 'src/figma-structure.snapshot.json')?.components ?? {};
  const props = readJ(cfg.paths?.compPropsSnapshot ?? varsPath.replace(/[^/\\]+$/, 'figma-component-props.snapshot.json')) ?? {};
  const vars = readJ(varsPath) ?? {};
  const names = [...new Set([...Object.keys(structure), ...Object.keys(props), ...Object.keys(cfg.componentFiles ?? {})])].filter((n) => n && !/^[_$]/.test(n));
  return { names, structure, props, vars };
}

// Which Figma components each token belongs to: the one (or the state siblings) its path starts with, else the one or
// two whose layers bind it. → { byVar(cssVar) → Set(names) | null }
function tokenIndex(names, tokens, structure, spec) {
  const groups = new Map();   // squashed name, or name without its state word → the Figma names
  const put = (k, n) => { if (!k) return; if (!groups.has(k)) groups.set(k, new Set()); groups.get(k).add(n); };
  for (const n of names) { put(squash(n), n); put(stateBase(n), n); }
  const tokenSet = new Set(tokens), bound = new Map();
  const walk = (v, n, depth) => {
    if (depth > 6 || v == null) return;
    if (typeof v === 'string') { if (tokenSet.has(v)) { if (!bound.has(v)) bound.set(v, new Set()); bound.get(v).add(n); } return; }
    if (typeof v === 'object') for (const x of Object.values(v)) walk(x, n, depth + 1);
  };
  for (const [n, entry] of Object.entries(structure ?? {})) walk(entry, n, 0);
  const withTokens = new Set(), exact = new Map(), bySuffix = new Map();
  for (const t of tokens) {
    const segs = t.split('/');
    let owners = null;
    for (let k = Math.min(3, segs.length - 1); k >= 1 && !owners; k--) { const g = squash(segs.slice(0, k).join('')); if (groups.has(g)) { owners = groups.get(g); withTokens.add(g); } }
    if (!owners && bound.get(t)?.size <= 2) owners = bound.get(t);
    if (!owners) continue;
    for (const raw of [false, true]) {
      let v; try { v = tokenToVar(t, spec, { raw }); } catch { continue; }
      exact.set(v, owners);
      const body = v.startsWith(spec.prefix) ? v.slice(spec.prefix.length) : v.replace(/^--/, '');
      const last = body.split(/[-_]/).at(-1);
      if (/[-_]/.test(body)) { if (!bySuffix.has(last)) bySuffix.set(last, []); bySuffix.get(last).push([body, owners]); }
    }
  }
  const byVar = (v) => {
    if (exact.has(v)) return exact.get(v);
    const body = v.replace(/^--/, '');
    const segs = body.split(/[-_]+/).filter(Boolean);
    for (const [b, o] of bySuffix.get(segs.at(-1)) ?? []) if (body.endsWith('-' + b) || body.endsWith('_' + b)) return o;   // a prefix the code adds
    // The component's name inside the variable, after at most two words of prefix (--advanced-tooltip-bg is tooltip's),
    // when Figma has tokens under that name.
    for (let start = 0; start <= Math.min(2, segs.length - 2); start++) {
      for (let k = Math.min(3, segs.length - start - 1); k >= 1; k--) { const g = squash(segs.slice(start, start + k).join('')); if (withTokens.has(g)) return groups.get(g); }
    }
    return null;
  };
  return { byVar, any: exact.size > 0 };
}

const LABEL = {
  name: 'its file name', declares: 'the name it declares', class: 'its root class', folder: 'its folder and file name', selector: 'the only file with its selector',
  generic: 'a generic file name in its folder', prefix: 'its name after the library prefix', tokens: 'the tokens its CSS uses', state: 'its name without a state word',
  props: 'its props match Figma\'s', path: 'its folders and file name', root: 'its root class starts with its name',
  variant: 'its name and a style its props choose',
};
const STRONG = new Set(['name', 'declares', 'class', 'folder', 'selector', 'path', 'variant']);
// A name its file's path spells (path): the folders under the library's own and the file name, a folder in between left
// out, each folder as written or without its plural s (tableCell/amount is tables/body/cells/Amount.vue,
// gridHeadSorting is grids/head/Sorting.vue). The top folder and the file name are always in it.
export function pathSpells(k, segs) {
  if (!k || segs.length < 2) return false;
  const forms = (x) => (x.length > 3 && x.endsWith('s') ? [x, x.slice(0, -1)] : [x]);
  const go = (i, pos) => {
    if (i === segs.length) return pos === k.length;
    for (const f of forms(segs[i])) if (f && k.startsWith(f, pos) && go(i + 1, pos + f.length)) return true;
    return i > 0 && i < segs.length - 1 && go(i + 1, pos);
  };
  return go(0, 0);
}
// The library's own folder: the deepest folder that holds most (60%) of the component files a Figma component's name
// gives (src/components/library), the project's pages left out. A file outside it (the docs site's own components, a helper, a demo page, a mock, a
// route) uses or lists a component; it is never one. null with fewer than five such files, or none in common.
export function libraryHome(files, names, rel) {
  const hits = files.filter(isComponentFile).filter((f) => {
    const p = rel(f).split('/'), b = squash(basename(f).replace(/\.[^.]+$/, '')), d = squash(p.at(-2) ?? '');
    return names.has(b) || names.has(d + b) || (d.endsWith('s') && names.has(d.slice(0, -1) + b));
  }).map((f) => rel(f)).filter((r) => !r.startsWith('..') && !PAGE_DIR.test(r));   // a demo page named as the component it shows is not where it is made
  if (hits.length < 5) return null;
  let home = null;
  for (let depth = 1; depth <= 4; depth++) {
    const counts = new Map();
    for (const r of hits) { const p = r.split('/'); if (p.length > depth) { const k = p.slice(0, depth).join('/'); counts.set(k, (counts.get(k) ?? 0) + 1); } }
    const top = [...counts].sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] >= hits.length * 0.6) home = top[0]; else break;
  }
  return home;
}
// A file in a folder named as it is (search/Search.vue, Button/index.vue), the way a component is kept on its own.
const ownFolder = (f) => { const parts = String(f).split(/[\\/]/), base = (parts.at(-1) ?? '').replace(/\.\w+$/, '').toLowerCase(), dir = (parts.at(-2) ?? '').toLowerCase(); return base === dir || (base === 'index' && !!dir) ? 1 : 0; };
// The folders a project keeps its own pages in, where a component is used rather than made.
const PAGE_DIR = /(^|[\\/])(views|pages|stories|docs|examples?|playground|demo)[\\/]/i;
const WEAK = new Set(['generic', 'prefix', 'tokens', 'state', 'root']);
// The signs in plain words: "a generic file name in its folder and the tokens its CSS uses".
export const signsSaid = (signals = []) => { const w = signals.map((s) => LABEL[s] ?? s); return w.length > 1 ? `${w.slice(0, -1).join(', ')} and ${w.at(-1)}` : w[0] ?? ''; };

// How alike two squashed names are (0..1), by the letter pairs they share.
function likeness(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const pairs = (s) => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const p = s.slice(i, i + 2); m.set(p, (m.get(p) ?? 0) + 1); } return m; };
  const pa = pairs(a), pb = pairs(b);
  let both = 0;
  for (const [p, n] of pa) both += Math.min(n, pb.get(p) ?? 0);
  const total = Math.max(1, a.length - 1 + b.length - 1);
  return (2 * both) / total;
}

// createPairing({ ROOT, cfg, files, read, figma, selectorFor }) → the pairing every caller shares.
//   files        the code files to pair (default: componentSourceFiles(ROOT, cfg))
//   figma        figmaFacts(ROOT, cfg) (default: read from the project)
//   selectorFor  name → the component's selector, for the selector signs (default: componentSelectors, else the convention)
// → { pairOf(name), classOf(name), claimed(file), ownersOf(file), codeOnly(), summary(), names, home, inLibrary(file) }
//   home        the library's own folder (cfg.componentHome, else libraryHome), null when it cannot tell
//   inLibrary   whether a file is the library's (in home, or a sibling folder the config names)
//   pairOf(name) → { name, status, file, how, signals, candidates }
//     status  pinned · paired · proposed · ambiguous · none · missing (componentFiles names a file that is not there)
//     file    the file it is paired with (pinned or paired only; a proposal is never applied)
//     candidates  [{ file, signals }]: a proposal's files, an ambiguous pair's, or the nearest ones (status none)
export function createPairing({ ROOT, cfg = {}, files = null, read = textReader(), figma = null, selectorFor = null } = {}) {
  const fig = figma ?? figmaFacts(ROOT, cfg);
  const set = new Set(fig.names.map(squash));
  const found = [...new Set([...(files ?? componentSourceFiles(ROOT, cfg))].map((f) => resolve(f)))];
  const rel = (f) => relative(ROOT, f).replace(/\\/g, '/');
  // Only the library's own files are components (a sibling folder the config names is kept whole); a pinned file pairs
  // wherever it is (componentFiles).
  const home = cfg.componentHome ?? libraryHome(found, set, rel);
  const inHome = (f) => !home || rel(f).startsWith('..') || rel(f).startsWith(home + '/');
  const all = found.filter(inHome);
  const spec = resolveNamingSpec(cfg);
  let tokens = null;
  const tokenOwners = () => (tokens ??= tokenIndex(fig.names, snapshotTokenNames(fig.vars), fig.structure, spec));
  const isState = (k, v) => /^states?$/i.test(cleanFigmaProp(k)) || (v?.type === 'VARIANT' && (v.variantOptions ?? []).every((o) => /^(default|hover|focus|focused|active|pressed|disabled)$/i.test(o)));
  const figmaProps = (name) => Object.entries(fig.props?.[name]?.properties ?? {}).filter(([k, v]) => !isState(k, v)).map(([k]) => squash(cleanFigmaProp(k))).filter(Boolean);

  // The library's own short prefixes: the CSS variable prefix the naming convention sets (--hb-), and a first word of
  // three letters at most that most component files named in two words or more start with (HbButton, HbBadge).
  const prefixes = new Set();
  const varPrefix = squash(spec.prefix);
  if (varPrefix && varPrefix.length <= 4) prefixes.add(varPrefix);
  {
    const named = all.filter(isComponentFile).map((f) => words(basename(f).replace(/\.[^.]+$/, ''))).filter((w) => w.length > 1), firsts = new Map();
    for (const w of named) if (w[0].length <= 3) firsts.set(w[0], (firsts.get(w[0]) ?? 0) + 1);
    for (const [p, n] of firsts) if (n >= 2 && n * 2 >= named.length) prefixes.add(p);
  }
  const afterPrefix = (w) => (w.length > 1 && prefixes.has(w[0]) && w.slice(1).join('').length >= 3 ? w.slice(1).join('') : null);

  // What each file says about itself, read once.
  const perFolder = new Map();
  for (const f of all) if (isComponentFile(f)) perFolder.set(dirname(f), (perFolder.get(dirname(f)) ?? 0) + 1);
  const factsCache = new Map();
  const facts = (f) => {
    if (factsCache.has(f)) return factsCache.get(f);
    const text = String(read(f) ?? '');
    const base = basename(f).replace(/\.[^.]+$/, '');
    const parts = rel(f).split('/');
    // A file in a folder of its own name (inputs/search/Search.vue) takes its kind from the folder above (inputs).
    const ownDir = parts.length > 2 && squash(parts.at(-2)) === squash(base);
    const folder = parts.length > 1 ? parts.at(ownDir ? -3 : -2) : '';
    const like = isComponentFile(f);
    const x = {
      file: f, text, like, base, baseSq: squash(base), baseWords: words(base),
      forms: like && folder ? folderForms(folder) : [], container: CONTAINERS.has(squash(folder)) || !folder,
      alone: like && perFolder.get(dirname(f)) === 1,
      roots: like ? rootClasses(f, text) : [], declared: declaredNames(text).map(squash),
      segs: like ? (home && !rel(f).startsWith('..') ? rel(f).slice(home.length + 1) : rel(f)).replace(/\.[^./]+$/, '').split('/').map(squash).filter((v, i, a) => v && !(v === 'index' && i === a.length - 1)) : [],
      _sq: null, _props: null, _tokens: undefined,
    };
    factsCache.set(f, x);
    return x;
  };
  const textSq = (x) => (x._sq ??= squash(x.text));
  const propsOf = (x) => (x._props ??= new Set(x.like ? [...extractProps(x.file, x.text)].map(squash) : []));
  // The Figma components whose tokens the file uses most (ties kept: state siblings share their tokens).
  const tokenTop = (x) => {
    if (x._tokens !== undefined) return x._tokens;
    x._tokens = new Set();
    const idx = x.like ? tokenOwners() : null;
    if (!idx?.any) return x._tokens;
    const css = cssOf(x.file, x.text, read);
    const counts = new Map(); let total = 0;
    for (const m of css.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)|(?:^|[;{\s"'`])(--[A-Za-z0-9_-]+)\s*:/g)) {
      const o = idx.byVar(m[1] ?? m[2]);
      if (!o) continue;
      total++;
      for (const n of o) counts.set(n, (counts.get(n) ?? 0) + 1);
    }
    const max = Math.max(0, ...counts.values());
    if (max >= 2 && max * 2 >= total) for (const [n, c] of counts) if (c === max) x._tokens.add(n);
    return x._tokens;
  };

  // A Figma component that is one style of a code component (variant): its name the component's own (its folders and
  // file name, banners/Top.vue is bannerTop) and one more word, a style a prop or a value of that file chooses
  // (bannerTopSecondary: useSecondaryStyle). The default style's word (Primary, Default) counts when a sibling's does.
  const wordsOf = new Map(fig.names.map((n) => [squash(n), words(n).map(squash)]));
  const DEFAULT_STYLE = new Set(['primary', 'default', 'base', 'regular', 'standard', 'main']);
  const choosesStyle = (x, r) => r.length >= 3 && x.like && ([...propsOf(x)].some((q) => q !== r && q.includes(r)) || new RegExp(`['"\`]${r}['"\`]`, 'i').test(x.text));
  const styleOf = (k, x) => {
    const w = wordsOf.get(k);
    if (!w || w.length < 3 || !x.like || !x.forms.length) return null;
    const own = new Set(x.forms.map((fo) => (x.baseSq === 'index' ? fo : fo + x.baseSq)));
    const head = w.slice(0, -1).join(''), r = w.at(-1);
    return own.has(head) && !set.has(head) ? { head, r } : null;
  };
  const variantSign = (k, x) => {
    const v = styleOf(k, x);
    if (!v) return false;
    if (choosesStyle(x, v.r)) return true;
    return DEFAULT_STYLE.has(v.r) && fig.names.some((n) => { const o = styleOf(squash(n), x); return o && o.head === v.head && o.r !== v.r && choosesStyle(x, o.r); });
  };

  // The signs the name itself gives (name, declares, class, folder, generic, prefix), for a squashed name k.
  const nameSigns = (k, x) => {
    const s = [];
    if (!k) return s;
    if (x.baseSq === k) s.push('name');
    if (x.declared.includes(k)) s.push('declares');
    if (x.roots.some((c) => squash(c) === k)) s.push('class');
    if (x.forms.length) {
      if (x.forms.some((fo) => (x.baseSq === 'index' ? fo : fo + x.baseSq) === k)) s.push('folder');
      else if (!x.container && x.forms.includes(k) && (GENERIC_FILE_NAMES.has(x.baseSq) || x.alone || (x.baseSq === 'primary' && !x.forms.some((fo) => set.has(fo + 'primary'))))) s.push('generic');
    }
    if (afterPrefix(x.baseWords) === k || x.roots.some((c) => afterPrefix(words(c)) === k)) s.push('prefix');
    // A generic file name (Base.vue, General.vue) stands for the folders above it: tables/header/Base.vue is tableHeader.
    if (!s.some((v) => STRONG.has(v)) && (pathSpells(k, x.segs) || (x.segs.length > 2 && GENERIC_FILE_NAMES.has(x.segs.at(-1)) && pathSpells(k, x.segs.slice(0, -1))))) s.push('path');
    // Its first element's class starts with its name (.empty-state-container for emptyState): with a generic file name
    // in a folder of its name, two signs that agree.
    if (!s.includes('class') && k.length >= 4 && x.roots.some((c) => squash(c).startsWith(k) && squash(c) !== k)) s.push('root');
    if (!s.some((v) => STRONG.has(v)) && variantSign(k, x)) s.push('variant');
    return s;
  };

  const pinnedFile = (name) => {
    const p = [cfg.componentFiles?.[name] ?? []].flat().find((v) => typeof v === 'string' && v);
    return p ? join(ROOT, p) : null;
  };
  // Files the name itself (or componentFiles) gives to a Figma component: not offered to another on weak signs alone.
  let strongClaims = null;
  const claimsOf = () => {
    if (strongClaims) return strongClaims;
    strongClaims = new Map();
    const claim = (f, n) => { if (!strongClaims.has(f)) strongClaims.set(f, new Set()); strongClaims.get(f).add(n); };
    for (const n of fig.names) {
      const pin = pinnedFile(n);
      if (pin) { claim(resolve(pin), n); continue; }
      for (const f of all) if (nameSigns(squash(n), facts(f)).some((s) => STRONG.has(s))) claim(f, n);
    }
    return strongClaims;
  };
  const takenByAnother = (f, name) => [...(claimsOf().get(f) ?? [])].some((n) => squash(n) !== squash(name) && !stateSiblings(n, name));

  // The selector the selector signs look for: the caller's (its component finder's), else componentSelectors, else the
  // convention.
  const selectorOf = (name, given) => {
    const s = given ?? selectorFor?.(name) ?? cfg.componentSelectors?.[name] ?? '.' + String(name).charAt(0).toLowerCase() + String(name).slice(1);
    return squash(String(s ?? '').match(/[.#][\w-]+/)?.[0] ?? s);
  };

  const cache = new Map();
  // selector: the component's selector as the caller's finder gives it (its own, else the pairing's default).
  function pairOf(name, selector) {
    const key = `${name}\u0000${selector ?? ''}`;
    if (cache.has(key)) return cache.get(key);
    const done = (r) => { cache.set(key, r); return r; };
    const pin = pinnedFile(name);
    if (pin) return done(existsSync(pin) ? { name, status: 'pinned', file: pin, how: 'componentFiles', signals: ['componentFiles'], candidates: [] } : { name, status: 'missing', file: null, how: 'componentFiles(missing)', signals: [], candidates: [] });
    const k = squash(name), base = stateBase(name), props = figmaProps(name), sel = selectorOf(name, selector);
    const rows = [], mentions = [];
    for (const f of all) {
      const x = facts(f);
      const s = nameSigns(k, x);
      if (x.like && tokenTop(x).has(name)) s.push('tokens');
      if (base && x.like && nameSigns(base, x).length && !s.some((v) => STRONG.has(v))) s.push('state');
      if (props.length >= 2 && x.like) { const p = propsOf(x); if (props.filter((q) => p.has(q)).length * 3 >= props.length * 2) s.push('props'); }
      if (s.length) rows.push({ file: f, signals: s });
    }
    // Every file that holds its selector, the project's pages and docs among them: one that uses the component holds it too.
    if (sel.length >= 4) for (const f of found) if (textSq(facts(f)).includes(sel)) mentions.push(f);
    // The only file that holds its selector: as strong as its name (the file finder has always paired it so), unless the
    // name itself gives that file to another component.
    if (mentions.length === 1 && inHome(mentions[0]) && !takenByAnother(mentions[0], name)) {
      const r = rows.find((x) => x.file === mentions[0]);
      if (r) r.signals.push('selector'); else rows.push({ file: mentions[0], signals: ['selector'] });
    }
    // Its file name alone gives way to another component whose folders and file name spell it (buttons/Clock.vue is
    // buttonClock's, not clock's).
    const spelledByAnother = (f) => [...(claimsOf().get(f) ?? [])].some((n) => squash(n) !== k && nameSigns(squash(n), facts(f)).some((v) => v === 'folder' || v === 'path'));
    for (const r of rows) if (r.signals.includes('name') && !r.signals.some((v) => v !== 'name' && STRONG.has(v)) && spelledByAnother(r.file)) r.signals = r.signals.filter((v) => v !== 'name');
    for (let i = rows.length - 1; i >= 0; i--) if (!rows[i].signals.length) rows.splice(i, 1);
    const count = (r, kind) => r.signals.filter((v) => kind.has(v)).length;
    const BACK = new Set(['props']);
    for (const r of rows) { r.strong = count(r, STRONG); r.weak = count(r, WEAK); r.back = count(r, BACK); r.score = 3 * r.strong + 2 * r.weak + r.back; r.page = PAGE_DIR.test(rel(r.file)); r.own = ownFolder(r.file); }
    // Weak signs never take a file the name itself gives to another component.
    const fair = rows.filter((r) => r.strong || !takenByAnother(r.file, name));
    // A file of the project's own pages (src/views/…, a docs page that imports it and shows it) comes after the
    // component's own file, whatever its signs: it uses the component, it is not it.
    const eligible = fair.filter((r) => r.strong || (r.weak >= 1 && r.weak + r.back >= 2)).sort((a, b) => a.page - b.page || b.score - a.score || b.strong - a.strong || b.own - a.own);
    const said = (r) => ({ file: r.file, signals: r.signals });
    if (eligible.length) {
      const best = eligible[0], next = eligible[1];
      // Between two as good, the one in a folder of its own name (search/Search.vue) is the component's own.
      if (!next || (next.page && !best.page) || best.score > next.score || best.strong > next.strong || (best.own && !next.own)) return done({ name, status: 'paired', file: best.file, how: best.signals.join(' + '), signals: best.signals, candidates: [] });
      const tied = eligible.filter((r) => r.score === best.score && r.strong === best.strong);
      return done({ name, status: 'ambiguous', file: null, how: `ambiguous (${tied.length} files: ${tied.slice(0, 3).map((r) => rel(r.file)).join(', ')})`, signals: [], candidates: tied.map(said) });
    }
    // Tokens alone in several files are a surface those components share (cardFloat's in each date picker), never
    // which file is it.
    const proposals = fair.filter((r) => r.weak === 1 && !r.back).filter((r, i, all) => !(r.signals.length === 1 && r.signals[0] === 'tokens' && all.filter((q) => q.signals.length === 1 && q.signals[0] === 'tokens').length > 1));
    if (proposals.length) {
      const list = proposals.slice(0, 3);
      return done({ name, status: 'proposed', file: null, how: `proposed: ${list.map((r) => `${rel(r.file)} (${signsSaid(r.signals)})`).join(', ')}; confirm it, or pin it in componentFiles`, signals: [], candidates: list.map(said) });
    }
    // Only in Figma: the component files whose names come nearest, among those no other component has.
    const near = [];
    for (const f of all) {
      const x = facts(f);
      if (!x.like || claimsOf().has(f)) continue;
      const keys = [x.baseSq, ...x.forms.map((fo) => fo + (x.baseSq === 'index' ? '' : x.baseSq)), ...x.forms, ...x.roots.map(squash)];
      const score = Math.max(0, ...keys.map((key) => likeness(k, key)));
      if (score >= 0.5) near.push({ file: f, signals: [], score });
    }
    near.sort((a, b) => b.score - a.score || rel(a.file).localeCompare(rel(b.file)));
    const nearest = near.slice(0, 3).map(({ file }) => ({ file, signals: [] }));
    return done({ name, status: 'none', file: null, how: nearest.length ? `not found; nearest: ${nearest.map((c) => rel(c.file)).join(', ')}` : 'not found', signals: [], candidates: nearest });
  }

  // The class the paired file gives the component: one its markup spells as the name, else its first element's. null
  // when nothing pairs, when the file writes the convention's own class (the convention is right already), or when the
  // file is named after the component or declares its name (its class is the convention's, as it has always been).
  function classOf(name) {
    const p = pairOf(name);
    if (!p.file || !['pinned', 'paired'].includes(p.status)) return null;
    const x = facts(resolve(p.file));
    if (nameSigns(squash(name), x).some((v) => v === 'name' || v === 'declares')) return null;
    const convention = String(name).charAt(0).toLowerCase() + String(name).slice(1);
    const written = markupClasses(x.text);
    if (written.includes(convention) || x.roots.includes(convention)) return null;
    const spelled = written.find((c) => squash(c) === squash(name));
    const own = spelled ?? x.roots[0] ?? null;
    return own ? '.' + own : null;
  }

  let every = null;
  const allPairs = () => (every ??= fig.names.map((n) => pairOf(n)));
  // A file some Figma component is paired with, pinned to or proposed for.
  const claimed = (f) => allPairs().some((p) => (p.file && resolve(p.file) === resolve(f)) || (p.status === 'proposed' && p.candidates.some((c) => resolve(c.file) === resolve(f))));
  const ownersOf = (f) => allPairs().filter((p) => p.file && resolve(p.file) === resolve(f)).map((p) => p.name);

  return {
    names: fig.names,
    pairOf, classOf, claimed, ownersOf,
    // The components only the code has: each component file (codeComponents) no Figma component is paired with or
    // proposed for.
    codeOnly: () => codeComponents(ROOT, cfg, read).filter((k) => inHome(resolve(ROOT, k.file)) && !claimed(resolve(ROOT, k.file))),
    home, inLibrary: (f) => inHome(resolve(ROOT, f)),
    // Every Figma component's pair, grouped: { pinned, paired, proposed, ambiguous, none, missing }.
    summary: () => {
      const out = { pinned: [], paired: [], proposed: [], ambiguous: [], none: [], missing: [] };
      for (const p of allPairs()) out[p.status].push(p);
      return out;
    },
  };
}

// The pairing for a project, its Figma data read from its snapshots.
export function loadPairing(ROOT, cfg = {}, opts = {}) {
  return createPairing({ ROOT, cfg, ...opts });
}

// The pairing's lines for the audit and the style guide: each proposal to confirm or pin, and each component only in
// Figma with the files nearest its name. skip: names not to list (work in progress). → [{ kind, name, say, todo }]
export function pairingTasks(pairing, { ROOT, skip = new Set() } = {}) {
  const rel = (f) => relative(ROOT, f).replace(/\\/g, '/');
  const s = pairing.summary();
  const out = [];
  for (const p of s.proposed) {
    if (skip.has(p.name)) continue;
    const files = p.candidates.map((c) => `${rel(c.file)} (${signsSaid(c.signals)})`);
    out.push({ kind: 'proposed', name: p.name, files: p.candidates.map((c) => rel(c.file)),
      say: `Figma's ${p.name} may be ${files.join(' or ')}: one sign only, so it is not paired.`,
      todo: `Confirm it, or pin ${p.name} to its file in ds-config.json → componentFiles.` });
  }
  for (const p of s.ambiguous) {
    if (skip.has(p.name)) continue;
    out.push({ kind: 'ambiguous', name: p.name, files: p.candidates.map((c) => rel(c.file)),
      say: `Figma's ${p.name} fits ${p.candidates.length} files equally (${p.candidates.slice(0, 3).map((c) => rel(c.file)).join(', ')}).`,
      todo: `Pin ${p.name} to its file in ds-config.json → componentFiles.` });
  }
  for (const p of s.none) {
    if (skip.has(p.name) || !p.candidates.length) continue;
    out.push({ kind: 'none', name: p.name, files: p.candidates.map((c) => rel(c.file)),
      say: `Figma's ${p.name} is only in Figma; the files nearest its name are ${p.candidates.map((c) => rel(c.file)).join(', ')}.`,
      todo: `If one of them is ${p.name}, pin it in ds-config.json → componentFiles; else build ${p.name}.` });
  }
  return out;
}

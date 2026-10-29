// vue-harness.mjs - the design system's own Vue components, rendered with the project's own build tools in a real
// browser: each single-file component in each of its variants on one page, so the accessibility check tries what a
// person would (a click, a key, a name read out) on the code that ships, and the style guide draws what it renders.
//
// The project's own build does the work, once its packages are installed, whichever it is: Vite (its config, plugins,
// aliases, the SCSS its components share), Nuxt (its whole app: its modules, auto-imports and components, the page
// replaced by the components), Vue CLI (its webpack config as vue.config.js shapes it) or webpack with vue-loader (its
// webpack.config). A project with no Vite config but Vite and @vitejs/plugin-vue installed gets that plugin, as a new
// Vue project has it. What it lacks is said, never worked around with a build of the engine's.
// The variants are Figma's when it has the component, else the code's own props (component-harness.mjs variantsFromCode).
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname, resolve, sep, basename } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { OUT_DIR } from './names.mjs';
import { findIconFolder, svgFiles } from './icon-folder.mjs';
import { bestExample } from './figma-examples.mjs';

// A package of the project, as an ES module it exports for import (its "exports" import entry, else "module" or "main").
function projectModule(ROOT, name) {
  // Its folder in the node_modules the project resolves from (a package need not export its package.json).
  const dirs = createRequire(join(ROOT, 'package.json')).resolve.paths(name) ?? [];
  const pkgFile = dirs.map((d) => join(d, name, 'package.json')).find((f) => existsSync(f));
  if (!pkgFile) return null;
  const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'));
  const pick = (x) => (typeof x === 'string' ? x : x && typeof x === 'object' ? pick(x.import ?? x.default ?? x.node) : null);
  const entry = pick(pkg.exports?.['.'] ?? pkg.exports) ?? pkg.module ?? pkg.main ?? 'index.js';
  return pathToFileURL(join(dirname(pkgFile), entry)).href;
}

// The project's Vite and what it renders Vue with: { vite, plugins, config } or { why }.
async function projectVite(ROOT, config) {
  const viteUrl = projectModule(ROOT, 'vite');
  if (!viteUrl) return { why: 'the project has no Vite to build its Vue components with (its own build tools are used, never the engine\'s)' };
  let plugins = [];
  if (!config) {
    const vueUrl = projectModule(ROOT, '@vitejs/plugin-vue');
    if (!vueUrl) return { why: 'the project has no Vite config and no @vitejs/plugin-vue to read its .vue files with' };
    plugins = [(await import(vueUrl)).default()];
  }
  return { kind: 'vite', label: 'Vite', vite: await import(viteUrl), plugins, config };
}

// The project's own build for its Vue components, from its config files and its package.json, in this order: Nuxt
// (nuxt.config), Vite (vite.config), Vue CLI (vue.config.js, or @vue/cli-service), webpack (webpack.config), else Vite
// with @vitejs/plugin-vue installed. → { kind, label, … } or { why }.
export async function projectBuild(ROOT) {
  if (!projectModule(ROOT, 'vue')) return { why: existsSync(join(ROOT, 'package.json')) && !existsSync(join(ROOT, 'node_modules')) ? 'the project\'s packages are not installed (no node_modules): install them (npm install, or the project\'s package manager), then run again' : 'the project has no vue package installed' };
  let deps = {};
  try { const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')); deps = { ...pkg.dependencies, ...pkg.devDependencies }; } catch { /* no package.json */ }
  const configOf = (base) => ['.ts', '.mts', '.js', '.mjs', '.cjs'].map((e) => base + e).find((f) => existsSync(join(ROOT, f))) ?? null;
  const req = createRequire(join(ROOT, 'package.json'));
  const where = (spec) => { try { return req.resolve(spec); } catch { return null; } };
  const nuxt = configOf('nuxt.config');
  if (nuxt || deps.nuxt) {
    const kit = where('nuxt/kit');
    return kit ? { kind: 'nuxt', label: 'Nuxt', kit: pathToFileURL(kit).href } : { why: `the project is a Nuxt app${nuxt ? ` (${nuxt})` : ''} with no nuxt package installed to build it with` };
  }
  const vite = configOf('vite.config');
  if (vite) return projectVite(ROOT, vite);
  if (configOf('vue.config') || deps['@vue/cli-service']) {
    const cli = where('@vue/cli-service/package.json');
    return cli ? { kind: 'webpack', label: 'Vue CLI', cli: dirname(cli) } : { why: 'the project is a Vue CLI app with no @vue/cli-service installed to build it with' };
  }
  const webpack = configOf('webpack.config');
  if (webpack) return where('webpack') ? { kind: 'webpack', label: 'webpack', config: webpack } : { why: `the project has a ${webpack} but no webpack installed to build it with` };
  if (projectModule(ROOT, 'vite')) return projectVite(ROOT, null);
  return { why: 'the project has no build tool to render its Vue components with (Vite, Nuxt, Vue CLI or webpack: its own are used, never the engine\'s)' };
}

// The global stylesheets the project's own entry loads (src/main.ts importing './styles/main.scss'), and its token CSS.
export function globalStyles(ROOT, cfg = {}) {
  const out = new Set([cfg.paths?.themeCSS].flat().filter((f) => f && !/^https?:/.test(f)).map((f) => '/' + String(f).replace(/^\.?\//, '')));
  for (const entry of ['src/main.ts', 'src/main.js', 'src/main.mts', 'main.ts', 'main.js']) {
    let text = ''; try { text = readFileSync(join(ROOT, entry), 'utf8'); } catch { continue; }
    for (const m of text.matchAll(/^\s*import\s+['"]([^'"]+\.(?:css|scss|sass|less))['"]/gm)) {
      const spec = m[1];
      if (spec.startsWith('.')) out.add('/' + relative(ROOT, join(ROOT, dirname(entry), spec)).split('\\').join('/'));
      else out.add(spec);   // a package's stylesheet, or an alias the project's Vite resolves
    }
    break;
  }
  return [...out];
}

// What the project's app gives its components that a component may need to render at all: a Pinia store and a router,
// each when the project's package.json lists it and it is installed (its own copy, never the engine's).
// → { pinia, router } (booleans).
export function appPlugins(ROOT) {
  let deps = {};
  try { const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')); deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies }; } catch { /* no package.json */ }
  const has = (name) => Boolean(deps[name]) && Boolean(projectModule(ROOT, name));
  return { pinia: has('pinia'), router: has('vue-router'), setup: appSetup(ROOT) };
}

// The packages the project's own code imports (every script under src/ but its tests and its Figma Code Connect files),
// as it imports them ('prismjs', 'prismjs/plugins/line-numbers/prism-line-numbers.js'): only those the project has
// installed, never a stylesheet, never Vue's own (the list above has them). A tool the project only runs from its
// scripts (a CLI in its dependencies) is never bundled into the page.
export function runtimeDeps(ROOT) {
  const out = new Set();
  const walk = (d) => {
    let names; try { names = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of names) {
      if (e.name.startsWith('.') || /^(node_modules|figma|__tests__|tests?)$/.test(e.name)) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.(vue|m?js|ts)$/.test(e.name) || /\.(test|spec|figma)\.\w+$/.test(e.name)) continue;
      let src; try { src = readFileSync(p, 'utf8'); } catch { continue; }
      for (const m of src.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"]((?:@[\w.-]+\/)?[\w-][^'"]*)['"]/g)) out.add(m[1]);
    }
  };
  walk(join(ROOT, 'src'));
  return [...out].filter((spec) => {
    if (/\.(css|scss|sass|less|json|svg|png|jpe?g|gif|webp)(\?.*)?$/i.test(spec)) return false;
    const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
    return !/^(vue|pinia|vue-router)$/.test(name) && !!projectModule(ROOT, name);
  }).sort();
}

// The data the project's own pages give each component's list and object props (<chart-donut :slices="chartData"> with
// const chartData = [...] in the page's script): read from the literal, never run as the page's code, so a component
// that needs data to draw (a chart's slices) draws with the data its own documentation shows. → { file: { prop: value } }
export function pageSamples(ROOT) {
  const out = {};
  const files = [];
  const walk = (d) => {
    let names; try { names = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of names) {
      if (e.name.startsWith('.') || /^(node_modules|figma|tests?)$/.test(e.name)) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p); else if (/\.vue$/.test(e.name)) files.push(p);
    }
  };
  walk(join(ROOT, 'src'));
  // A literal from its first bracket to its match, strings and comments skipped.
  const literalAt = (src, i) => {
    const open = src[i], close = open === '[' ? ']' : '}'; let depth = 0, q = null;
    for (let k = i; k < src.length; k++) {
      const ch = src[k];
      if (q) { if (ch === '\\') { k++; continue; } if (ch === q) q = null; continue; }
      if (ch === '"' || ch === "'" || ch === '`') { q = ch; continue; }
      if (ch === '/' && src[k + 1] === '/') { k = src.indexOf('\n', k); if (k < 0) return null; continue; }
      if (ch === open) depth++; else if (ch === close && --depth === 0) return src.slice(i, k + 1);
    }
    return null;
  };
  const valueOf = (lit) => {
    // Only plain data: no call, no arrow, no template expression, no name it would have to look up.
    if (/=>|\bfunction\b|\$\{|\bnew\s|\bimport\b|\brequire\b/.test(lit)) return undefined;
    const bare = lit.replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '""');
    if (/[A-Za-z_$][\w$]*\s*\(/.test(bare) || /:\s*[A-Za-z_$][\w$.]*\s*[,}\]]/.test(bare.replace(/:\s*(true|false|null|undefined)\s*(?=[,}\]])/g, ': 0'))) return undefined;
    try { return JSON.parse(JSON.stringify(Function(`"use strict"; return (${lit});`)())); } catch { return undefined; }
  };
  for (const f of files) {
    let src; try { src = readFileSync(f, 'utf8'); } catch { continue; }
    const tpl = /<template\b[\s\S]*<\/template>/.exec(src)?.[0] ?? '';
    for (const m of src.matchAll(/import\s+([A-Z][\w$]*)\s+from\s+['"]([^'"]+)['"]/g)) {
      const [, local, spec] = m;
      const base = spec.startsWith('@/') ? join(ROOT, 'src', spec.slice(2)) : spec.startsWith('.') ? resolve(dirname(f), spec) : null;
      if (!base) continue;
      const target = [base, base + '.vue', join(base, 'index.vue')].find((x) => existsSync(x) && /\.vue$/.test(x));
      if (!target) continue;
      const kebab = local.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
      for (const t of tpl.matchAll(new RegExp(`<(?:${local}|${kebab})\\b([^>]*)>`, 'g'))) {
        for (const a of t[1].matchAll(/(?:^|\s)(?::|v-bind:)([A-Za-z][\w-]*)\s*=\s*"([A-Za-z_$][\w$]*)"/g)) {
          const prop = a[1].replace(/-(\w)/g, (_, c) => c.toUpperCase()), ident = a[2];
          if ((out[target] ??= {})[prop] !== undefined) continue;
          const d = new RegExp(`\\b(?:const|let|var)\\s+${ident}\\s*=\\s*(?:(?:ref|reactive|shallowRef)\\s*\\(\\s*)?([\\[{])`).exec(src);
          if (!d) continue;
          const lit = literalAt(src, d.index + d[0].length - 1);
          const v = lit && valueOf(lit);
          if (v !== undefined && (Array.isArray(v) ? v.length : Object.keys(v).length)) out[target][prop] = v;
        }
      }
    }
  }
  return out;
}

// The value the project's own templates pass most to each attribute written as plain text (icon="m/home-m",
// label="Save"), so a component whose text or icon has no default draws with one the product really uses. Only names
// a component's props can take; a bound one (:label="x") or one with a template in it is never taken.
export function propSamples(ROOT) {
  const count = {};
  const walk = (d) => {
    let names; try { names = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of names) {
      if (e.name.startsWith('.') || /^(node_modules|figma|tests?)$/.test(e.name)) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.vue$/.test(e.name)) continue;
      let src; try { src = readFileSync(p, 'utf8'); } catch { continue; }
      const tpl = /<template\b[\s\S]*<\/template>/.exec(src)?.[0] ?? '';
      for (const m of tpl.matchAll(/\s([a-z][\w-]*)="([^"{}<>]{1,60})"/g)) {
        if (/^(class|style|id|key|ref|type|role|href|src|alt|for|name|slot|v-[\w-]+|aria-[\w-]+|data-[\w-]+|xmlns.*|viewBox|fill|stroke.*|d|width|height|target|rel|tabindex)$/.test(m[1])) continue;
        const k = m[1].replace(/-(\w)/g, (_, c) => c.toUpperCase());
        ((count[k] ??= {})[m[2]] = (count[k][m[2]] ?? 0) + 1);
      }
    }
  };
  walk(join(ROOT, 'src'));
  return Object.fromEntries(Object.entries(count).map(([k, vs]) => [k, Object.entries(vs).sort((a, b) => b[1] - a[1])[0][0]]));
}

// For each list prop the template loops over (v-for="tab in tabs"), three items with the fields the template reads from
// each (tab.label, tab.icon): each field the value the project's pages pass it most, else its own name and number, an
// on/off one off but the first item's selected or active. So a list draws as a list. → { propName: [items] }
// With an example from Figma whose instances are the list's items (a bar's tabs): one item a tab, each field from the
// tab's own property (label from LabelContent, icon from mainIcon, its icon as the code names its file), else its words.
// A field no page writes as text: what the components that take a prop of that name declare it as (kinds), an on/off
// off (the first of a list selected), one with options its default or first option, a number (or a field named as an
// amount is) counted, before its own name and number. i: the item's place in its list.
// An on/off named as one (allowClear, enableSort) is off too; a field named as an id (id, slotId) takes its
// own name and number with no space, as an id that names an element (#target-slotId-1) is written.
export function sampleValue(f, i, samples = {}, kinds = {}) {
  const k = kinds[f];
  if (/^(is|has|show|with)[A-Z]|^(disabled|selected|active|checked|open|expanded|current)$/i.test(f) || /^(apply|allow|enable|can|should|use)[A-Z]/.test(f) || k?.type === 'boolean') return i === 0 && /selected|active|current/i.test(f);
  if (/^(id|key|identifier)$|[a-z](Id|Key|Identifier)$/.test(f) && !k?.options?.length) return typeof samples[f] === 'string' && !/\s/.test(samples[f]) ? `${samples[f]}-${i + 1}` : `${f}-${i + 1}`;
  if (typeof samples[f] === 'string') return /icon|image|img|src|href|url|link|path|type|variant|size|color/i.test(f) || k?.options?.length ? samples[f] : `${samples[f]} ${i + 1}`;
  if (k?.options?.length) return k.options.includes(k.default) ? k.default : k.options[0];
  // A number, declared as one or named as an amount is (initialValue, total, rate), is counted.
  if (k?.type === 'number' || (!k && /(amount|total|price|balance|rate|quantity|count)$|^(min|max|step|initial(value)?)$/i.test(f))) return i + 1;
  return `${f.charAt(0).toUpperCase() + f.slice(1)} ${i + 1}`;
}

// For each object prop the code reads fields of (cell.type, props.baseAmount.label) with none given by default, an
// object with those fields, each as sampleValue gives it, so a part drawn alone, outside the parent that always passes
// it one, draws. What the code does with a field says what it is:
// - looped over (months.map), or measured or cut (rows.length, rows.slice) when its name is plural and no word method
//   is called on it: a list of three. A text has length, slice and includes too: tintColor.includes('-') beside
//   tintColor.startsWith('--') is a text;
// - read into further (amount.params.label): an object with those fields;
// - looked up in a table of the component's own (parts[cell.partKind], with const parts =
//   { Plain: …, Money: … }): the table's name the project's code writes most for that field (onward.keyed,
//   keyedNames), else its first, as the table decides what it draws;
// - else compared with a word (button.kind === 'solid'): that word;
// - passed on to a child that takes it as a number (onward.numeric: ['amount.figure'], childFacing): a number;
//   as its icon (onward.icons: ['pin.value']): the icon the project's pages use most;
// - a date (disabledDates.from, range.startDate): left out, as a page that gives none.
// Each of these holds for a field first kept in a name of its own (const labels = props.translation.monthsAbbr;
// labels.map(...)). → { propName: object }
const LIST_ONLY = /^(map|forEach|filter|find|findIndex|flatMap|some|every|reduce|join)$/;
const LIST_OR_TEXT = /^(slice|length|indexOf|includes|at|concat)$/;
const TEXT_ONLY = /^(startsWith|endsWith|charAt|charCodeAt|toLowerCase|toUpperCase|toLocaleLowerCase|toLocaleUpperCase|trim|trimStart|trimEnd|split|replace|replaceAll|padStart|padEnd|substring|substr|match|localeCompare|normalize)$/;
const DATE_FIELD = /^(from|to|start|end|min|max)$|(date|day|month|year|time)$/i;
export function objectSamples(text, objectProps = [], samples = {}, kinds = {}, onward = {}) {
  const numeric = onward.numeric ?? [], icons = onward.icons ?? [];
  const src = String(text), out = {};
  const ID = '[A-Za-z_$][\\w$]*';
  // The names a table of the component's own lists at its top level (const parts = { Plain: …, Money: … }).
  const tableNames = (t) => {
    const at = new RegExp(`\\b(?:const|let|var)\\s+${t}\\s*=\\s*\\{`).exec(src);
    if (!at) return [];
    const names = [];
    let depth = 1, i = at.index + at[0].length, start = i;
    for (; i < src.length && depth; i++) {
      const ch = src[i];
      if (ch === '{' || ch === '(' || ch === '[') depth++;
      else if (ch === '}' || ch === ')' || ch === ']') depth--;
      if ((depth === 1 && ch === ',') || depth === 0) {
        const key = /^\s*['"]?([A-Za-z_$][\w$-]*)['"]?\s*:/.exec(src.slice(start, i))?.[1];
        if (key) names.push(key);
        start = i + 1;
      }
    }
    return names;
  };
  for (const p of objectProps) {
    const uses = {};
    const use = (f) => (uses[f] ??= { list: false, maybe: false, text: false, sub: new Set(), word: null, table: null });
    // What is done with a field: a method or a field after it (p.f.map(, p.f.label), or an index (p.f[0]).
    const after = (u, next, call, index) => {
      if (index) u.maybe = true;
      else if (!next) return;
      else if (LIST_ONLY.test(next)) u.list = true;
      else if (LIST_OR_TEXT.test(next)) u.maybe = true;
      else if (TEXT_ONLY.test(next)) u.text = true;
      else if (!call) u.sub.add(next);
    };
    const field = `(?:\\bprops\\.|[^.\\w$])${p}\\??\\.(${ID})`;
    for (const m of src.matchAll(new RegExp(`${field}(?:\\??\\.(${ID})(\\s*\\()?|(\\[))?`, 'g'))) after(use(m[1]), m[2], m[3], m[4]);
    for (const m of src.matchAll(new RegExp(`\\b(?:const|let|var)\\s+(${ID})\\s*=\\s*(?:props\\.)?${p}\\??\\.(${ID})\\s*(?:;|\\n)`, 'g'))) {
      const [, local, f] = m, u = use(f);
      for (const n of src.matchAll(new RegExp(`\\b${local}(?:\\??\\.(${ID})(\\s*\\()?|(\\[))`, 'g'))) after(u, n[1], n[2], n[3]);
    }
    for (const m of src.matchAll(new RegExp(`${field}\\s*===?\\s*(['"])([^'"\\n]{1,40})\\2|(['"])([^'"\\n]{1,40})\\5\\s*===?\\s*(?:props\\.)?${p}\\??\\.(${ID})`, 'g'))) {
      const u = use(m[1] ?? m[6]);
      u.word ??= m[3] ?? m[5];
    }
    for (const m of src.matchAll(new RegExp(`\\b(${ID})\\[\\s*(?:props\\.)?${p}\\??\\.(${ID})\\s*\\]`, 'g'))) {
      const u = use(m[2]);
      if (!u.table) { const names = tableNames(m[1]); if (names.length) u.table = names; }
    }
    const fields = {};
    for (const [f, u] of Object.entries(uses)) {
      const list = u.list || (u.maybe && !u.text && /[^s]s$/.test(f));
      if (!list && DATE_FIELD.test(f)) continue;
      if (list) fields[f] = [0, 1, 2].map((i) => sampleValue(f.replace(/s$/, ''), i, samples, kinds));
      else if (u.sub.size && !u.text && !u.word) fields[f] = Object.fromEntries([...u.sub].filter((g) => !DATE_FIELD.test(g)).map((g) => [g, sampleValue(g, 0, samples, kinds)]));
      else if (u.table) { const used = onward.keyed?.[f] ?? {}; fields[f] = [...u.table].sort((a, b) => (used[b] ?? 0) - (used[a] ?? 0))[0]; }
      else if (u.word != null) fields[f] = u.word;
      else if (numeric.includes(`${p}.${f}`)) fields[f] = 1;
      else if (icons.includes(`${p}.${f}`) && typeof samples.icon === 'string') fields[f] = samples.icon;
      else fields[f] = sampleValue(f, 0, samples, kinds);
    }
    if (Object.keys(fields).length) out[p] = fields;
  }
  return out;
}

// The values a component passes on, as they are, to a child component it draws (<amount-field :value="figure">,
// <date-grid :language="language">, :value="item.amount"), and what that child declares them as (its own file, found
// through the component's imports, the components the app's entry registers (globals: { AcIcon: '@/…/AcIcon.vue' }),
// or the package of that name for a tag it never imports): a value its child takes
// as a number (String or Number), a number, so a child that does arithmetic on it draws; one its child takes as its icon
// (<ac-icon :icon="value">), an icon; a prop its child falls back
// from when it is not given (props.language || its own), left unset, so the child's own fallback draws rather than an
// empty one. A text (label, title, content) keeps its words. apiOf(file) → textComponentApi; readText(file) → its text.
// → { numeric: ['figure', 'item.amount'], icons: ['value'], fallback: ['language'] }
const TEXT_PROP = /(label|title|text|description|caption|heading|subtitle|message|hint|placeholder|content|name)$/i;
export function childFacing(ROOT, file, text, apiOf, readText = (f) => readFileSync(f, 'utf8'), globals = {}) {
  const src = String(text);
  const tpl = /<template\b[\s\S]*<\/template>/.exec(src)?.[0] ?? '';
  const script = src.replace(tpl, '');
  const out = { numeric: [], icons: [], fallback: [] };
  if (!tpl) return out;
  const imports = new Map();
  for (const m of script.matchAll(/\bimport\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+)['"]/g)) imports.set(m[1], m[2]);
  const pascal = (t) => t.replace(/(^|-)(\w)/g, (_, __, c) => c.toUpperCase());
  const squash = (k) => String(k).toLowerCase().replace(/[^a-z0-9]/g, '');
  const withExt = (base) => ['', '.vue', '.js', '.ts', '.mjs', '/index.vue', '/index.js', '/index.ts'].map((x) => base + x).find((f) => { try { return statSync(f).isFile(); } catch { return false; } }) ?? null;
  const fileOf = (tag) => {
    const spec = imports.get(tag) ?? imports.get(pascal(tag)) ?? globals[tag] ?? globals[pascal(tag)];
    if (spec) {
      if (/^[@~]\//.test(spec)) return withExt(join(ROOT, 'src', spec.slice(2)));
      if (spec.startsWith('.')) return withExt(resolve(dirname(file), spec));
      if (spec.startsWith('/')) return withExt(join(ROOT, spec));
      try { const u = projectModule(ROOT, spec); return u ? fileURLToPath(u) : null; } catch { return null; }
    }
    // A tag it never imports that names a package (<vue-amount-input>, installed by the app's entry).
    if (!tag.includes('-')) return null;
    try { const u = projectModule(ROOT, tag); return u ? fileURLToPath(u) : null; } catch { return null; }
  };
  const seen = new Set();
  for (const t of tpl.matchAll(/<([A-Za-z][\w.-]*)((?:\s+[^\s=>"'/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*\/?>/g)) {
    const [, tag, attrs] = t;
    if (/^(template|component|slot|transition|transition-group|keep-alive|teleport|suspense)$/i.test(tag)) continue;
    const binds = [...attrs.matchAll(/(?:^|\s)(?::|v-bind:)([\w-]+)\s*=\s*"\s*([^"]*?)\s*"/g)].map(([, a, e]) => [a, /^(?:props\.)?([A-Za-z_$][\w$]*)(?:\??\.([A-Za-z_$][\w$]*))?$/.exec(e)]).filter(([, e]) => e);
    if (!binds.length) continue;
    const child = fileOf(tag);
    // A package's bundle of megabytes (a PDF viewer with its engine inside) is not read for its props: it says too
    // little for the time it takes.
    if (!child || resolve(child) === resolve(file) || (() => { try { return statSync(child).size > 1e6; } catch { return true; } })()) continue;
    let api = null, childText = '';
    // A child that is a script (a package's build) is read as a Vue component's options (props: { value: [String, Number] }).
    try { childText = readText(child); api = apiOf(/\.vue$/.test(child) ? child : `${child}.vue`, childText); } catch { continue; }
    const props = api?.props ?? {};
    for (const [attr, e] of binds) {
      const name = Object.keys(props).find((k) => squash(k) === squash(attr));
      if (!name) continue;
      const path = e[2] ? `${e[1]}.${e[2]}` : e[1];
      const key = `${path}|${child}|${name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (/\bnumber\b/.test(props[name].type ?? '') && !TEXT_PROP.test(name) && !TEXT_PROP.test(e[2] ?? e[1]) && !out.numeric.includes(path)) out.numeric.push(path);
      if (/icon$/i.test(name) && /\bstring\b/.test(props[name].type ?? '') && !/icon$/i.test(e[2] ?? e[1]) && !out.icons.includes(path)) out.icons.push(path);
      if (!e[2] && props[name].default == null && fallbackProps(childText, [name]).length && !out.fallback.includes(e[1])) out.fallback.push(e[1]);
    }
  }
  return out;
}

export function listSamples(text, propNames = [], samples = {}, example = null, icons = {}, kinds = {}) {
  const tpl = /<template\b[\s\S]*<\/template>/.exec(String(text))?.[0] ?? '';
  const out = {};
  const sq = (k) => String(k).toLowerCase().replace(/[^a-z0-9]/g, '');
  const figmaItems = (() => {
    const list = (example?.items ?? []).filter((x) => x && x.component && !/^[._]/.test(String(x.component).replace(/^[^A-Za-z0-9_.]+/, '')));
    const count = {}; for (const x of list) count[x.component] = (count[x.component] ?? 0) + 1;
    const top = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
    return top && top[1] >= 2 ? list.filter((x) => x.component === top[0]) : null;
  })();
  const fromFigma = (item, f, i) => {
    const keys = Object.keys(item.props ?? {});
    const k = keys.find((x) => sq(x) === sq(f)) ?? keys.find((x) => sq(x).replace(/(content|text|value|swap)$/, '') === sq(f)) ?? keys.find((x) => sq(f).length > 2 && sq(x).endsWith(sq(f)));
    let v = k !== undefined ? item.props[k] : undefined;
    if (/^(selected|active|current|checked|on|pressed)$/i.test(f) && v === undefined) v = /^(selected|active|current|checked|on|pressed)$/i.test(String(item.props?.state ?? ''));
    if (v === undefined && /^(id|key|value)$/i.test(f)) v = i + 1;
    if (v === undefined && /(label|title|text|name|content)$/i.test(f)) v = (item.texts ?? [])[0];
    if (typeof v === 'string' && icons[v] && /icon/i.test(f + (k ?? ''))) v = icons[v];
    if (v === 'true' || v === 'false') v = v === 'true';
    return v;
  };
  for (const m of tpl.matchAll(/v-for\s*=\s*["']\s*\(?\s*([A-Za-z_$][\w$]*)(?:\s*,\s*[A-Za-z_$][\w$]*)*\s*\)?\s+(?:in|of)\s+(?:props\.)?([A-Za-z_$][\w$]*)\s*["']/g)) {
    const [, item, list] = m;
    if (!propNames.includes(list) || out[list]) continue;
    const fields = [...new Set([...tpl.matchAll(new RegExp(`\\b${item}\\.([A-Za-z_$][\\w$]*)`, 'g'))].map((x) => x[1]))];
    if (figmaItems && fields.length) {
      out[list] = figmaItems.map((it, i) => Object.fromEntries(fields.map((f) => [f, fromFigma(it, f, i)]).filter(([, v]) => v !== undefined)));
      continue;
    }
    const value = (f, i) => sampleValue(f, i, samples, kinds);
    out[list] = [0, 1, 2].map((i) => (fields.length ? Object.fromEntries(fields.map((f) => [f, value(f, i)])) : `Item ${i + 1}`));
  }
  return out;
}

// What the project's components declare each prop name as, across all of them (buttonSize: a string with options s, m
// and l, default m; fullWidth: an on/off): the type most of them give it, and the options and default of the one that
// lists the most. So a value passed through a list's items, or a prop one component leaves bare, takes one the others
// take. → { name: { type, options, default } }
export function propKinds(files, apiOf) {
  const seen = {};
  for (const f of files) {
    if (!/\.vue$/.test(f)) continue;
    let api; try { api = apiOf(f); } catch { continue; }
    for (const [k, d] of Object.entries(api?.props ?? {})) {
      const s = (seen[k] ??= { types: {}, best: null });
      if (d.type) s.types[d.type] = (s.types[d.type] ?? 0) + 1;
      if ((d.options?.length ?? 0) > (s.best?.options?.length ?? 0)) s.best = d;
    }
  }
  return Object.fromEntries(Object.entries(seen).map(([k, s]) => {
    const type = Object.entries(s.types).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return [k, { type, options: s.best?.options ?? null, default: s.best?.default ?? null }];
  }));
}

// How often the project's code writes each name for a key (kind: 'Solid', tileKind: 'Outline'), in its scripts and
// data under src, and for an attribute its templates write as text (tile-kind="Outline"). → { key: { name: count } }
export function keyedNames(ROOT) {
  const count = {};
  const walk = (d) => {
    let names; try { names = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of names) {
      if (e.name.startsWith('.') || /^(node_modules|figma|tests?)$/.test(e.name)) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.(vue|m?js|ts)$/.test(e.name)) continue;
      let src; try { src = readFileSync(p, 'utf8'); } catch { continue; }
      const add = (k, v) => ((count[k] ??= {})[v] = (count[k][v] ?? 0) + 1);
      for (const m of src.matchAll(/\b([A-Za-z_$][\w$]*)\s*:\s*['"]([A-Za-z][\w-]{0,40})['"]/g)) add(m[1], m[2]);
      const tpl = /<template\b[\s\S]*<\/template>/.exec(src)?.[0] ?? '';
      for (const m of tpl.matchAll(/\s([a-z][\w-]*)="([A-Z][\w-]{0,40})"/g)) add(m[1].replace(/-(\w)/g, (_, c) => c.toUpperCase()), m[2]);
    }
  };
  walk(join(ROOT, 'src'));
  return count;
}

// The parts a component loads by a name it is given (defineAsyncComponent(() => import(`../tiles/${kind}.vue`))), and
// where that name comes from: a field of the items of a list it loops over (partFor(tile.kind) in a v-for over
// tiles), a field of an object prop (props.item.tileKind), or a prop of its own (props.tileKind, field null). A name
// passed through a table first (`${fileFor(kind)}` with fileFor's { Solid: 'Solid', … }) is one of the table's names
// whose file is there. A name that is no file of that folder loads nothing, and the component fails before it draws.
// propNames: the props its API declares. → [{ prop, field, list, names }], the ones the project's code writes most for
// it first (keyedNames).
export function asyncChoices(ROOT, file, text, keyed = {}, propNames = []) {
  const src = String(text);
  const tpl = /<template\b[\s\S]*<\/template>/.exec(src)?.[0] ?? '';
  const script = src.replace(tpl, '');
  const out = [];
  const declared = (p) => propNames.includes(p);   // the props its API declares (textComponentApi)
  const pathOf = (e) => {
    const own = e.startsWith('props.'), p = e.replace(/^props\./, '').split('.');
    if (p.length === 2) return { prop: p[0], field: p[1], list: false };
    return p.length === 1 && (own || declared(p[0])) ? { prop: p[0], field: null, list: false } : null;
  };
  for (const m of script.matchAll(/\bimport\s*\(\s*`([^`$]*)\$\{\s*(?:([A-Za-z_$][\w$]*)\s*\(\s*)?([A-Za-z_$][\w$.]*)\s*\)?\s*\}([^`$]*)`\s*\)/g)) {
    const [, prefix, table, expr, suffix] = m;
    const at = prefix.startsWith('@/') ? join(ROOT, 'src', prefix.slice(2)) : prefix.startsWith('.') ? resolve(dirname(file), prefix) : null;
    if (!at) continue;
    const dir = prefix.endsWith('/') ? at : dirname(at), start = prefix.endsWith('/') ? '' : basename(at);
    // Never the component's own file (a group that loads its items from its own folder): a build lists a folder's files
    // to load by name without the one that asks (import.meta.glob), so its own name loads nothing.
    let names = []; try { names = readdirSync(dir).filter((f) => f.startsWith(start) && f.endsWith(suffix) && f.length > start.length + suffix.length && resolve(dir, f) !== resolve(file)).map((f) => f.slice(start.length, f.length - suffix.length)).sort(); } catch { continue; }
    if (!names.length) continue;
    // A table between the name and the file (fileFor(kind)): the table's names whose file is in the folder.
    if (table) {
      const at = new RegExp(`\\b(?:const|let|var|function)\\s+${table}\\b`).exec(script);
      const body = at ? script.slice(at.index, at.index + 3000).split(/\n\}/)[0] : '';
      const entries = [...body.matchAll(/['"]?([A-Za-z_$][\w$-]*)['"]?\s*:\s*['"]([\w-]+)['"]/g)].filter((e) => names.includes(e[2])).map((e) => e[1]);
      if (!entries.length) continue;
      names = [...new Set(entries)].sort();
    }
    const targets = [];
    if (expr.includes('.')) { const t = pathOf(expr); if (t) targets.push(t); }
    else {
      // A const set from a prop's field (const tileKind = props.item.tileKind).
      const set = new RegExp(`\\b(?:const|let|var)\\s+${expr}\\s*=\\s*((?:props\\.)?[A-Za-z_$][\\w$]*\\.[A-Za-z_$][\\w$]*|props\\.[A-Za-z_$][\\w$]*)\\s*(?:;|\\n)`).exec(script);
      if (set) { const t = pathOf(set[1]); if (t) targets.push(t); }
      else if (declared(expr)) targets.push({ prop: expr, field: null, list: false });   // the prop itself (<script setup> reads it bare in a template literal)
      // The parameter of the function around the import, called in the template with a field of a v-for's item.
      const fns = [...script.slice(0, m.index).matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(?\s*([A-Za-z_$][\w$]*)\s*\)?\s*=>|\bfunction\s+([A-Za-z_$][\w$]*)\s*\(\s*([A-Za-z_$][\w$]*)\s*\)/g)];
      const fn = fns.reverse().find((f) => (f[2] ?? f[4]) === expr);
      const call = fn && (fn[1] ?? fn[3]);
      for (const v of call ? tpl.matchAll(/v-for\s*=\s*["']\s*\(?\s*([A-Za-z_$][\w$]*)(?:\s*,\s*[A-Za-z_$][\w$]*)*\s*\)?\s+(?:in|of)\s+(?:props\.)?([A-Za-z_$][\w$]*)\s*["']/g) : []) {
        const c = new RegExp(`\\b${call}\\s*\\(\\s*${v[1]}\\.([A-Za-z_$][\\w$]*)\\s*\\)`).exec(tpl);
        if (c) targets.push({ prop: v[2], field: c[1], list: true });
      }
    }
    for (const t of targets) {
      const used = keyed[t.field ?? t.prop] ?? {};
      out.push({ ...t, names: [...names].sort((a, b) => (used[b] ?? 0) - (used[a] ?? 0)) });
    }
  }
  return out;
}

// The data a component is given (fill), each name it loads a part by (asyncChoices) one that part's folder has: the
// name already given when the folder has it (in any case), else the next most used, so a list's items differ.
export function withChoices(fill, choices) {
  const out = { ...fill };
  const pick = (names, v, i) => names.find((n) => n.toLowerCase() === String(v ?? '').toLowerCase()) ?? names[i % names.length];
  for (const { prop, field, list, names } of choices) {
    if (field == null) continue;                                  // a prop of its own: its cases say it (withCaseChoices)
    if (list) {
      const items = Array.isArray(out[prop]) && out[prop].length ? out[prop] : [{}, {}, {}];
      out[prop] = items.map((it, i) => (it && typeof it === 'object' ? { ...it, [field]: pick(names, it[field], i) } : it));
    } else {
      const was = out[prop] && typeof out[prop] === 'object' && !Array.isArray(out[prop]) ? out[prop] : {};
      out[prop] = { ...was, [field]: pick(names, was[field], 0) };
    }
  }
  return out;
}

// The cases a component is drawn in, each prop that names the part it loads (asyncChoices, field null) given a name the
// folder has: the case's own value when there is one (in any case), else the most used; a case made only to show that
// prop (tileKind="tileKind") is named for the value it now draws, and dropped when that is the default's.
export function withCaseChoices(cases, choices) {
  const own = choices.filter((c) => c.field == null);
  if (!own.length) return cases;
  const pick = (names, v) => names.find((n) => n.toLowerCase() === String(v ?? '').toLowerCase()) ?? names[0];
  const out = [];
  for (const c of cases) {
    const props = { ...c.props };
    let label = c.label;
    for (const { prop, names } of own) {
      const v = pick(names, props[prop]);
      if (label.startsWith(`${prop}=`) && String(props[prop]).toLowerCase() !== v.toLowerCase()) label = `${prop}=${v}`;
      props[prop] = v;
    }
    if (out.length && label !== c.label && JSON.stringify(props) === JSON.stringify(out[0].props)) continue;
    out.push({ ...c, label, props });
  }
  return out;
}

// The props a component's code falls back from when it is not given one (props.language || its own, x ?? y): left
// unset by the harness, as a page that does not pass it, so the code's own fallback draws rather than an empty one.
export function fallbackProps(text, propNames = []) {
  const src = String(text);
  return propNames.filter((p) => new RegExp(`(?:\\bprops\\.|[^.\\w$])${p}\\??\\s*(?:\\|\\||\\?\\?)`).test(src));
}

// Every icon of the project's icon folder by its file's name (home-m), as the code names it (m/home-m).
export function iconPaths(ROOT) {
  const folder = findIconFolder(ROOT);
  if (!folder) return {};
  const out = {};
  for (const rel of svgFiles(join(ROOT, folder))) { const name = rel.replace(/\.svg$/i, ''); const base = name.split('/').pop(); if (!(base in out)) out[base] = name; }
  return out;
}

// The ids the project's components teleport to (<teleport to="#modals-overlay">), its App making them on its page.
export function teleportTargets(ROOT) {
  const out = new Set();
  const walk = (d) => {
    let names; try { names = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of names) {
      if (e.name.startsWith('.') || /^(node_modules|figma|tests?)$/.test(e.name)) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.vue$/.test(e.name)) continue;
      let src; try { src = readFileSync(p, 'utf8'); } catch { continue; }
      for (const m of src.matchAll(/<teleport\b[^>]*?\bto\s*=\s*["']#([\w-]+)["']/gi)) out.add(m[1]);
    }
  };
  walk(join(ROOT, 'src'));
  return [...out].sort();
}

// What the project's own entry installs on its app (src/main.js: app.use(i18n), app.component('BaseIcon', BaseIcon),
// app.directive('mask', mask)), each read from the import that names it, so each instance on the page gets the same:
// a component that calls $t, renders <BaseIcon> or uses v-mask draws as it does in the product. A translation function
// or any other the entry installs another way is given the same way too:
// - set on every component (app.config.globalProperties.$t = i18n.global.t): 'global', its name and where it is read
//   (path: ['global', 't']);
// - provided (app.provide('translate', translate), app.provide(I18N_KEY, i18n)): 'provide', its key (a word, or an
//   import: keySpec);
// - mixed into every component (app.mixin(translations)): 'mixin';
// - installed by a function of the project's own that is handed the app (setupI18n(app), registerPlugins(app)): 'call'.
// Each in the entry's order. The store and the router are left to the page's own (appPlugins), and an option passed
// with a plugin is not, as it may name what the entry builds around it.
// → [{ kind: 'import' | 'use' | 'component' | 'directive' | 'global' | 'provide' | 'mixin' | 'call', name?, spec, named?,
// path?, key?, keySpec?, keyNamed? }]
export function appSetup(ROOT) {
  for (const entry of ['src/main.ts', 'src/main.js', 'src/main.mts', 'main.ts', 'main.js']) {
    let text = ''; try { text = readFileSync(join(ROOT, entry), 'utf8'); } catch { continue; }
    text = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    const app = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*createApp\s*\(/.exec(text)?.[1];
    if (!app) return [];
    const imports = new Map(), own = [];
    for (const m of text.matchAll(/^\s*import\s+([^'"]+?)\s+from\s+['"]([^'"]+)['"]/gm)) {
      const [, what, from] = m;
      const spec = from.startsWith('.') ? '/' + relative(ROOT, join(ROOT, dirname(entry), from)).split(sep).join('/') : from;
      if (/^(\/|@\/|~\/)/.test(spec) && !own.includes(spec)) own.push(spec);
      const def = /^([A-Za-z_$][\w$]*)/.exec(what.trim())?.[1];
      if (def && !what.trim().startsWith('{') && !what.trim().startsWith('*')) imports.set(def, { spec });
      for (const n of (/\{([^}]*)\}/.exec(what)?.[1] ?? '').split(',')) {
        const [a, b] = n.trim().split(/\s+as\s+/);
        if (a) imports.set((b ?? a).trim(), { spec, named: a.trim() });
      }
    }
    // The project's own modules the entry imports, first and in its order (its App, router, stores): loaded before any
    // component, so modules that import each other start in the order the product starts them, never halfway.
    const out = own.map((spec) => ({ kind: 'import', spec }));
    const skip = (id, src) => /^(createPinia|router)$/i.test(id) || /(^|\/)router(\/|$)|^vue-router$|^pinia$/i.test(src.spec);
    // A value read from an import, as it is or through its fields (i18n.global.t): the import and the fields.
    const valueOf = (expr) => { const [id, ...path] = String(expr).trim().split(/\s*\??\.\s*/); const src = /^[A-Za-z_$][\w$]*$/.test(id) && path.every((k) => /^[A-Za-z_$][\w$]*$/.test(k)) ? imports.get(id) : null; return src ? { ...src, ...(path.length ? { path } : {}) } : null; };
    const found = [];
    const call = new RegExp(`\\b${app}\\s*\\.\\s*(use|component|directive|provide|mixin)\\s*\\(([^)]*)\\)`, 'g');
    for (const m of text.matchAll(call)) {
      const args = m[2].split(',').map((x) => x.trim());
      if (m[1] === 'use') {
        const id = /^[A-Za-z_$][\w$]*$/.test(args[0]) ? args[0] : null, src = id && imports.get(id);
        if (src && !skip(id, src)) found.push([m.index, { kind: 'use', ...src }]);
      } else if (m[1] === 'mixin') {
        const src = valueOf(args[0]);
        if (src) found.push([m.index, { kind: 'mixin', ...src }]);
      } else if (m[1] === 'provide') {
        const word = /^['"]([^'"]+)['"]$/.exec(args[0] ?? '')?.[1], keySrc = word ? null : valueOf(args[0] ?? ''), src = valueOf(args[1] ?? '');
        if (src && (word || (keySrc && !keySrc.path))) found.push([m.index, { kind: 'provide', ...src, ...(word ? { key: word } : { keySpec: keySrc.spec, ...(keySrc.named ? { keyNamed: keySrc.named } : {}) }) }]);
      } else {
        const name = /^['"]([^'"]+)['"]$/.exec(args[0] ?? '')?.[1], src = imports.get(args[1] ?? '');
        if (name && src) found.push([m.index, { kind: m[1], name, ...src }]);
      }
    }
    for (const m of text.matchAll(new RegExp(`\\b${app}\\s*\\.\\s*config\\s*\\.\\s*globalProperties\\s*(?:\\.\\s*([A-Za-z_$][\\w$]*)|\\[\\s*['"]([^'"]+)['"]\\s*\\])\\s*=\\s*([A-Za-z_$][\\w$.?\\s]*?)\\s*(?:;|\\n|$)`, 'gm'))) {
      const src = valueOf(m[3]);
      if (src) found.push([m.index, { kind: 'global', name: m[1] ?? m[2], ...src }]);
    }
    // A function of the project's own handed the app and nothing else, named for what it installs (setupI18n(app),
// registerPlugins(app)), never one that mounts it: it installs what it installs.
    for (const m of text.matchAll(new RegExp(`(?:^|[;\\n{}])\\s*(?:await\\s+)?([A-Za-z_$][\\w$]*)\\s*\\(\\s*${app}\\s*\\)`, 'gm'))) {
      const src = imports.get(m[1]);
      if (src && /^(\/|@\/|~\/|\.)/.test(src.spec) && /setup|install|regist|plugin|i18n|translat|locale|provide/i.test(m[1]) && !/mount/i.test(m[1]) && !skip(m[1], src)) found.push([m.index, { kind: 'call', ...src }]);
    }
    return [...out, ...found.sort((a, b) => a[0] - b[0]).map(([, x]) => x)];
  }
  return [];
}

// The page's module: each component imported by its own path, mounted once per variant in a box that names it
// (data-dse-component, data-dse-case), and given back what it reports, as the page that uses it would: an
// update:<prop> event sets that prop, a toggle's click flips the state it was told. plugins (appPlugins): each instance
// gets a Pinia of its own and a router on a page of its own, from the project's packages, unless the project's app
// (Nuxt's) already gives them.
export function harnessModule(groups, styles = [], plugins = {}) {
  return `${styles.map((s) => `import ${JSON.stringify(s)};`).join('\n')}
import { createApp, h, reactive } from 'vue';
${plugins.pinia ? "import { createPinia } from 'pinia';\n" : ''}${plugins.router ? "import { createRouter, createMemoryHistory } from 'vue-router';\n" : ''}const GROUPS = ${JSON.stringify(groups.map(({ name, role, cases, options, fill, connect, frame, fallback, numeric, icons, refs }) => ({ name, role, cases, options: options ?? {}, fill: fill ?? {}, connect: connect ?? [], frame: frame ?? null, fallback: fallback ?? [], numeric: numeric ?? [], icons: icons ?? [], refs: refs ?? [] }))).replace(/</g, '\\u003c')};
const LOAD = {
${groups.map((g) => `  ${JSON.stringify(g.name)}: () => import(${JSON.stringify(g.file)}),`).join('\n')}
};
// What the project's entry installs on its app (appSetup), each loaded once; one that does not load is said, the rest kept.
const SETUP = [
${(plugins.setup ?? []).map((x) => `  { kind: ${JSON.stringify(x.kind)}, name: ${JSON.stringify(x.name ?? null)}, named: ${JSON.stringify(x.named ?? null)}, path: ${JSON.stringify(x.path ?? [])}, key: ${JSON.stringify(x.key ?? null)}, keyNamed: ${JSON.stringify(x.keyNamed ?? null)}, load: () => import(${JSON.stringify(x.spec)})${x.keySpec ? `, keyLoad: () => import(${JSON.stringify(x.keySpec)})` : ''} },`).join('\n')}
];
const squash = (k) => String(k).toLowerCase().replace(/[^a-z0-9]/g, '');
const SAMPLES = ${JSON.stringify(plugins.samples ?? {})};
// Each icon by the name Figma gives it (home-m), as the code names its file (m/home-m).
const ICONS = ${JSON.stringify(plugins.icons ?? {})};
const TEXTY = /(label|title|text|description|caption|heading|subtitle|message|hint|placeholder|content)$/i;
const HUMAN = (d) => { const w = String(d).replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase(); return w.charAt(0).toUpperCase() + w.slice(1); };
// Where the product's components teleport to (#modals-overlay, made by its App): made on the page, and what each case
// sends there is put back in its own box, so a modal is read as it draws.
const TELEPORTS = ${JSON.stringify(plugins.teleports ?? [])};
for (const id of TELEPORTS) if (!document.getElementById(id)) { const t = document.createElement('div'); t.id = id; t.setAttribute('data-dse-teleport', ''); document.body.append(t); }
const gather = (box) => { for (const id of TELEPORTS) { const t = document.getElementById(id); while (t && t.firstChild) box.append(t.firstChild); } };
const STATE = ['pressed', 'selected', 'checked', 'expanded', 'open', 'on', 'modelvalue', 'value'];
const BY_ROLE = { togglebutton: ['pressed'], toggle: ['pressed'], checkbox: ['checked'], switch: ['checked'], disclosure: ['expanded'], accordion: ['expanded'], tab: ['selected'] };
// The props the component declares, each given the variant's value (Figma's names matched to the code's, a value
// written as the code's own option writes it, Success as success; True and False as booleans for a Boolean prop); an
// aria- attribute the page adds falls through to its root.
function fit(C, props, role, options, fill = {}, connect = [], fallback = [], numeric = [], icons = []) {
  const decl = Array.isArray(C.props) ? Object.fromEntries(C.props.map((k) => [k, {}])) : (C.props || {});
  const out = {};
  for (const [d, spec] of Object.entries(decl)) {
    // Figma's name for it, or the name with what it holds after it (labelContent, iconContent for label, icon).
    // A code name that ends with Figma's (buttonSize for size) when no other prop does.
    const tail = Object.keys(props).filter((k) => squash(k).length > 2 && squash(d).endsWith(squash(k)) && !Object.keys(decl).some((o) => squash(o) === squash(k)));
    const types = [].concat(spec && spec.type || spec || []);
    // The project's own Code Connect says which Figma property this prop is (size for buttonSize), first. One it writes
    // only while a property has a value (:figure only with showAmount on) is not that property's value: an on/off
    // takes whether it holds (invalid while status is error), any other is left to what follows.
    const cc = types.some((t) => t === Array || t === Object) ? null : connect.find((x) => x.code === d && x.kind !== 'instance' && !x.event && !x.unclear && (x.kind !== 'boolean' || types.includes(Boolean)) && (x.role !== 'condition' || types.includes(Boolean)));
    const ccHit = cc ? Object.keys(props).find((k) => squash(k) === squash(cc.figma)) : undefined;
    const hit = ccHit ?? Object.keys(props).find((k) => squash(k) === squash(d)) ?? Object.keys(props).find((k) => squash(k).replace(/(content|text|value|swap)$/, '') === squash(d)) ?? (tail.length === 1 ? tail[0] : undefined);
    if (hit !== undefined) {
      let v = props[hit];
      if (cc && cc.role === 'condition' && hit === ccHit) v = (cc.equals != null ? squash(v) === squash(cc.equals) : v === true || /^(true|yes|on)$/i.test(String(v))) !== !!cc.negated;
      if (cc && cc.values && cc.values[v] != null) v = cc.values[v];
      if (typeof v === 'string' && ICONS[v] && /icon/i.test(hit + d)) v = ICONS[v];
      if (types.includes(Boolean) && typeof v === 'string') v = /^(true|yes|on)$/i.test(v);
      // A number it does arithmetic on (initialValue.toFixed()), given words: the number they say, else 0.
      if (types.length === 1 && types[0] === Number && typeof v === 'string') v = v.trim() !== '' && !isNaN(Number(v)) ? Number(v) : 0;
      const own = (options[d] || []).find((o) => squash(o) === squash(v));
      out[d] = own !== undefined ? own : v;
    }
    else if ((BY_ROLE[role] || []).includes(squash(d))) out[d] = false;
    // A switch that keeps it where it is drawn instead of teleporting it away (disabledTeleport): on, so it draws in place.
    else if (types.length === 1 && types[0] === Boolean && /disabl\\w*teleport|teleport\\w*(disabled|off)/i.test(d)) out[d] = true;
    // A text it passes on to a child as that child's icon (<ac-icon :icon="value">), none given: the icon the pages use most.
    else if (types.length === 1 && types[0] === String && !(spec && typeof spec === 'object' && 'default' in spec) && icons.includes(d) && SAMPLES.icon != null) out[d] = SAMPLES.icon;
    // A text the code takes with no default (an icon's name, a label): the one the project's own pages pass it most.
    else if (types.length === 1 && types[0] === String && !(spec && typeof spec === 'object' && 'default' in spec) && SAMPLES[d] != null) out[d] = SAMPLES[d];
    // A text or an icon with no default and none the pages pass (buttonLabel, buttonIcon): its own name as its words, the
    // icon the pages use most, so the part it draws is there to see, show and hide.
    else if (types.length === 1 && types[0] === String && !(spec && typeof spec === 'object' && 'default' in spec) && /icon$/i.test(d) && SAMPLES.icon != null) out[d] = SAMPLES.icon;
    else if (types.length === 1 && types[0] === String && !(spec && typeof spec === 'object' && 'default' in spec) && TEXTY.test(d)) out[d] = HUMAN(d);
    // A value it shows as it is or as an object's (value: [String, Number, Object]) with no default: words, its own name
    // (a number when it passes it on to a child that takes one, below), so a cell that shows nothing without one draws.
    else if (types.length > 1 && types.includes(String) && !(spec && typeof spec === 'object' && 'default' in spec) && (TEXTY.test(d) || /^value$/i.test(d))) out[d] = SAMPLES[d] != null ? SAMPLES[d] : HUMAN(d);
    // A function it calls as it draws (allowedToShowView, a formatter) and none given: one that allows, so it draws.
    else if (types.length === 1 && types[0] === Function && !(spec && typeof spec === 'object' && 'default' in spec)) out[d] = () => true;
    // A date it reads (pageDate.getFullYear()) and none given: today.
    else if (types.includes(Date) && !(spec && typeof spec === 'object' && 'default' in spec)) out[d] = new Date();
    // An object or a list it reads into with no default: an empty one, as a page always passes one, so it draws.
    // (params: Object, or { type: Object } with no default)
    // A list it loops over: the items its template reads (listSamples), else an empty one.
    // One the code falls back from when it is not given (props.language || its own): not given, so the fallback draws.
    else if (!(spec && typeof spec === 'object' && 'default' in spec) && types.length === 1 && (types[0] === Object || types[0] === Array) && (fill[d] || !fallback.includes(d))) out[d] = fill[d] ? JSON.parse(JSON.stringify(fill[d])) : types[0] === Array ? [] : {};
  }
  // A value it passes on to a child that takes a number (childFacing), given words: a number, so the child draws.
  for (const d of numeric) if (typeof out[d] === 'string' && out[d].trim() !== '' && isNaN(Number(out[d]))) out[d] = 1;
  for (const [k, v] of Object.entries(props)) if (/^aria-/.test(k)) out[k] = v;
  // Code Connect's own switches for a part (showIcon gives icon): off, the part is not given. Only a plain one: a part
  // its file writes under a further condition, or reads unclearly, may be one the component always reads.
  for (const x of connect) {
    if (x.kind !== 'boolean' || !x.code || !(x.code in out) || x.unclear || x.equals != null) continue;
    const at = Object.keys(props).find((k) => squash(k) === squash(x.figma));
    const t = [].concat(decl[x.code] && decl[x.code].type || decl[x.code] || []);
    if (at !== undefined && !t.includes(Boolean) && (props[at] === false || props[at] === 'false')) delete out[x.code];
  }
  // Figma's showLabel or hasIcon off, where the code shows the part whenever it is given: the part is not given.
  for (const [k, v] of Object.entries(props)) {
    const part = /^(show|has|with)(.+)$/i.exec(k)?.[2];
    if (!part || (v !== false && v !== 'false') || Object.keys(decl).some((d) => squash(d) === squash(k))) continue;
    // The part's own prop (label for showLabel), or every prop of that part (buttonLabel, buttonIcon for showButton).
    for (const d of Object.keys(decl).filter((x) => squash(x) === squash(part) || squash(x).startsWith(squash(part)))) delete out[d];
  }
  return out;
}
function listeners(C, state) {
  const emits = Array.isArray(C.emits) ? C.emits : Object.keys(C.emits || {});
  const told = Object.keys(state).filter((k) => STATE.includes(squash(k)));
  const apply = (a) => {
    const v = a && typeof a === 'object' && 'target' in a ? (a.type === 'click' ? undefined : a.target.value) : a;
    for (const k of told) {
      if (typeof v === 'boolean') state[k] = v;
      else if (v == null && typeof state[k] === 'boolean') state[k] = !state[k];
      else if (v != null && typeof v !== 'boolean' && !(typeof state[k] === 'boolean')) state[k] = typeof state[k] === 'number' ? Number(v) : v;
    }
  };
  const on = {};
  for (const e of emits) {
    if (e.startsWith('update:')) { const k = Object.keys(state).find((x) => squash(x) === squash(e.slice(7))); if (k) on['onUpdate:' + e.slice(7)] = (v) => { state[k] = v; }; }
    else if (/^(change|toggle|click|input|select)$/.test(e) && !emits.some((x) => x.startsWith('update:'))) on['on' + e[0].toUpperCase() + e.slice(1)] = apply;
  }
  if (!emits.length && told.length) on.onClick = apply;   // a click that reaches its root: the page flips what it told it
  return on;
}
// Inside an app of the project's (Nuxt's), each instance gets what that app gives its own (its plugins, router,
// global components), as it would on one of its pages.
const PARENT = window.__dseParentApp || null;
const inherit = (app) => {
  if (!PARENT) return;
  for (const k of ['provides', 'components', 'directives']) Object.assign(app._context[k], PARENT._context[k]);
  Object.assign(app.config.globalProperties, PARENT.config.globalProperties);
  if (PARENT.$nuxt) app.$nuxt = PARENT.$nuxt;
};
const main = document.getElementById('dse-harness');
const failed = [];
// Why a case could not draw, said in the component's own terms where its message lets it be: a method called on an
// element its template names (ref="field") that is not there in that case, a function its template calls that nothing
// gives it (t(), when no translation is installed by that name).
const explain = (g, e) => {
  const m = String(e && e.message || e).split('\\n')[0];
  const r = /^(\\w+)\\.value\\.(\\w+) is not a function|^Cannot read properties of (?:null|undefined) \\(reading '(\\w+)'\\)/.exec(m);
  const called = r ? (r[1] ? g.refs.filter((x) => x.name === r[1]) : g.refs.filter((x) => x.methods.includes(r[3]))) : [];
  if (called.length === 1) return 'it calls ' + called[0].name + '.' + (r[2] || r[3]) + '() as it draws, on the element ref="' + called[0].name + '" names, which its template does not draw in this case (' + m + ')';
  const fn = /^(?:_ctx|\\$setup|_vm)\\.(\\w+) is not a function/.exec(m);
  if (fn) return 'its template calls ' + fn[1] + '(), which nothing gives it: neither its own script nor anything the app\\'s entry installs (' + m + ')';
  return m;
};
(async () => {
const setup = [];
for (const x of SETUP) {
  try {
    const m = await x.load();
    let v = x.named ? m[x.named] : (m.default ?? m);
    for (const k of x.path || []) v = v == null ? v : v[k];
    let key = x.key;
    if (x.keyLoad) { const km = await x.keyLoad(); key = x.keyNamed ? km[x.keyNamed] : km.default; }
    if (v && x.kind !== 'import') setup.push({ ...x, v, key });
  }
  catch (e) { if (x.kind !== 'import') failed.push({ name: 'the app\\'s ' + (x.name || x.kind), why: String(e && e.message || e).split('\\n')[0] }); }
}
const drawn = [], given = {};
const install = (app) => {
  for (const x of setup) {
    try {
      if (x.kind === 'use') app.use(x.v);
      else if (x.kind === 'component' && !app._context.components[x.name]) app.component(x.name, x.v);
      else if (x.kind === 'directive' && !app._context.directives[x.name]) app.directive(x.name, x.v);
      else if (x.kind === 'global' && !(x.name in app.config.globalProperties)) app.config.globalProperties[x.name] = x.v;
      else if (x.kind === 'provide' && x.key != null && !(x.key in app._context.provides)) app.provide(x.key, x.v);
      else if (x.kind === 'mixin') app.mixin(x.v);
      else if (x.kind === 'call' && typeof x.v === 'function') x.v(app);
    } catch (e) { /* one the app already has, or that cannot be installed twice: the rest still installed */ }
  }
};
for (const g of GROUPS) {
  const sec = document.createElement('section'); sec.setAttribute('data-dse-component', g.name); sec.setAttribute('aria-label', g.name); main.append(sec);
  let C = null;
  try { C = (await LOAD[g.name]()).default; } catch (e) { failed.push({ name: g.name, component: g.name, why: String(e && e.message || e).split('\\n')[0] }); continue; }
  if (!C) { failed.push({ name: g.name, component: g.name, why: 'no component exported' }); continue; }
  drawn.push({ g, sec, C });
  for (const c of g.cases) {
    const box = document.createElement('div'); box.className = 'dse-case'; box.setAttribute('data-dse-case', c.label); sec.append(box);
    if (g.frame) { box.style.width = g.frame[0] + 'px'; box.style.height = g.frame[1] + 'px'; }
    const state = reactive(fit(C, c.props, g.role, g.options, g.fill, g.connect, g.fallback, g.numeric, g.icons));
    if (!given[g.name]) given[g.name] = Object.keys(state);
    const app = createApp({ render: () => h(C, { ...state, ...listeners(C, state) }) });
    app.config.errorHandler = (e) => failed.push({ name: g.name + ' (' + c.label + ')', component: g.name, case: c.label, of: g.cases.length, why: explain(g, e) });
    app.config.warnHandler = () => {};
    inherit(app);
    install(app);
${plugins.pinia ? "    if (!app.config.globalProperties.$pinia) app.use(createPinia());\n" : ''}${plugins.router ? "    if (!app.config.globalProperties.$router) app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/:any(.*)*', component: { render: () => null } }] }));\n" : ''}    try { app.mount(box); } catch (e) { failed.push({ name: g.name + ' (' + c.label + ')', component: g.name, case: c.label, of: g.cases.length, why: explain(g, e) }); }
    gather(box);
  }
}
// What the components load on their own (an async part, an icon fetched) arrives after they mount: the page is read
// once nothing has changed in it for a moment (at most eight seconds).
await new Promise((done) => {
  let t = null;
  const fin = () => { mo.disconnect(); clearTimeout(t); done(); };
  const mo = new MutationObserver(() => { clearTimeout(t); t = setTimeout(fin, 400); });
  mo.observe(main, { subtree: true, childList: true, attributes: true, characterData: true });
  t = setTimeout(fin, 400); setTimeout(fin, 8000);
});
// A component that drew nothing in any case, with nothing thrown (its template shows nothing for what it was given):
// said, with the props it was given none for, so the page says why of every component it does not draw.
for (const { g, sec, C } of drawn) {
  if (g.cases.length === 0 || failed.some((f) => f.component === g.name)) continue;
  if ([...sec.querySelectorAll('.dse-case')].some((b) => b.firstElementChild)) continue;
  const decl = Array.isArray(C.props) ? C.props : Object.keys(C.props || {});
  const none = decl.filter((d) => !(given[g.name] || []).includes(d));
  failed.push({ name: g.name, component: g.name, why: 'it drew nothing in any of its ' + g.cases.length + ' case' + (g.cases.length === 1 ? '' : 's') + ': its template shows nothing for the props it was given' + (none.length ? ' (none given for ' + none.join(', ') + ')' : '') });
}
window.__dseHarnessFailed = failed;
window.__dseHarnessReady = true;
})();
`;
}

// What the page of components drawn from their code says it could not draw (window.__dseHarnessFailed), per component:
// each component its own code stopped from drawing (an error it threw as it drew, a file that did not load, nothing
// drawn) once, with why and in how many of its cases. That is the component's own and the same on every run of the same
// files, so it is said (notDrawn) and the page is still whole and kept; what the page itself could not set up (the app's
// i18n did not load) is not drawn for every component, and is tried again (unrendered).
// → { notDrawn: ['planner (no month names, in 12 of its 14 cases)'], unrendered: ["the app's i18n (…)"] }
export function harnessNotDrawn(failed = []) {
  const notDrawn = [], unrendered = [], by = new Map();
  for (const f of failed ?? []) {
    if (!f?.component) { unrendered.push(`${f?.name} (${f?.why})`); continue; }
    const g = by.get(f.component) ?? { whys: [], cases: new Set(), of: f.of ?? null, whole: false };
    if (!g.whys.includes(f.why)) g.whys.push(f.why);
    if (f.case != null) g.cases.add(f.case); else g.whole = true;
    by.set(f.component, g);
  }
  for (const [name, g] of by) {
    const where = g.whole || !g.of ? '' : g.cases.size >= g.of ? ', in every case' : `, in ${g.cases.size} of its ${g.of} cases`;
    notDrawn.push(`${name} (${g.whys.slice(0, 2).join('; ')}${g.whys.length > 2 ? `; and ${g.whys.length - 2} more` : ''}${where})`);
  }
  return { notDrawn, unrendered };
}

// The page around the module: the system's own surface and text colour (pageColours), no motion.
const PAGE_STYLE = (surface, ink) => `body{margin:0;padding:16px;font-family:Inter,system-ui,sans-serif;${surface ? `background:var(${surface});` : ''}${ink ? `color:var(${ink});` : ''}}.dse-case{display:block;margin:0 0 12px}*,*::before,*::after{transition:none!important;animation:none!important}`;
const PAGE = (surface, ink, { head = '', script = `<script type="module" src="/${OUT_DIR}/vue-harness/entry.js"></script>`, lang = 'en' } = {}) => `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>Components</title>
<style data-dse-page>${PAGE_STYLE(surface, ink)}</style>${head}</head>
<body><main id="dse-harness"><h1>Components</h1></main>
${script}</body></html>`;

// The message of an error, its first line.
const why1 = (e) => String(e?.message ?? e).split('\n')[0];

// The harness for a project: its Vue components (a .vue file each) in their variants, served by its own build.
// names: the components to render; locate(name) → its file; read(file) → its text.
// → { url, close (a promise once it has stopped), groups, missing: [why], build: 'Vite' | 'Nuxt' | 'Vue CLI' |
// 'webpack' }, or { url: null, why } when nothing can be rendered.
export async function startVueHarness(ROOT, cfg, names, { propsSnap = {}, locate, read = (f) => readFileSync(f, 'utf8'), max = cfg.a11y?.maxVariants ?? 16 } = {}) {
  const groups = [], missing = [], samples = propSamples(ROOT), icons = iconPaths(ROOT), pageData = pageSamples(ROOT);
  let keyed = null;   // keyedNames, read once, with the first component
  let kinds = null;   // propKinds, read once, with the first component
  // The examples the design team placed in Figma (--figma-examples), each component opened as one of them.
  let examples = null; try { examples = JSON.parse(readFileSync(join(ROOT, cfg.paths?.snapshotExamples ?? join(dirname(cfg.paths?.snapshotVars ?? 'src/figma-vars.snapshot.json'), 'figma-examples.snapshot.json')), 'utf8')); } catch { /* not read yet */ }
  // The project's own Code Connect files, pairing each Figma property with the code's prop (code-connect-map.mjs).
  const { codeConnectMaps, codeConnectFor } = await import('./code-connect-map.mjs');
  let ccInclude = null; try { ccInclude = JSON.parse(readFileSync(join(ROOT, 'figma.config.json'), 'utf8'))?.codeConnect?.include ?? null; } catch { /* none */ }
  const ccMaps = codeConnectMaps(ROOT, { include: ccInclude });
  const { harnessCases, variantsFromCode, pageColours, codeCases, decidedCases } = await import('./component-harness.mjs');
  const { textComponentApi, componentSourceFiles } = await import('./component-source.mjs');
  const kindsOf = () => (kinds ??= propKinds(componentSourceFiles(ROOT, cfg), (f) => { try { return textComponentApi(f, read(f)); } catch { return null; } }));
  // A child's declared props, read once per file (a package's too).
  const childApis = new Map();
  const globals = Object.fromEntries(appSetup(ROOT).filter((x) => x.kind === 'component' && !x.named).map((x) => [x.name, x.spec]));
  const childApi = (f, t) => { if (!childApis.has(f)) { let a = null; try { a = textComponentApi(f, t); } catch { /* unreadable */ } childApis.set(f, a); } return childApis.get(f); };
  for (const name of names) {
    const file = locate(name);
    if (!file) { missing.push(`${name} (no component file found)`); continue; }
    if (!/\.vue$/.test(file)) continue;
    // A Showroom screen (showroom/<Screen>.vue): a whole page made of the system's components, drawn once as it is.
    // It is drawn in a frame of Figma's size (its <Screen>.json size): a screen fills the window it is given, and a
    // component in it (a table's fixed columns, a tab group's overflow) settles to the room it finds as it renders.
    if (name.startsWith('showroom:')) {
      let frame = [1280, 800]; try { const m = JSON.parse(readFileSync(resolve(ROOT, file).replace(/\.vue$/, '.json'), 'utf8')); if (Array.isArray(m.size)) frame = m.size; } catch { /* Figma's Laptop */ }
      groups.push({ name, file: resolve(ROOT, file), role: '', cases: [{ label: 'Screen', props: {} }], options: {}, fill: {}, connect: [], from: 'showroom', frame }); continue;
    }
    const role = String((propsSnap[name]?.annotations ?? []).map((a) => a?.label ?? '').join(' ').match(/\brole\s*[:=]\s*["']?([a-z][\w-]*)/i)?.[1] ?? '').toLowerCase();
    const named = /^(textbox|textfield|textinput|input|field|searchbox|spinbutton|stepper|numberinput|slider|combobox|listbox|select)$/.test(role);
    const label = name.charAt(0).toUpperCase() + name.slice(1);
    let text = ''; try { text = read(file); } catch { /* unreadable: Figma's variants only */ }
    const fromFigma = Object.keys(propsSnap[name]?.properties ?? {}).length > 0;
    const api = textComponentApi(file, text);
    // Figma's variants, then a case for each prop only the code has (selected, an alignment it documents), so the
    // Playground can show what its API takes.
    const example = bestExample(examples, name, propsSnap[name]);
    const figmaCases = fromFigma ? harnessCases(propsSnap[name], max, example) : null;
    const connect = codeConnectFor(ccMaps, name, propsSnap[name]?.nodeId)?.props ?? [];
    const choices = asyncChoices(ROOT, resolve(ROOT, file), text, keyed ??= keyedNames(ROOT), Object.keys(api.props ?? {}));
    const cases = withCaseChoices((figmaCases ? [...figmaCases, ...decidedCases(propsSnap[name], figmaCases[0]?.props ?? {}, connect), ...codeCases(figmaCases[0]?.props ?? {}, api, 8)] : variantsFromCode(api, text, max, kindsOf())).map((c) => (named ? { ...c, props: { 'aria-label': label, ...c.props } } : c)), choices);
    const options = Object.fromEntries(Object.entries(api.props ?? {}).filter(([, d]) => d.options?.length).map(([k, d]) => [k, d.options]));
    const objects = Object.entries(api.props ?? {}).filter(([, d]) => /^object$/i.test(d.type ?? '') && d.default == null).map(([k]) => k);
    // What it passes on to the children it draws, as they take it (childFacing).
    const declared = Object.keys(api.props ?? {});
    const onward = childFacing(ROOT, resolve(ROOT, file), text, childApi, read, globals);
    const fill = withChoices({ ...objectSamples(text, objects, samples, kindsOf(), { ...onward, keyed }), ...listSamples(text, declared, samples, example, icons, kindsOf()), ...(pageData[resolve(ROOT, file)] ?? {}) }, choices);
    const fallback = [...new Set([...fallbackProps(text, declared), ...onward.fallback.filter((p) => declared.includes(p) && api.props[p]?.default == null)])];
    // The elements its template names (ref="field") and the methods its code calls on them (field.value.focus()).
    const refs = [...new Set([...String(/<template\b[\s\S]*<\/template>/.exec(text)?.[0] ?? '').matchAll(/\sref\s*=\s*["']([A-Za-z_$][\w$]*)["']/g)].map((m) => m[1]))]
      .map((r) => ({ name: r, methods: [...new Set([...text.matchAll(new RegExp(`\\b${r}\\.value\\??\\.([A-Za-z_$][\\w$]*)\\s*\\(`, 'g'))].map((m) => m[1]))] }));
    groups.push({ name, file: resolve(ROOT, file), role, cases, options, fill, connect, fallback, numeric: onward.numeric.filter((p) => declared.includes(p)), icons: onward.icons.filter((p) => declared.includes(p)), refs, from: fromFigma ? 'figma' : 'code' });
  }
  if (!groups.length) return { url: null, why: 'no Vue component file (.vue) for the design system\'s components' };
  const pb = await projectBuild(ROOT);
  if (!pb.kind) return { url: null, why: pb.why };
  // The page's module beside the engine's other output, where the project's build serves it from.
  const dir = join(ROOT, OUT_DIR, 'vue-harness');
  mkdirSync(dir, { recursive: true });
  const themes = [cfg.paths?.themeCSS].flat().filter((f) => f && !/^https?:/.test(f));
  const css = themes.map((f) => { try { return readFileSync(join(ROOT, f), 'utf8'); } catch { return ''; } }).join('\n');
  const colours = pageColours(css);
  const plugins = { ...appPlugins(ROOT), samples, icons, teleports: teleportTargets(ROOT) };
  const started = pb.kind === 'nuxt' ? await startNuxt(ROOT, pb, dir, groups, cfg, colours, plugins)
    : pb.kind === 'webpack' ? await startWebpack(ROOT, pb, dir, groups, cfg, colours, themes, plugins)
      : await startVite(ROOT, pb, dir, groups, cfg, colours, plugins);
  return started.url ? { ...started, groups, missing, build: pb.label } : { url: null, why: started.why };
}

// Vite: its dev server in middleware mode, the page's module imported by its path from the project's root.
async function startVite(ROOT, pv, dir, groups, cfg, { surface, ink }, plugins = {}) {
  const fromRoot = (f) => '/' + relative(ROOT, f).split(sep).join('/');
  writeFileSync(join(dir, 'entry.js'), harnessModule(groups.map((g) => ({ ...g, file: fromRoot(g.file) })), globalStyles(ROOT, cfg), plugins));
  let vite;
  try {
    vite = await pv.vite.createServer({
      root: ROOT, configFile: pv.config ? join(ROOT, pv.config) : false, plugins: pv.plugins, logLevel: 'silent', clearScreen: false, appType: 'custom',
      cacheDir: join(ROOT, OUT_DIR, 'vite-cache'),
      server: { middlewareMode: true, hmr: false, watch: null, fs: { strict: false } },
      // Vue, and every package the project's own code imports, is bundled before the page loads: a CommonJS one
      // (moment-timezone) is converted so its default import works, the page never reloads halfway for one found late,
      // and they all share the one Vue.
      optimizeDeps: { noDiscovery: true, include: ['vue', ...(plugins.pinia ? ['pinia'] : []), ...(plugins.router ? ['vue-router'] : []), ...runtimeDeps(ROOT)] },
    });
  } catch (e) { return { why: `the project's Vite did not start (${why1(e)})` }; }
  const page = PAGE(surface, ink);
  const http = createServer(async (req, res) => {
    if (req.url.split('?')[0] === '/__dse-vue-harness.html') {
      try { const html = await vite.transformIndexHtml(req.url, page); res.writeHead(200, { 'content-type': 'text/html' }); return res.end(html); }
      catch (e) { res.writeHead(500); return res.end(String(e)); }
    }
    vite.middlewares(req, res, () => { res.writeHead(404); res.end(); });
  });
  await new Promise((r) => http.listen(0, '127.0.0.1', r));
  const close = () => { try { http.close(); } catch { /* closed */ } return vite.close().catch(() => {}); };
  return { url: `http://127.0.0.1:${http.address().port}/__dse-vue-harness.html`, close };
}

// Nuxt: the project's whole app in its dev server (its modules, plugins, auto-imports and components, the CSS its
// config names), with the page every route shows replaced by the components' own; client-side only, its build files
// beside the engine's other output.
async function startNuxt(ROOT, pb, dir, groups, cfg, { surface, ink }, plugins = {}) {
  const abs = (s) => (s.startsWith('/') ? join(ROOT, s) : s);
  writeFileSync(join(dir, 'entry.js'), harnessModule(groups, globalStyles(ROOT, cfg).map(abs), plugins));
  const main = join(dir, 'Harness.vue');
  writeFileSync(main, `<script setup>
import { onMounted, getCurrentInstance } from 'vue';
const app = getCurrentInstance().appContext.app;
onMounted(() => { window.__dseParentApp = app; import(${JSON.stringify(join(dir, 'entry.js'))}); });
</script>
<template><main id="dse-harness"><h1>Components</h1></main></template>
<style>${PAGE_STYLE(surface, ink)}</style>
`);
  let nuxt = null, listener = null, kit = null, level;
  // Its build says what it does on the console Nuxt's tools share: quiet for as long as it serves the page.
  const quiet = (on) => { if (!kit?.logger) return; if (on) { level = kit.logger.level; kit.logger.level = -Infinity; } else if (level !== undefined) kit.logger.level = level; };
  try {
    kit = await import(pb.kit);
    quiet(true);
    nuxt = await kit.loadNuxt({ cwd: ROOT, dev: true, ready: false, overrides: {
      // Its types too (Nuxt 4.6 writes them apart from the build, in the project's own .nuxt unless told where).
      ssr: false, logLevel: 'silent', telemetry: false, devtools: { enabled: false }, buildDir: join(ROOT, OUT_DIR, 'nuxt-build'), typesDir: join(ROOT, OUT_DIR, 'nuxt-build'),
      vite: { clearScreen: false, logLevel: 'silent', cacheDir: join(ROOT, OUT_DIR, 'vite-cache'), server: { hmr: false } },
      hooks: { 'app:resolve': (app) => { app.mainComponent = main; } },
    } });
    await nuxt.ready();
    await kit.buildNuxt(nuxt);
    const s = nuxt.server;
    if (typeof s?.listen === 'function') listener = await s.listen(0, { hostname: '127.0.0.1', showURL: false, open: false, qr: false, public: false });
    else if (typeof s?.handler === 'function' || typeof s?.fetch === 'function') {
      const handle = typeof s.handler === 'function' ? s.handler : fetchHandler(s.fetch);
      const http = createServer((req, res) => handle(req, res));
      await new Promise((r) => http.listen(0, '127.0.0.1', r));
      listener = { url: `http://127.0.0.1:${http.address().port}/`, close: () => new Promise((r) => http.close(r)) };
    } else throw new Error('its dev server has no way to listen the engine knows');
  } catch (e) { try { await nuxt?.close(); } catch { /* not started */ } quiet(false); return { why: `the project's Nuxt did not start (${why1(e)})` }; }
  const close = () => Promise.allSettled([listener.close?.(), nuxt.close()]).then(() => quiet(false));
  return { url: String(listener.url).replace(/\/?$/, '/'), close };
}

// A server that answers with fetch (a Request in, a Response out), as a Node request handler.
function fetchHandler(fetch) {
  return async (req, res) => {
    try {
      const r = await fetch(new Request(`http://${req.headers.host ?? '127.0.0.1'}${req.url}`, { method: req.method, headers: Object.entries(req.headers).filter(([, v]) => typeof v === 'string') }));
      res.writeHead(r.status, Object.fromEntries(r.headers));
      res.end(Buffer.from(await r.arrayBuffer()));
    } catch (e) { res.writeHead(500); res.end(String(e)); }
  };
}

// Webpack, as Vue CLI resolves it (vue.config.js applied) or as the project's webpack.config says: the components
// built once with it, its loaders and plugins (vue-loader, its SCSS), into a folder of the engine's output, then served
// with the page. The token CSS is the page's own stylesheet, so what the build adds can be told from it.
const NOT_FOR_A_PAGE = /^(HtmlWebpackPlugin|HtmlPlugin|CopyPlugin|CopyWebpackPlugin|FriendlyErrorsWebpackPlugin|ESLintWebpackPlugin|ESLintPlugin|ForkTsCheckerWebpackPlugin|ProgressPlugin|PreloadPlugin|PreloadWebpackPlugin|BundleAnalyzerPlugin|HotModuleReplacementPlugin|WorkboxPlugin|GenerateSW|InjectManifest)$/;
const usesVueLoader = (config) => JSON.stringify(config?.module?.rules ?? [], (k, v) => (v instanceof RegExp ? String(v) : typeof v === 'function' ? undefined : v)).includes('vue-loader');
async function startWebpack(ROOT, pb, dir, groups, cfg, { surface, ink }, themes, plugins = {}) {
  const plainTheme = new Set(themes.filter((f) => /\.css$/i.test(f)).map((f) => '/' + String(f).replace(/^\.?\//, '')));
  const styles = globalStyles(ROOT, cfg).filter((s) => !plainTheme.has(s)).map((s) => (s.startsWith('/') ? join(ROOT, s) : s));
  writeFileSync(join(dir, 'entry.js'), harnessModule(groups, styles, plugins));
  const env = { ...process.env };
  const restore = () => { for (const k of Object.keys(process.env)) if (!(k in env)) delete process.env[k]; Object.assign(process.env, env); delete process.VUE_CLI_SERVICE; };
  let config, webpack;
  try {
    if (pb.cli) {
      const r = createRequire(join(pb.cli, 'package.json'));
      const Service = r('./lib/Service');
      const service = new Service(ROOT);
      await service.init('development');
      config = service.resolveWebpackConfig();
      webpack = r('webpack');
    } else {
      const file = join(ROOT, pb.config);
      let c;
      try { c = createRequire(file)(file); } catch (e) { if (!/ERR_REQUIRE_ESM|Cannot use import statement|import\.meta|ERR_REQUIRE_ASYNC_MODULE/.test(String(e?.code ?? '') + why1(e))) throw e; c = await import(pathToFileURL(file).href); }
      c = c?.default ?? c;
      if (typeof c === 'function') c = await c({}, { mode: 'development' });
      if (Array.isArray(c)) c = c.find((x) => usesVueLoader(x) && x.target !== 'node') ?? c[0];
      config = c;
      webpack = createRequire(join(ROOT, 'package.json'))('webpack');
    }
  } catch (e) { restore(); return { why: `the project's ${pb.label} config could not be read (${why1(e)})` }; }
  if (!usesVueLoader(config)) { restore(); return { why: `the project's ${pb.label} config has no vue-loader rule for its .vue files` }; }
  const out = join(dir, 'dist');
  const output = { ...(config.output ?? {}), path: out, publicPath: '/dist/', filename: '[name].js', chunkFilename: 'chunk-[id].js', clean: true };
  for (const k of ['library', 'libraryTarget', 'libraryExport', 'module']) delete output[k];
  let stats;
  try {
    const compiler = webpack({
      ...config, mode: 'development', context: ROOT, entry: { 'dse-harness': join(dir, 'entry.js') }, output, devtool: false, watch: false, cache: false,
      devServer: undefined, stats: 'errors-only', infrastructureLogging: { level: 'none' }, performance: { hints: false },
      optimization: { ...(config.optimization ?? {}), splitChunks: false, runtimeChunk: false, minimize: false },
      plugins: (config.plugins ?? []).filter((p) => !NOT_FOR_A_PAGE.test(p?.constructor?.name ?? '')),
    });
    stats = await new Promise((done, fail) => compiler.run((err, st) => (err ? fail(err) : compiler.close(() => done(st)))));
  } catch (e) { return { why: `the project's ${pb.label} build did not run (${why1(e)})` }; }
  finally { restore(); }
  const info = stats.toJson({ all: false, entrypoints: true, errors: true });
  const assets = (info.entrypoints?.['dse-harness']?.assets ?? []).map((a) => (typeof a === 'string' ? a : a.name));
  if (!assets.some((a) => /\.js$/.test(a))) return { why: `the project's ${pb.label} build failed (${String(info.errors?.[0]?.message ?? info.errors?.[0] ?? 'no script written').split('\n')[0]})` };
  const page = PAGE(surface, ink, {
    head: [...plainTheme].map((f) => `<link rel="stylesheet" href="${f}" data-dse-theme>`).join('') + assets.filter((a) => /\.css$/.test(a)).map((a) => `<link rel="stylesheet" href="/dist/${a}">`).join(''),
    script: assets.filter((a) => /\.js$/.test(a)).map((a) => `<script src="/dist/${a}"></script>`).join(''),
  });
  // The page, the build's files and the project's own (the token CSS and what it links to), nothing outside it.
  const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.json': 'application/json' };
  const http = createServer((req, res) => {
    const path = decodeURIComponent(req.url.split('?')[0]);
    if (path === '/__dse-vue-harness.html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(page); }
    const file = path.startsWith('/dist/') ? resolve(out, '.' + path.slice(5)) : resolve(ROOT, '.' + path);
    if (!(file.startsWith(out + sep) || file.startsWith(resolve(ROOT) + sep)) || !existsSync(file)) { res.writeHead(404); return res.end(); }
    try { const body = readFileSync(file); res.writeHead(200, { 'content-type': TYPES[(file.match(/\.\w+$/) ?? [''])[0].toLowerCase()] ?? 'application/octet-stream' }); res.end(body); }
    catch { res.writeHead(404); res.end(); }
  });
  await new Promise((r) => http.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${http.address().port}/__dse-vue-harness.html`, close: () => { try { http.close(); } catch { /* closed */ } } };
}

// What each Vue component renders, by default and in each of its variants (max: how many, the default first), and the
// CSS the project's build gives it (its <style> blocks, SCSS compiled, scoped ones with their data-v attribute), read
// from the harness page in Chrome, so the style guide draws the component as it ships. The project's token CSS
// (themeCSS) is left out: the page has it already.
// → { markup: { name: html }, cases: { name: [{ label, props, markup }] }, css, failed: [{ name, why }], build }, or
// { markup: {}, cases: {}, css: '', why } when it cannot render.
export async function renderedVue(ROOT, cfg, names, { propsSnap = {}, locate, read, chromePath = null, max = 1 } = {}) {
  const none = (why) => ({ markup: {}, cases: {}, css: '', failed: [], why });
  if (typeof WebSocket === 'undefined') return none('Node 22 or later is needed to drive Chrome');
  const { findChrome, launchChrome, connectCDP, openPage, waitForTrue } = await import('./cdp.mjs');
  const chrome = chromePath ?? findChrome({ playwright: true });
  if (!chrome) return none('Chrome not found (set CHROME_PATH)');
  const h = await startVueHarness(ROOT, cfg, names, { propsSnap, locate, read, max });
  if (!h.url) return none(h.why);
  const theme = [cfg.paths?.themeCSS].flat().filter(Boolean).map((f) => String(f).replace(/^\.?\//, ''));
  let browser = null, cdp = null;
  try {
    browser = await launchChrome(chrome, { tmpPrefix: 'dse-vue-' });
    cdp = await connectCDP(browser.wsUrl);
    // What the page throws while it loads, so a page that never finishes says why.
    const thrown = [];
    cdp.on('Runtime.exceptionThrown', (p) => thrown.push(p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text ?? ''));
    cdp.on('Runtime.consoleAPICalled', (p) => { if (p.type === 'error') thrown.push(p.args.map((a) => a.value ?? a.description ?? '').join(' ')); });
    const { sessionId } = await openPage(cdp.send, h.url);
    if (!(await waitForTrue(cdp.send, sessionId, 'window.__dseHarnessReady === true', { attempts: 1200, intervalMs: 50, tolerateErrors: true }))) {
      const first = thrown.map((t) => String(t).split('\n')[0]).filter(Boolean)[0];
      return none(`the page of its components did not finish within a minute${first ? ` (it threw: ${first.slice(0, 200)})` : ''}`);
    }
    // The build's own stylesheets: Vite's and Nuxt's carry the file they come from; webpack's are every one the page
    // did not bring itself.
    const expr = `(() => {
      const THEME = ${JSON.stringify(theme)}, VITE = ${JSON.stringify(h.build !== 'Vue CLI' && h.build !== 'webpack')};
      const html = (b) => b.innerHTML.replace(/<!--[\\s\\S]*?-->/g, '').trim();
      // A state the browser keeps on the element and not in its markup (a checkbox's indeterminate, set from script):
      // written as an attribute, so the page that shows the markup gives it back.
      for (const i of document.querySelectorAll('input')) { if (i.indeterminate) i.setAttribute('data-dse-indeterminate', ''); }
      const cases = Object.fromEntries([...document.querySelectorAll('[data-dse-component]')].map((s) => [s.getAttribute('data-dse-component'), [...s.querySelectorAll('[data-dse-case]')].map((b) => ({ label: b.getAttribute('data-dse-case'), markup: html(b) })).filter((c) => /^<[a-z]/.test(c.markup))]));
      const own = (s) => {
        if (s.hasAttribute('data-dse-page') || s.hasAttribute('data-dse-theme')) return false;
        const id = s.getAttribute('data-vite-dev-id');
        if (!VITE) return true;
        return !!id && !/\\/vue-harness\\//.test(id) && !THEME.some((t) => id.endsWith('/' + t));
      };
      const css = [...document.querySelectorAll('style, link[rel="stylesheet"]')].filter(own).map((s) => (s.tagName === 'STYLE' ? s.textContent : [...((s.sheet && s.sheet.cssRules) || [])].map((r) => r.cssText).join('\\n'))).join('\\n');
      return JSON.stringify({ cases, css, failed: window.__dseHarnessFailed || [] });
    })()`;
    const r = JSON.parse((await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true }, sessionId)).result?.value ?? '{}');
    const props = Object.fromEntries(h.groups.map((g) => [g.name, Object.fromEntries(g.cases.map((c) => [c.label, c.props]))]));
    const cases = Object.fromEntries(Object.entries(r.cases ?? {}).filter(([, l]) => l.length).map(([n, l]) => [n, l.map((c) => ({ ...c, props: props[n]?.[c.label] ?? {} }))]));
    // The first case is the default: what the component renders with nothing set.
    const markup = Object.fromEntries(Object.entries(cases).filter(([n, l]) => l[0].label === h.groups.find((g) => g.name === n)?.cases[0]?.label).map(([n, l]) => [n, l[0].markup]));
    // The lists each one was given (a bar's tabs, from Figma's example), so its code says them as its drawing has them.
    const lists = Object.fromEntries((h.groups ?? []).filter((g) => g.fill && Object.keys(g.fill).length).map((g) => [g.name, g.fill]));
    return { markup, cases, lists, css: String(r.css ?? '').replace(/\/\*# sourceMappingURL=[^*]*\*\/\s*/g, ''), failed: r.failed ?? [], build: h.build };
  } catch (e) { return none(why1(e)); }
  finally { try { cdp?.close(); } catch { /* closed */ } try { browser?.kill(); } catch { /* gone */ } await h.close(); }
}

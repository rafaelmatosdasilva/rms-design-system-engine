// usage-map.mjs - where each component lives: the next larger context to know before changing one.
//
// For each component: the products whose code uses it (how many files, how many times), the system's own pages that
// show it, the components it sits inside and the ones it holds (Figma's nesting, and what the code was seen to nest),
// and the Figma screens that draw it. The audit builds it once, from the files the catalog already walks, and writes it
// into each contract (livesIn) and the catalog; --query prints it and the differences list names it beside a component.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { classUseCounts } from './class-use.mjs';
import { codeRoots } from './code-roots.mjs';

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const squash = (x) => String(x).toLowerCase().replace(/[^a-z0-9]/g, '');
const words = (n) => String(n).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// The product a file belongs to, by its full name: ds-config.json pluginDirs (a product in its own folder or repository)
// or apps/<app>, named as styleguide.plugins names it, else the app's name in words. null for the system's own files.
export function productResolver(ROOT, cfg = {}) {
  const named = cfg.styleguide?.plugins ?? [];
  const apps = cfg.paths?.plugins ?? [];
  const dirs = Object.entries(cfg.pluginDirs ?? {}).map(([app, d]) => [app, resolve(ROOT, d)]);
  const nameOf = (app) => { const g = named.find((p) => p.match === app || p.key === app || (p.match && app.includes(p.match))); return g?.name ?? words(app); };
  return (abs) => {
    const own = dirs.find(([, d]) => abs === d || abs.startsWith(d + sep));
    if (own) return nameOf(own[0]);
    const rel = relative(resolve(ROOT), abs).split(sep);
    const app = apps.find((a) => rel.some((part, i) => part === a && i > 0 && /^(apps|plugins|packages)$/.test(rel[i - 1])));
    return app ? nameOf(app) : null;
  };
}

// The markup files a component can be used in: the products' code and the system's own pages ({ file, text, product,
// productName }), the same walk the catalog's real examples read. product: true for a file in a product's own root.
export function productFiles(ROOT, cfg = {}, { limit = 4000 } = {}) {
  const roots = codeRoots(ROOT, cfg);
  const productOf = productResolver(ROOT, cfg);
  const files = [];
  const walk = (dir, product, depth = 0) => {
    if (depth > 8 || files.length > limit) return;
    let list = [];
    try { list = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of list) {
      if (e.name.startsWith('.') || /^(node_modules|dist|build|coverage|out|style-?guide)$/.test(e.name)) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p, product, depth + 1);
      else if (/\.(jsx|tsx|vue|svelte|mdx|html?)$/i.test(e.name) && !/\.(test|spec)\./.test(e.name) && !/\.min\./.test(e.name)) {
        try { files.push({ file: relative(ROOT, p), text: readFileSync(p, 'utf8'), product, productName: productOf(p) }); } catch { /* unreadable */ }
      }
    }
  };
  roots.forEach((r, i) => walk(r, i > 0));
  // A page built from a source beside it (ui.html from ui.src.html) is the same use: only the source is counted.
  const have = new Set(files.map((f) => f.file));
  return files.filter((f) => !have.has(f.file.replace(/\.(\w+)$/, '.src.$1')));
}

// How many times a file uses a component: its tag (<Chip …>, <chip-x> in a template), and its class put on an element.
export function usesIn(name, cls, file, text, counts = null) {
  let n = 0;
  if (/\.(jsx|tsx|vue|svelte|mdx)$/i.test(file)) {
    const tag = name.charAt(0).toUpperCase() + name.slice(1);
    const kebab = name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
    n += (text.match(new RegExp(`<${esc(tag)}(?=[\\s/>])`, 'g')) ?? []).length;
    if (/\.(vue|svelte)$/i.test(file) && kebab.includes('-')) n += (text.match(new RegExp(`<${esc(kebab)}(?=[\\s/>])`, 'g')) ?? []).length;
  }
  const c = cls ? String(cls).match(/^[.#]?([A-Za-z][\w-]*)/)?.[1] : null;
  if (c) n += (counts ?? classUseCounts(text)).get(c) ?? 0;
  return n;
}

// names: the system's components · files: productFiles(…) · classFor: name → its class · composition: Figma's nesting
// ({ parent: [child] }) · codeNesting: the code snapshot's nesting ({ parent: { contains: { child } } }) · screens: the
// screen components snapshot ({ screens: { id: { name, components: { name: count } } } }).
// → { <name>: { products: [{ name, files, uses }], files: [{ file, uses, product }], inside: [], holds: [], screens: [{ screen, count }] } }
export function usageMap(names, { files = [], classFor = null, composition = {}, codeNesting = {}, screens = {} } = {}) {
  const known = new Set(names);
  const counts = new Map();
  const out = Object.fromEntries(names.map((n) => [n, { products: [], files: [], inside: [], holds: [], screens: [] }]));
  for (const name of names) {
    const cls = classFor ? classFor(name) : null;
    const byProduct = new Map();
    for (const f of files) {
      if (squash(f.file.split('/').pop().replace(/\.[^.]+$/, '')) === squash(name)) continue;   // its own definition
      if (!counts.has(f.file)) counts.set(f.file, classUseCounts(f.text));
      const uses = usesIn(name, cls, f.file, f.text, counts.get(f.file));
      if (!uses) continue;
      out[name].files.push({ file: f.file, uses, ...(f.productName ? { product: f.productName } : {}) });
      const key = f.productName ?? '';
      const p = byProduct.get(key) ?? { name: f.productName ?? null, files: 0, uses: 0 };
      p.files++; p.uses += uses; byProduct.set(key, p);
    }
    out[name].products = [...byProduct.values()].sort((a, b) => (a.name === null) - (b.name === null) || b.uses - a.uses);
    out[name].files.sort((a, b) => b.uses - a.uses || a.file.localeCompare(b.file));
    out[name].files = out[name].files.slice(0, 12);
  }
  // The next larger context: the components it sits inside, and the ones it holds. An icon is not a component here.
  const isComp = (n) => known.has(n) && !/^icon[-/ ]/i.test(n);
  const nest = (parent, child) => {
    if (parent === child || !isComp(parent) || !isComp(child)) return;
    if (!out[parent].holds.includes(child)) out[parent].holds.push(child);
    if (!out[child].inside.includes(parent)) out[child].inside.push(parent);
  };
  for (const [parent, list] of Object.entries(composition ?? {})) if (!parent.startsWith('_') && Array.isArray(list)) for (const child of list) nest(parent, child);
  for (const [parent, seen] of Object.entries(codeNesting ?? {})) for (const child of Object.keys(seen?.contains ?? {})) nest(parent, child);
  for (const s of Object.values(screens?.screens ?? {})) {
    for (const [name, count] of Object.entries(s?.components ?? {})) if (out[name]) out[name].screens.push({ screen: s.name ?? s.plugin ?? '?', count });
  }
  for (const u of Object.values(out)) { u.inside.sort(); u.holds.sort(); u.screens.sort((a, b) => b.count - a.count); }
  return out;
}

// The usage as lines to read: where it lives, what it sits inside and holds, and the Figma screens that draw it.
export function usageLines(u, { indent = '  ' } = {}) {
  if (!u) return [];
  const n = (k, one, many) => `${k} ${k === 1 ? one : many}`;
  const where = (u.products ?? []).map((p) => `${p.name ?? "the system's own pages"} (${n(p.files, 'file', 'files')}, ${n(p.uses, 'use', 'uses')})`);
  const lines = [`${indent}lives in: ${where.length ? where.join(' · ') : 'no product code uses it yet'}`];
  if (u.inside?.length) lines.push(`${indent}inside: ${u.inside.join(', ')}`);
  if (u.holds?.length) lines.push(`${indent}holds: ${u.holds.join(', ')}`);
  if (u.screens?.length) lines.push(`${indent}on Figma screens: ${u.screens.map((s) => `${s.screen} (${s.count})`).join(' · ')}`);
  return lines;
}

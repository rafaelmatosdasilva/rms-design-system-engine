// product-code-pages.mjs - how this product's own pages are actually built, read from its code.
//
// The conventions a new page is held to were read from the prototypes already drawn and from the screens designed in
// Figma. A project that has neither - which is every project on its first day - got nothing, and the catalog told an
// agent "no page has been drawn yet, so there are no patterns". Meanwhile the product's real pages sat in the same
// checkout, built by the people whose system this is.
//
// Measured against the documentation alone, three of the thirty-six runs arranged a new page unlike the product's
// other page, with that page in the same project. Prose about how to compose a page is weak. Evidence of how these
// pages are actually composed is the strongest signal there is, and it costs nothing to read.
//
// What is read is only what code says for certain: which of the system's components a page holds and in what order,
// which of them make its frame, what each action is called, and where the actions sit. Spacing and text styles are
// not read here - they live in CSS and in classes, and guessing them from code would put a number in front of an
// agent that nobody checked. Those still come from the prototypes and from Figma.
import { readdirSync, statSync } from 'node:fs';
import { join, relative, basename } from 'node:path';

// Where a product keeps its pages, as every framework's conventions name them.
const PAGE_DIR = /(^|\/)(views?|pages?|screens?|routes?)(\/|$)/i;
const PAGE_FILE = /\.(vue|svelte|jsx|tsx)$/i;
// Folders no product's pages are in.
const SKIP = /(^|\/)(node_modules|dist|build|coverage|\.git|\.design-system-engine-out|prototypes|test|tests|__tests__|stories)(\/|$)/i;

// Every file that is one of the product's pages. A page is a file in a folder named for pages, or the app's own
// root file: a component is not a page, however it is written.
export function codePageFiles(ROOT, { dirs = ['src', 'app', 'apps'], most = 40 } = {}) {
  const out = [];
  const walk = (dir) => {
    let entries = [];
    try { entries = readdirSync(join(ROOT, dir), { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const rel = `${dir}/${e.name}`;
      if (SKIP.test(rel)) continue;
      if (e.isDirectory()) { walk(rel); continue; }
      if (!PAGE_FILE.test(e.name)) continue;
      if (PAGE_DIR.test(dir) || /^App\.(vue|svelte|jsx|tsx)$/i.test(e.name)) out.push(rel);
    }
  };
  for (const d of dirs) walk(d);
  // Oldest first: where nothing is shared yet, the page made first sets the product's decisions, as the prototypes do.
  return out.map((f) => { let made = 0; try { const st = statSync(join(ROOT, f)); made = st.birthtimeMs || st.mtimeMs; } catch { /* unknown */ } return { file: f, made }; })
    .sort((a, b) => a.made - b.made).slice(0, most);
}

// A page-check tree (page-check.mjs, each node marked with the system component it is) in the shape the conventions
// read (product-conventions.mjs pageFacts): the system's components by name, headings as Text, and everything else
// as arrangement, so the frame is read through a product's own wrappers rather than stopped by them.
const HEADING = /^h([1-6])$/i;
const labelAttr = /^(label|text|title|heading|aria-label)$/i;
export function pageShape(tree, { markup = '', actionNames = [] } = {}) {
  const actions = new Set(actionNames);
  const textOf = (n) => {
    if (n.end == null) return null;
    const close = markup.indexOf(`</${n.tag}`, n.end);
    const inner = close > n.end ? markup.slice(n.end, close) : '';
    const t = inner.replace(/<[^>]*>/g, ' ').replace(/\{\{[^}]*\}\}|\{[^}]*\}/g, ' ').replace(/\s+/g, ' ').trim();
    return t && t.length <= 80 ? t : null;
  };
  const conv = (n) => {
    const props = Object.fromEntries((n.attrs ?? []).filter((a) => a.name).map((a) => [String(a.name).replace(/^[:@]|^v-bind:/, ''), a.value == null ? true : String(a.value).replace(/^['"`]|['"`]$/g, '')]));
    const children = (n.children ?? []).map(conv).filter(Boolean);
    if (n.system) {
      const label = Object.entries(props).find(([k]) => labelAttr.test(k))?.[1];
      return { component: n.system, props: { ...props, ...(typeof label === 'string' ? { Label: label } : (textOf(n) ? { Label: textOf(n) } : {})) }, children };
    }
    const h = HEADING.exec(n.tag ?? '');
    if (h) return { component: 'Text', props: { as: `h${h[1]}`, text: textOf(n) ?? '' }, children: [] };
    // Anything else the product wrote is arrangement: seen through, never counted as one of the system's parts.
    // One holding nothing but actions is a row of actions, whatever element the product wrote it as: that is what
    // tells where this product puts them, which is the thing a new page is held to.
    const row = children.length && children.every((k) => actions.has(k.component));
    return { component: row ? 'Row' : 'Stack', props: {}, children };
  };
  let children = (tree?.children ?? []).map(conv).filter(Boolean);
  // A real page is usually one wrapper holding everything (a <main>, a layout div). That wrapper is the page, so it
  // is lifted away: left in, the page looks like it holds one part, and where its actions sit cannot be read at all.
  while (children.length === 1 && children[0].component === 'Stack' && (children[0].children ?? []).length) children = children[0].children;
  return { component: 'Page', props: {}, children };
}

// What each page of the product says, in the shape productPages keeps. read(file) → { tree, markup } or null.
// → { [name]: facts }, each marked as read from the code so a person knows where a convention came from.
export function codePages(ROOT, files, read, facts, { actionNames = [] } = {}) {
  const out = {};
  for (const { file, made } of files) {
    const page = read(file);
    if (!page?.tree) continue;
    const name = basename(file).replace(/\.[^.]+$/, '');
    if (out[name]) continue;
    const f = facts(pageShape(page.tree, { markup: page.markup ?? '', actionNames }));
    // A file with none of the system's components in it says nothing about how the system is composed.
    if (!f || (!f.frame.length && !f.intents.length && !f.heading)) continue;
    out[name] = { ...f, designed: false, fromCode: true, label: `${name} (this product's own page, ${relative('.', file)})`, text: [], file, made };
  }
  return out;
}

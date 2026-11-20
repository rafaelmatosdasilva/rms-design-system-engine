// storybook-stories.mjs - a team's own stories as the pages the browser checks run on.
//
// The engine draws its own canvas for a component: it reads the component's code, works out its variants, and mounts
// each one (component-harness.mjs, vue-harness.mjs). A team with Storybook has already done that and better - every
// component in every state it cares about, with the content it really carries, on a page that runs the component's
// own script. Those pages are the ones worth checking, and the engine was drawing its own beside them.
//
// This reads what Storybook already publishes and nothing else:
//   • a static build's index (storybook-static/index.json, or stories.json from Storybook 6);
//   • the same two paths on a running Storybook, which is what the accessibility check already discovers.
// Both are the same shape, so one reader serves both. Nothing here starts a server or fetches: the caller gives the
// index it read, so this stays pure and a test needs no network.
//
// A story is a component **in one state** - that is what makes it worth more than the drawn canvas - so the stories
// are kept per component and never collapsed to one. "Components/Button" with Primary, Disabled and Loading is one
// component with three pages to check, each named as the team named it.
//
// A story also says which state it shows, in its args: { size: 'small', disabled: true }. Read from the page Storybook
// draws (its own preview keeps them), they are the variant Figma would call it, and a story that shows a state Figma
// has no variant for is named, since nobody designed what it draws.
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { conceptOf, conceptOfName } from './state-concepts.mjs';

// The component a story is about: the last segment of its title, as the index itself groups them
// ("Components/Forms/Button" → Button). Storybook's own grouping, never a name this invents.
export const componentOf = (entry) => String(entry?.title ?? entry?.kind ?? '').split('/').map((s) => s.trim()).filter(Boolean).pop() ?? null;

// Every story in the index, by the component it is about, each with the name the team gave that state.
// A docs page is not a story: it draws prose, and checking it says nothing about the component.
// → { [component]: [{ id, state, title, file }] }
export function storiesByComponent(index, ROOT = '') {
  const out = {};
  for (const e of Object.values(index?.entries ?? index?.stories ?? {})) {
    if ((e?.type ?? 'story') !== 'story') continue;
    const component = componentOf(e);
    const id = e?.id ? String(e.id) : null;
    if (!component || !id) continue;
    (out[component] ??= []).push({ id, state: String(e.name ?? '').trim() || null,
      title: String(e.title ?? e.kind ?? '').trim() || null,
      file: e.componentPath ? resolve(ROOT, e.componentPath) : null });
  }
  return out;
}

// The page that draws one story on its own, with no Storybook furniture around it: its own iframe, which is what
// Storybook itself loads in its preview pane.
export const storyUrl = (base, id) => `${String(base).replace(/\/+$/, '')}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`;

// The stories of the components this run is about, in the order the components were given, each with its page.
// A component with no story is said rather than dropped: the run checks it the way it always did, and the person can
// see which components their Storybook does not cover. → { pages: [{ component, state, id, url }], without: [name] }
export function pagesFor(names = [], byComponent = {}, base = '') {
  const pages = [], without = [];
  for (const name of names) {
    const stories = byComponent[name] ?? byComponent[String(name).trim()] ?? null;
    if (!stories?.length) { without.push(name); continue; }
    for (const s of stories) pages.push({ component: name, state: s.state, id: s.id, url: storyUrl(base, s.id) });
  }
  return { pages, without };
}

// What the run says about it, so nobody reads "checked" as "checked everywhere". → [line]
export function storyLines({ pages = [], without = [], base = '' } = {}) {
  if (!pages.length) return [];
  const components = new Set(pages.map((p) => p.component)).size;
  const lines = [`📖 ${pages.length} ${pages.length === 1 ? 'story' : 'stories'} of ${components} component${components === 1 ? '' : 's'} read from Storybook${base ? ` (${base})` : ''}: each state is checked on the team's own page, with its own content and its own script.`];
  if (without.length) lines.push(`   ${without.length} component${without.length === 1 ? ' has' : 's have'} no story, and ${without.length === 1 ? 'is' : 'are'} checked on the page the engine draws: ${without.slice(0, 6).join(', ')}${without.length > 6 ? ` and ${without.length - 6} more` : ''}`);
  return lines;
}

// As many components as the cap allows, rather than every state of the first few. A Storybook of 50 components and
// 400 stories, cut at 40 in the order the index lists them, checks three components and says it checked 40 pages.
// One state of each component first, then a second of each, and so on, so a cap covers the system rather than a
// corner of it. The order within a component is the index's own. → [page]
export function spread(pages = [], cap = Infinity) {
  if (pages.length <= cap) return pages;
  const byComponent = new Map();
  for (const p of pages) (byComponent.get(p.component) ?? byComponent.set(p.component, []).get(p.component)).push(p);
  const out = [], queues = [...byComponent.values()];
  while (out.length < cap) {
    const before = out.length;
    for (const q of queues) { if (out.length >= cap) break; const next = q.shift(); if (next) out.push(next); }
    if (out.length === before) break;
  }
  return out;
}

// The pages a run opens, with what to call each. A story is named by its component and the state the team gave it; a
// page found another way keeps the path it was found at. `page: false` marks a story as one component rather than a
// whole page, which is what the accessibility check already means by it.
// → { targets: [{ label, url, page }], reached, of }
export function targetsFor(found = [], base = '', { stories = false, cap = 40 } = {}) {
  const capped = stories ? spread(found, cap) : found.slice(0, cap);
  const pathOf = (url) => (String(url).startsWith(base) ? String(url).slice(base.length) || '/' : String(url));
  return {
    targets: capped.map((f) => ({ label: f.component ? `${f.component}${f.state ? ` · ${f.state}` : ''}` : pathOf(f.url), url: f.url, page: !stories,
      // A story is checked once Storybook has finished drawing it, and knows which component and state it is.
      ...(stories && f.component ? { ready: STORY_READY, story: { component: f.component, state: f.state ?? null, id: f.id ?? null } } : {}) })),
    reached: new Set(capped.map((f) => f.component).filter(Boolean)).size,
    of: new Set(found.map((f) => f.component).filter(Boolean)).size,
  };
}

// ── The page Storybook draws ──────────────────────────────────────────────────
// Storybook 7 and later keep the story being drawn on window.__STORYBOOK_PREVIEW__, with the phase its render has
// reached. A story is ready once that render is over, played or not, and a story that threw is over too: it is checked
// as drawn, never waited on. An older Storybook has no preview object, and its story is ready once its root has content.
export const STORY_READY = `(() => {
  const r = window.__STORYBOOK_PREVIEW__ && window.__STORYBOOK_PREVIEW__.currentRender;
  if (r && r.phase) return ['completed', 'afterEach', 'finished', 'aborted', 'errored'].includes(r.phase);
  const root = document.querySelector('#storybook-root, #root');
  return !!(root && root.children.length);
})()`;

// The args the story was drawn with, as the team wrote them: only the plain ones (a string, a number, a flag), since an
// element or a function passed as an arg is content, not a state. → { [arg]: value } | null
export const STORY_ARGS = `(() => {
  try {
    const p = window.__STORYBOOK_PREVIEW__, r = p && p.currentRender;
    const a = (r && r.id && p.storyStoreValue && p.storyStoreValue.args && p.storyStoreValue.args.get(r.id)) || (r && r.story && r.story.initialArgs);
    if (!a) return null;
    return Object.fromEntries(Object.entries(a).filter(([, v]) => v === null || ['string', 'number', 'boolean'].includes(typeof v)));
  } catch (e) { return null; }
})()`;

// A name as Figma and code both might write it: "Size", "size", "is-disabled" and "isDisabled" read alike. Figma's own
// suffix on a boolean or text property ("Disabled#12:3") is no part of the name.
const key = (s) => String(s ?? '').replace(/#.*$/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const argKey = (arg) => (/^is[A-Z]/.test(String(arg)) ? key(String(arg).slice(2)) : key(arg));

// The Figma variant a story shows, read from its args against the component's Figma properties (the props snapshot's
// `properties`): an arg named for a property takes its value, matched as Figma spells it; a flag set on that names one
// of a property's options is that option (disabled: true is State=Disabled); a flag set on that is a state (loading,
// error, selected…) is matched to whatever Figma option is that state, as ds-config.json → states says or its name
// does. What is left is a state Figma has no variant for, and is named: an option it does not list (size: 'xl' where
// Figma has Small and Medium), or a state it never draws (loading: true where Figma has no loading).
// → { variant: { [prop]: option | boolean }, label, missing: [{ arg, value, prop?, options?, concept? }] }
export function variantOf(args = {}, properties = {}, cfg = {}) {
  const props = Object.entries(properties ?? {}).filter(([, p]) => p?.type === 'VARIANT' || p?.type === 'BOOLEAN')
    .map(([name, p]) => ({ name: name.replace(/#.*$/, ''), key: key(name), type: p.type, options: p.type === 'VARIANT' ? (p.variantOptions ?? []).map(String) : [] }));
  const variant = {}, missing = [];
  for (const [arg, value] of Object.entries(args ?? {})) {
    if (value === null || value === undefined || value === '') continue;
    const a = argKey(arg);
    const prop = props.find((p) => p.key === a || p.key === key(arg));
    if (prop?.type === 'BOOLEAN') { variant[prop.name] = value === true || /^true$/i.test(String(value)); continue; }
    if (prop) {
      const option = prop.options.find((o) => key(o) === key(value));
      if (option !== undefined) variant[prop.name] = option;
      else missing.push({ arg, value, prop: prop.name, options: prop.options });
      continue;
    }
    if (value !== true) continue;   // an arg Figma has no property for is content (a label, a count), not a state
    const holder = props.find((p) => p.type === 'VARIANT' && p.options.some((o) => key(o) === a));
    if (holder) { variant[holder.name] = holder.options.find((o) => key(o) === a); continue; }
    const concept = conceptOfName(arg);
    if (!concept) continue;
    const same = props.flatMap((p) => (p.type === 'VARIANT' ? p.options.map((o) => ({ p, o })) : [{ p, o: 'True' }]))
      .find(({ p, o }) => conceptOf(`${p.name}=${o}`, cfg) === concept);
    if (same) variant[same.p.name] = same.p.type === 'BOOLEAN' ? true : same.o;
    else missing.push({ arg, value, concept });
  }
  return { variant, label: Object.entries(variant).map(([k, v]) => `${k}=${v === true ? 'True' : v === false ? 'False' : v}`).join(', '), missing };
}

// The Figma properties of the component a story is about: its name as the props snapshot writes it, else the same name
// written another way ("Field size" and FieldSize). → properties | null
export function figmaPropertiesOf(component, propsSnap = {}) {
  const hit = propsSnap?.[component] ?? Object.entries(propsSnap ?? {}).find(([n]) => !n.startsWith('_') && key(n) === key(component))?.[1];
  return hit?.properties ?? null;
}

// Whether the variant a story shows is the one Figma draws by default: every property it names at Figma's own default
// (a story that names none shows the default). Parity measures a component's base values on such a story, since those
// are held to Figma's default variant, and every other story against the variant it shows. → boolean
export function isDefaultVariant(variant = {}, properties = {}) {
  const props = Object.fromEntries(Object.entries(properties ?? {}).map(([n, p]) => [n.replace(/#.*$/, ''), p]));
  return Object.entries(variant ?? {}).every(([name, value]) => {
    const def = props[name]?.defaultValue;
    if (def === undefined) return false;
    return typeof value === 'boolean' ? value === (def === true || /^true$/i.test(String(def))) : key(value) === key(def);
  });
}

// A component and the component a story is about, however each spells its name ("iconButton" and IconButton).
export const sameComponent = (a, b) => !!a && !!b && key(a) === key(b);

// What the run says about the stories that show a state Figma has no variant for, one line each. → [line]
export function storyStateLines(rows = []) {
  const say = (m) => (m.prop ? `${m.prop}=${m.value}, which Figma's ${m.options?.length ? `${m.prop} does not list (it has ${m.options.join(', ')})` : 'component does not have'}` : `${m.concept}, a state Figma never draws for it`);
  return rows.filter((r) => r.missing?.length).map((r) =>
    `⚠️  [stories] ${r.component}${r.state ? ` · ${r.state}` : ''} shows ${r.missing.map(say).join('; and ')}: design it in Figma, or take it out of the story if the component should not have it.`);
}

// ── A static build, served ────────────────────────────────────────────────────
// `storybook build` writes a folder (storybook-static unless told otherwise) whose pages load their scripts as modules,
// which a browser refuses from file://. When a project has one, it is served from a port of its own for as long as the
// run needs it, and nothing outside that folder is ever answered. → dir | null
export function staticBuild(ROOT, cfg = {}) {
  const dir = resolve(ROOT, cfg.storybook?.static ?? 'storybook-static');
  return existsSync(join(dir, 'iframe.html')) && (existsSync(join(dir, 'index.json')) || existsSync(join(dir, 'stories.json'))) ? dir : null;
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.ico': 'image/x-icon', '.map': 'application/json' };

// → Promise<{ url, close }>
export function serveStatic(dir) {
  const root = resolve(dir);
  const server = createServer((req, res) => {
    let path;
    try { path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://x').pathname)); } catch { res.writeHead(400); return res.end(); }
    if (path !== root && !path.startsWith(root + sep)) { res.writeHead(403); return res.end(); }
    if (existsSync(path) && statSync(path).isDirectory()) path = join(path, 'index.html');
    if (!existsSync(path)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(readFileSync(path));
  });
  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => ok({ url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(() => r())) }));
  });
}

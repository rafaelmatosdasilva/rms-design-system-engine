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
import { resolve } from 'node:path';

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
    targets: capped.map((f) => ({ label: f.component ? `${f.component}${f.state ? ` · ${f.state}` : ''}` : pathOf(f.url), url: f.url, page: !stories })),
    reached: new Set(capped.map((f) => f.component).filter(Boolean)).size,
    of: new Set(found.map((f) => f.component).filter(Boolean)).size,
  };
}

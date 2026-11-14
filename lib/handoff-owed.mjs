// handoff-owed.mjs - what a prototype still owes before a development team can take it forward.
//
// The prototypes are meant to reach production: a designer hands one to the development team as the starting
// point, not as a picture to rebuild. What that needs was written down nowhere, so the handoff was a conversation
// each time, and the parts that are obvious to whoever wrote the page are the parts that get missed.
//
// Every convention here is READ FROM THE PRODUCT, never assumed. A project with no router is not told its page
// has no route; a project with no translations is not told its words are hardcoded. The engine knows what a
// project does by what the project does, and a convention it cannot find is one it says nothing about - a list
// of good practice the project never adopted would be noise, and worse, it would read as the team's own rules.
//
// What is owed is said, never done. The engine does not write the product's code (CLAUDE.md), so a route is not
// registered and a translation key is not created: the list is what a person does next, in their own project.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const read = (p) => { try { return readFileSync(p, 'utf8'); } catch { return null; } };
const has = (deps, re) => Object.keys(deps).some((d) => re.test(d));
// A folder that exists and holds something: an empty one is a leftover, not a convention.
const folder = (ROOT, ...names) => names.find((n) => { const p = resolve(ROOT, n); try { return existsSync(p) && readdirSync(p).length > 0; } catch { return false; } }) ?? null;

// What the product does, read from its own package and its own folders. Each entry is either what it uses, or
// null for "this project does not do this", which is the answer that keeps the engine quiet.
// → { router, store, i18n, tests, where: { routes, store, messages } }
export function conventionsOf(ROOT, { pkg = null } = {}) {
  let deps = {};
  try { const j = JSON.parse(pkg ?? read(join(ROOT, 'package.json')) ?? '{}'); deps = { ...j.dependencies, ...j.devDependencies }; } catch { deps = {}; }
  const router = has(deps, /^(vue-router|react-router(-dom)?|@tanstack\/\w*router|@angular\/router)$/) ? 'a router' : (has(deps, /^(next|nuxt|@sveltejs\/kit|remix)/) ? 'file-based routes' : null);
  const store = has(deps, /^(pinia|vuex|redux|@reduxjs\/toolkit|zustand|jotai|mobx|@ngrx\/store)$/) ? 'a store' : null;
  const i18n = has(deps, /i18n|intl|lingui|polyglot/i) ? 'translated words' : null;
  const tests = has(deps, /^(vitest|jest|@playwright\/test|cypress|@testing-library\/)/) ? 'tests' : null;
  return {
    router, store, i18n, tests,
    where: {
      routes: folder(ROOT, 'src/router', 'src/routes', 'app/routes', 'src/app', 'pages', 'src/pages', 'app'),
      store: folder(ROOT, 'src/store', 'src/stores', 'src/state'),
      messages: folder(ROOT, 'src/locales', 'src/i18n', 'locales', 'lang'),
    },
  };
}

// Whether the prototype's own text names a thing: used to see if it already does what the product does.
const saysRoute = (t) => /\b(route|path:|createRouter|useRouter|defineRoute|<Route\b)/i.test(t);
const saysStore = (t) => /\b(useStore|defineStore|useSelector|useDispatch|mapState|inject\(|createStore)\b/i.test(t);
const saysI18n = (t) => /\b(\$t\(|\bt\(|useTranslation|<i18n|FormattedMessage|\bi18n\b)/.test(t);
// Words a person reads, written straight into the markup rather than taken from anywhere.
export const HARDCODED = /(?:label|title|text|heading|placeholder)\s*[:=]\s*["'][^"']{3,}["']/i;

// What this prototype still owes, against what the product does. page: { name, file, text }.
// → [{ owes, why }], empty when the product does none of these things or the page already does them.
export function owedFor(page, conv) {
  const text = String(page?.text ?? '');
  const out = [];
  if (conv.router && !saysRoute(text)) {
    out.push({ owes: 'a route', why: `the product declares its pages with ${conv.router}${conv.where.routes ? ` (${conv.where.routes})` : ''}, and nothing here registers this page: a developer has to wire it before anyone can reach it` });
  }
  if (conv.store && !saysStore(text) && HARDCODED.test(text)) {
    out.push({ owes: 'its data from the store', why: `the product keeps state in ${conv.store}${conv.where.store ? ` (${conv.where.store})` : ''}, and this page carries its own: the numbers on screen are the ones somebody typed while drawing it` });
  }
  if (conv.i18n && !saysI18n(text) && HARDCODED.test(text)) {
    out.push({ owes: 'its words as translations', why: `the product has ${conv.i18n}${conv.where.messages ? ` (${conv.where.messages})` : ''}, and the words here are written into the page: they would ship in one language` });
  }
  if (conv.tests) out.push({ owes: 'a test', why: `the product has ${conv.tests}, and this page has none: whatever it does now, nothing holds it there` });
  return out;
}

// What a person reads at the end of a prototype run. Nothing owed is said as nothing: a page that matches
// everything the product does needs no line, and a product with no conventions to match is not lectured.
export function handoffLines(name, owed, conv) {
  if (!owed.length) return [];
  const known = ['router', 'store', 'i18n', 'tests'].filter((k) => conv[k]).length;
  return ['', `🤝 BEFORE A DEVELOPER TAKES "${name}" FORWARD  ${owed.length} of ${known} thing(s) the product does, that this page does not yet:`,
    ...owed.map((o) => `   • ${o.owes} — ${o.why}`),
    '   Read from this product, not from a list of good practice: a convention it does not use is never asked for. The engine says these, never does them.'];
}

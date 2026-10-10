// component-locator.mjs - the ONE answer to "which elements are DS component X".
//
// Eight places used to answer this on their own, in five different ways: some read
// ds-config.json → componentSelectors, some the contract's COMPONENT_CSS_SELECTORS, some only
// the naming convention, and one did not lowercase the first letter at all. The same component
// could resolve to `.checkBox` in one gate and `.checkbox` in another. Every gate now asks here.
//
// Resolution order (first answer wins):
//   1. ds-config.json → componentSelectors[name]                 (explicit project config)
//   2. structure-contract.mjs → COMPONENT_CSS_SELECTORS[name].main (the contract's selector map)
//   3. a name that already is a selector (".x", "#x", "[x]")      (used as-is)
//   4. the class the code's own component file gives its first element: one that is the name in another spelling
//      (ButtonPrimary → .button-primary), else the first class of the file its folder and name spell
//      (buttonSecondary → buttons/Secondary.vue → .button-secondary-container). With no Figma data and no contract,
//      the convention guessed .buttonPrimary
//   5. the naming convention: ComponentName → .componentName
//
// Pure: no I/O unless you call loadLocator(), which imports structure-contract.mjs once and reads the component files
// (once, only when a name reaches step 4).

import { existsSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { componentSourceFiles, textReader } from './component-source.mjs';

export const lcFirst = (name) => String(name).charAt(0).toLowerCase() + String(name).slice(1);

// The first class or id token of a selector (".segmented-control button" → ".segmented-control").
export function leadingToken(selector) {
  return String(selector ?? '').match(/[.#][\w-]+/)?.[0] ?? null;
}

const squash = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

// The classes the code's component files give their first element (a Vue or Svelte file's first element in its
// template; a React file's first className), found two ways → { byName, byFile }, each Map(squashed name → Map(".class"
// → how many files)):
//   byName  the class is the name in any spelling (button-primary, buttonPrimary and button_primary are one name)
//   byFile  the file's folder and name spell it (buttons/Secondary.vue is buttonSecondary; a folder's plural s is dropped)
export function codeRootClasses(files = [], read = textReader()) {
  const byName = new Map(), byFile = new Map();
  const add = (map, key, cls) => { if (!key) return; if (!map.has(key)) map.set(key, new Map()); const m = map.get(key); m.set('.' + cls, (m.get('.' + cls) ?? 0) + 1); };
  for (const f of files) {
    const ext = extname(f).toLowerCase();
    const text = String(read(f) ?? '').replace(/<!--[\s\S]*?-->/g, '');
    let classes = null;
    if (ext === '.vue' || ext === '.svelte') {
      const tpl = ext === '.vue' ? (/<template[^>]*>([\s\S]*)<\/template>/.exec(text)?.[1] ?? '') : text.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '');
      const first = /<[A-Za-z][\w-]*\b([^>]*)>/.exec(tpl);
      classes = first ? /(?:^|\s)class\s*=\s*["']([^"']+)["']/.exec(first[1])?.[1] : null;
    } else if (ext === '.jsx' || ext === '.tsx') {
      classes = /\bclassName\s*=\s*(?:["']([^"']+)["']|\{\s*["'`]([^"'`$]+)["'`]\s*\})/.exec(text)?.slice(1).find(Boolean) ?? null;
    }
    const list = String(classes ?? '').split(/\s+/).filter((c) => /^-?[A-Za-z_][\w-]*$/.test(c));
    for (const c of list) add(byName, squash(c), c);
    const parts = f.replace(/\\/g, '/').split('/');
    const folder = squash(parts.at(-2) ?? ''), base = squash(parts.at(-1).replace(/\.[^.]+$/, ''));
    // The folder as it is and without its plural s (tabs/Primary.vue is tabsPrimary or tabPrimary); index is the folder.
    if (list[0] && folder) for (const fo of new Set([folder, folder.replace(/(?<=...)s$/, '')])) add(byFile, base === 'index' ? fo : fo + base, list[0]);
  }
  return { byName, byFile };
}

// createLocator(cfg, { contractSelectors, codeClasses }) → { selectorFor, classFor, sourceOf, names }
// codeClasses: () → codeRootClasses(...) (read once, when first needed).
export function createLocator(cfg = {}, { contractSelectors = {}, codeClasses = null } = {}) {
  const configured = cfg?.componentSelectors ?? {};
  const has = (o, k) => o && Object.prototype.hasOwnProperty.call(o, k);
  let code = null;
  const most = (m) => (m?.size ? [...m].sort((a, b) => b[1] - a[1])[0][0] : null);
  // The code's own class for a name, first by spelling, then by its file; null when the code has none, or when the
  // convention's own class is among the ones spelled that way (it is right already).
  const fromCode = (name, convention) => {
    if (!codeClasses) return null;
    code ??= codeClasses() ?? { byName: new Map(), byFile: new Map() };
    const spelled = code.byName.get(squash(name));
    if (spelled?.has(convention)) return null;
    return most(spelled) ?? most(code.byFile.get(squash(name)));
  };

  function resolveOne(name) {
    if (has(configured, name) && configured[name]) return { selector: String(configured[name]), source: 'componentSelectors' };
    const main = has(contractSelectors, name) ? contractSelectors[name]?.main : null;
    if (main) return { selector: String(main), source: 'contract' };
    if (/^[.#[]/.test(String(name))) return { selector: String(name), source: 'selector' };
    const convention = '.' + lcFirst(name);
    const own = fromCode(name, convention);
    if (own && own !== convention) return { selector: own, source: 'code' };
    return { selector: convention, source: 'convention' };
  }

  return {
    // The full selector for the component (may be compound, e.g. ".segmented-control button").
    selectorFor: (name) => resolveOne(name).selector,
    // Its leading class or id (".segmented-control"), for "is this component on the element" checks.
    classFor: (name) => leadingToken(resolveOne(name).selector) ?? resolveOne(name).selector,
    // Which rule answered: componentSelectors | contract | selector | code | convention.
    sourceOf: (name) => resolveOne(name).source,
    // Every component this locator was told about explicitly.
    names: () => [...new Set([...Object.keys(configured), ...Object.keys(contractSelectors)])],
  };
}

// Load COMPONENT_CSS_SELECTORS from the project's structure-contract.mjs (optional) and build
// the locator. Never throws: a missing or broken contract just means steps 1, 3 and 4 answer.
export async function loadLocator(ROOT, cfg = {}) {
  let contractSelectors = {};
  const p = resolve(ROOT, cfg?.paths?.structureContract ?? 'structure-contract.mjs');
  if (existsSync(p)) {
    try { contractSelectors = (await import(pathToFileURL(p).href)).COMPONENT_CSS_SELECTORS ?? {}; } catch { /* optional */ }
  }
  return createLocator(cfg, { contractSelectors, codeClasses: codeClassesIn(ROOT, cfg) });
}

// The project's component files read for step 4, for a gate that builds its own locator.
export const codeClassesIn = (ROOT, cfg = {}) => () => codeRootClasses(componentSourceFiles(ROOT, cfg));

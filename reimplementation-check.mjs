// reimplementation-check.mjs - Gate: local reimplementation of a DS component (code -> Figma).
// Run from project root: node scripts/reimplementation-check.mjs
//
// The Notion DS manuals put it plainly: "não uses HTML/CSS local para simular componentes."
// Every other code->Figma gate checks names (an invented var, an invented prop). None catches the
// subtler drift: a screen that RE-BUILDS a DS component by hand — a native <button> given a local
// class with its own background/border/radius/padding — instead of using the DS component. The
// markup looks bespoke, passes every token gate (its literals are its own), and silently forks the
// button from the design system.
//
// This gate flags exactly that: an interactive element of a role the DS OWNS (it defines a
// component for it) that (a) does NOT carry a DS component class for that role, yet (b) is locally
// styled to reconstruct the component (background / border / border-radius / padding, via a local
// class rule or an inline style). That pairing — "styled like the component, but not the component"
// — is the signature of a hand-rolled reimplementation.
//
// Direction: code -> Figma. The surfaces scanned are ds-config.json -> "reimplementationSurfaces"
// (["apps/*/ui.src.html", "src/views/*.vue", …]); unset, the products' own UI files the config already
// lists (paths.pluginCSS pages, pluginDirs/*/ui.src.html). Roles default to ["button", "input"] and can
// be set with "reimplementationRoles". A look-alike is ADVISORY by default; a hard fail under
// "reimplementationStrict": true.
//
// Second part, Figma -> code: the DS components each product screen uses in Figma
// (figma-screen-components.snapshot.json, captured with the other Figma snapshots). A screen that uses
// a component its product's code never uses has built it by hand or left it out: the font scaling
// stepper drawn as a buttonStepper in Figma and hand-built in code is the case. This part FAILS by
// default ("screenComponentsStrict": false makes it advisory); a deliberate exception is
// "<plugin>/<component>" in knownReimplementations.
//
// A part that cannot run says so on a ⏭ line, never as a pass: no surfaces and no screen capture is
// exit 2 (not run).
//
// Reads at project root:
//   ds-config.json - reimplementationSurfaces[], reimplementationRoles[], reimplementationStrict,
//                    knownReimplementations[], componentSelectors, paths.themeCSS, paths.pluginCSS,
//                    plus the DS component universe (componentSelectors + composition/structure snapshots).
//
// Exit 0 = nothing found (or advisory-only). Exit 1 = a screen component the code never uses, or a
// look-alike under reimplementationStrict. Exit 2 = neither part could run.

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { loadLocator } from './component-locator.mjs';
import { usedClasses } from './class-use.mjs';

const ROOT = process.cwd();
let cfg = {};
try { cfg = JSON.parse(readFileSync(join(ROOT, 'ds-config.json'), 'utf8')); } catch {
  console.error('❌ ds-config.json not found at project root.'); process.exit(1);
}

// ── Surfaces: the configured ones, else the products' own UI files ─────────────────
const isLocal = (p) => typeof p === 'string' && p && !/^https?:\/\//.test(p);
function productSurfaces() {
  const out = [];
  for (const p of (cfg.paths?.pluginCSS ?? []).flat()) if (isLocal(p) && /\.(html?|vue|jsx|tsx|svelte)$/i.test(p)) out.push(p);
  for (const d of Object.values(cfg.pluginDirs ?? {})) {
    if (!isLocal(d)) continue;
    const src = join(d, 'ui.src.html'), built = join(d, 'ui.html');
    out.push(existsSync(join(ROOT, src)) ? src : built);
  }
  // A built page beside its source is the same screen: read the source only.
  return [...new Set(out)].filter((p) => !(/ui\.html$/.test(p) && out.includes(p.replace(/ui\.html$/, 'ui.src.html'))));
}
const CONFIGURED = (cfg.reimplementationSurfaces ?? []).flat().filter(Boolean);
const SURFACE_GLOBS = CONFIGURED.length ? CONFIGURED : productSurfaces();

const STRICT = cfg.reimplementationStrict === true;
const SCREEN_STRICT = cfg.screenComponentsStrict !== false;
const ROLES  = (cfg.reimplementationRoles ?? ['button', 'input']).map(r => String(r).toLowerCase());
const KNOWN  = new Set(cfg.knownReimplementations ?? []);
const norm   = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

// ── Resolve surface files (supports a trailing `*` glob on the basename) ─────────
function expandGlob(g) {
  if (!g.includes('*')) return existsSync(join(ROOT, g)) ? [g] : [];
  // Support "dir/*/file" and "dir/*.ext" — one wildcard segment, generic and dependency-free.
  const parts = g.split('/');
  let bases = [''];
  for (const part of parts) {
    if (!part.includes('*')) { bases = bases.map(b => (b ? b + '/' + part : part)); continue; }
    const re = new RegExp('^' + part.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
    const next = [];
    for (const b of bases) {
      const dir = join(ROOT, b);
      let entries = []; try { entries = readdirSync(dir); } catch { continue; }
      for (const e of entries) if (re.test(e)) next.push(b ? b + '/' + e : e);
    }
    bases = next;
  }
  return bases.filter(p => existsSync(join(ROOT, p)));
}
const SURFACES = [...new Set(SURFACE_GLOBS.flatMap(expandGlob))];

// ── DS component universe + the classes that realize each owned role ─────────────
const universe = new Set(Object.keys(cfg.componentSelectors ?? {}));
const structNames = new Set();
function addSnap(file, pick) {
  try { const s = JSON.parse(readFileSync(join(ROOT, file), 'utf8')); pick(s); } catch {}
}
addSnap('component-composition.snapshot.json', (s) => {
  for (const [k, v] of Object.entries(s)) { if (k.startsWith('_')) continue; universe.add(k); if (Array.isArray(v)) for (const n of v) universe.add(n); }
});
const SNAP_STRUCT = cfg.paths?.snapshotStructure ?? 'src/figma-structure.snapshot.json';
addSnap(SNAP_STRUCT, (s) => { for (const k of Object.keys(s.components ?? {})) { universe.add(k); structNames.add(k); } });

const LOCATOR = await loadLocator(ROOT, cfg);   // the one shared component finder
const selOf = (name) => LOCATOR.classFor(name);

// ── Read a surface + gather CSS that could style it ──────────────────────────────
const readFile = (p) => { try { return readFileSync(join(ROOT, p), 'utf8'); } catch { return ''; } };
const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
const VISUAL_RE = /(?:^|[;{])\s*(?:background|background-color|border|border-color|border-radius|padding|padding-top|padding-right|padding-bottom|padding-left)\s*:/i;

// class token (or "#id") -> concatenated declaration text, for "does this local rule reconstruct a component?"
function collectClassDecls(css, map) {
  if (!css) return;
  const blocks = css.match(/[^{}]+\{[^{}]*\}/g) || [];
  for (const b of blocks) {
    const i = b.indexOf('{');
    const selector = b.slice(0, i);
    const decls = b.slice(i + 1, b.lastIndexOf('}'));
    for (const m of selector.matchAll(/\.([A-Za-z0-9_-]+)/g)) {
      const k = norm(m[1]);
      map.set(k, (map.get(k) || '') + ';' + decls);
    }
    for (const m of selector.matchAll(/#([A-Za-z][A-Za-z0-9_-]*)/g)) {
      const k = '#' + m[1];
      map.set(k, (map.get(k) || '') + ';' + decls);
    }
  }
}

const THEME = [cfg.paths?.themeCSS ?? []].flat().filter(Boolean);
const PLUGIN = (cfg.paths?.pluginCSS ?? []).flat().filter(Boolean).filter(p => !/^https?:\/\//.test(p));
const themeText = THEME.map((p) => stripComments(readFile(p))).join('\n');

// A role -> normalized DS class tokens that realize it: the class of each DS component named for the
// role, and every class the theme defines with the role in its name (inputField, inputLabel, …).
const roleClasses = {};   // role -> Set(normClassToken)
for (const role of ROLES) {
  const set = new Set();
  const roleRe = new RegExp(role, 'i');
  for (const name of universe) if (roleRe.test(name)) set.add(norm(selOf(name).replace(/^[.#]/, '')));
  if (set.size) for (const m of themeText.matchAll(/\.([A-Za-z][A-Za-z0-9_-]*)/g)) if (roleRe.test(m[1])) set.add(norm(m[1]));
  if (set.size) roleClasses[role] = set;
}
const ownedRoles = Object.keys(roleClasses);
const dsAll = new Set([...universe].map((n) => norm(String(selOf(n) ?? '').replace(/^[.#]/, ''))).filter(Boolean));
// A DS component's own parts: classes the theme only styles inside a component (".field .field-icon").
// An element carrying one is that component's part, not a look-alike.
const dsParts = new Set();
for (const blk of themeText.match(/[^{}]+\{/g) || []) for (const sel of blk.slice(0, -1).split(',')) {
  const toks = [...sel.matchAll(/\.([A-Za-z][A-Za-z0-9_-]*)/g)].map((m) => norm(m[1]));
  const at = toks.findIndex((t) => dsAll.has(t));
  if (at >= 0) for (const t of toks.slice(at + 1)) if (!dsAll.has(t)) dsParts.add(t);
}
const TEXT_INPUT = /^(?:|text|number|search|email|tel|url|password)$/i;

// ── Part 1: look-alikes, an element styled like a DS component without using it ──
const lines = [];
let partsRun = 0, fail = false;
const findings = [];
if (!SURFACES.length) {
  lines.push(`⏭ [reimplementation] no product code to scan for hand-built components (set reimplementationSurfaces or pluginDirs)`);
} else if (!ownedRoles.length) {
  partsRun++;
  lines.push(`✅ [reimplementation] the DS defines no component for role(s) [${ROLES.join(', ')}] — nothing to reimplement`);
} else {
  partsRun++;
  for (const surface of SURFACES) {
    const raw = readFile(surface);
    if (!raw) continue;
    const doc = stripComments(raw);

    // Local CSS in scope for this surface: its own <style>/rules + the products' CSS. The theme's own
    // rules are the system styling its parts (a segment's .selected, an input's .icon-right): never local.
    const classDecls = new Map();
    collectClassDecls(doc, classDecls);
    for (const p of PLUGIN) collectClassDecls(stripComments(readFile(p)), classDecls);

    for (const role of ownedRoles) {
      const dsSet = roleClasses[role];
      const openers = [];
      if (role === 'button') {
        for (const m of doc.matchAll(/<button\b[^>]*>/gi)) openers.push(m[0]);
        for (const m of doc.matchAll(/<[a-z][a-z0-9]*\b[^>]*\brole=["']button["'][^>]*>/gi)) openers.push(m[0]);
      } else if (role === 'input') {
        // A text field: radios, checkboxes, ranges and files are form-control-check's.
        for (const m of doc.matchAll(/<input\b[^>]*>/gi)) { const type = (m[0].match(/\btype=["']([^"']*)["']/i) || [])[1] ?? ''; if (TEXT_INPUT.test(type)) openers.push(m[0]); }
      } else {
        // Generic: an element whose tag equals the role name (e.g. <select>) or role="<role>".
        const tagRe = new RegExp(`<${role}\\b[^>]*>`, 'gi');
        for (const m of doc.matchAll(tagRe)) openers.push(m[0]);
        for (const m of doc.matchAll(new RegExp(`<[a-z][a-z0-9]*\\b[^>]*\\brole=["']${role}["'][^>]*>`, 'gi'))) openers.push(m[0]);
      }

      for (const tag of openers) {
        const classAttr = (tag.match(/\bclass=["']([^"']*)["']/i) || [])[1] || '';
        const styleAttr = (tag.match(/\bstyle=["']([^"']*)["']/i) || [])[1] || '';
        const idAttr = (tag.match(/\bid=["']([^"'$]*)["']/i) || [])[1] || '';
        const classTokens = classAttr.split(/[\s:]+/).map(norm).filter(Boolean);   // split Vue :class noise too

        // Uses the DS component for this role, or is another DS component (a .node row is a button)? → not a reimplementation.
        if (classTokens.some(t => dsSet.has(t) || dsAll.has(t) || dsParts.has(t) || [...dsSet].some(d => d.length >= 4 && t.includes(d)))) continue;

        // Locally styled to reconstruct the component? inline style, or one of its classes (or its
        // id) carries visual declarations (background/border/radius/padding) in the gathered CSS.
        const inlineVisual = VISUAL_RE.test(';' + styleAttr);
        const classVisual  = classTokens.some(t => VISUAL_RE.test(classDecls.get(t) || ''));
        const idVisual     = !!idAttr && VISUAL_RE.test(classDecls.get('#' + idAttr) || '');
        if (!inlineVisual && !classVisual && !idVisual) continue;   // a bare/utility element — not a simulated component

        const label = classAttr ? `.${classAttr.trim().split(/\s+/)[0]}` : idAttr ? `#${idAttr}` : (styleAttr ? 'inline-styled' : role);
        const key = `${basename(surface)}#${label}`;
        if (KNOWN.has(key) || KNOWN.has(`${surface}#${label}`)) continue;
        findings.push({ surface, role, label });
      }
    }
  }
  // Dedupe (surface, role, label): the same local class often appears many times.
  const seen = new Set();
  const unique = findings.filter(f => { const k = `${f.surface}|${f.role}|${f.label}`; if (seen.has(k)) return false; seen.add(k); return true; });
  if (!unique.length) {
    lines.push(`✅ [reimplementation] no local component reimplementation found (${SURFACES.length} surface${SURFACES.length > 1 ? 's' : ''}, role(s): ${ownedRoles.join(', ')})`);
  } else {
    const tag = STRICT ? '❌' : '⚠️ ';
    if (STRICT) fail = true;
    lines.push(`${tag} [reimplementation] ${unique.length} possible local reimplementation${unique.length > 1 ? 's' : ''} — element styled like a DS component but not using it${STRICT ? '' : ' (advisory)'}:`);
    const bySurface = {};
    for (const f of unique) (bySurface[f.surface] ??= []).push(f);
    for (const [surface, fs] of Object.entries(bySurface)) {
      lines.push(`  ${surface}`);
      for (const f of fs) lines.push(`    ${tag} <${f.role}> "${f.label}" — locally styled, not using the DS ${f.role} component`);
    }
    lines.push(`  Fix: use the DS ${ownedRoles.join('/')} component/class instead of hand-styling it; or, if deliberate, add "${unique[0].surface.split('/').pop()}#${unique[0].label}" to ds-config.json → knownReimplementations.`);
  }
}

// ── Part 2: every DS component a product's Figma screen uses is used by its code ──
// The classes the code puts on elements: class attributes (in markup and in markup strings),
// className = '…', classList.add/toggle/replace('…'), setAttribute('class', '…'), and ids. A CSS rule
// or a comment naming a class is not a use.
const usedTokens = usedClasses;
const SNAP_SCREENS = cfg.paths?.snapshotScreenComponents ?? 'figma-screen-components.snapshot.json';
const configuredScreens = [...(cfg.frames ?? []), ...(cfg.screens ?? [])].filter((s) => s?.plugin);
let screenSnap = null;
try { screenSnap = JSON.parse(readFileSync(join(ROOT, SNAP_SCREENS), 'utf8')); } catch { /* not captured */ }
if (!screenSnap?.screens) {
  if (configuredScreens.length) lines.push(`⏭ [reimplementation] the product screens are not captured from Figma (${SNAP_SCREENS}), so a component a screen uses but the code never uses is not found. Capture it with the other Figma snapshots (rms-design-system-engine --recipe refresh-figma).`);
} else {
  partsRun++;
  const dirOf = (plugin) => cfg.pluginDirs?.[plugin] ?? plugin;
  const filesOf = (plugin) => {
    const d = String(dirOf(plugin)).replace(/^\.\//, '').replace(/\/$/, '');
    const own = SURFACES.filter((p) => p.replace(/^\.\//, '').startsWith(d + '/') || p.includes(`/${plugin}/`) || p.includes(plugin));
    return own;
  };
  const gaps = [];
  const unread = new Set();
  for (const scr of Object.values(screenSnap.screens)) {
    if (!scr?.plugin) continue;
    const files = filesOf(scr.plugin);
    if (!files.length) { unread.add(scr.plugin); continue; }
    const used = new Set();
    for (const f of files) for (const w of usedTokens(readFile(f))) used.add(w);
    for (const comp of Object.keys(scr.components ?? {})) {
      if (!structNames.has(comp) && !(cfg.componentSelectors ?? {})[comp]) continue;   // not a DS component
      const sel = selOf(comp);
      const token = String(sel ?? '').replace(/^[.#]/, '');
      if (!token || /[\s>+~[\]:]/.test(token)) continue;   // no single class to look for
      if (used.has(token)) continue;
      if (KNOWN.has(`${scr.plugin}/${comp}`)) continue;
      gaps.push({ plugin: scr.plugin, screen: scr.name ?? '', comp, sel });
    }
  }
  const seenGap = new Set();
  const uniqueGaps = gaps.filter((g) => { const k = `${g.plugin}|${g.comp}`; if (seenGap.has(k)) return false; seenGap.add(k); return true; });
  for (const p of unread) lines.push(`⏭ [reimplementation] ${p}: no code file found for its Figma screens (pluginDirs)`);
  if (!uniqueGaps.length) {
    lines.push(`✅ [reimplementation] every DS component the product screens use in Figma is used by their code (${Object.keys(screenSnap.screens).length} screen${Object.keys(screenSnap.screens).length === 1 ? '' : 's'})`);
  } else {
    const tag = SCREEN_STRICT ? '❌' : '⚠️ ';
    if (SCREEN_STRICT) fail = true;
    lines.push(`${tag} [reimplementation] ${uniqueGaps.length} DS component${uniqueGaps.length === 1 ? '' : 's'} a product screen uses in Figma but its code never uses (built by hand or left out):`);
    for (const g of uniqueGaps) lines.push(`    ${tag} ${g.plugin}: "${g.screen}" uses ${g.comp}; the code never uses ${g.sel}`);
    lines.push(`  Fix: build it with the DS component (${uniqueGaps[0].sel}) in place of the product's own markup; if the product deliberately differs, add "${uniqueGaps[0].plugin}/${uniqueGaps[0].comp}" to ds-config.json → knownReimplementations.`);
  }
}

for (const l of lines) console.log(l);
process.exit(fail ? 1 : partsRun ? 0 : 2);

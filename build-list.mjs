// build-list.mjs - what is left to build in a project that starts from Figma (build mode, ds-config.json → build: true).
//
// The engine never writes the code. In build mode it says, in order, what Figma has that the code does not yet:
//   • the tokens, first: every Figma variable with no CSS declaration, written out exactly as the theme CSS should
//     declare it (name, value, and the block for each mode), in .design-system-engine-out/handback/tokens-to-build.css,
//     for the agent or a person to copy into the theme. Gate [3] then proves each one.
//   • then the components, each after the ones it nests (a button before the card that holds it).
// A component or token still to build is never a failure; once it is built it is compared as usual.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { inProgressList } from './in-progress.mjs';
import { OUT_DIR } from './names.mjs';

export const isBuildMode = (cfg) => cfg?.build === true;
export const TOKENS_TO_BUILD = `${OUT_DIR}/handback/tokens-to-build.css`;

// The block a mode's declarations go in, from its cssSelector in ds-config.json → figma.modes.
export function modeBlock(cssSelector = 'root') {
  const s = String(cssSelector);
  if (s === 'root') return { open: ':root {', close: '}' };
  if (s === 'dark-media') return { open: '@media (prefers-color-scheme: dark) {\n  :root {', close: '  }\n}', indent: '    ' };
  if (s === 'high-contrast-media') return { open: '@media (prefers-contrast: more) {\n  :root {', close: '  }\n}', indent: '    ' };
  let m = /^class:(.+)$/.exec(s);
  if (m) return { open: `:root.${m[1]} {`, close: '}' };
  m = /^data:([\w-]+)=(.+)$/.exec(s);
  if (m) return { open: `:root[${m[1].startsWith('data-') ? m[1] : `data-${m[1]}`}="${m[2]}"] {`, close: '}' };
  return { open: `${s} {`, close: '}' };
}

// entries: [{ cssVar, value, modeIdx, media }] (modeIdx null = the same in every mode, declared once in :root;
// media = a breakpoint's query, e.g. "(min-width: 768px)"). modes: [{ name, cssSelector }].
// → the CSS text: :root first, then each colour mode's block, then each breakpoint's.
export function tokenCss(entries, modes = [{ name: 'Default', cssSelector: 'root' }]) {
  const groups = new Map();
  const seen = new Set();
  for (const e of entries) {
    if (e.value == null || e.value === '') continue;
    const g = e.media ? `m|${e.media}` : `c|${String(e.modeIdx ?? 0).padStart(3, '0')}`;
    if (seen.has(`${g}|${e.cssVar}`)) continue;
    seen.add(`${g}|${e.cssVar}`);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(e);
  }
  const out = [];
  for (const g of [...groups.keys()].sort()) {
    let label, b;
    if (g.startsWith('m|')) { label = g.slice(2); b = { open: `@media ${g.slice(2)} {\n  :root {`, close: '  }\n}', indent: '    ' }; }
    else {
      const idx = Number(g.slice(2)), mode = modes[idx] ?? modes[0];
      label = mode?.name ?? 'Default';
      b = modeBlock(idx === 0 ? 'root' : mode?.cssSelector);
    }
    const pad = b.indent ?? '  ';
    out.push(`/* ${label} */`, b.open,
      ...groups.get(g).sort((a, c) => a.cssVar.localeCompare(c.cssVar)).map((e) => `${pad}${e.cssVar}: ${e.value};`), b.close, '');
  }
  return out.join('\n');
}

export function writeTokensToBuild(ROOT, entries, modes, themePath) {
  const file = join(ROOT, TOKENS_TO_BUILD);
  if (!entries.length) { try { if (existsSync(file)) writeFileSync(file, ''); } catch { /* nothing to clear */ } return null; }
  mkdirSync(dirname(file), { recursive: true });
  const n = new Set(entries.map((e) => e.cssVar)).size;
  writeFileSync(file, `/* ${n} token${n === 1 ? '' : 's'} to build: copy into ${themePath}. Generated from the Figma snapshot; the engine never edits the theme itself. */\n\n${tokenCss(entries, modes)}`);
  return { file: TOKENS_TO_BUILD, count: n };
}

// How many tokens the last run listed as to build (0 when none, or not in build mode).
export function tokensToBuildCount(ROOT) {
  try { const m = /^\/\* (\d+) tokens? to build/.exec(readFileSync(join(ROOT, TOKENS_TO_BUILD), 'utf8')); return m ? Number(m[1]) : 0; } catch { return 0; }
}

// names in build order: a component after every component it nests (nesting: { name: [nested names] }).
// Ties keep alphabetical order, so two runs give the same order.
export function buildOrder(names, nesting = {}) {
  const want = new Set(names);
  const done = new Set(), out = [];
  const visit = (n, stack = new Set()) => {
    if (done.has(n) || stack.has(n)) return;
    stack.add(n);
    for (const c of [...(nesting[n] ?? [])].sort()) if (want.has(c) && c !== n) visit(c, stack);
    stack.delete(n);
    done.add(n); out.push(n);
  };
  for (const n of [...want].sort()) visit(n);
  return out;
}

// The components still to build, in build order.
export async function componentsToBuild(ROOT, cfg) {
  if (!isBuildMode(cfg)) return [];
  const list = (await inProgressList(ROOT, cfg)).filter((x) => x.why === 'to build' && !x.ready).map((x) => x.name);
  let nesting = {};
  try { nesting = JSON.parse(readFileSync(join(ROOT, 'component-composition.snapshot.json'), 'utf8')); } catch { /* no nesting known */ }
  return buildOrder(list, nesting);
}

// The build list's one line for the report.
export function buildLine({ tokens = 0, components = [] } = {}) {
  if (!tokens && !components.length) return null;
  const parts = [];
  if (tokens) parts.push(`${tokens} token${tokens === 1 ? '' : 's'} (${TOKENS_TO_BUILD})`);
  if (components.length) parts.push(`${components.length} component${components.length === 1 ? '' : 's'}: ${components.join(', ')}`);
  return `🧱 TO BUILD  ${parts.join('; ')}. Not failures: built from Figma, then checked.`;
}

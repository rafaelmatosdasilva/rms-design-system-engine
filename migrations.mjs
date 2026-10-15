// migrations.mjs - the steps off what the system retired (K12).
//
// When a component is deprecated (its contract's status, from Figma's @deprecated / @use-instead or
// contract.authored.json), a token is deprecated (its Figma description, carried into tokens.json as $deprecated), or a
// token was renamed and its old name kept pointing at the new one (the rename sweep, L11), every product that still uses
// the old one has to move. This lists, for each, what replaces it and every file and line that still uses it, grouped by
// product, with a patch for what a swap can do (a token for its replacement); a component's markup is left to a person,
// since what replaces it may take other props. The audit writes it to handback/migrations.md, and the style guide's To do
// lists what is still in use.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sweepFiles, linesDiff, cssVarOf } from './rename-sweep.mjs';
import { parseStatusTags } from './decision-status.mjs';

const escape = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// What the system retired. contracts: { name: contract } (its status, as contract-gen writes it). vars: the vars
// snapshot (each token's Figma description in tokenMeta: @deprecated, @use-instead). themes: [{ file, text }].
// classFor(name), varOf(figmaName): the project's own names.
// → [{ kind: 'component', name, from, to, toName, since, why } | { kind: 'token', name, from, to, toName, since, why }].
export function retired({ contracts = {}, vars = {}, themes = [], classFor = () => null, varOf = () => null } = {}) {
  const out = [];
  for (const [name, c] of Object.entries(contracts ?? {})) {
    const st = c?.status;
    if (!st || st.state !== 'deprecated') continue;
    const from = classFor(name);
    if (!from) continue;
    out.push({ kind: 'component', name, from, to: st.supersededBy ? classFor(st.supersededBy) : null, toName: st.supersededBy ?? null, since: st.since ?? null, why: st.rationale ?? null });
  }
  for (const [name, m] of Object.entries(vars?.tokenMeta ?? {})) {
    const tags = parseStatusTags(m?.description);
    if (m?.deprecated !== true && tags.state !== 'deprecated') continue;
    const from = varOf(name);
    if (!from) continue;
    const toName = tags.supersededBy ? tags.supersededBy.replace(/\./g, '/') : null;
    out.push({ kind: 'token', name, from, to: toName ? varOf(toName) : null, toName, since: tags.since ?? null, why: tags.rationale ?? null });
  }
  // The old names a rename kept in the theme: "--old: var(--new); /* renamed to --new … */".
  for (const { text } of themes ?? []) for (const m of String(text ?? '').matchAll(/^\s*(--[\w-]+)\s*:\s*var\(\s*(--[\w-]+)\s*\)\s*;\s*\/\*\s*renamed to/gm)) {
    if (!out.some((x) => x.kind === 'token' && x.from === m[1])) out.push({ kind: 'token', name: null, from: m[1], to: m[2], toName: null, since: null, why: 'Renamed in Figma.' });
  }
  return out;
}

// Where each still is: [{ file, line, text }]. A component by its class, where a class is written (a selector, a class
// or className attribute, classList) or by its tag (<Name …>); a token by var(--from). The system's own definitions
// (skip: its theme files; item.own: the component's own files) are not uses.
export function usesOf(item, files, { skip = [] } = {}) {
  const out = [];
  let re;
  if (item.kind === 'token') re = new RegExp(`var\\(\\s*${escape(item.from)}\\s*[,)]`);
  else {
    const cls = escape(String(item.from).replace(/^\./, '')), word = `(?<![\\w-])${cls}(?![\\w-])`;
    const tag = item.name ? escape(item.name.charAt(0).toUpperCase() + item.name.slice(1)) : null;
    re = new RegExp([`\\.${cls}(?![\\w-])`, `class(?:Name)?\\s*=\\s*\\{?\\s*["'\`][^"'\`]*${word}`, `classList\\.\\w+\\([^)]*['"\`]${cls}['"\`]`, ...(tag ? [`<${tag}(?![\\w-])`] : [])].join('|'));
  }
  const own = new Set([...(skip ?? []), ...(item.own ?? [])]);
  // A component's own files are named after it (Button.jsx, button.css) in the system; a rule that starts with its
  // class is where it is drawn, not where it is used.
  const ownName = item.kind === 'component' && item.name ? item.name.toLowerCase() : null;
  const isOwn = (file) => own.has(file) || (ownName && rootOf(file) === '.' && file.split('/').pop().replace(/\.[^.]+$/, '').toLowerCase() === ownName);
  const ruleOf = item.kind === 'component' ? new RegExp(`^\\s*\\.${escape(String(item.from).replace(/^\./, ''))}(?![\\w-])`) : null;
  for (const { file, text } of files ?? []) {
    if (isOwn(file)) continue;
    const css = /\.(css|scss|less)$/i.test(file);
    String(text ?? '').split('\n').forEach((l, i) => { if (re.test(l) && !(css && ruleOf?.test(l))) out.push({ file, line: i + 1, text: l.trim().slice(0, 160) }); });
  }
  return out;
}

// The root a file belongs to: '.' for the system's own, the product's folder for one beside it (../shop/x → ../shop).
export const rootOf = (file) => (/^((?:\.\.\/)+[^/]+)\//.exec(file)?.[1] ?? '.');

// Each retired item with its uses, grouped by root. → [{ ...item, uses: { root: [{ file, line, text }] }, count }].
export function migrationSteps(items, files, { skip = [] } = {}) {
  return items.map((it) => {
    const uses = {};
    for (const u of usesOf(it, files, { skip })) (uses[rootOf(u.file)] ??= []).push(u);
    return { ...it, uses, count: Object.values(uses).reduce((k, l) => k + l.length, 0) };
  });
}

// The patches a swap can do: each retired token with a replacement, renamed in every file that still uses it, one patch
// per root (paths from that root). → [{ root, diff, files, lines }].
export function migrationPatches(steps, files, { skip = [] } = {}) {
  const swaps = steps.filter((s) => s.kind === 'token' && s.to && s.count).map((s) => ({ from: s.from, to: s.to }));
  if (!swaps.length) return [];
  const changed = sweepFiles((files ?? []).filter((f) => !skip.includes(f.file)), swaps);
  const byRoot = new Map();
  for (const [file, entry] of changed) {
    const root = rootOf(file), rel = root === '.' ? file : file.slice(root.length + 1);
    if (!byRoot.has(root)) byRoot.set(root, new Map());
    byRoot.get(root).set(rel, entry);
  }
  return [...byRoot].map(([root, map]) => ({ root, diff: linesDiff(map), files: map.size, lines: [...map.values()].reduce((k, e) => k + e.changes.size, 0) }));
}

// migrations.md: each retired item still in use, what replaces it, and where, product by product.
const productName = (root) => (root === '.' ? 'This system' : root.split('/').pop());
export function migrationsMarkdown(steps, patches = []) {
  const open = steps.filter((s) => s.count);
  if (!open.length) return '';
  const lines = ['# Moving off what the system retired', '', `${open.length} retired component${open.length === 1 ? '' : 's'} or token${open.length === 1 ? '' : 's'} still in use. Each with what replaces it and every place that still uses it.`, ''];
  for (const s of open) {
    const what = s.kind === 'component' ? `The ${s.name} component (${s.from})` : `The token ${s.from}${s.name ? ` (${s.name})` : ''}`;
    lines.push(`## ${what}`, '');
    lines.push(s.kind === 'component'
      ? (s.toName ? `Use ${s.toName} (${s.to ?? s.toName}) instead.` : 'Nothing replaces it yet: ask the design system team what to use.')
      : (s.to ? `Write ${s.to} instead.` : 'Nothing replaces it yet: ask the design system team what to use.'));
    if (s.since || s.why) lines.push(`${s.since ? `Deprecated since ${s.since}. ` : ''}${s.why ?? ''}`.trim());
    lines.push('');
    for (const [root, uses] of Object.entries(s.uses)) {
      lines.push(`**${productName(root)}**, ${uses.length} place${uses.length === 1 ? '' : 's'}:`, '');
      for (const u of uses.slice(0, 25)) lines.push(`- ${root === '.' ? u.file : u.file.slice(root.length + 1)}:${u.line}  \`${u.text.replace(/`/g, "'")}\``);
      if (uses.length > 25) lines.push(`- … and ${uses.length - 25} more`);
      lines.push('');
    }
  }
  if (patches.length) lines.push('## Patches', '', 'The token swaps, ready to apply in each folder when the person asks:', '', ...patches.map((p) => `- ${productName(p.root)}: ${p.file} (${p.lines} line${p.lines === 1 ? '' : 's'})`), '');
  return lines.join('\n');
}

// The project's migrations, read from its files: its contracts (each component's status), its vars snapshot (each
// token's description), its theme (the names a rename kept), its locator and naming convention, and every file of the
// system and its products, docs included. → { steps (each still in use), patches }.
export async function projectMigrations(ROOT, cfg = {}) {
  const readJson = (p) => { try { return JSON.parse(readFileSync(resolve(ROOT, p), 'utf8')); } catch { return null; } };
  const contracts = {};
  const cdir = resolve(ROOT, cfg.contracts?.out ?? 'contracts');
  if (existsSync(cdir)) for (const f of readdirSync(cdir).filter((x) => x.endsWith('.contract.json'))) { const c = readJson(join(cdir, f)); if (c) contracts[f.replace(/\.contract\.json$/, '')] = c; }
  // No contracts written yet: the statuses the team recorded by hand.
  if (!Object.keys(contracts).length) for (const [name, a] of Object.entries(readJson(cfg.contracts?.authored ?? 'contract.authored.json')?.components ?? {})) {
    const st = typeof a?.status === 'string' ? a.status : a?.status?.state;
    if (st === 'deprecated') contracts[name] = { status: { state: 'deprecated', supersededBy: a.supersededBy ?? a.status?.supersededBy ?? null, since: a.since ?? null, rationale: a.rationale ?? null } };
  }
  const vars = readJson(cfg.paths?.snapshotVars ?? 'src/figma-vars.snapshot.json') ?? {};
  const themePaths = [cfg.paths?.themeCSS ?? []].flat();
  const themes = themePaths.map((file) => { try { return { file, text: readFileSync(resolve(ROOT, file), 'utf8') }; } catch { return null; } }).filter(Boolean);
  const { resolveNamingSpec } = await import('./naming-convention.mjs');
  const { loadLocator } = await import('./component-locator.mjs');
  const { sourceFiles } = await import('./code-roots.mjs');
  const { projectPath, codeSnapshotPath } = await import('./names.mjs');
  let explicit = {};
  try { const map = await import(pathToFileURL(join(ROOT, projectPath(ROOT, 'map'))).href); explicit = { ...(map.EXPLICIT ?? {}), ...(map.EXPLICIT_SIZING ?? {}) }; } catch { /* no map */ }
  const spec = resolveNamingSpec(cfg), locator = await loadLocator(ROOT, cfg);
  const items = retired({ contracts, vars, themes, classFor: (n) => locator.classFor(n), varOf: (n) => cssVarOf(n, vars, spec, explicit) });
  if (!items.length) return { steps: [], patches: [] };
  // A component's own files are where it is made, not where it is used.
  const api = readJson(codeSnapshotPath(cfg))?.api ?? {};
  for (const it of items) if (it.kind === 'component') it.own = [cfg.componentFiles?.[it.name], api[it.name]?.file].filter(Boolean).map((f) => relative(ROOT, resolve(ROOT, f)));
  const files = sourceFiles(ROOT, cfg, { docs: true });
  const steps = migrationSteps(items, files, { skip: themePaths }).filter((s) => s.count);
  return { steps, patches: migrationPatches(steps, files, { skip: themePaths }) };
}

// What the style guide shows. tokens: rows of the system's To do (a swap Claude can make, and a token nothing replaces
// yet, a decision first). components: { name: what its page and its To do rows say }. dir: where the hand-back is.
// → { tokens: [{ kind, who, say, todo }], components: { name: { to, toName, since, why, count, products } } }.
export function migrationView(steps, { dir = '.design-system-engine-out/handback' } = {}) {
  const where = (s) => Object.entries(s.uses).map(([root, uses]) => ({ name: productName(root), count: uses.length, at: uses.slice(0, 6).map((u) => `${root === '.' ? u.file : u.file.slice(root.length + 1)}:${u.line}`) }));
  const placed = (s) => `${s.count} place${s.count === 1 ? '' : 's'}`;
  const tokens = [];
  const swap = steps.filter((s) => s.kind === 'token' && s.to), open = steps.filter((s) => s.kind === 'token' && !s.to);
  const list = (xs) => xs.slice(0, 4).map((s) => `${s.from}${s.to ? ` for ${s.to}` : ''} in ${placed(s)}`).join(', ') + (xs.length > 4 ? `, and ${xs.length - 4} more` : '');
  if (swap.length) tokens.push({ kind: 'Retired', who: 'code',
    say: `${swap.length} retired token${swap.length === 1 ? ' is' : 's are'} still used (${list(swap)}).`,
    todo: `Swap each for the token that replaces it. The patches are ready in ${dir}, and migrations.md there lists every place. A developer does it, or Claude when asked.` });
  if (open.length) tokens.push({ kind: 'Retired', who: 'both',
    say: `${open.length} retired token${open.length === 1 ? ' is' : 's are'} still used with nothing named to replace ${open.length === 1 ? 'it' : 'them'} (${list(open)}).`,
    todo: 'Decide what replaces each one and write it in the token\'s Figma description (@use-instead). Then tell Claude to swap them.' });
  const components = {};
  for (const s of steps.filter((x) => x.kind === 'component')) components[s.name] = { to: s.to, toName: s.toName, since: s.since, why: s.why, count: s.count, products: where(s) };
  return { tokens, components };
}

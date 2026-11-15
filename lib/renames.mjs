// renames.mjs - a prop or a value renamed in a contract, handed back with its way across.
//
// A contract change that renames a prop (one gone, one new, holding the same type, options and default) or one of a
// prop's values (one option gone, one new, in the same place of the list) breaks every product that still writes the
// old name. compare() in contract-changes.mjs reads it as a removal and an addition. This pairs the two and hands back
// the way across, as every patch is: the old name kept as an alias marked deprecated in the system, a codemod patch for
// each product that writes it, the version that removes the alias, and how many places each product still has on the
// old name. Token renames are the rename sweep's (rename-sweep.mjs), which keeps the old variable in the theme. The
// engine writes the patches and never applies them.
//
//   propRenames(base, now)           → [{ component, kind: 'prop' | 'value', from, to, prop?, code: { from, to } }]
//   codemod(files, renames)          → Map<file, { lines, changes }>, the old names written as the new ones
//   wayAcross({ renames, files, systemVersion }) → { renames, patches: [{ root, diff, files, lines }], removeIn, uses }
//   renamesMarkdown(way)             → handback/renames.md

import { linesDiff } from './rename-sweep.mjs';
import { rootOf } from './migrations.mjs';

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const sorted = (l) => [...(l ?? [])].map(String).sort();
const codeOf = (p) => p.code ?? p.name;

// The renames between two records' contracts (contract-changes.mjs recordOf). A prop gone and a prop new are one prop
// renamed when they hold the same type, options and default, or, failing that, when they are the only prop gone and
// the only one new and hold the same type. A value gone and a value new are one renamed when they sit in the same place
// of the prop's options and every other option stayed.
export function propRenames(base, now) {
  const out = [];
  for (const [name, b] of Object.entries(now?.contracts ?? {})) {
    const a = base?.contracts?.[name];
    if (!a) continue;
    const pa = new Map((a.props ?? []).map((p) => [p.name, p])), pb = new Map((b.props ?? []).map((p) => [p.name, p]));
    const gone = [...pa.values()].filter((p) => !pb.has(p.name)), added = [...pb.values()].filter((p) => !pa.has(p.name));
    const taken = new Set();
    for (const p of gone) {
      let q = added.find((x) => !taken.has(x.name) && same(x.type, p.type) && same(sorted(x.options), sorted(p.options)) && same(x.default, p.default));
      if (!q && gone.length === 1 && added.length === 1 && same(added[0].type, p.type)) q = added[0];
      if (!q) continue;
      taken.add(q.name);
      out.push({ component: name, kind: 'prop', from: p.name, to: q.name, code: { from: codeOf(p), to: codeOf(q) } });
    }
    for (const [n, p] of pa) {
      const q = pb.get(n);
      if (!q || !Array.isArray(p.options) || !Array.isArray(q.options) || p.options.length !== q.options.length) continue;
      const was = p.options.map(String), is = q.options.map(String);
      const moved = was.map((v, i) => [v, is[i]]).filter(([v, w]) => v !== w);
      if (moved.length !== 1) continue;
      const [[from, to]] = moved;
      if (is.includes(from) || was.includes(to)) continue;
      out.push({ component: name, kind: 'value', prop: n, from, to, code: { prop: codeOf(q), from, to } });
    }
  }
  return out;
}

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pascal = (s) => String(s).replace(/(^|[-_\s/])(\w)/g, (_, __, c) => c.toUpperCase());
const kebab = (s) => pascal(s).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
const UI = /\.(jsx|tsx|js|ts|mjs|vue|svelte|html?|mdx)$/i;

// Where each opening tag of a component ends: the first ">" outside quotes and braces. → [[start, end]] in the text.
function tagsOf(text, component) {
  const out = [], re = new RegExp(`<(?:${esc(pascal(component))}|${esc(kebab(component))})(?![\\w.-])`, 'g');
  for (const m of text.matchAll(re)) {
    let i = m.index + m[0].length, depth = 0, quote = null;
    for (; i < text.length; i++) {
      const c = text[i];
      if (quote) { if (c === quote) quote = null; continue; }
      if (c === '"' || c === "'" || c === '`') quote = c;
      else if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth <= 0) break;
    }
    out.push([m.index, i]);
  }
  return out;
}

// One opening tag with the renames applied: a prop's name (name=, :name=, v-bind:name=, or written alone as a boolean),
// and a value written as a literal ("old", 'old', {"old"}, :prop="'old'").
function renameIn(tag, renames) {
  let t = tag;
  for (const r of renames) {
    if (r.kind === 'prop') t = t.replace(new RegExp(`(\\s(?::|v-bind:)?)${esc(r.code.from)}(?=\\s*=|\\s|/?>|$)`, 'g'), `$1${r.code.to}`);
    else t = t.replace(new RegExp(`(\\s(?::|v-bind:)?${esc(r.code.prop)}\\s*=\\s*(?:\\{\\s*)?["'\`]\\s*'?)${esc(r.code.from)}(?=\\s*'?["'\`])`, 'g'), `$1${r.code.to}`);
  }
  return t;
}

// Every file that writes a renamed component with the old names: the lines that change. renames: propRenames().
export function codemod(files, renames) {
  const byComp = new Map();
  for (const r of renames ?? []) byComp.set(r.component, [...(byComp.get(r.component) ?? []), r]);
  const out = new Map();
  for (const { file, text } of files ?? []) {
    if (!UI.test(file)) continue;
    let src = String(text ?? '');
    const before = src;
    for (const [comp, rs] of byComp) {
      const tags = tagsOf(src, comp);
      for (const [s, e] of tags.reverse()) src = src.slice(0, s) + renameIn(src.slice(s, e), rs) + src.slice(e);
    }
    if (src === before) continue;
    const was = before.split('\n'), now = src.split('\n');
    if (was.length !== now.length) continue;
    if (was.length > 1 && was[was.length - 1] === '') { was.pop(); now.pop(); }
    const changes = new Map();
    was.forEach((l, i) => { if (l !== now[i]) changes.set(i + 1, now[i]); });
    if (changes.size) out.set(file, { lines: was, changes });
  }
  return out;
}

const majorOf = (v) => parseInt(String(v ?? '').replace(/^[^\d]*/, '').split('.')[0], 10);
// The version that removes the aliases: the system's next major, when its version is known.
export const removeInOf = (systemVersion) => (Number.isFinite(majorOf(systemVersion)) ? `${majorOf(systemVersion) + 1}.0.0` : null);

// The way across for every rename: the patches, one per root (the system's own files, then each product's), the places
// each root still writes each old name, and the version that removes the aliases.
export function wayAcross({ renames = [], files = [], systemVersion = null } = {}) {
  const changed = codemod(files, renames);
  const byRoot = new Map(), uses = {};
  for (const [file, entry] of changed) {
    const root = rootOf(file), rel = root === '.' ? file : file.slice(root.length + 1);
    if (!byRoot.has(root)) byRoot.set(root, new Map());
    byRoot.get(root).set(rel, entry);
    uses[root] = (uses[root] ?? 0) + entry.changes.size;
  }
  const patches = [...byRoot].map(([root, map]) => ({ root, diff: linesDiff(map), files: map.size, lines: [...map.values()].reduce((k, e) => k + e.changes.size, 0) }));
  return { renames, patches, uses, removeIn: removeInOf(systemVersion) };
}

const productName = (root) => (root === '.' ? 'This system' : root.split('/').pop());
const what = (r) => (r.kind === 'prop' ? `${r.component}'s prop \`${r.code.from}\` → \`${r.code.to}\`` : `${r.component}'s \`${r.code.prop}\` value \`${r.from}\` → \`${r.to}\``);

// One line per rename for the terminal and the merge request.
export const renameLine = (r) => (r.kind === 'prop' ? `${r.component}: prop ${r.code.from} renamed to ${r.code.to}` : `${r.component}: ${r.code.prop} value ${r.from} renamed to ${r.to}`);

// handback/renames.md: each rename, the alias the system keeps until the version that removes it, and each product's
// patch with the places it still writes the old name.
export function renamesMarkdown(way, files = {}) {
  if (!way?.renames?.length) return '';
  const until = way.removeIn ? `until ${way.removeIn}` : 'until the next major version';
  const lines = ['# Renamed in the contracts, with the way across', '', `${way.renames.length} rename${way.renames.length === 1 ? '' : 's'}. Each old name stays accepted, marked deprecated, ${until}, and every product moves before then.`, ''];
  for (const r of way.renames) {
    lines.push(`## ${what(r)}`, '');
    lines.push(r.kind === 'prop'
      ? `- The system keeps \`${r.code.from}\` as a deprecated alias of \`${r.code.to}\` ${until}, with a warning when it is used.`
      : `- The system keeps accepting \`${r.from}\` as \`${r.to}\` ${until}, with a warning when it is used.`);
    lines.push(`- The alias goes in ${way.removeIn ?? 'the next major version'}, once no product writes the old name.`, '');
  }
  const roots = Object.keys(way.uses ?? {});
  lines.push('## Still on the old names', '');
  if (!roots.length) lines.push('No product writes an old name: the aliases can go now.', '');
  else {
    for (const root of roots) lines.push(`- ${productName(root)}: ${way.uses[root]} place${way.uses[root] === 1 ? '' : 's'}${files[root] ? `, patch ${files[root]}` : ''}`);
    lines.push('', 'Each patch is applied in its own folder (`git apply`) when the team asks. The engine applies none.', '');
  }
  return lines.join('\n');
}

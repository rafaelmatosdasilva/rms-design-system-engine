// rename-sweep.mjs - a token renamed in Figma, renamed everywhere in one change (L11).
//
// A rename in Figma reads, to every check, as one token gone and another one new: the theme still declares the old CSS
// variable, every rule and every product still writes it, and each shows up as a finding of its own. This pairs the two
// sides of a rename between two reads of Figma (the vars snapshot as last committed, and as now): a token gone and a token
// new with the same value in every mode (and the same alias, when Figma has one), the closest name winning when several
// match. Then it writes one change: the old variable renamed to the new one in the theme, in every rule and script of the
// system and its products, and in the docs, with the old name kept pointing at the new one in the theme, so a product
// released on its own does not break before it moves (its steps are in migrations.md, K12).

import { spawnSync } from 'node:child_process';
import { tokenToVar } from './naming-convention.mjs';

// Every token of a vars snapshot with what it holds in each mode, and the alias it points at: { name: key }.
export function tokenKeys(vars = {}) {
  const out = new Map(), add = (n, part) => { if (!n || n.startsWith('_')) return; out.set(n, [...(out.get(n) ?? []), part]); };
  for (const [mode, map] of Object.entries(vars.color ?? {})) for (const [n, v] of Object.entries(map ?? {})) add(n, `c:${mode}=${String(v).toLowerCase()}|${(vars.aliases?.[mode]?.[n] ?? [])[0] ?? ''}`);
  for (const [mode, map] of Object.entries(vars.primitives ?? {})) for (const [n, v] of Object.entries(map ?? {})) add(n, `p:${mode}=${String(v).toLowerCase()}`);
  for (const [n, v] of Object.entries(vars.sizing ?? {})) add(n, `s=${String(v).toLowerCase()}`);
  return new Map([...out].map(([n, parts]) => [n, parts.sort().join(';')]));
}

// How alike two names are: the parts they share, counted from the end (the role) and the start (the family).
const alike = (a, b) => { const x = a.split('/'), y = b.split('/'); let s = 0; for (const p of x) if (y.includes(p)) s += 1; return s + (x[x.length - 1] === y[y.length - 1] ? 0.5 : 0); };

// The renames between two reads: [{ from, to }], each old name to one new name with the same values in every mode.
export function renamedTokens(prev = {}, next = {}) {
  const before = tokenKeys(prev), after = tokenKeys(next);
  const gone = [...before.keys()].filter((n) => !after.has(n)), added = [...after.keys()].filter((n) => !before.has(n));
  const taken = new Set(), out = [];
  for (const from of gone) {
    const key = before.get(from);
    if (!key) continue;
    const same = added.filter((n) => !taken.has(n) && after.get(n) === key).sort((a, b) => alike(from, b) - alike(from, a) || a.localeCompare(b));
    if (!same.length) continue;
    taken.add(same[0]);
    out.push({ from, to: same[0] });
  }
  return out;
}

// The CSS variable a Figma name is written as in this project: the map's explicit entry, else the naming convention
// (a colour by the colour rule, any other token by the plain one).
export function cssVarOf(name, vars = {}, spec, explicit = {}) {
  if (explicit[name]) return explicit[name];
  const colour = Object.values(vars.color ?? {}).some((m) => m && name in m);
  return tokenToVar(name, spec, { raw: !colour });
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// The lines to change in each file: every "--old" (whole name) written as "--new". files: [{ file, text }].
// renames: [{ from: '--old', to: '--new' }]. → Map<file, { lines, changes: Map<line, text> }>.
// The old name kept pointing at the new one ("--old: var(--new)") is the sweep's own line, and stays.
const keptLine = (l, r) => new RegExp(`^\\s*${escape(r.from)}\\s*:\\s*var\\(\\s*${escape(r.to)}\\s*\\)`).test(l);
export function sweepFiles(files, renames) {
  const res = renames.map((r) => [new RegExp(`${escape(r.from)}(?![\\w-])`, 'g'), r.to, r]);
  const out = new Map();
  for (const { file, text } of files ?? []) {
    const lines = String(text ?? '').split('\n');
    if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();   // a file's last newline ends its last line, it is no line of its own
    const changes = new Map();
    lines.forEach((l, i) => { let n = l; for (const [re, to, r] of res) if (!keptLine(l, r)) n = n.replace(re, to); if (n !== l) changes.set(i + 1, n); });
    if (changes.size) out.set(file, { lines, changes });
  }
  return out;
}

// The old name kept pointing at the new one, after the new declaration in the theme: added lines, by file and line.
// theme: { file, text } as it will be once renamed. → Map<file, Map<line, [extra lines]>>.
export function keepOldNames(theme, renames) {
  const adds = new Map();
  const lines = String(theme?.text ?? '').split('\n');
  for (const r of renames) {
    lines.forEach((l, i) => {
      const m = new RegExp(`^(\\s*)${escape(r.to)}\\s*:`).exec(l);
      if (!m) return;
      const at = adds.get(i + 1) ?? [];
      at.push(`${m[1]}${r.from}: var(${r.to});   /* renamed to ${r.to}: remove once every product has moved */`);
      adds.set(i + 1, at);
    });
  }
  return adds;
}

// A unified diff from line replacements: { lines, changes: Map<line, text> } per file, where a replacement may hold
// several lines (a declaration and the old name kept after it). One hunk per group of nearby lines, one line of context.
export function linesDiff(byFile) {
  let out = '';
  for (const [file, { lines, changes }] of byFile) {
    out += `--- a/${file}\n+++ b/${file}\n`;
    const ns = [...changes.keys()].sort((a, b) => a - b), groups = [];
    for (const n of ns) { const g = groups[groups.length - 1]; if (g && n - g[g.length - 1] <= 2) g.push(n); else groups.push([n]); }
    let shift = 0;
    for (const g of groups) {
      const from = Math.max(1, g[0] - 1), to = Math.min(lines.length, g[g.length - 1] + 1), body = [];
      let added = 0;
      for (let i = from; i <= to; i++) {
        if (changes.has(i)) { const now = String(changes.get(i)).split('\n'); body.push(`-${lines[i - 1]}`, ...now.map((l) => `+${l}`)); added += now.length - 1; }
        else body.push(` ${lines[i - 1]}`);
      }
      const len = to - from + 1;
      out += `@@ -${from},${len} +${from + shift},${len + added} @@\n${body.join('\n')}\n`;
      shift += added;
    }
  }
  return out;
}

// The whole sweep for a project: the renames as CSS variables, the files that change under each root (the system's,
// then each product's, paths from that root), the old names kept in the theme. prev, next: vars snapshots. files:
// [{ file (from the system's root, a product's with ../), text }]. themes: the theme files (from the system's root).
// → { renames: [{ from, to, token: { from, to } }], patches: [{ root, diff, files, lines }] }.
export function renameSweep({ prev, next, spec, explicit = {}, files = [], themes = [], keepOld = true }) {
  const renames = renamedTokens(prev, next).map((r) => ({ token: r, from: cssVarOf(r.from, prev, spec, explicit), to: cssVarOf(r.to, next, spec, explicit) }))
    .filter((r) => r.from !== r.to && files.some((f) => String(f.text ?? '').split('\n').some((l) => new RegExp(`${escape(r.from)}(?![\\w-])`).test(l) && !keptLine(l, r))));
  const changed = sweepFiles(files, renames);
  if (keepOld) for (const t of themes) {
    const entry = changed.get(t);
    if (!entry) continue;
    const renamedText = entry.lines.map((l, i) => entry.changes.get(i + 1) ?? l).join('\n');
    for (const [line, extra] of keepOldNames({ file: t, text: renamedText }, renames)) entry.changes.set(line, [entry.changes.get(line) ?? entry.lines[line - 1], ...extra].join('\n'));
  }
  // One patch per root: the system's own files, then each product's (a path that starts with ../ names its folder).
  const byRoot = new Map();
  for (const [file, entry] of changed) {
    const m = /^((?:\.\.\/)+[^/]+)\/(.+)$/.exec(file);
    const root = m ? m[1] : '.', rel = m ? m[2] : file;
    if (!byRoot.has(root)) byRoot.set(root, new Map());
    byRoot.get(root).set(rel, entry);
  }
  const patches = [...byRoot].map(([root, map]) => ({ root, diff: linesDiff(map), files: map.size, lines: [...map.values()].reduce((k, e) => k + e.changes.size, 0) }));
  return { renames, patches };
}

// The vars snapshot as Figma was read before: at `since` (a git ref) when given; else as last committed when the file
// has changed since; else as it was before its last committed change. → { vars, label } or null without history.
export function previousSnapshot(ROOT, path, since = null) {
  const git = (...args) => { const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); return r.status === 0 ? r.stdout : null; };
  const at = (ref) => { const t = git('show', `${ref}:${path}`); try { return t ? JSON.parse(t) : null; } catch { return null; } };
  if (since) { const v = at(since); return v ? { vars: v, label: since } : null; }
  const changed = (git('status', '--porcelain', '--', path) ?? '').trim();
  if (changed) { const v = at('HEAD'); return v ? { vars: v, label: 'the last commit' } : null; }
  const [last, before] = (git('log', '-2', '--format=%h', '--', path) ?? '').trim().split('\n');
  if (!before) return null;
  const v = at(before);
  return v ? { vars: v, label: `the read before ${last}` } : null;
}

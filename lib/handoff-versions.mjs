// handoff-versions.mjs - a handoff in versions, each saying what changed since the one before it.
//
// A handoff is given, reviewed and given again: v1 goes to the developers, they ask for changes, v2 follows. Written
// over each time, the page says only what is true now, and the developers compare v2 with v1 by hand. So each
// handoff made at a tag is kept, as the facts it was written from, beside the prototypes
// (<prototype.dir>/<name>.handoffs/<tag>.json), and the next one says what moved since: components used, options the
// check found wrong, what the system still lacks, the dependencies, the copy of the system. A handoff read from the
// folder (no tag) is a draft: it is compared with the last version, and never kept as one.
//
//   keepHandoff(dir, pkg)        → the package with `since` (the change from the last version), written when at a tag
//   handoffDiff(before, now)     → { label, components, findings, gaps, dependencies, copy } or null when nothing moved
//   sinceLines(since)            → the lines the handoff page prints for it
//   recordHandoff(dir, pkg, lines) → { file, kept }: the page a version given at a tag was, written once and never again
//
// A version given at a tag is a commitment: the page it was is kept as written (<name>.handoffs/<tag>.md) and nothing
// rewrites it, so the team that built the feature can read months later exactly what it was given. Checking again at
// the same tag leaves it as it is and says so.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { notesDiff } from './handoff-notes.mjs';
import { join } from 'node:path';

const safe = (tag) => String(tag).replace(/[^\w.-]+/g, '__');

export function versionsOf(dir, name) {
  const at = join(dir, `${name}.handoffs`);
  let files;
  try { files = readdirSync(at).filter((f) => f.endsWith('.json')); } catch { return []; }
  return files.map((f) => { try { return JSON.parse(readFileSync(join(at, f), 'utf8')); } catch { return null; } }).filter(Boolean)
    .sort((a, b) => String(a.at ?? '').localeCompare(String(b.at ?? '')));
}

const names = (list, key) => new Set((list ?? []).map((x) => x[key]).filter(Boolean));
const plusMinus = (before, now) => ({ added: [...now].filter((x) => !before.has(x)).sort(), removed: [...before].filter((x) => !now.has(x)).sort() });

export function handoffDiff(before, now) {
  if (!before) return null;
  const used = (p) => new Map((p.components ?? []).map((c) => [c.name, c.times]));
  const b = used(before), n = used(now);
  const components = { ...plusMinus(new Set(b.keys()), new Set(n.keys())), moved: [...n].filter(([k, t]) => b.has(k) && b.get(k) !== t).map(([k, t]) => ({ name: k, was: b.get(k), now: t })) };
  const findings = plusMinus(new Set((before.open ?? []).map((f) => f.message)), new Set((now.open ?? []).map((f) => f.message)));
  const gaps = plusMinus(names(before.gaps, 'need'), names(now.gaps, 'need'));
  const dep = (p) => new Set((p.dependencies ?? []).map((d) => `${d.name} ${d.version}`));
  const dependencies = plusMinus(dep(before), dep(now));
  const changes = (p) => new Set((p.copies ?? []).flatMap((c) => c.changes.flatMap((ch) => ch.files)));
  const copy = plusMinus(changes(before), changes(now));
  const notes = notesDiff(before.notes, now.notes) ?? [];
  const any = [components.added, components.removed, components.moved, findings.added, findings.removed, gaps.added, gaps.removed, dependencies.added, dependencies.removed, copy.added, copy.removed, notes].some((l) => l.length);
  return { label: before.version ?? before.at?.slice(0, 10) ?? 'the last version', any, components, findings, gaps, dependencies, copy, notes };
}

export function keepHandoff(dir, pkg) {
  const tag = pkg.checkedAt?.prototype?.tag ?? null;
  const all = versionsOf(dir, pkg.name).filter((v) => v.version !== tag);
  const since = handoffDiff(all[all.length - 1] ?? null, pkg);
  const out = { ...pkg, version: tag, since };
  if (tag) {
    try {
      const at = join(dir, `${pkg.name}.handoffs`);
      mkdirSync(at, { recursive: true });
      const { since: _drop, ...kept } = out;
      writeFileSync(join(at, `${safe(tag)}.json`), JSON.stringify(kept, null, 2) + '\n');
    } catch { /* the page is written all the same */ }
  }
  return out;
}

const bullet = (s) => `- ${s}`;
export function sinceLines(since) {
  if (!since) return [];
  const out = [`## What changed since ${since.label}`, ''];
  if (!since.any) return [...out, 'Nothing the check reads: the same components, the same findings, the same gaps and dependencies.', ''];
  const c = since.components;
  for (const n of c.added) out.push(bullet(`Now uses ${n}`));
  for (const n of c.removed) out.push(bullet(`No longer uses ${n}`));
  for (const m of c.moved) out.push(bullet(`${m.name}: used ${m.now}× (was ${m.was}×)`));
  for (const f of since.findings.removed) out.push(bullet(`Fixed: ${f}`));
  for (const f of since.findings.added) out.push(bullet(`New: ${f}`));
  for (const g of since.gaps.added) out.push(bullet(`The system now lacks: ${g}`));
  for (const g of since.gaps.removed) out.push(bullet(`No longer a gap: ${g}`));
  for (const d of since.dependencies.added) out.push(bullet(`Dependency added: ${d}`));
  for (const d of since.dependencies.removed) out.push(bullet(`Dependency gone: ${d}`));
  for (const f of since.copy.added) out.push(bullet(`Changed in the copy of the system: ${f}`));
  for (const f of since.copy.removed) out.push(bullet(`Back to the system's own: ${f}`));
  for (const n of since.notes ?? []) out.push(bullet(`What people say, ${n.title}: ${n.how}`));
  out.push('');
  return out;
}

export function recordHandoff(dir, pkg, lines) {
  const tag = pkg.version ?? null;
  if (!tag) return null;
  const file = join(dir, `${pkg.name}.handoffs`, `${safe(tag)}.md`);
  if (existsSync(file)) return { file, kept: true };
  try { mkdirSync(join(dir, `${pkg.name}.handoffs`), { recursive: true }); writeFileSync(file, lines.join('\n') + '\n'); return { file, kept: false }; }
  catch { return null; }
}

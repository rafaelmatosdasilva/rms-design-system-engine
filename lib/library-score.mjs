// library-score.mjs - one number for how the Figma library is doing, and whether it is better than before.
//
// The Rules page lists every rule and what breaks it: read by whoever fixes them, never by whoever decides where the
// team's time goes. This gives the library a score from the rules the team keeps, each kind's own score beside it, and
// the trend over the builds kept. The score is the system's own, never a fixed standard: a rule still to decide, or one
// the team set aside, counts for nothing.
//
//   scoreOf(rules)              → { score, areas: [{ area, score, rules }] } or null
//     rules: the Rules page's, Figma's side (construction-page.mjs constructionView); each { area, status, follows, of }
//   withHistory(ROOT, now, s)   → s with { previous } the last score kept on another day, and the history file kept
//
// A rule's share is the part of what it reads that already follows it. A kind's score is its rules' shares, averaged;
// the library's is the kinds' scores averaged, so a kind with many rules (naming) weighs no more than one with few.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const KEPT = new Set(['rule', 'fix']);
// The areas the Rules page shows (its Area column and filter): a rule keeps the finer kind it was judged by (layers,
// nesting, wiring), and is scored under the area a person reads, so no area is said twice.
export const PAGE_AREA = {
  naming: 'Naming',
  layout: 'Structure', layers: 'Structure', nesting: 'Structure', placement: 'Structure', wiring: 'Structure', interactions: 'Structure',
  architecture: 'Properties', products: 'Properties',
  variables: 'Tokens', tokens: 'Tokens', styles: 'Tokens',
  documentation: 'Documentation', code: 'Documentation',
};
const pageArea = (a) => PAGE_AREA[a] ?? (a ? a[0].toUpperCase() + a.slice(1) : 'Other');
const pct = (x) => Math.round(x * 100);

export function scoreOf(rules = []) {
  const kept = rules.filter((r) => KEPT.has(r?.status) && r.of > 0);
  if (!kept.length) return null;
  const byArea = new Map();
  for (const r of kept) { const a = pageArea(r.area); if (!byArea.has(a)) byArea.set(a, []); byArea.get(a).push(r.follows / r.of); }
  const areas = [...byArea].map(([area, shares]) => ({ area, score: pct(shares.reduce((x, y) => x + y, 0) / shares.length), rules: shares.length }))
    .sort((a, b) => a.score - b.score || a.area.localeCompare(b.area));
  return { score: Math.round(areas.reduce((x, a) => x + a.score, 0) / areas.length), areas };
}

// The history beside the build's other output: one entry a day, the latest of the day kept, a year at most.
export function withHistory(file, now, s) {
  if (!s) return s;
  let h = [];
  try { h = JSON.parse(readFileSync(file, 'utf8')); } catch { /* the first build that scores */ }
  if (!Array.isArray(h)) h = [];
  const day = String(now).slice(0, 10);
  const previous = [...h].reverse().find((e) => String(e.at).slice(0, 10) < day) ?? null;
  const next = [...h.filter((e) => String(e.at).slice(0, 10) !== day), { at: now, score: s.score, areas: s.areas.map(({ area, score }) => ({ area, score })) }].slice(-366);
  try { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(next, null, 2) + '\n'); } catch { /* a read-only output: the score still shows */ }
  return { ...s, ...(previous ? { previous: { at: previous.at, score: previous.score } } : {}) };
}

export const scoreFile = (outDir) => join(outDir, 'library-score.json');

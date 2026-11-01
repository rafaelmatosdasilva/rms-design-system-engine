// cards-read.mjs - which components' cards this project has actually handed over, and when.
//
// A page that uses a component whose card was never read is where layout and prop mistakes come from: the agent
// wrote the component from its name instead of from what it takes. `--catalog` notes here every card it hands over
// in full, and `--check-ui` reads it, so the check can name the components a page used unread.
//
// Local only, in the engine's output folder, never sent anywhere, and never a reason to refuse a page: it is a
// warning, because an agent may have been given a card another way (a person pasted it, an earlier project).
//
// A card read long ago is as good as unread. An agent's session is minutes, not weeks, so only what was handed over
// recently counts; the window is wide enough that a slow session, or a person who reads the catalog and builds after
// lunch, is never told off for it.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { OUT_DIR } from './names.mjs';

export const CARDS_FILE = `${OUT_DIR}/cards-read.json`;
export const WINDOW_MS = 12 * 60 * 60 * 1000;

const fileOf = (ROOT) => join(ROOT, CARDS_FILE);
const read = (ROOT) => { try { const j = JSON.parse(readFileSync(fileOf(ROOT), 'utf8')); return j && typeof j === 'object' && !Array.isArray(j) ? j : {}; } catch { return {}; } };

// Note that these components' cards were handed over now. Never throws: a project whose output folder cannot be
// written still gets its catalog, it just cannot be told later which cards it read.
export function noteCardsRead(ROOT, names = [], now = Date.now()) {
  const keep = [...new Set(names.map((n) => String(n ?? '').trim()).filter(Boolean))];
  if (!keep.length) return {};
  const at = read(ROOT);
  for (const n of keep) at[n] = now;
  // What fell out of the window is dropped here, so the file stays the size of a session rather than of a project.
  for (const [n, t] of Object.entries(at)) if (!(Number(t) > now - WINDOW_MS)) delete at[n];
  try { mkdirSync(dirname(fileOf(ROOT)), { recursive: true }); writeFileSync(fileOf(ROOT), JSON.stringify(at, null, 1) + '\n'); } catch { /* the catalog still stands */ }
  return at;
}

// The cards read recently → a Set of names. Empty means nothing is known, not that nothing was read: a caller turns
// that into "say nothing" rather than into "every component was written blind" (ui-check.mjs).
export function cardsRead(ROOT, { now = Date.now(), windowMs = WINDOW_MS } = {}) {
  return new Set(Object.entries(read(ROOT)).filter(([, t]) => Number(t) > now - windowMs).map(([n]) => n));
}

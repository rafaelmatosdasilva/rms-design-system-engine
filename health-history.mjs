// health-history.mjs - the Status page's numbers kept per release, so the page shows each one's trend beside today's.
//
// The Status page's cards say how far the system has come today: the share matched (Parity), built (Code), passed
// (Accessibility) and written (Documentation), and its AI readiness (the share of components an agent can pick and use
// from the team's guidance, guidance-rating.mjs). A build that tries the page in a browser (styleguide-bake.mjs) reads
// those numbers from the page and keeps them here, one entry per release of the project (its version tags, as History
// groups the commits): the last numbers measured on code that release holds. Work not released yet is kept as the next
// release's until its tag exists, then it becomes that release's.
//
// The record is a *.snapshot.json, so the snapshots store carries it to everyone, and two copies are merged entry by
// entry (stores.mjs): each release keeps the numbers measured from the newer inputs (stamp.mjs), never one copy's
// whole file over the other's.
//
// Where nothing was kept yet, the record is filled from what history still holds: an earlier page on disk, and the
// pages the project committed at each release tag, each carrying the record as it was then (<script id="sg-health-history">).
//
//   readHealth(file) → record          recordHealth(record, run, { ROOT, releaseOf }) → { record, key, kept }
//   mergeHealth(a, b, { ROOT }) → record    trendOf(record, release) → { release, past, kept }
//   withHealth(html, payload) → html    healthIn(html) → payload | null    backfillHealth(record, pages) → record
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { compareStamps } from './stamp.mjs';
import { compareVersions } from './releases.mjs';

export const HEALTH_FILE = 'health-history.snapshot.json';
export const HEALTH_ID = 'sg-health-history';
// The numbers kept, in the order the page shows them.
export const AREAS = ['Parity', 'Code', 'Accessibility', 'Documentation', 'AI readiness'];
// Work measured before its release was tagged: the next release's, until the tag says which one it is.
export const UNRELEASED = 'unreleased';
// How many past releases the page shows (the record keeps every one).
export const SHOWN = 8;

const empty = () => ({ version: 1, releases: {} });
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : null);

// The record as it is kept, or an empty one. text: a file's contents (or an object).
export function parseHealth(text) {
  let j = text;
  if (typeof text === 'string' || Buffer.isBuffer(text)) { try { j = JSON.parse(String(text)); } catch { return empty(); } }
  if (!j || typeof j !== 'object' || !j.releases || typeof j.releases !== 'object') return empty();
  const releases = {};
  for (const [k, e] of Object.entries(j.releases)) if (e && typeof e === 'object' && e.values && typeof e.values === 'object') releases[k] = e;
  return { version: 1, ...(j._built ? { _built: j._built } : {}), releases };
}
export function readHealth(file) { try { return parseHealth(readFileSync(file, 'utf8')); } catch { return empty(); } }
export function healthText(record) {
  return JSON.stringify({ version: 1, $description: 'The Status page\'s numbers at each release (the share matched, built, passed, written and AI-ready), for its trend. Written by rms-design-system-engine --styleguide; kept with the snapshots.', ...(record._built ? { _built: record._built } : {}), releases: sorted(record.releases) }, null, 1) + '\n';
}
const sorted = (releases) => Object.fromEntries(Object.entries(releases).sort(([a], [b]) => (a === UNRELEASED) - (b === UNRELEASED) || compareVersions(a, b) || a.localeCompare(b)));

// Of two entries of one release, the one measured from the newer inputs; inputs that cannot be ordered (two branches),
// the later one. → a or b
function newer(a, b, ROOT) {
  if (!a) return b; if (!b) return a;
  if (a.built && b.built) {
    if (compareStamps(a.built, b.built, { ROOT }).older) return a;   // b was built from older inputs
    if (compareStamps(b.built, a.built, { ROOT }).older) return b;
  }
  return String(b.at ?? '') > String(a.at ?? '') ? b : a;
}

// Which release a code commit belongs to, from the project's release log (component-changelog.mjs → releaseLog: each
// release with the commits it holds, newest first, what is not released yet with release null), else git: the first
// version tag that holds it. null when it is not released yet, or nothing says.
export function releaseFinder(ROOT, log = []) {
  const bySha = new Map();
  for (const g of log ?? []) for (const c of g?.commits ?? []) if (c?.sha && !bySha.has(c.sha)) bySha.set(c.sha, g.release ?? null);
  return (sha) => {
    if (!sha) return null;
    if (bySha.has(sha)) return bySha.get(sha);
    const r = spawnSync('git', ['tag', '--contains', sha, '-l', 'v[0-9]*', '--sort=v:refname'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return r.status === 0 ? r.stdout.split('\n').map((s) => s.trim()).filter(Boolean)[0] ?? null : null;
  };
}

// Keep a run's numbers. run: { values: { area: percent }, code, built (its stamp), at }. An entry measured before its
// release was tagged moves to that release first. An entry already kept from newer inputs is kept, and a number this
// run could not measure (accessibility not tried everywhere) keeps the one the release had.
// → { record, key (the release the numbers went to), kept (true when the record already had newer ones) }
export function recordHealth(record, run = {}, { ROOT = null, releaseOf = () => null } = {}) {
  const base = parseHealth(record), out = { ...base, releases: { ...base.releases } };
  const u = out.releases[UNRELEASED];
  if (u?.code) {
    const r = releaseOf(u.code);
    if (r) { out.releases[r] = newer(out.releases[r], u, ROOT); delete out.releases[UNRELEASED]; }
  }
  const key = releaseOf(run.code) ?? UNRELEASED;
  const values = Object.fromEntries(AREAS.map((a) => [a, num(run.values?.[a])]));
  if (!AREAS.some((a) => values[a] != null)) return { record: out, key, kept: false };
  const prev = out.releases[key];
  if (prev?.built && run.built && compareStamps(prev.built, run.built, { ROOT }).older) return { record: out, key, kept: true };
  for (const a of AREAS) if (values[a] == null && prev?.values && num(prev.values[a]) != null) values[a] = num(prev.values[a]);
  out.releases[key] = { at: run.at ?? new Date().toISOString(), ...(run.code ? { code: run.code } : {}), ...(run.built ? { built: run.built } : {}), values: Object.fromEntries(Object.entries(values).filter(([, v]) => v != null)) };
  if (run.built) out._built = run.built;
  return { record: out, key, kept: false };
}

// Two copies of the record as one: every release either holds, and for a release both hold, the numbers measured from
// the newer inputs. a, b: records or their files' text.
export function mergeHealth(a, b, { ROOT = null } = {}) {
  const x = parseHealth(a), y = parseHealth(b);
  const releases = { ...x.releases };
  for (const [k, e] of Object.entries(y.releases)) releases[k] = newer(releases[k], e, ROOT);
  const built = newer(x._built ? { built: x._built } : null, y._built ? { built: y._built } : null, ROOT)?.built;
  return { version: 1, ...(built ? { _built: built } : {}), releases };
}
// The same for the store (stores.mjs): the two files' text in, the merged file's text out.
export const mergeHealthFiles = (mine, theirs, opts) => healthText(mergeHealth(mine, theirs, opts));

// What the page shows: each past release's numbers, oldest first (the release this build belongs to and those after
// it left out: today's numbers are measured live), and the record itself, so a page kept in history carries it.
// release: the release this build's code belongs to (null: not released yet).
export function trendOf(record, release = null) {
  const r = parseHealth(record);
  const past = Object.entries(r.releases)
    .filter(([k]) => k !== UNRELEASED && k !== release && (!release || compareVersions(k, release) < 0))
    .sort(([a], [b]) => compareVersions(a, b) || a.localeCompare(b))
    .slice(-SHOWN)
    .map(([k, e]) => ({ release: k, at: e.at ?? null, values: e.values }));
  return { release: release ?? null, past, kept: { ...(r._built ? { _built: r._built } : {}), releases: sorted(r.releases) } };
}

// The payload in the page, right after its data (or before its first script), an earlier one replaced.
const TAG_RE = new RegExp(`<script id="${HEALTH_ID}" type="application/json">[\\s\\S]*?<\\/script>`);
const DATA_RE = /<script[^>]*\bid="sg-data"[^>]*>[\s\S]*?<\/script>/;
export function withHealth(html, payload) {
  const tag = `<script id="${HEALTH_ID}" type="application/json">${JSON.stringify(payload ?? {}).replace(/</g, '\\u003c')}</script>`;
  if (TAG_RE.test(html)) return html.replace(TAG_RE, () => tag);
  const data = DATA_RE.exec(html);
  if (data) return html.slice(0, data.index + data[0].length) + tag + html.slice(data.index + data[0].length);
  const at = html.search(/<script(?![^>]*application\/json)/);
  return at < 0 ? html + tag : html.slice(0, at) + tag + html.slice(at);
}
export function healthIn(html) {
  const m = TAG_RE.exec(String(html ?? ''));
  if (!m) return null;
  try { return JSON.parse(m[0].replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '')); } catch { return null; }
}

// The record filled from pages kept in history: each page's own record (what it carried when it was built) merged in.
// pages: [html]. → record
export function backfillHealth(record, pages = [], { ROOT = null } = {}) {
  let out = parseHealth(record);
  for (const html of pages) { const p = healthIn(html); if (p?.kept) out = mergeHealth(out, p.kept, { ROOT }); }
  return out;
}

// The pages the project committed at each release tag (the page's path from the project's folder), for backfillHealth: only
// for releases the record does not hold yet. → [html]
export function pagesAtReleases(ROOT, pageRel, releases = [], record = empty()) {
  const r = parseHealth(record), out = [];
  if (!pageRel || pageRel.startsWith('..')) return out;
  for (const tag of releases) {
    if (!tag || r.releases[tag]) continue;
    const g = spawnSync('git', ['show', `${tag}:./${pageRel.replace(/\\/g, '/')}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
    if (g.status === 0 && g.stdout.includes(HEALTH_ID)) out.push(g.stdout);
  }
  return out;
}

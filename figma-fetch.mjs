// figma-fetch.mjs - a fetch wrapper with a hard timeout AND throttle-aware retries
// for every Figma REST call.
//
// Node's global fetch has NO default timeout, so a single stalled response would block
// the whole audit - and, via the pre-commit hook, the commit - forever. On timeout we
// throw a clear, catchable error; every caller wraps its fetch in try/catch and falls
// back to the committed snapshot, so a slow API degrades to "refresh skipped, using
// cache" instead of an infinite hang.
//
// Rate limiting: Phase-1 fires several refreshers (bound tokens, state tokens, state
// bindings, frame geometry, …), each walking the DS frames, so the /nodes endpoint gets
// hit hard and Figma answers 429. Previously that 429 propagated as a failed refresh and
// the run fell back to STALE snapshots - losing depth. Now a 429 (or a transient 503) is
// retried with backoff, honouring the Retry-After header, so the refresh WAITS out the
// throttle and completes with the full, live data. Waiting is bounded (finite attempts,
// each wait capped) so it can never hang like the pre-timeout days. Only Phase-1 refreshes
// touch the network, so these waits never affect the cache-only pre-commit audit.

// Per-attempt timeout in ms. Override with FIGMA_FETCH_TIMEOUT_MS; floored at 1s.
export const FIGMA_FETCH_TIMEOUT_MS =
  Math.max(1000, parseInt(process.env.FIGMA_FETCH_TIMEOUT_MS, 10) || 20000);

// Max retries on a throttle/transient status. FIGMA_FETCH_MAX_RETRIES=0 disables retrying.
const _envRetries = parseInt(process.env.FIGMA_FETCH_MAX_RETRIES, 10);
export const FIGMA_FETCH_MAX_RETRIES = Number.isFinite(_envRetries) && _envRetries >= 0 ? _envRetries : 4;

// Upper bound on any single backoff wait (also caps a large Retry-After).
const FIGMA_FETCH_BACKOFF_CAP_MS =
  Math.max(1000, parseInt(process.env.FIGMA_FETCH_BACKOFF_CAP_MS, 10) || 10000);

// A Retry-After longer than this is a daily or monthly limit, not a per-minute throttle (idea I67): waiting
// cannot clear it within a run, and every retry spends more of the quota. So the wrapper stops at once, and every
// later call in the run answers 429 without touching the network. Override with FIGMA_LONG_LIMIT_S.
export const FIGMA_LONG_LIMIT_S = Math.max(1, parseInt(process.env.FIGMA_LONG_LIMIT_S, 10) || 120);

// Statuses worth retrying: 429 Too Many Requests, 503 Service Unavailable (transient).
const RETRYABLE_STATUS = new Set([429, 503]);

// Build a fetch wrapper. `fetchImpl`, `timeoutMs`, and (via `cfg`) `maxRetries` / `sleep`
// are injectable so the timeout AND retry behaviour can be unit-tested without a network.
// A caller-supplied `opts.signal` is respected as-is (no timeout added, no auto-retry) so
// explicit cancellation still works.
// figmaFetch.stats counts what a run spent: { calls, failed, limit } (limit: null, or what Figma said about the
// long limit it hit: { retryAfterS, tier, type }).
export function makeFigmaFetch(fetchImpl = globalThis.fetch, timeoutMs = FIGMA_FETCH_TIMEOUT_MS, cfg = {}) {
  const maxRetries = cfg.maxRetries ?? FIGMA_FETCH_MAX_RETRIES;
  const capMs      = cfg.backoffCapMs ?? FIGMA_FETCH_BACKOFF_CAP_MS;
  const longS      = cfg.longLimitS ?? FIGMA_LONG_LIMIT_S;
  const sleep      = cfg.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const stats = { calls: 0, failed: 0, limit: null };
  const limited = () => ({ ok: false, status: 429, statusText: 'Figma rate limit reached earlier in this run', headers: { get: () => null }, text: async () => '', json: async () => ({}) });
  // The same GET in one run is asked once: several refreshers read /components and /component_sets, and
  // each repeat spent the seat's quota. A successful answer is kept as text and handed out afresh each time.
  const seen = new Map();
  const replay = (s) => ({ ok: true, status: s.status, statusText: s.statusText, headers: s.headers, text: async () => s.body, json: async () => JSON.parse(s.body) });
  const figmaFetch = async function figmaFetch(url, opts = {}) {
    const once = cfg.dedupe !== false && !opts.signal && (!opts.method || opts.method === 'GET');
    if (once && seen.has(url)) { const s = await seen.get(url); if (s) return replay(s); }
    const p = fetchOnce(url, opts);
    if (!once) return p;
    const kept = p.then(async (res) => (res?.ok && typeof res.text === 'function'
      ? { status: res.status, statusText: res.statusText, headers: res.headers, body: await res.text() } : null), () => null);
    seen.set(url, kept);
    const s = await kept;
    if (s) return replay(s);
    seen.delete(url);   // a failure is never replayed: the next caller asks again
    return p;
  };
  const fetchOnce = async (url, opts) => {
    if (stats.limit) { stats.failed++; return limited(); }
    for (let attempt = 0; ; attempt++) {
      let res;
      try {
        stats.calls++;
        res = await fetchImpl(url, { ...opts, signal: opts.signal || AbortSignal.timeout(timeoutMs) });
      } catch (e) {
        if (e && (e.name === 'TimeoutError' || e.name === 'AbortError'))
          throw new Error(`Figma API did not respond within ${timeoutMs / 1000}s (rate limit or network stall)`);
        stats.failed++;
        throw e;
      }
      const ra = parseInt(res.headers?.get?.('retry-after') ?? '', 10);
      if (res.status === 429 && Number.isFinite(ra) && ra > longS) {
        stats.limit = { retryAfterS: ra, tier: res.headers?.get?.('x-figma-plan-tier') ?? null, type: res.headers?.get?.('x-figma-rate-limit-type') ?? null };
        stats.failed++;
        return res;
      }
      // Return unless it is a retryable throttle we still have budget for. A caller-supplied
      // signal means the caller controls the lifecycle, so never auto-retry under it.
      if (!RETRYABLE_STATUS.has(res.status) || attempt >= maxRetries || opts.signal) {
        if (res.status >= 400) stats.failed++;
        return res;
      }
      // Honour Retry-After (seconds); otherwise exponential backoff with jitter, capped.
      const waitMs = Number.isFinite(ra) && ra >= 0
        ? Math.min(ra * 1000, capMs)
        : Math.min(1000 * 2 ** attempt, capMs) + Math.floor(Math.random() * 250);
      await sleep(waitMs);
    }
  };
  figmaFetch.stats = stats;
  return figmaFetch;
}

// "about 3 hours", "about 12 days": how long Figma asked to wait.
export function waitWords(s) {
  const n = (v, u) => `about ${v} ${u}${v === 1 ? '' : 's'}`;
  if (s < 90) return n(Math.max(1, Math.round(s)), 'second');
  if (s < 90 * 60) return n(Math.round(s / 60), 'minute');
  if (s < 36 * 3600) return n(Math.round(s / 3600), 'hour');
  return n(Math.round(s / 86400), 'day');
}

// One line for the audit: what the refresh spent, or why it stopped (I67).
export function budgetLine(stats, { skipped = null } = {}) {
  if (skipped) return `Figma file unchanged since the last refresh (version ${skipped.version}, ${skipped.at}): refresh skipped, ${stats.calls} API call${stats.calls === 1 ? '' : 's'} used. FIGMA_REFRESH=force refreshes anyway.`;
  if (stats.limit) {
    const who = [stats.limit.tier && `plan ${stats.limit.tier}`, stats.limit.type && `${stats.limit.type} rate limit`].filter(Boolean).join(', ');
    return `Figma rate limit reached${who ? ` (${who})` : ''}: Figma asks to wait ${waitWords(stats.limit.retryAfterS)}. The refresh stopped at once instead of retrying, after ${stats.calls} API call${stats.calls === 1 ? '' : 's'}; the snapshots stay as they were.`;
  }
  return `Figma refresh: ${stats.calls} API call${stats.calls === 1 ? '' : 's'}${stats.failed ? `, ${stats.failed} failed` : ''}.`;
}

// The refresh is skipped when the file's version and what the refresh reads are the same as at the last complete
// refresh, and every snapshot it wrote is still there. `stamp`: { version, key, at, files }.
export function unchangedSince(stamp, version, key, exists = () => true) {
  return !!(stamp && version && stamp.version === version && stamp.key === key && Array.isArray(stamp.files) && stamp.files.every(exists));
}

// Published components and component sets by node id. REST returns them as a list
// (`meta.component_sets: [{ node_id, name, description, … }]`); a map keyed by node id is read as is.
export function byNodeId(list) {
  if (Array.isArray(list)) return Object.fromEntries(list.filter((x) => x && x.node_id).map((x) => [x.node_id, x]));
  return list && typeof list === 'object' ? list : {};
}

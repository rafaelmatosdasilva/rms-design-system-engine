// auto-build.mjs - what a build of the style guide runs, and when, for the background watch (watch.mjs, `--watch`) and
// for one round now (`--watch --once`, also `--auto --once`): only the steps the moved sources feed, then the page
// published to the team's style guide store only when it changed, and what the build was made from recorded.
//
//   FEEDS[source]             → the steps that source feeds (data, in one place; a source not listed feeds every step)
//   stepsFor(moved)           → the step ids to run, in order
//   WATCHED                   → the FEEDS name of each source the watch follows itself (the code, Figma, the layer, the engine)
//   storeChanges(now, base)   → the other sources --ci-changed reads (the stores, the profile, a GitLab code mirror) that moved
//   runRound(ROOT, deps)      → the steps for what moved, under the lock: the publish, the record, one line in watch.log
//   autoRound(ROOT, deps)     → one round now: what moved since the last build (its record), then runRound's work
//   pageFingerprint(files)    → the page and its files, without when or from which commit it was built
//   watchLines(ROOT, job)     → whether the background watch is on (why not, when not), and what its last round did (--guide-status)
//
// Inside each step, work that did not change is already skipped (the code capture, Figma's unchanged components, the
// accessibility of unchanged pages, the bake of unchanged components). Nothing here stores a token: the steps read them
// from the project's .env as every run does.

import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync, unlinkSync, openSync, closeSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { OUT_DIR } from './names.mjs';
import { changes, short, readLast } from './ci-changed.mjs';

export const LOG = `${OUT_DIR}/watch.log`;              // one line a round, beside what the background watch says
export const STATE = `${OUT_DIR}/watch-state.json`;     // the last round, for --guide-status
export const LOCK = `${OUT_DIR}/watch.lock`;            // a round running now
export const ROUND_OUT = `${OUT_DIR}/watch-round.log`;  // everything the last round's steps printed
export const LAST_BUILD = `${OUT_DIR}/ci-last-build.json`;   // what the last build was made from, as --ci-changed --record keeps it

// The team's sequence, in the order it runs (cookbook/publish-styleguide.md, publish-job.mjs → storeJob).
export const STEPS = [
  { id: 'page', what: 'the page the audit measures on', args: ['--styleguide', '--no-a11y-bake', '--no-publish'] },
  { id: 'audit', what: 'the audit', args: [], findings: true },    // exit 1 is differences found: the page shows them
  { id: 'outputs', what: 'the contracts and the design intent', args: ['--outputs'] },
  { id: 'build', what: 'the style guide', args: ['--styleguide', '--no-publish'] },
  { id: 'check', what: 'its check', args: ['--styleguide-check'] },
  { id: 'publish', what: 'the publish' },
];
// No check of its own in a round: the build already holds the page to the system and fails when it is not (the check
// step read the profile and the stores again to say the same).
const ALL = ['page', 'audit', 'build', 'publish'];   // the audit writes the contracts and the design intent too
const LAYER = ['outputs', 'build', 'publish'];
const GUIDE = ['build', 'publish'];

// What each source feeds. The engine feeds everything (its output may differ anywhere); the gates read Figma, the code,
// the snapshots and what the team decided or kept; the intent layer reaches the contracts, the design intent and the
// page only; the themes only the page. The style guide store is what a round writes: its own commit starts nothing.
export const FEEDS = {
  'the engine': ALL,
  'the profile': ALL,
  'the code': ALL,
  Figma: ALL,
  snapshots: ALL,
  decisions: ALL,
  kept: ALL,
  prototypes: ALL,
  intentLayer: LAYER,
  themes: GUIDE,
  styleguide: [],
};

// A source's name without its path (snapshots:design/snapshots → snapshots).
export const sourceOf = (key) => String(key).split(':')[0];

// The sources the watch follows itself, each with its own check (watch.mjs), under their FEEDS names. The rest of what
// --ci-changed reads is asked every few minutes (storeChanges).
export const WATCHED = { code: 'the code', figma: 'Figma', layer: 'intentLayer', engine: 'the engine' };

// The other sources that moved since base (the last build's record, else what the watch first read): the stores, the
// profile, the code when it is a GitLab mirror. One that cannot be read now is no move. → [{ what, from, to }]
export function storeChanges(now, base = {}, { except = [] } = {}) {
  const skip = new Set(except);
  return changes(now, base).filter((m) => m.to != null && !skip.has(sourceOf(m.what)) && (FEEDS[sourceOf(m.what)] ?? ALL).length);
}

// The steps the moved sources feed, in the sequence's order. → [step id]
export function stepsFor(moved) {
  const want = new Set();
  for (const m of moved) for (const s of FEEDS[sourceOf(m?.what ?? m)] ?? ALL) want.add(s);
  if (want.has('audit')) want.delete('outputs');
  return STEPS.map((s) => s.id).filter((id) => want.has(id));
}

// What moved since the last build. A source that cannot be read now is said, never built for: a computer offline, or a
// token missing, would otherwise build every round. → { moved: [{ what, from, to }], unread: [what], first }
export function whatMoved(now, last) {
  if (!last?.sources) return { moved: [{ what: 'everything', from: null, to: null }], unread: [], first: true };
  const all = changes(now, last.sources);
  return {
    moved: all.filter((m) => m.to != null && (FEEDS[sourceOf(m.what)] ?? ALL).length),
    unread: all.filter((m) => m.to == null).map((m) => m.what),
    first: false,
  };
}

// The record a build that succeeded keeps, as --ci-changed --record does: the sources read after it (a commit the round
// itself made, to the snapshots or the intent layer, starts nothing next), and for one that could not be read then, the
// id the round started from, else the last build's.
export function recordOf(after, before, last, { at = new Date().toISOString() } = {}) {
  const sources = { ...(last?.sources ?? {}) };
  for (const k of new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])) sources[k] = after?.[k] ?? before?.[k] ?? sources[k] ?? null;
  return { at, sources };
}

// ── The lock: never two rounds at once ──
// A lock whose process is gone, or older than staleMs, is taken over. → { ok: true, release } | { ok: false, pid, at }
export function takeLock(file, { pid = process.pid, now = Date.now(), alive = isAlive, staleMs = 6 * 3600e3 } = {}) {
  mkdirSync(dirname(file), { recursive: true });
  for (let i = 0; i < 2; i++) {
    try {
      writeFileSync(file, JSON.stringify({ pid, at: new Date(now).toISOString() }) + '\n', { flag: 'wx' });
      return { ok: true, release: () => { try { if (JSON.parse(readFileSync(file, 'utf8')).pid === pid) unlinkSync(file); } catch { /* gone already */ } } };
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let held = null; try { held = JSON.parse(readFileSync(file, 'utf8')); } catch { /* half written: taken over */ }
      if (held && alive(held.pid) && now - Date.parse(held.at) < staleMs) return { ok: false, pid: held.pid, at: held.at };
      try { unlinkSync(file); } catch { /* another round took it first */ }
    }
  }
  return { ok: false, pid: null, at: null };
}
function isAlive(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } }

// ── Did the page change? ──
// The page and the files beside it, without what changes on every build alone: when it was built (every ISO time), the
// commits and version it was built from (its stamp), and the hash in each of its own files' names.
export function normalizedText(text) {
  return String(text)
    .replace(/<meta name="rms-design-system-engine-built" content="[^"]*">/g, '')
    .replace(/"built":\{[^{}]*\}/g, '"built":{}')
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?/g, '')
    .replace(/\.[0-9a-f]{10}\.(css|js)\b/g, '.$1');
}
export function pageFingerprint(files) {
  const h = createHash('sha256');
  const rows = [...files].filter(([rel]) => rel !== 'built-from.json').map(([rel, data]) => [normalizedText(rel), data]).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  for (const [rel, data] of rows) {
    const text = /\.(html?|css|m?js|json|svg|txt)$/i.test(rel) ? normalizedText(Buffer.from(data).toString('utf8')) : null;
    h.update(rel).update('\0').update(text ?? Buffer.from(data)).update('\0');
  }
  return h.digest('hex').slice(0, 16);
}

// ── One round ──
// deps: readSources() → { what: id } (the engine's commit among them); run(step) → { status, signal, timedOut? } (a
// step's process; timedOut: the minutes it ran before it was stopped);
// publish() → { ok, published, line, page } (sent where the team's guide lives, only when the page differs); now(): ms.
// → { line, result: 'nothing moved' | 'published' | 'built' | 'failed' | 'busy', moved, steps, ms }

// The steps for what moved, under the lock: what a tick of the watch runs once a source moved. moved: [{ what, from?, to? }].
export async function runRound(ROOT, { moved, ...deps } = {}) {
  return locked(ROOT, deps, (started) => stepsRound(ROOT, deps, { started, moved, last: readLast(join(ROOT, LAST_BUILD)) }));
}

// One round now (--watch --once, --auto --once): what moved since the last build's record, then its steps.
export async function autoRound(ROOT, deps = {}) {
  return locked(ROOT, deps, async (started) => {
    const before = await deps.readSources();
    const last = readLast(join(ROOT, LAST_BUILD));
    const { moved, unread, first } = whatMoved(before, last);
    const unreadSay = unread.length ? ` (not read: ${unread.join(', ')})` : '';
    if (!moved.length) return finish(ROOT, { at: started, result: 'nothing moved', line: `nothing moved${unreadSay}`, moved: [], steps: [], ms: (deps.now ?? Date.now)() - started });
    return stepsRound(ROOT, deps, { started, moved, first, last, before, unreadSay });
  });
}

async function locked(ROOT, deps, body) {
  const now = deps.now ?? Date.now, started = now();
  const lock = takeLock(join(ROOT, LOCK), { now: started, ...(deps.lock ?? {}) });
  if (!lock.ok) return finish(ROOT, { at: started, result: 'busy', line: `a round is already running${lock.pid ? ` (process ${lock.pid}, since ${String(lock.at).slice(11, 16)})` : ''}: nothing done, tried again next round`, moved: [], steps: [], ms: 0 });
  try { return await body(started); }
  catch (e) { return finish(ROOT, { at: started, result: 'failed', line: `the round stopped (${String(e?.message ?? e).split('\n')[0]}): not published, tried again next round`, moved: [], steps: [], ms: now() - started }); }
  finally { lock.release?.(); }
}

async function stepsRound(ROOT, { readSources, run, publish, now = Date.now, log = () => {} }, { started, moved, first = false, last = null, before = {}, unreadSay = '' }) {
  const steps = first ? [...ALL] : stepsFor(moved);
  const movedSay = first ? 'no build recorded yet' : `moved: ${moved.map((m) => (m.from !== undefined || m.to !== undefined ? `${m.what} ${short(m.from)} → ${short(m.to)}` : m.what)).join(' · ')}`;
  const ran = [];
  const fail = (failed, why) => finish(ROOT, { at: started, result: 'failed', failed, line: `${movedSay}${unreadSay} · ran ${ran.join(', ')} · ${secs(now() - started)} · ${why}`, moved, steps: ran, ms: now() - started });
  for (const id of steps.filter((s) => s !== 'publish')) {
    const step = STEPS.find((s) => s.id === id);
    log(`   ${step.what}...`);
    const r = run(step);
    ran.push(id);
    const ok = r.status === 0 || (step.findings && r.status === 1);
    if (!ok) return fail(id, r.timedOut ? `stopped at ${step.what}, still running after ${r.timedOut} min (its browsers with it; the round's log says what it was on): not published, tried again next round` : `failed at ${step.what} (${r.status == null ? `stopped${r.signal ? ` by ${r.signal}` : ''}` : `exit ${r.status}`}): not published, tried again next round`);
  }
  let pub = { ok: true, published: false, line: null };
  if (steps.includes('publish')) {
    log(`   ${STEPS.find((s) => s.id === 'publish').what}...`);
    try { pub = await publish(); } catch (e) { pub = { ok: false, line: String(e.message).split('\n')[0] }; }
    ran.push('publish');
    if (!pub.ok) return fail('publish', `not published: ${pub.line ?? 'the store did not take it'}; tried again next round`);
  }
  // Recorded only after a build that succeeded: a failed round leaves the last record, so the next one tries again.
  const after = await readSources().catch(() => ({}));
  const lastFile = join(ROOT, LAST_BUILD);
  mkdirSync(dirname(lastFile), { recursive: true });
  writeFileSync(lastFile, JSON.stringify(recordOf(after, before, last, { at: new Date(now()).toISOString() }), null, 2) + '\n');
  const said = pub.published ? 'published' : `not published${pub.line ? ` (${pub.line})` : ''}`;
  return finish(ROOT, { at: started, result: pub.published ? 'published' : 'built', line: `${movedSay}${unreadSay} · ran ${ran.join(', ')} · ${secs(now() - started)} · ${said}`, moved, steps: ran, ms: now() - started, page: pub.page ?? null });
}
const secs = (ms) => (ms < 60e3 ? `${Math.round(ms / 1000)}s` : `${Math.floor(ms / 60e3)}m${String(Math.round((ms % 60e3) / 1000)).padStart(2, '0')}s`);

// The round's line in the log, and the round kept for --guide-status (the page last published kept from before).
function finish(ROOT, round) {
  const at = new Date(round.at).toISOString();
  const line = `${at.slice(0, 16).replace('T', ' ')} ${round.line}`;
  try {
    mkdirSync(join(ROOT, OUT_DIR), { recursive: true });
    appendFileSync(join(ROOT, LOG), line + '\n');
    const prev = readState(ROOT) ?? {};
    const keep = { at, result: round.result, line: round.line, moved: round.moved.map((m) => m.what), steps: round.steps, ms: round.ms, ...(round.failed ? { failed: round.failed } : {}) };
    const builtAt = ['published', 'built'].includes(round.result) ? at : prev.lastBuild ?? null;
    writeFileSync(join(ROOT, STATE), JSON.stringify({ ...keep, lastBuild: builtAt, publishedPage: round.result === 'published' && round.page ? round.page : prev.publishedPage ?? null }, null, 1) + '\n');
  } catch { /* the line is still printed */ }
  return { ...round, line };
}
export function readState(ROOT) { try { return JSON.parse(readFileSync(join(ROOT, STATE), 'utf8')); } catch { return null; } }

// Where the steps' output goes: one file for the round, started again by the first step a round runs (a round where
// nothing moved leaves the last build's), so a scheduler's own log keeps one line a round. close() ends the round: the
// next step started opens the file again, empty. → { fd(), close }
export function roundOutput(ROOT) {
  let fd = null;
  return {
    fd: () => {
      if (fd == null) { mkdirSync(join(ROOT, OUT_DIR), { recursive: true }); writeFileSync(join(ROOT, ROUND_OUT), ''); fd = openSync(join(ROOT, ROUND_OUT), 'a'); }
      return fd;
    },
    close: () => { if (fd != null) { try { closeSync(fd); } catch { /* closed */ } fd = null; } },
  };
}

// The code as a git checkout on this computer (no GitLab mirror): its commit, as a source of its own, and whether it is
// on the branch the team's page is built from. A branch of one's own is built here and never published.
export function localCode(dir, git) {
  const sha = git(['rev-parse', 'HEAD'], dir);
  if (!sha) return null;
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], dir);
  const main = (git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], dir) ?? '').replace(/^origin\//, '') || null;
  return { sha, branch, main, mayPublish: !main || branch === main };
}

// The publish of a round: the page sent only when its fingerprint differs from the one published (there: the published
// built-from.json's, else the one this computer published last); the same page sends only its record, so the published
// one is never called behind. send() and record() → the store's answer ({ ok, line }).
export async function publishIfChanged({ page, there, send, record }) {
  if (there && there === page) {
    const r = await record();
    return { ok: true, published: false, line: `the page is the same as the one published${r?.ok === false ? `; ${r.line}` : ''}` };
  }
  const r = await send();
  return { ok: !!r?.ok, published: !!r?.ok, line: String(r?.line ?? '').replace(/^\S+\s+/, ''), page };
}

// --guide-status: whether the background watch is on for this folder, and what its last round did (else the last line
// the watch wrote). job: watch.mjs → jobFor, or null where no background job is made.
export function watchLines(ROOT, { job = null, installed = false, why = null } = {}) {
  const st = readState(ROOT);
  const lines = [installed
    ? `🔁 The background watch is on for this folder (${job.file}): the style guide is built again when something it is made from moves, and published when it changed.`
    : `🔁 No background watch for this folder${why ? ` (${why})` : ''}: rms-design-system-engine --watch-install turns it on.`];
  if (st) lines.push(`   Its last round, ${String(st.at).slice(0, 16).replace('T', ' ')}: ${st.line}${!['published', 'built'].includes(st.result) && st.lastBuild ? `. Last build: ${String(st.lastBuild).slice(0, 16).replace('T', ' ')}` : ''}.`);
  else {
    let tail = null; try { tail = readFileSync(join(ROOT, LOG), 'utf8').trim().split('\n').filter(Boolean).at(-1); } catch { /* none yet */ }
    if (tail) lines.push(`   What it said last: ${tail}`);
  }
  return lines;
}

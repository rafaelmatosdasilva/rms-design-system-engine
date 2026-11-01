// auto-build.mjs - the style guide kept up to date by itself, on a person's own computer (`--auto`), for a team with no
// CI runner. Each round asks the sources a build is made from (ci-changed.mjs) what moved since the last build, and
// when something did, runs the team's publishing sequence once, only the steps the moved sources feed:
//
//   FEEDS[source]          → the steps that source feeds (data, in one place; a source not listed feeds every step)
//   stepsFor(moved)        → the step ids to run, in order
//   autoRound(ROOT, deps)  → one round: the lock, what moved, the steps, the record, the publish, one line in the log
//   pageFingerprint(files) → the page and its files, without when or from which commit it was built
//   install / uninstall    → a user LaunchAgent (macOS) or a crontab line (Linux) that runs one round every N minutes
//   autoLines(ROOT)        → whether it is installed, and what its last round did (--guide-status)
//
// Inside each step, work that did not change is already skipped (the code capture, Figma's unchanged components, the
// accessibility of unchanged pages, the bake of unchanged components). Nothing here stores a token: the steps read them
// from the project's .env as every run does.

import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync, unlinkSync, openSync, closeSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { OUT_DIR } from './names.mjs';
import { changes, short, readLast } from './ci-changed.mjs';

export const LOG = `${OUT_DIR}/auto.log`;              // one line a round
export const STATE = `${OUT_DIR}/auto-state.json`;     // the last round, for --guide-status
export const LOCK = `${OUT_DIR}/auto.lock`;            // a round running now
export const ROUND_OUT = `${OUT_DIR}/auto-round.log`;  // everything the last round's steps printed
export const LAST_BUILD = `${OUT_DIR}/ci-last-build.json`;   // what the last build was made from, as --ci-changed --record keeps it
export const DEFAULT_MINUTES = 10;

// The team's sequence, in the order it runs (cookbook/publish-styleguide.md, publish-job.mjs → storeJob).
export const STEPS = [
  { id: 'page', what: 'the page the audit measures on', args: ['--styleguide', '--no-a11y-bake', '--no-publish'] },
  { id: 'audit', what: 'the audit', args: [], findings: true },    // exit 1 is differences found: the page shows them
  { id: 'outputs', what: 'the contracts and the design intent', args: ['--outputs'] },
  { id: 'build', what: 'the style guide', args: ['--styleguide', '--no-publish'] },
  { id: 'check', what: 'its check', args: ['--styleguide-check'] },
  { id: 'publish', what: 'the publish' },
];
const ALL = ['page', 'audit', 'build', 'check', 'publish'];   // the audit writes the contracts and the design intent too
const LAYER = ['outputs', 'build', 'check', 'publish'];
const GUIDE = ['build', 'check', 'publish'];

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
// deps: readSources() → { what: id } (the engine's commit among them); run(step) → { status } (a step's process);
// publish() → { ok, published, line } (the page sent where the team's guide lives, only when it differs); now(): ms.
// → { line, result: 'nothing moved' | 'published' | 'built' | 'failed' | 'busy', moved, steps, ms }
export async function autoRound(ROOT, { readSources, run, publish, now = Date.now, log = () => {}, lock: lockOpts = {} } = {}) {
  const started = now();
  const lock = takeLock(join(ROOT, LOCK), { now: started, ...lockOpts });
  if (!lock.ok) return finish(ROOT, { at: started, result: 'busy', line: `a round is already running${lock.pid ? ` (process ${lock.pid}, since ${String(lock.at).slice(11, 16)})` : ''}: nothing done`, moved: [], steps: [], ms: 0 });
  try {
    const before = await readSources();
    const lastFile = join(ROOT, LAST_BUILD), last = readLast(lastFile);
    const { moved, unread, first } = whatMoved(before, last);
    const unreadSay = unread.length ? ` (not read: ${unread.join(', ')})` : '';
    if (!moved.length) return finish(ROOT, { at: started, result: 'nothing moved', line: `nothing moved${unreadSay}`, moved: [], steps: [], ms: now() - started });
    const steps = first ? STEPS.map((s) => s.id).filter((id) => id !== 'outputs') : stepsFor(moved);
    const movedSay = first ? 'no build recorded yet' : `moved: ${moved.map((m) => `${m.what} ${short(m.from)} → ${short(m.to)}`).join(' · ')}`;
    const ran = [];
    for (const id of steps.filter((s) => s !== 'publish')) {
      const step = STEPS.find((s) => s.id === id);
      log(`   ${step.what}...`);
      const r = run(step);
      ran.push(id);
      const ok = r.status === 0 || (step.findings && r.status === 1);
      if (!ok) return finish(ROOT, { at: started, result: 'failed', failed: id, line: `${movedSay}${unreadSay} · ran ${ran.join(', ')} · ${secs(now() - started)} · failed at ${step.what} (${r.status == null ? `stopped${r.signal ? ` by ${r.signal}` : ''}` : `exit ${r.status}`}): not published, tried again next round`, moved, steps: ran, ms: now() - started });
    }
    let pub = { ok: true, published: false, line: null };
    if (steps.includes('publish')) {
      log(`   ${STEPS.find((s) => s.id === 'publish').what}...`);
      try { pub = await publish(); } catch (e) { pub = { ok: false, line: String(e.message).split('\n')[0] }; }
      ran.push('publish');
      if (!pub.ok) return finish(ROOT, { at: started, result: 'failed', failed: 'publish', line: `${movedSay}${unreadSay} · ran ${ran.join(', ')} · ${secs(now() - started)} · not published: ${pub.line ?? 'the store did not take it'}; tried again next round`, moved, steps: ran, ms: now() - started });
    }
    // Recorded only after a build that succeeded: a failed round leaves the last record, so the next one tries again.
    const after = await readSources().catch(() => ({}));
    mkdirSync(dirname(lastFile), { recursive: true });
    writeFileSync(lastFile, JSON.stringify(recordOf(after, before, last, { at: new Date(now()).toISOString() }), null, 2) + '\n');
    const said = pub.published ? 'published' : `not published${pub.line ? ` (${pub.line})` : ''}`;
    return finish(ROOT, { at: started, result: pub.published ? 'published' : 'built', line: `${movedSay}${unreadSay} · ran ${ran.join(', ')} · ${secs(now() - started)} · ${said}`, moved, steps: ran, ms: now() - started, page: pub.page ?? null });
  } catch (e) {
    return finish(ROOT, { at: started, result: 'failed', line: `the round stopped (${String(e?.message ?? e).split('\n')[0]}): not published, tried again next round`, moved: [], steps: [], ms: now() - started });
  } finally { lock.release?.(); }
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
// nothing moved leaves the last build's), so a scheduler's own log keeps one line a round. → { fd(), close }
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

// ── Running it every N minutes ──
const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const agentLabel = (dir) => `local.rms-design-system-engine.auto.${createHash('sha1').update(resolve(dir)).digest('hex').slice(0, 10)}`;
export const agentFile = (dir, home = homedir()) => join(home, 'Library', 'LaunchAgents', `${agentLabel(dir)}.plist`);
const minutesOf = (m) => Math.max(1, Math.round(Number(m) || DEFAULT_MINUTES));

// The LaunchAgent: one round (--auto --once) every N minutes in the project's folder, with the person's PATH and
// nothing else (the tokens stay in the project's .env).
export function plistOf({ dir, node, engine, minutes, PATH }) {
  const args = [node, join(engine, 'audit.mjs'), '--auto', '--once'];
  const out = join(dir, OUT_DIR, 'auto-agent.log');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<!-- Written by rms-design-system-engine --auto --install: the style guide built again, and published when it changed, every ${minutesOf(minutes)} min. -->
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xml(agentLabel(dir))}</string>
  <key>ProgramArguments</key>
  <array>
${args.map((a) => `    <string>${xml(a)}</string>`).join('\n')}
  </array>
  <key>WorkingDirectory</key>
  <string>${xml(dir)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${xml(PATH ?? '')}</string>
    <key>NO_COLOR</key>
    <string>1</string>
  </dict>
  <key>StartInterval</key>
  <integer>${minutesOf(minutes) * 60}</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${xml(out)}</string>
  <key>StandardErrorPath</key>
  <string>${xml(out)}</string>
</dict>
</plist>
`;
}

const sq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
export function cronLineOf({ dir, node, engine, minutes, PATH }) {
  const m = minutesOf(minutes);
  const when = m < 60 ? `*/${m} * * * *` : `0 */${Math.max(1, Math.round(m / 60))} * * *`;
  return `${when} cd ${sq(dir)} && PATH=${sq(PATH ?? '')} ${sq(node)} ${sq(join(engine, 'audit.mjs'))} --auto --once >> ${sq(join(dir, OUT_DIR, 'auto-agent.log'))} 2>&1   # rms-design-system-engine --auto`;
}

// → { file?, lines } : the LaunchAgent written (never loaded), or the crontab line to add.
export function install(dir, { home = homedir(), platform = process.platform, minutes = DEFAULT_MINUTES, node = process.execPath, engine, PATH = process.env.PATH } = {}) {
  const m = minutesOf(minutes);
  if (platform === 'darwin') {
    const file = agentFile(dir, home);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, plistOf({ dir, node, engine, minutes: m, PATH }));
    return { file, lines: [
      `✅ Written ${file}: one round every ${m} min in ${dir} (the style guide built again when something it is made from moved, and published when it changed). It reads the tokens from the project's .env, as every run does; none is in the file.`,
      '   To start it, run this once yourself:',
      `   launchctl load -w ${sq(file)}`,
      `   Each round is one line in ${join(dir, LOG)}; rms-design-system-engine --guide-status says what the last one did.`,
    ] };
  }
  if (platform === 'linux') return { lines: [
    `Add this line to your crontab (crontab -e): one round every ${m} min in ${dir}. It reads the tokens from the project's .env; none is in the line.`,
    `   ${cronLineOf({ dir, node, engine, minutes: m, PATH })}`,
  ] };
  return { lines: [`No scheduler this engine writes for on ${platform}: keep rms-design-system-engine --auto ${m} running in a terminal instead.`] };
}

export function uninstall(dir, { home = homedir(), platform = process.platform } = {}) {
  if (platform === 'darwin') {
    const file = agentFile(dir, home);
    if (!existsSync(file)) return [`Nothing installed for ${dir} (no ${file}).`];
    return ['To stop it and remove it, run these yourself:', `   launchctl unload -w ${sq(file)}`, `   rm ${sq(file)}`];
  }
  if (platform === 'linux') return [`Remove the line that ends with "# rms-design-system-engine --auto" and starts in ${dir} from your crontab (crontab -e).`];
  return ['Nothing installed: stop the terminal that runs rms-design-system-engine --auto.'];
}

// Is it installed for this folder? → { installed, how, minutes } (how: the file or 'crontab')
export function installed(dir, { home = homedir(), platform = process.platform, crontab = () => null } = {}) {
  if (platform === 'darwin') {
    const file = agentFile(dir, home);
    if (!existsSync(file)) return { installed: false };
    const sec = Number(/<key>StartInterval<\/key>\s*<integer>(\d+)<\/integer>/.exec(readFileSync(file, 'utf8'))?.[1]);
    return { installed: true, how: file, minutes: sec ? Math.round(sec / 60) : null };
  }
  if (platform === 'linux') {
    const line = String(crontab() ?? '').split('\n').find((l) => l.includes('--auto --once') && l.includes(sq(dir)));
    if (!line) return { installed: false };
    const m = /^\*\/(\d+) /.exec(line)?.[1] ?? (/^0 \*\/(\d+) /.exec(line)?.[1] * 60 || null);
    return { installed: true, how: 'crontab', minutes: m ? Number(m) : null };
  }
  return { installed: false };
}

// --guide-status: whether this computer rebuilds the guide by itself, and what its last round did.
export function autoLines(ROOT, dir, opts = {}) {
  const i = installed(dir, opts), st = readState(ROOT);
  const lines = [i.installed
    ? `🔁 Rebuilt by itself on this computer${i.minutes ? `, every ${i.minutes} min` : ''} (${i.how === 'crontab' ? 'a crontab line' : i.how}).`
    : `🔁 Not set to rebuild by itself on this computer${st ? ' (rounds ran with --auto in a terminal)' : ''}: rms-design-system-engine --auto --install.`];
  if (st) lines.push(`   Its last round, ${String(st.at).slice(0, 16).replace('T', ' ')}: ${st.line}${st.result !== 'published' && st.result !== 'built' && st.lastBuild ? `. Last build: ${String(st.lastBuild).slice(0, 16).replace('T', ' ')}` : ''}.`);
  return lines;
}

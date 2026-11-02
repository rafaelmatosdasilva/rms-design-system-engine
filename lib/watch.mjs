// watch.mjs - the local style guide built again on every change, by itself.
//
// One watch for every source the page is built from:
//   code         the design system's own files here (a save, a commit, a branch switched): read every few seconds,
//                from git when the folder is a checkout (its commit and its changed files), else from the files' dates.
//   figma        the design file's version (one GET with depth=1, the call that answers "has it changed" on every
//                plan), against the one the Figma snapshots were read at. Every few minutes, only with FIGMA_TOKEN.
//   intent layer its latest commit (syncIntentLayer), every few minutes.
//   engine       the engine's own commit: an update (by itself once a day, or by hand) builds the page again with the
//                new engine, and the watch starts again on the new code.
//   the stores  the rest of what --ci-changed reads (the snapshots, the decisions, the kept differences, the themes, the
//               profile, the code when it is a GitLab mirror), every few minutes, against the last build's record.
// A change is built once it has settled (a burst of saves is one build), and only the steps the moved sources feed run
// (auto-build.mjs → FEEDS); the page goes to the team's style guide store only when it changed. What the build itself
// writes is never taken for a change: what the sources are is read again once it ends.
//
// And a background job, so nobody keeps a terminal open: a LaunchAgent on a Mac, a user service on Linux, started at
// login and kept running, its output in the output folder's watch.log. One command adds it, one takes it away.
//
//   codeSignature(dir, opts)                  → string    what the project's files are now
//   engineSignature(engineDir)                → string    what the engine is now
//   figmaVersionNow(cfg, { token, fetch })    → { version } | { skip } | { error }
//   snapshotFigmaVersion(ROOT, cfg)           → string | null
//   makeWatch(deps)                           → { tick(now) }  one look at every source, the build when one moved
//   jobFor({ ROOT, engineDir, platform, home, minutes, node, uid }) → { label, file, text, start, stop, log }
//   stableNode(execPath, PATH)                → the node path the job starts, one an upgrade leaves in place
//   installWatch(job, { run, realHome }) / uninstallWatch(job, { run, realHome }) → { ok, lines }
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync, mkdirSync, unlinkSync, realpathSync } from 'node:fs';
import { join, relative, sep, dirname, resolve } from 'node:path';
import { userInfo } from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { OUT_DIR, SKILL } from './names.mjs';
import { figmaFileKeyOf } from './figma-link.mjs';

// Folders never read for a change: the engine's own output, the dependencies, git's own folder.
const SKIP_DIRS = new Set([OUT_DIR, 'node_modules', '.git', '.svelte-kit', '.next', '.nuxt', 'dist', 'build', 'coverage']);
// Files the engine writes as it runs (its snapshots and results): never a change someone made.
const ENGINE_FILE = /\.snapshot\.json$|(^|\/)a11y-results[^/]*\.json$|(^|\/)\.design-system-engine/;
const MAX_FILES = 20000;

function git(dir, args) {
  const r = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'] });
  return r.status === 0 ? r.stdout : null;
}
const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
const skipped = (rel) => rel.split(/[\\/]/).some((p) => SKIP_DIRS.has(p)) || ENGINE_FILE.test(rel.split(sep).join('/'));

// What the project's files are now. In a git checkout: its commit, and each changed or new file with its size and date
// (a save changes the date; the commit says a pull, a commit or a branch). Elsewhere: every file's size and date.
export function codeSignature(dir, { gitOf = git } = {}) {
  const head = gitOf(dir, ['rev-parse', 'HEAD']);
  const status = head != null ? gitOf(dir, ['status', '--porcelain', '-z', '--untracked-files=all']) : null;
  const parts = [];
  if (head != null && status != null) {
    parts.push(head.trim());
    for (const entry of status.split('\0').filter(Boolean)) {
      const rel = entry.slice(3);
      if (!rel || skipped(rel)) continue;
      let st = null; try { st = statSync(join(dir, rel)); } catch { /* deleted */ }
      parts.push(`${entry.slice(0, 2)} ${rel} ${st ? `${st.size}:${Math.round(st.mtimeMs)}` : 'gone'}`);
    }
    return hash(parts.sort().join('\n'));
  }
  let n = 0;
  (function walk(d) {
    let names = [];
    try { names = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of names) {
      if (n >= MAX_FILES) return;
      const p = join(d, e.name), rel = relative(dir, p);
      if (skipped(rel)) continue;
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) { try { const st = statSync(p); parts.push(`${rel} ${st.size}:${Math.round(st.mtimeMs)}`); n++; } catch { /* gone */ } }
    }
  })(dir);
  return hash(parts.sort().join('\n'));
}

// What the engine is now: its commit, else (a copy outside git) the dates of its modules and its template.
export function engineSignature(engineDir, { gitOf = git } = {}) {
  const head = gitOf(engineDir, ['rev-parse', 'HEAD']);
  if (head != null) return head.trim();
  const parts = [];
  for (const d of ['lib', 'templates']) {
    (function walk(p) {
      let names = []; try { names = readdirSync(p, { withFileTypes: true }); } catch { return; }
      for (const e of names) { const f = join(p, e.name); if (e.isDirectory()) walk(f); else { try { parts.push(`${relative(engineDir, f)} ${statSync(f).mtimeMs}`); } catch { /* gone */ } } }
    })(join(engineDir, d));
  }
  return hash(parts.sort().join('\n'));
}

// The version the Figma snapshots were read at (their _figmaVersion), or null.
export function snapshotFigmaVersion(ROOT, cfg = {}) {
  try { return JSON.parse(readFileSync(join(ROOT, cfg.paths?.snapshotVars ?? 'src/figma-vars.snapshot.json'), 'utf8'))._figmaVersion ?? null; } catch { return null; }
}

// The design file's version now: one GET with depth=1. No token or no file: skipped, and said once.
const refused = new Set();
const refusedWhy = (status) => `the Figma token is not allowed to read this file (Figma answered ${status}): give FIGMA_TOKEN one with File content read access, then start the watch again`;
export async function figmaVersionNow(cfg = {}, { token = process.env.FIGMA_TOKEN, fetch = globalThis.fetch } = {}) {
  const key = cfg.figmaFileKey || figmaFileKeyOf(cfg.figmaFile ?? cfg.figma?.file ?? '');
  if (!key) return { skip: 'no Figma file in ds-config.json' };
  if (!token) return { skip: 'no FIGMA_TOKEN (in .env or the environment)' };
  if (refused.has(token)) return { skip: refusedWhy(403) };
  try {
    const res = await fetch(`https://api.figma.com/v1/files/${key}?depth=1`, { headers: { 'X-Figma-Token': token }, signal: AbortSignal.timeout(30000) });
    // A token Figma refuses is not asked again: one skip, said once, until the watch starts again with another token.
    if (res.status === 401 || res.status === 403) { refused.add(token); return { skip: refusedWhy(res.status) }; }
    if (!res.ok) return { error: `Figma answered ${res.status}` };
    const j = await res.json();
    return j?.version ? { version: String(j.version) } : { error: 'Figma gave no version' };
  } catch (e) { return { error: `Figma could not be reached (${e?.message ?? e})` }; }
}

// One look at every source; the build when one moved. deps (all injectable, for tests):
//   code(), engine()          → signature strings (cheap: every tick)
//   figma(), layer()          → { changed, line } | { skip } | { error } (remote: only every `remoteEveryMs`)
//   stores()                  → { changed, line, moved: [source] } | { skip } | { error }: the other sources --ci-changed
//                               reads (the stores, the profile, a GitLab code mirror), asked with Figma and the layer
//   build(reasons, moved)     → { ok, status }; moved: the sources that moved, by their name in auto-build.mjs → FEEDS,
//                               so only the steps they feed run
//   update()                  → the engine's own update (self-update.mjs, once a day at most), asked with the remote
//                               sources: { line } when it updated, so the engine is seen moving and built for
//   restart()                 → called after a build on a new engine: the watch starts again on the new code
//   log(line)                 → one line said
//   settleMs                  → how long the code must stay the same before it is built
//   remoteEveryMs             → how often Figma, the intent layer and the stores are asked
// A build that failed is tried again at the next of those checks, for the same sources, never at every tick.
//   retry, keepRetry(retry | null) → the build still to try again when the watch started (a watch that restarts on a new
//                               engine after a failed round would otherwise forget it), and where it is kept
export function makeWatch({ code, engine, figma = async () => ({ skip: 'off' }), layer = async () => ({ skip: 'off' }), stores = async () => ({ skip: 'off' }), update = () => null, build, restart = () => {}, log = () => {}, retry: retryAtStart = null, keepRetry = () => {}, settleMs = 3000, remoteEveryMs = 5 * 60000 }) {
  let codeSig = code(), engineSig = engine(), pending = null, lastRemote = -Infinity, retry = retryAtStart;
  const said = new Set();
  const sayOnce = (k, line) => { if (!said.has(k)) { said.add(k); log(line); } };
  const lastError = new Map();
  return {
    async tick(now = Date.now()) {
      const reasons = [], moved = [];
      const c = code();
      if (c !== codeSig) {
        // A save seen: built once the files have stayed the same for settleMs.
        if (!pending || pending.sig !== c) { pending = { sig: c, at: now }; return { built: false, waiting: 'code' }; }
        if (now - pending.at < settleMs) return { built: false, waiting: 'code' };
        reasons.push('the code changed'); moved.push('the code');
      }
      // The engine updated here, between rounds (never inside one): what it reads next is the new engine.
      if (now - lastRemote >= remoteEveryMs) { try { const u = await update(); if (u?.line) log(u.line); } catch (err) { log(`⚠️  the engine's update: ${err?.message ?? err}`); } }
      const e = engine(), engineMoved = e !== engineSig;
      if (engineMoved) { reasons.push('the engine updated'); moved.push('the engine'); }
      if (now - lastRemote >= remoteEveryMs) {
        lastRemote = now;
        if (retry) { reasons.push(...retry.reasons); moved.push(...retry.moved); retry = null; }
        for (const [name, ask, what] of [['Figma', figma, 'Figma'], ['the intent layer', layer, 'intentLayer'], ['the stores', stores, null]]) {
          const r = await ask();
          if (r?.changed) { reasons.push(r.line ?? `${name} changed`); moved.push(...(what ? [what] : r.moved ?? [])); }
          else if (r?.skip) sayOnce(`skip:${name}`, `${name} not watched: ${r.skip}`);
          // The same error each check is said once; said again only when it changes, and once more when it clears.
          else if (r?.error) { if (lastError.get(name) !== r.error) log(`⚠️  ${name}: ${r.error}`); lastError.set(name, r.error); }
          if (!r?.error && !r?.skip && lastError.has(name)) { log(`✅ ${name}: reached again`); lastError.delete(name); }
        }
      }
      if (!reasons.length) return { built: false };
      const why = [...new Set(reasons)], what = [...new Set(moved)];
      log(`🔄 ${why.join(', ')}: building the style guide`);
      const b = await build(why, what);
      log(b?.ok ? '✅ style guide built' : b?.busy ? `⏳ ${b.line ?? 'another round is already building'}: built at the next check` : `❌ the build failed${b?.status != null ? ` (exit ${b.status})` : ''}; tried again at the next check`);
      if (!b?.ok) retry = { reasons: why, moved: what };
      try { keepRetry(b?.ok ? null : retry); } catch { /* kept in memory all the same */ }
      // What the build wrote is never a change: the sources are read again now that it has ended.
      codeSig = code(); pending = null; engineSig = e;
      if (engineMoved) restart();
      return { built: true, ok: !!b?.ok, reasons: why, moved: what };
    },
  };
}

// The node the job starts, by a path an update leaves in place: Node's own path is the versioned folder it was installed
// in (Homebrew's Cellar/node/<version>), which the next upgrade removes; a link on the PATH to the same node (Homebrew's
// bin/node) follows each upgrade. No such link (nvm, a node of its own): its own path.
export function stableNode(execPath = process.execPath, PATH = process.env.PATH ?? '') {
  let me; try { me = realpathSync(execPath); } catch { return execPath; }
  for (const d of PATH.split(':').filter(Boolean)) {
    const p = join(d, 'node');
    try { if (p !== me && realpathSync(p) === me) return p; } catch { /* none there */ }
  }
  return execPath;
}

// The background job: a LaunchAgent on a Mac, a systemd user service on Linux. Named after the project's folder, so
// each project keeps its own. → { label, file, text, start: [argv...], stop: [argv...], log } | { unsupported }
export function jobFor({ ROOT, engineDir, platform = process.platform, home, minutes = 5, node = stableNode(), uid = process.getuid?.() ?? 501 }) {
  const id = hash(ROOT).slice(0, 8);
  const label = `com.${SKILL}.watch.${id}`;
  const log = join(ROOT, OUT_DIR, 'watch.log');
  const args = [node, join(engineDir, 'audit.mjs'), '--watch', String(minutes)];
  const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  if (platform === 'darwin') {
    const file = join(home, 'Library', 'LaunchAgents', `${label}.plist`);
    const text = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${xml(label)}</string>
  <key>ProgramArguments</key>
  <array>
${args.map((a) => `    <string>${xml(a)}</string>`).join('\n')}
  </array>
  <key>WorkingDirectory</key><string>${xml(ROOT)}</string>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>${xml(log)}</string>
  <key>StandardErrorPath</key><string>${xml(log)}</string>
</dict>
</plist>
`;
    return { label, file, text, log, start: ['launchctl', 'bootstrap', `gui/${uid}`, file], stop: ['launchctl', 'bootout', `gui/${uid}/${label}`], loaded: ['launchctl', 'print', `gui/${uid}/${label}`] };
  }
  if (platform === 'linux') {
    const name = `${SKILL}-watch-${id}`;
    const file = join(home, '.config', 'systemd', 'user', `${name}.service`);
    const q = (a) => `"${String(a).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    const text = `[Unit]
Description=${SKILL}: the style guide of ${ROOT} built again on every change

[Service]
WorkingDirectory=${ROOT}
ExecStart=${args.map(q).join(' ')}
Restart=always
RestartSec=30
StandardOutput=append:${log}
StandardError=append:${log}

[Install]
WantedBy=default.target
`;
    return { label: name, file, text, log, start: ['systemctl', '--user', 'enable', '--now', `${name}.service`], stop: ['systemctl', '--user', 'disable', '--now', `${name}.service`], loaded: ['systemctl', '--user', 'is-active', '--quiet', `${name}.service`], reload: ['systemctl', '--user', 'daemon-reload'] };
  }
  return { unsupported: `a background job is made on a Mac or on Linux, not on ${platform}: keep rms-design-system-engine --watch running in a terminal instead` };
}

export const isInstalled = (job) => !!job?.file && existsSync(job.file);

// The folder a job of this computer's own user lives in: launchctl and systemctl are only ever asked to start or stop a
// job written there. A home of its own (HOME set elsewhere, as every test does) gets the file and nothing else, so no
// test, and no run with a borrowed HOME, ever registers a job with this computer's launchd or systemd.
export const realJobDir = (platform = process.platform, realHome = userInfo().homedir) =>
  platform === 'darwin' ? join(realHome, 'Library', 'LaunchAgents') : join(realHome, '.config', 'systemd', 'user');
export const ownJob = (job, realHome, platform) => !!job?.file && resolve(dirname(job.file)) === resolve(realJobDir(platform, realHome));
const defaultRun = (argv) => spawnSync(argv[0], argv.slice(1), { encoding: 'utf8' });
const defaultSleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// The job written and started. run(argv) → { status, stdout, stderr }: the one place launchctl or systemctl is called.
export function installWatch(job, { run = defaultRun, realHome = userInfo().homedir, platform = process.platform, sleep = defaultSleep } = {}) {
  const own = ownJob(job, realHome, platform);
  // Installed again: the new job replaces the old one. launchd lets the old one go after bootout returns, and a
  // bootstrap before it has gone fails ("Bootstrap failed: 5"), so the old one is waited for (up to 10 s).
  if (own && isInstalled(job)) {
    run(job.stop);
    for (let i = 0; job.loaded && i < 40 && run(job.loaded)?.status === 0; i++) sleep(250);
  }
  mkdirSync(dirname(job.file), { recursive: true });
  mkdirSync(dirname(job.log), { recursive: true });
  writeFileSync(job.file, job.text);
  if (!own) return { ok: true, started: false, lines: [`ℹ️  The background watch was written (${job.file}) and not started: that folder is not where this computer's own jobs live (${realJobDir(platform, realHome)}), so nothing was asked of ${platform === 'darwin' ? 'launchctl' : 'systemctl'}.`] };
  if (job.reload) run(job.reload);
  let r = run(job.start);
  for (let i = 0; r?.status !== 0 && i < 3; i++) { sleep(1000); r = run(job.start); }   // launchd still letting the old one go
  if (r?.status !== 0) return { ok: false, started: false, lines: [`❌ The background watch was written (${job.file}) but did not start: ${(r?.stderr || r?.stdout || '').trim().split('\n')[0]}`] };
  return { ok: true, started: true, lines: [] };
}

// The job stopped and its file removed. → { ok, lines }
export function uninstallWatch(job, { run = defaultRun, realHome = userInfo().homedir, platform = process.platform } = {}) {
  if (!isInstalled(job)) return { ok: true, removed: false, lines: ['No background watch for this folder: nothing to take away.'] };
  const own = ownJob(job, realHome, platform);
  if (own) run(job.stop);
  unlinkSync(job.file);
  if (own && job.reload) run(job.reload);
  return { ok: true, removed: true, lines: [`✅ The background watch is off: the style guide is built only when you ask again (${job.file} removed).`] };
}

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
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
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
export async function figmaVersionNow(cfg = {}, { token = process.env.FIGMA_TOKEN, fetch = globalThis.fetch } = {}) {
  const key = cfg.figmaFileKey || figmaFileKeyOf(cfg.figmaFile ?? cfg.figma?.file ?? '');
  if (!key) return { skip: 'no Figma file in ds-config.json' };
  if (!token) return { skip: 'no FIGMA_TOKEN (in .env or the environment)' };
  try {
    const res = await fetch(`https://api.figma.com/v1/files/${key}?depth=1`, { headers: { 'X-Figma-Token': token }, signal: AbortSignal.timeout(30000) });
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
//   restart()                 → called after a build on a new engine: the watch starts again on the new code
//   log(line)                 → one line said
//   settleMs                  → how long the code must stay the same before it is built
//   remoteEveryMs             → how often Figma, the intent layer and the stores are asked
// A build that failed is tried again at the next of those checks, for the same sources, never at every tick.
export function makeWatch({ code, engine, figma = async () => ({ skip: 'off' }), layer = async () => ({ skip: 'off' }), stores = async () => ({ skip: 'off' }), build, restart = () => {}, log = () => {}, settleMs = 3000, remoteEveryMs = 5 * 60000 }) {
  let codeSig = code(), engineSig = engine(), pending = null, lastRemote = -Infinity, retry = null;
  const said = new Set();
  const sayOnce = (k, line) => { if (!said.has(k)) { said.add(k); log(line); } };
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
      const e = engine(), engineMoved = e !== engineSig;
      if (engineMoved) { reasons.push('the engine updated'); moved.push('the engine'); }
      if (now - lastRemote >= remoteEveryMs) {
        lastRemote = now;
        if (retry) { reasons.push(...retry.reasons); moved.push(...retry.moved); retry = null; }
        for (const [name, ask, what] of [['Figma', figma, 'Figma'], ['the intent layer', layer, 'intentLayer'], ['the stores', stores, null]]) {
          const r = await ask();
          if (r?.changed) { reasons.push(r.line ?? `${name} changed`); moved.push(...(what ? [what] : r.moved ?? [])); }
          else if (r?.skip) sayOnce(`skip:${name}`, `${name} not watched: ${r.skip}`);
          else if (r?.error) log(`⚠️  ${name}: ${r.error}`);
        }
      }
      if (!reasons.length) return { built: false };
      const why = [...new Set(reasons)], what = [...new Set(moved)];
      log(`🔄 ${why.join(', ')}: building the style guide`);
      const b = await build(why, what);
      log(b?.ok ? '✅ style guide built' : `❌ the build failed${b?.status != null ? ` (exit ${b.status})` : ''}; tried again at the next check`);
      if (!b?.ok) retry = { reasons: why, moved: what };
      // What the build wrote is never a change: the sources are read again now that it has ended.
      codeSig = code(); pending = null; engineSig = e;
      if (engineMoved) restart();
      return { built: true, ok: !!b?.ok, reasons: why, moved: what };
    },
  };
}

// The background job: a LaunchAgent on a Mac, a systemd user service on Linux. Named after the project's folder, so
// each project keeps its own. → { label, file, text, start: [argv...], stop: [argv...], log } | { unsupported }
export function jobFor({ ROOT, engineDir, platform = process.platform, home, minutes = 5, node = process.execPath, uid = process.getuid?.() ?? 501 }) {
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
    return { label, file, text, log, start: ['launchctl', 'bootstrap', `gui/${uid}`, file], stop: ['launchctl', 'bootout', `gui/${uid}/${label}`] };
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
    return { label: name, file, text, log, start: ['systemctl', '--user', 'enable', '--now', `${name}.service`], stop: ['systemctl', '--user', 'disable', '--now', `${name}.service`], reload: ['systemctl', '--user', 'daemon-reload'] };
  }
  return { unsupported: `a background job is made on a Mac or on Linux, not on ${platform}: keep rms-design-system-engine --watch running in a terminal instead` };
}

export const isInstalled = (job) => !!job?.file && existsSync(job.file);

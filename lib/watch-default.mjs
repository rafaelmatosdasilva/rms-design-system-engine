// watch-default.mjs - the background watch is on by default: the engine turns it on by itself, once, for each person.
//
// The setting is ds-config.json → styleguide.watch: absent or true is on, false is off (a team's profile can set it for
// every member). Where it is on and the watch is not installed on this computer, the engine installs it (watch.mjs →
// installWatch) at the end of first setup and on any ordinary run, says so in one line, and never asks or blocks.
// Never on CI, in a test, in the watch's own rounds, on an --offline run, with a home that is not this computer user's
// own, for a project in a temporary folder, or from an engine that runs in a git worktree (it goes away).
//
// What it remembers, never in the committed config:
//   per person   ~/.claude/.rms-design-system-engine-watch.json, by project folder: `off` (this person turned it off
//                with --watch-uninstall: never installed again by default; --watch-install clears it) and `auto` (the
//                engine installed it by default: styleguide.watch: false then takes it away again).
//   per project  <output folder>/watch-default.json: an install that failed (said once, never tried again on every run;
//                --watch-install tries again), and a platform with no background job (said once).
//
//   ensureWatch(ROOT, cfg, opts)  → { on, why?, lines }   installs (or, for false, uninstalls) when it should; dry: only says
//   turnedOff(ROOT, opts) / turnedOn(ROOT, opts)          what --watch-uninstall and --watch-install record
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, realpathSync, unlinkSync } from 'node:fs';
import { join, dirname, resolve, sep } from 'node:path';
import { homedir, tmpdir, userInfo } from 'node:os';
import { OUT_DIR, SKILL, envVar } from './names.mjs';
import { jobFor, isInstalled, installWatch, uninstallWatch, ownJob } from './watch.mjs';

export const RECORD = `${OUT_DIR}/watch-default.json`;
export const choiceFile = (home) => join(home, '.claude', `.${SKILL}-watch.json`);
export const wanted = (cfg) => cfg?.styleguide?.watch !== false;
export const ON_LINE = `🔁 The style guide now rebuilds itself on this computer when anything it's built from changes (only what changed). Turn it off: ${SKILL} --watch-uninstall (or styleguide.watch: false)`;

const readJson = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };
const writeJson = (f, v) => { try { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify(v, null, 1) + '\n'); return true; } catch { return false; } };
const real = (p) => { try { return realpathSync(p); } catch { return resolve(p); } };
const inside = (p, dir) => { const a = real(p), b = real(dir); return a === b || a.startsWith(b.endsWith(sep) ? b : b + sep); };

export const readChoice = (home, ROOT) => readJson(choiceFile(home))?.projects?.[real(ROOT)] ?? {};
function writeChoice(home, ROOT, patch) {
  const all = readJson(choiceFile(home)) ?? {}, key = real(ROOT);
  all.projects ??= {};
  const next = { ...(all.projects[key] ?? {}), ...patch };
  for (const k of Object.keys(next)) if (next[k] == null) delete next[k];
  if (Object.keys(next).length) all.projects[key] = next; else delete all.projects[key];
  return writeJson(choiceFile(home), all);
}
const readRecord = (ROOT) => readJson(join(ROOT, RECORD)) ?? {};
const writeRecord = (ROOT, rec) => writeJson(join(ROOT, RECORD), rec);

// --watch-uninstall: this person turned it off for this project, so no later run installs it again.
export function turnedOff(ROOT, { home = homedir(), now = new Date().toISOString() } = {}) { writeChoice(home, ROOT, { off: now, auto: null }); }
// --watch-install: installed by hand, so the turning off and a failure are forgotten.
export function turnedOn(ROOT, { home = homedir() } = {}) {
  writeChoice(home, ROOT, { off: null, auto: null });
  const rec = readRecord(ROOT);
  if (rec.failed) { delete rec.failed; writeRecord(ROOT, rec); }
}

const isWorktree = (dir) => { try { return !!dir && statSync(join(dir, '.git')).isFile(); } catch { return false; } };

// Why this run never installs it by itself, or null.
function notHere({ ROOT, job, env, realHome, platform, tmp, engineDir, offline }) {
  if (env.CI) return 'this is a CI run';
  if (env.NODE_TEST_CONTEXT) return 'this is a test run';
  if (envVar(env, 'WATCH_ROUND') === '1') return "this is the watch's own run";
  if (offline) return 'this run is offline (--offline); the next run turns it on';
  if (!job.unsupported && !ownJob(job, realHome, platform)) return "this run's home is not this computer user's own";
  if (tmp && inside(ROOT, tmp)) return 'the project is in a temporary folder';
  if (isWorktree(engineDir)) return 'the engine runs from a git worktree, which goes away';
  return null;
}

// The watch on where it should be, off where it should not. opts: { env, home, realHome, platform, engineDir, run (the
// one place launchctl or systemctl is called), tmp, offline, job, dry (say only, change nothing), now }
export function ensureWatch(ROOT, cfg, { env = process.env, home = homedir(), realHome = userInfo().homedir, platform = process.platform, engineDir, run, tmp = tmpdir(), offline = false, job = null, dry = false, now = new Date().toISOString() } = {}) {
  job ??= jobFor({ ROOT, engineDir, platform, home });
  const installed = !job.unsupported && isInstalled(job);
  const choice = readChoice(home, ROOT);
  const guard = notHere({ ROOT, job, env, realHome, platform, tmp, engineDir, offline });
  const opts = { realHome, platform, ...(run ? { run } : {}) };
  if (!wanted(cfg)) {
    if (installed && choice.auto && !guard && !dry) {
      uninstallWatch(job, opts);
      writeChoice(home, ROOT, { auto: null });
      return { on: false, why: 'styleguide.watch is false in ds-config.json', lines: [`🔁 styleguide.watch is false in ds-config.json: the background watch the engine had turned on for this folder is off now (${job.file} removed). Remove the setting, or set it to true, to have it back.`] };
    }
    return installed ? { on: true, lines: [] } : { on: false, why: 'styleguide.watch is false in ds-config.json', lines: [] };
  }
  if (installed) return { on: true, lines: [] };
  if (guard) return { on: false, why: guard, lines: [] };
  const rec = readRecord(ROOT);
  if (job.unsupported) {
    const why = `this computer (${platform}) has no background job for it: rebuild by hand with ${SKILL} --styleguide, or keep ${SKILL} --watch running in a terminal`;
    if (rec.unsupported || dry) return { on: false, why, lines: [] };
    writeRecord(ROOT, { ...rec, unsupported: now });
    return { on: false, why, lines: [`ℹ️  The style guide can't rebuild itself in the background here: ${why}.`] };
  }
  if (choice.off) return { on: false, why: `you turned it off for this folder (${SKILL} --watch-uninstall)`, lines: [] };
  if (rec.failed) return { on: false, why: `it could not be turned on (${rec.failed.reason})`, lines: [] };
  if (dry) return { on: false, why: 'the next run turns it on', lines: [] };
  let r;
  try { r = installWatch(job, opts); } catch (e) { r = { ok: false, lines: [String(e?.message ?? e)] }; }
  if (r.ok && r.started) { writeChoice(home, ROOT, { auto: now }); return { on: true, installed: true, lines: [ON_LINE] }; }
  // Not started: its file is taken away again, so no later run takes it for on, and the reason is kept so it is said once.
  try { if (existsSync(job.file)) unlinkSync(job.file); } catch { /* the next --watch-install writes it again */ }
  const reason = String(r.lines?.[0] ?? 'it did not start').replace(/^\W+/, '').replace(/^The background watch was written \(.+?\) but did not start: /, '').trim() || 'it did not start';
  writeRecord(ROOT, { ...rec, failed: { reason, at: now } });
  return { on: false, why: `it could not be turned on (${reason})`, lines: [`⚠️  The style guide could not start rebuilding itself on this computer: ${reason}. It is not tried again on every run; ${SKILL} --watch-install tries again.`] };
}

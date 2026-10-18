// self-update.mjs - the installed skill keeps itself current: at most once a day, before an audit, a clean
// install on main is fast-forwarded to the remote. The run then restarts on the new code, so it never mixes
// versions. Never on CI, never with local changes or on another branch, never when DESIGN_SYSTEM_ENGINE_NO_AUTO_UPDATE=1;
// a failure (offline, no remote) leaves the install as it was and the run goes on.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { envVar, SKILL } from './names.mjs';

const DAY = 24 * 3600 * 1000;

function git(dir, args, timeout = 20000) {
  const r = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'pipe'] });
  return r.status === 0 ? r.stdout.trim() : null;
}

// Returns { updated: true, from, to } or { updated: false, why }.
export function autoUpdate(engineDir, { env = process.env, now = Date.now(), stamp = join(env.HOME || homedir(), '.claude', '.rms-design-system-engine-auto-update') } = {}) {
  if (env.CI) return { updated: false, why: 'CI' };
  if (envVar(env, 'NO_AUTO_UPDATE') === '1') return { updated: false, why: 'turned off' };
  let last = 0;
  try { last = Number(readFileSync(stamp, 'utf8').trim()) || 0; } catch { /* first time */ }
  if (now - last < DAY) return { updated: false, why: 'checked today' };
  try { mkdirSync(dirname(stamp), { recursive: true }); writeFileSync(stamp, String(now)); } catch { /* the stamp is optional */ }
  if (git(engineDir, ['rev-parse', '--abbrev-ref', 'HEAD']) !== 'main') return { updated: false, why: 'not on main' };
  const dirty = git(engineDir, ['status', '--porcelain', '--untracked-files=no']);
  if (dirty === null) return { updated: false, why: 'not a git checkout' };
  if (dirty) return { updated: false, why: 'local changes' };
  const from = git(engineDir, ['rev-parse', 'HEAD']);
  if (git(engineDir, ['pull', '--ff-only', '--quiet', 'origin', 'main']) === null) return { updated: false, why: 'pull failed' };
  const to = git(engineDir, ['rev-parse', 'HEAD']);
  return from && to && from !== to ? { updated: true, from, to } : { updated: false, why: 'already current' };
}

// The one line a run prints after an update.
export function updatedLine({ from, to }, date = '') {
  return `ℹ️  The engine updated itself (${from.slice(0, 7)} → ${to.slice(0, 7)}${date ? `, ${date}` : ''}). Turn this off with DESIGN_SYSTEM_ENGINE_NO_AUTO_UPDATE=1.`;
}

export const REPO_URL = `https://github.com/rafaelmatosdasilva/${SKILL}`;


// self-update.mjs - the installed skill keeps itself current: at most once a day, before an audit, a clean
// install on main is fast-forwarded to the remote. The run then restarts on the new code, so it never mixes
// versions. Never on CI, never with local changes or on another branch, never when DESIGN_SYSTEM_ENGINE_NO_AUTO_UPDATE=1;
// a failure (offline, no remote) leaves the install as it was and the run goes on.
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, unlinkSync, symlinkSync, chmodSync, lstatSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { envVar, SKILL, OLD_SKILL } from './names.mjs';

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

// The skill was rms-figma-code-parity. An install still in that folder moves to the new one, once: the clone
// (its remote pointed at the new address when that answers; the old one redirects there anyway), the
// /rms-design-system-engine command linked in place of the old one, and the terminal command under the new
// name in place of rms-figma-code-parity and rms-parity. Returns null when there is nothing to move, or
// { from, to, line }: the caller runs again from the new folder and says the line.
export function migrateInstall(engineDir, { home = process.env.HOME || homedir(), reachable = (url) => git(engineDir, ['ls-remote', url, 'HEAD'], 8000) !== null } = {}) {
  const skills = join(home, '.claude', 'skills');
  const from = join(skills, OLD_SKILL), to = join(skills, SKILL);
  if (resolve(engineDir) !== resolve(from) || existsSync(to)) return null;
  try { renameSync(from, to); } catch { return null; }
  const origin = git(to, ['remote', 'get-url', 'origin']);
  if (origin && origin.includes(OLD_SKILL) && reachable(REPO_URL)) git(to, ['remote', 'set-url', 'origin', REPO_URL]);
  const cmds = join(home, '.claude', 'commands');
  const quiet = (f) => { try { f(); } catch { /* best effort: --doctor says what is left */ } };
  quiet(() => unlinkSync(join(cmds, `${OLD_SKILL}.md`)));   // a link, gone with its target or not
  quiet(() => {
    mkdirSync(cmds, { recursive: true });
    const link = join(cmds, `${SKILL}.md`);
    const classic = existsSync(join(to, '.guide-choice')) && readFileSync(join(to, '.guide-choice'), 'utf8').trim() === 'classic' && existsSync(join(to, '.classic-guide.md'));
    quiet(() => unlinkSync(link));
    symlinkSync(join(to, classic ? '.classic-guide.md' : `${SKILL}.md`), link);
  });
  const bin = join(home, '.local', 'bin');
  const there = (p) => { try { lstatSync(p); return true; } catch { return false; } };   // a link whose target is gone too
  const hadBin = [OLD_SKILL, 'rms-parity'].filter((b) => there(join(bin, b)));
  for (const b of hadBin) quiet(() => unlinkSync(join(bin, b)));
  if (hadBin.length) quiet(() => {
    writeFileSync(join(bin, SKILL), `#!/usr/bin/env bash\nexec node "${join(to, 'audit.mjs')}" "$@"\n`);
    chmodSync(join(bin, SKILL), 0o755);
  });
  return { from, to, line: `ℹ️  The skill is now ${SKILL}: moved ${from} to ${to}, with the /${SKILL} command${hadBin.length ? ` and the ${SKILL} terminal command` : ''}. Open a new Claude Code session to use it.` };
}

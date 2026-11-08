// git-rebuild.mjs - the person's own style guide kept as the project's git is: built again after each commit and each
// change pulled in, by the project's git hooks (hooks-install.mjs writes post-commit, post-merge and post-rewrite).
//
// What it builds is the quick build (styleguide-quick.mjs): the page for the person who builds it, never the team's.
// Nothing is read from or sent to the network and nothing is published, so a commit never puts a page in front of the
// team. It builds only:
//   • where a page was built before: a style guide is never made unasked;
//   • never on CI, never with "hooks": false;
//   • after a commit, a merge or a pull, and a rebase. An amend is a commit already, so its rewrite builds nothing.
// The hook returns at once and git is never held: the build runs in a process of its own and ends with the page.
// Events close together are one build and then one more, under a lock (auto-build.mjs takeLock), never two at once.
//
//   pageOf(ROOT, cfg)                       → where the page is, as the build itself writes it
//   shouldRebuild(ROOT, { event, how, cfg, env, exists }) → { ok, why }
//   childEnv(env)                           → the build's environment, without what git sets for a hook
//   startRebuild(ROOT, { script, spawn, env }) → { pid }: the build started in a process of its own
//   rebuildLoop(ROOT, { build, take })      → { ran, queued }: the build under the lock, once more for each event that
//                                              came in while it ran
//   quickBuild(ROOT, { script, run, env })  → the exit code of one quick build, what it printed in the log
//   startedText()                           → the one line the hook prints
import { existsSync, writeFileSync, unlinkSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { spawn as nodeSpawn, spawnSync } from 'node:child_process';
import { OUT_DIR } from './names.mjs';
import { takeLock } from './auto-build.mjs';

export const EVENTS = ['commit', 'merge', 'rewrite'];
export const LOG = `${OUT_DIR}/styleguide-rebuild.log`;     // what the last build printed
export const LOCK = `${OUT_DIR}/styleguide-rebuild.lock`;   // a build running now
export const AGAIN = `${OUT_DIR}/styleguide-rebuild.again`; // an event came in while it ran: one more build
// However many events arrive while it runs, a run builds at most this many times, then leaves the rest to the next.
const MOST = 10;

// The page as the build writes it (audit.mjs --styleguide): the project's own place for it, else the engine's.
export function pageOf(ROOT, cfg = {}) {
  return resolve(ROOT, cfg?.styleguide?.out ?? join(OUT_DIR, 'styleguide', 'index.html'));
}

// event: the hook's (commit, merge, rewrite); how: what git says a rewrite was (amend or rebase).
export function shouldRebuild(ROOT, { event, how = null, cfg = {}, env = process.env, exists = existsSync } = {}) {
  if (!EVENTS.includes(event)) return { ok: false, why: 'not an event' };
  if (env.CI) return { ok: false, why: 'CI' };
  if (cfg?.hooks === false) return { ok: false, why: 'hooks off' };
  if (event === 'rewrite' && how !== 'rebase') return { ok: false, why: 'an amend: the commit built it' };
  if (!exists(pageOf(ROOT, cfg))) return { ok: false, why: 'no page built here yet' };
  return { ok: true, why: null };
}

// Inside a hook git says where the repository and its index are; a build started from there would carry them, and the
// git it runs (the commit a page is built from, what changed) would read the hook's view instead of the project's.
const GIT_PLACE = new Set(['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_PREFIX', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_QUARANTINE_PATH']);
export function childEnv(env = process.env) {
  return Object.fromEntries(Object.entries(env).filter(([k]) => !GIT_PLACE.has(k)));
}

// The build's own process, cut loose from git's: git goes on at once, the build ends with the page.
// script: the engine's audit.mjs (lib/), which runs `--git-rebuild run` under the lock.
export function startRebuild(ROOT, { script, spawn = nodeSpawn, env = process.env } = {}) {
  const child = spawn(process.execPath, [script, '--git-rebuild', 'run'], { cwd: ROOT, env: childEnv(env), detached: true, stdio: 'ignore' });
  child.unref?.();
  return { pid: child.pid ?? null };
}

// The build under the lock. A run that finds another building leaves a mark and goes: the one building sees it when it
// ends and builds once more, so the page is always as the last event left the project. A mark left in the moment the
// one building lets go is caught by the loop: it takes the lock again.
// build() → the build's exit code (or a promise of it); take: takeLock.
export async function rebuildLoop(ROOT, { build, take = takeLock, most = MOST } = {}) {
  const lock = join(ROOT, LOCK), again = join(ROOT, AGAIN);
  const mark = () => { try { mkdirSync(dirname(again), { recursive: true }); writeFileSync(again, new Date().toISOString() + '\n'); } catch { /* the next event builds */ } };
  const clear = () => { try { unlinkSync(again); } catch { /* none */ } };
  let ran = 0;
  for (;;) {
    const held = take(lock);
    if (!held.ok) { mark(); return { ran, queued: true }; }
    try {
      do { clear(); await build(); ran++; } while (existsSync(again) && ran < most);
    } finally { held.release(); }
    if (!existsSync(again) || ran >= most) return { ran, queued: false };
  }
}

// One quick build, what it prints kept in the log (the last build's only). script: the engine's audit.mjs.
export function quickBuild(ROOT, { script, run = spawnSync, env = process.env } = {}) {
  const file = join(ROOT, LOG);
  mkdirSync(dirname(file), { recursive: true });
  const fd = openSync(file, 'w');
  try { return run(process.execPath, [script, '--styleguide', '--quick'], { cwd: ROOT, env: childEnv(env), stdio: ['ignore', fd, fd] }).status ?? 1; }
  finally { closeSync(fd); }
}

export function startedText() {
  return `↻ rms-design-system-engine: your local style guide is being built again with this change (${LOG}).`;
}

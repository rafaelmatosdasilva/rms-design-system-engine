// run-lock.mjs - a run started by hand never works beside a round of the watch on the same project.
//
// The watch takes a lock for each round (auto-build.mjs LOCK) and its steps run inside it. An audit, a style guide build
// or a publish someone starts while a round runs would write the same files at once (the accessibility results kept
// between runs, the page, the snapshots) and share the computer with it, so both take longer and what each keeps is
// mixed. Such a run waits for the round to end first. A round's own steps carry the round's process in their
// environment (ROUND_ENV) and never wait on it.
//
//   roundRunning(ROOT, { env, alive }) → { pid, at } of a round running now, or null
//   waitForRound(ROOT, { log, pollMs, maxMs, env, alive, sleep }) → { waited: ms, gave: true when it stopped waiting }
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LOCK } from './auto-build.mjs';

export const ROUND_ENV = 'DESIGN_SYSTEM_ENGINE_ROUND';
const isAlive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

export function roundRunning(ROOT, { env = process.env, alive = isAlive } = {}) {
  if (env[ROUND_ENV]) return null;   // this run is one of a round's steps
  let held = null;
  try { held = JSON.parse(readFileSync(join(ROOT, LOCK), 'utf8')); } catch { return null; }
  return held?.pid && held.pid !== process.pid && alive(held.pid) ? { pid: held.pid, at: held.at ?? null } : null;
}

export async function waitForRound(ROOT, { log = (l) => console.log(l), pollMs = 5000, maxMs = 2 * 3600e3, env = process.env, alive = isAlive, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const first = roundRunning(ROOT, { env, alive });
  if (!first) return { waited: 0 };
  log(`⏳ The background watch is running a round on this project (process ${first.pid}${first.at ? `, since ${String(first.at).slice(11, 16)}` : ''}): waiting for it to end, so the two never write the same files at once.`);
  const t0 = Date.now();
  while (roundRunning(ROOT, { env, alive })) {
    if (Date.now() - t0 > maxMs) { log('   Still running after two hours: going on beside it.'); return { waited: Date.now() - t0, gave: true }; }
    await sleep(pollMs);
  }
  return { waited: Date.now() - t0 };
}

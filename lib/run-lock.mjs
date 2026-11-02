// run-lock.mjs - a run started by hand never works beside a round of the watch on the same project.
//
// The watch takes a lock for each round (auto-build.mjs LOCK) and its steps run inside it. An audit, a style guide build
// or a publish someone starts while a round runs would write the same files at once (the accessibility results kept
// between runs, the page, the snapshots) and share the computer with it, so both take longer and what each keeps is
// mixed. Such a run waits for the round to end first. A round's own steps carry the round's process in their
// environment (ROUND_ENV) and never wait on it.
//
// A step whose round was started by an older engine does not carry it in its environment: the lock's process among its
// own parents says the same.
//
//   roundRunning(ROOT, { env, alive, ancestors }) → { pid, at } of a round running now, or null
//   waitForRound(ROOT, { log, pollMs, maxMs, env, alive, sleep }) → { waited: ms, gave: true when it stopped waiting }
//   roundRead(ROOT, { env }) → { done, mark() }: whether a step of this watch round already read the profile, the stores
//     and the READMEs from GitLab (each read a round trip), and mark() to say this one did
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { LOCK } from './auto-build.mjs';
import { OUT_DIR } from './names.mjs';

export const ROUND_ENV = 'DESIGN_SYSTEM_ENGINE_ROUND';
const isAlive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
// This process's parents, nearest first (its parent, that one's, …), from one reading of the process table.
export function ancestorsOf(pid = process.pid, { ps = () => spawnSync('ps', ['-A', '-o', 'pid=,ppid='], { encoding: 'utf8' }).stdout ?? '' } = {}) {
  const parent = new Map();
  for (const l of String(ps()).split('\n')) { const m = /^\s*(\d+)\s+(\d+)/.exec(l); if (m) parent.set(Number(m[1]), Number(m[2])); }
  const out = [];
  for (let p = parent.get(pid); p && p > 1 && !out.includes(p) && out.length < 64; p = parent.get(p)) out.push(p);
  return out;
}

export function roundRunning(ROOT, { env = process.env, alive = isAlive, ancestors = () => [process.ppid, ...ancestorsOf()] } = {}) {
  if (env[ROUND_ENV]) return null;   // this run is one of a round's steps
  let held = null;
  try { held = JSON.parse(readFileSync(join(ROOT, LOCK), 'utf8')); } catch { return null; }
  if (!held?.pid || held.pid === process.pid || !alive(held.pid)) return null;
  return ancestors().includes(held.pid) ? null : { pid: held.pid, at: held.at ?? null };   // a step of that round
}

export async function waitForRound(ROOT, { log = (l) => console.log(l), pollMs = 5000, maxMs = 2 * 3600e3, env = process.env, alive = isAlive, ancestors, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const first = roundRunning(ROOT, { env, alive, ancestors });
  if (!first) return { waited: 0 };
  log(`⏳ The background watch is running a round on this project (process ${first.pid}${first.at ? `, since ${String(first.at).slice(11, 16)}` : ''}): waiting for it to end, so the two never write the same files at once.`);
  const t0 = Date.now();
  while (roundRunning(ROOT, { env, alive, ancestors })) {
    if (Date.now() - t0 > maxMs) { log('   Still running after two hours: going on beside it.'); return { waited: Date.now() - t0, gave: true }; }
    await sleep(pollMs);
  }
  return { waited: Date.now() - t0 };
}

// This round, as its lock names it (the process that runs it and since when): the same for all its steps, new for each round.
const READ_FILE = `${OUT_DIR}/round-read.json`;
// Answered as when this process first asked: the round's first step marks the reads done as it starts, and must still
// read what it reads later in its own run (the intent layer, while it builds the page).
const ASKED = new Map();
export function roundRead(ROOT, { env = process.env, fresh = false } = {}) {
  const at = `${ROOT}\0${env[ROUND_ENV] ?? ''}`;
  if (!fresh && ASKED.has(at)) return ASKED.get(at);
  const r = roundReadNow(ROOT, { env });
  ASKED.set(at, r);
  return r;
}
function roundReadNow(ROOT, { env = process.env } = {}) {
  let id = null;
  if (env[ROUND_ENV]) try { const l = JSON.parse(readFileSync(join(ROOT, LOCK), 'utf8')); id = l?.at ? `${l.pid}@${l.at}` : null; } catch { id = null; }
  let done = false;
  if (id) try { done = JSON.parse(readFileSync(join(ROOT, READ_FILE), 'utf8')).round === id; } catch { done = false; }
  return { done, mark: () => { if (!id) return; try { mkdirSync(dirname(join(ROOT, READ_FILE)), { recursive: true }); writeFileSync(join(ROOT, READ_FILE), JSON.stringify({ round: id, at: new Date().toISOString() }) + '\n'); } catch { /* read again next step */ } } };
}

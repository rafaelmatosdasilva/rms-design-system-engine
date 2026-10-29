// workspace.mjs - the engine's own files of a GitLab mirror, kept in a folder of their own, apart from the code.
//
// A mirror (gitlab-source.mjs) holds the code GitLab sent and what the engine writes beside it: its setup
// (ds-config.json), the snapshots, the contracts, the history, the hand-back and its output. DESIGN_SYSTEM_ENGINE_WORKSPACE
// gives those a home of their own, per host and project like the mirrors (<folder>/<host>/<project>): each run puts
// them into the mirror before it reads anything, and takes back what it wrote when it ends, so the mirror is only a
// copy of the code, one that can be dropped, kept in a cache (DESIGN_SYSTEM_ENGINE_MIRRORS) or fetched again without
// losing anything of the engine's. Unset, nothing moves: the files stay in the mirror, as before.
//
// A file is the engine's when GitLab did not put it there (the mirror's state lists every file it did). Left out: the
// mirror's own state (.gitlab-source.json), installed packages (node_modules), git's folder, the page the browser
// harness makes for itself and the Finder's .DS_Store. Each side only ever gets the newer copy of a file (their times are kept as they are
// copied), so a run that stopped before it took its files back loses nothing: the next one finds them newer in the
// mirror and keeps them. A file the run deleted is deleted from the workspace too. The first run with the setting moves
// in what the mirror holds, and what the mirror beside the work holds when the mirror has moved, so a project set up
// before keeps its setup.

import { existsSync, readFileSync, readdirSync, statSync, mkdirSync, copyFileSync, utimesSync, rmSync, rmdirSync } from 'node:fs';
import { join, resolve, dirname, relative, sep } from 'node:path';
import { homedir } from 'node:os';
import { envVar, OUT_DIR } from './names.mjs';
import { STATE_FILE, mirrorDir } from './gitlab-source.mjs';

const SKIP_DIRS = new Set(['node_modules', '.git']);
const SKIP_PATHS = new Set([STATE_FILE, `${OUT_DIR}/vue-harness`]);

// The workspace of a project, or null when no setting asks for one.
export function workspaceDir(p, env = process.env) {
  const set = String(envVar(env, 'WORKSPACE') ?? '').trim();
  if (!set) return null;
  const home = resolve(set.replace(/^~(?=\/|$)/, homedir()));
  const name = p.path.split('/').pop().replace(/[^\w.-]/g, '') || 'project';
  return join(home, p.host.replace(/[^\w.-]/g, '') || 'host', name);
}

// The files GitLab put in a mirror, from its state.
export function gitlabFiles(dir) {
  try { return new Set(JSON.parse(readFileSync(join(dir, STATE_FILE), 'utf8')).files ?? []); } catch { return new Set(); }
}

// Every file under a folder that is the engine's (not GitLab's, not left out), as paths with forward slashes.
export function engineFiles(dir, gitlab = gitlabFiles(dir)) {
  const out = [];
  const walk = (d) => {
    let names; try { names = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of names) {
      const p = join(d, e.name), rel = relative(dir, p).split(sep).join('/');
      if (SKIP_PATHS.has(rel) || (e.isDirectory() && SKIP_DIRS.has(e.name)) || e.name === '.DS_Store') continue;
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && !gitlab.has(rel)) out.push(rel);
    }
  };
  walk(dir);
  return out.sort();
}

const mtime = (f) => { try { const s = statSync(f); return { ms: s.mtimeMs, size: s.size, at: s.mtime }; } catch { return null; } };
// Copy a file when the destination lacks it or holds an older copy, its time kept. → whether it copied. A time set
// through seconds can come back a millisecond off, so two within 2ms are the same time.
function newer(from, to) {
  const a = mtime(from), b = mtime(to);
  if (!a || (b && (b.ms > a.ms + 2 || (Math.abs(b.ms - a.ms) <= 2 && b.size === a.size)))) return false;
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  utimesSync(to, a.at, a.at);
  return true;
}

// The workspace's files into the mirror. → { put: [paths], copied }
export function putIn(ws, dir) {
  const gitlab = gitlabFiles(dir);
  const put = engineFiles(ws, new Set()).filter((rel) => !gitlab.has(rel));
  let copied = 0;
  for (const rel of put) if (newer(join(ws, rel), join(dir, rel))) copied++;
  return { put, copied };
}

// What the mirror holds of the engine's back into the workspace; a file put in at the start and gone now is removed.
// → { copied, removed }
export function takeBack(ws, dir, put = []) {
  const mine = engineFiles(dir);
  let copied = 0, removed = 0;
  for (const rel of mine) if (newer(join(dir, rel), join(ws, rel))) copied++;
  const here = new Set(mine), root = resolve(ws) + sep;
  for (const rel of put) {
    if (here.has(rel)) continue;
    const f = resolve(ws, rel);
    if (!f.startsWith(root)) continue;
    try { rmSync(f, { force: true }); removed++; } catch { continue; }
    let d = dirname(f);
    while (d.startsWith(root)) { try { if (readdirSync(d).length) break; rmdirSync(d); } catch { break; } d = dirname(d); }
  }
  return { copied, removed };
}

// Open the workspace for a run in the mirror dir: moved in on the first run, put into the mirror, and taken back once
// the run ends. from: where the run started (the mirror beside it, when the mirror moved, is moved in too).
// → null with no setting, else { dir, note, close }
export function openWorkspace(p, dir, { from = process.cwd(), env = process.env } = {}) {
  const ws = workspaceDir(p, env);
  if (!ws || resolve(ws) === resolve(dir)) return null;
  let moved = 0;
  if (!existsSync(ws)) {
    mkdirSync(ws, { recursive: true });
    const beside = mirrorDir(from, p, {});
    for (const src of [...new Set([resolve(dir), resolve(beside)])]) if (existsSync(join(src, STATE_FILE))) moved += takeBack(ws, src).copied;
  }
  const { put, copied } = putIn(ws, dir);
  const note = `🗂  Workspace: ${ws}${moved ? ` (${moved} file${moved === 1 ? '' : 's'} moved in from the mirror)` : ''}${copied ? `, ${copied} put into the mirror` : ''}`;
  let closed = false;
  const close = () => { if (closed) return null; closed = true; try { return takeBack(ws, dir, put); } catch { return null; } };
  return { dir: ws, note, close };
}

// known-pages.mjs - every style guide this computer built, built again the moment the engine moves on.
//
// A page is built again when its project's own git moves (git-rebuild.mjs), and where the project is no repository,
// when a Claude Code turn there finds it behind. Neither happens when only the engine changed: the page stayed as it
// was until somebody next worked in that project, though the engine that builds it had moved on hours before. So the
// engine remembers where it built a page, and when the installed engine is pulled (a merge brought in, or the daily
// self-update, self-update.mjs: both a `git pull`), its own post-merge hook builds again each of those pages that is
// now behind. The same build as before, under the same rules (git-rebuild.mjs rebuildIfBehind): never on CI, never with
// "hooks": false, only where a page was built, never two at once. Nothing is read from the network, nothing published.
//
//   PAGES                                 → the file the list is kept in, on this computer only (never in a repository)
//   rememberPage(ROOT, { env, file, tmp }) → the project is added to the list (a temporary folder or CI: never)
//   knownPages({ env, file })             → the projects on the list that still have their ds-config.json
//   rebuildKnownPages({ engineDir, … })   → [{ root, started, why }]: each one behind, built again
//   hookScript(engineDir, node)           → the post-merge hook that runs it
//   ensureEngineHook(engineDir, { … })    → { installed, why }: the hook written into the engine's own checkout
//
//   node lib/known-pages.mjs --rebuild    what the hook runs
import { readFileSync, writeFileSync, mkdirSync, existsSync, realpathSync, chmodSync } from 'node:fs';
import { join, dirname, resolve, sep } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { rebuildIfBehind } from './git-rebuild.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
// Beside the self-update's own stamp (self-update.mjs), in the person's home: the list names folders on this computer,
// so it is never kept where a repository could take it in.
export const PAGES = (env = process.env) => join(env.HOME || homedir(), '.claude', '.rms-design-system-engine-pages.json');
const real = (p) => { try { return realpathSync(p); } catch { return resolve(p); } };
const read = (file) => { try { const j = JSON.parse(readFileSync(file, 'utf8')); return Array.isArray(j?.pages) ? j.pages.filter((p) => typeof p === 'string') : []; } catch { return []; } };
const write = (file, pages) => { try { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify({ _note: 'The projects where rms-design-system-engine built a style guide on this computer, so it can build each again when the engine moves on (known-pages.mjs). Written by the engine.', pages }, null, 2) + '\n'); return true; } catch { return false; } };

// A page built in a temporary folder is a test's or an evaluation run's, never somebody's: it is not kept. Nor one
// built under node --test (NODE_TEST_CONTEXT), wherever its fixture sits, so a test never adds to the person's list.
export function rememberPage(ROOT, { env = process.env, file = PAGES(env), tmp = [tmpdir(), '/tmp', '/private/tmp'] } = {}) {
  if (env.CI || env.NODE_TEST_CONTEXT || !ROOT) return false;
  // The system's temporary folders too, not only this process's: a session's scratch copy (/tmp, /private/tmp) is
  // nobody's style guide, and kept on the list it is built again with the installed engine over the copy being tried.
  const root = real(ROOT);
  const under = (r, t) => r === t || r.startsWith(t + sep);   // each as written and as resolved: /tmp is /private/tmp on a Mac
  if ([].concat(tmp).some((t) => [resolve(t), real(t)].some((x) => under(root, x) || under(resolve(ROOT), x)))) return false;
  const pages = read(file);
  if (pages.includes(root)) return true;
  return write(file, [...pages, root]);
}

// A project whose ds-config.json is gone (moved, deleted) is no longer on the list.
export function knownPages({ env = process.env, file = PAGES(env) } = {}) {
  const pages = read(file), here = pages.filter((p) => existsSync(join(p, 'ds-config.json')));
  if (here.length !== pages.length) write(file, here);
  return here;
}

export function rebuildKnownPages({ engineDir = ENGINE, env = process.env, file = PAGES(env), script = join(engineDir, 'lib', 'audit.mjs'), spawn } = {}) {
  if (env.CI) return [];
  const out = [];
  for (const root of knownPages({ env, file })) {
    let cfg = {}; try { cfg = JSON.parse(readFileSync(join(root, 'ds-config.json'), 'utf8')); } catch { /* the defaults */ }
    let r = { started: false, why: [] };
    try { r = rebuildIfBehind(root, { cfg, env, script, engineDir, ...(spawn ? { spawn } : {}) }); } catch { /* that page stays as it was */ }
    out.push({ root, ...r });
  }
  return out;
}

// The hook names node by its full path: a hook runs in whatever shell ran `git pull`, and a node kept in
// ~/.local/bin is not on every PATH (FINDINGS.md, fifteen of seventy-nine and no run had node).
const MARK = 'rms-design-system-engine: the engine moved on';
export function hookScript(engineDir = ENGINE, node = process.execPath) {
  const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
  return `#!/bin/sh\n# ${MARK}, so each style guide it built that is now behind is built again (lib/known-pages.mjs).\n# Each build runs in a process of its own: git is never held.\n${q(node)} ${q(join(engineDir, 'lib', 'known-pages.mjs'))} --rebuild >/dev/null 2>&1 || true\n`;
}

// Only into the installed engine: a checkout on main whose hooks are git's own. A developer's clone sets
// core.hooksPath to its own folder (the privacy checks), and a pull there must never build anybody's page with
// unmerged code. A post-merge hook somebody else wrote is left alone.
export function ensureEngineHook(engineDir = ENGINE, { env = process.env, node = process.execPath, run = spawnSync } = {}) {
  if (env.CI) return { installed: false, why: 'CI' };
  const git = (...a) => { const r = run('git', ['-C', engineDir, ...a], { encoding: 'utf8' }); return r.status === 0 ? String(r.stdout).trim() : null; };
  if (git('rev-parse', '--abbrev-ref', 'HEAD') !== 'main') return { installed: false, why: 'not on main' };
  if (git('config', '--get', 'core.hooksPath')) return { installed: false, why: 'its own hooks folder' };
  const dir = git('rev-parse', '--git-path', 'hooks');
  if (!dir) return { installed: false, why: 'not a git checkout' };
  const f = join(resolve(engineDir, dir), 'post-merge'), want = hookScript(engineDir, node);
  let now = null; try { now = readFileSync(f, 'utf8'); } catch { /* none yet */ }
  if (now === want) return { installed: true, why: 'already' };
  if (now !== null && !now.includes(MARK)) return { installed: false, why: 'another post-merge hook' };
  try { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, want); chmodSync(f, 0o755); } catch (e) { return { installed: false, why: String(e.message) }; }
  return { installed: true, why: now === null ? 'written' : 'updated' };
}

if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url)) && process.argv.includes('--rebuild')) rebuildKnownPages();

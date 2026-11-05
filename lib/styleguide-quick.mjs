// styleguide-quick.mjs - a quick build of the style guide, to see a change in seconds (--styleguide --quick), and the
// same build again on each change saved (--styleguide --watch).
//
// A quick build is the page for the person building it, never the team's. It leaves out what takes minutes and
// keeps what the last full build found: the accessibility from the saved results (a component changed since is tried
// by the browser that opens the page), the Showroom as last measured, no pictures of the guide's own pages, nothing
// read from or sent to GitLab, nothing published. The page carries a mark that says so, and no store takes a page
// with it: the team's page is always a full build.
//
//   QUICK_MARK, markQuick(html) → the page with the mark, once; isQuick(html) / quickPage(file) → whether it has it
//   SHOWROOM_FILE: the Showroom as the last full build measured it, kept for a quick build to show
//   keepShowroom(ROOT, results) / lastShowroom(ROOT) → { at, results } | null
//   watchPaths(ROOT, cfg, engineDir) → [{ path, recursive }]: what a change to rebuilds on
//   ignored(rel) → true for a path the build writes or nothing is built from
//   watchGuide({ paths, build, debounceMs, watch, log }) → { close, ready }: build once, then again after each change
import { existsSync, readFileSync, writeFileSync, mkdirSync, watch as fsWatch } from 'node:fs';
import { join, dirname, resolve, relative, isAbsolute, sep } from 'node:path';
import { homedir } from 'node:os';
import { OUT_DIR, PROJECT } from './names.mjs';

export const QUICK_MARK = '<meta name="design-system-engine-build" content="quick">';
export const isQuick = (html) => String(html ?? '').includes(QUICK_MARK);
export function markQuick(html) {
  const s = String(html);
  if (isQuick(s)) return s;
  return /<head[^>]*>/i.test(s) ? s.replace(/<head[^>]*>/i, (h) => h + QUICK_MARK) : QUICK_MARK + s;
}
export function quickPage(file) { try { return isQuick(readFileSync(file, 'utf8')); } catch { return false; } }

export const SHOWROOM_FILE = join(OUT_DIR, 'build-cache', 'showroom-measured.json');
export function keepShowroom(ROOT, results) {
  try { const f = join(ROOT, SHOWROOM_FILE); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify({ at: new Date().toISOString(), results })); } catch { /* measured again next time */ }
}
export function lastShowroom(ROOT) {
  try { const j = JSON.parse(readFileSync(join(ROOT, SHOWROOM_FILE), 'utf8')); return j && j.results && typeof j.results === 'object' ? j : null; } catch { return null; }
}

// Nothing is built from these, or the build writes them: a change there never starts a build.
const NEVER = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.nuxt', '.output', '.cache', '.vite', '.DS_Store']);
// The results a build writes beside the project's files (the token check's, the props check's), and the engine's other
// records there: what a person writes (its map) still starts one.
const WRITTEN = new Set([...Object.entries(PROJECT).filter(([k]) => !['out', 'refs', 'map'].includes(k)).map(([, v]) => v.now), 'component-prop-result.json']);
export function ignored(rel) {
  const parts = String(rel).split(/[\\/]+/).filter(Boolean);
  if (!parts.length) return true;
  if (parts.some((p) => NEVER.has(p))) return true;
  if (parts[0] === OUT_DIR.split('/')[0] || parts[0] === PROJECT.refs.now) return true;
  const last = parts.at(-1);
  if (parts.length === 1 && WRITTEN.has(last)) return true;
  return /^\.#|~$|\.swp$|\.tmp$/.test(last);   // an editor's own files while it saves
}

// The project, the engine's templates and code, and a template or module of the project's own kept elsewhere. The folder
// the page is written to is never one of them.
export function watchPaths(ROOT, cfg = {}, engineDir) {
  const home = (p) => resolve(ROOT, String(p).replace(/^~(?=$|\/)/, homedir()));
  const out = [{ path: ROOT, recursive: true }];
  if (engineDir) for (const d of ['templates', 'lib']) if (existsSync(join(engineDir, d))) out.push({ path: join(engineDir, d), recursive: true });
  const sg = cfg.styleguide ?? {};
  if (sg.template) out.push({ path: dirname(home(sg.template)), recursive: true });
  for (const m of Array.isArray(sg.modules) ? sg.modules : []) { const p = home(m && typeof m === 'object' ? m.path : m); if (p && existsSync(p)) out.push({ path: p, recursive: true }); }
  const pageDir = sg.out ? dirname(home(sg.out)) : null;
  const inside = (p, d) => { const r = relative(d, p); return r === '' || (!r.startsWith('..') && !isAbsolute(r)); };
  // One watch per folder: a folder inside another already watched is left to it.
  const kept = [];
  for (const w of out) if (existsSync(w.path) && !(pageDir && inside(w.path, pageDir)) && !kept.some((k) => inside(w.path, k.path))) kept.push(w);
  return kept.map((w) => ({ ...w, page: pageDir && inside(pageDir, w.path) ? relative(w.path, pageDir) : null }));
}

// Builds once, then again after each change, a short pause after the last one so a save of several files is one build.
// A change saved while a build runs starts one more when it ends. build() → a promise (the build's exit code).
export function watchGuide({ paths, build, debounceMs = 300, watch = fsWatch, log = console.log } = {}) {
  let running = false, again = false, timer = null, closed = false;
  const run = async () => {
    if (closed) return;
    if (running) { again = true; return; }
    running = true; again = false;
    try { await build(); } finally { running = false; }
    if (again && !closed) run();
  };
  const changed = (page) => (_, file) => {
    if (!file) return;
    const rel = String(file);
    if (ignored(rel) || (page && (rel === page || rel.startsWith(page + sep) || rel.startsWith(page + '/')))) return;
    if (running) { again = true; return; }
    clearTimeout(timer);
    timer = setTimeout(run, debounceMs);
  };
  const watchers = [];
  for (const p of paths) {
    try { watchers.push(watch(p.path, { recursive: !!p.recursive }, changed(p.page))); } catch (e) { log(`   ⚠️  Not watched: ${p.path} (${String(e.message).split('\n')[0]})`); }
  }
  const ready = run();
  return { ready, close() { closed = true; clearTimeout(timer); for (const w of watchers) try { w.close(); } catch { /* closed */ } } };
}

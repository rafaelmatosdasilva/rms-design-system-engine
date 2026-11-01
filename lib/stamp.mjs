// stamp.mjs - what each output was built from: the project's code commit, the Figma version it read and the
// engine's own version, on every snapshot, contract and style guide the engine writes, so an older run never
// overwrites a newer one.
//
// A stamp: { code, dirty, figma, figmaRead, engine, at }. code and engine are commits (git), figma the file's version
// (`_figmaVersion`, from the API) and figmaRead when Figma was read. Two stamps are compared input by input: a run is
// older when one of its inputs is older than the one the output on disk was built from and none is newer (a commit
// the other descends from, a lower Figma version, an earlier read). It never writes over that output: it keeps it
// and says why; `--force` writes anyway. A run from the same inputs, or from inputs that cannot be ordered (two
// branches), writes as before.
import { readFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ENGINE = dirname(fileURLToPath(import.meta.url));
const git = (cwd, args) => { const r = spawnSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); return r.status === 0 ? r.stdout.trim() : null; };
const gitOk = (cwd, args) => spawnSync('git', args, { cwd, stdio: 'ignore' }).status === 0;

// The commit a folder is at, and whether its tracked files changed since. null when it is not a git checkout.
export function commitOf(dir) {
  const sha = git(dir, ['rev-parse', 'HEAD']);
  if (!sha) return { commit: null, dirty: false };
  return { commit: sha, dirty: !gitOk(dir, ['diff-index', '--quiet', 'HEAD', '--']) };
}

// The stamp for a run. vars: the Figma vars snapshot it read (its _figmaVersion and _updated), when it read one.
export function buildStamp(ROOT, { engineDir = ENGINE, vars = null, figma, figmaRead, at = new Date().toISOString() } = {}) {
  const code = commitOf(ROOT), engine = commitOf(engineDir);
  return {
    code: code.commit, ...(code.dirty ? { dirty: true } : {}),
    figma: figma !== undefined ? figma : (vars?._figmaVersion ?? null),
    figmaRead: figmaRead !== undefined ? figmaRead : (vars?._updated ?? null),
    engine: engine.commit, at,
  };
}

// One input of two stamps: 'older' when next's is older than prev's, 'newer', 'same', or null when they cannot be ordered.
function orderCommits(dir, prev, next) {
  if (!prev || !next) return null;
  if (prev === next) return 'same';
  if (!dir) return null;
  if (gitOk(dir, ['merge-base', '--is-ancestor', next, prev])) return 'older';
  if (gitOk(dir, ['merge-base', '--is-ancestor', prev, next])) return 'newer';
  return null;
}
function orderFigma(prev, next) {
  if (prev?.figma != null && next?.figma != null) {
    if (String(prev.figma) === String(next.figma)) return 'same';
    if (/^\d+$/.test(String(prev.figma)) && /^\d+$/.test(String(next.figma))) return BigInt(next.figma) < BigInt(prev.figma) ? 'older' : 'newer';
    return null;
  }
  const a = Date.parse(prev?.figmaRead ?? ''), b = Date.parse(next?.figmaRead ?? '');
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return b < a ? 'older' : b > a ? 'newer' : 'same';
}

// → { older: boolean, inputs: { code, figma, engine }, why: [what next is older in] }
export function compareStamps(prev, next, { ROOT = null, engineDir = ENGINE } = {}) {
  const inputs = {
    code: orderCommits(ROOT, prev?.code, next?.code),
    figma: orderFigma(prev, next),
    engine: orderCommits(engineDir, prev?.engine, next?.engine),
  };
  const vals = Object.values(inputs);
  const older = vals.includes('older') && !vals.includes('newer');
  // Two Figma reads on one day say their time too: "2026-10-20 is older than 2026-10-20" says nothing.
  const sameDay = String(prev?.figmaRead ?? '').slice(0, 10) === String(next?.figmaRead ?? '').slice(0, 10);
  const readWhen = (s) => { const t = String(s.figmaRead); return sameDay && t.length > 10 ? `${t.slice(0, 10)} ${t.slice(11, 16)} UTC` : t.slice(0, 10); };
  const say = { code: (s) => `code ${String(s.code).slice(0, 7)}`, figma: (s) => (s.figma != null ? `Figma version ${s.figma}` : `Figma read ${readWhen(s)}`), engine: (s) => `engine ${String(s.engine).slice(0, 7)}` };
  const why = Object.entries(inputs).filter(([, v]) => v === 'older').map(([k]) => `${say[k](next)} is older than the ${say[k](prev)} it was built from`);
  return { older, inputs, why };
}

// The stamp an output on disk carries: a JSON file's `_built`, or the style guide's <meta name="rms-built">.
export const META = 'rms-design-system-engine-built';
export function stampOf(file) {
  if (!existsSync(file)) return null;
  let text; try { text = readFileSync(file, 'utf8'); } catch { return null; }
  return stampIn(text, file);
}
// The same from a file's text (a copy read from a store), its name saying whether it is a page.
export function stampIn(text, name = '') {
  text = String(text ?? '');
  if (/\.html?$/i.test(name)) {
    const m = text.match(new RegExp(`<meta name="${META}" content="([^"]*)"`));
    try { return m ? JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')) : null; } catch { return null; }
  }
  try { return JSON.parse(text)._built ?? null; } catch { return null; }
}
export const stampMeta = (stamp) => `<meta name="${META}" content="${JSON.stringify(stamp).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">`;

// May this run write over the output at file? → { ok: true } or { ok: false, line } with the line to print.
export function mayWrite(file, next, { ROOT = null, engineDir = ENGINE, force = process.argv.includes('--force'), label = file } = {}) {
  const prev = stampOf(file);
  if (!prev || force) return { ok: true };
  const c = compareStamps(prev, next, { ROOT, engineDir });
  if (!c.older) return { ok: true };
  return { ok: false, line: `Kept ${label}: it was built from newer inputs than this run (${c.why.join('; ')}). Run from the newer checkout, or add --force to replace it.` };
}

// One line that says what an output was built from.
export function stampLine(s) {
  if (!s) return null;
  const parts = [s.code ? `code ${s.code.slice(0, 7)}${s.dirty ? ' with uncommitted changes' : ''}` : null,
    s.figma != null ? `Figma version ${s.figma}` : s.figmaRead ? `Figma read ${String(s.figmaRead).slice(0, 10)}` : null,
    s.engine ? `engine ${s.engine.slice(0, 7)}` : null].filter(Boolean);
  return parts.length ? `Built from ${parts.join(', ')}` : null;
}

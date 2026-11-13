// code-led-tokens.mjs - a token the code changed first, written back to Figma's variables.
//
// When a token's value changes in the code first, Figma is left behind until someone copies it by hand, and the parity
// check reports the gap with no way back. A difference alone never says which side moved, so this reads one more
// thing: the code as it was when Figma was last read (its theme stylesheet at that moment, from git). Then, for each
// variable and mode:
//
//   the code then | the code now | Figma        | what it is
//   ------------- | ------------ | ------------ | --------------------------------------------------------------
//   = Figma       | ≠ Figma      | unchanged    | the code led: its value is written back to Figma
//   ≠ Figma       | (any)        | (any)        | drift that was there already: listed, never written, nobody can tell who is right
//   not read      | ≠ Figma      | (any)        | not known who led: listed, never written
//
// A token the code added since Figma was read (in the code now, not then, and in no Figma variable) is created as a new
// variable, in the collection most of its layer's variables are in. One the code already had when Figma was read is
// drift, listed. A value that replaces an alias in Figma with a raw one says so: the alias it breaks is named.
//
// Nothing is written here. The hand-back writes it (figma-edits.mjs), only once the person says yes, and checks each
// value again in the file: one changed in Figma since this list was made is a conflict, shown and never written over.
// Each value it replaces is recorded for the way back (figma-undo.mjs).
//
//   codeLedPlan({ figma, codeNow, codeThen, toVar, toToken, modes, collections, aliases })
//     figma:    Map variable → { modeKey: value }       (figmaValues)
//     codeNow:  Map custom property → { modeKey: value } (codeValues of the theme as it is)
//     codeThen: the same, as the theme was when Figma was read, or null when that cannot be read
//     → { changes, created, drift, unknown, counts }
//   figmaValues(vsnap, modes) / codeValues(sources, modes) / themeAt(ROOT, files, when, { git }) / chunkOf
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { rootTokens, resolveVars } from './css-source.mjs';
import { sameValue, parseColor, lengthPx } from './css-values.mjs';

export const CHUNK = 300;

// Two values the same once each is read as a browser means it (#fff and #ffffff, 0.5rem and 8px), and two numbers the
// same whatever unit one of them was written with: Figma's snapshot writes px after every number, a font weight's
// too (500px), while the code writes the weight as 500. A difference that is only that is a reading, never a change.
export function sameToken(a, b) {
  if (a == null || b == null) return false;
  const x = String(a).trim(), y = String(b).trim();
  if (x === y || sameValue(x, y)) return true;
  const nx = lengthPx(x, { unitless: true }), ny = lengthPx(y, { unitless: true });
  const bare = (s) => /^-?[\d.]+$/.test(s);
  return Number.isFinite(nx) && Number.isFinite(ny) && Math.abs(nx - ny) < 1e-6 && (bare(x) || bare(y) || /px$/.test(x) === /px$/.test(y));
}
const same = sameToken;

// Figma's value of each variable, per mode key: the current snapshot's list (figmaTokens, its modes by name), else the
// older shape (color per mode key, sizing in the one mode). → Map name → { modeKey: value }
export function figmaValues(vsnap = {}, modes = []) {
  const out = new Map();
  const keyOf = new Map(modes.map((m) => [m.name, m.snapshotKey ?? m.name]));
  const toks = vsnap?.figmaTokens?.tokens;
  if (Array.isArray(toks)) {
    for (const t of toks) {
      const v = {};
      for (const [mode, val] of Object.entries(t.values ?? {})) v[keyOf.get(mode) ?? mode] = val;
      out.set(t.name, { values: v, collection: t.collection ?? null, kind: t.kind ?? null });
    }
    return out;
  }
  for (const [modeKey, vars] of Object.entries(vsnap?.color ?? {})) for (const [name, val] of Object.entries(vars ?? {})) {
    const e = out.get(name) ?? { values: {}, collection: null, kind: 'COLOR' };
    e.values[modeKey] = val; out.set(name, e);
  }
  const first = modes[0]?.snapshotKey ?? 'default';
  for (const [name, val] of Object.entries(vsnap?.sizing ?? {})) out.set(name, { values: { [first]: val }, collection: null, kind: 'FLOAT' });
  return out;
}

// The code's value of each custom property the theme puts on the root, per mode key, its var() chains resolved.
// sources: loadCssSources(…).files. → Map custom property → { modeKey: value }
export function codeValues(sources = [], modes = []) {
  const out = new Map();
  for (const m of modes) {
    const vars = rootTokens(sources, m);
    for (const [name, raw] of vars) {
      const r = resolveVars(String(raw?.value ?? raw), vars);
      const e = out.get(name) ?? {};
      e[m.snapshotKey ?? m.name] = r?.value ?? String(raw?.value ?? raw);
      out.set(name, e);
    }
  }
  return out;
}

// The theme's files as they were at a moment, from git: the last commit before it that touched each file. null when
// the project keeps no git history (a copy taken from somewhere), or none reaches back that far.
// → { files: [{ file, text }], commit } | null
export function themeAt(ROOT, files = [], when, { git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }) } = {}) {
  if (!when) return null;
  try {
    const commit = git(['log', '-1', `--before=${when}`, '--format=%H', '--', ...files]).trim();
    if (!commit) return null;
    const out = [];
    for (const f of files) { try { out.push({ file: f, text: git(['show', `${commit}:${f}`]) }); } catch { /* not there yet then */ } }
    return out.length ? { files: out, commit } : null;
  } catch { return null; }
}

// The code as it was when Figma was last read, kept at that moment. A project with no git history (a copy taken from
// a host) cannot say what its theme held on the day Figma was read, so every difference would read as "not known who
// led" for ever. So each time Figma's variables are written, the code's own values are kept beside them, with the
// moment they belong to: from the next read on, a change on either side is known. Best-effort: a Figma read never
// fails for it. → the file kept, or null
export const CODE_AT_READ = 'code-at-figma-read.json';
export function keepCodeAtRead(ROOT, outDir, figmaRead, values) {
  if (!figmaRead || !values?.size) return null;
  try {
    mkdirSync(join(ROOT, outDir), { recursive: true });
    const file = join(ROOT, outDir, CODE_AT_READ);
    writeFileSync(file, JSON.stringify({ _note: 'The code\'s token values as they were when Figma was last read (rms-design-system-engine, code-led-tokens.mjs), so a token the code changes after it is known to have been changed in the code first.', figmaRead, values: Object.fromEntries(values) }, null, 2) + '\n');
    return relative(ROOT, file);
  } catch { return null; }
}
// The values kept at a read, only when they belong to that same read: kept at another one, they say nothing of this.
export function codeAtRead(ROOT, outDir, figmaRead) {
  try {
    const k = JSON.parse(readFileSync(join(ROOT, outDir, CODE_AT_READ), 'utf8'));
    return k?.figmaRead && k.figmaRead === figmaRead ? new Map(Object.entries(k.values ?? {})) : null;
  } catch { return null; }
}

// What a value is in Figma's own terms, for the variable's kind: a colour as 0-1 channels, a size as a number of px.
// null when it cannot be read, and then nothing is written for it.
export function figmaTerms(value, kind) {
  if (kind === 'COLOR') { const c = parseColor(String(value)); return c ? { r: c[0] / 255, g: c[1] / 255, b: c[2] / 255, a: c[3] } : null; }
  if (kind === 'FLOAT') { const n = lengthPx(String(value), { unitless: true }); return Number.isFinite(n) ? n : null; }
  return String(value);
}

export function codeLedPlan({ figma = new Map(), codeNow = new Map(), codeThen = null, toVar = (n) => n, toToken = () => null, aliases = {} } = {}) {
  const changes = [], drift = [], unknown = [], created = [];
  const known = new Set();
  for (const [name, f] of figma) {
    let css; try { css = toVar(name); } catch { continue; }
    known.add(css);
    const now = codeNow.get(css);
    if (!now) continue;
    for (const [mode, fv] of Object.entries(f.values ?? {})) {
      const cv = now[mode];
      if (cv == null || same(cv, fv)) continue;
      const row = { name, css, mode, figma: fv, code: cv, kind: f.kind ?? null };
      const alias = aliases?.[mode]?.[name];
      if (alias?.length) row.breaksAlias = alias[0];
      if (!codeThen) { unknown.push(row); continue; }
      const then = codeThen.get(css)?.[mode];
      if (then != null && same(then, fv)) changes.push({ ...row, was: then });
      else drift.push({ ...row, ...(then != null ? { was: then } : {}) });
    }
  }
  // A token the code added since Figma was read: in the code now, not then, and in no variable of Figma's.
  if (codeThen) {
    // The collection most of a layer's variables are in, so a new one goes where its kind already lives.
    const byLayer = new Map();
    for (const [name, f] of figma) { if (!f.collection) continue; const layer = name.split('/')[0]; const m = byLayer.get(layer) ?? new Map(); m.set(f.collection, (m.get(f.collection) ?? 0) + 1); byLayer.set(layer, m); }
    const home = (layer) => { const m = byLayer.get(layer); return m ? [...m].sort((a, b) => b[1] - a[1])[0][0] : null; };
    for (const [css, values] of codeNow) {
      if (known.has(css) || codeThen.has(css)) continue;
      const name = toToken(css);
      if (!name) continue;
      created.push({ name, css, values, collection: home(name.split('/')[0]) });
    }
  }
  const counts = { changes: changes.length, created: created.length, drift: drift.length, unknown: unknown.length };
  return { changes, created, drift, unknown, counts };
}

// The n-th part (1-based) of what is to write, changes first then new variables. → { changes, created, n, of }
export function chunkOf(plan, n = 1, size = CHUNK) {
  const all = [...(plan?.changes ?? []).map((x) => ['c', x]), ...(plan?.created ?? []).map((x) => ['n', x])];
  const of = Math.max(1, Math.ceil(all.length / size));
  const k = Math.min(Math.max(1, Number(n) || 1), of);
  const part = all.slice((k - 1) * size, k * size);
  return { changes: part.filter(([t]) => t === 'c').map(([, x]) => x), created: part.filter(([t]) => t === 'n').map(([, x]) => x), n: k, of };
}

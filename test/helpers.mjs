// test/helpers.mjs - shared fixture builder + gate runner for the regression tests.
//
// Each gate is an independent script that reads ds-config.json + snapshots + CSS from its
// working directory. runGate() builds a throwaway project from a { path: content } map and
// runs the gate against it (cwd = fixture), returning { code, out, dir }. `content` is written
// verbatim when it is a string, otherwise as pretty JSON.
import { mkdtempSync, writeFileSync, mkdirSync, cpSync, readdirSync, readFileSync, statSync, symlinkSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir, availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const SCRIPTS_DIR = fileURLToPath(new URL('..', import.meta.url));

// A time limit in a test is there to stop a hang, never to measure how fast this computer is. The full suite starts
// many browser tests at once, so one that finishes in two minutes on its own can take far longer while the others
// compete for the same cores: the limit is then reached by a busy machine and the run reads as a broken engine.
// Every limit is scaled by how many files the runner may run together, and RMS_TEST_TIME_SCALE sets it by hand for a
// machine that needs more still. A limit made longer only delays a real hang; it never lets a failing test pass.
export const TIME_SCALE = Math.max(1, Number(process.env.RMS_TEST_TIME_SCALE) || Math.min(4, Math.round(availableParallelism() / 3)));
export const budget = (ms) => Math.round(ms * TIME_SCALE);

// Every folder a test makes goes through tempDir(), under one root for its process that is deleted when the process
// ends, so a full run leaves nothing behind (left alone, the suite filled a disk with gigabytes of fixtures). A run
// stopped before its exit handler ran leaves its root; the next process to make a folder sweeps every root whose
// process is gone. The root carries the pid, so two suites running at once never sweep each other's.
const TEMP_ROOT_PREFIX = 'rms-test-';
let tempRoot = null;

const alive = (pid) => {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
};

export function sweepTempRoots(base = tmpdir()) {
  let swept = 0;
  for (const n of readdirSync(base)) {
    const m = n.startsWith(TEMP_ROOT_PREFIX) && /^rms-test-(\d+)-/.exec(n);
    if (!m || Number(m[1]) === process.pid || alive(Number(m[1]))) continue;
    try { rmSync(join(base, n), { recursive: true, force: true }); swept++; } catch { /* another process got there first */ }
  }
  return swept;
}

export function tempDir(prefix = 'tmp-') {
  if (!tempRoot) {
    const base = tmpdir();
    sweepTempRoots(base);
    tempRoot = mkdtempSync(join(base, `${TEMP_ROOT_PREFIX}${process.pid}-`));
    process.on('exit', () => { try { rmSync(tempRoot, { recursive: true, force: true, maxRetries: 3 }); } catch { /* the next run sweeps it */ } });
  }
  return mkdtempSync(join(tempRoot, prefix));
}

export function makeFixture(files = {}) {
  const dir = tempDir('gate-');
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  }
  return dir;
}

export function runGate(gateFile, files = {}, args = []) {
  const dir = makeFixture(files);
  try {
    const out = execFileSync('node', [join(SCRIPTS_DIR, gateFile), ...args], { cwd: dir, encoding: 'utf8' });
    return { code: 0, out, dir };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout || '') + (e.stderr || ''), dir };
  }
}

// A minimal design-system-engine-map.mjs. Most gates import it optionally; a few read specific exports.
export const EMPTY_ENGINE_MAP =
  'export const EXPLICIT={};export const SKIP_TOKENS=new Set();' +
  'export const COVERED=new Set();export const COVERED_PREFIX=[];';

// A crash in a gate surfaces as a Node stack trace on stderr - the marker every
// "array config must not crash" test asserts against.
export function crashed(out) {
  return /TypeError|ERR_INVALID_ARG_TYPE|\bat \S+ \(/.test(out);
}

// ── A fixture design system audited end to end (demo-ds, harbor-ds) ─────────────────────────
// A fresh copy of the fixture, every snapshot dated today, committed once so git blame has a commit to name.
// `overlay`: a folder laid over the copy (test/fixtures/demo-primitives), its ds-config.patch.json merged into
// ds-config.json, so a test can add to a fixture the skill evaluation runs on without changing it.
export function fixtureProject(fixture, prefix = 'ds-', { overlay = null } = {}) {
  const dir = tempDir(prefix);
  cpSync(fixture, dir, { recursive: true, filter: (p) => !/expected-report/.test(p) });
  if (overlay) {
    cpSync(overlay, dir, { recursive: true, filter: (p) => !p.endsWith('ds-config.patch.json') });
    const patch = join(overlay, 'ds-config.patch.json');
    if (existsSync(patch)) {
      const cfg = join(dir, 'ds-config.json');
      writeFileSync(cfg, JSON.stringify({ ...JSON.parse(readFileSync(cfg, 'utf8')), ...JSON.parse(readFileSync(patch, 'utf8')) }, null, 2) + '\n');
    }
  }
  const today = new Date().toISOString();
  const walk = (d) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) { if (n !== '.git') walk(p); }
      else if (n.endsWith('.json')) writeFileSync(p, readFileSync(p, 'utf8').replace(/"_updated": "[^"]*"/, `"_updated": "${today}"`));
    }
  };
  walk(dir);
  const env = { ...process.env, GIT_AUTHOR_NAME: 'demo', GIT_AUTHOR_EMAIL: 'demo@example.com', GIT_COMMITTER_NAME: 'demo', GIT_COMMITTER_EMAIL: 'demo@example.com', GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z' };
  for (const args of [['init', '-q'], ['add', '-A'], ['commit', '-qm', 'init']]) execFileSync('git', args, { cwd: dir, env });
  return dir;
}

// A PATH with only git and which, and DESIGN_SYSTEM_ENGINE_CHROME=none, so a run meant to be without Chrome cannot find
// one (a Mac's Chrome in /Applications included); and no TypeScript but the project's own (no NODE_PATH,
// DESIGN_SYSTEM_ENGINE_TYPESCRIPT=project), so a machine that has one installed for every project runs the same as one
// that has none.
export function bareEnv() {
  const bin = tempDir('demo-bin-');
  for (const name of ['git', 'which']) {
    const p = spawnSync('which', [name], { encoding: 'utf8' }).stdout.trim();
    if (p) symlinkSync(p, join(bin, name));
  }
  const { CHROME_PATH, NODE_PATH, ...rest } = process.env;
  return { ...rest, PATH: bin, PLAYWRIGHT_BROWSERS_PATH: join(bin, 'none'), DESIGN_SYSTEM_ENGINE_TYPESCRIPT: 'project', DESIGN_SYSTEM_ENGINE_CHROME: 'none' };
}

// Dates, durations, ages, commit hashes and the temporary directory change from run to run; so does the share of a
// visual diff that counts the text, which follows the fonts the machine has (the share outside the text does not).
export function normalise(text, dir) {
  return text.split(dir).join('<DIR>')
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/(% of pixels differ outside text, )[\d.]+% with it/g, '$1<N>% with it')
    // How much of a picture differs, and its size, move with the fonts the machine has (a label 1px wider): the
    // tests say which side of the limit each one is on, never the exact share.
    .replace(/(🖼 {2}\S+ {2}[\w/-]+: )[\d.]+(% of pixels differ outside text)/g, '$1<N>$2')
    .replace(/, Figma \d+×\d+ and code \d+×\d+ px/g, '')
    .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, '<TS>')
    .replace(/PARITY AUDIT {2}· {2}[\d-]+/, 'PARITY AUDIT  ·  <DATE>')
    .replace(/\b\d+(\.\d+)?m?s\b/g, '<DUR>')
    .replace(/\(([0-9a-f]{7})\)/g, '(<HASH>)')
    .replace(/\d+h (old|ago)/g, '<AGE>h $1')
    .replace(/\d+ ?(day|days|hour|hours) ago/g, '<AGE> ago')
    .replace(/^.*newer version of the engine.*\n/gm, '');
}

// The whole audit on a fresh copy, its output normalised.
export function auditFixture(fixture, env, prefix, args = []) {
  const dir = fixtureProject(fixture, prefix);
  const r = spawnSync(process.execPath, [join(SCRIPTS_DIR, 'audit.mjs'), ...args], { cwd: dir, encoding: 'utf8', env: { ...env, NO_COLOR: '1', FORCE_COLOR: '0', CI: '1' }, timeout: 300000 });
  return { dir, code: r.status, out: normalise((r.stdout ?? '') + (r.stderr ?? ''), dir) };
}

// The report compared with a committed golden. UPDATE_GOLDEN=1 rewrites it.
export function golden(fixture, name, out) {
  const p = join(fixture, name);
  if (process.env.UPDATE_GOLDEN === '1' || !existsSync(p)) { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, out); return; }
  const want = readFileSync(p, 'utf8');
  if (out === want) return;
  const actual = join(tempDir('ds-actual-'), name);
  writeFileSync(actual, out);
  assert.fail(`the report differs from ${name} (this run: ${actual}); if the change is intended, rerun with UPDATE_GOLDEN=1 and review the diff`);
}

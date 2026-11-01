// timing.mjs - how long each step of a run took, so a slow run says where its time went.
//
// A run marks its steps (span) and each gate script it starts (script). At its end the times are written to
// OUT_DIR/timing.json beside the last run's, and `--timing` prints them, slowest first. Nothing else reads the clock.
//
//   span(name, fn) → fn's result, its time kept under name (a promise is timed until it settles)
//   start(name) → stop(): the same for a step that is not one function
//   mark(name): the time since the last mark (or the start), kept under name: a run cut into phases
//   script(name, ms): a gate script's own time (audit.mjs runScriptAsync)
//   timings() → { total, steps: [{ name, ms }], scripts: [{ name, ms }] }
//   writeTiming(ROOT, outDir, what) → the file written, or null
//   timingLines(t, { most }) → the lines --timing prints
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const T0 = Date.now();
const steps = [], scripts = [];
let last = T0;
export function mark(name) { const t = Date.now(); steps.push({ name, ms: t - last }); last = t; }

export function start(name) {
  const t = Date.now();
  let done = false;
  return () => { if (!done) { done = true; steps.push({ name, ms: Date.now() - t }); } };
}
export function span(name, fn) {
  const stop = start(name);
  let out;
  try { out = fn(); } catch (e) { stop(); throw e; }
  if (out && typeof out.then === 'function') return out.finally(stop);
  stop();
  return out;
}
export const script = (name, ms) => { scripts.push({ name, ms }); };
export const timings = () => ({ total: Date.now() - T0, steps: [...steps], scripts: [...scripts] });

// Kept per command (the audit, --styleguide, …), the last run's beside it, so two runs can be compared.
export function writeTiming(ROOT, outDir, what = 'audit') {
  try {
    const file = join(ROOT, outDir, 'timing.json');
    let all = {};
    try { all = JSON.parse(readFileSync(file, 'utf8')); } catch { /* the first run */ }
    const now = { at: new Date().toISOString(), ...timings() };
    all[what] = { now, before: all[what]?.now ?? null };
    mkdirSync(join(ROOT, outDir), { recursive: true });
    writeFileSync(file, JSON.stringify(all, null, 1) + '\n');
    return file;
  } catch { return null; }
}

const human = (ms) => (ms >= 60000 ? `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s` : ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`);
export function timingLines(t = timings(), { most = 8 } = {}) {
  const out = [`⏱  ${human(t.total)} in all.`];
  const top = (xs) => [...xs].sort((a, b) => b.ms - a.ms).slice(0, most);
  if (t.steps.length) out.push(`   Steps: ${top(t.steps).map((s) => `${s.name} ${human(s.ms)}`).join(' · ')}`);
  if (t.scripts.length) out.push(`   Gate scripts (they run side by side, so the slowest sets the wait): ${top(t.scripts).map((s) => `${s.name.replace(/\.mjs$/, '')} ${human(s.ms)}`).join(' · ')}`);
  return out;
}

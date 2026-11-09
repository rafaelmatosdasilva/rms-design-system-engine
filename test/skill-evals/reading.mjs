// test/skill-evals/reading.mjs - how a result is read, so a number means what it says.
//
// Four ways an evaluation lies to the person reading it, all four learned the hard way:
//
//   • A run that never reached the skill. The harness already counts runs it stopped at its own ceiling apart,
//     because a run never allowed to finish says nothing about the guide. A run that reached an engine which fell
//     over is the same thing from the other side: the agent did everything right, got a stack trace back, and was
//     marked down for what the engine failed to say. That happened, and it read as the guide getting worse. A run
//     whose shell could not start the engine at all is the far end of it: the machine is broken, not the guide,
//     and on 8 November every run had lost node from its path and a fifteen-line change scored 15 of 79.
//
//   • A score read from evidence that is not there. Scoring saved runs again is only a score where the row still
//     holds what its checks read. A check that reads what the engine wrote reads nothing from a row that never
//     kept it, fails, and writes over a verdict that passed when it ran. That happened to nine runs on
//     8 November. A verdict a rescore cannot see is left exactly as it was scored.
//
//   • A difference too small to be a difference. 69/70 against 70/70 is one run of one task, and a task scored over
//     three runs moves by a third every time something nudges it. What is worth reading is a task that changed
//     state - every run passing and now every run failing - not a count that moved by one.
//
//   • Two kinds of task read as one. Some tasks must always pass: they guard something the engine already does, and
//     any failure is a failure. Others measure a skill still being built, where the number is a direction of travel.
//     Averaged together, a regression hides inside a capability's noise.

// What a task is for. A task born from a mistake the engine let through is a regression from the moment it is
// written: the mistake is fixed, so it must never come back. Capability is for what is still being built.
export const KINDS = ['regression', 'capability'];
export const kindOf = (task = {}) => (KINDS.includes(task.kind) ? task.kind : 'regression');

// A command that reached the engine and got a fall back. The loud way is a stack; the quiet way is a name that is
// not in scope, caught and printed as a note while the work it guarded never happened. Both are the engine's
// failure, and neither says anything about the agent. → { command, said } or null
export const FELL_OVER = /\n\s+at .+\.mjs:\d+|is not defined|is not a function|Cannot read properties of (undefined|null)/;
export function engineFell(ctx = {}) {
  for (const b of ctx.engine ?? []) {
    const m = FELL_OVER.exec(String(b.result ?? ''));
    if (m) return { command: String(b.command).slice(0, 120), said: m[0].trim().slice(0, 80) };
  }
  return null;
}

// A call that never reached the engine, because the shell could not start the runtime it needs. Not the engine
// falling back (the engine never ran) and not the agent's choice either: the machine is broken. Every variant's
// run gets node linked into its own bin (`makeHome`), the ones that take the engine's command away included, so
// node missing is never a thing a variant asks for - unlike `rms-design-system-engine: command not found`, which
// is exactly what the no-engine side is there to measure, and which this must never match.
// → { command, said, calls } when every call to the engine failed this way, else null.
export const NO_RUNTIME = /\bnode:\s*(?:command not found|not found|No such file or directory)|\bcommand not found:\s*node\b/i;
export function engineNeverStarted(ctx = {}) {
  const calls = ctx.engine ?? [];
  // A run that asked the engine nothing chose that, and is measured for it.
  if (!calls.length) return null;
  // One call that started says the runtime was there: whatever else went wrong is the run's own.
  if (!calls.every((b) => NO_RUNTIME.test(String(b.result ?? '')))) return null;
  const said = NO_RUNTIME.exec(String(calls[0].result ?? ''))[0].trim();
  return { command: String(calls[0].command).slice(0, 120), said: said.slice(0, 80), calls: calls.length };
}

// What a rescore cannot see. A row is scored again from what it kept: the files its run wrote, and the paths its
// checks read. A path a check reads now that the row can neither hand over nor vouch for as empty is evidence
// that is gone - the row predates the keeping, or the file was the engine's own output, which `changed` leaves
// out on purpose and so `keepFiles` never kept. Scoring on it is scoring on `null`.
//
// `readPaths` is the row saying "my checks read these, and what is not in `files` was not there": with it, a path
// kept as absent scores as absent. Without it, only what `files` holds can be answered at all.
//
// For a rescore with no project behind it (`rescore.mjs`), and only that one. Where the run's project is rebuilt
// from the fixture before scoring (`rescore-build.mjs`), the files are there to read and nothing here applies.
// → the paths the row cannot answer, in the order they were read.
export const leftOut = (n) => `\n… (${n} more characters left out of the record)`;
export const LEFT_OUT = /\n… \(\d+ more characters left out of the record\)$/;
export function unanswerable(row = {}, readPaths = []) {
  const files = row.files ?? {};
  const vouched = row.readPaths ? new Set(row.readPaths) : null;
  // A file the record cut to fit (record.mjs, MAX) is there and is not what the run read.
  const held = (p) => files[p] != null && !LEFT_OUT.test(files[p]);
  return [...readPaths].filter((p) => !held(p) && !(vouched?.has(p) && files[p] == null));
}

// Each task's state in one run set: how many of its runs passed, of how many.
export function byTask(rows = []) {
  const out = new Map();
  for (const r of rows) {
    const t = out.get(r.task) ?? { task: r.task, kind: kindOf(r), runs: 0, pass: 0 };
    t.runs++; if (r.pass) t.pass++;
    out.set(r.task, t);
  }
  return out;
}

// What actually changed between two run sets. A task that went from every run passing to every run failing changed;
// one that moved by a single run did not, however much the total shifted. A task only one side ran is named as new
// or gone rather than counted as a change.
// → { moved: [{ task, from, to, way }], steady: n, newly: [ids], gone: [ids], noise: runs that moved inside a task }
export function movedTasks(before = [], after = []) {
  const a = byTask(before), b = byTask(after);
  const moved = [], newly = [], gone = [];
  let noise = 0, steady = 0;
  for (const [id, now] of b) {
    const was = a.get(id);
    if (!was) { newly.push(id); continue; }
    const wasAll = was.pass === was.runs, nowAll = now.pass === now.runs;
    const wasNone = was.pass === 0, nowNone = now.pass === 0;
    const from = `${was.pass}/${was.runs}`, to = `${now.pass}/${now.runs}`;
    if (wasAll && nowNone) moved.push({ task: id, kind: now.kind, from, to, way: 'broke' });
    else if (wasNone && nowAll) moved.push({ task: id, kind: now.kind, from, to, way: 'fixed' });
    else if (was.pass !== now.pass) { noise += Math.abs(was.pass - now.pass); steady++; }
    else steady++;
  }
  for (const id of a.keys()) if (!b.has(id)) gone.push(id);
  return { moved, steady, newly, gone, noise };
}

// The sentence a person reads instead of doing the arithmetic themselves.
export function readingLine(before = [], after = []) {
  const { moved, noise } = movedTasks(before, after);
  const broke = moved.filter((m) => m.way === 'broke'), fixed = moved.filter((m) => m.way === 'fixed');
  const regressions = broke.filter((m) => m.kind === 'regression');
  if (!moved.length && !noise) return 'no task changed state, and no run moved: the same result.';
  if (!moved.length) return `no task changed state; ${noise} run${noise === 1 ? '' : 's'} moved inside tasks that pass sometimes, which is noise, not a difference.`;
  const said = [
    broke.length ? `${broke.length} task${broke.length === 1 ? '' : 's'} went from passing every run to failing every run (${broke.map((m) => m.task).join(', ')})${regressions.length ? `, ${regressions.length} of them a regression that must never come back` : ''}` : '',
    fixed.length ? `${fixed.length} task${fixed.length === 1 ? '' : 's'} went the other way (${fixed.map((m) => m.task).join(', ')})` : '',
    noise ? `${noise} more run${noise === 1 ? '' : 's'} moved inside tasks that pass sometimes, which is noise` : '',
  ].filter(Boolean);
  return `${said.join('; ')}.`;
}

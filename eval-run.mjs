// eval-run.mjs - the evals runner (I7). A SEPARATE entry point from the repo audit: it points the
// DS-conformance core at an agent's GENERATED candidates (not the repo), and reports metrics.
// It NEVER gates the repo. Run: node eval-run.mjs   (advisory; exit 1 only under evals.strict).
//
// v1 is deterministic: candidates are PRE-GENERATED files under evals.outDir/<id>.<ext>. Driving a
// live agent to produce them is a pluggable adapter (the next step; see plans/PARITY-evals-spec.md).
//
// ds-config.json:
//   "evals": {
//     "cases": [ { "id": "login", "prompt": "build a login screen with the DS", "component": "input" } ],
//     "outDir": "evals",            // where <id>.<ext> candidates live (default: "evals")
//     "strict": false,              // true → exit 1 when any candidate has violations
//     "levels": ["bare", "steering", "parity"]   // I60: the same cases per kind of guidance (or --levels)
//   }
//
// A case's "component" is what it expects, and the agent never sees it: the prompt says the intent ("a filter
// people can switch on and off"), the score says whether the agent found the component. A candidate that does
// not use it avoided the system and fails (I64). A prompt that names a component is flagged before the run
// (I68): its score would measure reading the prompt, not finding the component.

import './stdio-sync.mjs';   // the whole report reaches a pipe before process.exit
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { evalConformance } from './eval-check.mjs';
import { createLocator, loadLocator } from './component-locator.mjs';
import { markupFindings } from './a11y-static.mjs';
import { findSteeringFiles } from './steering-check.mjs';
import { typeErrors, typeErrorLine, compileTarget, findTsc } from './compile-check.mjs';

const CANDIDATE_EXTS = ['html', 'htm', 'jsx', 'tsx', 'vue', 'svelte', 'js', 'ts', 'md', 'txt'];

// Assemble the DS context the core needs: the declared CSS var universe + the DS component classes.
export function loadContext(ROOT, cfg, { locator = createLocator(cfg) } = {}) {
  const themePaths = [cfg.paths?.themeCSS ?? 'src/theme.css'].flat();
  const pluginPaths = [cfg.paths?.pluginCSS ?? []].flat();
  const cssVars = new Set();
  for (const p of [...themePaths, ...pluginPaths]) {
    const abs = resolve(ROOT, p);
    if (!existsSync(abs)) continue;
    let css; try { css = readFileSync(abs, 'utf8'); } catch { continue; }
    for (const m of css.matchAll(/(--[a-zA-Z][\w-]*)\s*:/g)) cssVars.add(m[1]);
  }
  const dsClasses = new Set(), componentClass = new Map();
  for (const [name, sel] of Object.entries(cfg.componentSelectors || {})) {
    const cls = String(sel).match(/[.#][\w-]+/)?.[0];
    if (cls) { dsClasses.add(cls); componentClass.set(name, cls); }
  }
  const struct = (() => { try { return JSON.parse(readFileSync(resolve(ROOT, cfg.paths?.snapshotStructure || 'figma-structure.snapshot.json'), 'utf8')); } catch { return null; } })();
  for (const name of Object.keys(struct?.components || {})) {   // the one shared component finder
    const cls = locator.classFor(name);
    dsClasses.add(cls);
    if (!componentClass.has(name)) componentClass.set(name, cls);
  }
  return { cssVars, dsClasses, componentClass };
}

// A configurable command adapter, so ANY agent/CLI can plug in (no provider lock-in). The command
// runs via the shell; the caller decides what it reads/writes. Injectable `run` for tests.
// A command that does not read its stdin can exit before the prompt is written: that EPIPE is not a
// failure, its output is whole (it made a candidate from $EVAL_CONTEXT or its own prompt). A non-zero exit is.
const defaultRun = (cmd, input, env) => {
  const r = spawnSync('/bin/sh', ['-c', cmd], { input: input ?? '', env: { ...process.env, ...env }, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 180000 });
  if (r.error && r.error.code !== 'EPIPE') throw r.error;
  if (r.status !== 0) throw new Error(`exit ${r.status}: ${String(r.stderr ?? '').slice(0, 200)}`);
  return r.stdout;
};

// GENERATION adapter (I7): run `cmd` to produce a candidate from the prompt. The prompt is piped on
// stdin; the DS context path (llms.txt) is in $EVAL_CONTEXT, and $EVAL_ID / $EVAL_COMPONENT are set.
// The candidate is the command's stdout. Returns null on any failure (degrade-safe).
export function generateCandidate(c, cmd, ctxPath, run = defaultRun, env = {}) {
  if (!cmd) return null;
  const prompt = c.prompt || '';   // the expected component stays hidden: finding it is part of the task (I64)
  try {
    const out = run(cmd, prompt, { EVAL_CONTEXT: ctxPath || '', EVAL_ID: c.id || '', EVAL_COMPONENT: c.component || '', ...env });
    return out && out.trim() ? out : null;
  } catch { return null; }
}

// Prompts that name a design-system component (whole word, any case, camelCase split too): the case then
// measures whether the agent read the prompt, not whether it found the component. → [{ id, name }]
export function promptLeaks(cases, names) {
  const forms = (n) => [...new Set([n, String(n).replace(/([a-z0-9])([A-Z])/g, '$1 $2'), String(n).replace(/[-_]+/g, ' ')])]
    .filter((f) => f.length >= 3);
  const out = [];
  for (const c of cases) {
    const p = String(c.prompt ?? '');
    for (const n of names) {
      const hit = forms(n).some((f) => new RegExp(`(^|[^\\w-])${f.replace(/[.*+?^${}()|[\]\\]/g, '\\// LLM-JUDGE adapter').replace(/ /g, '[\\s-]+')}(?![\\w-])`, 'i').test(p));
      if (hit) { out.push({ id: c.id, name: n }); break; }
    }
  }
  return out;
}

// LLM-JUDGE adapter (I7, advisory): run `cmd` with a JSON payload on stdin ({id,prompt,component,
// candidate}); it must print a JSON verdict {ok:boolean, notes?:string}. Advisory only - it scores
// judgment (right component for the intent, empty/error states), never gates. Returns null on failure.
export function judgeCandidate(c, code, cmd, run = defaultRun) {
  if (!cmd || !code || !code.trim()) return null;
  // Pass the component's DS guidance (description + whenNotToUse/useInstead) so the judge can assess
  // "right component for the intent / correct usage" against the DS's OWN rules, not blind.
  const payload = JSON.stringify({ id: c.id, prompt: c.prompt || '', component: c.component ?? null, guidance: c.guidance ?? null, candidate: code });
  try {
    const out = run(cmd, payload, { EVAL_ID: c.id || '' });
    const m = out && out.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const v = JSON.parse(m[0]);
    return { ok: v.ok === true, notes: typeof v.notes === 'string' ? v.notes : '' };
  } catch { return null; }
}

// Aggregate results (single- or multi-run). Each result carries runs + cleanRuns (a single-run result
// is runs:1, cleanRuns: clean?1:0), so zeroFixRate is total clean runs over total runs, and a case is
// "clean" only when EVERY run was clean. Exported for the multi-run path + tests.
export function summarize(results) {
  const n = results.length;
  const runsOf = (r) => r.runs || 1;
  const cleanRunsOf = (r) => (r.cleanRuns != null ? r.cleanRuns : (r.metrics.clean ? 1 : 0));
  const avoidedRunsOf = (r) => (r.avoidedRuns != null ? r.avoidedRuns : (r.metrics.avoided ? 1 : 0));
  const totalRuns = results.reduce((s, r) => s + runsOf(r), 0);
  const totalClean = results.reduce((s, r) => s + cleanRunsOf(r), 0);
  return {
    cases: n,
    produced: results.filter((r) => r.metrics.produced).length,
    clean: results.filter((r) => r.metrics.produced && cleanRunsOf(r) === runsOf(r)).length,
    zeroFixRate: totalRuns ? Math.round((totalClean / totalRuns) * 100) : null,
    violations: results.reduce((s, r) => s + r.violations.length, 0),
    inlineStyles: results.reduce((s, r) => s + (r.metrics.inlineStyles || 0), 0),
    runsPerCase: results[0] ? runsOf(results[0]) : 1,
    expecting: results.filter((r) => r.component).length,   // cases that name the component they expect
    avoided: results.reduce((s, r) => s + avoidedRunsOf(r), 0),   // runs that did not use it (I64)
    typeErrors: results.reduce((s, r) => s + (r.metrics.typeErrors || 0), 0),   // I66, when candidates were compiled
  };
}

// One candidate's score: the DS-conformance core, and, when ctx.compile is set (a .tsx or .jsx candidate and a
// compiler), a type check against the catalog's props (I66): each type error is a violation.
export function score(code, ctx, c = {}) {
  const chk = evalConformance(code, ctx, { component: c.component });
  if (!ctx.compile || !String(code ?? '').trim()) return chk;
  const tc = typeErrors(code, ctx.compile.catalog, { ROOT: ctx.compile.ROOT, id: c.id ?? 'candidate', tsc: ctx.compile.tsc, ext: ctx.compile.ext, ...(ctx.compile.dir ? { dir: ctx.compile.dir } : {}) });
  if (!tc.ran) return chk;
  const violations = [...chk.violations, ...tc.errors.map((e) => ({ type: 'type-error', value: typeErrorLine(e) }))];
  return { violations, metrics: { ...chk.metrics, typeErrors: tc.errors.length, clean: chk.metrics.clean && !tc.errors.length } };
}

// Pure orchestration: run each case's candidate through the conformance core. `loadCandidate(case)`
// returns the candidate code string (or '' when none). Injectable, so this is unit-testable.
export function runEvals(cases, ctx, loadCandidate) {
  const results = [];
  for (const c of cases) {
    const code = loadCandidate(c) || '';
    const { violations, metrics } = score(code, ctx, c);
    results.push({ id: c.id, prompt: c.prompt || '', component: c.component ?? null, code, metrics, violations, runs: 1, cleanRuns: metrics.clean ? 1 : 0 });
  }
  return { results, summary: summarize(results) };
}

// The component's DS guidance (the "why"), from its emitted contract — fed to the judge so it can
// assess "right component / correct usage" against the DS rules. Falls back to nothing if absent.
export function loadGuidance(ROOT, cfg, component) {
  if (!component) return null;
  const dir = resolve(ROOT, cfg.contracts?.out || 'contracts');
  try {
    const c = JSON.parse(readFileSync(join(dir, `${component}.contract.json`), 'utf8'));
    const g = {};
    if (c.description) g.description = String(c.description).slice(0, 400);
    if (c.whenNotToUse) g.whenNotToUse = c.whenNotToUse;
    if (Array.isArray(c.useInstead) && c.useInstead.length) g.useInstead = c.useInstead;
    return Object.keys(g).length ? g : null;
  } catch { return null; }
}

// ── Guidance levels (I60) ─────────────────────────────────────────────────────
// Does a team's guidance help its agents? The same cases run with each kind of context, so the report
// says what each one adds or costs (both S27 and S28 saw bare agents beat guided ones on mechanical
// checks):
//   bare      the prompt alone;
//   steering  the project's own instruction files (AGENTS.md, CLAUDE.md, Cursor and Copilot rules, skills), joined;
//   parity    what the parity writes for agents (contracts/llms.txt).
// The generate command gets the level in $EVAL_LEVEL and the context file in $EVAL_CONTEXT (empty for bare).
// Scored by the same mechanical checks: DS conformance and the accessibility read from the code.
export const LEVELS = ['bare', 'steering', 'parity'];

// The context file for a level, or '' (bare, or nothing to give). `why` says why a level has nothing.
export function levelContext(ROOT, cfg, level, { outDir = 'evals', llmsPath = null } = {}) {
  if (level === 'bare') return { path: '' };
  if (level === 'parity') {
    const p = llmsPath ?? resolve(ROOT, cfg.contracts?.llmsOut || join(cfg.contracts?.out || 'contracts', 'llms.txt'));
    return existsSync(p) ? { path: p } : { path: '', why: `no ${p.replace(ROOT + '/', '')} yet (run the audit once to write it)` };
  }
  if (level === 'steering') {
    const files = findSteeringFiles(ROOT, { skip: [cfg.contracts?.out || 'contracts', 'node_modules', '.parity-out', outDir] });
    if (!files.length) return { path: '', why: 'no instruction files found (AGENTS.md, CLAUDE.md, rules)' };
    const p = resolve(ROOT, outDir, '.context', 'steering.md');
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, files.map((f) => `# ${f.file}\n\n${f.text.trim()}\n`).join('\n'));
    return { path: p, files: files.map((f) => f.file) };
  }
  return { path: '', why: `unknown level "${level}"` };
}

// Every case at every level, `runs` times. `generate(case, level)` returns the candidate code (or '').
// → { [level]: { results, summary } }, each result with its accessibility count too.
export function runLevels(cases, ctx, levels, generate, runs = 1) {
  const out = {};
  for (const level of levels) {
    const results = cases.map((c) => {
      let cleanRuns = 0, a11y = 0, rep = null, inline = 0, avoidedRuns = 0;
      const violations = [];
      for (let k = 0; k < runs; k++) {
        const code = generate(c, level) || '';
        const chk = score(code, ctx, c);
        const found = code ? markupFindings(code).length : 0;
        if (chk.metrics.clean && !found) cleanRuns++;
        if (chk.metrics.avoided) avoidedRuns++;
        a11y += found; violations.push(...chk.violations); inline += chk.metrics.inlineStyles || 0;
        if (!rep || (chk.metrics.produced && !rep.metrics.produced)) rep = { code, ...chk };
      }
      return { id: c.id, component: c.component ?? null, code: rep.code, metrics: { ...rep.metrics, inlineStyles: inline }, violations, runs, cleanRuns, avoidedRuns, a11y };
    });
    const summary = summarize(results);
    summary.a11y = results.reduce((k, r) => k + r.a11y, 0);
    out[level] = { results, summary };
  }
  return out;
}

// The comparison, one line per level, each against bare when bare ran.
export function levelLines(byLevel, notRun = {}) {
  const lines = [];
  const base = byLevel.bare?.summary;
  const signed = (n) => (n > 0 ? `+${n}` : String(n));
  for (const [level, { summary: s }] of Object.entries(byLevel)) {
    const vs = base && level !== 'bare'
      ? `  (vs bare: zero-fix ${signed(s.zeroFixRate - base.zeroFixRate)} points, violations ${signed(s.violations - base.violations)}, accessibility ${signed(s.a11y - base.a11y)})` : '';
    const avoided = s.expecting ? ` · ${s.avoided} avoided the system` : '';
    lines.push(`  ${level.padEnd(9)} ${s.produced}/${s.cases} produced · ${s.zeroFixRate}% zero-fix · ${s.violations} violation(s) · ${s.inlineStyles} inline style(s) · ${s.a11y} accessibility finding(s)${avoided}${vs}`);
  }
  for (const [level, why] of Object.entries(notRun)) lines.push(`  ${level.padEnd(9)} not run: ${why}`);
  return lines;
}

function fileLoader(ROOT, outDir) {
  return (c) => {
    for (const ext of CANDIDATE_EXTS) {
      const abs = resolve(ROOT, outDir, `${c.id}.${ext}`);
      if (existsSync(abs)) { try { return readFileSync(abs, 'utf8'); } catch { /* keep trying */ } }
    }
    return '';
  };
}

async function main() {
  const ROOT = process.cwd();
  let cfg;
  try { cfg = JSON.parse(readFileSync(join(ROOT, 'ds-config.json'), 'utf8')); } catch {
    console.error('❌ ds-config.json not found at project root.'); process.exit(1);
  }
  const cases = cfg.evals?.cases || [];
  if (!cases.length) {
    console.log('\n⏭  evals: no cases configured (ds-config.json → evals.cases[]). Nothing to run.\n');
    process.exit(0);
  }
  const outDir = cfg.evals?.outDir || 'evals';
  const ext = cfg.evals?.ext || 'html';
  const ctx = loadContext(ROOT, cfg, { locator: await loadLocator(ROOT, cfg) });
  // I66: .tsx/.jsx candidates are type-checked against the catalog's props (evals.compile: false turns it off).
  if (compileTarget(ext) && cfg.evals?.compile !== false) {
    let catalog = {};
    try { catalog = JSON.parse(readFileSync(resolve(ROOT, cfg.contracts?.out ?? 'contracts', 'catalog.json'), 'utf8')); } catch { /* no catalog yet */ }
    const tsc = findTsc(ROOT);
    if (!tsc) console.log('ℹ️  compile not checked: no TypeScript compiler (install typescript in the project, or tsc on the PATH).');
    else if (!Object.keys(catalog.components ?? {}).length) console.log('ℹ️  compile not checked: no contracts/catalog.json yet (run the audit once to write it).');
    else ctx.compile = { catalog, tsc, ROOT, ext };
  }
  const leaks = promptLeaks(cases, [...ctx.componentClass.keys()]);
  for (const l of leaks) console.log(`⚠️  case "${l.id}": the prompt names the component "${l.name}", so its score measures reading the prompt, not finding the component. Say the intent and put the component in the case's "component" field.`);

  // GENERATION (optional): when evals.generate.cmd is set, produce the candidate from the prompt.
  const genCmd = cfg.evals?.generate?.cmd;
  const forceGen = process.argv.includes('--generate');
  const ctxPath = resolve(ROOT, cfg.contracts?.llmsOut || join(outDir === 'contracts' ? outDir : 'contracts', 'llms.txt'));
  const ctxArg = () => (existsSync(ctxPath) ? ctxPath : '');
  const genTimes = {};   // case id -> avg generation time (ms), for the completion-time metric (S16)
  // N runs (S16): generation is non-deterministic, so run each case `runs` times and measure how
  // reliably it comes out clean. Only meaningful with a generate.cmd (a static file is identical every
  // time). Clamped; 3–5 gives signal, 10+ is definitive.
  const runs = (genCmd && Number.isInteger(cfg.evals?.runs) && cfg.evals.runs > 1) ? Math.min(cfg.evals.runs, 20) : 1;

  // GUIDANCE LEVELS (I60): the same cases per kind of context, compared with bare.
  const levelArg = process.argv.find((a) => a.startsWith('--levels'));
  const levels = levelArg ? (levelArg.split('=')[1] ?? process.argv[process.argv.indexOf(levelArg) + 1] ?? LEVELS.join(',')).split(',').map((x) => x.trim()).filter(Boolean)
    : Array.isArray(cfg.evals?.levels) ? cfg.evals.levels : null;
  if (levels?.length) {
    if (!genCmd) { console.log('\n⏭  evals: guidance levels need evals.generate.cmd (the command that generates a candidate). Nothing to run.\n'); process.exit(0); }
    const ctxOf = {}, notRun = {};
    for (const l of levels) { const c = levelContext(ROOT, cfg, l, { outDir }); if (l !== 'bare' && !c.path) notRun[l] = c.why; else ctxOf[l] = c.path; }
    const byLevel = runLevels(cases, ctx, Object.keys(ctxOf), (c, level) => generateCandidate(c, genCmd, ctxOf[level], undefined, { EVAL_LEVEL: level }), runs);
    console.log(`\n─── Guidance levels: the same ${cases.length} case(s), ${runs} run(s) each ───────────────────`);
    for (const l of levelLines(byLevel, notRun)) console.log(l);
    console.log('   A case is clean when it has no DS violation and no accessibility finding. Advisory: it never gates the repo.\n');
    try {
      const hp = join(ROOT, 'evals-history.json');
      let hist = []; try { hist = JSON.parse(readFileSync(hp, 'utf8')); } catch { /* first run */ }
      hist.push({ timestamp: new Date().toISOString(), levels: Object.fromEntries(Object.entries(byLevel).map(([l, v]) => [l, v.summary])) });
      writeFileSync(hp, JSON.stringify(hist.slice(-100), null, 2) + '\n');
    } catch { /* optional */ }
    process.exit(0);
  }

  let results, summary;
  if (runs > 1) {
    results = cases.map((c) => {
      let cleanRuns = 0, totalMs = 0, rep = null, avoidedRuns = 0;
      for (let k = 0; k < runs; k++) {
        const t0 = Date.now();
        const code = generateCandidate(c, genCmd, ctxArg()) || '';
        totalMs += Date.now() - t0;
        const chk = score(code, ctx, c);
        if (chk.metrics.clean) cleanRuns++;
        if (chk.metrics.avoided) avoidedRuns++;
        if (!rep) rep = { code, ...chk };
      }
      genTimes[c.id] = Math.round(totalMs / runs);
      try { const target = resolve(ROOT, outDir, `${c.id}.${ext}`); mkdirSync(dirname(target), { recursive: true }); if (rep.code) writeFileSync(target, rep.code); } catch { /* optional */ }
      return { id: c.id, prompt: c.prompt || '', component: c.component ?? null, code: rep.code, metrics: rep.metrics, violations: rep.violations, runs, cleanRuns, avoidedRuns };
    });
    summary = summarize(results);
    console.log(`   ↻ generated ${cases.length} case(s) × ${runs} run(s) via evals.generate.cmd`);
  } else {
    // Single run: generate once (unless a candidate exists and no --generate), then read from disk.
    if (genCmd) {
      for (const c of cases) {
        const target = resolve(ROOT, outDir, `${c.id}.${ext}`);
        if (!forceGen && existsSync(target)) continue;
        const t0 = Date.now();
        const code = generateCandidate(c, genCmd, ctxArg());
        genTimes[c.id] = Date.now() - t0;
        if (code) { try { mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, code); console.log(`   ↻ generated ${c.id} via evals.generate.cmd (${genTimes[c.id]}ms)`); } catch { /* keep going */ } }
      }
    }
    ({ results, summary } = runEvals(cases, ctx, fileLoader(ROOT, outDir)));
  }

  // LLM-JUDGE (optional, advisory): score each produced candidate. Never gates.
  const judgeCmd = cfg.evals?.judge?.cmd;
  if (judgeCmd) {
    for (const r of results) {
      if (!r.metrics.produced) continue;
      const guidance = loadGuidance(ROOT, cfg, r.component);
      const v = judgeCandidate({ id: r.id, prompt: r.prompt, component: r.component, guidance }, r.code, judgeCmd);
      if (v) r.judge = v;
    }
  }
  const judged = results.filter((r) => r.judge).length;
  const judgePass = results.filter((r) => r.judge?.ok).length;
  for (const r of results) if (genTimes[r.id] != null) r.genMs = genTimes[r.id];
  const gennedMs = Object.values(genTimes);
  const avgGenMs = gennedMs.length ? Math.round(gennedMs.reduce((a, b) => a + b, 0) / gennedMs.length) : null;

  console.log(`\n─── DS-conformance evals ─────────────────────────────────────────`);
  console.log(`   context: ${ctx.cssVars.size} DS vars · ${ctx.dsClasses.size} DS classes · candidates in ${outDir}/${genCmd ? ' · generate:on' : ''}${runs > 1 ? ` · ${runs} runs/case` : ''}${judgeCmd ? ' · judge:on' : ''}\n`);
  for (const r of results) {
    const allClean = (r.cleanRuns ?? (r.metrics.clean ? 1 : 0)) === (r.runs || 1);
    const icon = !r.metrics.produced ? '⏭' : allClean ? '✅' : '❌';
    const runNote = r.runs > 1 ? ` (${r.cleanRuns}/${r.runs} runs clean)` : '';
    const base = !r.metrics.produced ? 'no candidate file' :
      r.violations.length ? `${r.violations.length} violation(s): ` + r.violations.slice(0, 6).map((v) => `${v.type} ${v.value}`).join(', ')
      : 'clean (zero-fix)';
    const judge = r.judge ? `   ${r.judge.ok ? '⚖️ ok' : '⚖️ review'}${r.judge.notes ? ` — ${r.judge.notes}` : ''}` : '';
    console.log(`  ${icon} ${r.id}${r.component ? ` [${r.component}]` : ''} — ${base}${runNote}${judge}`);
  }
  console.log(`\n   ${summary.produced}/${summary.cases} produced · ${summary.clean}/${summary.cases} zero-fix (${summary.zeroFixRate}%) · ${summary.violations} violation(s) · ${summary.inlineStyles} inline-style(s)${summary.expecting ? ` · ${summary.avoided} avoided the system` : ''}${ctx.compile ? ` · ${summary.typeErrors} type error(s)` : ''}${judged ? ` · judge ${judgePass}/${judged} ok` : ''}${avgGenMs != null ? ` · avg gen ${avgGenMs}ms` : ''}`);
  console.log(`   Advisory: evals measure agent output, they never gate the repo.\n`);

  // History (best-effort; capped)
  try {
    const hp = join(ROOT, 'evals-history.json');
    let hist = []; try { hist = JSON.parse(readFileSync(hp, 'utf8')); } catch { /* first run */ }
    hist.push({ timestamp: new Date().toISOString(), ...summary, judged, judgePass, avgGenMs });
    if (hist.length > 100) hist = hist.slice(-100);
    writeFileSync(hp, JSON.stringify(hist, null, 2) + '\n');
  } catch { /* optional */ }

  const strict = cfg.evals?.strict === true;
  process.exit(strict && summary.violations > 0 ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

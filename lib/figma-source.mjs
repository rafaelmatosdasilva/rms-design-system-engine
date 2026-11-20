// figma-source.mjs - which way to read Figma, chosen automatically.
//
// In order: a design.json in the project newer than the snapshots (the person ran `figma-cli snapshot`), then
// figma-cli itself when Figma Desktop is connected to it (its debugging port answers, or in Safe Mode its FigCli plugin: no API key, no rate limit,
// every mode and alias chain), then the Figma MCP of the agent's session (the refresh-figma recipe), then the REST API
// with FIGMA_TOKEN. The engine reads design.json and runs figma-cli itself; the MCP is the agent's tool, so for it the
// engine says what to run. Never writes to Figma: `figma-cli snapshot` only reads the open file.
import { existsSync, statSync, readFileSync } from 'node:fs';
import { join, delimiter } from 'node:path';
import { spawnSync } from 'node:child_process';

export const designJsonPath = (cfg = {}) => cfg.figmaCli?.designJson ?? 'design.json';
export const figmaCliPort = (env = process.env) => { const p = parseInt(env.FIGMA_PORT, 10); return p > 0 && p < 65536 ? p : 9222; };

// A command on PATH.
// A Figma token under the name Figma's own tools use (FIGMA_ACCESS_TOKEN, as Code Connect's config reads it) is the
// engine's FIGMA_TOKEN too, so a project whose .env already holds one needs no second. FIGMA_TOKEN set wins. → env
export function figmaTokenAlias(env = process.env) {
  if (!env.FIGMA_TOKEN && env.FIGMA_ACCESS_TOKEN) env.FIGMA_TOKEN = env.FIGMA_ACCESS_TOKEN;
  return env;
}

export function onPath(cmd, env = process.env, exists = existsSync) {
  for (const dir of String(env.PATH ?? '').split(delimiter).filter(Boolean)) {
    for (const ext of process.platform === 'win32' ? ['.cmd', '.exe', ''] : ['']) if (exists(join(dir, cmd + ext))) return join(dir, cmd + ext);
  }
  return null;
}

// Figma Desktop (or the browser figma-cli drives) answering on its debugging port.
export async function portAnswers(port, fetchImpl = globalThis.fetch, timeoutMs = 800) {
  try {
    const r = await fetchImpl(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(timeoutMs) });
    return r.ok;
  } catch { return false; }
}

// DESIGN_SYSTEM_ENGINE_FIGMA_CLI=none: figma-cli is never asked, even where it is installed and Figma answers (a test,
// or a run that must not read the Figma file open on this computer).
export const figmaCliOff = (env = process.env) => env.DESIGN_SYSTEM_ENGINE_FIGMA_CLI === 'none';

// figma-cli in Safe Mode: no debugging port, its daemon talks to the FigCli plugin open in Figma. Connected when a
// one-line eval comes back through it.
export function safeModeAnswers(run = (args) => spawnSync('figma-cli', args, { encoding: 'utf8', timeout: 15000 })) {
  try { const r = run(['eval', 'return 1']); return r.status === 0 && String(r.stdout ?? '').trim().split('\n').pop().trim() === '1'; } catch { return false; }
}

// Which way the person chose to read Figma: figmaRoute in ds-config.json, or DESIGN_SYSTEM_ENGINE_FIGMA_ROUTE (which
// wins). auto (the default) asks each in turn; figma-cli, console (Figma Console MCP) or mcp (the Figma tool of the
// agent's session, its scripts run by hand) is that one only, and one that does not answer says so, never another.
export const FIGMA_ROUTES = ['auto', 'figma-cli', 'console', 'mcp'];
export function figmaRouteChoice(cfg = {}, env = process.env) {
  const v = String(env.DESIGN_SYSTEM_ENGINE_FIGMA_ROUTE || cfg.figmaRoute || 'auto').trim().toLowerCase();
  if (!FIGMA_ROUTES.includes(v)) throw new Error(`figmaRoute "${v}" is not one of ${FIGMA_ROUTES.join(', ')}`);
  return v;
}

const mtimeOf = (p) => { try { return statSync(p).mtimeMs; } catch { return null; } };

// { route: 'design-json' | 'figma-cli' | 'figma-console' | 'mcp' | 'rest', why, file? }. deps make it testable.
// consoleBridge: whether Figma Console MCP, configured in the project, answers through its Desktop Bridge plugin
// (figma-console.mjs); asked only after figma-cli, and only where the project names it.
export async function chooseFigmaSource(ROOT, cfg = {}, { env = process.env, which = (c) => onPath(c, env), answers = (p) => portAnswers(p), safe = () => safeModeAnswers(), mtime = mtimeOf,
  consoleBridge = async () => (await import('./figma-console.mjs')).figmaConsoleAnswers(ROOT, cfg, { env }) } = {}) {
  const chosen = figmaRouteChoice(cfg, env);
  const design = join(ROOT, designJsonPath(cfg));
  const snap = join(ROOT, cfg.paths?.snapshotVars ?? 'src/figma-vars.snapshot.json');
  const dj = mtime(design), sv = mtime(snap);
  // design.json is figma-cli's own file: read first in auto, and when figma-cli is the route chosen.
  if ((chosen === 'auto' || chosen === 'figma-cli') && dj != null && (sv == null || dj > sv)) return { route: 'design-json', file: designJsonPath(cfg), why: `${designJsonPath(cfg)} is newer than the snapshots` };
  if (chosen === 'mcp') return { route: 'mcp', why: 'figmaRoute is mcp: the Figma tool of this session reads it' };
  if (chosen === 'console') {
    const b = await consoleBridge({ chosen: true });
    if (b?.ok) return { route: 'figma-console', why: `figmaRoute is console: ${b.why}` };
    throw new Error(`figmaRoute is console, and Figma Console MCP was not reached: ${b?.why ?? 'it is not configured in this project (.mcp.json, .cursor/mcp.json or .vscode/mcp.json)'}`);
  }
  if (chosen === 'figma-cli') {
    if (figmaCliOff(env) || !which('figma-cli')) throw new Error('figmaRoute is figma-cli, and figma-cli is not installed (or DESIGN_SYSTEM_ENGINE_FIGMA_CLI=none)');
    if (await answers(figmaCliPort(env))) return { route: 'figma-cli', why: `figmaRoute is figma-cli: Figma answers on port ${figmaCliPort(env)}` };
    if (await safe()) return { route: 'figma-cli', why: 'figmaRoute is figma-cli: Figma answers through its FigCli plugin (Safe Mode)' };
    throw new Error('figmaRoute is figma-cli, and Figma did not answer it (is Figma Desktop open with its debugging port, or the FigCli plugin running?)');
  }
  const cli = !figmaCliOff(env) && which('figma-cli');
  if (cli && await answers(figmaCliPort(env))) return { route: 'figma-cli', why: `figma-cli is installed and Figma answers on port ${figmaCliPort(env)}` };
  if (cli && await safe()) return { route: 'figma-cli', why: 'figma-cli is installed and Figma answers through its FigCli plugin (Safe Mode)' };
  const bridge = await consoleBridge();
  if (bridge?.ok) return { route: 'figma-console', why: bridge.why };
  if (env.FIGMA_TOKEN && cfg.figmaFileKey) return { route: 'rest', why: 'FIGMA_TOKEN is set: the audit refreshes from the Figma API on every run' };
  return { route: 'mcp', why: `no figma-cli connection${bridge?.why ? `, Figma Console MCP not reached (${bridge.why})` : ''} and no design.json: the Figma tool of this session reads it` };
}

// Runs `figma-cli snapshot` in the project (it writes design.json) and imports it; then reads the variables, text
// styles and effect styles, and the components (structure and props), through figma-cli with the capture recipe's
// own scripts, in checked chunks, so the snapshots are the ones a capture through the Figma tool gives.
// Returns the import result, with the captures'.
export async function refreshFromFigmaCli(ROOT, cfg = {}, { run = (cmd, args) => spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', timeout: 600000 }),
  capture = async (kind = 'vars') => (await import('./figma-capture.mjs')).captureWithFigmaCli(ROOT, cfg, { kind }) } = {}) {
  const r = run('figma-cli', ['snapshot']);
  if (r.error || r.status !== 0) throw new Error(`figma-cli snapshot did not finish: ${(r.error?.message ?? r.stderr ?? '').trim().split('\n').slice(-1)[0] || `exit ${r.status}`}`);
  const out = await importDesign(ROOT, cfg);
  const read = async (kind) => { try { return await capture(kind); } catch (e) { return { ok: false, error: String(e.message).split('\n')[0] }; } };
  const captured = await read('vars');
  const capturedComponents = await read('components');
  return { ...out, captured, capturedComponents };
}

// Reads the variables, text styles and effect styles, then the components, through Figma Console MCP with the
// capture recipe's own scripts, in the same checked chunks as figma-cli, so the snapshots are the ones every other
// route gives. The server is started once for both and stopped after. → { captured, capturedComponents, server }.
export async function refreshFromFigmaConsole(ROOT, cfg = {}, { runner = async () => (await import('./figma-console.mjs')).figmaConsoleRunner(ROOT, cfg),
  capture = async (kind, run) => (await import('./figma-capture.mjs')).captureWithFigmaCli(ROOT, cfg, { kind, run, via: 'Figma Console MCP' }) } = {}) {
  const r = await runner();
  const read = async (kind) => { try { return await capture(kind, r.run); } catch (e) { return { ok: false, error: String(e.message).split('\n')[0] }; } };
  try { return { captured: await read('vars'), capturedComponents: await read('components'), server: r.server }; }
  finally { r.close(); }
}

// Imports design.json into the snapshots ds-config names, and says which Figma file it came from.
export async function importDesign(ROOT, cfg = {}, file = designJsonPath(cfg)) {
  const { importFigmaCli } = await import('./figma-cli-import.mjs');
  const out = importFigmaCli(ROOT, cfg, file);
  let source = null;
  try { source = JSON.parse(readFileSync(join(ROOT, file), 'utf8')).meta?.file ?? null; } catch { /* named in the error already */ }
  return { ...out, file, source };
}

// The line for the capture figma-cli ran after its snapshot (refreshFromFigmaCli), or null.
const capturedLine = (c, via = 'figma-cli') => (!c ? '' : c.ok ? `\nFigma's variables, text styles and effect styles read through ${via} in ${c.counts.chunks} checked chunk${c.counts.chunks === 1 ? '' : 's'} → ${c.path}` : c.kept ? `\n${c.kept}` : `\nThe variables' scopes, descriptions and text styles were not read through ${via} (${c.error ?? 'chunks missing'}); the ones already saved are kept.`);
const componentsLine = (c, via = 'figma-cli') => (!c ? '' : c.ok ? `\nFigma's components read through ${via} in ${c.counts.chunks} checked chunk${c.counts.chunks === 1 ? '' : 's'}: ${c.counts.components} components with ${c.counts.variants} variants → ${c.written.join(', ')}${c.kept ? `\n${c.kept}` : ''}` : c.kept ? `\n${c.kept}` : `\nThe components' full structure was not read through ${via} (${c.error ?? 'chunks missing'}); ${via === 'figma-cli' ? 'what design.json holds is kept' : 'the snapshots already saved are kept'}.`);
export const importLine = (r) => `Figma read from ${r.file}${r.source ? ` (${r.source})` : ''}: ${r.counts.colours} colours in ${r.counts.modes} mode${r.counts.modes === 1 ? '' : 's'}, ${r.counts.sizing} sizes, ${r.counts.components} components → ${Object.values(r.paths).join(', ')}${r.kept?.length ? `\n${r.kept.join('\n')}` : ''}${capturedLine(r.captured)}${componentsLine(r.capturedComponents)}`;
// What --refresh-figma says after a read through Figma Console MCP (refreshFromFigmaConsole). → { line, ok }: ok when
// at least one of the two reads wrote its snapshots.
export const consoleLine = (r) => ({ ok: !!(r.captured?.ok || r.capturedComponents?.ok), line: `Figma read through Figma Console MCP (${r.server?.file ?? 'the project\'s MCP config'})${capturedLine(r.captured, 'Figma Console MCP')}${componentsLine(r.capturedComponents, 'Figma Console MCP')}` });

// The way to run a read-only script in Figma for the reads beyond the capture (the examples, the brands, a screen's
// layout): figma-cli when it answers, else Figma Console MCP where the project configures it and its plugin answers,
// else null (the caller writes the script for the Figma tool of the session). → { run(code, { fileKey }) → text, via,
// close() } | null. pin: false runs in the file active in Figma rather than figmaFileKey's (the brands may live in a
// file of their own). The server, once started, serves every call until close().
export async function figmaRunner(ROOT, cfg = {}, { env = process.env, pin = true, chosen = figmaRouteChoice(cfg, env),
  cliAnswers = () => !figmaCliOff(env) && /^\s*1\s*$/m.test(spawnSync('figma-cli', ['eval', 'return 1'], { encoding: 'utf8', timeout: 15000 }).stdout ?? ''),
  cli = async () => (await import('./figma-capture.mjs')).figmaCliEval(ROOT, { timeout: 600000 }),
  bridge = async (c) => { const fc = await import('./figma-console.mjs'); return fc.figmaConsoleOff(env) || !fc.findFigmaConsole(ROOT) ? null : fc.figmaConsoleRunner(ROOT, c); } } = {}) {
  if (chosen === 'mcp') return null;
  if (chosen !== 'console' && cliAnswers()) { const run = await cli(); return { run: (code) => run(code), via: 'figma-cli', close() {} }; }
  if (chosen === 'figma-cli') return { error: 'figmaRoute is figma-cli, and figma-cli did not answer (is Figma Desktop open with the FigCli plugin or its debugging port?)' };
  let r = null;
  try { r = await bridge(pin ? cfg : { ...cfg, figmaFileKey: undefined }); } catch (e) { return { error: `Figma Console MCP did not answer: ${String(e.message).split('\n')[0]}` }; }
  if (!r && chosen === 'console') return { error: 'figmaRoute is console, and Figma Console MCP is not configured in this project (.mcp.json, .cursor/mcp.json or .vscode/mcp.json), or DESIGN_SYSTEM_ENGINE_FIGMA_CONSOLE=none' };
  return r ? { run: (code, o) => r.run(code, o), via: 'Figma Console MCP', close: () => r.close() } : null;
}



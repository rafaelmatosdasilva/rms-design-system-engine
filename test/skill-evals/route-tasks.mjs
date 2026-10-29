// test/skill-evals/route-tasks.mjs - the route benchmark: the same questions answered through the command line
// (--query, --check-ui, --summary) and through the engine's MCP server (mcp.mjs: query, catalog, check_ui, summary).
// Run with --set route and a --route (lib.mjs ROUTES): shell, both, mcp (no shell, the server), none (no shell, no
// server). Every run has the same guide and the same project, on which the audit has run once, as in a project that uses
// the engine (its catalog and its last summary are there).
//
// Each task asks for something only the engine answers right: the props as the code writes them, the value Figma gives a
// token (the code's theme says another), a generated UI that passes the check, what the last audit found.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { ENGINE, hasEngineRun } from './lib.mjs';

const check = (name, ok, detail = '') => ({ name, ok: !!ok, detail });
const terms = (input) => [input?.terms ?? []].flat().map(String).join(' ');

// Whether the run asked the engine, by either route: a command (`cli` tests it and its flags) or an MCP tool (`mcp`
// tests the tool's name and its arguments). → which route it used: 'shell', 'mcp', 'both' or ''.
export function askedBy(ctx, { cli = () => false, mcp = () => false } = {}) {
  const viaShell = hasEngineRun(ctx, cli);
  const viaMcp = (ctx.mcp ?? []).some((m) => !m.isError && mcp(m.tool, m.input ?? {}));
  return viaShell && viaMcp ? 'both' : viaShell ? 'shell' : viaMcp ? 'mcp' : '';
}

// The audit once, before the run: the catalog and the last summary are there, as in a project that uses the engine.
export function audited(dir) {
  spawnSync(process.execPath, [join(ENGINE, 'audit.mjs')], { cwd: dir, stdio: 'ignore', env: { ...process.env, NO_COLOR: '1' }, timeout: 5 * 60 * 1000 });
}

// The generated UI checked again by the scorer, in the run's project: 0 errors, or what failed.
export function uiPasses(dir, file) {
  const r = spawnSync(process.execPath, [join(ENGINE, 'ui-check.mjs'), file, '--json'], { cwd: dir, encoding: 'utf8' });
  let out = null; try { out = JSON.parse(r.stdout); } catch { /* not JSON: no catalog, no file, or not valid JSON */ }
  if (!out) return { ok: false, detail: (r.stdout || r.stderr).trim().split('\n').slice(0, 3).join(' | ') };
  return { ok: out.ok === true, detail: (out.findings ?? []).filter((f) => f.level === 'error').map((f) => f.message).join(' | ') };
}

export const ROUTE_TASKS = [
  { id: 'route-props', prompt: 'what props does the chip take, and which values does its size accept?', setup: audited,
    score: (ctx) => [
      check('asks the engine, not its memory', askedBy(ctx, { cli: (c) => /--query/.test(c) && /chip/.test(c), mcp: (t, a) => t === 'query' && /chip/i.test(terms(a)) })),
      check('the size values as written', /\bM\b/.test(ctx.final) && /\bL\b/.test(ctx.final)),
      check('no files changed', !ctx.changed.length, ctx.changed.join(', ')),
    ] },
  // The code's theme writes 12px; Figma gives 16px. Only the engine says which is Figma's.
  { id: 'route-token', prompt: 'which CSS variable do I use for the chip\'s corner radius, and what value does Figma give it?', setup: audited,
    score: (ctx) => [
      check('asks the engine, not its memory', askedBy(ctx, { cli: (c) => /--query/.test(c), mcp: (t) => t === 'query' })),
      check('names the variable and Figma\'s value', /--radii-chip\b/.test(ctx.final) && /\b16\s*px\b/.test(ctx.final)),
      check('no files changed', !ctx.changed.length, ctx.changed.join(', ')),
    ] },
  { id: 'route-ui', mayChange: ['ui/filter.json'], keep: ['ui/filter.json'], setup: audited,
    prompt: 'write the generated UI for one large "Open" filter chip with an icon, as JSON in ui/filter.json (the shape the design system\'s UI check reads), and check it against the design system',
    score: (ctx) => {
      const written = ctx.read('ui/filter.json') != null;
      const ui = written ? uiPasses(ctx.dir, 'ui/filter.json') : { ok: false, detail: 'no ui/filter.json' };
      return [
        check('writes ui/filter.json', written),
        check('checks it with the engine', askedBy(ctx, { cli: (c) => /--check-ui\s+\S*ui\/filter\.json/.test(c), mcp: (t, a) => t === 'check_ui' && /filter\.json/.test(String(a.file ?? '')) })),
        check('the UI passes the check', ui.ok, ui.detail),
      ];
    } },
  // What the last audit found: the chip's radius against Figma, and the snapshots too old or the props' letter case.
  { id: 'route-summary', prompt: 'what did the last audit find? Tell me what is failing.', setup: audited,
    score: (ctx) => {
      const readFile = ctx.calls.some((c) => c.name === 'Read' && /\.design-system-engine-out\/summary\.md$/.test(String(c.input?.file_path ?? '')));
      return [
        check('reads the last audit', readFile || askedBy(ctx, { cli: () => true, mcp: (t) => t === 'summary' })),
        check('names the chip radius and another failure', /radi(us|i)/i.test(ctx.final) && /(snapshot|old|stale|up to date|letter case|prop)/i.test(ctx.final)),
        check('no files changed', !ctx.changed.length, ctx.changed.join(', ')),
      ];
    } },
];

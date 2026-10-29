#!/usr/bin/env node
// test/skill-evals/route-report.mjs - the route benchmark's table: the same tasks through the command line and through
// the engine's MCP server, per route (lib.mjs ROUTES), from the saved runs.
//
//   node test/skill-evals/route-report.mjs [<folder>]      (default: results/route; a records folder's route/ works too)
//
// Per route: the runs that pass, the mean time, input and output tokens and tool calls a run, and how each run reached
// the engine (its command, its MCP tools, both, or neither). Then each task per route.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ORDER = ['shell', 'both', 'mcp', 'none'];
const LABEL = { shell: 'shell only (the command line)', both: 'shell and the MCP server', mcp: 'MCP server, no shell', none: 'no shell, no server' };

export function routeRows(dir) {
  const out = {};
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.jsonl'))) {
    for (const r of readFileSync(join(dir, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))) (out[r.route ?? 'shell'] ??= []).push(r);
  }
  return out;
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
// How a run reached the engine: by its command, by the MCP server, by both, or not at all.
export const reached = (r) => { const s = (r.engineRuns ?? 0) > 0, m = (r.mcpCalls ?? []).length > 0; return s && m ? 'both' : s ? 'command' : m ? 'MCP' : 'neither'; };

export function routeStats(rows) {
  const by = {};
  for (const r of rows) by[reached(r)] = (by[reached(r)] ?? 0) + 1;
  const tools = {};
  for (const r of rows) for (const t of r.mcpCalls ?? []) tools[t] = (tools[t] ?? 0) + 1;
  return {
    runs: rows.length, pass: rows.filter((r) => r.pass).length,
    seconds: mean(rows.map((r) => (r.usage?.ms ?? 0) / 1000)), input: mean(rows.map((r) => r.usage?.input ?? 0)), output: mean(rows.map((r) => r.usage?.output ?? 0)),
    calls: mean(rows.map((r) => r.calls ?? 0)), cost: mean(rows.map((r) => r.usage?.cost ?? 0)), reached: by, mcpTools: tools,
  };
}

export function routeTable(byRoute) {
  const routes = ORDER.filter((r) => byRoute[r]?.length);
  const k = (n) => `${Math.round(n / 1000)}k`;
  const lines = ['| Route | Pass | Time a run | Input a run | Output a run | Tool calls a run | Cost a run | Reached the engine by |', '|---|---|---|---|---|---|---|---|'];
  for (const route of routes) {
    const s = routeStats(byRoute[route]);
    lines.push(`| ${LABEL[route]} | ${s.pass}/${s.runs} | ${s.seconds.toFixed(0)} s | ${k(s.input)} | ${s.output.toFixed(0)} | ${s.calls.toFixed(1)} | $${s.cost.toFixed(3)} | ${Object.entries(s.reached).map(([w, n]) => `${w} ${n}`).join(', ')} |`);
  }
  const tasks = [...new Set(routes.flatMap((r) => byRoute[r].map((x) => x.task)))];
  lines.push('', `| Task | ${routes.map((r) => LABEL[r]).join(' | ')} |`, `|---|${routes.map(() => '---').join('|')}|`);
  for (const t of tasks) lines.push(`| \`${t}\` | ${routes.map((r) => { const xs = byRoute[r].filter((x) => x.task === t); return `${xs.filter((x) => x.pass).length}/${xs.length}`; }).join(' | ')} |`);
  return lines.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  let dir = process.argv[2] ?? join(HERE, 'results', 'route');
  if (existsSync(join(dir, 'route'))) dir = join(dir, 'route');
  const byRoute = routeRows(dir);
  console.log(routeTable(byRoute));
  const failed = Object.values(byRoute).flat().filter((r) => !r.pass);
  if (failed.length) {
    console.log('\nFailed checks:');
    for (const r of failed) console.log(`  ${r.route} ${r.task} #${r.run}: ${[...(r.checks ?? []), ...(r.rules ?? [])].filter((c) => !c.ok).map((c) => `${c.name}${c.detail ? ` (${c.detail})` : ''}`).join('; ')}`);
  }
}

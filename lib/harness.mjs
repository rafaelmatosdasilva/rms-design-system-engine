// harness.mjs - which layers of the agent harness this project has switched on, said in one place (--harness).
//
// Access to a design system does not keep an agent inside it. Five layers do, each in the order it runs: the agent
// looks before it builds (the route and the contracts), it has a way to ask (the commands, the MCP server), every
// edit is checked as it is made (the hooks in each agent tool, the git hooks), a second judge reads the work when
// asked (a model, apart from the agent that wrote it), and a person approves the change (the pull request's job and
// the sign-off). The engine brings each one, and a team that switched on only one of them believes it has them all.
// This reads the project as it is (its files, never a guess) and lists each layer on or off, with the one command or
// line that turns on what is missing. Pure reads: nothing is installed or changed.
//
//   harnessOf(ROOT, cfg, { engineDir, hooks, gitHooks, onPath }) → [{ layer, runs, state, parts: [{ what, on, fix }] }]
//   harnessLines(layers)                                          → the terminal's lines

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve, delimiter } from 'node:path';
import { SKILL as CLI } from './names.mjs';

const read = (p) => { try { return readFileSync(p, 'utf8'); } catch { return ''; } };
const MARK = 'guard.mjs';
// Where each agent tool keeps its MCP servers, in the project.
export const MCP_FILES = ['.mcp.json', '.cursor/mcp.json', '.vscode/mcp.json', '.gemini/settings.json', '.codex/config.toml'];
const ENGINE_NAMED = /mcp\.mjs|design-system-engine/;
// A CI file names the engine when it runs it: its audit, its command, or its folder.
const CI_NAMED = /audit\.mjs|rms-design-system-engine|design-system-engine/;

// Is a command (its first word) on this machine's PATH?
export function onPathOf(env = process.env) {
  const dirs = String(env.PATH ?? '').split(delimiter).filter(Boolean);
  const exts = process.platform === 'win32' ? ['', '.cmd', '.exe', '.bat'] : [''];
  return (cmd) => {
    const bin = String(cmd ?? '').trim().split(/\s+/)[0];
    if (!bin) return false;
    if (/[\\/]/.test(bin)) return existsSync(bin);
    return dirs.some((d) => exts.some((x) => existsSync(join(d, bin + x))));
  };
}

// The CI files that run the engine, GitHub's and GitLab's.
export function ciJobs(ROOT) {
  const out = [];
  const wf = join(ROOT, '.github', 'workflows');
  let files = [];
  try { files = readdirSync(wf).filter((f) => /\.ya?ml$/i.test(f)); } catch { /* no workflows */ }
  for (const f of files) if (CI_NAMED.test(read(join(wf, f)))) out.push(`.github/workflows/${f}`);
  if (CI_NAMED.test(read(join(ROOT, '.gitlab-ci.yml')))) out.push('.gitlab-ci.yml');
  return out;
}

// hooks: hooksStatus(ROOT) of hooks-install.mjs · gitHooks: its gitHooksStatus(ROOT), null outside a repository ·
// onPath: whether a command is on this machine (onPathOf()). Each is given, so the report reads what it is handed.
export function harnessOf(ROOT, cfg = {}, { engineDir = '<engine>', hooks = { installed: false }, gitHooks = null, onPath = () => false } = {}) {
  const off = cfg.hooks === false;
  const install = (tool) => `${CLI} --install-hooks${tool ? ` --tool ${tool}` : ''}`;
  const offFix = 'ds-config.json has "hooks": false: take it out, then run';
  const claudeHooks = hooks.installed && !hooks.partial && hooks.exists !== false;
  const hooksFix = off ? `${offFix} ${install()}` : install();

  // 1. It looks before it builds: the contracts and catalog it reads, and each request routed to its recipe.
  const contractsDir = resolve(ROOT, cfg.contracts?.out ?? 'contracts');
  const contracts = existsSync(join(contractsDir, 'catalog.json')) && existsSync(join(contractsDir, 'llms.txt'));
  const look = [
    { what: 'the contracts and the component catalog an agent reads first (contracts/llms.txt, catalog.json)', on: contracts, fix: `${CLI} (one run writes them)` },
    { what: 'each request routed to its recipe before the agent starts (the Claude Code hook)', on: claudeHooks, fix: hooksFix },
  ];

  // 2. A way to ask: the commands answer any tool with a terminal, the MCP server one without.
  const mcp = MCP_FILES.filter((f) => ENGINE_NAMED.test(read(join(ROOT, f))));
  const ask = [
    { what: `${CLI} --query and --catalog, for an agent with a terminal`, on: true },
    { what: `the MCP server, for a tool without one${mcp.length ? ` (${mcp.join(', ')})` : ''}`, on: mcp.length > 0, fix: `add to .mcp.json: { "mcpServers": { "design-system": { "command": "node", "args": [${JSON.stringify(join(engineDir, 'mcp.mjs'))}, "--project=."] } } }` },
  ];

  // 3. Every edit checked as it is made: the hooks in each agent tool the project uses, and the git hooks.
  const toolHook = (tool, file) => existsSync(join(ROOT, `.${tool}`)) ? { what: `${tool === 'cursor' ? 'Cursor' : 'Codex'}: each edit checked (${file})`, on: read(join(ROOT, file)).includes(MARK), fix: off ? `${offFix} ${install(tool)}` : install(tool) } : null;
  const git = gitHooks ? ['pre-commit', 'pre-push'].map((n) => ({ n, s: gitHooks.hooks?.[n] })) : [];
  const edits = [
    { what: 'Claude Code: each edit checked as it is made (.claude/settings.local.json)', on: claudeHooks, fix: hooks.partial ? `${install()} (installed by an earlier version: this brings it up to date)` : hooksFix },
    toolHook('cursor', '.cursor/hooks.json'),
    toolHook('codex', '.codex/hooks.json'),
    ...(gitHooks ? [{ what: 'git: a commit warns and a push stops, for what the change uses (pre-commit, pre-push)', on: git.every((g) => g.s === 'ours' || g.s === 'added'), fix: git.some((g) => g.s === 'theirs') ? `the project's own ${git.filter((g) => g.s === 'theirs').map((g) => g.n).join(' and ')}: ${install()} prints the line to add to it` : hooksFix }] : []),
  ].filter(Boolean);

  // 4. A second judge, apart from the agent that wrote the work: a model, run when asked, never on its own.
  const cmd = cfg.changeJudgment?.cmd ?? cfg.prototypeJudgment?.cmd ?? cfg.pageJudgment?.cmd ?? 'claude';
  const model = onPath(cmd);
  const judge = [
    { what: `a model to judge with (${String(cmd).split(/\s+/)[0]})`, on: model, fix: model ? null : `install it, or name your own in ds-config.json ("changeJudgment": { "cmd": "…" })` },
    { what: `a change read against the request (${CLI} --judge-change), a screen (--prototype … --judge), when you ask`, on: model, asked: true },
  ];

  // 5. A gate a person approves: the pull request's job, and the sign-off a change to the system waits for.
  const jobs = ciJobs(ROOT);
  const anyGuard = claudeHooks || edits.slice(1).some((p) => p.on && !/^git/.test(p.what));
  const gate = [
    { what: `the engine's job on each pull request${jobs.length ? ` (${jobs.join(', ')})` : ''}`, on: jobs.length > 0, fix: `add the job from Set it up in CI, GitHub's or GitLab's (${join(engineDir, 'docs', 'documentation.md')})` },
    { what: 'a change to the system held until someone else signs it off (the hook holds it)', on: anyGuard, fix: hooksFix },
  ];

  const layer = (name, runs, parts, any = false) => {
    const on = parts.filter((p) => p.on).length;
    const state = parts.every((p) => p.asked || p.on) && parts.some((p) => p.asked) ? 'when asked' : (any ? on > 0 : on === parts.length) ? 'on' : on ? 'partly' : 'off';
    // In a layer any one part holds (a way to ask), the others are a choice once one is on, never a thing missing.
    return { layer: name, runs, state, parts: any && on ? parts.map((p) => (p.on ? p : { ...p, optional: true })) : parts };
  };
  return [
    layer('Looks before it builds', 'before the agent writes anything', look),
    layer('A way to ask', 'while it works', ask, true),
    layer('Each edit checked', 'after each edit, and at each commit and push', edits),
    layer('A second judge', 'when you ask', judge),
    layer('A gate a person approves', 'before the change merges', gate),
  ];
}

const MARKS = { on: '✅', 'when asked': '🟦', partly: '⚠️ ', off: '❌' };
// One line for --doctor: how many layers are on, and where to see which.
export function harnessSummary(layers) {
  const on = layers.filter((l) => l.state === 'on' || l.state === 'when asked').length;
  // Said, never failed: the doctor checks the install, and a layer a team has not switched on yet is its choice.
  return { ok: true, what: `Agent harness: ${on} of ${layers.length} layers on${on === layers.length ? '' : ` (${CLI} --harness says which, and what turns each on)`}` };
}

export function harnessLines(layers) {
  const lines = ['Agent harness  ·  each layer that keeps an agent inside the system, in the order it runs'];
  for (const [i, l] of layers.entries()) {
    lines.push(`${MARKS[l.state]} ${i + 1}. ${l.layer} (${l.runs}): ${l.state}`);
    for (const p of l.parts) lines.push(`   ${p.on ? '·' : p.optional ? '○' : '✗'} ${p.what}${!p.on && p.fix ? `\n     ${p.optional ? 'if you want it' : 'turn it on'}: ${p.fix}` : ''}`);
  }
  const missing = layers.flatMap((l) => l.parts.filter((p) => !p.on && !p.optional && p.fix)).map((p) => p.fix);
  lines.push('', missing.length ? `NEXT: ${missing[0]}` : 'NEXT: every layer is on. Nothing to switch on.');
  return lines;
}

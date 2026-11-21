// test/skill-evals/agents.mjs - the agents a skill evaluation can run its tasks in besides Claude Code (run.mjs --agent).
//
// Each is what a person using that agent has: its own guide variant, its default model, the program and its version,
// what a run's fresh HOME needs (its login), and one turn as runClaude does it: { events, sessionId, cost, error,
// infra, limit, stderr }, with events in Claude Code's stream-json so every scorer reads them unchanged. A new agent
// is one entry here and a module of its own beside codex.mjs.
import { runCodex, codexHome, codexVersion } from './codex.mjs';
import { runCursor, cursorHome, cursorVersion } from './cursor.mjs';
import { runTerminal, terminalVersion } from './terminal.mjs';

export const OTHER_AGENTS = {
  codex: {
    variant: 'codex-skill',      // the engine's guide as a Codex skill, as install.sh puts it there
    variants: ['codex-skill', 'agents'],   // agents: the AGENTS.md section alone (--agent-rules --write)
    model: 'gpt-6-luna',
    routes: ['shell'],           // Codex reaches the engine by its shell, as docs/setup.md sets it up
    version: () => codexVersion(),
    missing: 'no `codex` on this machine: npm i -g @openai/codex, then codex login, or point DESIGN_SYSTEM_ENGINE_EVAL_CODEX at it.',
    prepare: (home) => codexHome(home),
    turn: (o) => runCodex(o),
  },
  cursor: {
    variant: 'cursor',           // AGENTS.md as for Codex, and the guard as Cursor's own hooks (--install-hooks --tool cursor)
    model: 'auto',               // what a Cursor user gets unless they pick a model
    routes: ['shell'],           // Cursor reaches the engine by its shell, as docs/setup.md sets it up
    version: () => cursorVersion(),
    missing: 'no `cursor-agent` on this machine: curl https://cursor.com/install -fsS | bash, then cursor-agent login, or point DESIGN_SYSTEM_ENGINE_EVAL_CURSOR at it.',
    prepare: (home) => cursorHome(home),
    turn: (o) => runCursor(o),
  },
  terminal: {
    variant: 'terminal',         // no guide and no model: the engine's command and the person's own words (terminal-session.mjs)
    model: 'none',
    routes: ['shell'],
    version: () => terminalVersion(),
    missing: null,               // the engine itself is all it needs
    prepare: () => {},
    turn: (o) => runTerminal(o),
  },
};
export const AGENT_NAMES = ['claude', ...Object.keys(OTHER_AGENTS)];

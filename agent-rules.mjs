// agent-rules.mjs - the engine's rules for an agent that has no hooks. In Claude Code the hooks route each
// request, check each UI edit and keep the never-rules; Cursor, Copilot, Codex and other agents read only their own
// instruction file. So the engine writes a short section into it, once the person says yes: before UI work, ask the
// engine for the component's contract; use only the system's tokens and components; run the edit check before
// committing; and what an agent never does on its own. The section sits between two markers, so writing it again
// replaces it and nothing else in the file changes.
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';

export const START = '<!-- rms-design-system-engine:start -->';
export const END = '<!-- rms-design-system-engine:end -->';
// The instruction files agents read, in the order they are offered. AGENTS.md is read by most of them.
export const RULE_FILES = ['AGENTS.md', 'CLAUDE.md', '.cursorrules', '.github/copilot-instructions.md', '.windsurfrules'];
const CURSOR_RULES = '.cursor/rules/design-system.mdc';

export function rulesSection() {
  return [
    START,
    '## Design system (rms-design-system-engine)',
    '',
    'The UI in this project follows its design system, which rms-design-system-engine checks against Figma.',
    '',
    '- Before UI work on a component, ask for its contract: `rms-design-system-engine --query <component>` (its props, tokens, states, where it lives and what it is for). Ask the same for a token you are unsure of.',
    '- Use only the design system\'s components and tokens: no colour, size, radius, shadow or font written by hand, and no look-alike of a component the system has. When nothing fits, ask the person.',
    '- Before committing a UI change, run `rms-design-system-engine --edit-check` and fix everything it reports.',
    '- Never on your own: edit the Figma snapshots or `ds-config.json` by hand, accept a difference as debt (`--baseline`), mark a check as done, write to Figma, or ask for a token in the chat (a token goes in `.env`, set by the person).',
    END,
  ].join('\n');
}

// The instruction files this project already has (Cursor's rules folder as one more), else AGENTS.md.
export function ruleTargets(root) {
  const found = RULE_FILES.filter((f) => existsSync(join(root, f)));
  try { if (statSync(join(root, '.cursor', 'rules')).isDirectory()) found.push(CURSOR_RULES); } catch { /* no Cursor rules folder */ }
  return found.length ? found : ['AGENTS.md'];
}
// Agents other than Claude Code set up here: what makes the section worth offering after setup.
export const otherAgents = (root) => ['AGENTS.md', '.cursorrules', '.github/copilot-instructions.md', '.windsurfrules', '.cursor'].filter((f) => existsSync(join(root, f)));

// Write the section into one file: added at its end, or put in place of the one already there.
// → { file, done: 'added' | 'updated' | 'unchanged' }
export function writeRules(root, file) {
  const path = join(root, file);
  const section = rulesSection();
  const cursor = file.endsWith('.mdc');
  let text = existsSync(path) ? readFileSync(path, 'utf8') : (cursor ? '---\ndescription: The design system rules rms-design-system-engine checks\nalwaysApply: true\n---\n' : '');
  const a = text.indexOf(START), b = text.indexOf(END);
  let next, done;
  if (a >= 0 && b > a) { next = text.slice(0, a) + section + text.slice(b + END.length); done = next === text ? 'unchanged' : 'updated'; }
  else { next = `${text}${text && !text.endsWith('\n') ? '\n' : ''}${text ? '\n' : ''}${section}\n`; done = 'added'; }
  if (done !== 'unchanged') { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, next); }
  return { file, done };
}

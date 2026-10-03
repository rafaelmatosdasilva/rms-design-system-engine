// test/skill-evals/variants.mjs - how each guide variant is installed in an evaluation HOME (idea I55).
// Every variant runs on the same engine (this checkout); only what the agent loads as its instructions
// differs.
//   baseline  the guide as one file, from a git ref (default: the guide-monolith tag, else HEAD)
//   cookbook  the guide in this checkout (main file + cookbook/ + reference/, read with --recipe/--reference)
//   skill     the same content as a native Claude Code Skill (SKILL.md built from the main file), its recipes
//             and reference as files beside it
//   bare      a few lines that hand every request to the engine's router (idea I61): how much guide is still needed
//   mcp       no skill and no engine at all: Claude with only what the Figma MCP returned (the build evaluation's
//             baseline). The request goes in as written, with no command in front of it.
import { mkdirSync, writeFileSync, readFileSync, readdirSync, symlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { ENGINE } from './lib.mjs';
import { skillMd, guideAtRef } from '../../skill-files.mjs';

const GUIDE = 'rms-design-system-engine.md';
const git = (...a) => execFileSync('git', a, { cwd: ENGINE, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

// I61: the whole guide as the engine's router and nothing else.
export const BARE = `# /rms-design-system-engine - the engine of a design system

Checks that the code matches the team's Figma design system.

Run the engine's router with the request exactly as the person wrote it, then do what it prints:

    rms-design-system-engine --route "<the request>"

Not on PATH: \`node ~/.claude/skills/rms-design-system-engine/audit.mjs --route "<the request>"\`.
If the request already came with a ROUTE block, follow that block instead. Report in the chat.
`;

// The guide at a ref, under the name the skill had then, read as the current one.
export function guideAt(ref) {
  const text = guideAtRef(ENGINE, ref);
  if (text == null) throw new Error(`no guide at ${ref}`);
  return text;
}
export function defaultBaselineRef() { try { git('rev-parse', '--verify', '-q', 'guide-monolith'); return 'guide-monolith'; } catch { return 'HEAD'; } }

export function variant(name, { ref = defaultBaselineRef() } = {}) {
  if (name === 'baseline') {
    const text = guideAt(ref);
    return { name, ref, text, install: (home) => { mkdirSync(join(home, '.claude', 'commands'), { recursive: true }); writeFileSync(join(home, '.claude', 'commands', GUIDE), text); } };
  }
  if (name === 'cookbook') {
    const text = readFileSync(join(ENGINE, GUIDE), 'utf8');
    return { name, ref: 'working tree', text, install: (home) => { mkdirSync(join(home, '.claude', 'commands'), { recursive: true }); writeFileSync(join(home, '.claude', 'commands', GUIDE), text); } };
  }
  if (name === 'skill') {
    // The skill folder is where install.sh puts the engine: every engine file is linked into it, so
    // "node <install-dir>/audit.mjs" and the recipes' paths work, and SKILL.md is the only file of its own.
    const text = skillMd(readFileSync(join(ENGINE, GUIDE), 'utf8'));
    return { name, ref: 'working tree', text, install: (home) => {
      const dir = join(home, '.claude', 'skills', 'rms-design-system-engine');
      mkdirSync(dir, { recursive: true });
      for (const f of readdirSync(ENGINE)) if (!['.git', 'test', GUIDE, 'SKILL.md'].includes(f)) symlinkSync(join(ENGINE, f), join(dir, f));
      writeFileSync(join(dir, 'SKILL.md'), text);
    } };
  }
  if (name === 'bare') {
    const text = BARE;
    return { name, ref: 'built in', text, install: (home) => { mkdirSync(join(home, '.claude', 'commands'), { recursive: true }); writeFileSync(join(home, '.claude', 'commands', GUIDE), text); } };
  }
  if (name === 'mcp') return { name, ref: 'none', text: '', engine: false, prefix: '', install: () => {} };
  throw new Error(`unknown variant ${name}`);
}

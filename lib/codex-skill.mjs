// codex-skill.mjs - the engine's guide as a Codex skill, so Codex reads the same guide Claude Code does.
//
// Claude Code reads the guide as a command (~/.claude/commands, linked to this checkout's file, so an update reaches
// it at once). Codex reads skills from $CODEX_HOME/skills/<name>/SKILL.md, in the same format with a header naming
// the skill (lib/skill-files.mjs skillMd). A header cannot be linked, so the skill is written as a copy, and kept
// current here: the installer writes it, and every engine run writes it again when the guide changed since. A person
// asks for it as they ask Claude Code, with the skill's name first: $rms-design-system-engine <the request>.
//
// Only where Codex is set up on this computer (its folder exists), and only a skill the engine wrote (its marker):
// a folder of the person's own under that name is never replaced.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { skillMd } from './skill-files.mjs';
import { envVar } from './names.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
export const SKILL_NAME = 'rms-design-system-engine';
const MARK = '<!-- written by rms-design-system-engine: lib/codex-skill.mjs -->';

export const codexHomeOf = (env = process.env) => env.CODEX_HOME || join(env.HOME || homedir(), '.codex');

// The SKILL.md for this engine's guide. → text
export function codexSkillText(engineDir = ENGINE) {
  const guide = readFileSync(join(engineDir, 'rms-design-system-engine.md'), 'utf8');
  return skillMd(`${MARK}\n${guide}`);
}

// Write the skill when Codex is here and the copy is missing or stale. → { file, done: 'written' | 'current' | 'no-codex' | 'theirs' }
export function syncCodexSkill({ engineDir = ENGINE, env = process.env } = {}) {
  // Off where a run must keep the guide it was given (the evaluation's AGENTS.md-only side).
  if (envVar(env, 'NO_CODEX_SKILL') === '1') return { file: null, done: 'off' };
  // And under the test suite, whose runs of the engine must never write into the person's own Codex.
  if (env.NODE_TEST_CONTEXT) return { file: null, done: 'off' };
  const home = codexHomeOf(env);
  if (!existsSync(home)) return { file: null, done: 'no-codex' };
  const file = join(home, 'skills', SKILL_NAME, 'SKILL.md');
  const text = codexSkillText(engineDir);
  let now = null;
  try { now = readFileSync(file, 'utf8'); } catch { /* not written yet */ }
  if (now != null && !now.includes(MARK)) return { file, done: 'theirs' };
  if (now === text) return { file, done: 'current' };
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
  return { file, done: 'written' };
}

if (process.argv[1] && process.argv[1].endsWith('codex-skill.mjs')) {
  const r = syncCodexSkill();
  if (r.done === 'written') console.log(`✅ Codex: the engine's guide is a skill at ${r.file}. Ask for it as $rms-design-system-engine <your request>.`);
  else if (r.done === 'current') console.log(`✅ Codex: the skill at ${r.file} is current.`);
  else if (r.done === 'theirs') console.log(`⚠️  Codex: ${r.file} is not the engine's, so it was left as it is.`);
}

// test/skill-evals/variants.mjs - how each guide variant is installed in an evaluation HOME (idea I55).
// Every variant runs on the same engine (this checkout); only what the agent loads as its instructions
// differs.
//   baseline  the guide as one file, from a git ref (default: the guide-monolith tag, else HEAD)
//   cookbook  the guide in this checkout (main file + cookbook/ + reference/, read with --recipe/--reference)
//   skill     the same content as a native Claude Code Skill (SKILL.md), its recipes and reference as files
import { mkdirSync, writeFileSync, readFileSync, cpSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { ENGINE } from './lib.mjs';

const GUIDE = 'rms-figma-code-parity.md';
const git = (...a) => execFileSync('git', a, { cwd: ENGINE, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

export function guideAt(ref) { return git('show', `${ref}:${GUIDE}`); }
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
    const skill = join(ENGINE, 'skill', 'SKILL.md');
    if (!existsSync(skill)) throw new Error('skill/SKILL.md is not in this checkout yet');
    const text = readFileSync(skill, 'utf8');
    return { name, ref: 'working tree', text, install: (home) => {
      const dir = join(home, '.claude', 'skills', 'rms-figma-code-parity');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'SKILL.md'), text);
      for (const sub of ['cookbook', 'reference']) if (existsSync(join(ENGINE, sub))) cpSync(join(ENGINE, sub), join(dir, sub), { recursive: true });
    } };
  }
  throw new Error(`unknown variant ${name}`);
}

// The engine's guide as a Codex skill (lib/codex-skill.mjs): the same guide Claude Code reads, written where Codex reads
// skills, kept current as the guide changes, and never over a folder of the person's own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tempDir } from './helpers.mjs';
import { syncCodexSkill, codexSkillText, SKILL_NAME } from '../lib/codex-skill.mjs';

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const guide = readFileSync(join(ENGINE, 'rms-design-system-engine.md'), 'utf8');

test('the skill is the whole guide, with the header Codex reads a skill by', () => {
  const text = codexSkillText(ENGINE);
  assert.match(text, /^---\nname: rms-design-system-engine\ndescription: /);
  assert.ok(text.includes(guide), 'the guide Claude Code reads, word for word');
});

test('written where Codex is set up, then current, and written again when the guide changed', () => {
  const codex = tempDir('codex-skill-');
  const env = { CODEX_HOME: codex };
  const r = syncCodexSkill({ engineDir: ENGINE, env });
  assert.equal(r.done, 'written');
  assert.equal(r.file, join(codex, 'skills', SKILL_NAME, 'SKILL.md'));
  assert.equal(syncCodexSkill({ engineDir: ENGINE, env }).done, 'current');
  writeFileSync(r.file, readFileSync(r.file, 'utf8').replace('# /rms-design-system-engine', '# an older guide'));
  assert.equal(syncCodexSkill({ engineDir: ENGINE, env }).done, 'written', 'a stale copy is replaced');
  assert.equal(readFileSync(r.file, 'utf8'), codexSkillText(ENGINE));
});

test('nothing where Codex is not set up, nothing over a skill of the person\'s own, nothing when turned off', () => {
  assert.equal(syncCodexSkill({ engineDir: ENGINE, env: { CODEX_HOME: join(tempDir('no-codex-'), 'absent') } }).done, 'no-codex');
  const codex = tempDir('codex-theirs-');
  const theirs = join(codex, 'skills', SKILL_NAME, 'SKILL.md');
  mkdirSync(dirname(theirs), { recursive: true });
  writeFileSync(theirs, '---\nname: rms-design-system-engine\ndescription: mine\n---\n');
  assert.equal(syncCodexSkill({ engineDir: ENGINE, env: { CODEX_HOME: codex } }).done, 'theirs');
  assert.match(readFileSync(theirs, 'utf8'), /description: mine/, 'left as it was');
  const off = tempDir('codex-off-');
  assert.equal(syncCodexSkill({ engineDir: ENGINE, env: { CODEX_HOME: off, DESIGN_SYSTEM_ENGINE_NO_CODEX_SKILL: '1' } }).done, 'off');
  assert.equal(syncCodexSkill({ engineDir: ENGINE, env: { CODEX_HOME: off, NODE_TEST_CONTEXT: 'child-v8' } }).done, 'off', 'the suite never writes the person\'s Codex');
  assert.equal(existsSync(join(off, 'skills')), false);
});

test('the installer writes it, and every engine run keeps it current', () => {
  assert.match(readFileSync(join(ENGINE, 'install.sh'), 'utf8'), /node "\$CLONE_DIR\/lib\/codex-skill\.mjs"/);
  assert.match(readFileSync(join(ENGINE, 'lib', 'audit.mjs'), 'utf8'), /import\('\.\/codex-skill\.mjs'\)\)\.syncCodexSkill\(\)/);
});

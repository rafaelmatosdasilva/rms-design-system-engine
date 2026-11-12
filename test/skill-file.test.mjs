// The engine's own skill files checked the way a published skill linter checks a skill: the name and the description
// within their limits, only the frontmatter fields a skill may carry, a body within its limit, and no file of the guide
// that nothing names. Both skill files the engine writes are held to it: the native skill built from the main file
// (skill-files.mjs skillMd) and the command each team's setup installs (profile.mjs commandSkill).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { skillMd, GUIDE } from '../lib/skill-files.mjs';
import { commandSkill } from '../lib/profile.mjs';

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIELDS = new Set(['name', 'description', 'license', 'allowed-tools', 'metadata', 'compatibility']);
const BODY_LINES = 500;

function frontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  assert.ok(m, 'a skill file opens with its frontmatter');
  const fields = {};
  for (const line of m[1].split('\n')) { const f = /^([\w-]+):\s*(.*)$/.exec(line); if (f) fields[f[1]] = f[2].replace(/^"([\s\S]*)"$/, (x, y) => JSON.parse(`"${y}"`)); }
  return { fields, body: m[2] };
}
function checkSkill(text, what) {
  const { fields, body } = frontmatter(text);
  for (const k of Object.keys(fields)) assert.ok(FIELDS.has(k), `${what}: "${k}" is no field a skill may carry`);
  assert.match(fields.name ?? '', /^[a-z0-9]+(-[a-z0-9]+)*$/, `${what}: its name is lower case words joined by hyphens`);
  assert.ok(fields.name.length <= 64, `${what}: its name is 64 characters at most`);
  assert.ok(fields.description && fields.description.length <= 1024, `${what}: its description is there, 1,024 characters at most (${fields.description?.length})`);
  assert.ok(!/[<>]/.test(fields.description), `${what}: its description holds no angle bracket`);
  assert.ok(body.split('\n').length <= BODY_LINES, `${what}: its body is ${BODY_LINES} lines at most (${body.split('\n').length})`);
}

test('the native skill built from the main file is a valid skill', () => {
  checkSkill(skillMd(readFileSync(join(ENGINE, GUIDE), 'utf8')), 'SKILL.md');
});

test('the command a team\'s setup installs is a valid skill', () => {
  checkSkill(commandSkill('acme', 'https://example.com/acme/profile.json', { name: 'Acme' }), 'the setup command');
});

test('every file of the guide is named somewhere: a reference by --reference, a recipe in the main file\'s index', () => {
  const guide = [GUIDE, ...readdirSync(join(ENGINE, 'cookbook')).map((f) => `cookbook/${f}`), ...readdirSync(join(ENGINE, 'reference')).map((f) => `reference/${f}`)];
  const all = guide.map((f) => readFileSync(join(ENGINE, f), 'utf8')).join('\n');
  for (const f of readdirSync(join(ENGINE, 'reference')).filter((x) => x.endsWith('.md'))) {
    const name = f.replace(/\.md$/, '');
    assert.ok(new RegExp(`--reference ${name}\\b|reference/${name}\\.md`).test(all), `reference/${f}: nothing in the guide names it`);
  }
  for (const f of readdirSync(join(ENGINE, 'cookbook')).filter((x) => x.endsWith('.md'))) {
    const name = f.replace(/\.md$/, '');
    assert.ok(new RegExp(`--recipe ${name}\\b|cookbook/${name}\\.md|\\b${name}\\b`).test(readFileSync(join(ENGINE, GUIDE), 'utf8')), `cookbook/${f}: the main file does not name it`);
  }
});

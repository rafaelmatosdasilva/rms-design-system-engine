// A token an edit invents is a value the system does not have, even when it is declared in the theme. Found by the guide
// evaluation: asked for a green the system lacks, an agent declared --success-background: #4caf50 in the theme and the
// edit check, which skips the theme's own declarations, let it through.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { editCheck } from '../edit-check.mjs';
import { fixtureProject } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const demo = () => fixtureProject(join(ENGINE, 'test', 'fixtures', 'demo-ds'), 'newtok-');
const cfgOf = (dir) => JSON.parse(readFileSync(join(dir, 'ds-config.json'), 'utf8'));
const edit = (dir, file, oldS, newS) => {
  const head = readFileSync(join(dir, file), 'utf8');
  return editCheck({ tool_name: 'Edit', tool_input: { file_path: join(dir, file), old_string: oldS, new_string: newS } }, { root: dir, cfg: cfgOf(dir), headOf: () => head });
};

test('a new token with a value of its own, in the theme, is a value the system does not have', () => {
  const dir = demo();
  const r = edit(dir, 'src/theme.css', ':root {', ':root {\n  --success-background: #4caf50;');
  assert.match(r ?? '', /--success-background is a new token Figma has no variable for/);
});

test('changing a token the theme has, or a new one that points at the system\'s tokens, is not flagged as new', () => {
  const dir = demo();
  const theme = readFileSync(join(dir, 'src/theme.css'), 'utf8');
  const decl = /(--radii-chip)\s*:\s*([^;]+);/.exec(theme);
  assert.ok(decl, 'the demo theme declares --radii-chip');
  assert.doesNotMatch(edit(dir, 'src/theme.css', decl[0], `${decl[1]}: 16px;`) ?? '', /new token/);
  assert.doesNotMatch(edit(dir, 'src/theme.css', ':root {', ':root {\n  --chip-surface: var(--chip-background);') ?? '', /new token/);
});

test('a Figma variable declared for the first time (tokens copied from Figma) is not new', () => {
  const dir = demo();
  const theme = readFileSync(join(dir, 'src/theme.css'), 'utf8');
  const decl = /(--button-background)\s*:\s*([^;]+);/.exec(theme);
  const without = theme.replace(decl[0], '');
  const head = without;
  const r = editCheck({ tool_name: 'Edit', tool_input: { file_path: join(dir, 'src/theme.css'), old_string: ':root {', new_string: `:root {\n  ${decl[0]}` } },
    { root: dir, cfg: cfgOf(dir), headOf: () => head });
  assert.doesNotMatch(r ?? '', /new token/);
});

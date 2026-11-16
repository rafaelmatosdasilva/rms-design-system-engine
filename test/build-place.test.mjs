// A style guide is built from the design system's own project, never inside one of the team's stores (build-place.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { storeHere, guideHere } from '../lib/build-place.mjs';
import { START, END } from '../lib/readmes.mjs';
import { tempDir } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const folder = (readme) => { const d = tempDir('build-place-'); if (readme != null) writeFileSync(join(d, 'README.md'), readme); return d; };
// A store's README as the engine writes it: the team's own words, then the engine's section between its markers.
const STORE = ['# Acme intent layer', '', 'What the team wrote.', '', START, '## What rms-design-system-engine keeps here', '',
  '| What | Where | Written by |', '|---|---|---|', '| The written knowledge of the system: what each component is for | this repository | the team |', '',
  '### Who can do what', '', '| Role on this project | What it lets them do |', '|---|---|', '| Reporter | Read it |', '| Developer | Send the intent layer here |', '', END, ''].join('\n');

test('a store is known by the engine\'s own section in its README, and what it keeps is read from its first table', () => {
  const s = storeHere(folder(STORE));
  assert.deepEqual(s, { parts: ['The written knowledge of the system: what each component is for'] }, 'what it keeps, never who can do what');
  assert.equal(storeHere(folder('# Acme design system\n\nThe team\'s own README, with no section of the engine\'s.\n')), null);
  assert.equal(storeHere(folder(null)), null, 'no README: a project like any other');
});

test('a style guide is never built in a store: it says what the folder is and where the guide is built', () => {
  const r = guideHere(folder(STORE), ['node', 'audit.mjs', '--styleguide'], {});
  assert.equal(r.stop, true);
  const said = r.lines.join('\n');
  assert.match(said, /not a design system project/);
  assert.match(said, /written knowledge of the system/, 'what this store keeps, in its own words');
  assert.match(said, /--publish-styleguide/, 'where the guide is built and sent');
  assert.match(said, /--here/, 'and how a person who means it builds it here anyway');
  assert.ok(!/;/.test(said), 'two sentences, never a ";"');
});

test('a person who says --here, a pipeline, and a project that is no store are never held', () => {
  const store = folder(STORE);
  assert.equal(guideHere(store, ['node', 'audit.mjs', '--styleguide', '--here'], {}).stop, false, 'the person said so');
  assert.equal(guideHere(store, ['node', 'audit.mjs', '--styleguide'], { CI: 'true' }).stop, false, 'a store whose own pipeline builds the guide');
  assert.equal(guideHere(folder('# Acme design system\n'), ['node', 'audit.mjs', '--styleguide'], {}).stop, false);
});

test('the build itself stops in a store, before it reads or writes anything', () => {
  const store = folder(STORE);
  writeFileSync(join(store, 'ds-config.json'), JSON.stringify({ name: 'Acme DS' }));
  const env = { ...process.env, NO_COLOR: '1' }; delete env.CI;
  const r = spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--styleguide', '--quick'], { cwd: store, encoding: 'utf8', env, timeout: 60000 });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /Not built here: this folder is one of the team's stores/);
});

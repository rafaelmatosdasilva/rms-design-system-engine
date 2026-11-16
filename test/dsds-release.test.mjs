// Each new DSDS release found and tried before the pin moves (dsds-release.mjs). Nothing here reaches the network:
// the GitHub answers are given.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from './helpers.mjs';
import { newestTag, mayBreak, compareVersions, check, movePin, goldenReports, exampleName, emit, SAMPLE, fixtureDir } from '../lib/dsds-release.mjs';
import { DSDS_VERSION } from '../lib/contract-dsds.mjs';

test('the newest plain release among the tags, never a candidate', () => {
  assert.equal(newestTag([{ name: 'v0.9.0' }, { name: 'v0.23.1' }, { name: 'v0.23.0' }, { name: 'v1.0.0-rc.1' }, { name: 'docs' }]), '0.23.1');
  assert.equal(newestTag([]), null);
  assert.ok(compareVersions('0.24.0', '0.23.9') > 0);
});

test('before 1.0 a minor release may break, a patch may not; after 1.0 only a major', () => {
  assert.equal(mayBreak('0.23.1', '0.23.2'), false);
  assert.equal(mayBreak('0.23.1', '0.24.0'), true);
  assert.equal(mayBreak('1.2.0', '1.3.0'), false);
  assert.equal(mayBreak('1.2.0', '2.0.0'), true);
});

test('check compares the newest tag with the pin', async () => {
  const answer = (tags) => async () => ({ ok: true, json: async () => tags });
  assert.deepEqual(await check({ fetchImpl: answer([{ name: `v${DSDS_VERSION}` }]) }), { current: DSDS_VERSION, latest: DSDS_VERSION, newer: false, mayBreak: false });
  const r = await check({ fetchImpl: answer([{ name: 'v0.24.0' }]), current: '0.23.1' });
  assert.deepEqual(r, { current: '0.23.1', latest: '0.24.0', newer: true, mayBreak: true });
  await assert.rejects(check({ fetchImpl: async () => ({ ok: false, status: 403 }) }), /403/, 'a refused request says so, never "nothing new"');
});

test('the pin moves in its one line, and in the golden reports\' line that names it, nowhere else', () => {
  const dir = tempDir('dsds-pin-');
  const f = join(dir, 'view.mjs'), g = join(dir, 'expected-report.txt');
  writeFileSync(f, "// DSDS_VERSION is the pin\nexport const DSDS_VERSION = '0.23.1';\nconst x = '0.23.1';\n");
  writeFileSync(g, 'ℹ️  DSDS view → contracts/dsds: the 4 contracts in DSDS 0.23.1, for a team.\nversion 0.23.1 elsewhere\n');
  assert.equal(movePin('0.24.0', { file: f, goldens: [g] }), '0.23.1');
  assert.equal(readFileSync(f, 'utf8'), "// DSDS_VERSION is the pin\nexport const DSDS_VERSION = '0.24.0';\nconst x = '0.23.1';\n");
  assert.equal(readFileSync(g, 'utf8'), 'ℹ️  DSDS view → contracts/dsds: the 4 contracts in DSDS 0.24.0, for a team.\nversion 0.23.1 elsewhere\n');
  writeFileSync(f, 'nothing');
  assert.throws(() => movePin('0.24.0', { file: f, goldens: [] }), /no DSDS_VERSION line/);
});

test('the golden reports it keeps in step are the demo systems\' own, each naming the pinned version', () => {
  const gs = goldenReports();
  assert.ok(gs.length >= 3);
  assert.ok(gs.some((g) => readFileSync(g, 'utf8').includes(`contracts in DSDS ${DSDS_VERSION},`)), 'a golden that names the pin');
});

test('an example is named for its path, one flat folder', () => {
  assert.equal(exampleName('examples/entries/button.yaml'), 'examples_entries_button.json');
});

test('the sample the reference validator reads: every part of the view, and the files it points at', () => {
  const root = tempDir('dsds-emit-');
  const out = join(root, 'dsds');
  const rels = emit(out);
  assert.equal(rels[0], 'system.dsds.json');
  assert.equal(rels.length, SAMPLE.length + 1);
  for (const r of rels) assert.ok(existsSync(join(out, r)), r);
  for (const { file } of SAMPLE) assert.ok(existsSync(join(root, file)), `${file}, which a spec points at`);
  const button = JSON.parse(readFileSync(join(out, 'components', 'button.dsds.json'), 'utf8')).entries[0];
  assert.ok(button.traits.length >= 3 && button.sections && button.refs && button.uses, 'the sample exercises traits, guidance, links and composition');
  const old = JSON.parse(readFileSync(join(out, 'components', 'link-button.dsds.json'), 'utf8')).entries[0];
  assert.equal(old.metadata.status.status, 'deprecated');
  assert.ok(readdirSync(out).length >= 2);
});

test('a layer written in another DSDS version is read as it is, and the person told which way it differs', async () => {
  const { versionNote } = await import('../lib/doc-source-dsds.mjs');
  assert.equal(versionNote('0.23.1', '0.23.1'), null);
  assert.equal(versionNote(null, '0.23.1'), null, 'a layer that says no version is not asked to');
  assert.match(versionNote('0.22.0', '0.23.1'), /written in DSDS 0\.22\.0\. The engine reads it as it is, and writes its own view in DSDS 0\.23\.1/);
  assert.match(versionNote('0.24.0', '0.23.1'), /newer than the 0\.23\.1 .* never guessed/);
  assert.match(versionNote('draft', '0.23.1'), /not a version/);
  assert.doesNotMatch(versionNote('0.24.0', '0.23.1'), /;/, 'two sentences, never a semicolon');
});

test('a DSDS test with nothing fetched fails and says the command, never skips', () => {
  assert.throws(() => fixtureDir('0.23.1', { into: tempDir('dsds-none-') }), /not fetched: run node lib\/dsds-release\.mjs fetch/);
});

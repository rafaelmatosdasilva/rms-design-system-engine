// P4: every output says what it was built from (the code commit, the Figma version, the engine), and an older run
// never overwrites one built from newer inputs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, cpSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildStamp, compareStamps, mayWrite, stampOf, stampMeta, stampLine } from '../stamp.mjs';
import { generateContracts } from '../contract-gen.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const git = (cwd, ...a) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd, encoding: 'utf8' }).stdout.trim();
function repo() {
  const d = mkdtempSync(join(tmpdir(), 'stamp-'));
  git(d, 'init', '-q');
  writeFileSync(join(d, 'a.txt'), '1'); git(d, 'add', '-A'); git(d, 'commit', '-qm', 'one');
  const one = git(d, 'rev-parse', 'HEAD');
  writeFileSync(join(d, 'a.txt'), '2'); git(d, 'commit', '-qam', 'two');
  return { d, one, two: git(d, 'rev-parse', 'HEAD') };
}

test('P4: a stamp holds the code commit, the Figma version or when Figma was read, and the engine', () => {
  const { d, two } = repo();
  const s = buildStamp(d, { vars: { _figmaVersion: '2210', _updated: '2026-10-01T00:00:00Z' }, at: '2026-10-13T00:00:00Z' });
  assert.equal(s.code, two);
  assert.equal(s.dirty, undefined);
  assert.equal(s.figma, '2210');
  assert.equal(s.figmaRead, '2026-10-01T00:00:00Z');
  assert.match(s.engine ?? '', /^[0-9a-f]{40}$/);
  appendFileSync(join(d, 'a.txt'), 'x');
  assert.equal(buildStamp(d).dirty, true, 'changes not committed yet are said');
  assert.match(stampLine(s), /^Built from code [0-9a-f]{7}, Figma version 2210, engine [0-9a-f]{7}$/);
  assert.equal(stampOf(join(d, 'none.json')), null);
});

test('P4: a run is older when an input is older and none is newer; inputs that cannot be ordered never block', () => {
  const { d, one, two } = repo();
  const at = (code, figma, figmaRead) => ({ code, figma, figmaRead, engine: null });
  const cmp = (prev, next) => compareStamps(prev, next, { ROOT: d });
  assert.equal(cmp(at(two), at(one)).older, true, 'an older commit');
  assert.match(cmp(at(two), at(one)).why[0], /^code [0-9a-f]{7} is older than the code [0-9a-f]{7} it was built from$/);
  assert.equal(cmp(at(one), at(two)).older, false, 'a newer commit');
  assert.equal(cmp(at(two), at(two)).older, false, 'the same inputs');
  assert.equal(cmp(at(two, '300'), at(two, '120')).older, true, 'an older Figma version');
  assert.equal(cmp(at(one, '120'), at(two, '300')).older, false);
  assert.equal(cmp(at(two, '120'), at(one, '300')).older, false, 'older code but newer Figma: not older');
  assert.equal(cmp(at(two, null, '2026-10-02'), at(two, null, '2026-10-01')).older, true, 'Figma read earlier');
  // Two branches cannot be ordered: either may write.
  git(d, 'checkout', '-q', '-b', 'side', one); writeFileSync(join(d, 'b.txt'), 'b'); git(d, 'add', '-A'); git(d, 'commit', '-qm', 'side');
  assert.equal(cmp(at(two), at(git(d, 'rev-parse', 'HEAD'))).older, false);
});

test('P4: an older run keeps the newer output and says why; --force replaces it; the style guide carries its stamp', () => {
  const { d, one, two } = repo();
  const file = join(d, 'out.json');
  writeFileSync(file, JSON.stringify({ _built: { code: two, figma: null, engine: null } }));
  const r = mayWrite(file, { code: one, figma: null, engine: null }, { ROOT: d, label: 'out.json', force: false });
  assert.equal(r.ok, false);
  assert.match(r.line, /^Kept out\.json: it was built from newer inputs than this run \(code [0-9a-f]{7} is older than the code [0-9a-f]{7} it was built from\)\. Run from the newer checkout, or add --force to replace it\.$/);
  assert.equal(mayWrite(file, { code: one }, { ROOT: d, force: true }).ok, true);
  const html = join(d, 'index.html');
  writeFileSync(html, `<html><head>\n${stampMeta({ code: two, figma: '9', engine: null, at: 'x' })}</head></html>`);
  assert.deepEqual(stampOf(html), { code: two, figma: '9', engine: null, at: 'x' });
  assert.equal(mayWrite(html, { code: one, figma: '9' }, { ROOT: d, force: false }).ok, false);
});

test('P4: contracts built from an older commit never replace those built from a newer one', async () => {
  const d = mkdtempSync(join(tmpdir(), 'stamp-contracts-'));
  cpSync(join(ENGINE, 'test', 'fixtures', 'demo-ds'), d, { recursive: true });
  git(d, 'init', '-q'); git(d, 'add', '-A'); git(d, 'commit', '-qm', 'one');
  const cfg = JSON.parse(readFileSync(join(d, 'ds-config.json'), 'utf8'));
  appendFileSync(join(d, 'README.md'), '\nmore\n'); git(d, 'add', '-A'); git(d, 'commit', '-qm', 'two');
  const r = await generateContracts(d, cfg, { force: false });
  assert.ok(!r.kept, 'the newest commit writes');
  const built = JSON.parse(readFileSync(join(r.outDir, 'built.json'), 'utf8'))._built;
  assert.equal(built.code, git(d, 'rev-parse', 'HEAD'));
  git(d, 'checkout', '-q', 'HEAD~1');
  const old = await generateContracts(d, cfg, { force: false });
  assert.match(old.kept ?? '', /^Kept contracts: it was built from newer inputs than this run/);
  assert.equal(JSON.parse(readFileSync(join(r.outDir, 'built.json'), 'utf8'))._built.code, built.code, 'left as it was');
  const forced = await generateContracts(d, cfg, { force: true });
  assert.ok(!forced.kept);
});

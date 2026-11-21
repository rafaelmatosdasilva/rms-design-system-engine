// A copy of the system held to its release, further: a change made in the copy that a later release already has is
// said as such, the patch that brings the copy to its release is handed back, and a second run reads again only what
// changed. Harbor (fictional) at three releases, with a product that copied the first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, writeFileSync, readFileSync, mkdirSync, appendFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tempDir } from './helpers.mjs';
import { copyCheck, copyLines } from '../lib/system-copy.mjs';

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const git = (cwd, ...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...a], { cwd, encoding: 'utf8' }).trim();
const write = (f, t) => { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, t); };

function setUp() {
  const root = tempDir('system-copy-'), ds = join(root, 'ds'), shop = join(root, 'shop');
  cpSync(join(ENGINE, 'test', 'fixtures', 'harbor-ds'), ds, { recursive: true, filter: (p) => !/expected-report/.test(p) });
  git(ds, 'init', '-q'); git(ds, 'add', '-A'); git(ds, 'commit', '-qm', 'v1'); git(ds, 'tag', 'v1.0.0');
  appendFileSync(join(ds, 'components', 'HbBadge.vue'), '<!-- 1.1 -->\n');
  git(ds, 'commit', '-qam', 'v1.1'); git(ds, 'tag', 'v1.1.0');
  // The next release fixes the icon button's name, as a product will have done in its copy.
  const icon = join(ds, 'components', 'HbIconButton.vue');
  writeFileSync(icon, readFileSync(icon, 'utf8').replace('<button', '<button aria-label="Action"'));
  git(ds, 'commit', '-qam', 'v1.2'); git(ds, 'tag', 'v1.2.0');
  git(ds, 'checkout', '-q', 'v1.1.0');
  for (const f of ['HbBadge.vue', 'HbButton.vue', 'HbIconButton.vue']) write(join(shop, 'library', f), git(ds, 'show', `v1.0.0:components/${f}`) + '\n');
  git(shop, 'init', '-q'); git(shop, 'add', '-A'); git(shop, 'commit', '-qm', 'copied v1.0.0');
  return { ds, shop };
}

test('a fix made in the copy that a later release already has is that release, not a request', () => {
  const { ds, shop } = setUp();
  // The product fixes the icon button the way v1.2.0 later did, and changes the button its own way.
  write(join(shop, 'library', 'HbIconButton.vue'), git(ds, 'show', 'v1.2.0:components/HbIconButton.vue') + '\n');
  const btn = join(shop, 'library', 'HbButton.vue');
  writeFileSync(btn, readFileSync(btn, 'utf8').replace('type="button"', 'type="button" data-local'));
  git(shop, 'commit', '-qam', 'local fixes');
  const r = copyCheck(ds, { dir: '../shop/library', from: 'components', release: 'v1.1.0' }, { cache: false });
  const state = Object.fromEntries(r.files.map((f) => [f.rel, f.state]));
  assert.equal(state['HbIconButton.vue'], 'in a later release');
  assert.equal(r.files.find((f) => f.rel === 'HbIconButton.vue').tag, 'v1.2.0');
  assert.equal(state['HbButton.vue'], 'changed', 'content no release has is a request');
  assert.equal(state['HbBadge.vue'], 'older');
  assert.deepEqual(r.changes.map((c) => c.files), [['HbButton.vue']], 'the later release\'s fix is not a request');
  assert.match(copyLines(r).join('\n'), /already in v1\.2\.0: HbIconButton\.vue\. Move the pin to v1\.2\.0 rather than ask the system for it/);
});

test('the patch that brings the copy to its release applies in the product, and leaves the copy\'s own changes out', () => {
  const { ds, shop } = setUp();
  const btn = join(shop, 'library', 'HbButton.vue');
  writeFileSync(btn, readFileSync(btn, 'utf8').replace('type="button"', 'type="button" data-local'));
  execFileSync('rm', [join(shop, 'library', 'HbIconButton.vue')]);
  git(shop, 'add', '-A'); git(shop, 'commit', '-qm', 'local');
  const r = copyCheck(ds, { dir: '../shop/library', from: 'components', release: 'v1.1.0' }, { cache: false });
  assert.ok(r.patch, copyLines(r).join('\n'));
  assert.equal(r.patch.files, 2, 'the older badge and the missing icon button');
  const patch = readFileSync(join(ds, r.patch.file), 'utf8');
  assert.match(patch, /^diff --git a\/library\/HbBadge\.vue b\/library\/HbBadge\.vue$/m);
  assert.match(patch, /^\+\+\+ b\/library\/HbIconButton\.vue$/m);
  assert.doesNotMatch(patch, /HbButton\.vue/, 'a change made in the copy is a request, never patched away');
  execFileSync('git', ['apply', join(ds, r.patch.file)], { cwd: shop });
  const again = copyCheck(ds, { dir: '../shop/library', from: 'components', release: 'v1.1.0' }, { cache: false });
  assert.deepEqual(Object.fromEntries(again.files.map((f) => [f.rel, f.state])), { 'HbBadge.vue': 'same', 'HbButton.vue': 'changed', 'HbIconButton.vue': 'same' });
  assert.equal(again.patch, undefined);
});

test('a second run reads again only the files whose content changed', () => {
  const { ds, shop } = setUp();
  const first = copyCheck(ds, { dir: '../shop/library', from: 'components', release: 'v1.1.0' });
  const seenFile = join(ds, '.design-system-engine-out', 'copies', 'seen.json');
  assert.ok(existsSync(seenFile));
  // What was found is kept by content: a planted answer for an unchanged file is what the next run says.
  const seen = JSON.parse(readFileSync(seenFile, 'utf8'));
  const key = Object.keys(seen).find((k) => k.includes(':HbBadge.vue:'));
  seen[key] = { state: 'older', planted: true };
  writeFileSync(seenFile, JSON.stringify(seen));
  const second = copyCheck(ds, { dir: '../shop/library', from: 'components', release: 'v1.1.0' });
  assert.equal(second.files.find((f) => f.rel === 'HbBadge.vue').planted, true, 'the unchanged file was not read again');
  // A file whose content moved is read again.
  appendFileSync(join(shop, 'library', 'HbBadge.vue'), '<!-- local -->\n');
  const third = copyCheck(ds, { dir: '../shop/library', from: 'components', release: 'v1.1.0' });
  assert.equal(third.files.find((f) => f.rel === 'HbBadge.vue').state, 'changed');
  assert.deepEqual(first.counts, { same: 2, older: 1 });
});

test('a copy checked out with CRLF line endings, as git on Windows leaves it, is the same file as its release', () => {
  const { ds, shop } = setUp();
  for (const f of ['HbBadge.vue', 'HbButton.vue', 'HbIconButton.vue']) {
    const file = join(shop, 'library', f);
    writeFileSync(file, readFileSync(file, 'utf8').replace(/\r?\n/g, '\r\n'));
  }
  const r = copyCheck(ds, { dir: '../shop/library', from: 'components', release: 'v1.0.0' }, { cache: false });
  const state = Object.fromEntries(r.files.map((f) => [f.rel, f.state]));
  assert.deepEqual(state, { 'HbBadge.vue': 'same', 'HbButton.vue': 'same', 'HbIconButton.vue': 'same' }, 'only the line endings differ');
});

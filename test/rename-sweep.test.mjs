// A token renamed in Figma, renamed everywhere in one change: paired by its values in every mode, the CSS variable
// renamed in the system and its products with the old name kept in the theme, one patch per root, applied as is.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { renamedTokens, sweepFiles, linesDiff } from '../rename-sweep.mjs';
import { budget } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));

test('the renames between two reads: same values in every mode, the closest name when several match', () => {
  const prev = { color: { light: { 'chip/bg/color': '#fff', 'text/muted/color': '#666', 'text/primary/color': '#111' }, dark: { 'chip/bg/color': '#000', 'text/muted/color': '#999', 'text/primary/color': '#eee' } } };
  const next = { color: { light: { 'chip/background/color': '#fff', 'card/background/color': '#fff', 'text/subtle/color': '#666', 'text/primary/color': '#111' }, dark: { 'chip/background/color': '#000', 'card/background/color': '#000', 'text/subtle/color': '#999', 'text/primary/color': '#eee' } } };
  assert.deepEqual(renamedTokens(prev, next), [{ from: 'chip/bg/color', to: 'chip/background/color' }, { from: 'text/muted/color', to: 'text/subtle/color' }]);
  // A value that changed too is not a rename.
  assert.deepEqual(renamedTokens({ sizing: { 'radius/s': '4px' } }, { sizing: { 'radius/small': '6px' } }), []);
  // Whole names only: --chip-bg-hover is a token of its own.
  const ch = sweepFiles([{ file: 'a.css', text: '.a { color: var(--chip-bg); }\n.b { color: var(--chip-bg-hover); }' }], [{ from: '--chip-bg', to: '--chip-background' }]);
  assert.deepEqual([...ch.get('a.css').changes], [[1, '.a { color: var(--chip-background); }']]);
  assert.match(linesDiff(ch), /^--- a\/a\.css\n\+\+\+ b\/a\.css\n@@ -1,2 \+1,2 @@\n-\.a \{ color: var\(--chip-bg\); \}\n\+\.a \{ color: var\(--chip-background\); \}\n \.b/);
});

test('--rename-sweep writes one patch for the system and one per product, and each applies as is', { timeout: budget(120000) }, () => {
  const top = mkdtempSync(join(tmpdir(), 'sweep-')), ds = join(top, 'ds'), shop = join(top, 'shop');
  const put = (root, p, t) => { mkdirSync(dirname(join(root, p)), { recursive: true }); writeFileSync(join(root, p), t); };
  const git = (cwd, ...a) => spawnSync('git', a, { cwd, encoding: 'utf8' });
  put(ds, 'ds-config.json', JSON.stringify({ paths: { snapshotVars: 'figma/vars.json', themeCSS: 'src/theme.css' }, pluginDirs: { shop: '../shop' } }));
  put(ds, 'src/theme.css', ':root {\n  --chip-bg: #fff;\n  --text-primary: #111;\n}\n.chip { background: var(--chip-bg); color: var(--text-primary); }\n');
  put(ds, 'docs/chip.md', 'The chip is drawn on `--chip-bg`.\n');
  put(shop, 'app.css', '.cart { background: var(--chip-bg); }\n');
  put(ds, 'figma/vars.json', JSON.stringify({ color: { light: { 'chip/bg/color': '#fff', 'text/primary/color': '#111' } } }));
  git(ds, 'init', '-q'); git(ds, '-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '.'); git(ds, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'first read');
  put(ds, 'figma/vars.json', JSON.stringify({ color: { light: { 'chip/background/color': '#fff', 'text/primary/color': '#111' } } }));   // renamed in Figma, read again
  const r = spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--rename-sweep'], { cwd: ds, encoding: 'utf8' });
  assert.match(r.stdout, /1 token renamed in Figma since the last commit:\n\s+chip\/bg\/color → chip\/background\/color\s+\(--chip-bg → --chip-background\)/);
  assert.match(r.stdout, /This system: 3 lines in 2 files/);
  assert.match(r.stdout, /shop: 1 line in 1 file/);
  const out = join(ds, '.design-system-engine-out', 'handback');
  assert.ok(existsSync(join(out, 'rename-sweep.diff')) && existsSync(join(out, 'rename-sweep-shop.diff')));
  assert.equal(git(ds, 'apply', join(out, 'rename-sweep.diff')).status, 0);
  assert.equal(spawnSync('git', ['apply', join(out, 'rename-sweep-shop.diff')], { cwd: shop, encoding: 'utf8' }).status, 0);
  const theme = readFileSync(join(ds, 'src/theme.css'), 'utf8');
  assert.match(theme, /  --chip-background: #fff;\n  --chip-bg: var\(--chip-background\);   \/\* renamed to --chip-background: remove once every product has moved \*\//);
  assert.match(theme, /\.chip \{ background: var\(--chip-background\); color: var\(--text-primary\); \}/);
  assert.match(readFileSync(join(ds, 'docs/chip.md'), 'utf8'), /`--chip-background`/);
  assert.equal(readFileSync(join(shop, 'app.css'), 'utf8'), '.cart { background: var(--chip-background); }\n');
  // Nothing renamed: said so.
  git(ds, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qam', 'swept');
  assert.match(spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--rename-sweep'], { cwd: ds, encoding: 'utf8' }).stdout, /No token renamed in Figma since/);
});

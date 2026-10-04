// A collection whose values change with a mode (a sizing collection per breakpoint) is checked per mode even when
// ds-config.json declares no collections: the CSS block for each mode is found where the theme puts it, and a mode
// the code has no CSS for fails with every value it owes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), '..');
function project(theme) {
  const dir = mkdtempSync(join(tmpdir(), 'modes-auto-'));
  writeFileSync(join(dir, 'ds-config.json'), JSON.stringify({ paths: { themeCSS: 'theme.css', snapshotVars: 'vars.json' }, figma: { colorCollection: 'Styling' } }));
  writeFileSync(join(dir, 'vars.json'), JSON.stringify({ color: { light: {}, dark: {} }, modeVariants: { Sizing: { modes: [{ name: 'Desktop', snapshotKey: 'desktop' }, { name: 'Phone', snapshotKey: 'phone' }], vars: { 'padding/s': { kind: 'scalar', values: { desktop: '8px', phone: '10px' } } } } } }));
  writeFileSync(join(dir, 'theme.css'), theme);
  return spawnSync(process.execPath, [join(ENGINE, 'mode-completeness-check.mjs')], { cwd: dir, encoding: 'utf8' });
}

test('a mode the code has no CSS for fails, naming the value it owes', () => {
  const r = project(':root { --padding-s: 8px; }');
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /\[Sizing\] padding\/s → --padding-s\n\s+Phone: Figma 10px \(Desktop 8px\); the CSS has no Phone mode at all/);
});

test('a mode the theme sets in an @media block, or a [data-…] block, is found and compared', () => {
  assert.equal(project(':root { --padding-s: 8px; } @media (max-width: 480px) { :root { --padding-s: 10px; } }').status, 0);
  assert.equal(project(':root { --padding-s: 8px; } :root[data-size="phone"] { --padding-s: 10px; }').status, 0);
  const wrong = project(':root { --padding-s: 8px; } @media (max-width: 480px) { :root { --padding-s: 12px; } }');
  assert.equal(wrong.status, 1);
  assert.match(wrong.stdout, /phone: Figma 10px, CSS 12px/);
});

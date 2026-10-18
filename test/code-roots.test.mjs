// code-roots.mjs: a design system whose products live in sibling repositories names them in ds-config.json, and every
// source scan reads them as the project's own code; the engine's own output is never read as usage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { codeRoots } from '../code-roots.mjs';
import { projectStyleText } from '../a11y-static.mjs';
import { uiFiles } from '../route.mjs';

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), '..');

function workspace() {
  const ws = mkdtempSync(join(tmpdir(), 'code-roots-'));
  const ds = join(ws, 'ds'), app = join(ws, 'app');
  mkdirSync(join(ds, 'src'), { recursive: true });
  mkdirSync(app, { recursive: true });
  writeFileSync(join(ds, 'src', 'theme.css'), ':root { --brand: #123456; }\n.card { color: var(--brand); }\n');
  writeFileSync(join(app, 'ui.src.html'), '<div class="card"></div>\n');
  writeFileSync(join(app, 'app.css'), '.local { outline: none; }\n');
  return { ws, ds, app };
}

test('the project, then the folders the config names outside it: pluginDirs and codeRoots; inside or missing ones add nothing', () => {
  const { ds, app } = workspace();
  writeFileSync(join(ds, 'ds-config.json'), JSON.stringify({ pluginDirs: { app: '../app', inner: 'src' }, codeRoots: ['../app', '../missing'] }));
  assert.deepEqual(codeRoots(ds), [ds, app]);
  assert.deepEqual(codeRoots(ds, {}), [ds]);
});

test('a scan reads the sibling folder: its styles and its UI files', () => {
  const { ds } = workspace();
  writeFileSync(join(ds, 'ds-config.json'), JSON.stringify({ pluginDirs: { app: '../app' } }));
  assert.match(projectStyleText(ds), /\.local \{ outline: none; \}/);
  assert.ok(uiFiles(ds).includes('../app/ui.src.html'), uiFiles(ds).join(', '));
});

test('audit: a variable only a sibling uses is not unused; a class named only in the engine\'s own findings is still dead', () => {
  const { ds } = workspace();
  cpSync(join(ENGINE, 'test', 'fixtures', 'demo-ds'), join(ds, 'demo'), { recursive: true, filter: (p) => !/expected-report/.test(p) });
  const cfg = { themeCSS: 'src/theme.css', paths: { themeCSS: 'src/theme.css', pluginCSS: ['../app/ui.src.html'], plugins: ['app'] }, pluginDirs: { app: '../app' } };
  writeFileSync(join(ds, 'ds-config.json'), JSON.stringify(cfg));
  writeFileSync(join(ds, 'src', 'theme.css'), ':root { --brand: #123456; }\n.card { color: red; }\n.orphan { color: blue; }\n');
  writeFileSync(join(ds, '..', 'app', 'ui.src.html'), '<div class="card" style="color: var(--brand)"></div>\n');
  mkdirSync(join(ds, '.design-system-engine-out'), { recursive: true });
  writeFileSync(join(ds, '.design-system-engine-out', 'last-findings.json'), JSON.stringify({ lines: ['.orphan defined but never applied'] }));
  const r = spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--only', '11'], { cwd: ds, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', CHROME_PATH: join(ds, 'no-chrome') } });
  const out = r.stdout + r.stderr;
  assert.doesNotMatch(out, /unused \(scanned[^\n]*--brand/);
  assert.match(out, /\.orphan/);
});

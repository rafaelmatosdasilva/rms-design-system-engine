// raw-census.mjs (M1): every value written by hand in the project's styles, with the token to use, the files that guess
// most first, and a baseline so the count only falls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { censusTokens, censusText, censusOf, censusAgainst, censusLines, CENSUS_FILE } from '../raw-census.mjs';

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const THEME = `:root {
  --surface: #ffffff; --text: #1c1c1c;
  --space-s: 8px; --space-m: 12px; --radius-m: 6px; --font-size-body: 14px;
  --duration-fast: 150ms; --z-index-overlay: 10; --shadow-card: 0 1px 2px rgba(0, 0, 0, 0.2);
}`;

test('the tokens a value can be written with: colours, sizes by kind, durations, layers and shadows', () => {
  const t = censusTokens(THEME);
  assert.deepEqual(t.colours.get('#ffffff'), ['--surface']);
  assert.deepEqual(t.sizes.spacing.get(12), ['--space-m']);
  assert.deepEqual(t.sizes.radius.get(6), ['--radius-m']);
  assert.deepEqual(t.durations.get(150), ['--duration-fast']);
  assert.deepEqual(t.layers.get(10), ['--z-index-overlay']);
  assert.deepEqual(t.shadows.get('0 1px 2px rgba(0, 0, 0, 0.2)'), ['--shadow-card']);
});

test('each literal with its line, its level and the token to use', () => {
  const t = censusTokens(THEME);
  const css = [
    '.card {',
    '  background: #fff;',                                  // 2 a colour a token holds
    '  color: green;',                                      // 3 a colour the system lacks
    '  padding: 12px 13px;',                                // 4 a spacing a token holds, and one none does
    '  border-radius: 13px;',                               // 5 a radius none holds: a warning
    '  transition: color 0.15s, background 150ms;',         // 6 a duration a token holds, twice on one line: once
    '  z-index: 50;',                                       // 7 a layer none names
    '  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);',          // 8 a shadow a token holds (its colour too, as written)
    '  margin: var(--space-s, 8px); gap: calc(8px + 2px);', // 9 a token and a sum: left alone
    '  border-radius: 999px; z-index: 1; padding: 1px 0;',  // 10 a pill, the first layer, a hairline: left alone
    '  /* color: red; */',                                  // 11 a comment
    '  --local: #000;',                                     // 12 a component's own variable holds a colour too
    '}',
  ].join('\n');
  const got = censusText(css, t).map((x) => [x.line, x.kind, x.level, x.token]);
  assert.deepEqual(got, [
    [2, 'colour', 'error', '--surface'],
    [3, 'colour', 'error', null],
    [4, 'spacing', 'error', '--space-m'],
    [4, 'spacing', 'error', null],
    [5, 'radius', 'warning', null],
    [6, 'duration', 'warning', '--duration-fast'],
    [7, 'z-index', 'warning', null],
    [8, 'colour', 'error', null],
    [8, 'shadow', 'warning', '--shadow-card'],
    [12, 'colour', 'error', null],
  ]);
  const text = censusText(css, t).map((x) => x.text);
  assert.ok(text.includes('background: #fff is written by hand; use var(--surface)'));
  assert.ok(text.includes('padding: 13px is not a spacing value of the design system'));
  assert.ok(text.includes('z-index: 50 is a layer the design system does not name'));
  // In a theme file the custom properties are the tokens themselves.
  assert.deepEqual(censusText(':root { --x: #123456; }\n.a { color: #123456; }', t, { theme: true }).map((x) => x.line), [2]);
});

test('the baseline: written first, lowered when the count falls, and a file with more says which', () => {
  const census = (n) => ({ errors: n, warnings: 0, byKind: {}, files: [{ file: 'a.css', errors: n, warnings: 0, findings: [] }] });
  assert.equal(censusAgainst(census(3), null).first, true);
  const base = { errors: 3, files: { 'a.css': { errors: 3 } } };
  assert.deepEqual(censusAgainst(census(2), base), { first: false, grew: [], fell: true, total: { was: 3, now: 2 } });
  assert.deepEqual(censusAgainst(census(4), base).grew, [{ file: 'a.css', was: 3, now: 4 }]);
  assert.match(censusLines(census(4), censusAgainst(census(4), base)).at(-1), /^✗ More values written by hand than the baseline in 1 file: a\.css \(3 → 4\)/);
});

test('the whole project: style files, component files and pages, the theme\'s own rules, the files that guess most first; --census keeps the count falling', () => {
  const dir = mkdtempSync(join(tmpdir(), 'census-'));
  const put = (p, t) => { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), t); };
  put('ds-config.json', JSON.stringify({ paths: { themeCSS: 'src/theme.css' } }));
  put('src/theme.css', `${THEME}\n.button { padding: 12px; }\n`);
  put('src/card.css', '.card { color: #ff0000; background: #00ff00; border-color: blue; }\n');
  put('src/Chip.vue', '<template><span class="chip">x</span></template>\n<style>\n.chip { color: #fff; }\n</style>\n');
  put('app/ui.html', '<style>\n.row { z-index: 9; }\n</style>\n<div class="row" style="color: red">x</div>\n');
  put('node_modules/x/x.css', '.x { color: red; }\n');
  const c = censusOf(dir, { paths: { themeCSS: 'src/theme.css' } });
  assert.deepEqual(c.files.map((f) => [f.file, f.errors, f.warnings]), [['src/card.css', 3, 0], ['src/Chip.vue', 1, 0], ['src/theme.css', 1, 0], ['app/ui.html', 0, 1]]);
  assert.equal(c.errors, 5);
  const run = () => spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--census'], { cwd: dir, encoding: 'utf8' });
  let r = run();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /5 errors, 1 warning in 4 files/);
  assert.match(r.stdout, /The count is now the baseline/);
  assert.equal(JSON.parse(readFileSync(join(dir, CENSUS_FILE), 'utf8')).errors, 5);
  put('src/card.css', '.card { color: #ff0000; background: #00ff00; border-color: blue; outline-color: purple; }\n');
  r = run();
  assert.equal(r.status, 1, 'a file with more than the baseline fails');
  assert.match(r.stdout, /src\/card\.css \(3 → 4\)/);
  put('src/card.css', '.card { color: #ff0000; }\n');
  r = run();
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Down from 5 to 3 errors: the baseline is lowered/);
  assert.equal(JSON.parse(readFileSync(join(dir, CENSUS_FILE), 'utf8')).errors, 3);
  assert.ok(existsSync(join(dir, CENSUS_FILE)));
});

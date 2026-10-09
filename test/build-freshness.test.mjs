// Gate [1] build freshness (E7): a newer date is a stale build only when the content changed since the build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, utimesSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildFreshness } from '../build-freshness.mjs';

const at = (file, minutes) => { const t = new Date(Date.UTC(2026, 0, 1, 12, minutes)); utimesSync(file, t, t); };

function project() {
  const dir = mkdtempSync(join(tmpdir(), 'build-freshness-'));
  const f = (name, text, minutes) => { const p = join(dir, name); writeFileSync(p, text); at(p, minutes); return p; };
  const theme = f('theme.css', ':root { --a: #000; }', 0);
  const src = f('ui.src.html', '<p>one</p>', 1);
  const out = f('ui.html', '<style>:root { --a: #000; }</style><p>one</p>', 2);
  return { dir, theme, src, out, args: { products: [{ name: 'lab', src, out }], themes: [theme], recordFile: join(dir, 'out', 'build-freshness.json') } };
}

test('a build newer than its source and theme is current, and what it was built from is recorded', () => {
  const p = project();
  assert.deepEqual(buildFreshness(p.args), { stale: [], datesOnly: [] });
  assert.ok(JSON.parse(readFileSync(p.args.recordFile, 'utf8')).lab.inputs);
});

test('a theme saved again with the same content is not stale: only its date moved', () => {
  const p = project();
  buildFreshness(p.args);
  at(p.theme, 30);
  assert.deepEqual(buildFreshness(p.args), { stale: [], datesOnly: ['lab'] });
});

test('a theme that changed after the build is stale, and so is a changed source', () => {
  const p = project();
  buildFreshness(p.args);
  writeFileSync(p.theme, ':root { --a: #111; }'); at(p.theme, 30);
  assert.deepEqual(buildFreshness(p.args).stale, ['lab (theme newer)']);
  const q = project();
  buildFreshness(q.args);
  writeFileSync(q.src, '<p>two</p>'); at(q.src, 30);
  assert.deepEqual(buildFreshness(q.args).stale, ['lab']);
});

test('a build never seen current is judged by its dates', () => {
  const p = project();
  at(p.theme, 30);
  assert.deepEqual(buildFreshness(p.args).stale, ['lab (theme newer)']);
});

// Token values a product loads from hosted stylesheets, one per mode: setup takes every one into one local token file,
// each mode in its own block, and never asks which to take.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mergeHosted, takeableUrls, fetchHosted, hostedAxes } from '../hosted-tokens.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const sheet = (c, s) => `:root { --bg: ${c === 'dark' ? '#000' : '#fff'}; --pad: ${{ desktop: 16, laptop: 12, tablet: 8 }[s]}px; --edge: ${c === 'dark' && s === 'tablet' ? 1 : 0}px; }`;
const SIX = ['light', 'dark'].flatMap((c) => ['desktop', 'laptop', 'tablet'].map((s) => [c, s]));

test('six hosted mode files make one token file: light desktop at the root, each other mode a block of what differs', () => {
  const r = mergeHosted(SIX.map(([c, s]) => ({ url: `https://ds.example/tokens/${c}-${s}.css`, css: sheet(c, s) })));
  assert.deepEqual([r.base, r.colours, r.sizes], [{ colour: 'light', size: 'desktop' }, ['dark'], ['laptop', 'tablet']]);
  assert.match(r.css, /:root \{\n {2}--bg: #fff;\n {2}--pad: 16px;\n {2}--edge: 0px;\n\}/);
  assert.match(r.css, /:root\[data-theme="dark"\] \{\n {2}--bg: #000;\n\}/);
  assert.match(r.css, /:root\[data-size="tablet"\] \{\n {2}--pad: 8px;\n\}/);
  assert.match(r.css, /:root\[data-theme="dark"\]\[data-size="tablet"\] \{\n {2}--edge: 1px;\n\}/);
  assert.ok(!/data-size="laptop"\]\s*\{[^}]*--bg/.test(r.css), 'a size block never repeats a colour');
  assert.deepEqual(hostedAxes(['https://x/a/Dark_Phone.css', 'https://x/a/Light_Phone.css', 'https://x/a/Light_Desktop.css']).axes.map((a) => [a.kind, a.base]), [['colour', 'light'], ['size', 'desktop']]);
});

test('only full stylesheet addresses are taken, never a template or a known CDN', async () => {
  assert.deepEqual(takeableUrls(['https://a.example/t/${theme}.css', 'https://cdnjs.cloudflare.com/x.css', 'https://app.example/ds/light.css?v=2', '<link id="theme"> - href set at runtime']), ['https://app.example/ds/light.css?v=2']);
  const said = [];
  const got = await fetchHosted(['https://a/1.css', 'https://a/2.css', 'https://a/3.css'], {
    fetchImpl: async (u) => (u.endsWith('1.css') ? { ok: true, text: async () => ':root{--a:1px}' } : u.endsWith('2.css') ? { ok: false, status: 404 } : { ok: true, text: async () => 'body{margin:0}' }),
    log: (m) => said.push(m),
  });
  assert.deepEqual(got.map((f) => f.url), ['https://a/1.css']);
  assert.deepEqual(said, ['https://a/2.css: 404', 'https://a/3.css: declares no token']);
});

test('setup takes every hosted mode file it is given, writes them to one local file and finds each mode in it', async () => {
  const server = createServer((req, res) => { const m = /\/(\w+)-(\w+)\.css$/.exec(req.url); if (!m) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': 'text/css' }); res.end(sheet(m[1], m[2])); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/ds`;
  const dir = mkdtempSync(join(tmpdir(), 'hosted-'));
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src', 'app.js'), SIX.map(([c, s]) => `// ${base}/${c}-${s}.css`).join('\n'));
  writeFileSync(join(dir, 'package.json'), '{"name":"p"}');
  const init = (args) => new Promise((resolve) => {
    const p = spawn(process.execPath, [join(ENGINE, 'audit.mjs'), '--init', '--figma-url=https://www.figma.com/design/AbCdEf123456XyZ/X', '--no-hooks', ...args], { cwd: dir, env: { ...process.env, NO_COLOR: '1', NO_PROXY: '127.0.0.1', no_proxy: '127.0.0.1' } });
    let text = ''; p.stdout.on('data', (d) => { text += d; }); p.stderr.on('data', (d) => { text += d; });
    p.on('close', (code) => resolve({ code, text }));
  });
  // Found in the code, with no file given: taken all the same.
  const found = await init([]);
  assert.match(found.text, /Took 6 hosted token stylesheet\(s\)/, found.text);
  const out = await init([`--theme-css=${SIX.map(([c, s]) => `${base}/${c}-${s}.css`).join(',')}`]);
  server.close();
  assert.match(out.text, /Took 6 hosted token stylesheet\(s\), every mode \(light, dark × desktop, laptop, tablet\), into src\/styles\/tokens\.hosted\.css/, out.text);
  const css = readFileSync(join(dir, 'src/styles/tokens.hosted.css'), 'utf8');
  assert.match(css, /:root\[data-theme="dark"\]/);
  const cfg = JSON.parse(readFileSync(join(dir, 'ds-config.json'), 'utf8'));
  assert.equal(cfg.paths.themeCSS, 'src/styles/tokens.hosted.css');
});

// The tokens as a WordPress theme's files, from a real project's Figma snapshot, with no control center: the engine's
// own theme.json and style variations, and a patch for the theme that git applies, the theme itself never touched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeWordpress, wordpressLines, themeFolder, jsonText, PATCH_FILE } from '../lib/wordpress-theme.mjs';
import { tempDir } from './helpers.mjs';
import { projectState } from '../lib/route.mjs';

const DEMO = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'demo-ds');
const project = () => { const dir = tempDir('wp-theme-'); cpSync(DEMO, dir, { recursive: true }); return { dir, cfg: JSON.parse(readFileSync(join(dir, 'ds-config.json'), 'utf8')) }; };
const json = (p) => JSON.parse(readFileSync(p, 'utf8'));

test('from the Figma snapshot alone: theme.json and a style variation per other mode, in the contracts\' folder', async () => {
  const { dir, cfg } = project();
  const r = await writeWordpress(dir, cfg);
  assert.equal(r.error, undefined);
  const out = join(dir, 'contracts', 'wordpress');
  const theme = json(join(out, 'theme.json'));
  assert.equal(theme.version, 3);
  assert.ok(theme.settings.color.palette.length > 0);
  assert.ok(theme.settings.border.radiusSizes.length > 0, 'the radii are presets');
  assert.deepEqual(r.variations.map((v) => v.file), ['styles/dark.json']);
  const dark = json(join(out, 'styles', 'dark.json'));
  assert.equal(dark.title, 'Dark');
  assert.notDeepEqual(dark.settings.color.palette, theme.settings.color.palette, 'the dark values');
  assert.match(readFileSync(join(out, 'theme.json'), 'utf8'), /^\{\n\t"\$schema"/, 'tabs, as WordPress writes its own');
  assert.equal(r.patch, null, 'no theme named: no patch');
  const lines = wordpressLines(r).join('\n');
  assert.match(lines, /🧩 WordPress theme → contracts\/wordpress\/theme\.json: \d+ colours · \d+ spacings · \d+ radii/);
  assert.match(lines, /1 style variation for the other modes: Dark \(styles\/dark\.json\)/);
  const captured = json(join(dir, cfg.paths?.snapshotVars ?? 'src/figma-vars.snapshot.json'))._updated;
  assert.match(lines, new RegExp(`From Figma as captured ${captured ? `on ${captured.slice(0, 10)}` : 'last'}`), 'the theme is made from the capture, and the run says when it was read');
  // A mode Figma no longer has loses its file on the next run.
  writeFileSync(join(out, 'styles', 'gone.json'), '{}');
  await writeWordpress(dir, cfg);
  assert.equal(existsSync(join(out, 'styles', 'gone.json')), false);
});

test('with the theme\'s folder: a patch git applies there, the theme untouched, its own presets named', async () => {
  const { dir, cfg } = project();
  const folder = join(dir, 'wp-theme');
  mkdirSync(folder);
  const ours = await writeWordpress(dir, cfg);
  const first = ours.theme.settings.color.palette[0];
  const theirs = { $schema: 'https://schemas.wp.org/trunk/theme.json', version: 3, title: 'Their theme',
    settings: { layout: { contentSize: '720px' }, color: { palette: [{ ...first, color: '#123456', name: 'Their name' }, { slug: 'theirs-only', color: '#ff00ff', name: 'Theirs' }] } },
    templateParts: [{ name: 'header', area: 'header' }] };
  const text = JSON.stringify(theirs, null, 2) + '\n';
  writeFileSync(join(folder, 'theme.json'), text);
  const r = await writeWordpress(dir, { ...cfg, wordpress: { theme: 'wp-theme' } });
  assert.equal(readFileSync(join(folder, 'theme.json'), 'utf8'), text, 'nothing in the theme is changed');
  assert.equal(existsSync(join(folder, 'styles')), false);
  assert.equal(r.patch, `contracts/wordpress/${PATCH_FILE}`);
  const tj = r.files.find((f) => f.file === 'theme.json');
  assert.ok(tj.changed.includes(`palette ${first.slug}`));
  assert.deepEqual(tj.onlyTheirs, ['palette theirs-only']);
  assert.equal(r.files.find((f) => f.file === 'styles/dark.json').made, true);
  const lines = wordpressLines(r).join('\n');
  assert.match(lines, /only in the theme, kept \(a person adds it to Figma or removes it\): palette theirs-only/);
  assert.match(lines, /styles\/dark\.json: not in the theme yet, the patch adds it/);
  assert.match(lines, /Nothing in the theme was changed\./);
  // The person applies it, in the theme's folder.
  execFileSync('git', ['apply', join(dir, r.patch)], { cwd: folder });
  const after = json(join(folder, 'theme.json'));
  assert.deepEqual([after.title, after.settings.layout, after.templateParts], ['Their theme', { contentSize: '720px' }, theirs.templateParts]);
  assert.deepEqual(after.settings.color.palette[0], { ...first, name: 'Their name' });
  assert.match(readFileSync(join(folder, 'theme.json'), 'utf8'), /^\{\n {2}"\$schema"/, 'the theme\'s own indent is kept');
  assert.ok(existsSync(join(folder, 'styles', 'dark.json')));
  // Applied, the theme is in line: the next run has no patch.
  const again = await writeWordpress(dir, { ...cfg, wordpress: { theme: 'wp-theme/theme.json' } });
  assert.equal(again.patch, null);
  assert.match(wordpressLines(again).join('\n'), /The theme is in line with Figma: no patch\./);
});

test('nothing to make it from, and a theme folder that is not there, are said', async () => {
  const { dir, cfg } = project();
  const missing = await writeWordpress(dir, { ...cfg, paths: { ...cfg.paths, snapshotVars: 'nowhere.json' } });
  assert.match(missing.error, /no Figma variables snapshot/);
  assert.deepEqual(wordpressLines(missing), [`⚠️  WordPress theme not made: ${missing.error}.`]);
  const codeOnly = await writeWordpress(dir, { ...cfg, figmaFileKey: '', paths: { ...cfg.paths, snapshotVars: 'nowhere.json' } });
  assert.match(codeOnly.error, /set up from its code alone, with no Figma file.*--init --figma-url/, 'a project with no Figma file is told what the theme needs');
  const gone = await writeWordpress(dir, cfg, { theme: 'no-such-theme' });
  assert.match(gone.error, /is not there/);
});

test('the theme\'s folder from the command or the config, and JSON written in the file\'s own way', () => {
  const root = resolve('p');
  assert.equal(themeFolder(root, {}), null);
  assert.equal(themeFolder(root, { wordpress: { theme: 'wp' } }), join(root, 'wp'));
  assert.equal(themeFolder(root, { wordpress: { theme: 'wp' } }, 'other/theme.json'), join(root, 'other'));
  assert.equal(themeFolder(root, {}, '~/sites/acme', join(root, 'home')), join(root, 'home', 'sites', 'acme'), 'a ~ the shell did not expand is the home');
  assert.equal(jsonText({ a: 1 }), '{\n\t"a": 1\n}\n');
  assert.equal(jsonText({ a: 1 }, '{\n    "a": 2\n}'), '{\n    "a": 1\n}', 'four spaces and no last newline, as the file had');
  assert.equal(jsonText({ a: 1 }, '{\r\n  "a": 2\r\n}\r\n'), '{\r\n  "a": 1\r\n}\r\n', 'a file with Windows line ends keeps them');
});

test('the router knows a project set up from its code alone, with no Figma to make the theme from', () => {
  const { dir, cfg } = project();
  assert.equal(projectState(dir).noFigma, false, 'a project with its Figma file');
  writeFileSync(join(dir, 'ds-config.json'), JSON.stringify({ ...cfg, figmaFileKey: '', paths: { ...cfg.paths, snapshotVars: 'nowhere.json' } }, null, 2));
  assert.equal(projectState(dir).noFigma, true);
  assert.equal(projectState(tempDir('wp-none-')).noFigma, false, 'nothing set up is setup\'s to ask, not this');
});

test('a Figma variable named __proto__/x reaches no prototype in the contracts\' tokens either', async () => {
  const { dir, cfg } = project();
  const at = join(dir, cfg.paths?.snapshotVars ?? 'src/figma-vars.snapshot.json');
  const vars = json(at);
  vars.sizing = { ...(vars.sizing ?? {}), '__proto__/polluted': '4px' };
  writeFileSync(at, JSON.stringify(vars));
  const { generateContracts } = await import('../lib/contract-gen.mjs');
  const r = await generateContracts(dir, cfg, {});
  assert.equal(({}).polluted, undefined);
  assert.ok(r.droppedTokens.includes('__proto__/polluted'), 'named among the tokens that could not be written');
});

test('with the contracts: the button as WordPress\'s button, every other button a style of the Button block, what has no place said', async () => {
  const { dir, cfg } = project();
  const { generateContracts } = await import('../lib/contract-gen.mjs');
  const r = (await generateContracts(dir, cfg, {})).wordpress;
  const theme = json(join(dir, 'contracts', 'wordpress', 'theme.json'));
  const button = theme.styles.elements.button;
  assert.match(button.spacing.padding.top, /^var:preset\|spacing\|/, 'its padding is the theme\'s own spacing preset');
  assert.match(button.border.radius, /^var:preset\|border-radius\|/);
  assert.ok(r.components.mapped.some((m) => m.component === 'button' && /button element/.test(m.as)));
  for (const v of r.blocks) {
    const file = json(join(dir, 'contracts', 'wordpress', v.file));
    assert.deepEqual([file.version, file.blockTypes], [3, ['core/button']], 'a block style variation, as WordPress 6.6 reads one');
  }
  assert.ok(r.components.left.some((x) => x.component === 'field' && /no core block or element/.test(x.why)), 'a field has no place in theme.json, and it is said');
  const lines = (await import('../lib/wordpress-theme.mjs')).auditLines(r, cfg).join('\n');
  assert.match(lines, /^ℹ️ {2}WordPress view → contracts\/wordpress\/theme\.json: the tokens as its presets, \d+ components? as its styles/, 'one line when no theme is named');
});

// The contracts' WordPress view, loaded into a real WordPress and read back as WordPress itself resolves it: its presets,
// its style variations, the Button block's styles and the CSS it writes for them. The WordPress is WordPress Playground
// (WordPress and PHP compiled to WebAssembly, GPL), pinned here the way CI installs it:
//   npm ci --prefix test/.wordpress-tools
// Nothing here is a stand-in for WordPress: what is checked is what wp_get_global_settings(), the block style registry and
// wp_get_global_stylesheet() answer for the theme, from the files the engine wrote.
//
// Two themes, each the engine's own files and nothing else beside a theme's two required ones (style.css, an index
// template): the demo system's view as the contracts write it, and one made by the same writers from a system with what
// the demo has not, a button's hover and an Outline look and a font size per screen width.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { binIn, runBin } from '../lib/project-bin.mjs';
import { fromVariables, wordpressFiles } from '../lib/token-exports.mjs';
import { wordpressComponents } from '../lib/contract-wordpress.mjs';
import { budget, tempDir } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const TOOLS = join(ENGINE, 'test', '.wordpress-tools', 'node_modules');
const BIN = binIn(TOOLS, 'wp-playground-cli', { pkg: '@wp-playground/cli' });
// The WordPress loaded, pinned: a newer one moves through a pull request, as every pin here does.
const WORDPRESS = '7.1.5';
const SKIP = BIN ? false : 'no WordPress Playground (npm ci --prefix test/.wordpress-tools)';

// What WordPress resolved for the active theme, as JSON: run inside WordPress, from a folder mounted beside it. With
// ?theme=<folder>, that theme is made the active one first.
const PROOF = `<?php
require_once '/wordpress/wp-load.php';
if (!empty($_GET['theme'])) { switch_theme(sanitize_key($_GET['theme'])); echo json_encode(['active' => get_stylesheet()]); exit; }
$s = wp_get_global_settings();
$styles = WP_Block_Styles_Registry::get_instance()->get_registered_styles_for_block('core/button');
$separatorStyles = WP_Block_Styles_Registry::get_instance()->get_registered_styles_for_block('core/separator');
$kept = WP_Theme_JSON_Resolver::get_merged_data()->get_raw_data()['styles']['blocks'] ?? [];
$markup = '';
foreach (array_keys($styles) as $slug) $markup .= '<!-- wp:button {"className":"is-style-' . $slug . '"} --><div class="wp-block-button is-style-' . $slug . '"><a class="wp-block-button__link wp-element-button">A</a></div><!-- /wp:button -->';
$rendered = do_blocks($markup);
$after = wp_styles()->get_data('block-style-variation-styles', 'after');
echo json_encode([
  'theme' => get_stylesheet(), 'wp' => get_bloginfo('version'),
  'palette' => $s['color']['palette']['theme'] ?? [], 'radiusSizes' => $s['border']['radiusSizes']['theme'] ?? [],
  'spacingSizes' => $s['spacing']['spacingSizes']['theme'] ?? [], 'fontSizes' => $s['typography']['fontSizes']['theme'] ?? [],
  'variations' => array_values(array_map(function ($v) { return $v['title'] ?? null; }, WP_Theme_JSON_Resolver::get_style_variations())),
  'buttonStyles' => array_keys($styles), 'separatorStyles' => array_keys($separatorStyles), 'keptBlocks' => array_intersect_key($kept, array_flip(['core/separator', 'core/quote', 'core/table', 'core/details', 'core/tag'])), 'rendered' => $rendered, 'variationCss' => is_array($after) ? implode("\\n", $after) : (string) $after,
  'css' => wp_get_global_stylesheet(),
]);
`;

// A block theme: the engine's files, and the two a theme needs to be one.
const theme = (dir, name, files) => {
  for (const [file, json] of files) { mkdirSync(dirname(join(dir, file)), { recursive: true }); writeFileSync(join(dir, file), JSON.stringify(json, null, '\t')); }
  writeFileSync(join(dir, 'style.css'), `/*\nTheme Name: ${name}\nVersion: 1.0\n*/\n`);
  mkdirSync(join(dir, 'templates'), { recursive: true });
  writeFileSync(join(dir, 'templates', 'index.html'), '<!-- wp:post-content /-->\n');
};
const freePort = () => new Promise((done, fail) => { const s = createServer(); s.unref(); s.on('error', fail); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => done(port)); }); });

let server = null, url = null, demo = null;
const read = async (q = '') => (await fetch(`${url}/engine-proof/index.php${q}`)).json();

before(async () => {
  if (SKIP) return;
  const root = tempDir('wp-real-');
  // The demo system's view, as every run writes it beside its contracts.
  const project = join(root, 'project');
  cpSync(join(ENGINE, 'test', 'fixtures', 'demo-ds'), project, { recursive: true });
  const cfg = JSON.parse(readFileSync(join(project, 'ds-config.json'), 'utf8'));
  demo = (await (await import('../lib/contract-gen.mjs')).generateContracts(project, cfg, {})).wordpress;
  const view = join(project, 'contracts', 'wordpress');
  theme(join(root, 'acme'), 'Acme', [['theme.json', JSON.parse(readFileSync(join(view, 'theme.json'), 'utf8'))],
    ...[...demo.variations, ...demo.blocks].map((v) => [v.file, JSON.parse(readFileSync(join(view, v.file), 'utf8'))])]);

  // A system with a hover, an Outline look and a font size per screen width, through the same writers.
  const { tokens } = fromVariables([
    { figma: 'button/bg', var: null, type: 'colour', collection: 'Theme', modes: ['Light', 'Dark'], values: ['#1f5fd6', '#88a9ff'] },
    { figma: 'button/bg-hover', var: null, type: 'colour', collection: 'Theme', modes: ['Light', 'Dark'], values: ['#1849a8', '#a9c1ff'] },
    { figma: 'button/text', var: null, type: 'colour', collection: 'Theme', modes: ['Light', 'Dark'], values: ['#ffffff', '#0b1020'] },
    { figma: 'surface/base', var: null, type: 'colour', collection: 'Theme', modes: ['Light', 'Dark'], values: ['#ffffff', '#0b1020'] },
    { figma: 'radii/button', var: null, type: 'radius', collection: 'Size', modes: ['Value'], values: ['8px'] },
    { figma: 'type/body/size', var: null, type: 'typography', collection: 'Size', modes: ['Phone', 'Desktop'], values: ['14px', '18px'] },
  ]);
  const made = wordpressFiles(tokens, { name: 'Acme fluid' });
  const axis = (name, options, def) => ({ name, type: 'enum', default: def, options, bindings: { figma: { kind: 'VARIANT', property: name, options } } });
  const components = wordpressComponents([{ name: 'button', semantics: { element: 'button' }, props: [axis('Variant', ['Primary', 'Outline'], 'Primary'), axis('State', ['Default', 'Hover'], 'Default')],
    anatomy: { root: { radiusToken: '{radii.button}' } },
    tokens: { byVariant: [
      { when: { Variant: 'Primary', State: 'Default' }, paints: [{ token: 'button/bg', field: 'fills' }, { token: 'button/text', field: 'fills', text: true }] },
      { when: { Variant: 'Primary', State: 'Hover' }, paints: [{ token: 'button/bg-hover', field: 'fills' }, { token: 'button/text', field: 'fills', text: true }] },
      { when: { Variant: 'Outline', State: 'Default' }, paints: [{ token: 'surface/base', field: 'fills' }, { token: 'button/bg', field: 'strokes' }, { token: 'button/bg', field: 'fills', text: true }] },
    ] } },
    // The places WordPress keeps beyond the button, each read from its element, written with the system's radius.
    ...[['divider', 'hr'], ['quote', 'blockquote'], ['dataTable', 'table'], ['disclosure', 'details'], ['caption', 'figcaption'], ['source', 'cite']]
      .map(([name, element]) => ({ name, semantics: { element }, anatomy: { root: { radiusToken: '{radii.button}' } } })),
    // A second divider, as a style of the Separator block.
    { name: 'rule', semantics: { element: 'div' }, accessibility: { role: { value: 'separator' } }, anatomy: { root: { radiusToken: '{radii.button}' } } },
  ], { refOf: (t) => made.refs[String(t).replace(/^\{|\}$/g, '').split('/').join('.')] ?? null });
  // With one block WordPress has not (core/tag), so what WordPress keeps is shown to be its own choice, not an echo.
  const fluidStyles = { ...components.styles, blocks: { ...components.styles.blocks, 'core/tag': { border: { radius: '8px' } } } };
  theme(join(root, 'acme-fluid'), 'Acme fluid', [['theme.json', { ...made.theme, styles: fluidStyles }], ...[...made.variations, ...components.variations].map((v) => [v.file, v.theme])]);

  mkdirSync(join(root, 'proof'));
  writeFileSync(join(root, 'proof', 'index.php'), PROOF);
  writeFileSync(join(root, 'blueprint.json'), JSON.stringify({ steps: [{ step: 'activateTheme', themeFolderName: 'acme' }] }));
  const port = await freePort();
  url = `http://127.0.0.1:${port}`;
  let said = '';
  server = runBin(BIN, ['server', `--port=${port}`, `--wp=${WORDPRESS}`, `--blueprint=${join(root, 'blueprint.json')}`,
    // Each folder and where it sits in WordPress as two arguments (--mount-dir), never one joined by a colon (--mount),
    // which a Windows path's own colon (D:\…) breaks.
    '--mount-dir', join(root, 'acme'), '/wordpress/wp-content/themes/acme', '--mount-dir', join(root, 'acme-fluid'), '/wordpress/wp-content/themes/acme-fluid',
    '--mount-dir', join(root, 'proof'), '/wordpress/engine-proof'], (file, args, opts) => spawn(file, args, opts), { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', (d) => { said += d; });
  server.stderr.on('data', (d) => { said += d; });
  // Ready once WordPress answers the proof, which it does only once it is installed with the theme active.
  const until = Date.now() + budget(240000);
  for (;;) {
    try { if ((await fetch(`${url}/engine-proof/index.php`)).ok) break; } catch { /* not listening yet */ }
    if (server.exitCode != null || Date.now() > until) throw new Error(`WordPress did not start:\n${said.slice(-2000)}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
});
after(() => { server?.kill(); });

test('in a real WordPress, the demo system\'s view: its tokens are the theme\'s presets, its button WordPress\'s button', { skip: SKIP, timeout: budget(300000) }, async () => {
  const wp = await read();
  assert.equal(wp.theme, 'acme');
  assert.equal(wp.wp, WORDPRESS);
  const view = demo.theme.settings;
  assert.deepEqual(wp.palette.map((p) => [p.slug, p.color]), view.color.palette.map((p) => [p.slug, p.color]), 'every colour, as WordPress reads the palette');
  assert.deepEqual(wp.radiusSizes, view.border.radiusSizes, 'the radii are presets WordPress offers');
  assert.deepEqual(wp.spacingSizes.map((s) => s.slug), view.spacing.spacingSizes.map((s) => s.slug));
  for (const p of view.color.palette) assert.ok(wp.css.includes(`--wp--preset--color--${p.slug}: ${p.color}`), `${p.slug} is a CSS variable of the page`);
  const button = wp.css.match(/:root :where\(\.wp-element-button, \.wp-block-button__link\)\{([^}]*)\}/)?.[1] ?? '';
  assert.match(button, /border-radius: var\(--wp--preset--border-radius--radii-button\)/, 'the button\'s radius is the system\'s token');
  assert.match(button, /padding-top: var\(--wp--preset--spacing--padding-xs\)/);
  assert.deepEqual(wp.variations, ['Dark'], 'the other mode is a style variation the Site Editor offers');
  assert.deepEqual(wp.buttonStyles, demo.blocks.map((b) => b.theme.slug), 'every other button is a style of the Button block');
});

test('in a real WordPress, a button\'s hover, its Outline look and a fluid font size are what the theme says', { skip: SKIP, timeout: budget(300000) }, async () => {
  assert.equal((await read('?theme=acme-fluid')).active, 'acme-fluid');
  const wp = await read();
  assert.equal(wp.theme, 'acme-fluid');
  assert.match(wp.css, /:root :where\(\.wp-element-button:hover, \.wp-block-button__link:hover\)\{background-color: var\(--wp--preset--color--button-bg-hover\);\}/, 'the hover state, with the system\'s token');
  assert.match(wp.css, /--wp--preset--font-size--type-body-size: clamp\(14px, [^;]+, 18px\);/, 'the font size grows from the narrowest screen\'s value to the widest\'s');
  assert.deepEqual(wp.buttonStyles, ['button-outline']);
  assert.match(wp.rendered, /class="wp-block-button is-style-button-outline/, 'a Button block can take the Outline style');
  assert.match(wp.variationCss, /background-color: var\(--wp--preset--color--surface-base\);border-color: var\(--wp--preset--color--button-bg\);border-style: solid;color: var\(--wp--preset--color--button-bg\);/, 'and WordPress writes its colours from the system\'s tokens');
  assert.deepEqual(wp.variations, ['Dark']);
});

// WordPress has more places than the button, the link and the headings, and the view used to leave a divider, a quote,
// a table, a disclosure, a caption and a citation out, saying WordPress had none. What WordPress itself writes into its
// stylesheet is the answer, and it writes every one of them.
test('in a real WordPress, a divider, a quote, a table, a disclosure, a caption and a citation are styled where WordPress keeps them', { skip: SKIP, timeout: budget(300000) }, async () => {
  assert.equal((await read('?theme=acme-fluid')).active, 'acme-fluid');
  const wp = await read();
  const radius = 'var(--wp--preset--border-radius--radii-button)';
  // Each block, kept in WordPress's own merged theme data with the system's radius: WordPress drops from that data any block
  // or property it does not support, which the made-up block beside them shows.
  for (const [what, block] of [['divider', 'core/separator'], ['quote', 'core/quote'], ['table', 'core/table'], ['disclosure', 'core/details']]) {
    assert.equal(wp.keptBlocks[block]?.border?.radius, radius, `the ${what}: WordPress's ${block.replace('core/', '')} block keeps the system's radius`);
  }
  assert.ok(!('core/tag' in wp.keptBlocks), 'a block WordPress has not is dropped: what it keeps is its own answer');
  // The caption and the citation are elements, written into WordPress's own stylesheet.
  assert.match(wp.css, /wp-element-caption[^{]*\{[^}]*border-radius: var\(--wp--preset--border-radius--radii-button\)/, 'the caption: WordPress\'s caption element');
  assert.match(wp.css, /(^|\})cite\{[^}]*border-radius: var\(--wp--preset--border-radius--radii-button\)/, 'the citation: WordPress\'s cite element');
  // A second divider is a style of the Separator block, kept and offered by name.
  assert.equal(wp.keptBlocks['core/separator']?.variations?.rule?.border?.radius, radius);
  assert.deepEqual(wp.separatorStyles, ['rule'], 'offered by name in the editor');
});

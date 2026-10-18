// what the system retired, still in use: each with what replaces it, every file and line by product, and a patch
// for each token swap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { retired, usesOf, migrationSteps, migrationPatches, migrationsMarkdown, migrationView, projectMigrations } from '../migrations.mjs';

test('what is retired: a deprecated component, a deprecated token with its replacement, an old name a rename kept', () => {
  const items = retired({
    contracts: { oldCard: { status: { state: 'deprecated', supersededBy: 'card', since: '3.0', rationale: 'One card for every surface.' } }, card: { status: { state: 'current' } }, chip: {} },
    vars: { color: { light: { 'surface/old': '#fff', 'surface/raised': '#fff' } }, tokenMeta: { 'surface/old': { description: '@deprecated @use-instead surface/raised' }, 'surface/raised': { description: 'A raised surface' } } },
    themes: [{ file: 'theme.css', text: ':root {\n  --text-body: #111;\n  --text-main: var(--text-body);   /* renamed to --text-body: remove once every product has moved */\n}' }],
    classFor: (n) => `.${n}`, varOf: (n) => `--${n.replace(/\//g, '-')}`,
  });
  assert.deepEqual(items.map((i) => [i.kind, i.from, i.to]), [['component', '.oldCard', '.card'], ['token', '--surface-old', '--surface-raised'], ['token', '--text-main', '--text-body']]);
  assert.equal(items[0].since, '3.0');
  assert.equal(items[0].why, 'One card for every surface.');
});

test('where each is still used: a class where classes are written, its tag, a var(); never its own files or rules', () => {
  const comp = { kind: 'component', name: 'oldCard', from: '.oldCard' };
  const files = [
    { file: 'src/OldCard.jsx', text: 'export const OldCard = () => <div className="oldCard" />;' },
    { file: 'src/old-card.css', text: '.oldCard { padding: 8px; }\n.toolbar .oldCard { margin: 0; }' },
    { file: 'src/pages/Home.jsx', text: 'import { OldCard } from "../OldCard";\n<OldCard title="x" />\n<div className={`oldCard wide`} />\n<p>An oldCard in prose</p>' },
    { file: '../shop/index.html', text: '<div class="box oldCard">\n<div class="oldCardish">' },
    { file: '../shop/app.js', text: "el.classList.add('oldCard');" },
  ];
  const at = usesOf(comp, files).map((u) => `${u.file}:${u.line}`);
  assert.deepEqual(at, ['src/old-card.css:2', 'src/pages/Home.jsx:2', 'src/pages/Home.jsx:3', '../shop/index.html:1', '../shop/app.js:1']);
  const tok = { kind: 'token', from: '--surface-old', to: '--surface-raised' };
  assert.deepEqual(usesOf(tok, [{ file: 'a.css', text: 'a { background: var(--surface-old); }\nb { color: var(--surface-older); }\nc { color: var( --surface-old , #fff); }' }]).map((u) => u.line), [1, 3]);
});

test('the steps by product, a patch for each token swap, and the list a person reads', () => {
  const items = [
    { kind: 'component', name: 'oldCard', from: '.oldCard', to: '.card', toName: 'card', since: '3.0', why: 'One card for every surface.' },
    { kind: 'token', name: 'surface/old', from: '--surface-old', to: '--surface-raised', toName: 'surface/raised' },
    { kind: 'token', name: 'line/old', from: '--line-old', to: null, toName: null },
    { kind: 'token', name: 'unused', from: '--unused', to: '--x' },
  ];
  const files = [
    { file: 'theme.css', text: ':root { --surface-old: #fff; }' },
    { file: 'src/a.css', text: '.a { background: var(--surface-old); border-color: var(--line-old); }\n' },
    { file: '../shop/page.html', text: '<div class="oldCard" style="color: var(--surface-old)"></div>\n' },
  ];
  const steps = migrationSteps(items, files, { skip: ['theme.css'] });
  assert.deepEqual(steps.map((s) => [s.from, s.count, Object.keys(s.uses)]), [['.oldCard', 1, ['../shop']], ['--surface-old', 2, ['.', '../shop']], ['--line-old', 1, ['.']], ['--unused', 0, []]]);
  const patches = migrationPatches(steps, files, { skip: ['theme.css'] });
  assert.deepEqual(patches.map((p) => [p.root, p.files, p.lines]), [['.', 1, 1], ['../shop', 1, 1]]);
  assert.match(patches[0].diff, /^--- a\/src\/a\.css\n\+\+\+ b\/src\/a\.css\n@@ -1,1 \+1,1 @@\n-\.a \{ background: var\(--surface-old\); border-color: var\(--line-old\); \}\n\+\.a \{ background: var\(--surface-raised\); border-color: var\(--line-old\); \}\n$/);
  assert.match(patches[1].diff, /\+\+\+ b\/page\.html/);
  patches.forEach((p, i) => { p.file = `handback/migrations-${i}.diff`; });
  const md = migrationsMarkdown(steps, patches);
  assert.match(md, /^# Moving off what the system retired\n\n3 retired components or tokens still in use\./);
  assert.match(md, /## The oldCard component \(\.oldCard\)\n\nUse card \(\.card\) instead\.\nDeprecated since 3\.0\. One card for every surface\.\n\n\*\*shop\*\*, 1 place:\n\n- page\.html:1/);
  assert.match(md, /## The token --line-old \(line\/old\)\n\nNothing replaces it yet/);
  assert.doesNotMatch(md, /--unused/);
  assert.match(md, /## Patches[\s\S]*- This system: handback\/migrations-0\.diff \(1 line\)\n- shop: handback\/migrations-1\.diff \(1 line\)/);
  // The style guide: a swap is Claude's, a token nothing replaces is a decision; a component's rows go to its page.
  const view = migrationView(steps.filter((s) => s.count), { dir: 'out/handback' });
  assert.deepEqual(view.tokens.map((t) => [t.kind, t.who]), [['Retired', 'code'], ['Retired', 'both']]);
  assert.match(view.tokens[0].say, /^1 retired token is still used \(--surface-old for --surface-raised in 2 places\)\.$/);
  assert.match(view.tokens[0].todo, /patches are ready in out\/handback/);
  assert.deepEqual(view.components.oldCard, { to: '.card', toName: 'card', since: '3.0', why: 'One card for every surface.', count: 1, products: [{ name: 'shop', count: 1, at: ['page.html:1'] }] });
});

test('read from a project: the authored status, the token\'s Figma description, the product beside it; the patch applies there', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dse-mig-')), dir = join(root, 'ds'), shop = join(root, 'shop');
  try {
    const put = (base, p, text) => { mkdirSync(dirname(join(base, p)), { recursive: true }); writeFileSync(join(base, p), text); };
    put(dir, 'ds-config.json', JSON.stringify({ paths: { themeCSS: 'src/theme.css', snapshotVars: 'src/figma-vars.snapshot.json' }, pluginDirs: { shop: '../shop' } }));
    put(dir, 'src/figma-vars.snapshot.json', JSON.stringify({ color: { light: { 'surface/old': '#ffffff', 'surface/raised': '#ffffff' } }, tokenMeta: { 'surface/old': { description: '@deprecated @use-instead surface/raised' } } }));
    put(dir, 'src/theme.css', ':root {\n  --surface-old: #ffffff;\n  --surface-raised: #ffffff;\n}\n.oldCard { background: var(--surface-old); }\n.card { background: var(--surface-raised); }\n');
    put(dir, 'contract.authored.json', JSON.stringify({ components: { oldCard: { status: 'deprecated', supersededBy: 'card', since: '3.0', rationale: 'One card for every surface.' } } }));
    put(dir, 'README.md', 'Wrap a section in `<div class="oldCard">`.\n');
    put(shop, 'index.html', '<div class="oldCard">Hello</div>\n<p style="color: var(--surface-old)">x</p>\n');
    const mg = await projectMigrations(dir, JSON.parse(readFileSync(join(dir, 'ds-config.json'), 'utf8')));
    assert.deepEqual(mg.steps.map((s) => [s.kind, s.from, s.to, s.count]), [['component', '.oldCard', '.card', 2], ['token', '--surface-old', '--surface-raised', 1]]);
    assert.deepEqual(Object.keys(mg.steps[0].uses), ['.', '../shop'], 'the docs count too');
    assert.deepEqual(mg.patches.map((p) => p.root), ['../shop']);
    spawnSync('git', ['init', '-q'], { cwd: shop });
    writeFileSync(join(root, 'p.diff'), mg.patches[0].diff);
    const ap = spawnSync('git', ['apply', join(root, 'p.diff')], { cwd: shop, encoding: 'utf8' });
    assert.equal(ap.status, 0, ap.stderr);
    assert.match(readFileSync(join(shop, 'index.html'), 'utf8'), /var\(--surface-raised\)/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the audit writes the steps beside its other hand-back files and says so in one line', { timeout: 300000 }, async () => {
  const { fixtureProject } = await import('./helpers.mjs');
  const { fileURLToPath } = await import('node:url');
  const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
  const dir = fixtureProject(join(ENGINE, 'test', 'fixtures', 'tidepool-figma'), 'tp-mig-');
  try {
    const ref = join(ENGINE, 'test', 'skill-evals', 'build-reference');
    for (const p of ['src/styles/tokens.css', 'src/components/button.css', 'src/components/Button.jsx', 'src/components/chip.css', 'src/components/Chip.jsx']) { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), readFileSync(join(ref, p), 'utf8')); }
    writeFileSync(join(dir, 'contract.authored.json'), JSON.stringify({ components: { button: { status: 'deprecated', supersededBy: 'chip' } } }));
    mkdirSync(join(dir, 'src', 'pages'), { recursive: true });
    writeFileSync(join(dir, 'src', 'pages', 'Home.jsx'), "import { Button } from '../components/Button';\nexport const Home = () => <Button Label=\"Save\" />;\n");
    const r = spawnSync(process.execPath, [join(ENGINE, 'audit.mjs')], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
    assert.match(r.stdout, /🚚 1 retired component or token still used in \d+ places? \(button\): what replaces each and every place → \.design-system-engine-out\/handback\/migrations\.md/);
    const md = readFileSync(join(dir, '.design-system-engine-out/handback/migrations.md'), 'utf8');
    assert.match(md, /## The button component \(\.button\)\n\nUse chip \(\.chip\) instead\./);
    assert.match(md, /- src\/pages\/Home\.jsx:2 {2}`export const Home = \(\) => <Button Label="Save" \/>;`/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

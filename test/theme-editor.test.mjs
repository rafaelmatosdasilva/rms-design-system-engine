// The theme editor: the style guide's own editor for a new theme of the system (templates/styleguide/js/36-theme-editor.js),
// with the themes it starts from read by the build (lib/theme-editor.mjs): the team's store first, then the person's own
// themes folder (styleguide.themes: <folder>/<system>/), never the system's project.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { systemSlug, themesFolder, ownThemeDirs, readThemes, editorData, THEMES_HOME } from '../lib/theme-editor.mjs';
import { templateText } from '../lib/styleguide-template.mjs';
import { fixtureProject, budget, tempDir } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));

test('the themes folder is the person\'s own, one subfolder per system, and a theme is read once, the first folder winning', () => {
  assert.equal(systemSlug({ name: 'Acme DS' }), 'acme-ds');
  assert.equal(systemSlug({}), 'system');
  assert.equal(themesFolder({}), THEMES_HOME, 'without a setting, a folder of the engine\'s own beside its other files');
  assert.match(THEMES_HOME, /^~\/\.claude\//);
  assert.equal(themesFolder({ styleguide: { themes: '~/themes' } }), '~/themes');
  const root = tempDir('editor-dirs-');
  const dirs = ownThemeDirs(root, { name: 'Acme DS', styleguide: { themes: 'kept', modules: [{ path: 'tools/m', data: 'tools/m-data' }, 'tools/n'] } });
  assert.deepEqual(dirs, [join(root, 'kept', 'acme-ds'), join(root, 'tools', 'm-data', 'acme-ds'), join(root, 'tools', 'n', 'data', 'acme-ds')], 'the themes folder, then each module\'s data folder');
  const a = join(root, 'a'), b = join(root, 'b');
  mkdirSync(a, { recursive: true }); mkdirSync(b, { recursive: true });
  writeFileSync(join(a, 'ocean.theme.json'), JSON.stringify({ id: 'ts1', name: 'Ocean', changed: '2026-11-02' }));
  writeFileSync(join(b, 'ocean-old.theme.json'), JSON.stringify({ id: 'ts1', name: 'Ocean (old)', changed: '2026-11-01' }));
  writeFileSync(join(b, 'dusk.theme.json'), JSON.stringify({ id: 'ts2', name: 'Dusk' }));
  writeFileSync(join(b, 'broken.theme.json'), '{ not json');
  assert.deepEqual(readThemes([a, b, join(root, 'none')]).map((t) => `${t.file}:${t.name}`), ['ocean.theme.json:Ocean', 'dusk.theme.json:Dusk'], 'one by its id, a file that is not JSON left out, a folder not there read as empty');
});

test('the page is told the folder as the setup writes it, never this computer\'s full path', () => {
  const root = tempDir('editor-data-');
  const own = join(homedir(), '.claude-editor-test-never-there');
  const d = editorData(root, { name: 'Acme', styleguide: { themes: own } });
  assert.equal(d.system, 'acme');
  assert.equal(d.folder, '~/.claude-editor-test-never-there');
  assert.deepEqual(d.files, []);
  const store = join(root, 'store');
  mkdirSync(store, { recursive: true }); writeFileSync(join(store, 'team.theme.json'), JSON.stringify({ id: 'ts9', name: 'Team' }));
  mkdirSync(join(root, 'kept', 'acme'), { recursive: true }); writeFileSync(join(root, 'kept', 'acme', 'mine.theme.json'), JSON.stringify({ id: 'ts8', name: 'Mine' }));
  assert.deepEqual(editorData(root, { name: 'Acme', styleguide: { themes: 'kept' } }, { storeDir: store }).files.map((t) => t.name), ['Team', 'Mine'], 'the team\'s store first, then the person\'s own');
});

test('the editor is the page\'s own: its script after the page\'s, its themes in a data block of their own, and nothing it draws names one system', () => {
  const page = templateText();
  assert.ok(page.indexOf('id="sg-theme-editor-data"') > page.indexOf('route();'), 'after the page\'s script, which it builds on');
  assert.match(page, /<script type="application\/json" id="sg-theme-editor-data">\/\*\{\{THEME_EDITOR\}\}\*\/<\/script>/);
  const src = readFileSync(join(ENGINE, 'templates', 'styleguide', 'js', '36-theme-editor.js'), 'utf8');
  assert.doesNotMatch(src, /moduleData|data-sg-module|brand-logo|menu\(primary\|secondary\)/, 'no module\'s wiring, no class or token name of one system');
});

test('the theme editor in the page: New theme opens its starts, From scratch its form, and a theme made is applied, kept and named in the link', { timeout: budget(300000) }, async (t) => {
  const { findChrome, launchChrome, connectCDP, openPage, waitForTrue, FILE_PAGE_LOADED } = await import('../lib/cdp.mjs');
  const chromePath = findChrome({ playwright: true });
  if (!chromePath || typeof WebSocket === 'undefined') { t.skip('no Chrome'); return; }
  const dir = fixtureProject(join(ENGINE, 'test', 'fixtures', 'tidepool-figma'), 'tp-editor-');
  const ref = join(ENGINE, 'test', 'skill-evals', 'build-reference');
  for (const p of ['src/styles/tokens.css', 'src/components/chip.css', 'src/components/Chip.jsx']) { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), readFileSync(join(ref, p), 'utf8')); }
  // A theme kept in the person's own themes folder, outside the project: the build puts it into the page.
  const cfg0 = JSON.parse(readFileSync(join(dir, 'ds-config.json'), 'utf8')), themes = tempDir('editor-themes-'), sys = systemSlug(cfg0);
  mkdirSync(join(themes, sys), { recursive: true });
  writeFileSync(join(themes, sys, 'harbour.theme.json'), JSON.stringify({ id: 'tsharbour', v: 6, name: 'Harbour', base: '', brief: { primary: '#0f766e' }, css: 'html[data-ts-theme="tsharbour"][data-ts-theme] .sg-layout { --editor-test: 1; }', changed: '2026-11-01T00:00:00.000Z' }));
  writeFileSync(join(dir, 'ds-config.json'), JSON.stringify({ ...cfg0, styleguide: { ...(cfg0.styleguide ?? {}), themes } }));
  const built = spawnSync(process.execPath, [join(ENGINE, 'lib', 'audit.mjs'), '--styleguide', '--no-a11y-bake'], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  assert.equal(built.status, 0, built.stdout + built.stderr);
  const page = join(dir, '.design-system-engine-out', 'styleguide', 'index.html');
  const c = await launchChrome(chromePath);
  try {
    const { send, on, close } = await connectCDP(c.wsUrl);
    const errors = []; on('Runtime.exceptionThrown', (p) => errors.push(p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text));
    const { sessionId } = await openPage(send, `file://${page}?theme=harbour`);
    await waitForTrue(send, sessionId, FILE_PAGE_LOADED);
    const run = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)).result.value;
    const until = async (expr, ok = Boolean) => { const end = Date.now() + budget(30000); let v; while (Date.now() < end) { v = await run(expr); if (ok(v)) return v; await new Promise((r) => setTimeout(r, 100)); } assert.fail(`never ready: ${String(v).slice(0, 300)}`); };
    // The theme from the folder is in the page, and the link that names it opens with it applied.
    assert.equal(await until(`document.documentElement.getAttribute('data-ts-theme')`), 'tsharbour', 'the link\'s theme applied');
    assert.match(await run(`document.getElementById('sg-ts-applied').textContent`), /--editor-test: 1/, 'its CSS over the system');
    // This system has no brands: New theme is a button beside the Theme choice, its menu the four starts.
    await run(`document.querySelector('.sg-brand-ctl [data-ts-open]').click()`);
    assert.deepEqual(await until(`(() => { const m = document.getElementById('sg-ts-menu'); return m && !m.hidden ? [...m.querySelectorAll('[role="menuitem"]')].map((x) => x.textContent.trim()) : null; })()`), ['From a Figma file', 'Upload tokens', 'From scratch', 'From references']);
    await run(`document.querySelector('#sg-ts-menu [data-start="scratch"]').click()`);
    assert.equal(await until(`(() => { const p = document.getElementById('sg-theme-panel'); return p && !p.hidden && p.querySelector('#ts-name') ? p.querySelector('.sg-ts-pick-head b').textContent : null; })()`), 'Base customization', 'From scratch opens its form');
    // A name is asked for first.
    await run(`document.querySelector('#sg-theme-panel [data-ts="create"]').click()`);
    assert.equal(await run(`document.getElementById('ts-name-error').textContent`), 'Give the theme a name.');
    // Named and made: the folder is asked for (Download instead here), and the theme is kept, applied and in the link.
    await run(`(() => { const n = document.getElementById('ts-name'); n.value = 'Coral Reef'; n.dispatchEvent(new Event('input', { bubbles: true })); const p = document.getElementById('ts-primary-hex'); p.value = '#e11d48'; p.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#sg-theme-panel [data-ts="create"]').click(); })()`);
    const asked = await until(`(() => { const d = document.querySelector('dialog.sg-dialog[open]'); return d ? d.textContent : null; })()`);
    assert.ok(asked.includes(`${themes.replace(homedir(), '~')}/${sys}`), 'the folder named as the setup writes it: ' + asked);
    await run(`document.querySelector('dialog.sg-dialog[open] [data-no]').click()`);
    const kept = JSON.parse(await until(`localStorage.getItem('sg-ts-themes:' + '${sys}')`, (v) => v && v.includes('Coral Reef')));
    const made = kept.find((x) => x.name === 'Coral Reef');
    assert.ok(made && made.brief.primary === '#e11d48' && /data-ts-theme="/.test(made.css), 'kept with what was chosen, and its CSS worked out');
    assert.deepEqual(kept.map((x) => x.name), ['Harbour', 'Coral Reef'], 'beside the one from the folder');
    assert.equal(await until(`document.documentElement.getAttribute('data-ts-theme')`, (v) => v === made.id), made.id, 'applied at once');
    assert.equal(await run(`new URL(location.href).searchParams.get('theme')`), 'coral-reef', 'and named in the link, so it opens the same page');
    assert.equal(await run(`document.getElementById('sg-theme-panel').hidden || !document.getElementById('sg-theme-panel').classList.contains('is-open')`), true, 'the panel closed');
    assert.deepEqual(errors, [], 'the page threw nothing');
    close();
  } finally { c.kill(); }
});

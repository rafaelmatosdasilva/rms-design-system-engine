// The style guide's Templates page: each page frame Figma composes of the system's components (templates[] and its
// snapshot), what it is made of in Figma's order, whether its code uses each one, and the frame it comes from. The
// template composition gate reads the same answer (template-composition.mjs), so the page and the gate agree.
import { test } from 'node:test';
import { templateText } from '../lib/styleguide-template.mjs';
import assert from 'node:assert/strict';
import { cpSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { templateComposition, templatesSnapshot } from '../lib/template-composition.mjs';
import { readPage } from '../lib/styleguide-files.mjs';
import { budget, tempDir } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const HARBOR = join(ENGINE, 'test', 'fixtures', 'harbor-ds');
// A picture of a frame, as Figma exports it: its width and height are read from its header.
const PNG = readFileSync(join(ENGINE, 'test', 'fixtures', 'tidepool-figma', 'figma-mcp', 'chip.png'));

// Harbor with two templates: Settings, built in its own page file, and Profile, with no code file at all.
function project() {
  const dir = tempDir('sg-templates-');
  cpSync(HARBOR, dir, { recursive: true });
  const cfg = JSON.parse(readFileSync(join(dir, 'ds-config.json'), 'utf8'));
  cfg.templates = [{ name: 'Settings', nodeId: '9:1', file: 'views/SettingsPage.vue' }, { name: 'Profile', nodeId: '9:2' }];
  cfg.knownTemplateExceptions = ['Settings/iconButton'];
  cfg.visualRefs = 'refs';
  cfg.figmaFileKey = 'AbC123';
  writeFileSync(join(dir, 'ds-config.json'), JSON.stringify(cfg, null, 2));
  writeFileSync(join(dir, 'figma', 'figma-templates.snapshot.json'), JSON.stringify({ templates: {
    Settings: { name: 'Settings', nodeId: '9:1', components: ['badge', 'button', 'iconButton'] },
    Profile: { name: 'Profile', nodeId: '9:2', components: ['button'] },
  } }));
  mkdirSync(join(dir, 'views'), { recursive: true });
  // The button first and the badge after it: Figma places the badge first.
  writeFileSync(join(dir, 'views', 'SettingsPage.vue'), '<template><main><HbButton class="hb-button" label="Save" /><HbBadge class="hb-badge" label="New" /></main></template>\n<script setup>\nimport HbButton from \'../components/HbButton.vue\';\nimport HbBadge from \'../components/HbBadge.vue\';\n</script>\n');
  mkdirSync(join(dir, 'refs', 'templates'), { recursive: true });
  writeFileSync(join(dir, 'refs', 'templates', 'Settings.png'), PNG);
  return { dir, cfg };
}

test('a template\'s parts: used, not in the code, kept out on purpose, in progress, and not compared when it has no code file', () => {
  const { dir, cfg } = project();
  assert.match(templatesSnapshot(dir, cfg).file, /figma\/figma-templates\.snapshot\.json$/, 'found beside the structure snapshot');
  const rows = templateComposition(dir, { ...cfg, componentSelectors: { badge: '.hb-badge', button: '.hb-button' } }, { inProgress: new Set(['iconButton']) });
  const settings = rows.find((t) => t.name === 'Settings');
  assert.equal(settings.file, 'views/SettingsPage.vue');
  assert.deepEqual(settings.parts, [{ name: 'badge', state: 'used' }, { name: 'button', state: 'used' }, { name: 'iconButton', state: 'in-progress' }]);
  assert.deepEqual(settings.order, { figma: ['badge', 'button'], code: ['button', 'badge'] }, 'the code places them in another order');
  const profile = rows.find((t) => t.name === 'Profile');
  assert.deepEqual([profile.file, profile.parts], [null, [{ name: 'button', state: 'not-compared' }]]);
  // Kept out on purpose, and missing.
  const kept = templateComposition(dir, { ...cfg, componentSelectors: { badge: '.hb-badge', button: '.hb-button', iconButton: '.hb-icon-button' } }).find((t) => t.name === 'Settings');
  assert.deepEqual(kept.parts.map((p) => p.state), ['used', 'used', 'exempt']);
  const missing = templateComposition(dir, { ...cfg, knownTemplateExceptions: [], componentSelectors: { badge: '.hb-badge', button: '.hb-button', iconButton: '.hb-icon-button' } }).find((t) => t.name === 'Settings');
  assert.equal(missing.parts.find((p) => p.name === 'iconButton').state, 'missing');
  // A whole template in progress is listed, its code not compared.
  const wip = templateComposition(dir, cfg, { inProgress: new Set(['Settings']) }).find((t) => t.name === 'Settings');
  assert.deepEqual([wip.inProgress, wip.file, wip.parts.map((p) => p.state)], [true, null, ['in-progress', 'in-progress', 'in-progress']]);
});

test('the style guide carries each template with its parts, its Figma link and its picture, and draws the Templates page', { timeout: budget(300000) }, async (t) => {
  const { dir } = project();
  const r = spawnSync(process.execPath, [join(ENGINE, 'lib', 'audit.mjs'), '--styleguide', '--no-a11y-bake'], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', FIGMA_TOKEN: '' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const file = join(dir, '.design-system-engine-out', 'styleguide', 'index.html');
  const page = readPage(file);
  const data = JSON.parse(page.match(/<script type="application\/json" id="sg-data">([\s\S]*?)<\/script>/)[1]);
  const settings = data.templates.find((x) => x.name === 'Settings');
  assert.deepEqual(settings.parts.map((p) => [p.name, p.state]), [['badge', 'used'], ['button', 'used'], ['iconButton', 'exempt']]);
  assert.equal(settings.figma, 'https://www.figma.com/design/AbC123?node-id=9-1');
  assert.deepEqual([settings.picture.w, settings.picture.h], [PNG.readUInt32BE(16) / 2, PNG.readUInt32BE(20) / 2], 'drawn at half its pixels, as Figma exports at 2x');
  const profile = data.templates.find((x) => x.name === 'Profile');
  assert.equal(profile.file, null);
  assert.match(profile.pictureWhy, /no reference image and no FIGMA_TOKEN/);

  const { findChrome, launchChrome, connectCDP, openPage, waitForTrue, FILE_PAGE_LOADED } = await import('../lib/cdp.mjs');
  const chromePath = findChrome({ playwright: true });
  if (!chromePath || typeof WebSocket === 'undefined') { t.skip('no Chrome'); return; }
  const c = await launchChrome(chromePath);
  try {
    const { send, on, close } = await connectCDP(c.wsUrl);
    const errors = []; on('Runtime.exceptionThrown', (p) => errors.push(p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text));
    const { sessionId } = await openPage(send, `file://${file}#templates`);
    await waitForTrue(send, sessionId, FILE_PAGE_LOADED);
    const run = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true }, sessionId)).result.value;
    await waitForTrue(send, sessionId, `!!document.querySelector('#templates .sg-template')`);
    assert.equal(await run(`!!document.querySelector('.sg-nav a[href="#templates"]')`), true, 'in the menu');
    assert.equal(await run(`!document.getElementById('templates').hidden`), true, 'the address opens it');
    const rows = await run(`[...document.querySelectorAll('#template-Settings .sg-template-parts > li')].map((li) => li.textContent)`);
    assert.deepEqual(rows, ['badgeIn the code', 'buttonIn the code', 'iconButtonKept out on purpose']);
    assert.equal(await run(`document.querySelector('#template-Settings .sg-template-parts a[href="#c-button"]') !== null`), true, 'a component with a page is linked');
    assert.match(await run(`document.querySelector('#template-Settings .sg-template-meta').textContent`), /Built in views\/SettingsPage\.vue, 2 of 2 components in the code · See in Figma/);
    assert.equal(await run(`document.querySelector('#template-Settings figure img').alt`), 'Settings in Figma');
    assert.match(await run(`document.querySelector('#template-Settings').textContent`), /The code places them in another order: button, badge\./);
    assert.match(await run(`document.querySelector('#template-Profile').textContent`), /No code file found\. A developer names it in templates\[\]\.file in ds-config\.json/);
    assert.match(await run(`document.querySelector('#template-Profile').textContent`), /buttonNot compared/);
    assert.deepEqual(errors, []);
    close();
  } finally { c.kill(); }
});

test('a project with no templates has no Templates page', () => {
  const page = templateText();
  assert.match(page, /if \(\(DATA\.templates \|\| \[\]\)\.length\) \{\n\s+hr\(\); navLink\('templates', 'templates'\);/);
});

// A product's screens as stories the system's team opens in its own Storybook (product-stories.mjs,
// --product-screens <product> --stories): written in a folder of the engine's own, for the framework the team's
// Storybook names, and built with the real Storybook pinned in test/.storybook-tools.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, symlinkSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rendererOf, storybookRenderer, screenStory, storiesLine, storyFileOf } from '../lib/product-stories.mjs';
import { binIn, runBin } from '../lib/project-bin.mjs';
import { findChrome } from '../lib/cdp.mjs';
import { budget, fixtureProject, tempDir } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const TOOLS = join(ENGINE, 'test', '.storybook-tools', 'node_modules');
const CHROME = findChrome({ playwright: true });

test('the framework a Storybook names says how its stories draw a frame', () => {
  assert.equal(rendererOf('@storybook/vue3-vite'), 'vue3');
  assert.equal(rendererOf('@storybook/react-vite'), 'react');
  assert.equal(rendererOf('@storybook/nextjs'), 'react');
  assert.equal(rendererOf('@storybook/web-components-vite'), 'html');
  assert.equal(rendererOf('@storybook/html-vite'), 'html');
  assert.equal(rendererOf('@storybook/angular'), null, 'none written for it, and said');
  assert.equal(rendererOf(null), null);
  const dir = tempDir('sb-main-');
  assert.deepEqual(storybookRenderer(dir), { renderer: null, framework: null, file: null }, 'no Storybook');
  mkdirSync(join(dir, '.storybook'));
  writeFileSync(join(dir, '.storybook', 'main.ts'), "const config = { framework: { name: '@storybook/react-vite', options: {} } };\nexport default config;\n");
  assert.deepEqual(storybookRenderer(dir), { renderer: 'react', framework: '@storybook/react-vite', file: '.storybook/main.ts' });
  writeFileSync(join(dir, '.storybook', 'main.ts'), "export default { framework: '@storybook/web-components-vite' };\n");
  assert.equal(storybookRenderer(dir).renderer, 'html', 'a framework named as a string');
});

test('a story shows the drawn page in a frame, imports nothing of the system, and is valid code in each framework', () => {
  const page = '<!doctype html><title>x</title><button class="tp-button">Save</button><script>window.x = "</script>"</script>';
  const dir = tempDir('sb-story-');
  for (const renderer of ['vue3', 'react', 'html']) {
    const text = screenStory({ product: 'shop', screen: 'apps/shop/cart.html', page, renderer, parts: { system: 3, product: 1, standIn: 2 } });
    assert.match(text, /title: "Product screens\/shop\/cart"/);
    assert.match(text, /3 parts the system's, 1 the product's own, 2 stand-ins/);
    assert.match(text, /export const AsDrawn = \{ name: 'As drawn from the system'/);
    assert.doesNotMatch(text, /import .* from '\.\.?\//, 'nothing of the project imported');
    const f = join(dir, `${renderer}.mjs`);
    writeFileSync(f, text);
    const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${renderer}: ${r.stderr}`);
  }
  assert.equal(screenStory({ product: 'shop', screen: 'x', page, renderer: 'angular' }), null);
  assert.equal(storyFileOf('apps/shop/cart page.html'), 'cart-page.stories.js');
  assert.equal(storiesLine('/p', '.design-system-engine-out/workshop/shop/stories', '.storybook/main.js'), '../.design-system-engine-out/workshop/shop/stories/*.stories.js');
});

const READY = CHROME && typeof WebSocket !== 'undefined' && existsSync(join(TOOLS, 'storybook')) && existsSync(join(TOOLS, '@storybook', 'vue3-vite'))
  ? false : 'no Chrome, or no Storybook build tools (npm ci --prefix test/.storybook-tools)';

test('the stories built with real Storybook: each screen under Product screens, drawn from the system\'s components', { skip: READY, timeout: budget(900000) }, async () => {
  const dir = fixtureProject(join(ENGINE, 'test', 'fixtures', 'demo-ds'), 'product-stories-');
  const run = (...args) => spawnSync(process.execPath, [join(ENGINE, 'lib', 'audit.mjs'), ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', CHROME_PATH: CHROME }, timeout: budget(400000) });
  run();   // the catalog the screens are read against
  let r = run('--product-screens', 'gallery');
  assert.match(r.stdout, /the same command with --stories/, 'offered, never written unasked');
  assert.equal(existsSync(join(dir, '.design-system-engine-out', 'workshop', 'gallery', 'stories')), false);
  r = run('--product-screens', 'gallery', '--stories');
  assert.match(r.stdout, /No Storybook here \(\.storybook\/main\.\*\): no stories written/, 'none without a Storybook');
  mkdirSync(join(dir, '.storybook'));
  writeFileSync(join(dir, '.storybook', 'main.js'), "export default {\n  stories: [],\n  framework: { name: '@storybook/vue3-vite', options: { docgen: false } },\n  core: { disableTelemetry: true },\n};\n");
  r = run('--product-screens', 'gallery', '--stories');
  assert.match(r.stdout, /📚 1 story for @storybook\/vue3-vite's Storybook, in \.design-system-engine-out\/workshop\/gallery\/stories/, r.stdout.slice(-1500));
  const line = /add this to stories in \.storybook\/main\.js: '([^']+)'/.exec(r.stdout)?.[1];
  assert.equal(line, '../.design-system-engine-out/workshop/gallery/stories/*.stories.js');
  assert.equal(readFileSync(join(dir, '.storybook', 'main.js'), 'utf8').includes('workshop'), false, 'the team\'s Storybook is never written to');
  // A story of a screen the product no longer has goes; a file of the team's own in the folder stays.
  const stories = join(dir, '.design-system-engine-out', 'workshop', 'gallery', 'stories');
  writeFileSync(join(stories, 'gone.stories.js'), "// gone, a screen of gallery, drawn from the system's components by rms-design-system-engine (--product-screens gallery --stories).\n");
  writeFileSync(join(stories, 'mine.stories.js'), '// a team file\nexport default { title: "Mine" };\n');
  run('--product-screens', 'gallery', '--stories');
  assert.deepEqual(readdirSync(stories).sort(), ['mine.stories.js', 'ui.stories.js']);
  // The team adds the line, as it was said, and builds its Storybook as it always does.
  writeFileSync(join(stories, 'mine.stories.js'), '');
  writeFileSync(join(dir, '.storybook', 'main.js'), readFileSync(join(dir, '.storybook', 'main.js'), 'utf8').replace('stories: []', `stories: ['${line.replace('*.stories.js', 'ui.stories.js')}']`));
  symlinkSync(TOOLS, join(dir, 'node_modules'), 'dir');
  const built = runBin(binIn(TOOLS, 'storybook'), ['build', '-o', 'storybook-static', '--quiet'], spawnSync, { cwd: dir, encoding: 'utf8', env: { ...process.env, STORYBOOK_DISABLE_TELEMETRY: '1', NO_COLOR: '1' }, timeout: budget(300000) });
  assert.equal(built.status, 0, `storybook build: ${built.stderr || built.stdout}`.slice(0, 1500));
  const index = JSON.parse(readFileSync(join(dir, 'storybook-static', 'index.json'), 'utf8'));
  const entry = Object.values(index.entries).find((e) => e.title === 'Product screens/gallery/ui');
  assert.equal(entry?.name, 'As drawn from the system');
  // Drawn: the frame holds the system's own button, as the workshop draws the screen.
  const { serveStatic } = await import('../lib/storybook-stories.mjs');
  const server = await serveStatic(join(dir, 'storybook-static'));
  const { launchChrome, connectCDP, openPage, waitForTrue } = await import('../lib/cdp.mjs');
  const b = await launchChrome(CHROME);
  try {
    const { send, close } = await connectCDP(b.wsUrl);
    const { sessionId } = await openPage(send, `${server.url}/iframe.html?id=${entry.id}&viewMode=story`);
    const drawn = await waitForTrue(send, sessionId, `(() => { const f = document.querySelector('iframe[title="ui · gallery"]'); return !!f && !!f.contentDocument && f.contentDocument.querySelectorAll('.tp-button').length > 0; })()`, { attempts: 400, tolerateErrors: true });
    assert.equal(drawn, true, 'the system\'s button in the frame');
    close();
  } finally { b.kill(); await server.close(); }
});

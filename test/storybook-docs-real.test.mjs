// What a team writes into Storybook by hand, read from a real Storybook build into the contracts and the guidelines.
//
// The stories are Harbor's (test/fixtures/harbor-stories, laid over harbor-ds), built with the Storybook pinned here the
// way CI installs it:
//   npm ci --prefix test/.storybook-tools
// Button's story file says what the team wrote (its description, each prop's description, options and default), and
// three of its lines disagree with the code on purpose. Badge's is tagged beta. Nothing here is a stand-in for
// Storybook: what is read is what the preview's own store holds of each story file, as written.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, symlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findChrome } from '../lib/cdp.mjs';
import { budget, fixtureProject } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const TOOLS = join(ENGINE, 'test', '.storybook-tools', 'node_modules');
const CHROME = findChrome({ playwright: true });
const READY = CHROME && typeof WebSocket !== 'undefined' && existsSync(join(TOOLS, 'storybook')) && existsSync(join(TOOLS, '@storybook', 'vue3-vite'))
  ? false : 'no Chrome, or no Storybook build tools (npm ci --prefix test/.storybook-tools)';

let dir = null, r = null, button = null, badge = null;
before(async () => {
  if (READY) return;
  dir = fixtureProject(join(ENGINE, 'test', 'fixtures', 'harbor-ds'), 'storybook-docs-real-', { overlay: join(ENGINE, 'test', 'fixtures', 'harbor-stories') });
  symlinkSync(TOOLS, join(dir, 'node_modules'), 'dir');
  const built = spawnSync(join(TOOLS, '.bin', 'storybook'), ['build', '-o', 'storybook-static', '--quiet'], {
    cwd: dir, encoding: 'utf8', env: { ...process.env, STORYBOOK_DISABLE_TELEMETRY: '1', NO_COLOR: '1' }, timeout: budget(240000) });
  assert.equal(built.status, 0, `storybook build: ${built.stderr || built.stdout}`.slice(0, 1500));
  process.env.CHROME_PATH ??= CHROME;
  const { generateContracts } = await import('../lib/contract-gen.mjs');
  r = await generateContracts(dir, JSON.parse(readFileSync(join(dir, 'ds-config.json'), 'utf8')), { force: true });
  button = JSON.parse(readFileSync(join(r.outDir, 'button.contract.json'), 'utf8'));
  badge = JSON.parse(readFileSync(join(r.outDir, 'badge.contract.json'), 'utf8'));
});

test("each component's story file is read as the team wrote it, and the contract says where", { skip: READY, timeout: budget(600000) }, () => {
  assert.deepEqual(r.storybookRead.sort(), ['badge', 'button', 'disclosure', 'iconButton']);
  assert.equal(button.storybook.from, 'stories/Button.stories.js');
  assert.equal(button.storybook.description, 'The one action a person takes next on a page.');
  assert.deepEqual(button.storybook.examples.map((e) => e.name), ['Primary', 'Secondary', 'Large', 'Loading', 'Huge'], "every story an example, in the file's order");
  assert.deepEqual(button.storybook.examples[2].args, { size: 'Large', label: 'Continue' });
  assert.deepEqual(r.invalid, [], 'the contracts still validate');
});

test("a prop nobody else describes takes the story file's words, said to come from Storybook", { skip: READY, timeout: budget(600000) }, () => {
  const size = button.props.find((p) => p.name === 'size');
  assert.equal(size.description, 'Small in dense layouts, Large where the action leads the page.');
  assert.equal(size.descriptionFrom, 'storybook');
  assert.equal(size.bindings.code.default, 'Small', "the code's default is still the code's");
});

test('where the stories and the code or Figma disagree, each is said, and only those', { skip: READY, timeout: budget(600000) }, () => {
  const d = button.storybook.differs.map((x) => `${x.prop}: ${x.what}`).sort();
  assert.deepEqual(d, ['label: a different default', 'size: options Figma does not have', 'size: options the code does not have', 'tone: not in the code']);
  assert.deepEqual(button.storybook.differs.find((x) => x.prop === 'label'), { prop: 'label', what: 'a different default', storybook: 'Go', code: 'Continue' });
  assert.deepEqual(badge.storybook.differs, [], 'a story file that agrees says nothing');
  assert.deepEqual(r.storybookDiffers.map((x) => x.component), ['button']);
});

test("a tag that is a status becomes the contract's status", { skip: READY, timeout: budget(600000) }, () => {
  assert.deepEqual(badge.status, { state: 'experimental', source: 'storybook' }, 'beta is experimental');
  assert.equal(button.status, undefined, 'no tag, no status');
});

test("the first story is the guidelines' example when no product shows one", { skip: READY, timeout: budget(600000) }, async () => {
  const { storyExample } = await import('../lib/storybook-docs.mjs');
  const { exampleText } = await import('../lib/intent-examples.mjs');
  const e = storyExample(button, button.storybook.examples[0]);
  assert.equal(e.lang, 'vue');
  assert.match(e.code, /^<HbButton variant="Primary" label="Continue" \/>$/);
  assert.equal(exampleText(e), "The team's own story Primary, from stories/Button.stories.js, in Storybook:");
});

test('the reading is kept on the build, so a run with no browser reads it again', { skip: READY, timeout: budget(600000) }, async () => {
  const { storybookDocs, DOCS_FILE } = await import('../lib/storybook-docs.mjs');
  assert.ok(existsSync(join(dir, DOCS_FILE)));
  const again = await storybookDocs(dir, {}, { offline: true });
  assert.equal(again.titles['Components/Badge'].tags[0], 'beta');
});

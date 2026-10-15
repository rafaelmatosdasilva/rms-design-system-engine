// A Figma branch link names the branch: setup, and a link given later for a project already set up, read the branch,
// which stays as it is while the main file changes, so a long scan is not restarted by every edit on main.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { figmaFileKeyOf, figmaMainKeyOf } from '../figma-link.mjs';
import { route } from '../route.mjs';
import { bareEnv } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));

test('a branch link names the branch; a file link, an old /file/ link and a bare key name the file', () => {
  assert.equal(figmaFileKeyOf('https://www.figma.com/design/MainKey123/branch/BranchKey456/DS-Library?node-id=0-1'), 'BranchKey456');
  assert.equal(figmaMainKeyOf('https://www.figma.com/design/MainKey123/branch/BranchKey456/DS-Library'), 'MainKey123');
  assert.equal(figmaFileKeyOf('https://www.figma.com/design/MainKey123/DS-Library?node-id=0-1'), 'MainKey123');
  assert.equal(figmaMainKeyOf('https://www.figma.com/design/MainKey123/DS-Library'), null);
  assert.equal(figmaFileKeyOf('https://www.figma.com/file/OldKey789/DS'), 'OldKey789');
  assert.equal(figmaFileKeyOf(' RawKey000 '), 'RawKey000');
});

test('a Figma link to use from now on routes to the file switch; building and prototypes keep their own routes', () => {
  const P = { hasConfig: true, components: ['button'] };
  const url = 'https://www.figma.com/design/MainKey123/branch/BranchKey456/DS';
  assert.deepEqual(route(`scan from this Figma branch ${url}`, P).run, [`rms-design-system-engine --init --figma-url='${url}'`]);
  assert.deepEqual(route(`use this figma file https://www.figma.com/design/OtherKey/DS`, P).run, [`rms-design-system-engine --init --figma-url='https://www.figma.com/design/OtherKey/DS'`]);
  assert.notEqual(route(`prototype a settings page with ${url}`, P).recipe, 'refresh-figma');
});

test('setup with a branch link stores the branch; a project already set up takes a new link and keeps everything else', () => {
  const root = mkdtempSync(join(tmpdir(), 'figma-branch-'));
  writeFileSync(join(root, 'ds-config.json'), JSON.stringify({ figmaFileKey: 'MainKey123', themeCSS: 'theme.css', figma: { collections: ['Colors'] } }, null, 2));
  const run = (...a) => spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), ...a], { cwd: root, encoding: 'utf8', env: { ...bareEnv(), NO_COLOR: '1', FORCE_COLOR: '0', CI: '1' }, timeout: 120000 });
  let r = run('--init', '--figma-url=https://www.figma.com/design/MainKey123/branch/BranchKey456/DS?node-id=0-1');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /✓ The Figma file is now BranchKey456, a branch of MainKey123/);
  assert.match(r.stdout, /NEXT: refresh the Figma data/);
  const cfg = JSON.parse(readFileSync(join(root, 'ds-config.json'), 'utf8'));
  assert.deepEqual(cfg, { figmaFileKey: 'BranchKey456', themeCSS: 'theme.css', figma: { collections: ['Colors'] } });
  // The same link again changes nothing.
  r = run('--init', '--figma-url=https://www.figma.com/design/MainKey123/branch/BranchKey456/DS');
  assert.match(r.stdout, /already set up/);
});

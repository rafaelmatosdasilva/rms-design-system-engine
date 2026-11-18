// A team's own Storybook, built with real Storybook, as the pages the browser checks run on: parity, accessibility and
// behaviours, each story read as the Figma variant its args show.
//
// The stories are Harbor's (test/fixtures/harbor-stories, laid over harbor-ds), built with the Storybook pinned here
// the way CI installs it:
//   npm ci --prefix test/.storybook-tools
// Nothing here is a stand-in for Storybook: the index, the pages and the args are what `storybook build` wrote.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, symlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findChrome } from '../lib/cdp.mjs';
import { budget, fixtureProject } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const TOOLS = join(ENGINE, 'test', '.storybook-tools', 'node_modules');
const CHROME = findChrome({ playwright: true });
const READY = CHROME && typeof WebSocket !== 'undefined' && existsSync(join(TOOLS, 'storybook')) && existsSync(join(TOOLS, '@storybook', 'vue3-vite'))
  ? false : 'no Chrome, or no Storybook build tools (npm ci --prefix test/.storybook-tools)';

const run = (dir, script, args = []) => spawnSync(process.execPath, [join(ENGINE, 'lib', script), ...args], {
  cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', CHROME_PATH: CHROME }, timeout: budget(280000) });

// Harbor with its stories, and a disclosure a team added: Figma's annotation gives it its role, and only a page that
// runs its script can open it. Built once, as a team's CI builds it, and read by every test below.
let dir = null, a11y = null, said = '';
before(async () => {
  if (READY) return;
  dir = fixtureProject(join(ENGINE, 'test', 'fixtures', 'harbor-ds'), 'storybook-real-', { overlay: join(ENGINE, 'test', 'fixtures', 'harbor-stories') });
  const props = join(dir, 'figma', 'props.snapshot.json');
  writeFileSync(props, JSON.stringify({ ...JSON.parse(readFileSync(props, 'utf8')), disclosure: { nodeId: '9:1', properties: {}, annotations: [{ label: 'Role: disclosure' }] } }, null, 2));
  symlinkSync(TOOLS, join(dir, 'node_modules'), 'dir');
  const built = spawnSync(join(TOOLS, '.bin', 'storybook'), ['build', '-o', 'storybook-static', '--quiet'], {
    cwd: dir, encoding: 'utf8', env: { ...process.env, STORYBOOK_DISABLE_TELEMETRY: '1', NO_COLOR: '1' }, timeout: budget(240000) });
  assert.equal(built.status, 0, `storybook build: ${built.stderr || built.stdout}`.slice(0, 1500));
  const r = run(dir, 'a11y-check.mjs', ['--json-out', join(dir, 'a11y.json')]);
  said = `${r.stdout}\n${r.stderr}`;
  a11y = JSON.parse(readFileSync(join(dir, 'a11y.json'), 'utf8'));
});

test('a Storybook built to files is found with nothing set up, and its stories are the pages checked', { skip: READY, timeout: budget(600000) }, () => {
  assert.match(said, /reading the Storybook built in storybook-static on \d{4}-\d{2}-\d{2}/, said.slice(0, 800));
  assert.match(said, /9 page\(s\) found — checking 9, covering 4 of 4 components/);
  for (const page of ['Button · Primary', 'Badge · Danger', 'IconButton · Default', 'Disclosure · Closed']) assert.ok(a11y.target.includes(page), page);
});

// The args are Storybook's own, read from the page it drew: nothing here parses a story file.
test("each story's args are read from the page Storybook drew, as the Figma variant they are", { skip: READY, timeout: budget(600000) }, () => {
  const of = (label) => a11y.stories.find((s) => `${s.component} · ${s.state}` === label);
  assert.deepEqual(of('Button · Large').args, { size: 'Large', label: 'Continue' });
  assert.equal(of('Button · Large').variant, 'size=Large');
  assert.equal(of('Button · Secondary').variant, 'variant=Secondary');
  assert.equal(of('Badge · Danger').variant, 'Tone=Danger', 'tone in the code, Tone in Figma: the same property');
  for (const s of a11y.stories.filter((x) => !['Button · Loading', 'Button · Huge'].includes(`${x.component} · ${x.state}`))) assert.deepEqual(s.missing, [], `${s.component} · ${s.state}`);
});

test('a story that shows a state Figma has no variant for is named, and only those', { skip: READY, timeout: budget(600000) }, () => {
  const lines = said.split('\n').filter((l) => l.includes('[stories]'));
  assert.equal(lines.length, 2, lines.join('\n'));
  assert.match(lines.find((l) => l.includes('Button · Loading')) ?? '', /shows loading, a state Figma never draws for it/);
  assert.match(lines.find((l) => l.includes('Button · Huge')) ?? '', /size=Huge, which Figma's size does not list \(it has Small, Large\)/);
  assert.deepEqual(a11y.stories.find((s) => s.state === 'Huge').missing, [{ arg: 'size', value: 'Huge', prop: 'size', options: ['Small', 'Large'] }]);
});

// A behaviour needs the component's own script, which a story runs. That it passed is recorded too: a passing behaviour
// leaves no finding, so otherwise a behaviour never tried would read the same as one that worked.
test('behaviours run on a story: the disclosure opens there, as only its own script can open it', { skip: READY, timeout: budget(600000) }, () => {
  const tried = (a11y.behaviours ?? []).find((b) => b.page === 'Disclosure · Closed' && b.component === 'disclosure');
  assert.ok(tried, JSON.stringify(a11y.behaviours));
  assert.equal(tried.behaviour, 'click-expand');
  assert.equal(tried.ok, true);
});

// Parity reads the code capture. Harbor has no built page and no style guide, so before its stories every component was
// a bare element of its class, measured without its content. Each is now measured where the team draws it.
test('parity measures each component on its own story when nothing else draws it', { skip: READY, timeout: budget(600000) }, () => {
  const r = run(dir, 'code-capture.mjs', ['--force']);
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`.slice(0, 1500));
  assert.doesNotMatch(r.stdout, /browser reading failed/);
  const snap = JSON.parse(readFileSync(join(dir, '.design-system-engine-out', 'code.snapshot.json'), 'utf8'));
  assert.equal(snap.components.button.instance.page, 'Storybook · Button · Primary');
  assert.equal(snap.components.badge.instance.page, 'Storybook · Badge · Neutral');
  assert.equal(snap.components.iconButton.instance.page, 'Storybook · IconButton · Default');
  assert.equal(snap.components.button.props.height.value, '36px', "Figma's button is 36px high");
  assert.equal(snap.components.button.props.height.confidence, 'verified', 'the browser and the CSS agree');
  assert.equal(snap.components.badge.props.height.value, '20px');
});

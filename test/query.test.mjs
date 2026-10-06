// I22: ask the design system for one component or token, with the names exactly as written.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { flattenTokens, answer, answerLines } from '../query.mjs';
import { makeFixture } from './helpers.mjs';

const catalog = { components: {
  badge: { selector: '.hb-badge', props: {
    Tone: { type: 'enum', values: ['Neutral', 'Danger'], default: 'Neutral', codeName: 'tone', codeValues: ['neutral', 'danger'], rejected: { error: 'danger' } },
    label: { type: 'text', default: 'Draft', codeName: 'label' },
  }, whenNotToUse: 'for an action', useInstead: ['button'] },
  button: { selector: '.hb-button', props: { size: { type: 'enum', values: ['Small', 'Large'], default: 'Small', codeName: 'size' } }, neverCombineWith: ['button'] },
} };
const tokens = flattenTokens({ radius: { control: { $type: 'dimension', $value: '6px' } }, surface: { base: { color: { $type: 'color', $value: '#fff', $extensions: { 'com.rms.design-system-engine': { modes: { light: '#fff', dark: '#000' } } } } } } });
const varOf = (p) => '--hb-' + p.replace(/\/color$/, '').replace(/\//g, '-');

test('a component: the names as the code writes them, Figma\'s where they differ, and what not to write', () => {
  const lines = answerLines(answer('Badge', { catalog, tokens, varOf }));
  assert.deepEqual(lines, [
    'badge  (.hb-badge)',
    '  props, written exactly like this:',
    '    tone: neutral | danger   Figma: Tone = Neutral | Danger, default Neutral (not in parity with the code)',
    '      not: error (use danger)',
    '    label: text   default Draft',
    '  when not to use: for an action',
    '  use instead: button',
  ]);
  assert.match(answerLines(answer('.hb-button', { catalog, tokens, varOf })).join('\n'), /size: Small \| Large   default Small\n  never contains: button/);
});

test('a token by its path or its CSS variable; anything else names the closest', () => {
  assert.deepEqual(answerLines(answer('radius/control', { catalog, tokens, varOf })), ['radius/control  →  var(--hb-radius-control)  6px']);
  assert.deepEqual(answerLines(answer('--hb-surface-base', { catalog, tokens, varOf })), ['surface/base/color  →  var(--hb-surface-base)  light #fff · dark #000']);
  assert.deepEqual(answerLines(answer('radius', { catalog, tokens, varOf })), ['radius: no component or token of that name. Closest: radius/control']);
});

test('the command: several terms in one call, exit 1 when one is not found, 2 before the first audit', () => {
  const dir = makeFixture({ 'ds-config.json': { figma: { namingConvention: { prefix: '--hb-' } } }, 'contracts/catalog.json': catalog, 'contracts/tokens.json': { radius: { control: { $type: 'dimension', $value: '6px' } } } });
  const run = (...args) => spawnSync(process.execPath, [join(process.cwd(), 'query.mjs'), ...args], { cwd: dir, encoding: 'utf8' });
  const ok = run('badge', '--hb-radius-control');
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /tone: neutral \| danger/);
  assert.match(ok.stdout, /radius\/control  →  var\(--hb-radius-control\)  6px/);
  assert.match(ok.stdout, /NEXT: write the UI with these components and names, building nothing by hand that one of them covers, then check it with rms-design-system-engine --check-ui <file>/);
  assert.equal(run('badge', 'nothing').status, 1);
  assert.equal(JSON.parse(run('badge', '--json').stdout)[0].kind, 'component');
  const empty = spawnSync(process.execPath, [join(process.cwd(), 'query.mjs'), 'badge'], { cwd: makeFixture({ 'ds-config.json': {} }), encoding: 'utf8' });
  assert.equal(empty.status, 2);
  assert.match(empty.stdout, /no contracts\/catalog\.json yet/);
});

test('no catalog yet: --query runs the audit once to write it, then answers (never hands that step to the agent)', { timeout: 300000 }, async () => {
  const { fixtureProject } = await import('./helpers.mjs');
  const { spawnSync } = await import('node:child_process');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const { rmSync, existsSync } = await import('node:fs');
  const here = dirname(fileURLToPath(import.meta.url));
  const dir = fixtureProject(join(here, 'fixtures', 'demo-ds'), 'query-first-');
  rmSync(join(dir, 'contracts'), { recursive: true, force: true });
  const r = spawnSync(process.execPath, [join(here, '..', 'query.mjs'), '--query', 'chip'], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', CI: '1' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /No catalog yet: ran the audit once to write it/);
  assert.match(r.stdout, /size: M \| L/);
  assert.ok(existsSync(join(dir, 'contracts', 'catalog.json')));
  // Only once: the next question answers from the catalog.
  const again = spawnSync(process.execPath, [join(here, '..', 'query.mjs'), '--query', 'chip'], { cwd: dir, encoding: 'utf8' });
  assert.doesNotMatch(again.stdout, /No catalog yet/);
});

test('--check-ui on a page checks it as an edit (what changed since the last commit), never fails it as JSON', async () => {
  const { fixtureProject } = await import('./helpers.mjs');
  const { readFileSync, writeFileSync } = await import('node:fs');
  const dir = fixtureProject(join(import.meta.dirname, 'fixtures', 'demo-ds'), 'check-ui-page-');   // committed as it is
  const run = () => spawnSync(process.execPath, [join(import.meta.dirname, '..', 'audit.mjs'), '--check-ui', 'apps/gallery/ui.html'], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  let r = run();
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /✅ apps\/gallery\/ui\.html: what changed since the last commit uses only the system/);
  const page = join(dir, 'apps', 'gallery', 'ui.html');
  writeFileSync(page, readFileSync(page, 'utf8').replace('</body>', '<span style="color:#2e7d32">Saved</span></body>'));
  r = run();
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /#2e7d32 is not a design-system colour/);
  assert.doesNotMatch(r.stdout, /not valid JSON/);
});

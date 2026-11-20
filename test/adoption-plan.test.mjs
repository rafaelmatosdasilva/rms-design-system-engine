import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { adoptionPlan, planLines, planMarkdown, sizeOf, ANSWERS } from '../lib/adoption-plan.mjs';
import { route } from '../lib/route.mjs';
import { fixtureProject, budget } from './helpers.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const departure = {
  gap: { uses: '2.1.0', latest: '4.0.0', majors: 2, minors: 3, days: 40 },
  forks: [{ file: 'apps/shop/cart.css', line: 4, cls: '.shop-btn', like: 'Button' }],
  parallels: [{ file: 'apps/shop/Modal.vue', line: 1, name: 'Modal', like: 'Dialog' }, { file: 'apps/shop/ShopButton.vue', line: 1, name: 'ShopButton', like: 'Button' }],
};
const census = { files: [
  { file: 'apps/shop/a.css', findings: [{ line: 1, kind: 'colour', value: '#0055ff', token: '--color-primary' }, { line: 2, kind: 'colour', value: '#0055ff', token: '--color-primary' }, { line: 3, kind: 'spacing', value: '13px', token: null }] },
  { file: 'apps/shop/b.css', findings: [{ line: 7, kind: 'spacing', value: '13px', token: null }, { line: 9, kind: 'spacing', value: '13px', token: null }, { line: 11, kind: 'radius', value: '7px', token: null }] },
] };

test('four answers, each saying who acts', () => {
  assert.deepEqual(Object.keys(ANSWERS), ['use', 'ask', 'keep', 'upgrade']);
  for (const a of Object.values(ANSWERS)) assert.ok(a.word && a.who);
  assert.deepEqual([1, 3, 4, 15, 16].map(sizeOf), ['S', 'S', 'M', 'M', 'L']);
});

test('each finding gets its answer, its places and its size', () => {
  const plan = adoptionPlan({ product: 'shop', departure, census, latest: '4.0.0' });
  const by = (a) => plan.items.filter((i) => i.answer === a);
  const tok = by('use').find((i) => i.use === '--color-primary');
  assert.deepEqual(tok.places, ['apps/shop/a.css:1', 'apps/shop/a.css:2']);
  const btn = by('use').find((i) => i.use === 'Button');
  assert.deepEqual(btn.places, ['apps/shop/cart.css:4', 'apps/shop/ShopButton.vue:1']);
  assert.match(btn.what, /a copy of its styles and its own ShopButton where the system has Button/);
  assert.ok(by('use').some((i) => i.use === 'Dialog'));
  // A value with no token, seen three times or more, is likely a token the system lacks: the system's team answers.
  assert.equal(by('ask').length, 1);
  assert.match(by('ask')[0].what, /spacing 13px/);
  assert.equal(by('keep').length, 1);
  assert.equal(by('upgrade')[0].size, 'L');
});

test('the steps put what needs no decision first, and each ends on the check that says done', () => {
  const plan = adoptionPlan({ product: 'shop', departure, census });
  assert.deepEqual(plan.steps.map((s) => s.title), ['Move onto the latest version', 'Say each value with the system\'s token', 'Use the system\'s components', 'Ask the system for what it lacks', 'Decide what stays']);
  assert.match(plan.steps[1].done, /--census lists no value in shop that a token says/);
  assert.match(plan.steps[3].done, /drawn in Figma before it is built in code/);
  const lines = planLines(plan).join('\n');
  assert.match(lines, /🧭 Adoption plan · shop: 6 items in 5 steps/);
  assert.match(lines, /Done when/);
  const md = planMarkdown(plan);
  assert.match(md, /\| Use the system's \| the product's team \| 3 \|/);
  assert.match(md, /`apps\/shop\/ShopButton\.vue:1`/);
  assert.match(md, /changes nothing/);
});

test('with nothing read about a product, it says what it did not see rather than plan on a guess', () => {
  const plan = adoptionPlan({ product: 'shop' });
  assert.equal(plan.items.length, 0);
  assert.equal(plan.unseen.length, 2);
  assert.match(planLines(plan)[0], /nothing to move/);
});

test('adoption requests reach --adoption-plan, with the product named', () => {
  assert.deepEqual(route('make an adoption plan for shop').run, ['rms-design-system-engine --adoption-plan shop']);
  assert.deepEqual(route('what would it take to move shop onto the design system?').run, ['rms-design-system-engine --adoption-plan shop']);
  assert.deepEqual(route('plano de adoção para o shop').run, ['rms-design-system-engine --adoption-plan shop']);
  assert.deepEqual(route('what should we fix first?').run, ['rms-design-system-engine']);
});

test('--adoption-plan reads a product\'s own styles, writes the plan, and changes nothing in the product', () => {
  const dir = fixtureProject(join(HERE, 'fixtures', 'demo-ds'), 'adoption-');
  mkdirSync(join(dir, 'apps', 'shop'), { recursive: true });
  const css = '.shop-cta { background: #ff6600; padding: 13px; border-radius: 7px; }\n.promo { color: #ff6600; }\n';
  writeFileSync(join(dir, 'apps', 'shop', 'shop.css'), css);
  const cfg = JSON.parse(readFileSync(join(dir, 'ds-config.json'), 'utf8'));
  writeFileSync(join(dir, 'ds-config.json'), JSON.stringify({ ...cfg, pluginDirs: { ...(cfg.pluginDirs ?? {}), shop: 'apps/shop' } }, null, 2));
  const r = spawnSync(process.execPath, [join(HERE, '..', 'audit.mjs'), '--adoption-plan', 'shop'], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' }, timeout: budget(120000) });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /🧭 Adoption plan · shop/);
  assert.match(r.stdout, /#ff6600 typed by hand/);
  assert.match(r.stdout, /Not seen: the product's copies/);
  assert.match(readFileSync(join(dir, '.design-system-engine-out', 'handback', 'adoption-shop.md'), 'utf8'), /# Adoption plan: shop/);
  assert.equal(readFileSync(join(dir, 'apps', 'shop', 'shop.css'), 'utf8'), css);
  const none = spawnSync(process.execPath, [join(HERE, '..', 'audit.mjs'), '--adoption-plan', 'nope'], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' }, timeout: budget(60000) });
  assert.match(none.stdout, /No product is called nope\. The products named: .*shop/);
});

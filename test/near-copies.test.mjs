// I83: a new component is a decision. A class a product styles almost as the system styles one of its components goes
// back to the person: use the component (a new option if it needs one), or add the new one to the system on purpose.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname, basename } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { classRules, nearCopies, systemRules, productCopies } from '../system-advice.mjs';
import { editCheck } from '../edit-check.mjs';
import { makeFixture, fixtureProject } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const system = '.button { display: inline-flex; padding: 4px 12px; border-radius: 6px; background: var(--button-background); color: var(--button-text); font: inherit; }\n.chip { display: inline-flex; }\n';

test('a class rule\'s declarations, and the system component it nearly copies', () => {
  const rules = classRules('/* a note */\n.promo {\n  display: inline-flex;\n  padding: 4px 12px;\n}\n.promo { color: red; }\n.card .promo { margin: 0; }\n@media (min-width: 1px) { .x { a: b; } }');
  assert.deepEqual([...rules.keys()], ['promo', 'x']);
  assert.deepEqual([...rules.get('promo').decls], ['display: inline-flex', 'padding: 4px 12px', 'color: red']);
  assert.equal(rules.get('promo').line, 2);
  const { system: targets, own } = systemRules(system, { button: '.button', chip: '.chip', field: '.field' });
  assert.deepEqual([...targets.keys()], ['button', 'chip']);
  assert.deepEqual([...own], ['button', 'chip', 'field']);
  // One declaration of six changed is a copy; two of six is a component of its own; the system's own class is no copy.
  const of = (css) => nearCopies(classRules(css), targets, { own }).map((x) => [x.cls, x.like, x.same, x.of, x.differ.join()]);
  assert.deepEqual(of('.promoButton { display: inline-flex; padding: 4px 12px; border-radius: 6px; background: var(--accent); color: var(--button-text); font: inherit; }'), [['promoButton', 'button', 5, 6, 'background']]);
  assert.deepEqual(of('.tile { display: inline-flex; padding: 8px; border-radius: 6px; background: var(--accent); color: var(--button-text); font: inherit; }'), []);
  assert.deepEqual(of('.button { display: inline-flex; padding: 4px 12px; border-radius: 6px; background: var(--b); color: var(--button-text); font: inherit; }'), []);
  assert.deepEqual(of('.dot { display: inline-flex; }'), [], 'too short to say');
});

test('across the products: their stylesheets and the style blocks of their pages, with the file and line', () => {
  const products = { '../shop': [
    { file: '../shop/promo.css', text: '\n.buy { display: inline-flex; padding: 4px 12px; border-radius: 6px; background: var(--button-background); color: var(--button-text); font: inherit; }' },
    { file: '../shop/page.html', text: '<main>\n<style>\n.go { display: inline-flex; padding: 4px 12px; border-radius: 6px; background: var(--x); color: var(--button-text); font: inherit; }\n</style>\n</main>' },
    { file: '../shop/app.js', text: 'const css = ".z { display: inline-flex; }";' },
  ] };
  assert.deepEqual(productCopies(products, system, { button: '.button' }).map((x) => `${x.product} ${x.file}:${x.line} .${x.cls} ${x.like}`), ['../shop ../shop/promo.css:2 .buy button', '../shop ../shop/page.html:3 .go button']);
});

test('the edit check: a rule the edit adds that nearly copies a system component is a decision, said at once', () => {
  const dir = makeFixture({
    'ds-config.json': { paths: { themeCSS: 'src/theme.css' } },
    'src/theme.css': ':root { --button-background: #1f5fd6; --button-text: #fff; }\n',
    'src/components/button.css': system,
    'contracts/catalog.json': { components: { button: { props: {} }, chip: { props: {} } } },
  });
  try {
    const rule = '.saveButton {\n  display: inline-flex;\n  padding: 4px 12px;\n  border-radius: 6px;\n  background: var(--button-background);\n  color: var(--button-text);\n  font: 600 14px/1 inherit;\n}\n';
    const write = { tool_name: 'Write', tool_input: { file_path: join(dir, 'src/pages/save.css'), content: rule } };
    mkdirSync(join(dir, 'src/pages'), { recursive: true }); writeFileSync(join(dir, 'src/pages/save.css'), rule);
    const r = editCheck(write, { root: dir, cfg: { paths: { themeCSS: 'src/theme.css' } }, headOf: () => null });
    assert.match(r, /\n  save\.css:1  \.saveButton nearly copies the system's button \(5 of 6 declarations alike\); a new component is a decision: use button, with a new option if it needs one, or ask the person whether to add \.saveButton to the system\n/);
    assert.match(r, /\nUse the system's component instead, or ask the person whether the new one belongs in the system\. Never keep a copy without asking\.$/);
    // A rule of the component's own, and one the edit did not add, stay silent; so does a project that turns advice off.
    const own = { tool_name: 'Edit', tool_input: { file_path: join(dir, 'src/pages/save.css'), old_string: '}', new_string: '}\n.note { margin: 0; }' } };
    writeFileSync(join(dir, 'src/pages/save.css'), `${rule}.note { margin: 0; }\n`);
    assert.equal(editCheck(own, { root: dir, cfg: { paths: { themeCSS: 'src/theme.css' } }, headOf: () => rule }), null);
    assert.equal(editCheck(write, { root: dir, cfg: { paths: { themeCSS: 'src/theme.css' }, systemHealth: false }, headOf: () => null }), null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the audit says it under System health, and the style guide puts it in the component\'s To do as a decision', { timeout: 300000 }, async (t) => {
  const dir = fixtureProject(join(ENGINE, 'test', 'fixtures', 'tidepool-figma'), 'tp-copy-'), shop = `${dir}-shop`;
  try {
    const ref = join(ENGINE, 'test', 'skill-evals', 'build-reference');
    for (const p of ['src/styles/tokens.css', 'src/components/button.css', 'src/components/Button.jsx']) { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), readFileSync(join(ref, p), 'utf8')); }
    const cfg = JSON.parse(readFileSync(join(dir, 'ds-config.json'), 'utf8'));
    writeFileSync(join(dir, 'ds-config.json'), JSON.stringify({ ...cfg, pluginDirs: { shop: `../${basename(shop)}` } }));
    // The shop's own button: the system's, with its background changed.
    const btn = readFileSync(join(dir, 'src/components/button.css'), 'utf8');
    const body = /\.button\s*\{([^{}]*)\}/.exec(btn)[1];
    const decls = body.split(';').map((d) => d.trim()).filter(Boolean);
    assert.ok(decls.length >= 5, 'the button has a rule to copy');
    const copy = decls.map((d) => (/^background(-color)?\s*:/.test(d) ? 'background: #c2185b' : d)).join(';\n  ');
    mkdirSync(shop, { recursive: true });
    writeFileSync(join(shop, 'shop.css'), `/* the shop's own */\n.shopButton {\n  ${copy};\n}\n`);
    writeFileSync(join(shop, 'index.html'), '<link rel="stylesheet" href="shop.css">\n<button class="shopButton">Buy</button>\n');
    const r = spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--styleguide', '--no-a11y-bake'], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
    const html = readFileSync(join(dir, '.design-system-engine-out/styleguide/index.html'), 'utf8');
    const data = JSON.parse(html.match(/id="sg-data">([\s\S]*?)<\/script>/)[1]);
    const button = (data.allComponents ?? data.components).find((c) => c.name === 'button');
    assert.deepEqual(button?.copies?.map((x) => [x.product, x.file, x.line, x.cls]), [[basename(shop), 'shop.css', 2, 'shopButton']], r.stdout.slice(-2000));
    assert.ok(button.copies[0].same >= decls.length - 1);
    // On the To do page: a row under button, a decision for the person.
    const { findChrome, launchChrome, connectCDP, openPage, waitForTrue, FILE_PAGE_LOADED } = await import('../cdp.mjs');
    const chromePath = findChrome({ playwright: true });
    if (!chromePath || typeof WebSocket === 'undefined') { t.skip('no Chrome'); return; }
    const c = await launchChrome(chromePath);
    try {
      const { send, close } = await connectCDP(c.wsUrl);
      const { sessionId } = await openPage(send, `file://${join(dir, '.design-system-engine-out/styleguide/index.html')}#todo`);
      await waitForTrue(send, sessionId, FILE_PAGE_LOADED);
      const run = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true }, sessionId)).result.value;
      let row = '';
      for (let n = 0; n < 100 && !row; n++) { if (n) await new Promise((r) => setTimeout(r, 100)); row = await run(`(document.querySelector('#todo tr[data-area="Products"]') || {}).textContent || ''`); }
      assert.match(row, /^\d+[\w-]+-shop\.shopButton shop\.css:2You decide[\w-]+-shop's \.shopButton is nearly button \(\d+ of \d+ declarations alike; it differs in background[^)]*\)\.Decide: use button in [\w-]+-shop, with a new option if it needs one, or add \.shopButton to the system on purpose\. Tell Claude which\./);
      assert.match(await run(`document.querySelector('#todo tr[data-area="Products"]').closest('.pg-par-card').querySelector('.pg-inspect-head').textContent`), /^button$/);
      close();
    } finally { c.kill(); }
    const audit = spawnSync(process.execPath, [join(ENGINE, 'audit.mjs')], { cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
    assert.match(audit.stdout, /1 class in the products nearly copies a system component\. For each, decide: use the component \(with a new option if it needs one\), or add the new one to the system on purpose:\n\s+· \.\.\/[\w-]+-shop\/shop\.css:2 {2}\.shopButton is nearly button \(\d+ of \d+ declarations alike; differs in background/);
  } finally { rmSync(dir, { recursive: true, force: true }); rmSync(shop, { recursive: true, force: true }); }
});

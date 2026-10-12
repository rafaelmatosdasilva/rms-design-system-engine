// H5: every check tested with a mistake planted on purpose. Each check is run on a copy of the demo design system,
// set up so it has something to read, once clean and once with one known mistake (a wrong colour, a removed state, a
// missing name, one per check), and must pass the first and catch the second. A check that passes what it never read
// fails here: with nothing to read it says Not run, never Pass.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, spawn, execFileSync } from 'node:child_process';
import { bareEnv, fixtureProject, normalise } from './helpers.mjs';

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = join(ENGINE, 'test', 'fixtures', 'demo-ds');

// Each check's status in the gate summary, and what its own section says.
const gates = (out) => Object.fromEntries([...out.matchAll(/^\s+(✅|❌|⏭|⚠️)\s+\[(\d+)\]\s+(.+?)\s{2,}(\S.*)$/gm)].map((m) => [Number(m[2]), m[4].trim()]));
const section = (out, n) => { const a = out.indexOf(`  [${n}] `); const b = out.indexOf(`  [${n + 1}] `, a + 1); return a < 0 ? '' : out.slice(a, b < 0 ? a + 3000 : b); };
const edit = (dir, file, fn) => { const p = join(dir, file); writeFileSync(p, fn(readFileSync(p, 'utf8'))); };
const put = (dir, file, text) => { mkdirSync(dirname(join(dir, file)), { recursive: true }); writeFileSync(join(dir, file), text); };
const config = (dir, fn) => edit(dir, 'ds-config.json', (t) => JSON.stringify(fn(JSON.parse(t)), null, 2));
const contract = (dir, code) => edit(dir, 'structure-contract.mjs', (t) => `${t}\n${code}\n`);
const css = (dir, from, to) => edit(dir, 'src/theme.css', (t) => { assert.ok(t.includes(from), `the theme holds ${from}`); return t.replace(from, to); });
const commit = (dir) => { execFileSync('git', ['add', '-A'], { cwd: dir }); execFileSync('git', ['-c', 'user.name=d', '-c', 'user.email=d@e', 'commit', '-qm', 'x', '--allow-empty'], { cwd: dir }); };
const audit = (dir, env) => {
  const r = spawnSync(process.execPath, [join(ENGINE, 'audit.mjs')], { cwd: dir, encoding: 'utf8', env: { ...env, NO_COLOR: '1', FORCE_COLOR: '0', CI: '1' }, timeout: 300000 });
  const out = normalise((r.stdout ?? '') + (r.stderr ?? ''), dir);
  return { out, gates: gates(out) };
};
// The set-up copy is audited twice (a check that keeps a baseline writes it on the first run), then the mistake.
function plant({ setup = null, fault, env = bareEnv() }) {
  const dir = fixtureProject(FIXTURE, 'planted-');
  if (setup) setup(dir);
  commit(dir);
  audit(dir, env);
  commit(dir);
  const clean = audit(dir, env);
  fault(dir);
  commit(dir);
  return { clean, bad: audit(dir, env) };
}

const BUTTON_BOX = '  height: 32px; box-sizing: border-box; flex-shrink: 0;\n  padding: var(--padding-xs) var(--padding-m);';
const PAGES = (c) => ({ ...c, paths: { ...c.paths, pluginCSS: ['apps/gallery/ui.html'] } });
const SAVE_ID = (d) => edit(d, 'apps/gallery/ui.html', (t) => t.replace('<button class="tp-button" type="button">Save</button>', '<button id="save" class="tp-button" type="button">Save</button>'));

// gate → { what (the mistake), setup (what the check needs to read), fault, finding (in its section) }. A check the
// demo already fails (token values, props) is planted a second mistake and must name it.
const CASES = {
  1: { what: 'a Figma snapshot a year old', fault: (d) => edit(d, 'src/figma-vars.snapshot.json', (t) => t.replace(/"_updated": "[^"]*"/, '"_updated": "2020-01-01T00:00:00.000Z"')), finding: /figma-vars\.snapshot\.json/ },
  3: { what: 'a token with another value than Figma\'s', fault: (d) => css(d, '--padding-m: 12px;', '--padding-m: 14px;'), finding: /padding\/m/ },
  4: { what: 'a token bound on a screen with no CSS variable', setup: (d) => { config(d, (c) => ({ ...c, frames: [{ name: 'Gallery', nodeId: '1:1' }] })); put(d, 'bound-tokens.json', JSON.stringify(['chip/text/color', 'padding/s'])); },
       fault: (d) => put(d, 'bound-tokens.json', JSON.stringify(['chip/text/color', 'padding/s', 'chip/glow/color'])), finding: /chip\/glow\/color/ },
  5: { what: 'a token that keeps its light value in dark', fault: (d) => css(d, '  --chip-text: #eef2f8;\n', ''), finding: /chip/ },
  6: { what: 'an exception for a token Figma does not have', setup: (d) => put(d, 'design-system-engine-map.mjs', "export const SKIP_TOKENS = new Set(['chip/text/color']);\n"),
       fault: (d) => put(d, 'design-system-engine-map.mjs', "export const SKIP_TOKENS = new Set(['chip/text/color', 'chip/glow/color']);\n"), finding: /chip\/glow\/color/ },
  7: { what: 'a CSS variable Figma does not have', fault: (d) => css(d, '  --stroke-default: 1px;\n', '  --stroke-default: 1px;\n  --chip-glow-made-up: 2px;\n'), finding: /--chip-glow-made-up/ },
  8: { what: 'a document using a variable that does not exist', setup: (d) => { config(d, (c) => ({ ...c, docs: { surfaces: ['docs/chip.html'] } })); put(d, 'docs/chip.html', '<style>.x { color: var(--chip-text); padding: var(--padding-s); }</style><p>Chip</p>\n'); },
       fault: (d) => put(d, 'docs/chip.html', '<style>.x { color: var(--chip-text); padding: var(--padding-s); border-radius: var(--radius-sm); }</style><p>Chip</p>\n'), finding: /--radius-sm/ },
  9: { what: 'upper case the design never asked for', fault: (d) => css(d, '.tp-chip .tp-chip__label { white-space: nowrap; }', '.tp-chip .tp-chip__label { white-space: nowrap; text-transform: uppercase; }'), finding: /uppercase/ },
  10: { what: 'a button built by hand on a page', setup: (d) => config(d, (c) => ({ ...c, reimplementationSurfaces: ['apps/gallery/ui.html'], reimplementationStrict: true })),
        fault: (d) => edit(d, 'apps/gallery/ui.html', (t) => t.replace('</main>', '  <button class="my-save" type="button" style="background: #1f5fd6; border-radius: 8px; padding: 4px 12px; border: 0">Send</button>\n</main>')), finding: /my-save/ },
  11: { what: 'a token no rule uses any more', fault: (d) => css(d, 'background: var(--chip-background); color: var(--chip-text);', 'background: var(--chip-background); color: #1b2433;'), finding: /unused.*--chip-text/ },
  12: { what: 'a rule of one component reaching into the elements inside it', fault: (d) => edit(d, 'src/theme.css', (t) => `${t}\n.tp-field span { color: var(--text-primary); }\n`), finding: /tp-field span/ },
  13: { what: 'a border Figma does not draw', fault: (d) => css(d, 'border: 0; border-radius: var(--radii-chip);', 'border: 1px solid var(--chip-text); border-radius: var(--radii-chip);'), finding: /chip.*(phantom|no stroke)/i },
  14: { what: 'a hover state removed', fault: (d) => css(d, '.tp-button:hover { background: var(--button-background-hover); }', ''), finding: /hover/i },
  15: { what: 'a prop the code no longer has', fault: (d) => edit(d, 'src/components/Chip.jsx', (t) => t.replace("Chip({ label = 'Filter',", "Chip({ text = 'Filter',")), finding: /chip: Figma property "Label" has no code prop/ },
  16: { what: 'a component no longer holding the one Figma nests in it', setup: (d) => { put(d, 'component-composition.snapshot.json', JSON.stringify({ field: ['button'] })); put(d, 'src/components/Field.jsx', "import { Button } from './Button.jsx';\nexport function Field({ label = 'Name' }) {\n  return <label className=\"tp-field\">{label} <input className=\"tp-field__input\" /><Button label=\"Clear\" /></label>;\n}\n"); config(d, (c) => ({ ...c, componentFiles: { ...c.componentFiles, field: 'src/components/Field.jsx' } })); },
        fault: (d) => put(d, 'src/components/Field.jsx', "export function Field({ label = 'Name' }) {\n  return <label className=\"tp-field\">{label} <input className=\"tp-field__input\" /></label>;\n}\n"), finding: /field: Figma nests "button"/ },
  17: { what: 'a page no longer using a component its Figma template has', setup: (d) => { config(d, (c) => ({ ...c, templates: [{ name: 'Gallery', nodeId: '9:9', file: 'apps/gallery/ui.html' }], templateCompositionStrict: true })); put(d, 'figma-templates.snapshot.json', JSON.stringify({ templates: { Gallery: { name: 'Gallery', nodeId: '9:9', components: ['button', 'chip'] } } })); },
        fault: (d) => edit(d, 'apps/gallery/ui.html', (t) => t.replace(/ {2}<button class="tp-chip"[^\n]*\n/, '')), finding: /Gallery: Figma composes "chip"/ },
  18: { what: 'a page\'s markup changed', setup: (d) => config(d, PAGES), fault: SAVE_ID, finding: /\+ ids:\s+save/ },
  19: { what: 'a component slot holding another component', setup: (d) => { config(d, PAGES); SAVE_ID(d); contract(d, "export const COMPONENT_USAGES = [{ plugin: 'gallery', selector: '#save', expectedClass: 'tp-button' }];"); },
        fault: (d) => edit(d, 'apps/gallery/ui.html', (t) => t.replace('<button id="save" class="tp-button"', '<button id="save" class="tp-chip"')), finding: /#save: expected class "tp-button", got "tp-chip"/ },
  20: { what: 'a pseudo-element writing content no one documented', fault: (d) => edit(d, 'src/theme.css', (t) => `${t}\n.tp-chip__label::after { content: '!'; }\n`), finding: /tp-chip__label::after/ },
  21: { what: 'a transition slower than the contract', setup: (d) => { contract(d, "export const TRANSITION_CONTRACT = { '.tp-button': 'background 150ms ease' };"); css(d, 'background: var(--button-background); color: var(--button-text);', 'background: var(--button-background); color: var(--button-text);\n  transition: background 150ms ease;'); },
        fault: (d) => css(d, 'transition: background 150ms ease;', 'transition: background 300ms ease;'), finding: /\.tp-button: missing \[ background <DUR> ease \]/ },
  22: { what: 'a motion variable with another value than Figma\'s', setup: (d) => { config(d, (c) => ({ ...c, figma: { ...c.figma, motion: { explicit: { 'motion/duration/fast': '--motion-duration-fast' } } } })); edit(d, 'src/figma-vars.snapshot.json', (t) => JSON.stringify({ ...JSON.parse(t), motion: { 'motion/duration/fast': '150ms' } }, null, 2)); css(d, '  --stroke-default: 1px;\n', '  --stroke-default: 1px;\n  --motion-duration-fast: 150ms;\n'); },
        fault: (d) => css(d, '--motion-duration-fast: 150ms;', '--motion-duration-fast: 200ms;'), finding: /motion\/duration\/fast/ },
  23: { what: 'a shadow with another value than Figma\'s', setup: (d) => { config(d, (c) => ({ ...c, figma: { ...c.figma, effects: { explicit: { 'elevation/1': '--elevation-1' } } } })); edit(d, 'src/figma-vars.snapshot.json', (t) => JSON.stringify({ ...JSON.parse(t), effects: { 'elevation/1': '0px 1px 2px 0px rgba(0, 0, 0, 0.2)' } }, null, 2)); css(d, '  --stroke-default: 1px;\n', '  --stroke-default: 1px;\n  --elevation-1: 0px 1px 2px 0px rgba(0, 0, 0, 0.2);\n'); },
        fault: (d) => css(d, '--elevation-1: 0px 1px 2px 0px rgba(0, 0, 0, 0.2);', '--elevation-1: 0px 4px 8px 0px rgba(0, 0, 0, 0.2);'), finding: /elevation\/1/ },
  25: { what: 'a component no check models', setup: (d) => config(d, (c) => ({ ...c, coverageStrict: true })),
        fault: (d) => edit(d, 'structure-contract.mjs', (t) => t.replace(/ {2}field: \{[\s\S]*?\n {2}\},\n\};/, '};').replace("  field: { main: '.tp-field' },\n", '')), finding: /UNCHECKED[\s\S]*field/ },
};

// The checks that already fail on the demo (a planted difference of its own) must name the new mistake too.
const ALREADY = new Set([3, 15]);
for (const [n, c] of Object.entries(CASES)) {
  const g = Number(n);
  test(`[${g}] catches ${c.what}`, { timeout: 120000 }, () => {
    const { clean, bad } = plant(c);
    if (!ALREADY.has(g)) assert.equal(clean.gates[g], 'Pass', `set up, it reads something and passes:\n${section(clean.out, g)}`);
    assert.equal(bad.gates[g], 'Fail', `the mistake is caught:\n${section(bad.out, g)}`);
    assert.match(section(bad.out, g), c.finding, 'and named');
    if (ALREADY.has(g)) assert.doesNotMatch(section(clean.out, g), c.finding, 'named only once the mistake is there');
  });
}

// The browser check, with Chrome: a component drawn 30px high where Figma has 32px.
test('[24] catches a component drawn at another height than Figma\'s', { timeout: 180000 }, async (t) => {
  const { findChrome } = await import('../cdp.mjs');
  const chrome = process.env.CHROME_PATH || findChrome({ playwright: true });
  if (!chrome) { t.skip('no Chrome'); return; }
  const { clean, bad } = plant({ env: { ...process.env, CHROME_PATH: chrome }, setup: (d) => config(d, (c) => ({ ...c, rendered: { auto: true } })),
    fault: (d) => css(d, BUTTON_BOX, BUTTON_BOX.replace('height: 32px', 'height: 30px')) });
  assert.equal(clean.gates[24], 'Pass', section(clean.out, 24));
  assert.equal(bad.gates[24], 'Fail');
  assert.match(section(bad.out, 24), /\.tp-button → height: rendered "30px" ≠ expected "32px"/);
});

// The Figma frame check needs Figma's images API: its script runs here against a stand-in that serves the frame's
// image, and must catch the frame once the image changes.
test('[2] catches a Figma frame that changed since its reference', { timeout: 60000 }, async () => {
  const dir = fixtureProject(FIXTURE, 'planted-frame-');
  config(dir, (c) => ({ ...c, figmaFileKey: 'KEY', frames: [{ name: 'Gallery', nodeId: '1:2' }] }));
  put(dir, 'frame.png', 'first');
  const server = join(dir, 'stand-in.mjs');
  writeFileSync(server, `import { createServer } from 'node:http'; import { readFileSync } from 'node:fs';
const s = createServer((q, r) => { if (q.url.startsWith('/v1/images/')) { r.end(JSON.stringify({ images: { '1:2': 'http://127.0.0.1:' + s.address().port + '/img' } })); } else r.end(readFileSync(${JSON.stringify(join(dir, 'frame.png'))})); });
s.listen(0, '127.0.0.1', () => console.log(s.address().port));`);
  const child = spawn(process.execPath, [server], { stdio: ['ignore', 'pipe', 'inherit'] });
  try {
    const port = await new Promise((ok) => child.stdout.once('data', (b) => ok(String(b).trim())));
    const run = () => spawnSync(process.execPath, [join(ENGINE, 'visual-regression-check.mjs')], { cwd: dir, encoding: 'utf8', env: { ...bareEnv(), FIGMA_TOKEN: 'stand-in', DESIGN_SYSTEM_ENGINE_FIGMA_API: `http://127.0.0.1:${port}` } });
    let r = run();
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.ok(existsSync(join(dir, '.design-system-engine-refs', '1-2.png')) || /reference/i.test(r.stdout), r.stdout);
    r = run();
    assert.equal(r.status, 0, 'the same frame passes');
    assert.match(r.stdout, /✅/);
    writeFileSync(join(dir, 'frame.png'), 'second');
    r = run();
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /Gallery/);
  } finally { child.kill(); }
});

// With nothing to read a check says Not run, with why, never Pass: on the demo as it is, each of these has nothing.
test('a check that read nothing is Not run, never Pass', { timeout: 60000 }, () => {
  const dir = fixtureProject(FIXTURE, 'planted-none-');
  const { out, gates: g } = audit(dir, bareEnv());
  for (const n of [2, 4, 6, 8, 10, 17, 18, 19, 21, 22, 23, 24]) assert.equal(g[n], 'Not run', `[${n}] read nothing:\n${section(out, n)}`);
  assert.match(out, /\[4\]\s+Tokens used in screens exist in CSS\s+Not run\n\s+Not verified: no frames\[\] configured/);
  for (const n of [1, 5, 7, 9, 11, 12, 13, 14, 20, 25]) assert.equal(g[n], 'Pass', `[${n}] read the demo`);
  // A page that cannot be read (paths.pluginCSS names none) is not fingerprinted: never a baseline written, never a pass.
  assert.match(section(out, 18), /no product page to read \(paths\.pluginCSS names none\): the markup is not checked/);
});

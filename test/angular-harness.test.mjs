// A design system's Angular components compiled by the project's own Angular compiler and drawn by its own Angular,
// in a real browser.
//
// The Angular tests use what an Angular project installs (its compiler, its builder, which brings Vite, and Angular),
// laid in a gitignored folder as CI does:
//   npm ci --prefix test/.angular-tools
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startAngularHarness, renderedAngular, angularBuild, compileAngular, harnessModule, bareImports } from '../lib/angular-harness.mjs';
import { codeComponents } from '../lib/component-source.mjs';
import { variantsFromCode } from '../lib/component-harness.mjs';
import { findChrome, launchChrome, connectCDP, openPage, waitForTrue } from '../lib/cdp.mjs';
import { budget, tempDir } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const FIXTURE = join(ENGINE, 'test', 'fixtures', 'acme-angular');
const TOOLS = join(ENGINE, 'test', '.angular-tools', 'node_modules');
const CHROME = findChrome({ playwright: true });
const HAS_TOOLS = ['@angular/core', '@angular/compiler-cli', '@angular/platform-browser', '@angular/build'].every((p) => existsSync(join(TOOLS, p)));
const NO_TOOLS = HAS_TOOLS ? false : 'no Angular build tools (npm ci --prefix test/.angular-tools)';
const READY = CHROME && typeof WebSocket !== 'undefined' && HAS_TOOLS ? false : 'no Chrome, or no Angular build tools (npm ci --prefix test/.angular-tools)';

// Acme, an invented Angular system, with its packages installed.
const acme = (prefix) => {
  const dir = tempDir(prefix);
  cpSync(FIXTURE, dir, { recursive: true });
  symlinkSync(TOOLS, join(dir, 'node_modules'), 'dir');
  return dir;
};
const CFG = { name: 'Acme', paths: { themeCSS: 'src/styles/tokens.css' } };
const FILES = { 'acme-button': 'acme-button/acme-button.component.ts', 'acme-chip': 'acme-chip.component.ts', 'acme-switch': 'acme-switch.component.ts' };
const locate = (dir) => (n) => (FILES[n] ? join(dir, 'src', 'components', FILES[n]) : null);

test('a project with no Angular of its own is said so, and nothing is compiled or drawn by the engine', async () => {
  const r = await angularBuild(tempDir('ng-none-'));
  assert.match(r.why, /no Angular installed|packages are not installed/);
  assert.equal(r.cli, undefined);
});

test('the page carries the markers every check already reads, and sets each value as an input by its template name', () => {
  const mod = harnessModule([{ name: 'chip', slug: 'chip', file: '/out/chip.js', exportName: 'ChipComponent', tag: 'acme-chip', cases: [{ label: 'default', props: { selected: true } }] }], ['/src/styles/tokens.css']);
  assert.doesNotThrow(() => new Function(mod.replace(/^import .*$/gm, '').replace(/\bawait\b/g, '')), 'the page module parses');
  for (const m of [/data-dse-component/, /data-dse-case/, /window\.__dseHarnessReady = true/, /window\.__dseHarnessFailed/, /import "\/src\/styles\/tokens\.css"/, /ref\.setInput\(k, v\)/, /^import "@angular\/compiler";/m, /createApplication/]) assert.match(mod, m);
  // A project before Angular 18 has its changes seen by its own zone.js.
  assert.match(harnessModule([], [], { zone: 'zone.js', compiler: false }), /^import "zone\.js";/m);
  assert.doesNotMatch(harnessModule([], [], { compiler: false }), /@angular\/compiler/);
});

test('the packages a compiled component imports are the ones bundled with Angular before the page loads', () => {
  const f = join(tempDir('ng-imports-'), 'a.js');
  writeFileSync(f, `import { Component } from '@angular/core';\nimport * as i1 from "@angular/material/button";\nimport './local.js';\nexport { x } from 'rxjs';\nimport 'zone.js';\n`);
  assert.deepEqual(bareImports(f), ['@angular/core', '@angular/material/button', 'rxjs', 'zone.js']);
});

test('a required input is given in every case, never only in its own, since without it the component refuses to draw', () => {
  const cases = variantsFromCode({ props: { label: { type: 'string', required: true }, tone: { options: ['info', 'danger'], default: 'info' } } }, '', 8);
  assert.ok(cases.length >= 2);
  for (const c of cases) assert.ok(c.props.label != null, `${c.label} gives label`);
});

test('an Angular app\'s root component is the app, not one of its system\'s components', () => {
  const dir = tempDir('ng-root-');
  cpSync(FIXTURE, dir, { recursive: true });
  writeFileSync(join(dir, 'src', 'app.ts'), `import { Component } from '@angular/core';\n@Component({ selector: 'app-root', template: '<main></main>' })\nexport class App {}\n`);
  assert.deepEqual(codeComponents(dir, CFG).map((c) => c.name).sort(), ['acme-button', 'acme-chip', 'acme-switch']);
});

test('the project\'s own compiler compiles each component ahead of time, its template and its Sass inside it', { skip: NO_TOOLS, timeout: budget(180000) }, async () => {
  const dir = acme('ng-compile-');
  const pb = await angularBuild(dir);
  assert.equal(pb.why, undefined, pb.why);
  const files = Object.values(FILES).map((f) => join(dir, 'src', 'components', f));
  const r = await compileAngular(dir, pb.cli, files, join(dir, '.out'));
  assert.equal(r.why, undefined, r.why);
  assert.deepEqual(r.errors, []);
  assert.equal(Object.keys(r.compiled).length, 3);
  const { readFileSync } = await import('node:fs');
  const button = readFileSync(r.compiled[files[0]], 'utf8');
  assert.match(button, /ɵɵdefineComponent/, 'compiled in full');
  assert.match(button, /padding: 0 16px/, 'its Sass compiled by the project\'s own Sass, into the component');
  // A template that names what the component does not have is the compiler's error, said, never a guess.
  writeFileSync(files[1], readFileSync(files[1], 'utf8').replace('[class.is-selected]="selected"', '[class.is-selected]="nothingHere"'));
  const bad = await compileAngular(dir, pb.cli, files, join(dir, '.out'));
  assert.ok(bad.errors.some((e) => /nothingHere/.test(e)), bad.errors.join(' | '));
});

test('every way an Angular library writes a component is drawn by its own Angular: signal inputs, decorator inputs with an alias, a model', { skip: READY, timeout: budget(300000) }, async () => {
  const dir = acme('ng-real-');
  const names = codeComponents(dir, CFG).map((c) => c.name).sort();
  assert.deepEqual(names, ['acme-button', 'acme-chip', 'acme-switch']);
  const h = await startAngularHarness(dir, CFG, names, { locate: locate(dir) });
  assert.ok(h.url, h.why);
  const browser = await launchChrome(CHROME, { tmpPrefix: 'dse-angular-' });
  try {
    const { send } = await connectCDP(browser.wsUrl);
    const { sessionId } = await openPage(send, h.url);
    assert.ok(await waitForTrue(send, sessionId, 'window.__dseHarnessReady === true', { attempts: 1200, intervalMs: 50, tolerateErrors: true }), 'the page settled');
    const inPage = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)).result?.value;
    assert.deepEqual(JSON.parse(await inPage('JSON.stringify(window.__dseHarnessFailed)')), [], 'every component drew');
    assert.deepEqual(JSON.parse(await inPage(`JSON.stringify([...document.querySelectorAll('[data-dse-component]')].map((s) => s.getAttribute('data-dse-component')))`)), names);
    // Each case is the code's own options: tone loud and quiet, set as a signal input.
    const tones = JSON.parse(await inPage(`JSON.stringify([...document.querySelectorAll('[data-dse-component="acme-button"] button')].map((b) => b.getAttribute('data-tone')))`));
    assert.ok(tones.includes('loud') && tones.includes('quiet'), `both tones drawn: ${tones}`);
    // An input set by its alias (chipSize), and a decorator input (selected) that reaches the template.
    assert.equal(await inPage(`document.querySelectorAll('[data-dse-component="acme-chip"] .is-selected').length`), 1);
    // The project's own token, as the browser resolves it through the styles Angular scoped to the component.
    assert.equal(await inPage(`getComputedStyle(document.querySelector('acme-button .acmeButton')).height`), '36px');
    // What a person puts in it, projected where its <ng-content> takes it.
    assert.equal(await inPage(`document.querySelector('acme-button').textContent.trim()`), 'Acme Button');
    // The component behaves, with no zone.js: a click switches the model and Angular draws it.
    assert.equal(await inPage(`(async () => { const b = document.querySelector('[data-dse-case="default"] acme-switch button'); b.click(); await new Promise((r) => setTimeout(r, 100)); return b.getAttribute('aria-checked'); })()`), 'true');
  } finally { browser.kill(); await h.close(); }
});

test('the style guide gets each case as Angular drew it, with the styles Angular scoped to it', { skip: READY, timeout: budget(300000) }, async () => {
  const dir = acme('ng-rendered-');
  const r = await renderedAngular(dir, CFG, ['acme-button', 'acme-chip'], { locate: locate(dir), max: 4 });
  assert.equal(r.why, undefined, r.why);
  assert.deepEqual(r.failed, []);
  const button = r.markup['acme-button'];
  assert.match(button, /^<acme-button\b/);
  assert.match(button, /_nghost-ng-c\w+/);
  const host = /_nghost-(ng-c\w+)/.exec(button)[1];
  assert.match(r.css, new RegExp(`\\.acmeButton\\[_ngcontent-${host}\\]`), 'its scoped styles beside it');
  assert.match(r.css, /--acme-height-m: 36px/, 'the project\'s tokens too');
  assert.ok((r.cases['acme-button'] ?? []).length >= 2, 'each case is kept');
  assert.equal(r.build, 'Angular compiler');
});

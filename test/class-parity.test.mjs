// Parity on a Lit, a plain Web Components and an Angular system, each drawn by its own build, as React's is
// (react-parity.test.mjs): the code capture measures every component on the page its own harness draws, with no
// control center built, and the parity check names exactly the one deliberate difference, with the file and line of
// the rule that draws it and the variable to give it.
//
// The tests use each system's own build, laid in gitignored folders as CI does:
//   npm ci --prefix test/.lit-tools
//   npm ci --prefix test/.angular-tools
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, symlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findChrome } from '../lib/cdp.mjs';
import { classStyles } from '../lib/code-grammar.mjs';
import { sourceSelector } from '../lib/component-capture.mjs';
import { DEEP_QUERIES } from '../lib/lit-harness.mjs';
import { budget, fixtureProject } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const CHROME = findChrome({ playwright: true });
const browser = CHROME && typeof WebSocket !== 'undefined';

const system = (fixture, tools, prefix) => {
  const dir = fixtureProject(join(ENGINE, 'test', 'fixtures', fixture), prefix, { overlay: join(ENGINE, 'test', 'fixtures', `${fixture}-parity`) });
  symlinkSync(join(ENGINE, 'test', tools, 'node_modules'), join(dir, 'node_modules'), 'dir');
  return dir;
};
const run = (dir, script, args = []) => spawnSync(process.execPath, [join(ENGINE, 'lib', script), ...args], {
  cwd: dir, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', CHROME_PATH: CHROME }, timeout: budget(400000) });
const measured = (said) => said.split('\n').filter((l) => /^\s+⚠️ {2}[\w-]+ .*: Figma .*, rendered /.test(l)).map((l) => l.trim());

test("a component's own styles are read where its file writes them, every line where it stands", () => {
  const lit = "import { LitElement, html, css } from 'lit';\n\nexport class AcmeChip extends LitElement {\n  static styles = css`\n    .acmeChip { border-radius: ${unsafeCSS(r)}; }\n  `;\n}\ncustomElements.define('acme-chip', AcmeChip);\n";
  const s = classStyles('acme-chip.ts', lit);
  assert.equal(s.text.split('\n')[4].trim(), '.acmeChip { border-radius:                ; }', 'on line 5, as in the file, an interpolation blanked');
  const ng = "import { Component } from '@angular/core';\n@Component({\n  selector: 'acme-tag',\n  styles: [`.acmeTag { padding: 2px; }`],\n  template: '<span class=\"acmeTag\"></span>',\n})\nexport class AcmeTag {}\n";
  assert.equal(classStyles('acme-tag.component.ts', ng).text.split('\n')[3].trim(), '.acmeTag { padding: 2px; }');
  const plain = "const t = document.createElement('template');\nt.innerHTML = `<style>\n  .acmeBadge { padding: 0 8px; }\n</style><span class=\"acmeBadge\"></span>`;\nexport class AcmeBadge extends HTMLElement {}\ncustomElements.define('acme-badge', AcmeBadge);\n";
  assert.equal(classStyles('acme-badge.js', plain).text.split('\n')[2].trim(), '.acmeBadge { padding: 0 8px; }');
  assert.equal(classStyles('Button.jsx', 'export const Button = () => <button />;'), null, 'not a class component: none');
  // The attributes Angular scopes its styles with are its build's, never in the file.
  assert.equal(sourceSelector('.acmeButton[_ngcontent-ng-c51], :host[_nghost-ng-c51]'), '.acmeButton, :host');
  assert.match(DEEP_QUERIES, /Document\.prototype\.querySelectorAll = /);
});

const LIT_READY = browser && existsSync(join(ENGINE, 'test', '.lit-tools', 'node_modules', 'lit')) ? false : 'no Chrome, or no Lit build tools (npm ci --prefix test/.lit-tools)';
test('parity measures each Lit component and plain custom element as its own build draws it, inside its shadow root', { skip: LIT_READY, timeout: budget(900000) }, () => {
  const dir = system('acme-lit', '.lit-tools', 'lit-parity-');
  const cap = run(dir, 'code-capture.mjs', ['--force']);
  assert.equal(cap.status, 0, `${cap.stdout}\n${cap.stderr}`.slice(0, 1500));
  assert.doesNotMatch(cap.stdout, /browser reading failed|not drawn with/);
  const snap = JSON.parse(readFileSync(join(dir, '.design-system-engine-out', 'code.snapshot.json'), 'utf8'));
  for (const name of ['acme-button', 'acme-badge']) assert.equal(snap.components[name].instance?.page, 'Lit · components', name);
  const radius = snap.components['acme-button'].props.borderTopLeftRadius;
  assert.deepEqual([radius.value, radius.var, radius.at, radius.confidence], ['6px', '--acme-radius', 'src/components/acme-button.ts:8', 'verified'], 'read in the browser and in its css``, the two agreeing');
  assert.equal(snap.components['acme-button'].props.height.value, '36px');
  assert.equal(snap.components['acme-badge'].props.borderTopLeftRadius.at, 'src/components/acme-badge.js:5', "a plain element's own <style>");
  const said = run(dir, '../audit.mjs').stdout;
  const m = measured(said);
  assert.equal(m.length, 1, `${m.join('\n')}\n${said.slice(said.indexOf('[13] Structure'), said.indexOf('[14] All states')).slice(0, 3000)}`);
  assert.match(m[0], /acme-button radius: Figma radius-l \(8px\), rendered 6px via --acme-radius {2}\(\.acmeButton · src\/components\/acme-button\.ts:8\) {2}→ set var\(--acme-radius-l\)/);
});

const NG_TOOLS = join(ENGINE, 'test', '.angular-tools', 'node_modules');
const NG_READY = browser && ['@angular/core', '@angular/compiler-cli', '@angular/build'].every((p) => existsSync(join(NG_TOOLS, p))) ? false : 'no Chrome, or no Angular build tools (npm ci --prefix test/.angular-tools)';
test('parity measures each Angular component as its own Angular draws it, its scoped rules found in its own stylesheet', { skip: NG_READY, timeout: budget(900000) }, () => {
  const dir = system('acme-angular', '.angular-tools', 'ng-parity-');
  const cap = run(dir, 'code-capture.mjs', ['--force']);
  assert.equal(cap.status, 0, `${cap.stdout}\n${cap.stderr}`.slice(0, 1500));
  assert.doesNotMatch(cap.stdout, /browser reading failed|not drawn with/);
  const snap = JSON.parse(readFileSync(join(dir, '.design-system-engine-out', 'code.snapshot.json'), 'utf8'));
  assert.equal(snap.components['acme-button'].instance?.page, 'Angular · components');
  const radius = snap.components['acme-button'].props.borderTopLeftRadius;
  assert.deepEqual([radius.value, radius.rule, radius.at, radius.confidence], ['6px', '.acmeButton', 'src/components/acme-button/acme-button.component.scss:2', 'verified'], 'the rule Angular scoped, found where its styleUrl writes it');
  const said = run(dir, '../audit.mjs').stdout;
  const m = measured(said);
  assert.equal(m.length, 1, `${m.join('\n')}\n${said.slice(said.indexOf('[13] Structure'), said.indexOf('[14] All states')).slice(0, 3000)}`);
  assert.match(m[0], /acme-button radius: Figma radius-l \(8px\), rendered 6px via --acme-radius {2}\(\.acmeButton · src\/components\/acme-button\/acme-button\.component\.scss:2\) {2}→ set var\(--acme-radius-l\)/);
});

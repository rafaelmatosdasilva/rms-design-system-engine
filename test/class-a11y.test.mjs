// The accessibility check on a Lit, a plain Web Components and an Angular system as on a Vue or a React one: each
// component drawn by its own build in each of its variants on every run, beside the control center, and every check
// reaching into the shadow roots a Lit component or a custom element draws into, on that page and on the control center.
//
// The tests use each system's own build, laid in gitignored folders as CI does:
//   npm ci --prefix test/.lit-tools
//   npm ci --prefix test/.angular-tools
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findChrome } from '../lib/cdp.mjs';
import { budget, fixtureProject } from './helpers.mjs';

const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const CHROME = findChrome({ playwright: true });
const browser = CHROME && typeof WebSocket !== 'undefined';

// An icon-only button with no words for a screen reader: the one fault each system is given on purpose.
const CLOSE_LIT = `import { LitElement, html, css } from 'lit';

/** Closes what it sits in. */
export class AcmeClose extends LitElement {
  static styles = css\`.acmeClose { width: 32px; height: 32px; border: 0; background: transparent; }\`;
  render() { return html\`<button class="acmeClose"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2 2l12 12M14 2L2 14"/></svg></button>\`; }
}
customElements.define('acme-close', AcmeClose);
`;
const CLOSE_NG = `import { Component } from '@angular/core';

/** Closes what it sits in. */
@Component({
  selector: 'acme-close',
  template: \`<button class="acmeClose"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2 2l12 12M14 2L2 14"/></svg></button>\`,
  styles: [\`.acmeClose { width: 32px; height: 32px; border: 0; background: transparent; }\`],
})
export class AcmeCloseComponent {}
`;

const system = (fixture, tools, file, text, prefix) => {
  const dir = fixtureProject(join(ENGINE, 'test', 'fixtures', fixture), prefix, { overlay: join(ENGINE, 'test', 'fixtures', `${fixture}-parity`) });
  symlinkSync(join(ENGINE, 'test', tools, 'node_modules'), join(dir, 'node_modules'), 'dir');
  writeFileSync(join(dir, 'src', 'components', file), text);
  return dir;
};
const env = { ...process.env, NO_COLOR: '1', CHROME_PATH: CHROME };
// The control center built first, as a team has it, then the check: it reads the control center and draws the
// components beside it.
const checked = (dir) => {
  const sg = spawnSync(process.execPath, [join(ENGINE, 'audit.mjs'), '--styleguide', '--no-a11y-bake'], { cwd: dir, encoding: 'utf8', env, timeout: budget(400000) });
  assert.ok(existsSync(join(dir, '.design-system-engine-out', 'styleguide', 'index.html')), `${sg.stdout}\n${sg.stderr}`.slice(-1500));
  const r = spawnSync(process.execPath, [join(ENGINE, 'lib', 'a11y-check.mjs'), '--json-out', join(dir, 'a11y.json')], { cwd: dir, encoding: 'utf8', env, timeout: budget(500000) });
  return { r, out: JSON.parse(readFileSync(join(dir, 'a11y.json'), 'utf8')) };
};

const LIT_READY = browser && existsSync(join(ENGINE, 'test', '.lit-tools', 'node_modules', 'lit')) ? false : 'no Chrome, or no Lit build tools (npm ci --prefix test/.lit-tools)';
test('a Lit system and its plain custom elements are checked in every variant beside the control center, inside their shadow roots', { skip: LIT_READY, timeout: budget(900000) }, () => {
  const { r, out } = checked(system('acme-lit', '.lit-tools', 'acme-close.js', CLOSE_LIT, 'lit-a11y-'));
  const said = r.stdout + r.stderr;
  assert.match(said, /target: \d+ Lit and Web Components component\(s\) rendered with the project's own Lit in each variant \(.*acme-badge: 1 .*acme-close: 1 /, said.slice(-2000));
  assert.deepEqual(out.target, ['.design-system-engine-out/styleguide/index.html', "the Lit and Web Components components, rendered with the project's own Lit"], 'both, every run');
  assert.doesNotMatch(said, /not checked: .* showed none of the design system's components/, "the control center's Lit previews are reached too");
  assert.ok(out.issues.some((i) => i.issue === 'name' && i.role === 'button'), 'the icon button with no name, inside its shadow root, is found');
  assert.ok(out.issues.some((i) => /acmeButton/.test(i.selector)), "a Lit button's own part is measured by its class");
});

const NG_TOOLS = join(ENGINE, 'test', '.angular-tools', 'node_modules');
const NG_READY = browser && ['@angular/core', '@angular/compiler-cli', '@angular/build'].every((p) => existsSync(join(NG_TOOLS, p))) ? false : 'no Chrome, or no Angular build tools (npm ci --prefix test/.angular-tools)';
test('an Angular system is checked in every variant beside the control center, drawn by its own Angular', { skip: NG_READY, timeout: budget(900000) }, () => {
  const { r, out } = checked(system('acme-angular', '.angular-tools', 'acme-close.component.ts', CLOSE_NG, 'ng-a11y-'));
  const said = r.stdout + r.stderr;
  assert.match(said, /target: \d+ Angular component\(s\) rendered with the project's own Angular in each variant \(.*acme-close: 1 /, said.slice(-2000));
  assert.deepEqual(out.target, ['.design-system-engine-out/styleguide/index.html', "the Angular components, rendered with the project's own Angular"]);
  assert.ok(out.issues.some((i) => i.issue === 'name' && i.role === 'button'), 'the icon button with no name is found');
});

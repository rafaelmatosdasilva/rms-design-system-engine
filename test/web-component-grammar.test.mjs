// The codebase rules read Lit and Angular components as they read Vue and React: Lit's :host and its styles module,
// Angular's styles and styleUrls, each component's own template (code-grammar.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from './helpers.mjs';
import { anatomyOf, hostAsRoot, codeGrammarFor } from '../lib/code-grammar.mjs';

test(':host is the root, :host(x) the root with x, ::slotted an element inside it, ::ng-deep looked through', () => {
  assert.equal(hostAsRoot(':host { padding: 4px } :host([disabled]) { opacity: .5 } :host(:hover) .label {} ::slotted(span) {} ::ng-deep .x {}', 'chip'),
    '.chip { padding: 4px } .chip[disabled] { opacity: .5 } .chip:hover .label {}  span {} .x {}');
  assert.equal(hostAsRoot(':host-context(.dark) { color: white }', 'chip'), '.dark .chip { color: white }');
  assert.equal(hostAsRoot('.chip { color: red }', 'chip'), '.chip { color: red }', 'nothing to change');
});

test('a Lit component\'s :host rules are its root\'s, with their states, read from its own template only', () => {
  const text = `import { LitElement, html, css } from 'lit';
export class AcmeChip extends LitElement {
  static styles = css\`:host { display: inline-flex; padding: var(--space-s); border-radius: var(--radius-m); }
:host([disabled]) { opacity: var(--opacity-disabled); }
:host(:hover) { background: var(--chip-bg-hover); }
.label { font-size: var(--text-s); }\`;
  items: Map<string, number> = new Map();
  render() { return html\`<span class="label"><slot></slot></span>\`; }
}
customElements.define('acme-chip', AcmeChip);`;
  const a = anatomyOf({ file: 'src/chip.ts', text, template: '<span class="label"><slot></slot></span>', host: 'acme-chip', styles: [{ file: 'src/chip.ts', text: text.match(/css`([\s\S]*?)`/)[1] }], root: null });
  assert.ok(a, 'read, not left out');
  assert.equal(a.root, '.acme-chip', 'the host is the root when its markup gives it no class');
  const states = a.states.map((s) => s.state).sort();
  assert.ok(states.includes('disabled') && states.includes('hover'), JSON.stringify(a.states));
  assert.ok(!a.parts.some((p) => /Map|string|number/.test(p.element ?? p.name ?? '')), 'a type in the code is not an element');
});

test('Angular\'s inline styles and its styleUrls are read, and its templateUrl', async () => {
  const root = tempDir('ng-grammar-');
  mkdirSync(join(root, 'src/chip'), { recursive: true });
  writeFileSync(join(root, 'src/chip/chip.component.ts'), `import { Component, Input } from '@angular/core';
@Component({ selector: 'acme-chip', templateUrl: './chip.component.html', styleUrls: ['./chip.component.css'], styles: [\`:host([disabled]) { opacity: .5; }\`] })
export class ChipComponent { @Input() size: 'sm' | 'md' = 'sm'; }`);
  writeFileSync(join(root, 'src/chip/chip.component.html'), '<span class="chip"><span class="chip__label"><ng-content></ng-content></span></span>');
  writeFileSync(join(root, 'src/chip/chip.component.css'), '.chip { padding: var(--space-s); border-radius: var(--radius-m); } .chip:hover { background: var(--chip-bg-hover); }');
  const g = await codeGrammarFor(root, {}, { reports: false });
  const a = g.code.anatomy.chip ?? Object.values(g.code.anatomy)[0];
  assert.ok(a, `read: ${JSON.stringify(Object.keys(g.code.anatomy))} ${JSON.stringify(g.code.notRead ?? [])}`);
  const states = a.states.map((s) => s.state);
  assert.ok(states.includes('hover'), 'from the styleUrls file');
  assert.ok(a.parts.some((p) => /label/.test(JSON.stringify(p))), 'from the templateUrl');
});

test('a styleUrl naming the CSS a build compiles is read from its Sass', async () => {
  const root = tempDir('ng-sass-');
  mkdirSync(join(root, 'src/badge'), { recursive: true });
  writeFileSync(join(root, 'src/badge/badge.ts'), `import { Component } from '@angular/core';
@Component({ selector: 'acme-badge', template: '<span class="badge"><ng-content></ng-content></span>', styleUrl: 'badge.css' })
export class BadgeComponent {}`);
  writeFileSync(join(root, 'src/badge/badge.scss'), '.badge { padding: var(--space-xs); } .badge:focus-visible { outline: 2px solid var(--focus); }');
  const g = await codeGrammarFor(root, {}, { reports: false });
  const a = Object.values(g.code.anatomy)[0];
  assert.ok(a?.states.some((s) => s.state === 'focus'), JSON.stringify(a));
});

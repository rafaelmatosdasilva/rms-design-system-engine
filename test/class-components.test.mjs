import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tempDir } from './helpers.mjs';
import { join } from 'node:path';
import { classKind, classComponentApi, classRootClass, templateOf } from '../lib/class-components.mjs';
import { textComponentApi, extractProps, extractEvents, extractSlots, codeComponents, rootClassOf, usedComponents } from '../lib/component-source.mjs';

const LIT_TS = `import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

/** A button people press to act. */
@customElement('acme-button')
export class AcmeButton extends LitElement {
  static styles = css\`:host { display: inline-block; }\`;
  /** How loud the button is. */
  @property({ reflect: true }) tone: 'primary' | 'secondary' | 'danger' = 'primary';
  @property({ type: Boolean, reflect: true }) disabled = false;
  @property({ type: Number }) count = 0;
  @property() accessor label: string = 'Continue';
  @property({ attribute: 'icon-name' }) iconName?: string;
  @state() private pressed = false;

  private onClick() {
    this.dispatchEvent(new CustomEvent('acme-press', { bubbles: true, composed: true }));
  }

  render() {
    return html\`<button class="acmeButton acmeButton--\${this.tone}" ?disabled=\${this.disabled} @click=\${this.onClick}>
      <slot name="icon"></slot><span class="acmeButton__label">\${this.label}</span><slot></slot>
    </button>\`;
  }
}
`;

const LIT_JS = `import { LitElement, html } from 'lit';

export class AcmeChip extends LitElement {
  static properties = {
    size: { type: String, reflect: true },
    selected: { type: Boolean },
    _hover: { state: true },
  };
  constructor() {
    super();
    this.size = 'm';
    this.selected = false;
  }
  render() {
    return html\`<span class="acmeChip"><slot></slot></span>\`;
  }
}
customElements.define('acme-chip', AcmeChip);
`;

const NG_DECORATORS = `import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'acme-badge',
  standalone: true,
  host: { class: 'acmeBadge' },
  template: \`<span class="acmeBadge__inner"><ng-content select="[icon]"></ng-content><ng-content></ng-content></span>\`,
})
export class BadgeComponent {
  /** What the badge says about its status. */
  @Input() status: 'info' | 'success' | 'error' = 'info';
  @Input({ required: true }) label!: string;
  @Input('aria-label') ariaLabel?: string;
  @Input() set count(value: number) { this._count = value; }
  @Output() dismissed = new EventEmitter<void>();
  private _count = 0;
}
`;

const NG_SIGNALS = `import { Component, input, model, output } from '@angular/core';

@Component({
  selector: 'acme-switch',
  templateUrl: './switch.component.html',
})
export class SwitchComponent {
  size = input<'s' | 'm' | 'l'>('m');
  label = input.required<string>();
  disabled = input(false);
  checked = model(false);
  changed = output<boolean>();
}
`;
const NG_SIGNALS_HTML = `<label class="acmeSwitch"><input type="checkbox" [checked]="checked()" /><ng-content select=".hint"></ng-content></label>`;

test('a Lit or an Angular class is known by its own imports, never by its file name', () => {
  assert.equal(classKind('acme-button.ts', LIT_TS), 'lit');
  assert.equal(classKind('acme-chip.js', LIT_JS), 'lit');
  assert.equal(classKind('badge.component.ts', NG_DECORATORS), 'angular');
  assert.equal(classKind('Button.tsx', LIT_TS), null, 'a JSX file is read as React');
  assert.equal(classKind('util.ts', 'export const x = 1;'), null);
  assert.equal(classKind('store.ts', `import { Injectable } from '@angular/core';\n@Injectable() export class Store {}`), null, 'an Angular service is no component');
});

test('Lit: its reactive properties with their defaults, options and types, its slots and its events, its state left out', () => {
  const api = classComponentApi('acme-button.ts', LIT_TS);
  assert.deepEqual(Object.keys(api.props).sort(), ['count', 'disabled', 'iconName', 'label', 'tone']);
  assert.deepEqual(api.props.tone, { options: ['primary', 'secondary', 'danger'], type: 'string', default: 'primary' });
  assert.equal(api.props.disabled.default, false);
  assert.equal(api.props.disabled.type, 'boolean');
  assert.equal(api.props.count.default, 0);
  assert.equal(api.props.label.default, 'Continue', 'an accessor property keeps its default');
  assert.ok(!('pressed' in api.props), 'internal state is no prop');
  assert.deepEqual(api.slots, { named: ['icon'], default: true });
  assert.deepEqual(api.events, ['acme-press']);
  assert.equal(api.tag, 'acme-button');
  assert.equal(classRootClass('acme-button.ts', LIT_TS), 'acmeButton');
});

test('Lit without decorators: static properties, the defaults its constructor gives, customElements.define', () => {
  const api = classComponentApi('acme-chip.js', LIT_JS);
  assert.deepEqual(Object.keys(api.props).sort(), ['selected', 'size']);
  assert.equal(api.props.size.default, 'm');
  assert.equal(api.props.size.type, 'string');
  assert.equal(api.props.selected.default, false);
  assert.equal(api.tag, 'acme-chip');
  assert.deepEqual(api.slots, { named: [], default: true });
});

test('Angular: decorated inputs (an alias, required, a setter) and outputs, ng-content named by its select, the host class', () => {
  const api = classComponentApi('badge.component.ts', NG_DECORATORS);
  assert.deepEqual(Object.keys(api.props).sort(), ['aria-label', 'count', 'label', 'status']);
  assert.deepEqual(api.props.status, { options: ['info', 'success', 'error'], type: 'string', default: 'info' });
  assert.equal(api.props.label.required, true);
  assert.equal(api.props.count.type, 'number');
  assert.deepEqual(api.events, ['dismissed']);
  assert.deepEqual(api.slots, { named: ['icon'], default: true });
  assert.equal(api.tag, 'acme-badge');
  assert.equal(classRootClass('badge.component.ts', NG_DECORATORS), 'acmeBadge', 'the host class is the component\'s own');
});

test('Angular signals: input, input.required and model, output, and a template in its own file', () => {
  const dir = tempDir('ng-');
  {
    writeFileSync(join(dir, 'switch.component.html'), NG_SIGNALS_HTML);
    const file = join(dir, 'switch.component.ts');
    writeFileSync(file, NG_SIGNALS);
    const api = classComponentApi(file, NG_SIGNALS);
    assert.deepEqual(api.props.size, { options: ['s', 'm', 'l'], type: 'string', default: 'm' });
    assert.equal(api.props.label.required, true);
    assert.equal(api.props.disabled.default, false);
    assert.equal(api.props.checked.default, false);
    assert.deepEqual(api.events.sort(), ['changed', 'checkedChange'], 'a model sends its own <name>Change');
    assert.deepEqual(api.slots, { named: ['hint'], default: false });
    assert.match(templateOf(file, NG_SIGNALS), /acmeSwitch/);
    assert.equal(rootClassOf(file, NG_SIGNALS), 'acmeSwitch');
  }
});

test('the shared readers give a class component the same shape a Vue or React one has', () => {
  const api = textComponentApi('acme-button.ts', LIT_TS);
  assert.equal(api.props.tone.default, 'primary');
  assert.equal(api.props.tone.description, 'How loud the button is.');
  assert.deepEqual(api.slots, { named: ['icon'], default: true });
  assert.deepEqual([...extractProps('badge.component.ts', NG_DECORATORS)].sort(), ['aria-label', 'count', 'label', 'status']);
  assert.deepEqual(extractEvents('acme-button.ts', LIT_TS), ['acme-press']);
  const s = extractSlots(NG_DECORATORS);
  assert.deepEqual([[...s.named], s.hasDefault], [['icon'], true]);
});

test('a library of Lit or Angular components is found, each by its file, its spec and stories left out', () => {
  const dir = tempDir('cls-');
  {
    mkdirSync(join(dir, 'src/components'), { recursive: true });
    writeFileSync(join(dir, 'src/components/acme-button.ts'), LIT_TS);
    writeFileSync(join(dir, 'src/components/acme-chip.js'), LIT_JS);
    writeFileSync(join(dir, 'src/components/badge.component.ts'), NG_DECORATORS);
    writeFileSync(join(dir, 'src/components/badge.component.spec.ts'), NG_DECORATORS);
    writeFileSync(join(dir, 'src/components/acme-button.stories.ts'), LIT_TS);
    writeFileSync(join(dir, 'src/components/tokens.ts'), 'export const x = 1;');
    const found = codeComponents(dir, {});
    assert.deepEqual(found.map((c) => [c.name, c.cls]).sort(), [['acme-button', 'acmeButton'], ['acme-chip', 'acmeChip'], ['badge', 'acmeBadge']]);
  }
});

test('a component used by its custom element tag counts as used', () => {
  const used = usedComponents('<acme-icon-button label="x"></acme-icon-button>', [{ name: 'iconButton', selNorm: 'zzzz-never' }]);
  assert.ok(used.has('iconButton'));
  assert.ok(!usedComponents('<acme-iconish></acme-iconish>', [{ name: 'icon', selNorm: 'zzzz-never' }]).has('icon'));
});

test('the code grammar says a Lit or an Angular component is written as one', async () => {
  assert.equal(textComponentApi('acme-button.ts', LIT_TS).syntax, 'lit');
  assert.equal(textComponentApi('badge.component.ts', NG_DECORATORS).syntax, 'angular');
});

test('what real libraries write: a wrapped union, classMap, a dynamic tag, nested templates, doc tags and this.emit', () => {
  const src = `import { html } from 'lit';
import { property } from 'lit/decorators.js';
import AcmeElement from '../../internal/acme-element.js';

/**
 * @summary A menu that opens on a press.
 * @event acme-show - Emitted when it opens.
 * @slot - The menu's items.
 * @slot trigger - What opens it.
 */
export default class AcmeMenu extends AcmeElement {
  /** Where the panel opens. */
  @property({ reflect: true }) placement:
    | 'top'
    | 'bottom'
    | 'bottom-start' = 'bottom-start';
  @property({ reflect: true }) variant: 'default' | 'primary' =
    'default';
  show() { this.emit('acme-after-show'); }
  render() {
    // the panel's own element: it isn't a slot
    const tag = literal\`div\`;
    return html\`
      <\${tag}
        part="base"
        class=\${classMap({ acmeMenu: true, 'acmeMenu--open': this.open })}>
        \${this.open ? html\`<span class="acmeMenu__dot"></span>\` : ''}
        <slot name="trigger"></slot><slot></slot>
      </\${tag}>\`;
  }
}`;
  const api = classComponentApi('acme-menu.component.ts', src);
  assert.deepEqual(api.props.placement.options, ['top', 'bottom', 'bottom-start']);
  assert.equal(api.props.placement.default, 'bottom-start');
  assert.equal(api.props.variant.default, 'default', 'a default the formatter moved to its own line');
  assert.deepEqual(api.events.sort(), ['acme-after-show', 'acme-show']);
  assert.deepEqual(api.slots, { named: ['trigger'], default: true });
  assert.equal(classRootClass('acme-menu.component.ts', src), 'acmeMenu', 'a classMap\'s first class, on a tag chosen at render');
});

test('Angular as a large library writes it: getter inputs, inputs from a base class, select lists and a selector list', () => {
  const dir = tempDir('ng-base-');
  {
    writeFileSync(join(dir, 'acme-base.ts'), `import { Directive, Input, input, booleanAttribute } from '@angular/core';
@Directive()
export class AcmeBase {
  @Input() color?: string | null;
  @Input({ transform: booleanAttribute })
  get disabled(): boolean { return this._disabled; }
  set disabled(v: boolean) { this._disabled = v; }
  readonly busy = input(false, { transform: booleanAttribute });
}`);
    const src = `import { Component, Input } from '@angular/core';
import { AcmeBase } from './acme-base';
@Component({
  selector: \`
    button[acmeAction], a[acmeAction]
  \`,
  template: \`<ng-content select=".acme-icon:not([iconEnd]), [acmeIcon]:not([iconEnd])"></ng-content><ng-content></ng-content><ng-content select="[acmeIcon][iconEnd]"></ng-content>\`,
})
export class AcmeAction extends AcmeBase {
  @Input() appearance: 'filled' | 'outlined' = 'filled';
}`;
    const file = join(dir, 'acme-action.ts');
    writeFileSync(file, src);
    const api = classComponentApi(file, src);
    assert.deepEqual(Object.keys(api.props).sort(), ['appearance', 'busy', 'color', 'disabled'], 'a getter input is named by the getter, and the base class\'s inputs are its own');
    assert.equal(api.props.disabled.type, 'boolean');
    assert.equal(api.props.busy.default, false);
    assert.deepEqual(api.slots, { named: ['acmeIcon', 'iconEnd'], default: true }, 'a select list is named by the attribute it asks for, never what it rules out');
    assert.equal(api.tag, 'button[acmeAction]');
  }
});

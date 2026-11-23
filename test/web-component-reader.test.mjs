// A Web Component written with no library, read as a component: its tag, the attributes it watches as props (a
// yes-or-no where it asks hasAttribute), its accessors, its events and its slots (class-components.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classKind, classComponentApi, templateOf } from '../lib/class-components.mjs';

const source = `/** A chip a person can remove. */
export class AcmeChip extends HTMLElement {
  static get observedAttributes() { return ['size', 'removable', 'aria-label-close']; }
  constructor() { super(); this.attachShadow({ mode: 'open' }); }
  connectedCallback() {
    this.shadowRoot.innerHTML = \`<style>:host { display: inline-flex }</style><span class="label"><slot></slot></span><slot name="icon"></slot><button part="close">x</button>\`;
    this.shadowRoot.querySelector('button').addEventListener('click', () => this.dispatchEvent(new CustomEvent('remove', { bubbles: true })));
  }
  get size() { return this.getAttribute('size') ?? 'm'; }
  set size(v) { this.setAttribute('size', v); }
  get removable() { return this.hasAttribute('removable'); }
  set removable(v) { this.toggleAttribute('removable', !!v); }
  get value() { return this._value; }
  set value(v) { this._value = v; }
  get _internal() { return 1; }
}
customElements.define('acme-chip', AcmeChip);`;

test('a plain custom element is a component of its own kind, and only one', () => {
  assert.equal(classKind('src/chip.js', source), 'web component');
  assert.equal(classKind('src/util.js', 'export class Store {}'), null);
  assert.equal(classKind('src/x.js', 'class X extends HTMLElement {}'), null, 'never defined: not a component yet');
});

test('its tag, props, events and slots, read from its own source', () => {
  const api = classComponentApi('src/chip.js', source);
  assert.equal(api.tag, 'acme-chip');
  assert.equal(api.kind, 'web component');
  assert.deepEqual(Object.keys(api.props).sort(), ['ariaLabelClose', 'removable', 'size', 'value']);
  assert.equal(api.props.removable.type, 'boolean');
  assert.equal(api.props.removable.attribute, 'removable');
  assert.equal(api.props.ariaLabelClose.attribute, 'aria-label-close');
  assert.equal(api.props.value.attribute, undefined, 'a property with no attribute');
  assert.deepEqual(api.events, ['remove']);
  assert.deepEqual(api.slots, { named: ['icon'], default: true });
  assert.match(templateOf('src/chip.js', source), /<span class="label">/);
});

import { LitElement, html, css } from 'lit';
import { property } from 'lit/decorators.js';

/**
 * An on and off switch.
 * @event acme-change - Sent when it is switched.
 */
export default class AcmeSwitch extends LitElement {
  static styles = css`.acmeSwitch { width: 40px; height: 24px; border-radius: 12px; background: #ccc; } .acmeSwitch--on { background: var(--acme-accent); }`;
  @property({ type: Boolean, reflect: true }) checked = false;
  private toggle() { this.checked = !this.checked; this.dispatchEvent(new CustomEvent('acme-change')); }
  render() {
    return html`<button role="switch" aria-checked=${String(this.checked)} aria-label="Switch" class="acmeSwitch ${this.checked ? 'acmeSwitch--on' : ''}" @click=${this.toggle}></button>`;
  }
}

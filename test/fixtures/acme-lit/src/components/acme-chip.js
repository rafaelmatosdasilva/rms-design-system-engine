import { LitElement, html, css } from 'lit';

export class AcmeChip extends LitElement {
  static styles = css`.acmeChip { display: inline-flex; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--acme-accent); }`;
  static properties = { selected: { type: Boolean, reflect: true } };
  constructor() { super(); this.selected = false; }
  render() {
    return html`<span class="acmeChip" aria-pressed=${String(this.selected)} @click=${() => { this.selected = !this.selected; }}><slot></slot></span>`;
  }
}
customElements.define('acme-chip', AcmeChip);

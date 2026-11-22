import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

/** A button people press to act. */
@customElement('acme-button')
export class AcmeButton extends LitElement {
  static styles = css`
    .acmeButton { height: var(--acme-height-m); border-radius: var(--acme-radius); background: var(--acme-accent); color: var(--acme-on-accent); border: 0; padding: 0 16px; }
    .acmeButton--quiet { background: transparent; color: var(--acme-accent); }
  `;
  /** How loud it is. */
  @property({ reflect: true }) tone: 'loud' | 'quiet' = 'loud';
  @property({ type: Boolean, reflect: true }) disabled = false;

  render() {
    return html`<button class="acmeButton acmeButton--${this.tone}" ?disabled=${this.disabled}><slot></slot></button>`;
  }
}

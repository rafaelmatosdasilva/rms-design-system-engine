// A plain custom element, written with no library: its markup and styles in its own shadow root.
const template = document.createElement('template');
template.innerHTML = `<style>
  :host { display: inline-block; }
  .acmeBadge { display: inline-block; border-radius: var(--acme-radius); background: var(--acme-accent); color: var(--acme-on-accent); padding: 0 8px; }
</style><span class="acmeBadge"><slot></slot></span>`;

/** A short status shown beside something. */
export class AcmeBadge extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: 'open' }).append(template.content.cloneNode(true)); }
}
customElements.define('acme-badge', AcmeBadge);

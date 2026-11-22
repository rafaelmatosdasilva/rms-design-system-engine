import { Component, Input } from '@angular/core';

/** A choice a person can pick. */
@Component({
  selector: 'acme-chip',
  standalone: true,
  host: { class: 'acmeChip' },
  template: `<span class="acmeChip__label" [class.is-selected]="selected"><ng-content /></span>`,
  styles: [`.acmeChip__label { border-radius: var(--acme-radius); padding: 2px 8px; } .is-selected { background: var(--acme-accent); color: var(--acme-on-accent); }`],
})
export class AcmeChipComponent {
  @Input() selected = false;
  @Input({ alias: 'chipSize' }) size: 's' | 'm' = 'm';
}

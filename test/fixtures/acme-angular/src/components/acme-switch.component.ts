import { Component, model, output } from '@angular/core';

/** An on and off setting. */
@Component({
  selector: 'acme-switch',
  template: `<button role="switch" class="acmeSwitch" [attr.aria-checked]="checked()" (click)="toggle()">{{ label }}</button>`,
  styles: `.acmeSwitch { height: var(--acme-height-m); border-radius: 999px; }`,
})
export class AcmeSwitchComponent {
  readonly checked = model(false);
  readonly changed = output<boolean>();
  label = 'Notifications';
  toggle() { this.checked.update((v) => !v); this.changed.emit(this.checked()); }
}

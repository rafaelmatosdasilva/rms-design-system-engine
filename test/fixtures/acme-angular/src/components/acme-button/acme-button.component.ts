import { Component, input } from '@angular/core';

/** A button people press to act. */
@Component({
  selector: 'acme-button',
  templateUrl: './acme-button.component.html',
  styleUrl: './acme-button.component.scss',
})
export class AcmeButtonComponent {
  /** How loud it is. */
  readonly tone = input<'loud' | 'quiet'>('loud');
  readonly disabled = input(false);
}

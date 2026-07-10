import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-solscan-link',
  standalone: true,
  template: `
    @if (url) {
      <a class="solscan" [href]="url" target="_blank" rel="noopener noreferrer">Ver en Solscan</a>
    }
  `,
  styles: [`
    .solscan { color: #d4ff5f; text-decoration: none; border-bottom: 1px solid #d4ff5f; font-weight: 800; }
    .solscan:focus-visible { outline: 2px solid #d4ff5f; outline-offset: 3px; }
  `],
})
export class SolscanLinkComponent {
  @Input() url?: string | null;
}

import { Component, Input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'app-solscan-link',
  standalone: true,
  imports: [TranslocoPipe],
  templateUrl: './solscan-link.component.html',
  styleUrl: './solscan-link.component.css',
})
export class SolscanLinkComponent {
  @Input() url?: string | null;
}

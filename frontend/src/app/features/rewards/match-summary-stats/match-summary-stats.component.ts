import { Component, Input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { PersonalMatchHistoryItem } from '../rewards.models';

@Component({
  selector: 'app-match-summary-stats',
  standalone: true,
  imports: [TranslocoPipe],
  templateUrl: './match-summary-stats.component.html',
  styleUrl: './match-summary-stats.component.css',
})
export class MatchSummaryStatsComponent {
  @Input() items: PersonalMatchHistoryItem[] = [];

  get loadedCount(): number {
    return this.items.length;
  }

  get victoriesCount(): number {
    return this.items.filter(item => item.winner === true).length;
  }

  get killsCount(): number {
    return this.items.reduce((total, item) => total + item.kills, 0);
  }
}

import { Component, Input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { PublicMatchDetailPlayer } from '../rewards.models';
import { RewardStatusBadgeComponent } from '../reward-status-badge/reward-status-badge.component';
import { SolscanLinkComponent } from '../solscan-link/solscan-link.component';

@Component({
  selector: 'app-player-ranking-table',
  standalone: true,
  imports: [TranslocoPipe, RewardStatusBadgeComponent, SolscanLinkComponent],
  templateUrl: './player-ranking-table.component.html',
  styleUrl: './player-ranking-table.component.css',
})
export class PlayerRankingTableComponent {
  @Input() players: PublicMatchDetailPlayer[] = [];
  @Input() currentUserId: string | null = null;
  @Input() showRewards = true;
}

import { Component, Input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { PublicMatchDetailPlayer } from './rewards.models';
import { RewardStatusBadgeComponent } from './reward-status-badge.component';
import { SolscanLinkComponent } from './solscan-link.component';

@Component({
  selector: 'app-player-ranking-card',
  standalone: true,
  imports: [TranslocoPipe, RewardStatusBadgeComponent, SolscanLinkComponent],
  templateUrl: './player-ranking-card.component.html',
  styleUrl: './player-ranking-card.component.css',
})
export class PlayerRankingCardComponent {
  @Input() player!: PublicMatchDetailPlayer;
  @Input() isCurrentUser = false;
}

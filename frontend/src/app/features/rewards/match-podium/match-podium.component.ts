import { Component, Input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { PublicRewardPlayer } from '../rewards.models';
import { RewardStatusBadgeComponent } from '../reward-status-badge/reward-status-badge.component';
import { SolscanLinkComponent } from '../solscan-link/solscan-link.component';

@Component({
  selector: 'app-match-podium',
  standalone: true,
  imports: [TranslocoPipe, RewardStatusBadgeComponent, SolscanLinkComponent],
  templateUrl: './match-podium.component.html',
  styleUrl: './match-podium.component.css',
})
export class MatchPodiumComponent {
  @Input() podium: PublicRewardPlayer[] = [];

  initials(username?: string | null): string {
    return (username || 'P').slice(0, 2).toUpperCase();
  }
}

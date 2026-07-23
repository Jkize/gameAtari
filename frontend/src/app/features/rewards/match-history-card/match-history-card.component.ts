import { DatePipe } from '@angular/common';
import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { PersonalMatchHistoryItem } from '../rewards.models';
import { ineligibilityReasonLabel } from '../rewards-ui';
import { RewardStatusBadgeComponent } from '../reward-status-badge/reward-status-badge.component';
import { SolscanLinkComponent } from '../solscan-link/solscan-link.component';

@Component({
  selector: 'app-match-history-card',
  standalone: true,
  imports: [DatePipe, RouterLink, TranslocoPipe, RewardStatusBadgeComponent, SolscanLinkComponent],
  templateUrl: './match-history-card.component.html',
  styleUrl: './match-history-card.component.css',
})
export class MatchHistoryCardComponent {
  @Input() item!: PersonalMatchHistoryItem;

  reason(reason: NonNullable<PersonalMatchHistoryItem['reward']>['ineligibilityReason']): string {
    return ineligibilityReasonLabel(reason);
  }
}

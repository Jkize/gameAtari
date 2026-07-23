import { Component, Input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { RewardStatus } from '../rewards.models';
import { publicRewardLabel, rewardStatusClass, rewardStatusLabel } from '../rewards-ui';

@Component({
  selector: 'app-reward-status-badge',
  standalone: true,
  imports: [TranslocoPipe],
  templateUrl: './reward-status-badge.component.html',
  styleUrl: './reward-status-badge.component.css',
})
export class RewardStatusBadgeComponent {
  @Input() status?: RewardStatus | null;
  @Input() publicOnly = false;

  label(): string { return rewardStatusLabel(this.status); }
  publicLabel(): string { return publicRewardLabel(this.status); }
  statusClass(): string { return `badge ${rewardStatusClass(this.status)}`; }
}

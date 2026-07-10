import { Component, Input } from '@angular/core';
import { RewardStatus } from './rewards.models';
import { publicRewardLabel, rewardStatusClass, rewardStatusLabel } from './rewards-ui';

@Component({
  selector: 'app-reward-status-badge',
  standalone: true,
  template: `<span class="badge" [class]="statusClass()">{{ publicOnly ? publicLabel() : label() }}</span>`,
  styles: [`
    .badge { display: inline-block; padding: 5px 8px; border: 1px solid #71825c; font-size: .78rem; font-weight: 800; white-space: nowrap; }
    .ok { color: #d4ff5f; border-color: #d4ff5f; }
    .pending { color: #f5d76e; border-color: #f5d76e; }
    .warn { color: #ffb36b; border-color: #ffb36b; }
    .muted { color: #aeb8a6; border-color: #71825c; }
  `],
})
export class RewardStatusBadgeComponent {
  @Input() status?: RewardStatus | null;
  @Input() publicOnly = false;

  label(): string { return rewardStatusLabel(this.status); }
  publicLabel(): string { return publicRewardLabel(this.status); }
  statusClass(): string { return `badge ${rewardStatusClass(this.status)}`; }
}

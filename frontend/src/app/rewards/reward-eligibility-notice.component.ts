import { Component, Input, OnChanges, OnInit, SimpleChanges, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthService } from '../auth/auth.service';
import { RewardsService } from './rewards.service';
import { WalletStatus } from './rewards.models';

@Component({
  selector: 'app-reward-eligibility-notice',
  standalone: true,
  imports: [RouterLink, TranslocoPipe],
  templateUrl: './reward-eligibility-notice.component.html',
  styleUrl: './reward-eligibility-notice.component.css',
})
export class RewardEligibilityNoticeComponent implements OnInit, OnChanges {
  @Input() refreshKey = 0;
  readonly walletStatus = signal<WalletStatus | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');

  private readonly transloco = inject(TranslocoService);

  constructor(
    readonly auth: AuthService,
    private readonly rewards: RewardsService,
  ) {}

  ngOnInit(): void {
    this.loadStatus();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['refreshKey'] && !changes['refreshKey'].firstChange) this.loadStatus();
  }

  canLinkPhantom(): boolean {
    const status = this.walletStatus();
    return this.auth.currentProvider() === 'GOOGLE' && status?.phantom?.verified !== true;
  }

  retryCheck(): void {
    this.loadStatus();
  }

  private loadStatus(): void {
    if (!this.auth.user()) return;
    this.walletStatus.set(null);
    this.rewards.getWalletStatus().subscribe({
      next: status => this.walletStatus.set(status),
      error: () => this.walletStatus.set({
        currentProvider: this.auth.currentProvider() ?? 'GOOGLE',
        phantom: { linked: false, verified: false },
        google: { linked: this.auth.currentProvider() === 'GOOGLE' },
        holder: {
          status: 'unavailable',
          requiredTokens: 10000,
          message: this.transloco.translate('rewards.eligibility.verificationFailedTitle'),
        },
      }),
    });
  }

  async linkPhantom(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      this.walletStatus.set(await this.auth.linkPhantom());
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : this.transloco.translate('rewards.eligibility.linkPhantomError'));
    } finally {
      this.busy.set(false);
    }
  }
}

import {
  Component,
  ElementRef,
  HostBinding,
  HostListener,
  OnInit,
  ViewChild,
  computed,
  input,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  RewardPrize,
  RewardScheduleEntry,
  RewardsConfig,
  RewardTier,
  WalletStatus,
} from '../rewards.models';
import { RewardsService } from '../rewards.service';

interface RewardTierSummary extends RewardTier {
  startingPrizes: RewardPrize[];
  endingPrizes: RewardPrize[];
}

@Component({
  selector: 'app-reward-projection',
  standalone: true,
  imports: [TranslocoPipe],
  templateUrl: './reward-projection.component.html',
  styleUrl: './reward-projection.component.css',
})
export class RewardProjectionComponent implements OnInit {
  @ViewChild('triggerButton') private triggerButton?: ElementRef<HTMLButtonElement>;
  @ViewChild('closeButton') private closeButton?: ElementRef<HTMLButtonElement>;

  readonly playerCount = input(0);
  readonly providedWalletStatus = input<WalletStatus | null | undefined>(
    undefined,
    { alias: 'walletStatus' },
  );
  readonly wideTrigger = input(false);

  readonly config = signal<RewardsConfig | null>(null);
  readonly fetchedWalletStatus = signal<WalletStatus | null>(null);
  readonly modalOpen = signal(false);
  readonly projected = computed(() => this.entryFor(this.playerCount()));
  readonly preview = computed(() => {
    const config = this.config();
    return config ? this.entryFor(config.minimumPlayers) : null;
  });
  readonly next = computed(() => {
    const config = this.config();
    if (!config) return null;
    const currentCount = Math.max(this.playerCount(), config.minimumPlayers - 1);
    return config.schedule.find(entry => entry.playerCount > currentCount) ?? null;
  });
  readonly tierSummaries = computed<RewardTierSummary[]>(() => {
    const config = this.config();
    if (!config) return [];
    return config.tiers.map(tier => ({
      ...tier,
      startingPrizes: this.entryFor(tier.minimumPlayers)?.prizes ?? [],
      endingPrizes: this.entryFor(tier.maximumPlayers)?.prizes ?? [],
    }));
  });

  constructor(private readonly rewards: RewardsService) {}

  ngOnInit(): void {
    this.rewards.getConfig().subscribe({
      next: config => this.config.set(config),
    });
    if (this.providedWalletStatus() === undefined) {
      this.rewards.getWalletStatus().subscribe({
        next: status => this.fetchedWalletStatus.set(status),
        error: () => this.fetchedWalletStatus.set(null),
      });
    }
  }

  openModal(): void {
    this.modalOpen.set(true);
    setTimeout(() => this.closeButton?.nativeElement.focus());
  }

  closeModal(): void {
    if (!this.modalOpen()) return;
    this.modalOpen.set(false);
    setTimeout(() => this.triggerButton?.nativeElement.focus());
  }

  displayedEntry(): RewardScheduleEntry | null {
    return this.projected() ?? this.preview();
  }

  playersNeeded(): number {
    const minimumPlayers = this.config()?.minimumPlayers ?? 0;
    return Math.max(0, minimumPlayers - this.playerCount());
  }

  walletVerified(): boolean | null {
    const status = this.currentWalletStatus();
    return status ? status.phantom.verified : null;
  }

  balanceSufficient(): boolean | null {
    const status = this.currentWalletStatus();
    if (!status || status.holder.status === 'unknown' || status.holder.status === 'unavailable') {
      return null;
    }
    return status.holder.status === 'eligible';
  }

  requiredTokens(): number {
    return this.currentWalletStatus()?.holder.requiredTokens ?? 10000;
  }

  @HostBinding('class.reward-projection--wide')
  get wideHost(): boolean {
    return this.wideTrigger();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeModal();
  }

  private entryFor(playerCount: number): RewardScheduleEntry | null {
    return this.config()?.schedule.find(entry => entry.playerCount === playerCount) ?? null;
  }

  private currentWalletStatus(): WalletStatus | null {
    const provided = this.providedWalletStatus();
    return provided === undefined ? this.fetchedWalletStatus() : provided;
  }
}

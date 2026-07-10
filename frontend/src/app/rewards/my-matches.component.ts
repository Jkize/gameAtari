import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { EmptyStateComponent } from '../shared/empty-state.component';
import { LoadingSkeletonComponent } from '../shared/loading-skeleton.component';
import { MatchHistoryCardComponent } from './match-history-card.component';
import { MatchSummaryStatsComponent } from './match-summary-stats.component';
import { PersonalMatchHistoryItem } from './rewards.models';
import { RewardsService } from './rewards.service';
import { rewardStatusClass } from './rewards-ui';

export type MatchFilter = 'all' | 'victories' | 'rewarded' | 'unrewarded' | 'pending';

@Component({
  selector: 'app-my-matches',
  standalone: true,
  imports: [
    RouterLink,
    TranslocoPipe,
    EmptyStateComponent,
    LoadingSkeletonComponent,
    MatchHistoryCardComponent,
    MatchSummaryStatsComponent,
  ],
  templateUrl: './my-matches.component.html',
  styleUrl: './my-matches.component.css',
})
export class MyMatchesComponent implements OnInit {
  readonly items = signal<PersonalMatchHistoryItem[]>([]);
  readonly nextCursor = signal<string | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly filter = signal<MatchFilter>('all');

  readonly filteredItems = computed(() => {
    const filter = this.filter();
    const items = this.items();
    switch (filter) {
      case 'victories':
        return items.filter(item => item.winner === true);
      case 'rewarded':
        return items.filter(item => rewardStatusClass(item.reward?.status) === 'ok');
      case 'pending':
        return items.filter(item => rewardStatusClass(item.reward?.status) === 'pending');
      case 'unrewarded':
        return items.filter(item => {
          const statusClass = rewardStatusClass(item.reward?.status);
          return statusClass !== 'ok' && statusClass !== 'pending';
        });
      default:
        return items;
    }
  });

  private readonly transloco = inject(TranslocoService);
  private readonly router = inject(Router);

  constructor(private readonly rewards: RewardsService) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    this.rewards.getMyMatches(this.nextCursor()).subscribe({
      next: page => {
        this.items.set([...this.items(), ...page.items]);
        this.nextCursor.set(page.nextCursor ?? null);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(this.transloco.translate('rewards.myMatches.loadError'));
        this.loading.set(false);
      },
    });
  }

  setFilter(filter: MatchFilter): void {
    this.filter.set(filter);
  }

  goToLobby(): void {
    this.router.navigate(['/lobby']);
  }
}

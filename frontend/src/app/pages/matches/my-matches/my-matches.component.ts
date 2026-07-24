import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { EmptyStateComponent } from '@shared/ui/empty-state/empty-state.component';
import { LoadingSkeletonComponent } from '@shared/ui/loading-skeleton/loading-skeleton.component';
import { MatchHistoryCardComponent } from '@features/rewards/match-history-card/match-history-card.component';
import { MatchSummaryStatsComponent } from '@features/rewards/match-summary-stats/match-summary-stats.component';
import { PersonalMatchHistoryItem } from '@features/rewards/rewards.models';
import { RewardsService } from '@features/rewards/rewards.service';

export type MatchFilter = 'all' | 'victories' | 'public' | 'private';

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
      case 'public':
        return items.filter(item => item.roomType === 'PUBLIC');
      case 'private':
        return items.filter(item => item.roomType === 'PRIVATE');
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

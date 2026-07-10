import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { EmptyStateComponent } from '../shared/empty-state.component';
import { LoadingSkeletonComponent } from '../shared/loading-skeleton.component';
import { PublicMatchHistoryItem } from './rewards.models';
import { RewardsService } from './rewards.service';
import { MatchPodiumComponent } from './match-podium.component';

@Component({
  selector: 'app-recent-matches',
  standalone: true,
  imports: [DatePipe, RouterLink, TranslocoPipe, EmptyStateComponent, LoadingSkeletonComponent, MatchPodiumComponent],
  templateUrl: './recent-matches.component.html',
  styleUrl: './recent-matches.component.css',
})
export class RecentMatchesComponent implements OnInit {
  readonly items = signal<PublicMatchHistoryItem[]>([]);
  readonly nextCursor = signal<string | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');

  private readonly transloco = inject(TranslocoService);

  constructor(private readonly rewards: RewardsService) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    this.rewards.getRecentMatches(this.nextCursor()).subscribe({
      next: page => {
        this.items.set([...this.items(), ...page.items]);
        this.nextCursor.set(page.nextCursor ?? null);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(this.transloco.translate('rewards.recentMatches.loadError'));
        this.loading.set(false);
      },
    });
  }
}

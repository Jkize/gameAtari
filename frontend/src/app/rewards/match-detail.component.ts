import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthService } from '../auth/auth.service';
import { EmptyStateComponent } from '../shared/empty-state.component';
import { LoadingSkeletonComponent } from '../shared/loading-skeleton.component';
import { PublicMatchDetail } from './rewards.models';
import { RewardsService } from './rewards.service';
import { PlayerRankingCardComponent } from './player-ranking-card.component';
import { PlayerRankingTableComponent } from './player-ranking-table.component';

@Component({
  selector: 'app-match-detail',
  standalone: true,
  imports: [
    DatePipe,
    RouterLink,
    TranslocoPipe,
    EmptyStateComponent,
    LoadingSkeletonComponent,
    PlayerRankingTableComponent,
    PlayerRankingCardComponent,
  ],
  templateUrl: './match-detail.component.html',
  styleUrl: './match-detail.component.css',
})
export class MatchDetailComponent implements OnInit {
  readonly detail = signal<PublicMatchDetail | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly backLink: string;

  readonly auth = inject(AuthService);
  private readonly transloco = inject(TranslocoService);

  constructor(
    private readonly route: ActivatedRoute,
    private readonly rewards: RewardsService,
  ) {
    this.backLink = (history.state as { from?: string })?.from ?? '/matches/recent';
  }

  ngOnInit(): void {
    const matchId = this.route.snapshot.paramMap.get('matchId');
    if (!matchId) {
      this.error.set(this.transloco.translate('rewards.matchDetail.notFound'));
      this.loading.set(false);
      return;
    }
    this.fetchDetail(matchId);
  }

  reload(): void {
    const matchId = this.route.snapshot.paramMap.get('matchId');
    if (!matchId) {
      this.error.set(this.transloco.translate('rewards.matchDetail.notFound'));
      this.loading.set(false);
      return;
    }
    this.fetchDetail(matchId);
  }

  private fetchDetail(matchId: string): void {
    this.loading.set(true);
    this.error.set('');
    this.rewards.getMatchDetail(matchId).subscribe({
      next: detail => {
        this.detail.set(detail);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(this.transloco.translate('rewards.matchDetail.loadError'));
        this.loading.set(false);
      },
    });
  }
}

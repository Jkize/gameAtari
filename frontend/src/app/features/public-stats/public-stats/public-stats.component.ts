import { Component, Input, OnDestroy, OnInit, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { PublicStats, PublicStatsService } from '../public-stats.service';

type StatsState = 'loading' | 'loaded' | 'error';

@Component({
  selector: 'app-public-stats',
  standalone: true,
  imports: [TranslocoPipe],
  templateUrl: './public-stats.component.html',
  styleUrl: './public-stats.component.css',
})
export class PublicStatsComponent implements OnInit, OnDestroy {
  @Input() compact = false;

  readonly stats = signal<PublicStats | null>(null);
  readonly state = signal<StatsState>('loading');
  private refreshTimer?: number;

  constructor(private readonly publicStats: PublicStatsService) {}

  ngOnInit(): void {
    this.loadStats();
    this.refreshTimer = window.setInterval(() => this.loadStats(), 10_000);
  }

  ngOnDestroy(): void {
    if (this.refreshTimer !== undefined) window.clearInterval(this.refreshTimer);
  }

  private loadStats(): void {
    this.publicStats.getPublicStats().subscribe({
      next: stats => {
        this.stats.set(stats);
        this.state.set('loaded');
      },
      error: () => this.state.set('error'),
    });
  }
}

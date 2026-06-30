import { Component, Input, OnDestroy, OnInit, signal } from '@angular/core';
import { PublicStats, PublicStatsService } from './public-stats.service';

@Component({
  selector: 'app-public-stats',
  standalone: true,
  template: `
    <section class="stats" [class.compact]="compact" aria-label="Estado publico del juego">
      @if (stats()) {
        <div>
          <strong>{{ stats()!.playersOnline }}</strong>
          <span>online</span>
        </div>
        <div>
          <strong>{{ stats()!.activeMatches }}</strong>
          <span>batallas</span>
        </div>
        <div>
          <strong>{{ stats()!.availableRooms }}</strong>
          <span>salas</span>
        </div>
      } @else {
        <div>
          <strong>--</strong>
          <span>online</span>
        </div>
        <div>
          <strong>--</strong>
          <span>batallas</span>
        </div>
        <div>
          <strong>--</strong>
          <span>salas</span>
        </div>
      }
    </section>
  `,
  styles: [`
    .stats {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      margin: 22px 0;
    }

    .stats div {
      min-width: 0;
      padding: 12px;
      border: 1px solid rgba(212, 255, 95, .28);
      background: rgba(13, 18, 12, .76);
    }

    .stats strong,
    .stats span {
      display: block;
      text-align: center;
    }

    .stats strong {
      color: #d4ff5f;
      font-size: 1.35rem;
      line-height: 1;
    }

    .stats span {
      margin-top: 5px;
      color: #aeb8a6;
      font-size: .78rem;
      text-transform: uppercase;
    }

    .stats.compact {
      width: min(420px, 100%);
      margin: 0 0 28px;
    }

    @media (max-width: 520px) {
      .stats div { padding: 10px 6px; }
      .stats strong { font-size: 1.1rem; }
      .stats span { font-size: .68rem; }
    }
  `],
})
export class PublicStatsComponent implements OnInit, OnDestroy {
  @Input() compact = false;

  readonly stats = signal<PublicStats | null>(null);
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
      next: stats => this.stats.set(stats),
      error: () => this.stats.set(null),
    });
  }
}

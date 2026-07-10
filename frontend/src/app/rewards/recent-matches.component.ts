import { DatePipe } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PublicMatchHistoryItem } from './rewards.models';
import { RewardsService } from './rewards.service';
import { RewardStatusBadgeComponent } from './reward-status-badge.component';
import { SolscanLinkComponent } from './solscan-link.component';

@Component({
  selector: 'app-recent-matches',
  standalone: true,
  imports: [DatePipe, RouterLink, RewardStatusBadgeComponent, SolscanLinkComponent],
  template: `
    <main class="page">
      <nav><a routerLink="/lobby">Volver al lobby</a></nav>
      <h1>Últimas partidas</h1>

      @if (loading() && !items().length) {
        <div class="skeleton"></div>
        <div class="skeleton"></div>
      } @else if (error()) {
        <section class="state error">{{ error() }}</section>
      } @else if (!items().length) {
        <section class="state">Aún no hay partidas recientes.</section>
      } @else {
        <section class="list" aria-label="Ultimas partidas">
          @for (item of items(); track item.matchId) {
            <article class="match">
              <header>
                <div>
                  <time>{{ item.playedAt | date:'medium' }}</time>
                  <h2>{{ item.mapName || 'Arena' }}</h2>
                  <p>{{ item.playerCount }} participantes</p>
                </div>
                <a [routerLink]="['/matches', item.matchId]">Detalle</a>
              </header>
              <div class="podium">
                @for (player of item.podium; track player.placement) {
                  <div class="podium-row">
                    <div class="avatar" aria-hidden="true">{{ initials(player.username) }}</div>
                    <strong>{{ player.placement }}.º</strong>
                    <span>{{ player.username || 'Piloto' }}</span>
                    <span>{{ player.reward?.potentialAmount ?? 0 }} tokens</span>
                    <app-reward-status-badge [status]="player.reward?.status" [publicOnly]="true"></app-reward-status-badge>
                    <app-solscan-link [url]="player.reward?.solscanUrl"></app-solscan-link>
                  </div>
                }
              </div>
            </article>
          }
        </section>
        @if (nextCursor()) {
          <button class="more" type="button" (click)="load()" [disabled]="loading()">Cargar más</button>
        }
      }
    </main>
  `,
  styles: [`
    :host { display: block; min-height: 100vh; color: #edf4dc; background: #11170f; }
    .page { width: min(1060px, calc(100% - 40px)); margin: auto; padding: 42px 0; }
    nav a, header a { color: #d4ff5f; text-decoration: none; font-weight: 800; }
    h1 { margin: 18px 0 24px; font-size: 2.4rem; }
    .list { display: grid; gap: 14px; }
    .match { padding: 18px; border: 1px solid #71825c; background: #1c281a; }
    header { display: flex; justify-content: space-between; gap: 16px; align-items: start; margin-bottom: 12px; }
    h2, p { margin: 4px 0; }
    time, p { color: #aeb8a6; }
    .podium { display: grid; gap: 8px; }
    .podium-row { display: grid; grid-template-columns: 38px 42px minmax(100px, 1fr) 96px auto auto; gap: 10px; align-items: center; padding: 10px; background: rgba(13, 18, 12, .62); border: 1px solid rgba(113, 130, 92, .62); }
    .avatar { display: grid; place-items: center; width: 34px; height: 34px; background: #263223; color: #d4ff5f; font-weight: 800; }
    .state, .skeleton { padding: 24px; border: 1px solid #71825c; background: #1c281a; color: #cbd6bd; }
    .error { color: #ff8a80; }
    .skeleton { height: 118px; margin-bottom: 12px; background: linear-gradient(90deg, #1c281a, #263223, #1c281a); }
    .more { margin-top: 18px; padding: 11px 18px; border: 1px solid #d4ff5f; background: #d4ff5f; color: #10150e; font-weight: 800; cursor: pointer; }
    @media (max-width: 760px) { .podium-row { grid-template-columns: 38px 42px 1fr; } }
  `],
})
export class RecentMatchesComponent implements OnInit {
  readonly items = signal<PublicMatchHistoryItem[]>([]);
  readonly nextCursor = signal<string | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');

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
        this.error.set('No se pudieron cargar las partidas recientes.');
        this.loading.set(false);
      },
    });
  }

  initials(username?: string | null): string {
    return (username || 'P').slice(0, 2).toUpperCase();
  }
}

import { DatePipe } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PublicMatchDetail } from './rewards.models';
import { RewardsService } from './rewards.service';
import { RewardStatusBadgeComponent } from './reward-status-badge.component';
import { SolscanLinkComponent } from './solscan-link.component';

@Component({
  selector: 'app-match-detail',
  standalone: true,
  imports: [DatePipe, RouterLink, RewardStatusBadgeComponent, SolscanLinkComponent],
  template: `
    <main class="page">
      <nav><a routerLink="/matches/recent">Últimas partidas</a></nav>

      @if (loading()) {
        <div class="skeleton" aria-label="Cargando detalle"></div>
      } @else if (error()) {
        <section class="state error">{{ error() }}</section>
      } @else if (detail()) {
        <header>
          <div>
            <h1>{{ detail()!.mapName || 'Arena' }}</h1>
            <time>{{ detail()!.playedAt | date:'medium' }}</time>
          </div>
          <strong>{{ detail()!.playerCount }} participantes</strong>
        </header>

        <section class="table-wrap" aria-label="Detalle publico de partida">
          <table>
            <thead>
              <tr>
                <th>Posición</th>
                <th>Piloto</th>
                <th>Kills</th>
                <th>Damage</th>
                <th>Resultado</th>
                <th>Premio</th>
                <th>Estado</th>
                <th>Solscan</th>
              </tr>
            </thead>
            <tbody>
              @for (player of detail()!.players; track player.placement) {
                <tr>
                  <td>{{ player.placement }}.º</td>
                  <td>{{ player.username || 'Piloto' }}</td>
                  <td>{{ player.kills }}</td>
                  <td>{{ player.damageDealt }}</td>
                  <td>{{ player.winner ? 'Victoria' : 'Eliminado' }}</td>
                  <td>{{ player.reward?.potentialAmount ?? 0 }} tokens</td>
                  <td><app-reward-status-badge [status]="player.reward?.status" [publicOnly]="true"></app-reward-status-badge></td>
                  <td><app-solscan-link [url]="player.reward?.solscanUrl"></app-solscan-link></td>
                </tr>
              }
            </tbody>
          </table>
        </section>
      }
    </main>
  `,
  styles: [`
    :host { display: block; min-height: 100vh; color: #edf4dc; background: #11170f; }
    .page { width: min(1100px, calc(100% - 40px)); margin: auto; padding: 42px 0; }
    nav a { color: #d4ff5f; text-decoration: none; font-weight: 800; }
    header { display: flex; justify-content: space-between; gap: 16px; align-items: end; margin: 22px 0; }
    h1 { margin: 0 0 6px; font-size: 2.4rem; }
    time { color: #aeb8a6; }
    .table-wrap { overflow-x: auto; border: 1px solid #71825c; background: #1c281a; }
    table { width: 100%; border-collapse: collapse; min-width: 780px; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid rgba(113, 130, 92, .45); }
    th { color: #d4ff5f; font-size: .78rem; text-transform: uppercase; }
    .state, .skeleton { padding: 24px; border: 1px solid #71825c; background: #1c281a; color: #cbd6bd; }
    .error { color: #ff8a80; }
    .skeleton { height: 220px; margin-top: 22px; background: linear-gradient(90deg, #1c281a, #263223, #1c281a); }
  `],
})
export class MatchDetailComponent implements OnInit {
  readonly detail = signal<PublicMatchDetail | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');

  constructor(
    private readonly route: ActivatedRoute,
    private readonly rewards: RewardsService,
  ) {}

  ngOnInit(): void {
    const matchId = this.route.snapshot.paramMap.get('matchId');
    if (!matchId) {
      this.error.set('Partida no encontrada.');
      this.loading.set(false);
      return;
    }
    this.rewards.getMatchDetail(matchId).subscribe({
      next: detail => {
        this.detail.set(detail);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No se pudo cargar el detalle de la partida.');
        this.loading.set(false);
      },
    });
  }
}

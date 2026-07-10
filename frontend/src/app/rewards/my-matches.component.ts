import { DatePipe } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PersonalMatchHistoryItem } from './rewards.models';
import { RewardsService } from './rewards.service';
import { ineligibilityReasonLabel } from './rewards-ui';
import { RewardStatusBadgeComponent } from './reward-status-badge.component';
import { SolscanLinkComponent } from './solscan-link.component';

@Component({
  selector: 'app-my-matches',
  standalone: true,
  imports: [DatePipe, RouterLink, RewardStatusBadgeComponent, SolscanLinkComponent],
  template: `
    <main class="page">
      <nav><a routerLink="/lobby">Volver al lobby</a></nav>
      <h1>Mis partidas</h1>

      @if (loading() && !items().length) {
        <div class="skeleton" aria-label="Cargando historial"></div>
        <div class="skeleton short"></div>
      } @else if (error()) {
        <section class="state error">{{ error() }}</section>
      } @else if (!items().length) {
        <section class="state">Todavía no tienes partidas registradas.</section>
      } @else {
        <section class="list" aria-label="Historial personal de partidas">
          @for (item of items(); track item.matchId) {
            <article class="row">
              <div>
                <time>{{ item.playedAt | date:'medium' }}</time>
                <h2>{{ item.mapName || 'Arena' }}</h2>
                <p>#{{ item.placement }} de {{ item.playerCount }} · {{ item.kills }} kills · {{ item.damageDealt }} damage</p>
              </div>
              <div class="reward">
                @if (item.winner) { <strong>Victoria</strong> }
                <span>Premio potencial: {{ item.reward?.potentialAmount ?? 0 }} tokens</span>
                <app-reward-status-badge [status]="item.reward?.status"></app-reward-status-badge>
                @if (item.reward?.ineligibilityReason) {
                  <small>{{ reason(item.reward!.ineligibilityReason) }}</small>
                }
                <span>Recibido: {{ item.reward?.amount ?? 0 }} tokens</span>
                <app-solscan-link [url]="item.reward?.solscanUrl"></app-solscan-link>
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
    nav a { color: #d4ff5f; text-decoration: none; }
    h1 { margin: 18px 0 24px; font-size: 2.4rem; }
    .list { display: grid; gap: 12px; }
    .row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(250px, 340px); gap: 16px; padding: 18px; border: 1px solid #71825c; background: #1c281a; }
    time, p, small { color: #aeb8a6; }
    h2, p { margin: 4px 0; }
    .reward { display: grid; gap: 7px; justify-items: start; }
    .state { padding: 24px; border: 1px solid #71825c; background: #1c281a; color: #cbd6bd; }
    .error { color: #ff8a80; }
    .more { margin-top: 18px; padding: 11px 18px; border: 1px solid #d4ff5f; background: #d4ff5f; color: #10150e; font-weight: 800; cursor: pointer; }
    .skeleton { height: 108px; margin-bottom: 12px; background: linear-gradient(90deg, #1c281a, #263223, #1c281a); border: 1px solid #263223; }
    .skeleton.short { height: 72px; }
    @media (max-width: 720px) { .row { grid-template-columns: 1fr; } }
  `],
})
export class MyMatchesComponent implements OnInit {
  readonly items = signal<PersonalMatchHistoryItem[]>([]);
  readonly nextCursor = signal<string | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');

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
        this.error.set('No se pudo cargar tu historial.');
        this.loading.set(false);
      },
    });
  }

  reason(reason: NonNullable<PersonalMatchHistoryItem['reward']>['ineligibilityReason']): string {
    return ineligibilityReasonLabel(reason);
  }
}

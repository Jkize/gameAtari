import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import { RecentMatchesComponent } from './recent-matches.component';
import { RewardsService } from '@features/rewards/rewards.service';

const es = {
  'rewards.common.backToLobby': 'Volver al lobby',
  'rewards.common.mapFallback': 'Arena',
  'rewards.common.pilotFallback': 'Piloto',
  'rewards.common.tokensAmount': '{{amount}} tokens',
  'rewards.common.participants': '{{count}} participantes',
  'rewards.common.loadMore': 'Cargar más',
  'rewards.common.retry': 'Reintentar',
  'rewards.common.ordinalSuffix': '.º',
  'rewards.recentMatches.title': 'Últimas partidas',
  'rewards.recentMatches.loadingAriaLabel': 'Cargando partidas recientes',
  'rewards.recentMatches.emptyState': 'Aún no hay partidas recientes.',
  'rewards.recentMatches.emptyStateHint': 'Las partidas públicas finalizadas aparecerán aquí.',
  'rewards.recentMatches.detailLink': 'Detalle',
  'rewards.recentMatches.loadErrorTitle': 'No fue posible cargar la información',
  'rewards.publicStatus.pending': 'Pendiente',
  'rewards.status.sent': 'Confirmado',
  'rewards.status.manualReview': 'En revision',
  'rewards.status.notEligible': 'No elegible',
  'rewards.status.none': 'Sin premio',
  'rewards.solscan.viewLink': 'Ver en Solscan',
};

describe('RecentMatchesComponent', () => {
  it('shows public recent matches', async () => {
    await TestBed.configureTestingModule({
      imports: [
        RecentMatchesComponent,
        TranslocoTestingModule.forRoot({
          langs: { es },
          translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        }),
      ],
      providers: [
        provideRouter([]),
        {
          provide: RewardsService,
          useValue: {
            getRecentMatches: () => of({
              items: [{
                matchId: 'm1',
                playedAt: '2026-07-09T12:00:00.000Z',
                mapName: 'Arena',
                playerCount: 4,
                podium: [
                  {
                    placement: 1,
                    username: 'Alpha',
                    reward: { potentialAmount: 700, amount: 700, eligible: true, status: 'SENT', solscanUrl: 'https://solscan.io/tx/abc' },
                  },
                ],
              }],
            }),
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(RecentMatchesComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Últimas partidas');
    expect(fixture.nativeElement.textContent).toContain('Alpha');
    expect(fixture.nativeElement.textContent).toContain('Confirmado');
    expect(fixture.nativeElement.querySelector('a.solscan').href).toBe('https://solscan.io/tx/abc');
  });
});

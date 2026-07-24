import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import { RewardsService } from '@features/rewards/rewards.service';
import { MyMatchesComponent } from './my-matches.component';

const es = {
  'rewards.common.backToLobby': 'Volver al lobby',
  'rewards.common.mapFallback': 'Arena',
  'rewards.common.victory': 'Victoria',
  'rewards.common.loadMore': 'Cargar más',
  'rewards.common.retry': 'Reintentar',
  'rewards.common.publicRoom': 'PÚBLICA',
  'rewards.common.privateRoom': 'PRIVADA',
  'rewards.myMatches.title': 'Mis partidas',
  'rewards.myMatches.loadingAriaLabel': 'Cargando historial',
  'rewards.myMatches.emptyState': 'Todavía no tienes partidas registradas.',
  'rewards.myMatches.emptyStateHint': 'Juega tu primera partida para verla aquí.',
  'rewards.myMatches.emptyStateAction': 'Jugar ahora',
  'rewards.myMatches.listAriaLabel': 'Historial personal de partidas',
  'rewards.myMatches.matchSummary': '#{{placement}} de {{playerCount}} · {{kills}} kills · {{damage}} damage',
  'rewards.myMatches.potentialReward': 'Premio potencial: {{amount}} tokens',
  'rewards.myMatches.receivedReward': 'Recibido: {{amount}} tokens',
  'rewards.myMatches.loadErrorTitle': 'No fue posible cargar la información',
  'rewards.myMatches.viewMatch': 'Ver partida',
  'rewards.myMatches.filterAll': 'Todos',
  'rewards.myMatches.filterVictories': 'Victorias',
  'rewards.myMatches.filterPublic': 'Públicas',
  'rewards.myMatches.filterPrivate': 'Privadas',
  'rewards.myMatches.filterRewarded': 'Con premio',
  'rewards.myMatches.filterUnrewarded': 'Sin premio',
  'rewards.myMatches.filterPending': 'Pendientes',
  'rewards.myMatches.filteredEmptyTitle': 'Sin resultados',
  'rewards.myMatches.filteredEmpty': 'No hay partidas con este filtro entre los resultados cargados.',
  'rewards.myMatches.summaryLoadedCount': 'Cargadas',
  'rewards.myMatches.summaryVictories': 'Victorias',
  'rewards.myMatches.summaryKills': 'Eliminaciones',
  'rewards.myMatches.summaryRewarded': 'Con premio',
  'rewards.myMatches.summaryCaption': 'Sobre las partidas cargadas',
  'rewards.status.notEligible': 'No elegible',
  'rewards.status.sent': 'Confirmado',
  'rewards.status.failed': 'Pago fallido',
  'rewards.status.none': 'Sin premio',
  'rewards.ineligibility.walletNotLinked': 'Wallet Phantom no vinculada.',
  'rewards.solscan.viewLink': 'Ver en Solscan',
};

describe('MyMatchesComponent', () => {
  const setup = async (items: unknown[]) => {
    const normalizedItems = items.map(item => ({
      roomId: 'room-1',
      roomType: 'PUBLIC',
      rewardsEligible: true,
      ...item as object,
    }));
    await TestBed.configureTestingModule({
      imports: [
        MyMatchesComponent,
        TranslocoTestingModule.forRoot({
          langs: { es },
          translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        }),
      ],
      providers: [
        provideRouter([]),
        { provide: RewardsService, useValue: { getMyMatches: () => of({ items: normalizedItems }) } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(MyMatchesComponent);
    fixture.detectChanges();
    return fixture;
  };

  it('shows empty state', async () => {
    const fixture = await setup([]);

    expect(fixture.nativeElement.textContent).toContain('Todavía no tienes partidas');
    expect(fixture.nativeElement.textContent).toContain('Jugar ahora');
  });

  it('shows confirmed rewards and Solscan links', async () => {
    const fixture = await setup([{
      matchId: 'm1',
      playedAt: '2026-07-09T12:00:00.000Z',
      mapName: 'Arena',
      placement: 1,
      playerCount: 3,
      kills: 2,
      damageDealt: 120,
      winner: true,
      reward: { potentialAmount: 700, amount: 700, eligible: true, status: 'SENT', solscanUrl: 'https://solscan.io/tx/abc' },
    }]);

    expect(fixture.nativeElement.textContent).toContain('Confirmado');
    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('a.solscan');
    expect(link.href).toBe('https://solscan.io/tx/abc');
    expect(link.rel).toContain('noopener');
  });

  it('shows no eligible and failed payment states', async () => {
    const fixture = await setup([
      {
        matchId: 'm1',
        playedAt: '2026-07-09T12:00:00.000Z',
        placement: 1,
        playerCount: 3,
        kills: 0,
        damageDealt: 10,
        winner: false,
        reward: { potentialAmount: 700, amount: 0, eligible: false, status: 'NOT_ELIGIBLE', ineligibilityReason: 'WALLET_NOT_LINKED' },
      },
      {
        matchId: 'm2',
        playedAt: '2026-07-09T13:00:00.000Z',
        placement: 2,
        playerCount: 3,
        kills: 1,
        damageDealt: 50,
        winner: false,
        reward: { potentialAmount: 300, amount: 0, eligible: true, status: 'FAILED' },
      },
    ]);

    expect(fixture.nativeElement.textContent).toContain('No elegible');
    expect(fixture.nativeElement.textContent).toContain('Wallet Phantom no vinculada');
    expect(fixture.nativeElement.textContent).toContain('Pago fallido');
  });

  it('filters items by victories', async () => {
    const fixture = await setup([
      {
        matchId: 'm1',
        playedAt: '2026-07-09T12:00:00.000Z',
        placement: 1,
        playerCount: 3,
        kills: 2,
        damageDealt: 120,
        winner: true,
        reward: { potentialAmount: 700, amount: 700, eligible: true, status: 'SENT' },
      },
      {
        matchId: 'm2',
        playedAt: '2026-07-09T13:00:00.000Z',
        placement: 2,
        playerCount: 3,
        kills: 1,
        damageDealt: 50,
        winner: false,
        reward: { potentialAmount: 300, amount: 0, eligible: true, status: 'FAILED' },
      },
    ]);

    const component: MyMatchesComponent = fixture.componentInstance;
    component.setFilter('victories');
    fixture.detectChanges();

    expect(component.filteredItems().length).toBe(1);
    expect(component.filteredItems()[0].matchId).toBe('m1');
  });

  it('shows filtered empty state when no item matches the active filter', async () => {
    const fixture = await setup([
      {
        matchId: 'm1',
        playedAt: '2026-07-09T12:00:00.000Z',
        placement: 2,
        playerCount: 3,
        kills: 1,
        damageDealt: 50,
        winner: false,
        reward: { potentialAmount: 300, amount: 0, eligible: true, status: 'FAILED' },
      },
    ]);

    const component: MyMatchesComponent = fixture.componentInstance;
    component.setFilter('victories');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Sin resultados');
  });

  it('shows private matches without reward-disabled messaging and filters by room type', async () => {
    const fixture = await setup([{
      matchId: 'private-match',
      roomId: 'private-room',
      roomName: 'Squad Room',
      roomType: 'PRIVATE',
      rewardsEligible: false,
      playedAt: '2026-07-09T12:00:00.000Z',
      placement: 1,
      playerCount: 2,
      kills: 3,
      damageDealt: 250,
      winner: true,
      reward: null,
    }]);

    expect(fixture.nativeElement.textContent).toContain('Squad Room');
    expect(fixture.nativeElement.textContent).toContain('PRIVADA');
    expect(fixture.nativeElement.textContent).not.toContain('Sin premio');

    fixture.componentInstance.setFilter('private');
    fixture.detectChanges();
    expect(fixture.componentInstance.filteredItems()).toHaveLength(1);

    fixture.componentInstance.setFilter('public');
    fixture.detectChanges();
    expect(fixture.componentInstance.filteredItems()).toHaveLength(0);
  });
});

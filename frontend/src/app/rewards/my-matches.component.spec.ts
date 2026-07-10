import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { RewardsService } from './rewards.service';
import { MyMatchesComponent } from './my-matches.component';

describe('MyMatchesComponent', () => {
  const setup = async (items: unknown[]) => {
    await TestBed.configureTestingModule({
      imports: [MyMatchesComponent],
      providers: [
        provideRouter([]),
        { provide: RewardsService, useValue: { getMyMatches: () => of({ items }) } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(MyMatchesComponent);
    fixture.detectChanges();
    return fixture;
  };

  it('shows empty state', async () => {
    const fixture = await setup([]);

    expect(fixture.nativeElement.textContent).toContain('Todavía no tienes partidas');
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
});

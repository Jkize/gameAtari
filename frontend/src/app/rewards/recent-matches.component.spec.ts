import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { RecentMatchesComponent } from './recent-matches.component';
import { RewardsService } from './rewards.service';

describe('RecentMatchesComponent', () => {
  it('shows public recent matches', async () => {
    await TestBed.configureTestingModule({
      imports: [RecentMatchesComponent],
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

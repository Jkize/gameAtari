import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import { AuthService } from '@core/auth/auth.service';
import { PlayerRankingCardComponent } from '@features/rewards/player-ranking-card/player-ranking-card.component';
import { PlayerRankingTableComponent } from '@features/rewards/player-ranking-table/player-ranking-table.component';
import { PublicMatchDetail } from '@features/rewards/rewards.models';
import { RewardsService } from '@features/rewards/rewards.service';
import { MatchDetailComponent } from './match-detail.component';

const detail = (rewardsEligible: boolean): PublicMatchDetail => ({
  matchId: 'match-1',
  roomId: 'room-1',
  roomName: 'Squad Room',
  roomType: rewardsEligible ? 'PUBLIC' : 'PRIVATE',
  rewardsEligible,
  playedAt: '2026-07-23T12:00:00.000Z',
  mapName: 'Arena',
  playerCount: 1,
  players: [{
    userId: 'user-1',
    username: 'Alpha',
    placement: 1,
    kills: 3,
    deaths: 0,
    damageDealt: 900,
    damageTaken: 100,
    winner: true,
    reward: rewardsEligible ? {
      placement: 1,
      potentialAmount: 700,
      amount: 700,
      eligible: true,
      status: 'SENT',
      solscanUrl: 'https://solscan.io/tx/abc',
    } : null,
  }],
});

describe('MatchDetailComponent reward presentation', () => {
  const configure = async (match: PublicMatchDetail) => {
    await TestBed.configureTestingModule({
      imports: [
        MatchDetailComponent,
        TranslocoTestingModule.forRoot({
          langs: { en: {} },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ matchId: match.matchId }) } },
        },
        { provide: RewardsService, useValue: { getMatchDetail: () => of(match) } },
        { provide: AuthService, useValue: { user: () => ({ id: 'user-1' }) } },
      ],
    }).compileComponents();
  };

  it('propagates rewardsEligible=false to every ranking presentation', async () => {
    await configure(detail(false));
    const fixture = TestBed.createComponent(MatchDetailComponent);
    fixture.detectChanges();

    const table = fixture.debugElement.query(By.directive(PlayerRankingTableComponent))
      .componentInstance as PlayerRankingTableComponent;
    const card = fixture.debugElement.query(By.directive(PlayerRankingCardComponent))
      .componentInstance as PlayerRankingCardComponent;

    expect(table.showRewards).toBe(false);
    expect(card.showRewards).toBe(false);
    expect(fixture.nativeElement.querySelector('app-reward-status-badge')).toBeNull();
  });

  it('propagates rewardsEligible=true to every ranking presentation', async () => {
    await configure(detail(true));
    const fixture = TestBed.createComponent(MatchDetailComponent);
    fixture.detectChanges();

    const table = fixture.debugElement.query(By.directive(PlayerRankingTableComponent))
      .componentInstance as PlayerRankingTableComponent;
    const card = fixture.debugElement.query(By.directive(PlayerRankingCardComponent))
      .componentInstance as PlayerRankingCardComponent;

    expect(table.showRewards).toBe(true);
    expect(card.showRewards).toBe(true);
    expect(fixture.nativeElement.querySelector('app-reward-status-badge')).not.toBeNull();
  });
});

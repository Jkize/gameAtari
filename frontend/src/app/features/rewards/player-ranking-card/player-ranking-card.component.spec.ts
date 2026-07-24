import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { PublicMatchDetailPlayer } from '../rewards.models';
import { PlayerRankingCardComponent } from './player-ranking-card.component';

const player: PublicMatchDetailPlayer = {
  userId: 'user-1',
  username: 'Alpha',
  placement: 1,
  kills: 3,
  deaths: 0,
  damageDealt: 900,
  damageTaken: 100,
  winner: true,
  reward: {
    placement: 1,
    potentialAmount: 700,
    amount: 700,
    eligible: true,
    status: 'SENT',
    solscanUrl: 'https://solscan.io/tx/abc',
  },
};

describe('PlayerRankingCardComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        PlayerRankingCardComponent,
        TranslocoTestingModule.forRoot({
          langs: { en: {} },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
    }).compileComponents();
  });

  it('omits the reward footer when rewards are hidden', () => {
    const fixture = TestBed.createComponent(PlayerRankingCardComponent);
    fixture.componentRef.setInput('player', player);
    fixture.componentRef.setInput('showRewards', false);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.card-footer')).toBeNull();
    expect(element.querySelector('app-reward-status-badge')).toBeNull();
    expect(element.querySelector('app-solscan-link')).toBeNull();
  });

  it('renders the reward footer when rewards are shown', () => {
    const fixture = TestBed.createComponent(PlayerRankingCardComponent);
    fixture.componentRef.setInput('player', player);
    fixture.componentRef.setInput('showRewards', true);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.card-footer')).not.toBeNull();
    expect(element.querySelector('app-reward-status-badge')).not.toBeNull();
    expect(element.querySelector('app-solscan-link')).not.toBeNull();
  });
});

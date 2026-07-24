import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { PublicMatchDetailPlayer } from '../rewards.models';
import { PlayerRankingTableComponent } from './player-ranking-table.component';

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

describe('PlayerRankingTableComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        PlayerRankingTableComponent,
        TranslocoTestingModule.forRoot({
          langs: { en: {} },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
    }).compileComponents();
  });

  it('omits all reward columns and controls when rewards are hidden', () => {
    const fixture = TestBed.createComponent(PlayerRankingTableComponent);
    fixture.componentRef.setInput('players', [player]);
    fixture.componentRef.setInput('showRewards', false);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('th')).toHaveLength(5);
    expect(element.querySelector('app-reward-status-badge')).toBeNull();
    expect(element.querySelector('app-solscan-link')).toBeNull();
    expect(element.textContent).not.toContain('700');
  });

  it('renders reward columns and controls when rewards are shown', () => {
    const fixture = TestBed.createComponent(PlayerRankingTableComponent);
    fixture.componentRef.setInput('players', [player]);
    fixture.componentRef.setInput('showRewards', true);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('th')).toHaveLength(8);
    expect(element.querySelector('app-reward-status-badge')).not.toBeNull();
    expect(element.querySelector('app-solscan-link')).not.toBeNull();
  });
});

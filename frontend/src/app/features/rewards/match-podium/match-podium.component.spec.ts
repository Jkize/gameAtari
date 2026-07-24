import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { PublicRewardPlayer } from '../rewards.models';
import { MatchPodiumComponent } from './match-podium.component';

const podium: PublicRewardPlayer[] = [{
  userId: 'user-1',
  username: 'Alpha',
  placement: 1,
  reward: {
    placement: 1,
    potentialAmount: 700,
    amount: 700,
    eligible: true,
    status: 'SENT',
    solscanUrl: 'https://solscan.io/tx/abc',
  },
}];

describe('MatchPodiumComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        MatchPodiumComponent,
        TranslocoTestingModule.forRoot({
          langs: { en: {} },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
    }).compileComponents();
  });

  it('shows gameplay placement without reward UI when rewards are hidden', () => {
    const fixture = TestBed.createComponent(MatchPodiumComponent);
    fixture.componentRef.setInput('podium', podium);
    fixture.componentRef.setInput('showRewards', false);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Alpha');
    expect(element.querySelector('.tokens')).toBeNull();
    expect(element.querySelector('app-reward-status-badge')).toBeNull();
    expect(element.querySelector('app-solscan-link')).toBeNull();
  });

  it('renders reward UI when rewards are shown', () => {
    const fixture = TestBed.createComponent(MatchPodiumComponent);
    fixture.componentRef.setInput('podium', podium);
    fixture.componentRef.setInput('showRewards', true);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.tokens')).not.toBeNull();
    expect(element.querySelector('app-reward-status-badge')).not.toBeNull();
    expect(element.querySelector('app-solscan-link')).not.toBeNull();
  });
});

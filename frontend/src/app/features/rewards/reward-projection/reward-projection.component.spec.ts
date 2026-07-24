import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import { RewardsConfig } from '../rewards.models';
import { RewardsService } from '../rewards.service';
import { RewardProjectionComponent } from './reward-projection.component';

const config: RewardsConfig = {
  enabled: true,
  phase: 1,
  minimumPlayers: 4,
  maximumPlayers: 16,
  tiers: [
    { minimumPlayers: 4, maximumPlayers: 4 },
    { minimumPlayers: 5, maximumPlayers: 8 },
    { minimumPlayers: 9, maximumPlayers: 16 },
  ],
  schedule: [
    { playerCount: 4, prizes: [{ placement: 1, amount: 400 }] },
    {
      playerCount: 5,
      prizes: [
        { placement: 1, amount: 475 },
        { placement: 2, amount: 50 },
      ],
    },
    {
      playerCount: 8,
      prizes: [
        { placement: 1, amount: 700 },
        { placement: 2, amount: 200 },
      ],
    },
    {
      playerCount: 9,
      prizes: [
        { placement: 1, amount: 750 },
        { placement: 2, amount: 235 },
        { placement: 3, amount: 75 },
      ],
    },
    {
      playerCount: 16,
      prizes: [
        { placement: 1, amount: 1100 },
        { placement: 2, amount: 480 },
        { placement: 3, amount: 250 },
      ],
    },
  ],
};

const en = {
  'rewards.common.tokensAmount': '{{amount}} tokens',
  'rewards.projection.eyebrow': 'REWARD POOL',
  'rewards.projection.title': "This match's prizes",
  'rewards.projection.compactLabel': 'Rewards',
  'rewards.projection.compactPrize': '#1 {{amount}}',
  'rewards.projection.viewRewards': 'View rewards',
  'rewards.projection.helpAction': 'How prizes are calculated',
  'rewards.projection.closeAction': 'Close reward information',
  'rewards.projection.playersNeeded': '{{count}} more players are needed. Minimum {{minimum}}.',
  'rewards.projection.currentPlayers': 'Current projection for {{count}} players',
  'rewards.projection.currentPrizes': 'Projected prizes',
  'rewards.projection.nextPlayer': 'The pool grows again at {{count}} players.',
  'rewards.projection.helpIntro': 'Every additional player increases the pool.',
  'rewards.projection.tiersLabel': 'Reward tiers',
  'rewards.projection.prizesColumnTitle': 'Prizes by player count',
  'rewards.projection.eligibilityColumnTitle': 'Eligibility',
  'rewards.projection.eligibilityIntro': 'Your current requirements.',
  'rewards.projection.walletRequirement': 'Verified wallet required',
  'rewards.projection.balanceRequirement': 'Balance verification required',
  'rewards.projection.ruleSignedIn': 'Play while signed in.',
  'rewards.projection.ruleBalance': 'Keep at least {{amount}} tokens.',
  'rewards.projection.ruleDailyLimit': 'Daily availability is required.',
  'rewards.eligibility.walletVerified': 'Wallet verified',
  'rewards.eligibility.walletNotVerified': 'Wallet not verified',
  'rewards.eligibility.balanceSufficient': 'Sufficient balance',
  'rewards.eligibility.balanceInsufficient': 'Insufficient balance',
  'rewards.projection.singlePlayerTier': '{{count}} players',
  'rewards.projection.playerRange': '{{minimum}}–{{maximum}} players',
  'rewards.projection.helpNote': 'Amounts lock when the round starts.',
};

describe('RewardProjectionComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        RewardProjectionComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [
        {
          provide: RewardsService,
          useValue: {
            getConfig: () => of(config),
            getWalletStatus: () => of({
              currentProvider: 'GOOGLE',
              phantom: { linked: true, verified: true },
              google: { linked: true },
              holder: { status: 'eligible', requiredTokens: 10000, message: 'ok' },
            }),
          },
        },
      ],
    }).compileComponents();
  });

  it('updates the projected podium when the room player count changes', () => {
    const fixture = TestBed.createComponent(RewardProjectionComponent);
    fixture.componentRef.setInput('playerCount', 5);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.projected-prizes')).toBeNull();
    (fixture.nativeElement.querySelector('.reward-trigger') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('475 tokens');
    expect(fixture.nativeElement.textContent).toContain('50 tokens');
    expect(fixture.nativeElement.querySelectorAll('.projected-prizes li')).toHaveLength(2);

    fixture.componentRef.setInput('playerCount', 9);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('750 tokens');
    expect(fixture.nativeElement.textContent).toContain('235 tokens');
    expect(fixture.nativeElement.textContent).toContain('75 tokens');
    expect(fixture.nativeElement.querySelectorAll('.projected-prizes li')).toHaveLength(3);
  });

  it('explains all proportional tiers from the backend schedule', () => {
    const fixture = TestBed.createComponent(RewardProjectionComponent);
    fixture.componentRef.setInput('playerCount', 4);
    fixture.detectChanges();

    const trigger = fixture.nativeElement.querySelector('.reward-trigger') as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('4 players');
    expect(text).toContain('5–8 players');
    expect(text).toContain('9–16 players');
    expect(text).toContain('1100');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(fixture.nativeElement.querySelector('.reward-modal__body')).toBeTruthy();
    expect(fixture.nativeElement.querySelectorAll('.reward-modal__columns > section')).toHaveLength(2);
  });

  it('shows the current eligibility in the second modal column', () => {
    const fixture = TestBed.createComponent(RewardProjectionComponent);
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.reward-trigger') as HTMLButtonElement).click();
    fixture.detectChanges();

    const eligibility = fixture.nativeElement.querySelector('.eligibility-column') as HTMLElement;
    expect(eligibility.textContent).toContain('Wallet verified');
    expect(eligibility.textContent).toContain('Sufficient balance');
  });

  it('closes the reward modal with Escape', () => {
    const fixture = TestBed.createComponent(RewardProjectionComponent);
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.reward-trigger') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.reward-modal')).toBeTruthy();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.reward-modal')).toBeNull();
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Subject, of } from 'rxjs';
import { vi } from 'vitest';
import { AuthService } from '../auth/auth.service';
import { RewardsService } from './rewards.service';
import { RewardEligibilityNoticeComponent } from './reward-eligibility-notice.component';
import { WalletStatus } from './rewards.models';

const es = {
  'rewards.common.ordinalSuffix': '.º',
  'rewards.common.tokensAmount': '{{amount}} tokens',
  'rewards.eligibility.eyebrow': 'REWARDS',
  'rewards.eligibility.title': 'Premios en tokens',
  'rewards.eligibility.description': 'Todos pueden jugar. Para recibir premios debes iniciar sesión y vincular tu wallet Phantom.',
  'rewards.eligibility.hint': 'La elegibilidad se valida al finalizar la partida.',
  'rewards.eligibility.prizesAriaLabel': 'Premios disponibles',
  'rewards.eligibility.login': 'Iniciar sesión',
  'rewards.eligibility.configureAccount': 'Configura tu cuenta',
  'rewards.eligibility.checking': 'Verificando elegibilidad…',
  'rewards.eligibility.verificationFailedTitle': 'No pudimos verificar tu saldo',
  'rewards.eligibility.verificationFailedHint': 'Tu elegibilidad se revisará nuevamente al finalizar.',
  'rewards.eligibility.retry': 'Reintentar',
  'rewards.eligibility.insufficientTitle': 'Saldo insuficiente',
  'rewards.eligibility.insufficientHint': 'Necesitas mantener al menos 10.000 tokens.',
  'rewards.eligibility.notLinkedTitle': 'Wallet no vinculada',
  'rewards.eligibility.notLinkedHint': 'Vincula una wallet para poder recibir premios.',
  'rewards.eligibility.configureWallet': 'Configurar wallet',
  'rewards.eligibility.eligibleTitle': 'Elegible para recompensas',
  'rewards.eligibility.eligibleHint': 'Wallet conectada · Saldo suficiente',
  'rewards.eligibility.walletVerified': 'Elegible para recompensas',
  'rewards.eligibility.balanceSufficient': 'Saldo suficiente',
  'rewards.eligibility.linkPhantomError': 'No se pudo vincular Phantom',
  'rewards.eligibility.linkPhantom': 'Vincular Phantom',
};

describe('RewardEligibilityNoticeComponent', () => {
  const walletStatus: WalletStatus = {
    currentProvider: 'GOOGLE' as const,
    phantom: { linked: false, verified: false },
    google: { linked: true },
    holder: {
      status: 'unknown' as const,
      requiredTokens: 10000,
      message: 'Vincula y verifica Phantom para consultar tus tokens.',
    },
  };

  const setup = async (
    user: unknown,
    wallet: WalletStatus | Subject<WalletStatus> = walletStatus,
    currentProvider: 'GOOGLE' | 'PHANTOM' | null = 'GOOGLE',
  ) => {
    const auth = {
      user: () => user,
      currentProvider: () => currentProvider,
      linkPhantom: vi.fn().mockResolvedValue({
        ...walletStatus,
        phantom: { linked: true, verified: true },
        holder: { status: 'eligible', requiredTokens: 10000, message: 'Tienes 10.000+ tokens ahora.' },
      }),
    };
    const rewards = {
      getConfig: vi.fn().mockReturnValue(of({
        prizes: [
          { placement: 1, amount: 1000 },
          { placement: 2, amount: 400 },
          { placement: 3, amount: 250 },
        ],
      })),
      getWalletStatus: vi.fn().mockReturnValue(wallet instanceof Subject ? wallet.asObservable() : of(wallet)),
    };
    await TestBed.configureTestingModule({
      imports: [
        RewardEligibilityNoticeComponent,
        TranslocoTestingModule.forRoot({
          langs: { es },
          translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        }),
      ],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        { provide: RewardsService, useValue: rewards },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(RewardEligibilityNoticeComponent);
    fixture.detectChanges();
    return { fixture, auth, rewards };
  };

  it('shows login action for guest users', async () => {
    const { fixture } = await setup(null);

    expect(fixture.nativeElement.textContent).toContain('Premios en tokens');
    expect(fixture.nativeElement.textContent).toContain('1000 tokens');
    expect(fixture.nativeElement.textContent).toContain('400 tokens');
    expect(fixture.nativeElement.textContent).toContain('250 tokens');
    expect(fixture.nativeElement.textContent).toContain('Iniciar');
  });

  it('shows a loading state while wallet status has not resolved yet', async () => {
    const subject = new Subject<WalletStatus>();
    const { fixture } = await setup({ id: 'u1', username: 'Pilot' }, subject);

    expect(fixture.nativeElement.textContent).toContain('Verificando elegibilidad');
    expect(fixture.nativeElement.textContent).not.toContain('Vincular Phantom');

    subject.next({
      ...walletStatus,
      phantom: { linked: true, verified: true },
      holder: { status: 'eligible' as const, requiredTokens: 10000, message: 'ok' },
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Elegible para recompensas');
  });

  it('shows wallet-not-linked action for Google users without wallet', async () => {
    const { fixture } = await setup({ id: 'u1', username: 'Pilot' });

    expect(fixture.nativeElement.textContent).toContain('Wallet no vinculada');
    expect(fixture.nativeElement.textContent).toContain('Configurar wallet');
  });

  it('does not show wallet-not-linked action for Phantom sessions', async () => {
    const { fixture } = await setup(
      { id: 'u1', username: 'Pilot' },
      { ...walletStatus, currentProvider: 'PHANTOM', google: { linked: false } },
      'PHANTOM',
    );

    expect(fixture.nativeElement.textContent).not.toContain('Wallet no vinculada');
    expect(fixture.nativeElement.textContent).toContain('Configura tu cuenta');
  });

  it('shows eligible state for users with verified Phantom and enough tokens', async () => {
    const { fixture } = await setup({ id: 'u1', username: 'Pilot' }, {
      ...walletStatus,
      phantom: { linked: true, verified: true },
      holder: { status: 'eligible' as const, requiredTokens: 10000, message: 'Tienes 10.000+ tokens ahora.' },
    });

    expect(fixture.nativeElement.textContent).toContain('Elegible para recompensas');
  });

  it('shows insufficient-balance state without exposing the token threshold as the only mention', async () => {
    const { fixture } = await setup({ id: 'u1', username: 'Pilot' }, {
      ...walletStatus,
      phantom: { linked: true, verified: true },
      holder: { status: 'insufficient' as const, requiredTokens: 10000, message: 'Ahora tienes menos de 10.000 tokens.' },
    });

    expect(fixture.nativeElement.textContent).toContain('Saldo insuficiente');
  });

  it('shows verification-failed state with a retry action for unavailable holder status', async () => {
    const { fixture, rewards } = await setup({ id: 'u1', username: 'Pilot' }, {
      ...walletStatus,
      phantom: { linked: true, verified: true },
      holder: {
        status: 'unavailable' as const,
        requiredTokens: 10000,
        message: 'No pudimos consultar tu saldo ahora.',
      },
    });

    expect(fixture.nativeElement.textContent).toContain('No pudimos verificar tu saldo');
    expect(fixture.nativeElement.textContent).not.toContain('Saldo insuficiente');

    const retryButton: HTMLButtonElement = fixture.nativeElement.querySelector('button.action');
    retryButton.click();

    expect(rewards.getWalletStatus).toHaveBeenCalledTimes(2);
  });
});

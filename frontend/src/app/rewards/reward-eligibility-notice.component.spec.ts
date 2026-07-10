import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { AuthService } from '../auth/auth.service';
import { RewardsService } from './rewards.service';
import { RewardEligibilityNoticeComponent } from './reward-eligibility-notice.component';
import { WalletStatus } from './rewards.models';

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
    wallet = walletStatus,
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
      getWalletStatus: vi.fn().mockReturnValue(of(wallet)),
    };
    await TestBed.configureTestingModule({
      imports: [RewardEligibilityNoticeComponent],
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
    expect(fixture.nativeElement.textContent).toContain('Iniciar');
  });

  it('shows Phantom action for Google users without wallet', async () => {
    const { fixture } = await setup({ id: 'u1', username: 'Pilot' });

    expect(fixture.nativeElement.textContent).toContain('Vincular Phantom');
  });

  it('does not show Phantom action for Phantom sessions', async () => {
    const { fixture } = await setup(
      { id: 'u1', username: 'Pilot' },
      { ...walletStatus, currentProvider: 'PHANTOM', google: { linked: false } },
      'PHANTOM',
    );

    expect(fixture.nativeElement.textContent).not.toContain('Vincular Phantom');
    expect(fixture.nativeElement.textContent).toContain('Configura tu cuenta');
  });

  it('shows verified state for users with verified Phantom', async () => {
    const { fixture } = await setup({ id: 'u1', username: 'Pilot' }, {
      ...walletStatus,
      phantom: { linked: true, verified: true },
      holder: { status: 'eligible' as const, requiredTokens: 10000, message: 'Tienes 10.000+ tokens ahora.' },
    });

    expect(fixture.nativeElement.textContent).toContain('Wallet verificada');
    expect(fixture.nativeElement.textContent).toContain('Tienes 10.000+ tokens ahora.');
  });

  it('shows unavailable holder status without calling it insufficient', async () => {
    const { fixture } = await setup({ id: 'u1', username: 'Pilot' }, {
      ...walletStatus,
      phantom: { linked: true, verified: true },
      holder: {
        status: 'unavailable' as const,
        requiredTokens: 10000,
        message: 'No pudimos consultar tu saldo ahora.',
      },
    });

    expect(fixture.nativeElement.textContent).toContain('No pudimos consultar tu saldo ahora.');
    expect(fixture.nativeElement.textContent).not.toContain('menos de 10.000');
  });
});

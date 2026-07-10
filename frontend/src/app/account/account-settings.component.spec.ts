import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { AuthService } from '../auth/auth.service';
import { RewardsService } from '../rewards/rewards.service';
import { AccountSettingsComponent } from './account-settings.component';

const es = {
  'account.eyebrow': 'ACCOUNT',
  'account.title': 'Cuenta',
  'account.closeAriaLabel': 'Cerrar',
  'account.linked': 'Vinculado',
  'account.notLinked': 'No vinculado',
  'account.walletNotLinked': 'No vinculada',
  'account.walletVerified': 'Wallet verificada {{address}}',
  'account.linkPhantom': 'Vincular Phantom',
  'account.loadError': 'No pudimos cargar tu cuenta.',
  'account.updateError': 'No se pudo actualizar la cuenta.',
};

describe('AccountSettingsComponent', () => {
  const status = {
    currentProvider: 'GOOGLE' as const,
    phantom: { linked: false, verified: false },
    google: { linked: true },
    holder: {
      status: 'unknown' as const,
      requiredTokens: 10000,
      message: 'Vincula y verifica Phantom para consultar tus tokens.',
    },
  };

  const setup = async () => {
    const auth = {
      linkPhantom: vi.fn().mockResolvedValue({
        ...status,
        phantom: { linked: true, verified: true, addressPreview: 'Wall...1111' },
        holder: { status: 'eligible', requiredTokens: 10000, message: 'Tienes 10.000+ tokens ahora.' },
      }),
      linkGoogle: vi.fn(),
    };
    const rewards = {
      getWalletStatus: vi.fn().mockReturnValue(of(status)),
    };
    await TestBed.configureTestingModule({
      imports: [
        AccountSettingsComponent,
        TranslocoTestingModule.forRoot({
          langs: { es },
          translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        }),
      ],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: RewardsService, useValue: rewards },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(AccountSettingsComponent);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    return { fixture, auth };
  };

  it('shows linked methods and links Phantom without login', async () => {
    const { fixture, auth } = await setup();

    expect(fixture.nativeElement.textContent).toContain('Google');
    expect(fixture.nativeElement.textContent).toContain('Vinculado');
    expect(fixture.nativeElement.textContent).toContain('Vincular Phantom');

    fixture.nativeElement.querySelector('.action').click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(auth.linkPhantom).toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Wallet verificada');
  });
});

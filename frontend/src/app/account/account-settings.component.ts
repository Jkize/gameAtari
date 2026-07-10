import {
  AfterViewChecked,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
  signal,
} from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { WalletStatus } from '../rewards/rewards.models';
import { RewardsService } from '../rewards/rewards.service';
import { environment } from '../../environments/environment';

type GoogleCredentialResponse = { credential: string };
type GoogleIdentityApi = {
  accounts: {
    id: {
      initialize(options: { client_id: string; callback: (result: GoogleCredentialResponse) => void }): void;
      renderButton(element: HTMLElement, options: Record<string, unknown>): void;
    };
  };
};

@Component({
  selector: 'app-account-settings',
  standalone: true,
  template: `
    @if (open) {
      <div class="backdrop" role="presentation" (click)="close()"></div>
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="account-title">
        <header>
          <div>
            <p class="eyebrow">ACCOUNT</p>
            <h2 id="account-title">Cuenta</h2>
          </div>
          <button class="icon" type="button" aria-label="Cerrar" (click)="close()">X</button>
        </header>

        @if (loading()) {
          <div class="skeleton"></div>
          <div class="skeleton short"></div>
        } @else {
          <div class="method">
            <div>
              <strong>Google</strong>
              <span>{{ status()?.google?.linked ? 'Vinculado' : 'No vinculado' }}</span>
            </div>
            @if (!status()?.google?.linked) {
              <div #googleButton class="google-button"></div>
            }
          </div>

          <div class="method">
            <div>
              <strong>Phantom</strong>
              <span>
                @if (status()?.phantom?.verified) {
                  Wallet verificada {{ status()?.phantom?.addressPreview }}
                } @else {
                  No vinculada
                }
              </span>
            </div>
            @if (!status()?.phantom?.verified) {
              <button class="action" type="button" (click)="linkPhantom()" [disabled]="busy()">Vincular Phantom</button>
            }
          </div>

          <p class="holder" [class.ok]="status()?.holder?.status === 'eligible'"
            [class.warn]="status()?.holder?.status === 'insufficient'">
            {{ status()?.holder?.message }}
          </p>
        }

        @if (error()) { <p class="error">{{ error() }}</p> }
      </section>
    }
  `,
  styles: [`
    .backdrop { position: fixed; inset: 0; z-index: 30; background: rgba(0, 0, 0, .62); }
    .modal {
      position: fixed;
      z-index: 31;
      top: 50%;
      left: 50%;
      width: min(440px, calc(100% - 32px));
      transform: translate(-50%, -50%);
      padding: 22px;
      color: #edf4dc;
      border: 1px solid #71825c;
      background: #1c281a;
      box-shadow: 0 24px 80px #000b;
    }
    header { display: flex; justify-content: space-between; gap: 16px; align-items: start; margin-bottom: 18px; }
    .eyebrow { margin: 0 0 4px; color: #d4ff5f; font-size: .72rem; letter-spacing: .18em; }
    h2 { margin: 0; font-size: 1.5rem; }
    button { min-height: 38px; padding: 9px 13px; border: 1px solid #71825c; color: #edf4dc; background: #263223; cursor: pointer; font: inherit; }
    .icon { width: 38px; padding: 0; }
    .action { color: #10150e; background: #d4ff5f; border-color: #d4ff5f; font-weight: 800; }
    button:disabled { opacity: .55; cursor: wait; }
    .method {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: center;
      padding: 14px 0;
      border-top: 1px solid rgba(113, 130, 92, .65);
    }
    .method strong, .method span { display: block; }
    .method span { margin-top: 4px; color: #aeb8a6; font-size: .86rem; }
    .google-button { min-width: 180px; min-height: 40px; }
    .holder { margin: 12px 0 0; color: #aeb8a6; font-size: .86rem; line-height: 1.35; }
    .holder.ok { color: #d4ff5f; }
    .holder.warn { color: #ffcf66; }
    .error { margin: 12px 0 0; color: #ff8a80; font-size: .86rem; }
    .skeleton {
      height: 54px;
      margin-bottom: 12px;
      background: linear-gradient(90deg, rgba(113,130,92,.25), rgba(212,255,95,.12), rgba(113,130,92,.25));
      background-size: 220% 100%;
      animation: pulse 1.2s linear infinite;
    }
    .skeleton.short { width: 65%; }
    @keyframes pulse { to { background-position: -220% 0; } }
    @media (max-width: 520px) {
      .method { align-items: stretch; flex-direction: column; }
    }
  `],
})
export class AccountSettingsComponent implements OnChanges, AfterViewChecked {
  @Input() open = false;
  @Output() closed = new EventEmitter<void>();
  @Output() accountChanged = new EventEmitter<void>();
  @ViewChild('googleButton') googleButton?: ElementRef<HTMLDivElement>;

  readonly status = signal<WalletStatus | null>(null);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  private googleRenderedForOpen = false;

  constructor(
    private readonly auth: AuthService,
    private readonly rewards: RewardsService,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open'] && this.open) {
      this.googleRenderedForOpen = false;
      this.loadStatus();
    }
  }

  ngAfterViewChecked(): void {
    if (!this.open || this.googleRenderedForOpen || this.status()?.google?.linked || !this.googleButton) return;
    this.googleRenderedForOpen = true;
    this.renderGoogleButton();
  }

  close(): void {
    this.closed.emit();
  }

  async linkPhantom(): Promise<void> {
    await this.run(async () => {
      this.status.set(await this.auth.linkPhantom());
      this.accountChanged.emit();
    });
  }

  private loadStatus(): void {
    this.loading.set(true);
    this.error.set('');
    this.rewards.getWalletStatus().subscribe({
      next: status => {
        this.status.set(status);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No pudimos cargar tu cuenta.');
        this.loading.set(false);
      },
    });
  }

  private renderGoogleButton(): void {
    const render = () => {
      const google = (window as Window & { google?: GoogleIdentityApi }).google;
      if (!google || !this.googleButton) return;
      google.accounts.id.initialize({
        client_id: environment.googleClientId,
        callback: result => void this.run(async () => {
          this.status.set(await this.auth.linkGoogle(result.credential));
          this.accountChanged.emit();
        }),
      });
      google.accounts.id.renderButton(this.googleButton.nativeElement, {
        theme: 'filled_black',
        size: 'medium',
        width: 180,
      });
    };
    if ((window as Window & { google?: GoogleIdentityApi }).google) return render();
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = render;
    document.head.appendChild(script);
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await action();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo actualizar la cuenta.');
    } finally {
      this.busy.set(false);
    }
  }
}

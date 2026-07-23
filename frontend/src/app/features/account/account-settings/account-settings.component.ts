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
  inject,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthService } from '@core/auth/auth.service';
import { WalletStatus } from '@features/rewards/rewards.models';
import { RewardsService } from '@features/rewards/rewards.service';
import { environment } from '@env/environment';

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
  imports: [TranslocoPipe],
  templateUrl: './account-settings.component.html',
  styleUrl: './account-settings.component.css',
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

  private readonly transloco = inject(TranslocoService);

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
        this.error.set(this.transloco.translate('account.loadError'));
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
        type: 'icon',
        theme: 'filled_black',
        size: 'large',
        shape: 'square',
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
      this.error.set(this.accountErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  private accountErrorMessage(error: unknown): string {
    const key = error instanceof HttpErrorResponse && typeof error.error?.message === 'string'
      ? error.error.message
      : null;
    if (key?.startsWith('account.')) {
      const translated = this.transloco.translate(key);
      if (translated !== key) return translated;
    }
    return this.transloco.translate('account.updateError');
  }
}

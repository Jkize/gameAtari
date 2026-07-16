import { AfterViewInit, Component, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { environment } from '../../../environments/environment';
import { LanguageSwitcherComponent } from '../../shared/language-switcher.component';
import { PublicStatsComponent } from '../../stats/public-stats.component';
import { TokenCaComponent } from '../../shared/token-ca.component';
import { AuthService } from '../auth.service';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(options: {
            client_id: string;
            callback: (result: { credential: string }) => void;
          }): void;
          renderButton(element: HTMLElement, options: Record<string, unknown>): void;
        };
      };
    };
  }
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, PublicStatsComponent, TranslocoPipe, LanguageSwitcherComponent, TokenCaComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent implements AfterViewInit {
  @ViewChild('googleButton') googleButton?: ElementRef<HTMLDivElement>;
  readonly busy = signal(false);
  readonly error = signal('');
  username = '';

  private readonly transloco = inject(TranslocoService);

  constructor(
    readonly auth: AuthService,
    private readonly router: Router,
  ) {}

  ngAfterViewInit(): void {
    this.loadGoogle();
  }

  async loginPhantom(): Promise<void> {
    await this.run(async () => {
      const result = await this.auth.loginPhantom();
      if (!result.requiresUsername) await this.router.navigateByUrl(this.auth.authenticatedHomeUrl());
    });
  }

  async completeProfile(): Promise<void> {
    await this.run(async () => {
      await this.auth.completeProfile(this.username);
      await this.router.navigateByUrl(this.auth.authenticatedHomeUrl());
    });
  }

  private loadGoogle(): void {
    const render = () => {
      if (!window.google || !this.googleButton) return;
      window.google.accounts.id.initialize({
        client_id: environment.googleClientId,
        callback: (result) =>
          void this.run(async () => {
            const response = await this.auth.loginGoogle(result.credential);
            if (!response.requiresUsername) {
              await this.router.navigateByUrl(this.auth.authenticatedHomeUrl());
            }
          }),
      });
      window.google.accounts.id.renderButton(this.googleButton.nativeElement, {
        theme: 'outline',
        size: 'large',
        width: Math.min(360, this.googleButton.nativeElement.clientWidth),
      });
    };
    if (window.google) return render();
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
      this.error.set(this.authErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  private authErrorMessage(error: unknown): string {
    const responseMessage = error instanceof HttpErrorResponse ? error.error?.message : null;
    const key = typeof responseMessage === 'string'
      ? responseMessage
      : Array.isArray(responseMessage) && typeof responseMessage[0] === 'string'
        ? responseMessage[0]
        : null;
    if (key?.startsWith('auth.')) {
      const translated = this.transloco.translate(key);
      if (translated !== key) return translated;
    }
    return this.transloco.translate('auth.errorFallback');
  }
}

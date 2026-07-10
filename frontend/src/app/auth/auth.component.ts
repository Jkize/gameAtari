import { AfterViewInit, Component, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { environment } from '../../environments/environment';
import { LanguageSwitcherComponent } from '../shared/language-switcher.component';
import { PublicStatsComponent } from '../stats/public-stats.component';
import { AuthService } from './auth.service';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(options: { client_id: string; callback: (result: { credential: string }) => void }): void;
          renderButton(element: HTMLElement, options: Record<string, unknown>): void;
        };
      };
    };
  }
}

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [FormsModule, PublicStatsComponent, TranslocoPipe, LanguageSwitcherComponent],
  template: `
    <main class="auth-shell">
      <section class="panel">
        <div class="panel-top">
          <div class="brand">
            <i class="ti ti-tank" aria-hidden="true"></i>
            <span class="wordmark">Tank Arena</span>
          </div>
          <app-lang-switcher></app-lang-switcher>
        </div>
        <h1>{{ 'auth.heading' | transloco }}</h1>
        <p class="copy">{{ 'auth.description' | transloco }}</p>

        <app-public-stats></app-public-stats>

        @if (!auth.onboardingToken()) {
          <div class="methods">
            <div #googleButton class="google-button"></div>
            <button class="secondary" type="button" (click)="loginPhantom()" [disabled]="busy()">
              <i class="ti ti-wallet" aria-hidden="true"></i>
              {{ 'auth.connectPhantom' | transloco }}
            </button>
          </div>
        } @else {
          <form (ngSubmit)="completeProfile()">
            <label for="username">{{ 'auth.usernameLabel' | transloco }}</label>
            <input id="username" name="username" [(ngModel)]="username" minlength="3" maxlength="20"
              pattern="[A-Za-z0-9_]+" required autocomplete="username">
            <button class="primary" type="submit" [disabled]="busy()">{{ 'auth.createPilot' | transloco }}</button>
          </form>
        }

        @if (error()) {
          <p class="error">{{ error() }}</p>
        }
      </section>
    </main>
  `,
  styles: [`
    :host { display: block; min-height: 100vh; }
    .auth-shell {
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
      background: var(--color-bg-page);
    }
    .panel {
      width: min(440px, 100%);
      padding: 36px;
      border-radius: var(--radius-card);
      border: 0.5px solid var(--color-border);
      background: var(--color-bg-surface);
      box-shadow: 0 20px 60px rgba(44, 44, 42, .08);
    }
    [data-theme="dark"] .panel { box-shadow: 0 20px 60px rgba(0, 0, 0, .35); }

    .panel-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
    .brand { display: flex; align-items: center; gap: 6px; }
    .brand i { font-size: 18px; color: var(--color-accent); }
    .brand .wordmark { font-size: .95rem; font-weight: 500; color: var(--color-text-primary); }

    h1 { margin: 0 0 6px; font-size: 1.5rem; font-weight: 500; color: var(--color-text-primary); }
    .copy { margin: 0; color: var(--color-text-secondary); font-size: .9rem; line-height: 1.4; }

    .methods { display: grid; gap: 10px; margin-top: 8px; }
    .google-button { min-height: 44px; }

    button { font: inherit; cursor: pointer; }
    button:disabled { opacity: .55; cursor: wait; }

    button.secondary {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      min-height: 44px;
      padding: 10px 20px;
      border-radius: var(--radius-control);
      border: 1px solid var(--color-border-strong);
      background: transparent;
      color: var(--color-text-primary);
      font-weight: 500;
    }
    button.secondary i { font-size: 16px; }

    form { margin-top: 8px; }
    label { display: block; margin-bottom: 8px; color: var(--color-text-secondary); font-size: .85rem; font-weight: 500; }
    input {
      box-sizing: border-box;
      width: 100%;
      min-height: 44px;
      margin-bottom: 14px;
      padding: 0 14px;
      border-radius: var(--radius-control);
      border: 0.5px solid var(--color-border);
      background: var(--color-bg-inset);
      color: var(--color-text-primary);
      font: inherit;
    }
    input:focus { outline: none; border-color: var(--color-accent); }

    button.primary {
      width: 100%;
      min-height: 44px;
      padding: 10px 28px;
      border: none;
      border-radius: var(--radius-control);
      background: var(--color-accent);
      color: var(--color-accent-contrast);
      font-weight: 500;
    }
    button.primary:hover { background: var(--color-accent-hover); }

    .error { margin: 16px 0 0; color: var(--color-error); font-size: .82rem; }
  `],
})
export class AuthComponent implements AfterViewInit {
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
      if (!result.requiresUsername) await this.router.navigateByUrl('/lobby');
    });
  }

  async completeProfile(): Promise<void> {
    await this.run(async () => {
      await this.auth.completeProfile(this.username);
      await this.router.navigateByUrl('/lobby');
    });
  }

  private loadGoogle(): void {
    const render = () => {
      if (!window.google || !this.googleButton) return;
      window.google.accounts.id.initialize({
        client_id: environment.googleClientId,
        callback: result => void this.run(async () => {
          const response = await this.auth.loginGoogle(result.credential);
          if (!response.requiresUsername) await this.router.navigateByUrl('/lobby');
        }),
      });
      window.google.accounts.id.renderButton(this.googleButton.nativeElement, {
        theme: 'outline',
        size: 'large',
        width: 360,
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
      this.error.set(error instanceof Error ? error.message : this.transloco.translate('auth.errorFallback'));
    } finally {
      this.busy.set(false);
    }
  }
}

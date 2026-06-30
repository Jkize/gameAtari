import { AfterViewInit, Component, ElementRef, ViewChild, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';
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
  imports: [FormsModule, PublicStatsComponent],
  template: `
    <main class="auth-shell">
      <section class="panel">
        <p class="eyebrow">TANK ARENA</p>
        <h1>Entra a la arena</h1>
        <p class="copy">Autentícate para acceder al lobby y a las partidas públicas.</p>

        <app-public-stats></app-public-stats>

        @if (!auth.onboardingToken()) {
          <div #googleButton class="google-button"></div>
          <button class="phantom" type="button" (click)="loginPhantom()" [disabled]="busy()">
            Conectar Phantom
          </button>
        } @else {
          <form (ngSubmit)="completeProfile()">
            <label for="username">Elige tu username</label>
            <input id="username" name="username" [(ngModel)]="username" minlength="3" maxlength="20"
              pattern="[A-Za-z0-9_]+" required autocomplete="username">
            <button type="submit" [disabled]="busy()">Crear piloto</button>
          </form>
        }

        @if (error()) {
          <p class="error">{{ error() }}</p>
        }
      </section>
    </main>
  `,
  styles: [`
    :host { display: block; min-height: 100vh; color: #f7f0db; background: radial-gradient(circle at 50% 20%, #304735, #11170f 55%, #080a08); }
    .auth-shell { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
    .panel { width: min(440px, 100%); padding: 38px; border: 1px solid #71825c; background: rgba(20, 27, 19, .94); box-shadow: 0 24px 80px #0009; }
    .eyebrow { color: #d4ff5f; letter-spacing: .28em; font-weight: 800; }
    h1 { margin: 8px 0; font-size: clamp(2rem, 6vw, 3.3rem); }
    .copy { color: #b9c2ae; margin-bottom: 28px; }
    .google-button { min-height: 44px; margin-bottom: 12px; }
    button, input { width: 100%; min-height: 46px; border-radius: 4px; font: inherit; }
    button { border: 0; background: #d4ff5f; color: #11170f; font-weight: 800; cursor: pointer; }
    button.phantom { background: #ab9ff2; }
    button:disabled { opacity: .55; cursor: wait; }
    label { display: block; margin-bottom: 8px; }
    input { box-sizing: border-box; margin-bottom: 12px; padding: 0 12px; color: #fff; background: #0d120c; border: 1px solid #71825c; }
    .error { color: #ff8a80; margin-bottom: 0; }
  `],
})
export class AuthComponent implements AfterViewInit {
  @ViewChild('googleButton') googleButton?: ElementRef<HTMLDivElement>;
  readonly busy = signal(false);
  readonly error = signal('');
  username = '';

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
        theme: 'filled_black',
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
      this.error.set(error instanceof Error ? error.message : 'No fue posible autenticar');
    } finally {
      this.busy.set(false);
    }
  }
}

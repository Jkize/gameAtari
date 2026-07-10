import { Component, Input, OnChanges, OnInit, SimpleChanges, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { RewardsService } from './rewards.service';
import { WalletStatus } from './rewards.models';

@Component({
  selector: 'app-reward-eligibility-notice',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="notice" aria-labelledby="reward-notice-title">
      <div>
        <p class="eyebrow">REWARDS</p>
        <h2 id="reward-notice-title">Premios en tokens</h2>
        <p class="copy">
          Todos pueden jugar. Para recibir premios debes iniciar sesión, vincular y verificar Phantom,
          y tener al menos 10.000 tokens del juego cuando termine la partida.
        </p>
        <p class="hint">Este chequeo es informativo; la validación final se hace al terminar la partida.</p>
      </div>

      <ol class="prizes" aria-label="Premios disponibles">
        <li><strong>1.º</strong><span>700 tokens</span></li>
        <li><strong>2.º</strong><span>300 tokens</span></li>
        <li><strong>3.º</strong><span>100 tokens</span></li>
      </ol>

      <div class="state">
        @if (!auth.user()) {
          <a class="action" routerLink="/auth">Iniciar sesión</a>
        } @else if (walletStatus()?.phantom?.verified) {
          <span class="verified" aria-label="Wallet verificada">Wallet verificada</span>
        } @else if (canLinkPhantom()) {
          <button class="action" type="button" (click)="linkPhantom()" [disabled]="busy()">
            Vincular Phantom
          </button>
        } @else {
          <span class="neutral">Configura tu cuenta</span>
        }
        @if (holderMessage()) {
          <p class="holder" [class.ok]="walletStatus()?.holder?.status === 'eligible'"
            [class.warn]="walletStatus()?.holder?.status === 'insufficient'"
            [class.muted]="walletStatus()?.holder?.status === 'unknown'">
            {{ holderMessage() }}
          </p>
        }
        @if (error()) { <p class="error">{{ error() }}</p> }
      </div>
    </section>
  `,
  styles: [`
    .notice {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto;
      gap: 18px;
      align-items: center;
      padding: 18px;
      margin: 22px 0 28px;
      border: 1px solid rgba(212, 255, 95, .32);
      background: rgba(28, 40, 26, .88);
    }
    .eyebrow { margin: 0 0 4px; color: #d4ff5f; font-size: .72rem; letter-spacing: .18em; }
    h2 { margin: 0 0 6px; font-size: 1.2rem; }
    .copy { margin: 0; color: #cbd6bd; line-height: 1.45; }
    .hint { margin: 8px 0 0; color: #aeb8a6; font-size: .82rem; line-height: 1.35; }
    .prizes { display: grid; grid-template-columns: repeat(3, 86px); gap: 8px; padding: 0; margin: 0; list-style: none; }
    .prizes li { padding: 10px; border: 1px solid rgba(113, 130, 92, .72); background: rgba(13, 18, 12, .62); text-align: center; }
    .prizes strong, .prizes span { display: block; }
    .prizes strong { color: #d4ff5f; }
    .prizes span { margin-top: 3px; color: #edf4dc; font-size: .78rem; }
    .state { min-width: 150px; display: grid; gap: 8px; justify-items: end; }
    .action { min-height: 40px; padding: 10px 14px; border: 1px solid #d4ff5f; color: #10150e; background: #d4ff5f; font: inherit; font-weight: 800; text-decoration: none; cursor: pointer; }
    .action:disabled { opacity: .55; cursor: wait; }
    .verified, .neutral { padding: 9px 12px; border: 1px solid #71825c; background: #10150e; font-weight: 800; }
    .verified { color: #d4ff5f; border-color: #d4ff5f; }
    .neutral { color: #edf4dc; }
    .holder { max-width: 220px; margin: 0; color: #ffcf66; font-size: .82rem; text-align: right; line-height: 1.35; }
    .holder.ok { color: #d4ff5f; }
    .holder.warn { color: #ffcf66; }
    .holder.muted { color: #aeb8a6; }
    .error { margin: 0; color: #ff8a80; font-size: .82rem; text-align: right; }
    @media (max-width: 820px) {
      .notice { grid-template-columns: 1fr; }
      .prizes { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .state { justify-items: start; }
      .holder, .error { text-align: left; }
    }
  `],
})
export class RewardEligibilityNoticeComponent implements OnInit, OnChanges {
  @Input() refreshKey = 0;
  readonly walletStatus = signal<WalletStatus | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');

  constructor(
    readonly auth: AuthService,
    private readonly rewards: RewardsService,
  ) {}

  ngOnInit(): void {
    this.loadStatus();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['refreshKey'] && !changes['refreshKey'].firstChange) this.loadStatus();
  }

  canLinkPhantom(): boolean {
    const status = this.walletStatus();
    return this.auth.currentProvider() === 'GOOGLE' && status?.phantom?.verified !== true;
  }

  holderMessage(): string {
    const holder = this.walletStatus()?.holder;
    if (!holder) return '';
    if (holder.status === 'eligible') return 'Tienes 10.000+ tokens ahora.';
    if (holder.status === 'insufficient') return 'Ahora tienes menos de 10.000 tokens.';
    if (holder.status === 'unavailable') return 'No pudimos consultar tu saldo ahora.';
    return holder.message;
  }

  private loadStatus(): void {
    if (!this.auth.user()) return;
    this.rewards.getWalletStatus().subscribe({
      next: status => this.walletStatus.set(status),
      error: () => this.walletStatus.set({
        currentProvider: this.auth.currentProvider() ?? 'GOOGLE',
        phantom: { linked: false, verified: false },
        google: { linked: this.auth.currentProvider() === 'GOOGLE' },
        holder: {
          status: 'unavailable',
          requiredTokens: 10000,
          message: 'No pudimos consultar tu saldo ahora.',
        },
      }),
    });
  }

  async linkPhantom(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      this.walletStatus.set(await this.auth.linkPhantom());
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo vincular Phantom');
    } finally {
      this.busy.set(false);
    }
  }
}

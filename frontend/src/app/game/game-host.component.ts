import { AfterViewInit, Component, ElementRef, HostListener, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { TankGame } from './TankGame';
import { ACTIVE_BACKGROUND_SCENARIO } from '../scenarios/background-scenarios';
import { socketManager } from '../network/socket';
import { AuthService } from '../auth/auth.service';
import { registerTranslate } from '../shared/translate-bridge';
import { Router } from '@angular/router';
import { clampVolume, DEFAULT_GAME_SETTINGS, GameSettings } from './game-settings.types';
import { GameSettingsService } from './game-settings.service';

@Component({
  selector: 'app-game-host',
  standalone: true,
  imports: [TranslocoPipe],
  template: `
    <div class="game-wrapper" [class]="scenarioClass">
      <div #gameContainer id="game-container"></div>

      @if (settingsOpen()) {
        <section
          class="settings-panel"
          aria-label="Game settings"
          (pointerdown)="stopGamePointer($event)"
          (pointerup)="stopGamePointer($event)"
          (click)="stopGamePointer($event)"
        >
          <header>
            <span>{{ 'settings.menu' | transloco }}</span>
            <button
              type="button"
              class="icon-button"
              [attr.aria-label]="'settings.close' | transloco"
              (click)="toggleSettings(false)"
            >x</button>
          </header>

          <label class="volume-control" for="sfx-volume">
            <span>{{ 'settings.soundEffects' | transloco }}</span>
            <strong>{{ sfxPercent() }}%</strong>
          </label>
          <input
            id="sfx-volume"
            type="range"
            min="0"
            max="100"
            step="1"
            [value]="sfxPercent()"
            (input)="onSfxVolumeInput($event)"
          >

          <div class="panel-footer">{{ saveLabelKey() | transloco }}</div>
        </section>
      }

      @if (spectatorMode()) {
        <button
          type="button"
          class="spectator-lobby-button"
          (pointerdown)="stopGamePointer($event)"
          (pointerup)="stopGamePointer($event)"
          (click)="leaveSpectator($event)"
        >
          {{ 'hud.spectatorGoToLobby' | transloco }}
        </button>
      }

      <div class="rotate-overlay" aria-hidden="true">
        <span class="rotate-icon">⟳</span>
        <strong>{{ 'game.rotateTitle' | transloco }}</strong>
        <span>{{ 'game.rotateHint' | transloco }}</span>
      </div>
    </div>
  `,
  styles: [`
    :host {
      --page-bg: #20170d;
      display: flex;
      width: 100vw;
      height: 100vh;
      height: 100dvh;
      padding: 5vh 5vw;
      align-items: center;
      justify-content: center;
      background: var(--page-bg);
      overflow: hidden;
    }

    .game-wrapper,
    #game-container {
      width: 100%;
      height: 100%;
      min-width: 0;
      min-height: 0;
    }

    .game-wrapper {
      position: relative;
    }

    #game-container ::ng-deep canvas {
      touch-action: none;
    }

    @media (pointer: coarse) {
      :host {
        padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
      }
    }

    .rotate-overlay {
      display: none;
      position: fixed;
      inset: 0;
      z-index: 20;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 24px;
      text-align: center;
      color: #f6ead1;
      background: rgba(24, 19, 14, 0.97);
    }

    .rotate-overlay strong {
      color: #83e5ef;
      font-size: 20px;
      letter-spacing: 0.08em;
    }

    .rotate-icon {
      font-size: 56px;
      color: #ffd98a;
      animation: rotate-nudge 1.6s ease-in-out infinite;
    }

    @keyframes rotate-nudge {
      0%, 100% { transform: rotate(0deg); }
      50% { transform: rotate(-90deg); }
    }

    @media (pointer: coarse) and (orientation: portrait) {
      .rotate-overlay {
        display: flex;
      }
    }

    .settings-panel {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: min(360px, calc(100% - 48px));
      padding: 18px;
      color: #f6ead1;
      border: 1px solid #725936;
      background: rgba(24, 19, 14, 0.96);
      box-shadow: 0 18px 60px rgba(0, 0, 0, 0.45);
      z-index: 10;
    }

    .spectator-lobby-button {
      position: absolute;
      left: 50%;
      bottom: calc(18px + env(safe-area-inset-bottom, 0px));
      z-index: 12;
      transform: translateX(-50%);
      min-width: 170px;
      padding: 11px 20px;
      color: #201207;
      font-family: 'JetBrains Mono', ui-monospace, monospace;
      font-size: 0.82rem;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      border: 1px solid #ffd08a;
      border-radius: 9px;
      background: #ff9f43;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.38);
      cursor: pointer;
    }

    .spectator-lobby-button:hover {
      background: #ffb15f;
    }

    .spectator-lobby-button:focus-visible {
      outline: 3px solid #fff2d7;
      outline-offset: 3px;
    }

    .settings-panel header,
    .volume-control,
    .panel-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }

    .settings-panel header {
      margin-bottom: 18px;
      color: #83e5ef;
      font-size: 12px;
      letter-spacing: 0.16em;
    }

    .icon-button {
      width: 32px;
      height: 32px;
      color: #f6ead1;
      border: 1px solid #725936;
      background: #2a2118;
      cursor: pointer;
      font-size: 18px;
      line-height: 1;
    }

    .volume-control {
      margin-bottom: 10px;
      font-size: 14px;
    }

    .volume-control strong {
      min-width: 48px;
      text-align: right;
      color: #ffffff;
    }

    input[type="range"] {
      width: 100%;
      accent-color: #62d3df;
    }

    .panel-footer {
      min-height: 20px;
      margin-top: 12px;
      color: #bfa984;
      font-size: 12px;
    }
  `],
})
export class GameHostComponent implements AfterViewInit, OnDestroy {
  protected readonly scenarioClass = ACTIVE_BACKGROUND_SCENARIO.cssClass;
  // Signals: this app is zoneless, and these fields are mutated from
  // non-template contexts (window events from Phaser, async saves).
  protected readonly settingsOpen = signal(false);
  protected readonly spectatorMode = signal(false);
  protected settings: GameSettings = { ...DEFAULT_GAME_SETTINGS };
  protected readonly sfxPercent = signal(Math.round(DEFAULT_GAME_SETTINGS.sfxVolume * 100));
  protected readonly saveLabelKey = signal('settings.saved');

  @ViewChild('gameContainer', { static: true })
  private containerRef!: ElementRef<HTMLDivElement>;

  private game?: TankGame;
  private langLoad?: Subscription;
  private saveTimer?: number;

  private readonly returnToLobby = () => {
    void this.router.navigateByUrl('/lobby');
  };

  private readonly openSettingsFromGame = (): void => {
    this.toggleSettings(true);
  };

  private readonly spectatorModeChanged = (event: Event): void => {
    const active = Boolean((event as CustomEvent<{ active?: boolean }>).detail?.active);
    this.spectatorMode.set(active);
  };

  // Best-effort on the first touch: Android honors fullscreen + landscape
  // lock; iOS Safari supports neither, so failures stay silent and the
  // portrait rotate overlay covers that case.
  private readonly tryFullscreenLandscape = (): void => {
    this.containerRef.nativeElement.removeEventListener('pointerdown', this.tryFullscreenLandscape);
    void (async () => {
      try {
        if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
        }
        const orientation = screen.orientation as ScreenOrientation & {
          lock?: (orientation: string) => Promise<void>;
        };
        await orientation.lock?.('landscape');
      } catch {
        // Unsupported (iOS) or rejected; nothing to do.
      }
    })();
  };

  private releaseCombatDisplayMode(): void {
    try {
      const orientation = screen.orientation as ScreenOrientation & {
        unlock?: () => void;
      };
      orientation.unlock?.();
    } catch {
      // Unsupported (iOS) or already unlocked.
    }

    if (document.fullscreenElement && document.exitFullscreen) {
      void document.exitFullscreen().catch(() => undefined);
    }
  }

  // iOS Safari reports stale viewport sizes right after rotation or browser
  // bar collapse, leaving the FIT-scaled canvas larger than its container and
  // clipping the HUD edges. Re-measuring shortly after the event fixes it.
  private readonly refreshScale = (): void => {
    if (this.scaleRefreshTimer !== undefined) window.clearTimeout(this.scaleRefreshTimer);
    this.scaleRefreshTimer = window.setTimeout(() => this.game?.scale.refresh(), 250);
  };
  private scaleRefreshTimer?: number;

  private readonly transloco = inject(TranslocoService);

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly gameSettings: GameSettingsService,
  ) {}

  ngAfterViewInit(): void {
    registerTranslate((key: string, params?: Record<string, unknown>) => this.transloco.translate(key, params));
    window.addEventListener('tank-arena:return-lobby', this.returnToLobby);
    window.addEventListener('tank-arena:open-settings', this.openSettingsFromGame);
    window.addEventListener('tank-arena:spectator-mode', this.spectatorModeChanged);
    if (window.matchMedia?.('(pointer: coarse)').matches) {
      this.containerRef.nativeElement.addEventListener('pointerdown', this.tryFullscreenLandscape);
    }
    window.addEventListener('resize', this.refreshScale);
    window.addEventListener('orientationchange', this.refreshScale);
    window.visualViewport?.addEventListener('resize', this.refreshScale);
    socketManager.connect(this.auth.accessToken() ?? undefined);

    this.langLoad = this.transloco.load(this.transloco.getActiveLang()).subscribe(() => {
      this.game = new TankGame(this.containerRef.nativeElement);
      void this.loadSettings();
    });
  }

  ngOnDestroy(): void {
    this.langLoad?.unsubscribe();
    if (this.saveTimer !== undefined) window.clearTimeout(this.saveTimer);
    window.removeEventListener('tank-arena:return-lobby', this.returnToLobby);
    window.removeEventListener('tank-arena:open-settings', this.openSettingsFromGame);
    window.removeEventListener('tank-arena:spectator-mode', this.spectatorModeChanged);
    this.containerRef.nativeElement.removeEventListener('pointerdown', this.tryFullscreenLandscape);
    window.removeEventListener('resize', this.refreshScale);
    window.removeEventListener('orientationchange', this.refreshScale);
    window.visualViewport?.removeEventListener('resize', this.refreshScale);
    if (this.scaleRefreshTimer !== undefined) window.clearTimeout(this.scaleRefreshTimer);
    this.releaseCombatDisplayMode();
    this.game?.destroy(true);
  }

  @HostListener('window:keydown', ['$event'])
  protected onWindowKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    this.toggleSettings(!this.settingsOpen());
  }

  protected toggleSettings(open: boolean): void {
    this.settingsOpen.set(open);
    window.dispatchEvent(new CustomEvent('tank-arena:settings-menu', {
      detail: { open },
    }));
  }

  protected onSfxVolumeInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.applySettings({ ...this.settings, sfxVolume: clampVolume(Number(input.value) / 100) });
    this.saveLabelKey.set('settings.saving');
    if (this.saveTimer !== undefined) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      void this.saveSettings();
    }, 300);
  }

  protected stopGamePointer(event: Event): void {
    event.stopPropagation();
  }

  protected leaveSpectator(event: Event): void {
    event.stopPropagation();
    this.returnToLobby();
  }

  private async loadSettings(): Promise<void> {
    const loaded = await this.gameSettings.load(this.auth.accessToken());
    this.applySettings(loaded);
  }

  private async saveSettings(): Promise<void> {
    try {
      await this.gameSettings.save(this.settings, this.auth.accessToken());
      this.saveLabelKey.set(this.auth.accessToken() ? 'settings.savedAccount' : 'settings.savedDevice');
    } catch {
      this.gameSettings.storeLocal(this.settings);
      this.saveLabelKey.set('settings.savedDevice');
    }
  }

  private applySettings(settings: GameSettings): void {
    this.settings = { sfxVolume: clampVolume(settings.sfxVolume) };
    this.sfxPercent.set(Math.round(this.settings.sfxVolume * 100));
    window.dispatchEvent(new CustomEvent('tank-arena:settings-changed', {
      detail: this.settings,
    }));
  }
}

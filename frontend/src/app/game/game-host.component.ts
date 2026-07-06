import { AfterViewInit, Component, ElementRef, HostListener, OnDestroy, ViewChild, inject } from '@angular/core';
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

      @if (settingsOpen) {
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
            <strong>{{ sfxPercent }}%</strong>
          </label>
          <input
            id="sfx-volume"
            type="range"
            min="0"
            max="100"
            step="1"
            [value]="sfxPercent"
            (input)="onSfxVolumeInput($event)"
          >

          <div class="panel-footer">{{ saveLabelKey | transloco }}</div>
        </section>
      }
    </div>
  `,
  styles: [`
    :host {
      --page-bg: #20170d;
      display: flex;
      width: 100vw;
      height: 100vh;
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
  protected settingsOpen = false;
  protected settings: GameSettings = { ...DEFAULT_GAME_SETTINGS };
  protected sfxPercent = Math.round(DEFAULT_GAME_SETTINGS.sfxVolume * 100);
  protected saveLabelKey = 'settings.saved';

  @ViewChild('gameContainer', { static: true })
  private containerRef!: ElementRef<HTMLDivElement>;

  private game?: TankGame;
  private langLoad?: Subscription;
  private saveTimer?: number;

  private readonly returnToLobby = () => {
    void this.router.navigateByUrl('/lobby');
  };

  private readonly transloco = inject(TranslocoService);

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly gameSettings: GameSettingsService,
  ) {}

  ngAfterViewInit(): void {
    registerTranslate((key: string, params?: Record<string, unknown>) => this.transloco.translate(key, params));
    window.addEventListener('tank-arena:return-lobby', this.returnToLobby);
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
    this.game?.destroy(true);
  }

  @HostListener('window:keydown', ['$event'])
  protected onWindowKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    this.toggleSettings(!this.settingsOpen);
  }

  protected toggleSettings(open: boolean): void {
    this.settingsOpen = open;
    window.dispatchEvent(new CustomEvent('tank-arena:settings-menu', {
      detail: { open },
    }));
  }

  protected onSfxVolumeInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.applySettings({ ...this.settings, sfxVolume: clampVolume(Number(input.value) / 100) });
    this.saveLabelKey = 'settings.saving';
    if (this.saveTimer !== undefined) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      void this.saveSettings();
    }, 300);
  }

  protected stopGamePointer(event: Event): void {
    event.stopPropagation();
  }

  private async loadSettings(): Promise<void> {
    const loaded = await this.gameSettings.load(this.auth.accessToken());
    this.applySettings(loaded);
  }

  private async saveSettings(): Promise<void> {
    try {
      await this.gameSettings.save(this.settings, this.auth.accessToken());
      this.saveLabelKey = this.auth.accessToken() ? 'settings.savedAccount' : 'settings.savedDevice';
    } catch {
      this.gameSettings.storeLocal(this.settings);
      this.saveLabelKey = 'settings.savedDevice';
    }
  }

  private applySettings(settings: GameSettings): void {
    this.settings = { sfxVolume: clampVolume(settings.sfxVolume) };
    this.sfxPercent = Math.round(this.settings.sfxVolume * 100);
    window.dispatchEvent(new CustomEvent('tank-arena:settings-changed', {
      detail: this.settings,
    }));
  }
}

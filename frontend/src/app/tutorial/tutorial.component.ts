import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthService } from '../auth/auth.service';
import { registerTranslate } from '../shared/translate-bridge';
import { TutorialGame } from './tutorial-game';

@Component({
  selector: 'app-tutorial',
  standalone: true,
  imports: [TranslocoPipe],
  templateUrl: './tutorial.component.html',
  styleUrl: './tutorial.component.css',
})
export class TutorialComponent implements AfterViewInit, OnDestroy {
  @ViewChild('tutorialContainer', { static: true })
  private containerRef!: ElementRef<HTMLDivElement>;

  protected readonly step = signal(0);
  protected readonly complete = signal(false);
  protected readonly isTouch = signal(false);
  protected readonly saving = signal(false);
  protected readonly saveError = signal('');
  protected readonly instructionKey = computed(() => {
    const device = this.isTouch() ? 'mobile' : 'desktop';
    return `tutorial.steps.${this.step()}.${device}`;
  });

  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  private readonly auth = inject(AuthService);
  private game?: TutorialGame;
  private scaleRefreshTimer?: number;

  // Mobile browsers, especially iOS Safari, can report the old viewport size
  // briefly after the rotate overlay disappears. Re-measure once the browser
  // chrome and visual viewport have settled so Phaser's FIT scale is correct.
  private readonly refreshScale = (): void => {
    if (this.scaleRefreshTimer !== undefined) window.clearTimeout(this.scaleRefreshTimer);
    this.scaleRefreshTimer = window.setTimeout(() => this.game?.scale.refresh(), 250);
  };

  ngAfterViewInit(): void {
    registerTranslate((key: string, params?: Record<string, unknown>) => this.transloco.translate(key, params));
    this.isTouch.set(window.matchMedia?.('(pointer: coarse)').matches ?? false);
    window.addEventListener('resize', this.refreshScale);
    window.addEventListener('orientationchange', this.refreshScale);
    window.visualViewport?.addEventListener('resize', this.refreshScale);
    this.createGame();
    this.refreshScale();
  }

  ngOnDestroy(): void {
    window.removeEventListener('resize', this.refreshScale);
    window.removeEventListener('orientationchange', this.refreshScale);
    window.visualViewport?.removeEventListener('resize', this.refreshScale);
    if (this.scaleRefreshTimer !== undefined) window.clearTimeout(this.scaleRefreshTimer);
    this.game?.destroy(true);
  }

  protected async finish(): Promise<void> {
    await this.persistAndLeave('COMPLETED');
  }

  protected async skip(): Promise<void> {
    await this.persistAndLeave('SKIPPED');
  }

  protected repeat(): void {
    this.complete.set(false);
    this.saveError.set('');
    this.step.set(0);
    this.game?.destroy(true);
    this.createGame();
  }

  private createGame(): void {
    this.game = new TutorialGame(this.containerRef.nativeElement, {
      onStepChange: (step) => this.step.set(step),
      onComplete: () => this.complete.set(true),
    }, this.auth.user()?.username ?? this.transloco.translate('tutorial.playerFallback'));
  }

  private async persistAndLeave(status: 'COMPLETED' | 'SKIPPED'): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    this.saveError.set('');
    try {
      await this.auth.finishTutorial(status);
      await this.router.navigateByUrl('/lobby');
    } catch {
      this.saveError.set(this.transloco.translate('tutorial.saveError'));
    } finally {
      this.saving.set(false);
    }
  }
}

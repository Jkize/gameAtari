import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthService } from '@core/auth/auth.service';
import { registerTranslate } from '@core/i18n/translate-bridge';
import { VisibleViewportResizer } from '@shared/utilities/visible-viewport-resizer';
import { TutorialGame } from '@game/tutorial/tutorial-game';

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
  private readonly host = inject(ElementRef<HTMLElement>);
  private game?: TutorialGame;
  private viewportResizer?: VisibleViewportResizer;

  ngAfterViewInit(): void {
    registerTranslate((key: string, params?: Record<string, unknown>) => this.transloco.translate(key, params));
    this.isTouch.set(window.matchMedia?.('(pointer: coarse)').matches ?? false);
    this.createGame();
    this.viewportResizer = new VisibleViewportResizer(
      this.host.nativeElement,
      this.containerRef.nativeElement,
      (width, height) => this.game?.scale.setParentSize(width, height),
    );
    this.viewportResizer.start();
  }

  ngOnDestroy(): void {
    this.viewportResizer?.destroy();
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
    this.viewportResizer?.refresh();
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

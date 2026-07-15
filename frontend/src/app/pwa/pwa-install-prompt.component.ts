import { Component, HostListener, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { PwaInstallService } from './pwa-install.service';

const DISMISS_STORAGE_KEY = 'tank-arena:pwa-install-dismissed-at';
const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const SHOW_DELAY_MS = 2500;

@Component({
  selector: 'app-pwa-install-prompt',
  standalone: true,
  imports: [TranslocoPipe],
  templateUrl: './pwa-install-prompt.component.html',
  styleUrl: './pwa-install-prompt.component.css',
})
export class PwaInstallPromptComponent implements OnInit, OnDestroy {
  private readonly pwaInstall = inject(PwaInstallService);
  private readonly delayElapsed = signal(false);
  private readonly dismissed = signal(this.wasDismissedRecently());
  private readonly manuallyOpened = signal(false);
  private showTimer: number | null = null;

  protected readonly mode = this.pwaInstall.mode;
  protected readonly platform = this.pwaInstall.platform;
  protected readonly canOfferInstall = this.pwaInstall.canOfferInstall;
  protected readonly showingInstructions = signal(false);
  protected readonly installing = signal(false);
  protected readonly visible = computed(() =>
    !this.pwaInstall.installed()
      && (
        this.manuallyOpened()
        || (this.delayElapsed() && !this.dismissed() && this.mode() !== null)
      ),
  );

  ngOnInit(): void {
    this.pwaInstall.initialize();
    this.showTimer = window.setTimeout(() => this.delayElapsed.set(true), SHOW_DELAY_MS);
  }

  ngOnDestroy(): void {
    if (this.showTimer !== null) window.clearTimeout(this.showTimer);
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.visible()) this.dismiss();
  }

  protected async install(): Promise<void> {
    if (this.mode() !== 'native') {
      this.showingInstructions.set(true);
      return;
    }

    this.installing.set(true);
    try {
      const outcome = await this.pwaInstall.promptInstall();
      if (outcome !== 'accepted') this.rememberDismissal();
    } finally {
      this.installing.set(false);
      this.manuallyOpened.set(false);
    }
  }

  protected openManually(): void {
    this.showingInstructions.set(false);
    this.manuallyOpened.set(true);
  }

  protected dismiss(): void {
    this.rememberDismissal();
    this.dismissed.set(true);
    this.manuallyOpened.set(false);
    this.showingInstructions.set(false);
  }

  private wasDismissedRecently(): boolean {
    try {
      const dismissedAt = Number(window.localStorage.getItem(DISMISS_STORAGE_KEY));
      return Number.isFinite(dismissedAt)
        && dismissedAt > 0
        && Date.now() - dismissedAt < DISMISS_COOLDOWN_MS;
    } catch {
      return false;
    }
  }

  private rememberDismissal(): void {
    try {
      window.localStorage.setItem(DISMISS_STORAGE_KEY, String(Date.now()));
    } catch {
      // Storage can be unavailable in private or restricted browsing modes.
    }
  }
}

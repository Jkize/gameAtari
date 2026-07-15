import { Injectable, OnDestroy, computed, signal } from '@angular/core';

export type PwaInstallMode = 'native' | 'ios';
export type PwaInstallOutcome = 'accepted' | 'dismissed' | 'unavailable';
export type PwaInstallPlatform = 'android' | 'ios';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface NavigatorWithStandalone extends Navigator {
  standalone?: boolean;
}

@Injectable({ providedIn: 'root' })
export class PwaInstallService implements OnDestroy {
  readonly mode = signal<PwaInstallMode | null>(null);
  readonly platform = signal<PwaInstallPlatform | null>(null);
  readonly installed = signal(false);
  readonly canOfferInstall = computed(() => this.platform() !== null && !this.installed());

  private deferredPrompt: BeforeInstallPromptEvent | null = null;
  private initialized = false;

  private readonly onBeforeInstallPrompt = (event: Event): void => {
    if (!this.isAndroid() || this.isRunningStandalone()) return;
    event.preventDefault();
    this.deferredPrompt = event as BeforeInstallPromptEvent;
    this.mode.set('native');
  };

  private readonly onAppInstalled = (): void => {
    this.deferredPrompt = null;
    this.installed.set(true);
    this.mode.set(null);
  };

  initialize(): void {
    if (this.initialized || typeof window === 'undefined') return;
    this.initialized = true;

    if (this.isRunningStandalone()) {
      this.installed.set(true);
      return;
    }

    if (this.isIos()) {
      this.platform.set('ios');
      this.mode.set('ios');
    } else if (this.isAndroid()) {
      this.platform.set('android');
    }
    window.addEventListener('beforeinstallprompt', this.onBeforeInstallPrompt);
    window.addEventListener('appinstalled', this.onAppInstalled);
  }

  async promptInstall(): Promise<PwaInstallOutcome> {
    const prompt = this.deferredPrompt;
    if (!prompt) return 'unavailable';

    try {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      return outcome;
    } catch {
      return 'unavailable';
    } finally {
      this.deferredPrompt = null;
      this.mode.set(null);
    }
  }

  ngOnDestroy(): void {
    if (!this.initialized || typeof window === 'undefined') return;
    window.removeEventListener('beforeinstallprompt', this.onBeforeInstallPrompt);
    window.removeEventListener('appinstalled', this.onAppInstalled);
  }

  private isRunningStandalone(): boolean {
    const navigatorWithStandalone = navigator as NavigatorWithStandalone;
    return navigatorWithStandalone.standalone === true
      || (typeof window.matchMedia === 'function'
        && ['standalone', 'fullscreen', 'minimal-ui'].some(
          mode => window.matchMedia(`(display-mode: ${mode})`).matches,
        ));
  }

  private isAndroid(): boolean {
    return /Android/i.test(navigator.userAgent);
  }

  private isIos(): boolean {
    return /iPad|iPhone|iPod/i.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
}

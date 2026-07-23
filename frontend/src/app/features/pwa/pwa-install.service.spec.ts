import { vi } from 'vitest';
import { PwaInstallService } from './pwa-install.service';

describe('PwaInstallService', () => {
  let service: PwaInstallService | undefined;

  beforeEach(() => {
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));
  });

  afterEach(() => {
    service?.ngOnDestroy();
    service = undefined;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('captures the Android install event and opens the native prompt', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Linux; Android 15) Chrome/140');
    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.assign(event, {
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted', platform: 'web' }),
    });

    service = new PwaInstallService();
    service.initialize();
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(service.platform()).toBe('android');
    expect(service.canOfferInstall()).toBe(true);
    expect(service.mode()).toBe('native');
    await expect(service.promptInstall()).resolves.toBe('accepted');
    expect(prompt).toHaveBeenCalledOnce();
    expect(service.mode()).toBeNull();
  });

  it('offers guided installation on iOS', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)');

    service = new PwaInstallService();
    service.initialize();

    expect(service.mode()).toBe('ios');
    expect(service.platform()).toBe('ios');
    expect(service.canOfferInstall()).toBe(true);
    expect(service.installed()).toBe(false);
  });

  it('does not offer installation when already running as an installed app', () => {
    vi.mocked(window.matchMedia).mockImplementation(query => ({
      matches: query === '(display-mode: fullscreen)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    service = new PwaInstallService();
    service.initialize();

    expect(service.installed()).toBe(true);
    expect(service.canOfferInstall()).toBe(false);
    expect(service.mode()).toBeNull();
  });
});

import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { AuthService } from '@core/auth/auth.service';
import { AccountRefreshService } from '@features/account/account-refresh.service';
import { GameAssetPreloaderService } from '@game/assets/game-asset-preloader.service';
import { LobbyController } from './lobby.controller';

class TestLobbyController extends LobbyController {}

describe('LobbyController notices', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: GameAssetPreloaderService,
          useValue: {
            progress: signal(0),
            cancel: vi.fn(),
          },
        },
        {
          provide: TranslocoService,
          useValue: { translate: (key: string) => key },
        },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('removes the private-room closure notice after 30 seconds', () => {
    const controller = TestBed.runInInjectionContext(
      () => new TestLobbyController(
        {} as AuthService,
        {} as AccountRefreshService,
        {} as never,
      ),
    );

    (
      controller as unknown as {
        setNotice(message: string, autoDismissMs?: number): void;
      }
    ).setNotice('The private room was closed due to inactivity.', 30_000);

    vi.advanceTimersByTime(29_999);
    expect(controller.notice()).toBe('The private room was closed due to inactivity.');

    vi.advanceTimersByTime(1);
    expect(controller.notice()).toBe('');
  });
});

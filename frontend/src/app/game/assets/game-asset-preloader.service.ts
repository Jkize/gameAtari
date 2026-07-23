import { Inject, Injectable, InjectionToken, signal } from '@angular/core';
import { GAME_PUBLIC_ASSET_PATHS } from './game-assets';

const PREPARATION_TIMEOUT_MS = 30_000;
type GameModuleLoader = () => Promise<unknown>;

export const GAME_MODULE_LOADER = new InjectionToken<GameModuleLoader>('GAME_MODULE_LOADER', {
  providedIn: 'root',
  factory: () => () => import('@game/bootstrap/tank-game'),
});

@Injectable({ providedIn: 'root' })
export class GameAssetPreloaderService {
  readonly progress = signal(0);

  private ready = false;
  private preparation?: Promise<void>;
  private activeController?: AbortController;

  constructor(@Inject(GAME_MODULE_LOADER) private readonly loadGameModule: GameModuleLoader) {}

  prepare(): Promise<void> {
    if (this.ready) {
      this.progress.set(100);
      return Promise.resolve();
    }
    if (this.preparation) return this.preparation;

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort('timeout'), PREPARATION_TIMEOUT_MS);
    this.activeController = controller;

    const preparation = this.load(controller.signal)
      .then(() => {
        if (controller.signal.aborted)
          throw new DOMException('Preparation cancelled', 'AbortError');
        this.ready = true;
      })
      .catch((error) => {
        throw error;
      })
      .finally(() => {
        window.clearTimeout(timeout);
        if (this.preparation === preparation) this.preparation = undefined;
        if (this.activeController === controller) this.activeController = undefined;
      });
    this.preparation = preparation;
    return preparation;
  }

  cancel(): void {
    if (this.ready) return;
    this.activeController?.abort('cancelled');
    this.activeController = undefined;
    this.preparation = undefined;
    this.progress.set(0);
  }

  private async load(signal: AbortSignal): Promise<void> {
    const total = GAME_PUBLIC_ASSET_PATHS.length + 1;
    let completed = 0;
    const advance = (): void => {
      if (signal.aborted) return;
      completed += 1;
      this.progress.set(Math.round((completed / total) * 100));
    };

    this.progress.set(0);
    await this.loadGameModule();
    if (signal.aborted) throw new DOMException('Preparation cancelled', 'AbortError');
    advance();

    await this.runWithConcurrency(GAME_PUBLIC_ASSET_PATHS, 6, async (path) => {
      const response = await fetch(new URL(path, document.baseURI), {
        cache: 'force-cache',
        signal,
      });
      if (!response.ok) throw new Error(`Could not load game asset: ${path} (${response.status})`);
      await response.arrayBuffer();
      advance();
    });
  }

  private async runWithConcurrency<T>(
    items: readonly T[],
    concurrency: number,
    task: (item: T) => Promise<void>,
  ): Promise<void> {
    let nextIndex = 0;
    const worker = async (): Promise<void> => {
      while (nextIndex < items.length) {
        const item = items[nextIndex++];
        await task(item);
      }
    };
    const results = await Promise.allSettled(
      Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
    );
    const failed = results.find((result) => result.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
  }
}

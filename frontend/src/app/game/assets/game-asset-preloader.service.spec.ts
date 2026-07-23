import { afterEach, describe, expect, it, vi } from 'vitest';
import { GAME_PUBLIC_ASSET_PATHS } from './game-assets';
import { GameAssetPreloaderService } from './game-asset-preloader.service';

describe('GameAssetPreloaderService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads every public asset and reuses the completed preparation', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    });
    vi.stubGlobal('fetch', fetchMock);
    const service = new GameAssetPreloaderService(() => Promise.resolve());

    await service.prepare();
    await service.prepare();

    expect(service.progress()).toBe(100);
    expect(fetchMock).toHaveBeenCalledTimes(GAME_PUBLIC_ASSET_PATHS.length);
  });

  it('aborts an active preparation without leaving stale progress', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: URL, options?: RequestInit) =>
          new Promise((_resolve, reject) => {
            options?.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            );
          }),
      ),
    );
    const service = new GameAssetPreloaderService(() => Promise.resolve());
    const preparation = service.prepare();

    service.cancel();

    await expect(preparation).rejects.toMatchObject({ name: 'AbortError' });
    expect(service.progress()).toBe(0);
  });
});

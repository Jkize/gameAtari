import { describe, expect, it, vi } from 'vitest';
import { PHASER_GAME_ASSETS } from '@game/assets/game-assets';
import { BootScene } from './boot-scene';

vi.mock('phaser', () => ({
  default: {
    Scene: class {
      constructor(_config: unknown) {}
    },
  },
}));

describe('BootScene', () => {
  it('queues every configured game asset before starting gameplay', () => {
    const load = {
      audio: vi.fn(),
      image: vi.fn(),
      svg: vi.fn(),
    };
    const boot = new BootScene();
    (boot as unknown as { load: unknown }).load = load;

    boot.preload();

    expect(load.audio.mock.calls.length + load.image.mock.calls.length + load.svg.mock.calls.length)
      .toBe(PHASER_GAME_ASSETS.length);
  });

  it('starts GameScene immediately after preload without an artificial timer', () => {
    const graphics = {
      fillStyle: vi.fn(),
      fillCircle: vi.fn(),
      generateTexture: vi.fn(),
      destroy: vi.fn(),
    };
    const start = vi.fn();
    const boot = new BootScene();
    (boot as unknown as { make: unknown }).make = { graphics: vi.fn(() => graphics) };
    (boot as unknown as { scene: unknown }).scene = { start };

    boot.create();

    expect(graphics.generateTexture).toHaveBeenCalledWith('particle', 12, 12);
    expect(start).toHaveBeenCalledOnce();
    expect(start).toHaveBeenCalledWith('GameScene');
  });
});

import type Phaser from 'phaser';
import { describe, expect, it, vi } from 'vitest';
import { SpectatorCameraController } from '@game/spectator/spectator-camera-controller';

vi.mock('phaser', () => ({
  default: {
    Input: {
      Events: {
        POINTER_DOWN: 'pointerdown',
        POINTER_MOVE: 'pointermove',
        POINTER_UP: 'pointerup',
        POINTER_UP_OUTSIDE: 'pointerupoutside',
      },
    },
    Math: {
      Clamp: (value: number, min: number, max: number) => Math.min(max, Math.max(min, value)),
    },
  },
}));

describe('SpectatorCameraController', () => {
  it('stops following and pans the bounded camera with a held pointer', () => {
    const handlers = new Map<string, (pointer: Phaser.Input.Pointer) => void>();
    const camera = {
      zoom: 1,
      width: 800,
      height: 600,
      scrollX: 200,
      scrollY: 200,
      stopFollow: vi.fn(),
    };
    const input = {
      on: vi.fn((event: string, handler: (pointer: Phaser.Input.Pointer) => void) => {
        handlers.set(event, handler);
      }),
      off: vi.fn(),
      setDefaultCursor: vi.fn(),
    };
    const scene = { input, cameras: { main: camera } } as unknown as Phaser.Scene;
    const onFreePanStart = vi.fn();
    const controller = new SpectatorCameraController(
      scene,
      () => ({ width: 1600, height: 1200 }),
      onFreePanStart,
    );

    controller.setActive(true);
    expect(camera.stopFollow).toHaveBeenCalledOnce();
    expect(input.setDefaultCursor).toHaveBeenLastCalledWith('grab');

    handlers.get('pointerdown')?.({ id: 1, x: 100, y: 100 } as Phaser.Input.Pointer);
    expect(camera.stopFollow).toHaveBeenCalledTimes(2);
    expect(onFreePanStart).toHaveBeenCalledOnce();
    handlers.get('pointermove')?.({ id: 1, x: 140, y: 150 } as Phaser.Input.Pointer);
    expect(camera.scrollX).toBe(160);
    expect(camera.scrollY).toBe(150);

    handlers.get('pointermove')?.({ id: 1, x: 5000, y: 5000 } as Phaser.Input.Pointer);
    expect(camera.scrollX).toBe(0);
    expect(camera.scrollY).toBe(0);

    handlers.get('pointerup')?.({ id: 1 } as Phaser.Input.Pointer);
    expect(input.setDefaultCursor).toHaveBeenLastCalledWith('grab');

    controller.destroy();
    expect(input.off).toHaveBeenCalledTimes(4);
    expect(input.setDefaultCursor).toHaveBeenLastCalledWith('default');
  });
});

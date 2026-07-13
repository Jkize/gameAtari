import type Phaser from 'phaser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioManager } from './audio-manager';

vi.mock('phaser', () => ({
  default: {
    Math: {
      Clamp: (value: number, min: number, max: number) => Math.min(max, Math.max(min, value)),
      Distance: { Between: vi.fn() },
    },
  },
}));

describe('AudioManager settings', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('applies stored and live volume to the Phaser master sound manager', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn().mockReturnValue(JSON.stringify({ sfxVolume: 0.65 })),
      setItem: vi.fn(),
    });
    const sound = { volume: 1, play: vi.fn() };
    const scene = { sound } as unknown as Phaser.Scene;
    const manager = new AudioManager(scene);

    expect(sound.volume).toBe(0.65);

    window.dispatchEvent(
      new CustomEvent('tank-arena:settings-changed', { detail: { sfxVolume: 0.2 } }),
    );

    expect(sound.volume).toBe(0.2);
    manager.destroy();
  });

  it('resumes suspended audio from a global pointer gesture and removes its listeners', async () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn(),
    });
    const context = {
      state: 'suspended',
      suspend: vi.fn(),
      resume: vi.fn().mockImplementation(async () => {
        context.state = 'running';
      }),
    };
    const sound = { volume: 1, play: vi.fn(), context };
    const scene = { sound } as unknown as Phaser.Scene;
    const removeListener = vi.spyOn(window, 'removeEventListener');
    const manager = new AudioManager(scene);

    window.dispatchEvent(new PointerEvent('pointerdown'));
    await Promise.resolve();

    expect(context.resume).toHaveBeenCalledOnce();

    manager.destroy();
    expect(removeListener).toHaveBeenCalledWith('pointerdown', expect.any(Function), true);
    expect(removeListener).toHaveBeenCalledWith('touchend', expect.any(Function), true);
  });

  it('restarts a running context after the PWA returns from the background', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('localStorage', {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn(),
    });
    const context = {
      state: 'running',
      suspend: vi.fn().mockImplementation(async () => {
        context.state = 'suspended';
      }),
      resume: vi.fn().mockImplementation(async () => {
        context.state = 'running';
      }),
    };
    const sound = { volume: 1, play: vi.fn(), context };
    const manager = new AudioManager({ sound } as unknown as Phaser.Scene);

    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    window.dispatchEvent(new PageTransitionEvent('pageshow'));
    await vi.advanceTimersByTimeAsync(200);

    expect(context.suspend).toHaveBeenCalledOnce();
    expect(context.resume).toHaveBeenCalledOnce();
    expect(context.suspend.mock.invocationCallOrder[0]).toBeLessThan(
      context.resume.mock.invocationCallOrder[0],
    );
    manager.destroy();
  });

  it('requests playback audio session mode when Safari exposes it', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn(),
    });
    const audioSession = { type: 'ambient' };
    vi.stubGlobal('navigator', { audioSession });
    const sound = { volume: 1, play: vi.fn() };
    const manager = new AudioManager({ sound } as unknown as Phaser.Scene);

    expect(audioSession.type).toBe('playback');
    manager.destroy();
  });
});

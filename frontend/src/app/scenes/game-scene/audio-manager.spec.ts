import type Phaser from 'phaser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioManager } from './audio-manager';

vi.mock('phaser', () => ({
  default: {
    Input: {
      Events: { POINTER_DOWN: 'pointerdown' },
    },
    Math: {
      Clamp: (value: number, min: number, max: number) => Math.min(max, Math.max(min, value)),
      Distance: { Between: vi.fn() },
    },
  },
}));

describe('AudioManager settings', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('applies stored and live volume to the Phaser master sound manager', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn().mockReturnValue(JSON.stringify({ sfxVolume: 0.65 })),
      setItem: vi.fn(),
    });
    const sound = { volume: 1, play: vi.fn() };
    const input = { on: vi.fn(), off: vi.fn() };
    const scene = { sound, input } as unknown as Phaser.Scene;
    const manager = new AudioManager(scene);

    expect(sound.volume).toBe(0.65);

    window.dispatchEvent(
      new CustomEvent('tank-arena:settings-changed', { detail: { sfxVolume: 0.2 } }),
    );

    expect(sound.volume).toBe(0.2);
    manager.destroy();
  });

  it('resumes suspended audio on pointer input and removes the listener on destroy', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn(),
    });
    const resume = vi.fn().mockResolvedValue(undefined);
    const sound = { volume: 1, play: vi.fn(), context: { state: 'suspended', resume } };
    const input = { on: vi.fn(), off: vi.fn() };
    const scene = { sound, input } as unknown as Phaser.Scene;
    const manager = new AudioManager(scene);

    expect(input.on).toHaveBeenCalledWith('pointerdown', expect.any(Function));
    const resumeHandler = input.on.mock.calls[0][1] as () => void;
    resumeHandler();

    expect(resume).toHaveBeenCalledOnce();

    manager.destroy();
    expect(input.off).toHaveBeenCalledWith('pointerdown', resumeHandler);
  });
});

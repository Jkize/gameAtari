import type Phaser from 'phaser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameState } from '@game/contracts/game-state.types';
import { AudioManager } from '@game/audio/audio-manager';

vi.mock('phaser', () => ({
  default: {
    Math: {
      Clamp: (value: number, min: number, max: number) => Math.min(max, Math.max(min, value)),
      Distance: {
        Between: vi.fn((x1: number, y1: number, x2: number, y2: number) =>
          Math.hypot(x2 - x1, y2 - y1)),
      },
    },
  },
}));

describe('AudioManager settings', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('applies stored and live master volume to the Phaser sound manager', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn().mockReturnValue(JSON.stringify({ masterVolume: 0.65 })),
      setItem: vi.fn(),
    });
    const sound = { volume: 1, play: vi.fn() };
    const scene = { sound } as unknown as Phaser.Scene;
    const manager = new AudioManager(scene);

    expect(sound.volume).toBe(0.65);

    window.dispatchEvent(
      new CustomEvent('tank-arena:settings-changed', {
        detail: {
          masterVolume: 0.2,
          sfxVolume: 0.8,
          ambienceVolume: 0.7,
          musicVolume: 0.5,
        },
      }),
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

  it('starts one battle loop, changes once for danger, and plays one victory stinger', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn(),
    });
    window.sessionStorage.clear();

    const created: Array<{ key: string; sound: ReturnType<typeof createManagedSound> }> = [];
    const sound = {
      volume: 1,
      play: vi.fn(),
      add: vi.fn((key: string, config: { volume?: number }) => {
        const managed = createManagedSound(config.volume ?? 1);
        created.push({ key, sound: managed });
        return managed;
      }),
    };
    const tweens = {
      killTweensOf: vi.fn(),
      add: vi.fn((config: { targets: { volume: number }; volume: number }) => {
        config.targets.volume = config.volume;
        return config;
      }),
    };
    const scene = {
      sound,
      tweens,
      cache: { audio: { exists: vi.fn().mockReturnValue(true) } },
    } as unknown as Phaser.Scene;
    const manager = new AudioManager(scene);
    const playing = createGameState('playing');

    manager.syncMatchAudio(playing, 'me', false);
    manager.syncMatchAudio(playing, 'me', false);

    expect(created.map(item => item.key)).toEqual(['arena-ambience', 'music-battle-one']);

    const danger = createGameState('playing');
    danger.dangerZone = {
      phase: 'warning',
      centerX: 0,
      centerY: 0,
      radius: 100,
      warningStartsAt: 0,
      damageStartsAt: 1,
    };
    manager.syncMatchAudio(danger, 'me', false);
    manager.syncMatchAudio(danger, 'me', false);

    expect(created.map(item => item.key)).toEqual([
      'arena-ambience',
      'music-battle-one',
      'music-danger-zone',
    ]);

    const finished = createGameState('finished');
    manager.syncMatchAudio(finished, 'me', false);
    manager.syncMatchAudio(finished, 'me', false);

    expect(sound.play).toHaveBeenCalledOnce();
    expect(sound.play).toHaveBeenCalledWith('result-victory-first', { volume: 0.1 });
    manager.destroy();
    expect(tweens.killTweensOf).toHaveBeenCalledWith(created[0].sound);
    expect(tweens.killTweensOf).toHaveBeenCalledWith(created[2].sound);
  });

  it('alternates the selected battle track across matches in the same session', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn(),
    });
    window.sessionStorage.setItem('tank-arena:last-battle-track', 'music-battle-one');

    const addedKeys: string[] = [];
    const scene = {
      sound: {
        volume: 1,
        play: vi.fn(),
        add: vi.fn((key: string, config: { volume?: number }) => {
          addedKeys.push(key);
          return createManagedSound(config.volume ?? 1);
        }),
      },
      tweens: {
        killTweensOf: vi.fn(),
        add: vi.fn((config: { targets: { volume: number }; volume: number }) => {
          config.targets.volume = config.volume;
          return config;
        }),
      },
      cache: { audio: { exists: vi.fn().mockReturnValue(true) } },
    } as unknown as Phaser.Scene;
    const manager = new AudioManager(scene);

    manager.syncMatchAudio(createGameState('playing'), 'me', false);

    expect(addedKeys).toEqual(['arena-ambience', 'music-battle-two']);
    manager.destroy();
  });

  it('keeps one shield loop active and stops it when shielding ends', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn(),
    });
    const managed = createManagedSound(0);
    const sound = {
      volume: 1,
      play: vi.fn(),
      add: vi.fn().mockReturnValue(managed),
    };
    const scene = {
      sound,
      tweens: { killTweensOf: vi.fn() },
      cache: { audio: { exists: vi.fn().mockReturnValue(true) } },
    } as unknown as Phaser.Scene;
    const manager = new AudioManager(scene);
    const player = { id: 'me', x: 10, y: 20, alive: true, shielding: true };

    manager.syncShieldLoops([player] as never, player, 'me');
    manager.syncShieldLoops([player] as never, player, 'me');

    expect(sound.add).toHaveBeenCalledOnce();
    expect(sound.add).toHaveBeenCalledWith('shield-launching', {
      loop: true,
      volume: expect.any(Number),
    });
    expect(sound.add.mock.calls[0][1].volume).toBeGreaterThan(0);
    expect(managed.play).toHaveBeenCalledOnce();

    manager.syncShieldLoops([{ ...player, shielding: false }] as never, player, 'me');

    expect(managed.stop).toHaveBeenCalledOnce();
    expect(managed.destroy).toHaveBeenCalledOnce();
    manager.destroy();
  });

  it('maps an authoritative shield impact to shield-hit', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn(),
    });
    const sound = { volume: 1, play: vi.fn() };
    const scene = {
      sound,
      time: { now: 1_000 },
      cache: { audio: { exists: vi.fn().mockReturnValue(true) } },
    } as unknown as Phaser.Scene;
    const manager = new AudioManager(scene);

    manager.playBulletImpact('shield', { x: 10, y: 10 }, { x: 10, y: 10 });

    expect(sound.play).toHaveBeenCalledWith('shield-hit', { volume: expect.any(Number) });
    expect(sound.play.mock.calls[0][1].volume).toBeGreaterThan(0);
    manager.destroy();
  });
});

function createManagedSound(volume: number) {
  return {
    volume,
    isPlaying: false,
    play: vi.fn(function (this: { isPlaying: boolean }) {
      this.isPlaying = true;
      return true;
    }),
    stop: vi.fn(function (this: { isPlaying: boolean }) {
      this.isPlaying = false;
    }),
    destroy: vi.fn(),
  };
}

function createGameState(status: GameState['status']): GameState {
  return {
    status,
    players: [{ id: 'me', alive: true } as GameState['players'][number]],
    bullets: [],
    powerUps: [],
    impactEvents: [],
    map: { width: 100, height: 100, obstacles: [], powerUps: [] },
  };
}

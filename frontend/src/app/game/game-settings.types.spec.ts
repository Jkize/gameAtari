import { describe, expect, it } from 'vitest';
import { DEFAULT_GAME_SETTINGS, normalizeGameSettings } from './game-settings.types';

describe('normalizeGameSettings', () => {
  it('migrates the previous sfx-only shape with the new category defaults', () => {
    expect(normalizeGameSettings({ sfxVolume: 0.35 })).toEqual({
      masterVolume: 1,
      sfxVolume: 0.35,
      ambienceVolume: 0.7,
      musicVolume: 0.5,
    });
  });

  it('clamps every volume independently', () => {
    expect(normalizeGameSettings({
      masterVolume: 2,
      sfxVolume: -1,
      ambienceVolume: Number.NaN,
      musicVolume: 0.25,
    })).toEqual({
      masterVolume: 1,
      sfxVolume: 0,
      ambienceVolume: DEFAULT_GAME_SETTINGS.ambienceVolume,
      musicVolume: 0.25,
    });
  });
});

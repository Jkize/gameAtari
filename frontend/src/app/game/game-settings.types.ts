export interface GameSettings {
  masterVolume: number;
  sfxVolume: number;
  ambienceVolume: number;
  musicVolume: number;
}

export type VolumeSettingKey = keyof GameSettings;

export const SETTINGS_KEY = 'settings';
export const SETTINGS_STORAGE_KEY = 'tank-arena:settings';
export const DEFAULT_GAME_SETTINGS: GameSettings = {
  masterVolume: 1,
  sfxVolume: 0.8,
  ambienceVolume: 0.7,
  musicVolume: 0.5,
};

export type GameSettingsChangedEvent = CustomEvent<GameSettings>;

export function normalizeGameSettings(value: unknown): GameSettings {
  if (!value || typeof value !== 'object') return { ...DEFAULT_GAME_SETTINGS };
  const data = value as Partial<Record<keyof GameSettings, unknown>>;

  return {
    masterVolume: normalizeVolume(data.masterVolume, DEFAULT_GAME_SETTINGS.masterVolume),
    sfxVolume: normalizeVolume(data.sfxVolume, DEFAULT_GAME_SETTINGS.sfxVolume),
    ambienceVolume: normalizeVolume(data.ambienceVolume, DEFAULT_GAME_SETTINGS.ambienceVolume),
    musicVolume: normalizeVolume(data.musicVolume, DEFAULT_GAME_SETTINGS.musicVolume),
  };
}

export function readStoredGameSettings(): GameSettings {
  try {
    return normalizeGameSettings(JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? 'null'));
  } catch {
    return { ...DEFAULT_GAME_SETTINGS };
  }
}

export function clampVolume(value: number, fallback = DEFAULT_GAME_SETTINGS.sfxVolume): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

function normalizeVolume(value: unknown, fallback: number): number {
  return typeof value === 'number' ? clampVolume(value, fallback) : fallback;
}

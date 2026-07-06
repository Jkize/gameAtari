export interface GameSettings {
  sfxVolume: number;
}

export const SETTINGS_KEY = 'settings';
export const SETTINGS_STORAGE_KEY = 'tank-arena:settings';
export const DEFAULT_GAME_SETTINGS: GameSettings = {
  sfxVolume: 0.8,
};

export type GameSettingsChangedEvent = CustomEvent<GameSettings>;

export function normalizeGameSettings(value: unknown): GameSettings {
  if (!value || typeof value !== 'object') return { ...DEFAULT_GAME_SETTINGS };
  const data = value as Partial<Record<keyof GameSettings, unknown>>;
  const sfxVolume = typeof data.sfxVolume === 'number'
    ? data.sfxVolume
    : DEFAULT_GAME_SETTINGS.sfxVolume;

  return {
    sfxVolume: clampVolume(sfxVolume),
  };
}

export function readStoredGameSettings(): GameSettings {
  try {
    return normalizeGameSettings(JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? 'null'));
  } catch {
    return { ...DEFAULT_GAME_SETTINGS };
  }
}

export function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_GAME_SETTINGS.sfxVolume;
  return Math.min(1, Math.max(0, value));
}

export interface RoomWaitingConfig {
  minPlayers: number;
  countdownSeconds: number;
}

export const PROD_MIN_PLAYERS = 2;
export const MAX_PLAYERS = 16;

export const COUNTDOWN_TIERS = [
  { minPlayers: 15, seconds: 10 },
  { minPlayers: 8, seconds: 20 },
  { minPlayers: 4, seconds: 40 },
] as const;

export const RECONNECT_GRACE_MS = process.env.NODE_ENV === 'production'
  ? 60_000
  : 15_000;

export const ROUND_RESET_MS = 5_000;

export const DEV_ROOM_SETTINGS: RoomWaitingConfig = {
  minPlayers: 1,
  countdownSeconds: 3,
};

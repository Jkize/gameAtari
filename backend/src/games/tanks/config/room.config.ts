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

export const RECONNECT_GRACE_MS = 60_000;

export const ROUND_RESET_MS = 5_000;

export const PRIVATE_ROOM_INACTIVITY_MS = 4 * 60_000;
export const PRIVATE_ROOM_CLOSING_WARNING_MS = 45_000;
export const PRIVATE_ROOM_COUNTDOWN_SECONDS = 8;
export const PRIVATE_ROOM_NAME_MIN_LENGTH = 3;
export const PRIVATE_ROOM_NAME_MAX_LENGTH = 40;
export const PRIVATE_ROOM_PASSWORD_MIN_LENGTH = 4;
export const PRIVATE_ROOM_PASSWORD_MAX_LENGTH = 32;

export const DEV_ROOM_SETTINGS: RoomWaitingConfig = {
  minPlayers: 1,
  countdownSeconds: 3,
};

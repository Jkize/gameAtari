import { PowerUpType } from '../types/power-up.types';

export const POWER_UP_DEFINITIONS = {
  triple_shot: { name: 'TRIPLE SHOT', durationMs: 12_000 },
  shotgun: { name: 'SHOTGUN', durationMs: 12_000 },
  grenade: { name: 'GRENADE SHOT', durationMs: 8_000 },
  laser: { name: 'LASER READY', durationMs: undefined },
} as const satisfies Partial<Record<PowerUpType, { name: string; durationMs?: number }>>;

export const FIRST_POWER_UP_SPAWN_DELAY_MS = 3_000;
export const POWER_UP_SPAWN_INTERVAL_MS = 15_000;
export const MAX_POWER_UP_SPAWN_ATTEMPTS = 30;
export const MIN_POWER_UP_DISTANCE_FROM_PLAYER = 180;
export const MIN_DISTANCE_BETWEEN_POWER_UPS = 250;
export const MIN_POWER_UP_DISTANCE_FROM_SPAWN_POINT = 180;
export const POWER_UP_PICKUP_RADIUS = 45;
export const POWER_UP_RADIUS = 18;

export const MAX_ACTIVE_POWER_UPS_BY_PLAYER_TIER = {
  4: 3,
  8: 4,
  16: 5,
} as const;

export const POWER_UP_ASSET_ID: Record<PowerUpType, string> = {
  triple_shot: 'power_triple_shot',
  shotgun: 'power_shotgun',
  grenade: 'power_grenade',
  laser: 'power_laser',
};

export const POWER_UP_WEIGHTS: ReadonlyArray<{ type: PowerUpType; weight: number }> = [
  { type: 'triple_shot', weight: 35 },
  { type: 'shotgun', weight: 30 },
  { type: 'grenade', weight: 25 },
  { type: 'laser', weight: 10 },
];

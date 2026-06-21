import { PowerUpType } from '../types/power-up.types';
import { WeaponStats } from '../types/weapon.types';

export const DEFAULT_WEAPON_STATS: WeaponStats = {
  magazineSize: 6,
  fireCooldownMs: 300,
  reloadDurationMs: 1400,
  maxActiveBullets: 5,
  bulletSpeed: 600,
  bulletDamage: 20,
  bulletRadius: 4,
  bulletLifetimeMs: 3000,
};

export const POWER_UP_DEFINITIONS = {
  triple_shot: { name: 'TRIPLE SHOT', durationMs: 12_000 },
  shotgun: { name: 'SHOTGUN', durationMs: 12_000 },
  grenade: { name: 'GRENADE SHOT', durationMs: 8_000 },
  laser: { name: 'LASER READY', durationMs: undefined },
} as const satisfies Partial<Record<PowerUpType, { name: string; durationMs?: number }>>;

export const TRIPLE_SHOT_CONFIG = {
  spreadAngles: [-0.16, 0, 0.16],
  stats: {
    magazineSize: 6,
    fireCooldownMs: 360,
    maxActiveBullets: 9,
  },
} as const;

export const SHOTGUN_CONFIG = {
  spreadAngles: [-0.36, -0.18, 0, 0.18, 0.36],
  maxDistance: 700,
  projectileStats: {
    bulletDamage: 18,
    bulletRadius: 3,
    bulletSpeed: 700,
    bulletLifetimeMs: 850,
  },
  stats: {
    magazineSize: 4,
    fireCooldownMs: 620,
    reloadDurationMs: 1500,
    maxActiveBullets: 10,
  },
} as const;

export const GRENADE_CONFIG = {
  maxDistance: undefined,
  explosionRadius: 100,
  obstacleDamage: 68,
  projectileStats: {
    bulletSpeed: 420,
    bulletDamage: 42,
    bulletRadius: 8,
    bulletLifetimeMs: 1700,
  },
  stats: {
    magazineSize: 3,
    fireCooldownMs: 850,
    reloadDurationMs: 1700,
    maxActiveBullets: 3,
  },
} as const;

export const LASER_CONFIG = {
  shots: 2,
  durationMs: 2000,
  maxDistance: 1200,
  turnRateRadPerSecond: 2.4,
  recoilSpeedMultiplier: 1.85,
  metalPierces: 2,
  damagePerSecond: 120,
  projectileStats: {
    bulletSpeed: 0,
    bulletDamage: 120,
    bulletRadius: 7,
    bulletLifetimeMs: 2000,
  },
  stats: {
    magazineSize: 2,
    fireCooldownMs: 1050,
    reloadDurationMs: 0,
    maxActiveBullets: 1,
  },
} as const;

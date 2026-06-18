export interface WeaponStats {
  magazineSize: number;
  fireCooldownMs: number;
  reloadDurationMs: number;
  maxActiveBullets: number;
  bulletSpeed: number;
  bulletDamage: number;
  bulletRadius: number;
  bulletLifetimeMs: number;
}

export interface WeaponState {
  ammo: number;
  lastFiredAt: number;
  reloadsAt: number;
}

export type WeaponStatKey = keyof WeaponStats;
export type ModifierOperation = 'add' | 'multiply' | 'set';
export type ModifierSource = 'powerup' | 'weapon' | 'status';

export interface WeaponStatModifier {
  id: string;
  source: ModifierSource;
  stat: WeaponStatKey;
  operation: ModifierOperation;
  value: number;
  expiresAt?: number;
}

export interface PlayerWeapon {
  baseStats: WeaponStats;
  state: WeaponState;
  modifiers: WeaponStatModifier[];
}

export interface WeaponPublicState {
  ammo: number;
  magazineSize: number;
  reloadMs: number;
  fireCooldownMs: number;
}

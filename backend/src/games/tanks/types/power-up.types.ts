import { WeaponStatModifier } from './weapon.types';

export type PowerUpType = 'triple_shot' | 'shotgun' | 'grenade' | 'laser';
export type PowerUpTarget = 'weapon' | 'player';
export type PlayerStatKey = 'speed' | 'maxHp' | 'dashCooldown';

export interface PlayerStatModifier {
  id: string;
  stat: PlayerStatKey;
  operation: 'add' | 'multiply' | 'set';
  value: number;
  expiresAt?: number;
}

export interface PowerUpDefinition {
  id: PowerUpType;
  name: string;
  target: PowerUpTarget;
  durationMs?: number;
  weaponModifiers?: WeaponStatModifier[];
  playerModifiers?: PlayerStatModifier[];
}

export interface ActivePowerUp {
  type: PowerUpType;
  name: string;
  expiresAt?: number;
  shotsRemaining?: number;
  chargeStartedAt?: number;
}

export interface PowerUpSpawn {
  id: string;
  type: PowerUpType;
  assetId: string;
  x: number;
  y: number;
  radius: number;
}

export interface ActivePowerUpPublicState {
  type: PowerUpType;
  name: string;
  remainingMs?: number;
  shotsRemaining?: number;
  chargeMs?: number;
}

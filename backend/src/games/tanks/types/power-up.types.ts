import { WeaponStatModifier } from './weapon.types';

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
  id: string;
  name: string;
  target: PowerUpTarget;
  durationMs?: number;
  weaponModifiers?: WeaponStatModifier[];
  playerModifiers?: PlayerStatModifier[];
}

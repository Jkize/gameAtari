import { ActivePowerUp, ActivePowerUpPublicState } from './power-up.types';
import { PlayerWeapon, WeaponPublicState } from './weapon.types';

export interface PlayerInput {
  moveX: number;
  moveY: number;
  aimAngle: number;
  shoot: boolean;
  dash: boolean;
  reload: boolean;
  shield: boolean;
}

export interface Player {
  id: string;
  username?: string;
  x: number;
  y: number;
  radius: number;
  speed: number;
  hp: number;
  maxHp: number;
  bodyAngle: number;
  aimAngle: number;
  color: number;
  input: PlayerInput;
  weapon: PlayerWeapon;
  activePowerUp?: ActivePowerUp;
  lastDashAt: number;
  dashUntil: number;
  dashCooldown: number;
  shieldHp: number;
  shieldUntil: number;
  lastShieldAt: number;
  lastCombatAt: number;
  healthRegenCarry: number;
  alive: boolean;
  destroyedAt?: number;
  disconnectedAt?: number;
}

export interface PlayerPublicState {
  id: string;
  username?: string;
  x: number;
  y: number;
  radius: number;
  hp: number;
  maxHp: number;
  bodyAngle: number;
  aimAngle: number;
  color: number;
  dashCooldownMs: number;
  weapon: WeaponPublicState;
  activePowerUp?: ActivePowerUpPublicState;
  dashing: boolean;
  alive: boolean;
  destroyedBodyAlpha?: number;
  shielding: boolean;
  shieldHp: number;
  shieldMaxHp: number;
  shieldCooldownMs: number;
  shieldRemainingMs: number;
}

import { ActivePowerUp, ActivePowerUpPublicState } from './power-up.types';
import { PlayerWeapon, WeaponPublicState } from './weapon.types';

export interface PlayerInput {
  moveX: number;
  moveY: number;
  aimAngle: number;
  shoot: boolean;
  dash: boolean;
  reload: boolean;
}

export interface Player {
  id: string;
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
  alive: boolean;
  destroyedAt?: number;
}

export interface PlayerPublicState {
  id: string;
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
}

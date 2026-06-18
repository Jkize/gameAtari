import { PlayerWeapon, WeaponPublicState } from './weapon.types';

export interface PlayerInput {
  moveX: number;
  moveY: number;
  aimAngle: number;
  shoot: boolean;
  dash: boolean;
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
  lastDashAt: number;
  dashUntil: number;
  dashCooldown: number;
  alive: boolean;
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
  dashing: boolean;
  alive: boolean;
}

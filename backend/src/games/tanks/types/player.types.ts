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
  aimAngle: number;
  input: PlayerInput;
  lastShotAt: number;
  shotCooldown: number;
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
  aimAngle: number;
  dashCooldownMs: number;
  dashing: boolean;
  alive: boolean;
}

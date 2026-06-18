export type PowerUpType = 'triple_shot' | 'shotgun' | 'grenade' | 'laser';
export type ObstacleType = 'bush' | 'wood' | 'rock' | 'steel' | 'mirror';
export type ObstacleAssetId =
  | 'bush_01'
  | 'wood_barricade_01'
  | 'rock_block_01'
  | 'steel_block_01'
  | 'mirror_panel_01';
export type GameStatus  = 'waiting' | 'playing' | 'finished';

export interface Obstacle {
  id: string;
  type: ObstacleType;
  assetId?: ObstacleAssetId;
  // Center position. Keep this aligned with backend collision bounds.
  x: number;
  y: number;
  width: number;
  height: number;
  hp: number;
  destructible: boolean;
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
}

export interface ActivePowerUpPublicState {
  type: PowerUpType;
  name: string;
  remainingMs?: number;
  shotsRemaining?: number;
  chargeMs?: number;
}

export interface WeaponPublicState {
  ammo: number;
  magazineSize: number;
  reloadMs: number;
  fireCooldownMs: number;
}

export interface BulletPublicState {
  id: string;
  ownerId: string;
  kind?: string;
  x: number;
  y: number;
  endX?: number;
  endY?: number;
  bendX?: number;
  bendY?: number;
  radius: number;
  explosionRadius?: number;
  pierceMetalRemaining?: number;
}

export interface PowerUpSpawn {
  id: string;
  type: PowerUpType;
  assetId: string;
  x: number;
  y: number;
  radius: number;
}

export interface GameMap {
  width: number;
  height: number;
  obstacles: Obstacle[];
  powerUps: PowerUpSpawn[];
}

export interface GameState {
  status: GameStatus;
  map: GameMap;
  players: PlayerPublicState[];
  bullets: BulletPublicState[];
}

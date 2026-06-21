export type PowerUpType = 'triple_shot' | 'shotgun' | 'grenade' | 'laser';
export type ObstacleType = 'bush' | 'decoration' | 'wood' | 'rock' | 'steel' | 'mirror';
export type ObstacleAssetId =
  | 'bush_01_rounded_dense'
  | 'bush_02_irregular_leafy'
  | 'bush_03_compact_arcade'
  | 'bush_04_wide_low'
  | 'decoration_01_spiky_organic'
  | 'decoration_02_two_lobed'
  | 'decoration_03_pink_yellow_flowers'
  | 'decoration_04_grass_blue_flowers'
  | 'decoration_05_wild_red_flowers'
  | 'decoration_06_sharp_grass_pink_yellow'
  | 'decoration_07_leafy_blue_flower'
  | 'decoration_08_tall_grass_wildflowers'
  | 'decoration_09_cactus_flowers'
  | 'decoration_10_reed_patch_orange'
  | 'decoration_11_fern_star'
  | 'decoration_12_clover_patch'
  | 'decoration_13_dry_grass_mix'
  | 'decoration_14_vine_swirl'
  | 'wood_barricade'
  | 'rock_block'
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
  maxHp: number;
  healthRatio: number;
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
  reflectCount?: number;
  reflectX?: number;
  reflectY?: number;
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

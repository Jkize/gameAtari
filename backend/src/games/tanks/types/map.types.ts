import { PowerUpSpawn } from './power-up.types';

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

export interface Obstacle {
  id: string;
  type: ObstacleType;
  assetId?: ObstacleAssetId;
  // Center position. The frontend renders obstacles from x/y minus half size.
  x: number;
  y: number;
  width: number;
  height: number;
  hp: number;
  maxHp: number;
  healthRatio: number;
  destructible: boolean;
}

export interface SpawnPoint {
  x: number;
  y: number;
}

export interface GameMap {
  name?: string;
  width: number;
  height: number;
  spawnPoints?: SpawnPoint[];
  obstacles: Obstacle[];
  powerUps: PowerUpSpawn[];
}

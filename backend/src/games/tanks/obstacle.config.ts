import { Obstacle, ObstacleType } from './types/map.types';

export const DEFAULT_OBSTACLE_SIZE = 64;

export interface ObstacleDefinition {
  hp: number;
  destructible: boolean;
  assetId: Obstacle['assetId'];
}

export const BUSH_OBSTACLE_ASSET_IDS = [
  'bush_01_rounded_dense',
  'bush_02_irregular_leafy',
  'bush_03_compact_arcade',
  'bush_04_wide_low',
] as const satisfies readonly Obstacle['assetId'][];

export const DECORATION_OBSTACLE_ASSET_IDS = [
  'decoration_01_spiky_organic',
  'decoration_02_two_lobed',
  'decoration_03_pink_yellow_flowers',
  'decoration_04_grass_blue_flowers',
  'decoration_05_wild_red_flowers',
  'decoration_06_sharp_grass_pink_yellow',
  'decoration_07_leafy_blue_flower',
  'decoration_08_tall_grass_wildflowers',
  'decoration_09_cactus_flowers',
  'decoration_10_reed_patch_orange',
  'decoration_11_fern_star',
  'decoration_12_clover_patch',
  'decoration_13_dry_grass_mix',
  'decoration_14_vine_swirl',
] as const satisfies readonly Obstacle['assetId'][];

export const OBSTACLE_DEFINITIONS = {
  bush: {
    hp: 34,
    destructible: true,
    assetId: 'bush_01_rounded_dense',
  },
  decoration: {
    hp: 9999,
    destructible: false,
    assetId: 'decoration_01_spiky_organic',
  },
  wood: {
    hp: 68,
    destructible: true,
    assetId: 'wood_barricade_01',
  },
  rock: {
    hp: 102,
    destructible: true,
    assetId: 'rock_block',
  },
  steel: {
    hp: 9999,
    destructible: false,
    assetId: 'steel_block_01',
  },
  mirror: {
    hp: 9999,
    destructible: false,
    assetId: 'mirror_panel_01',
  },
} as const satisfies Record<ObstacleType, ObstacleDefinition>;

export function getObstacleHealthRatio(obstacle: Pick<Obstacle, 'hp' | 'maxHp'>): number {
  if (obstacle.maxHp <= 0) return 0;
  return Math.max(0, Math.min(1, obstacle.hp / obstacle.maxHp));
}

export function applyObstacleDamage(obstacle: Obstacle, damage: number): void {
  obstacle.hp = Math.max(0, obstacle.hp - damage);
  obstacle.healthRatio = getObstacleHealthRatio(obstacle);
}

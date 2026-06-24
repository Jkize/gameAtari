import { ObstacleAssetId, ObstacleType } from '../types/game-state.types';

export type AssetCategory = 'Bushes' | 'Decorations' | 'Structures';

export interface ObstacleCatalogItem {
  name: string;
  category: AssetCategory;
  type: ObstacleType;
  assetId: ObstacleAssetId;
  previewPath: string;
  defaultWidth: number;
  defaultHeight: number;
  minWidth: number;
  minHeight: number;
}

const bush = (assetId: ObstacleAssetId, name: string): ObstacleCatalogItem => ({
  name,
  category: 'Bushes',
  type: 'bush',
  assetId,
  previewPath: `assets/obstacle/bush/${assetId}.svg`,
  defaultWidth: 64,
  defaultHeight: 64,
  minWidth: 16,
  minHeight: 16,
});

const decoration = (assetId: ObstacleAssetId, name: string): ObstacleCatalogItem => ({
  name,
  category: 'Decorations',
  type: 'decoration',
  assetId,
  previewPath: `assets/obstacle/decoration/${assetId}.svg`,
  defaultWidth: 64,
  defaultHeight: 64,
  minWidth: 12,
  minHeight: 12,
});

export const OBSTACLE_CATALOG: readonly ObstacleCatalogItem[] = [
  bush('bush_01_rounded_dense', 'Rounded Dense'),
  bush('bush_02_irregular_leafy', 'Irregular Leafy'),
  bush('bush_03_compact_arcade', 'Compact Arcade'),
  bush('bush_04_wide_low', 'Wide Low'),
  decoration('decoration_01_spiky_organic', 'Spiky Organic'),
  decoration('decoration_02_two_lobed', 'Two Lobed'),
  decoration('decoration_03_pink_yellow_flowers', 'Pink & Yellow Flowers'),
  decoration('decoration_04_grass_blue_flowers', 'Grass & Blue Flowers'),
  decoration('decoration_05_wild_red_flowers', 'Wild Red Flowers'),
  decoration('decoration_06_sharp_grass_pink_yellow', 'Sharp Grass'),
  decoration('decoration_07_leafy_blue_flower', 'Leafy Blue Flower'),
  decoration('decoration_08_tall_grass_wildflowers', 'Tall Wildflowers'),
  decoration('decoration_09_cactus_flowers', 'Cactus Flowers'),
  decoration('decoration_10_reed_patch_orange', 'Orange Reeds'),
  decoration('decoration_11_fern_star', 'Fern Star'),
  decoration('decoration_12_clover_patch', 'Clover Patch'),
  decoration('decoration_13_dry_grass_mix', 'Dry Grass Mix'),
  decoration('decoration_14_vine_swirl', 'Vine Swirl'),
  {
    name: 'Wood Barricade',
    category: 'Structures',
    type: 'wood',
    assetId: 'wood_barricade',
    previewPath: 'assets/obstacle/wood_barricade_1.svg',
    defaultWidth: 96,
    defaultHeight: 48,
    minWidth: 16,
    minHeight: 16,
  },
  {
    name: 'Rock Block',
    category: 'Structures',
    type: 'rock',
    assetId: 'rock_block',
    previewPath: 'assets/obstacle/rock_block_1.svg',
    defaultWidth: 64,
    defaultHeight: 64,
    minWidth: 16,
    minHeight: 16,
  },
  {
    name: 'Steel Block',
    category: 'Structures',
    type: 'steel',
    assetId: 'steel_block_01',
    previewPath: 'assets/obstacle/steel_block_01.png',
    defaultWidth: 64,
    defaultHeight: 64,
    minWidth: 16,
    minHeight: 16,
  },
  {
    name: 'Mirror Panel',
    category: 'Structures',
    type: 'mirror',
    assetId: 'mirror_panel_01',
    previewPath: 'assets/obstacle/mirror_panel_01.png',
    defaultWidth: 140,
    defaultHeight: 18,
    minWidth: 12,
    minHeight: 12,
  },
];

export const CATALOG_BY_ASSET = new Map(OBSTACLE_CATALOG.map(item => [item.assetId, item]));
export const SUPPORTED_ASSET_IDS = new Set(OBSTACLE_CATALOG.map(item => item.assetId));

import { PowerUpSpawn } from './power-up.types';

export type ObstacleType = 'bush' | 'wood' | 'rock' | 'steel' | 'mirror';
export type ObstacleAssetId =
  | 'bush_01'
  | 'wood_barricade_01'
  | 'rock_block_01'
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
  destructible: boolean;
}

export interface GameMap {
  width: number;
  height: number;
  obstacles: Obstacle[];
  powerUps: PowerUpSpawn[];
}

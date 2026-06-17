export type ObstacleType = 'bush' | 'wood' | 'rock' | 'steel' | 'mirror';

export interface Obstacle {
  id: string;
  type: ObstacleType;
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
}

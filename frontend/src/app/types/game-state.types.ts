export type ObstacleType = 'bush' | 'wood' | 'rock' | 'steel' | 'mirror';
export type GameStatus  = 'waiting' | 'playing' | 'finished';

export interface Obstacle {
  id: string;
  type: ObstacleType;
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
  aimAngle: number;
  dashCooldownMs: number;
  dashing: boolean;
  alive: boolean;
}

export interface BulletPublicState {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  radius: number;
}

export interface GameMap {
  width: number;
  height: number;
  obstacles: Obstacle[];
}

export interface GameState {
  status: GameStatus;
  map: GameMap;
  players: PlayerPublicState[];
  bullets: BulletPublicState[];
}

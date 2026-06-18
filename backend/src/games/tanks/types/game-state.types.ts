import { GameMap } from './map.types';
import { PlayerPublicState } from './player.types';

export type GameStatus = 'waiting' | 'playing' | 'finished';

export interface BulletPublicState {
  id: string;
  ownerId: string;
  kind?: string;
  x: number;
  y: number;
  radius: number;
  explosionRadius?: number;
}

export interface GameState {
  status: GameStatus;
  map: GameMap;
  players: PlayerPublicState[];
  bullets: BulletPublicState[];
}

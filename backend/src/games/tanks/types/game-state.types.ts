import { GameMap } from './map.types';
import { PlayerPublicState } from './player.types';

export type GameStatus = 'waiting' | 'playing' | 'finished';
export type BulletImpactMaterial = 'spark' | 'wood' | 'rock' | 'steel' | 'mirror';

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

export interface BulletImpactPublicState {
  id: string;
  bulletId: string;
  material: BulletImpactMaterial;
  x: number;
  y: number;
}

export interface GameState {
  status: GameStatus;
  map: GameMap;
  players: PlayerPublicState[];
  bullets: BulletPublicState[];
  impactEvents: BulletImpactPublicState[];
}

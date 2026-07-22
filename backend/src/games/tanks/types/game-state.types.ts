import { GameMap } from './map.types';
import { PowerUpSpawn } from './power-up.types';
import { PlayerPublicState } from './player.types';
import type { DangerZonePublicState } from '../danger-zone.service';
import { EBulletKind } from './bullet.types';

export type GameStatus = 'waiting' | 'playing' | 'finished';
export type BulletImpactMaterial = 'spark' | 'wood' | 'rock' | 'steel' | 'mirror' | 'shield';

export interface BulletPublicState {
  id: string;
  ownerId: string;
  kind: EBulletKind;
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
  players: PlayerPublicState[];
  bullets: BulletPublicState[];
  powerUps: PowerUpSpawn[];
  impactEvents: BulletImpactPublicState[];
  dangerZone?: DangerZonePublicState;
}

export interface InitialGameState {
  map: GameMap;
  state: GameState;
}

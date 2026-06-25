import { Bullet } from '../types/bullet.types';
import { BulletImpactPublicState, GameStatus } from '../types/game-state.types';
import { GameMap } from '../types/map.types';
import { Player } from '../types/player.types';

export interface PlayerMatchStats {
  kills: number;
  deaths: number;
  damageDealt: number;
  damageTaken: number;
}

export interface GameRuntimeState {
  roomId: string;
  players: Map<string, Player>;
  bullets: Bullet[];
  impactEvents: BulletImpactPublicState[];
  map: GameMap | null;
  status: GameStatus;
  usedColorIndices: Set<number>;
  startedAt: Date | null;
  endedAt: Date | null;
  eliminationOrder: string[];
  stats: Map<string, PlayerMatchStats>;
  persisted: boolean;
}

import { Bullet } from '../types/bullet.types';
import { BulletImpactPublicState, GameStatus } from '../types/game-state.types';
import { GameMap } from '../types/map.types';
import { Player } from '../types/player.types';
import type { DangerZoneRuntimeState } from '../danger-zone.service';
import type { PlayerEliminatedEvent, RecentExternalDamage } from '../events/elimination-event.types';

export interface PlayerMatchStats {
  kills: number;
  deaths: number;
  damageDealt: number;
  damageTaken: number;
}

export interface GameRuntimeState {
  roomId: string;
  rewardsEligible: boolean;
  players: Map<string, Player>;
  bullets: Bullet[];
  impactEvents: BulletImpactPublicState[];
  eliminationEvents: PlayerEliminatedEvent[];
  recentExternalDamage: Map<string, RecentExternalDamage>;
  map: GameMap | null;
  status: GameStatus;
  usedColorIndices: Set<number>;
  startedAt: Date | null;
  endedAt: Date | null;
  dangerZone: DangerZoneRuntimeState | null;
  eliminationOrder: string[];
  stats: Map<string, PlayerMatchStats>;
  persisted: boolean;
}

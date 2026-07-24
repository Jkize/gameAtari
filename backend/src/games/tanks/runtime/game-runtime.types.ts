import { Bullet } from '../types/bullet.types';
import { BulletImpactPublicState, GameStatus } from '../types/game-state.types';
import { GameMap } from '../types/map.types';
import { Player } from '../types/player.types';
import type { DangerZoneRuntimeState } from '../danger-zone.service';
import type { PlayerEliminatedEvent, RecentExternalDamage } from '../events/elimination-event.types';
import type { TankCustomization } from '../../../tank-customization/tank-customization.types';

export interface PlayerMatchStats {
  kills: number;
  deaths: number;
  damageDealt: number;
  damageTaken: number;
}

export interface GameRuntimeState {
  roundId: string;
  roomId: string;
  roomName: string;
  roomType: 'public' | 'private';
  rewardsEligible: boolean;
  rewardPlayerCount: number;
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
  tankCustomizations: Record<string, TankCustomization>;
}

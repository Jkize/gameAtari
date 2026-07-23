import type { PowerUpType } from '@game/contracts/game-state.types';

export type AttackWeapon = 'standard' | PowerUpType;
export type EliminationCause = 'projectile' | 'reflected_projectile' | 'danger_zone';
export type EliminationAttribution = 'direct' | 'recent_damage' | 'self' | 'environment';

export interface PlayerEliminatedEvent {
  id: string;
  victimId: string;
  victimName: string;
  creditedKillerId: string | null;
  creditedKillerName: string | null;
  lethalSourcePlayerId: string | null;
  cause: EliminationCause;
  weapon?: AttackWeapon;
  attribution: EliminationAttribution;
  selfInflicted: boolean;
  occurredAt: number;
}

export interface ViewerCountChangedEvent {
  roomId: string;
  count: number;
}

import { Injectable, Logger } from '@nestjs/common';
import { GameSessionsService } from '../games/tanks/runtime/game-sessions.service';
import { RewardsService } from '../rewards/rewards.service';
import { REWARD_AMOUNTS_BY_PLACEMENT } from '../rewards/rewards.config';
import { RewardCandidate, RewardedPlacement } from '../rewards/rewards.types';
import { MatchResultsRepository } from './match-results.repository';

@Injectable()
export class MatchesService {
  private readonly logger = new Logger(MatchesService.name);

  constructor(
    private readonly sessions: GameSessionsService,
    private readonly matchResults: MatchResultsRepository,
    private readonly rewards: RewardsService,
  ) {}

  async persist(roomId: string): Promise<string | null> {
    const state = this.sessions.get(roomId);
    if (!state || state.persisted || !state.startedAt || !state.endedAt) return null;
    state.persisted = true;
    const alive = [...state.players.values()].filter(player => player.alive);
    const winnerUserId = alive.length === 1 && this.isUuid(alive[0].id) ? alive[0].id : null;
    const eliminated = [...state.eliminationOrder].reverse();
    const placement = new Map<string, number>();
    if (winnerUserId) placement.set(winnerUserId, 1);
    eliminated.forEach((userId, index) => placement.set(userId, index + (winnerUserId ? 2 : 1)));

    try {
      const players = [...state.players.keys()].map(userId => {
        const stats = state.stats.get(userId);
        const persistedUserId = this.isUuid(userId) ? userId : null;
        return {
          playerId: userId,
          userId: persistedUserId,
          placement: placement.get(userId) ?? state.players.size,
          winner: userId === alive[0]?.id,
          kills: stats?.kills ?? 0,
          deaths: stats?.deaths ?? 0,
          damageDealt: stats?.damageDealt ?? 0,
          damageTaken: stats?.damageTaken ?? 0,
        };
      });

      const matchId = await this.matchResults.persistCompleted({
        roomId,
        mapName: state.map?.name,
        winnerUserId,
        startedAt: state.startedAt,
        endedAt: state.endedAt,
        durationSeconds: Math.max(0, Math.round((state.endedAt.getTime() - state.startedAt.getTime()) / 1000)),
        players,
      });

      const rewardCandidates: RewardCandidate[] = players
        .filter(player => player.placement in REWARD_AMOUNTS_BY_PLACEMENT)
        .map(player => ({
          matchId,
          userId: player.userId,
          placement: player.placement as RewardedPlacement,
        }))
        .sort((a, b) => a.placement - b.placement);

      try {
        await this.rewards.registerMatchRewards(rewardCandidates);
      } catch (error) {
        this.logger.error(
          `Failed to register rewards for match=${matchId} room=${roomId}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
      return matchId;
    } catch (error) {
      state.persisted = false;
      throw error;
    }
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }
}

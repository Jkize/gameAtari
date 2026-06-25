import { Injectable } from '@nestjs/common';
import { MatchStatus } from '@prisma/client';
import { GameSessionsService } from '../games/tanks/runtime/game-sessions.service';
import { PrismaService } from '../prisma/prisma.service';
import { RewardsService } from '../rewards/rewards.service';

@Injectable()
export class MatchesService {
  constructor(
    private readonly sessions: GameSessionsService,
    private readonly prisma: PrismaService,
    private readonly rewards: RewardsService,
  ) {}

  async persist(roomId: string): Promise<string | null> {
    const state = this.sessions.get(roomId);
    if (!state || state.persisted || !state.startedAt || !state.endedAt) return null;
    state.persisted = true;
    const alive = [...state.players.values()].filter(player => player.alive);
    const winnerUserId = alive.length === 1 ? alive[0].id : null;
    const eliminated = [...state.eliminationOrder].reverse();
    const placement = new Map<string, number>();
    if (winnerUserId) placement.set(winnerUserId, 1);
    eliminated.forEach((userId, index) => placement.set(userId, index + (winnerUserId ? 2 : 1)));

    try {
      const match = await this.prisma.match.upsert({
        where: { roomId },
        create: {
          roomId,
          mapName: state.map?.name,
          status: MatchStatus.COMPLETED,
          winnerUserId,
          startedAt: state.startedAt,
          endedAt: state.endedAt,
          durationSeconds: Math.max(0, Math.round((state.endedAt.getTime() - state.startedAt.getTime()) / 1000)),
          players: {
            create: [...state.players.keys()].map(userId => {
              const stats = state.stats.get(userId);
              return {
                userId,
                placement: placement.get(userId) ?? state.players.size,
                winner: userId === winnerUserId,
                kills: stats?.kills ?? 0,
                deaths: stats?.deaths ?? 0,
                damageDealt: stats?.damageDealt ?? 0,
                damageTaken: stats?.damageTaken ?? 0,
              };
            }),
          },
        },
        update: {},
      });
      if (winnerUserId) await this.rewards.registerPending(match.id, winnerUserId);
      return match.id;
    } catch (error) {
      state.persisted = false;
      throw error;
    }
  }
}

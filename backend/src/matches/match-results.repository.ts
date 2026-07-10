import { Injectable } from '@nestjs/common';
import { MatchStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CompletedMatchResult } from './match-results.types';

@Injectable()
export class MatchResultsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async persistCompleted(result: CompletedMatchResult): Promise<string> {
    return this.prisma.$transaction(async tx => {
      const match = await tx.match.upsert({
        where: { roomId: result.roomId },
        create: {
          roomId: result.roomId,
          mapName: result.mapName,
          status: MatchStatus.COMPLETED,
          winnerUserId: result.winnerUserId,
          startedAt: result.startedAt,
          endedAt: result.endedAt,
          durationSeconds: result.durationSeconds,
        },
        update: {},
      });

      for (const player of result.players) {
        const where = player.userId
          ? {
              matchId_userId: {
                matchId: match.id,
                userId: player.userId,
              },
            }
          : {
              matchId_playerId: {
                matchId: match.id,
                playerId: player.playerId,
              },
            };
        await tx.matchPlayer.upsert({
          where,
          create: {
            matchId: match.id,
            playerId: player.playerId,
            userId: player.userId,
            placement: player.placement,
            winner: player.winner,
            kills: player.kills,
            deaths: player.deaths,
            damageDealt: player.damageDealt,
            damageTaken: player.damageTaken,
          },
          update: {},
        });
      }

      return match.id;
    });
  }
}

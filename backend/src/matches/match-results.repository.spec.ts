import { MatchStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MatchResultsRepository } from './match-results.repository';

describe('MatchResultsRepository', () => {
  it('persists the room reward decision on the completed match', async () => {
    const tx = {
      match: {
        upsert: jest.fn(async () => ({ id: 'match-1' })),
      },
      matchPlayer: {
        upsert: jest.fn(async () => undefined),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<string>) => callback(tx)),
    };
    const repository = new MatchResultsRepository(prisma as unknown as PrismaService);
    const startedAt = new Date('2026-07-18T10:00:00.000Z');
    const endedAt = new Date('2026-07-18T10:05:00.000Z');

    const matchId = await repository.persistCompleted({
      roomId: 'private-room',
      rewardsEligible: false,
      mapName: 'Arena',
      winnerUserId: null,
      startedAt,
      endedAt,
      durationSeconds: 300,
      players: [{
        playerId: 'guest-1',
        userId: null,
        placement: 1,
        winner: true,
        kills: 2,
        deaths: 0,
        damageDealt: 300,
        damageTaken: 50,
      }],
    });

    expect(matchId).toBe('match-1');
    expect(tx.match.upsert).toHaveBeenCalledWith({
      where: { roomId: 'private-room' },
      create: {
        roomId: 'private-room',
        rewardsEligible: false,
        mapName: 'Arena',
        status: MatchStatus.COMPLETED,
        winnerUserId: null,
        startedAt,
        endedAt,
        durationSeconds: 300,
      },
      update: {},
    });
    expect(tx.matchPlayer.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        matchId_playerId: {
          matchId: 'match-1',
          playerId: 'guest-1',
        },
      },
    }));
  });
});

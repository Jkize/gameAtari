jest.mock('@solana/web3.js', () => ({
  PublicKey: class PublicKey {
    constructor(readonly value: string) {}
  },
}));

import { Prisma, RewardIneligibilityReason } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SolanaConfigService } from '../solana/solana-config.service';
import { RewardsHistoryService } from './rewards-history.service';

describe('RewardsHistoryService', () => {
  const decimal = (value: number) => new Prisma.Decimal(value);

  const createHarness = (network: 'mainnet-beta' | 'devnet' = 'devnet') => {
    const prisma = {
      matchPlayer: {
        findMany: jest.fn(),
      },
      match: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      rewardLog: {
        findMany: jest.fn(),
      },
    };
    const solanaConfig = {
      network: jest.fn(() => network),
    };
    const service = new RewardsHistoryService(
      prisma as unknown as PrismaService,
      solanaConfig as unknown as SolanaConfigService,
    );
    return { prisma, service };
  };

  it('returns only 50 recent matches with a next cursor', async () => {
    const { prisma, service } = createHarness();
    prisma.match.findMany.mockResolvedValue(Array.from({ length: 51 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${index.toString().padStart(12, '0')}`,
      endedAt: new Date(Date.UTC(2026, 6, 9, 20, 0, 0) - index * 1000),
      mapName: 'Arena',
      _count: { players: 4 },
      players: [],
    })));
    prisma.rewardLog.findMany.mockResolvedValue([]);

    const result = await service.recentMatches();

    expect(result.items).toHaveLength(50);
    expect(result.nextCursor).toEqual(expect.any(String));
  });

  it('generates devnet Solscan links when rewards have signatures', async () => {
    const { prisma, service } = createHarness('devnet');
    prisma.match.findMany.mockResolvedValue([{
      id: 'match-1',
      endedAt: new Date('2026-07-09T20:00:00.000Z'),
      mapName: 'Arena',
      _count: { players: 2 },
      players: [{
        userId: 'user-1',
        placement: 1,
        user: { id: 'user-1', username: 'Pilot', avatarUrl: null },
      }],
    }]);
    prisma.rewardLog.findMany.mockResolvedValue([{
      matchId: 'match-1',
      placement: 1,
      potentialAmount: decimal(700),
      amount: decimal(700),
      eligible: true,
      status: 'SENT',
      ineligibilityReason: RewardIneligibilityReason.INSUFFICIENT_TOKEN_BALANCE,
      transactionSignature: 'sig-1',
    }]);

    const result = await service.recentMatches();

    expect(result.items[0].podium[0].reward?.solscanUrl).toBe('https://solscan.io/tx/sig-1?cluster=devnet');
    expect(result.items[0].podium[0].reward).not.toHaveProperty('ineligibilityReason');
  });

  it('returns personal history for the authenticated user', async () => {
    const { prisma, service } = createHarness('mainnet-beta');
    prisma.matchPlayer.findMany.mockResolvedValue([{
      matchId: 'match-1',
      placement: 2,
      kills: 3,
      damageDealt: 450,
      winner: false,
      match: {
        id: 'match-1',
        endedAt: new Date('2026-07-09T20:00:00.000Z'),
        mapName: 'Arena',
        players: [{ id: 'p1' }, { id: 'p2' }],
      },
    }]);
    prisma.rewardLog.findMany.mockResolvedValue([{
      matchId: 'match-1',
      placement: 2,
      potentialAmount: decimal(300),
      amount: decimal(300),
      eligible: true,
      status: 'SENT',
      ineligibilityReason: null,
      transactionSignature: 'sig-mainnet',
    }]);

    const result = await service.personalHistory('user-1');

    expect(prisma.matchPlayer.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: 'user-1' }),
      take: 51,
    }));
    expect(result.items[0]).toEqual(expect.objectContaining({
      matchId: 'match-1',
      placement: 2,
      playerCount: 2,
    }));
    expect(result.items[0].reward?.solscanUrl).toBe('https://solscan.io/tx/sig-mainnet');
  });

  it('keeps ineligibility reasons in personal history only', async () => {
    const { prisma, service } = createHarness();
    prisma.matchPlayer.findMany.mockResolvedValue([{
      matchId: 'match-1',
      placement: 1,
      kills: 0,
      damageDealt: 0,
      winner: false,
      match: {
        id: 'match-1',
        endedAt: new Date('2026-07-09T20:00:00.000Z'),
        mapName: 'Arena',
        players: [{ id: 'p1' }],
      },
    }]);
    prisma.rewardLog.findMany.mockResolvedValue([{
      matchId: 'match-1',
      placement: 1,
      potentialAmount: decimal(700),
      amount: decimal(0),
      eligible: false,
      status: 'NOT_ELIGIBLE',
      ineligibilityReason: RewardIneligibilityReason.WALLET_NOT_LINKED,
      transactionSignature: null,
    }]);

    const result = await service.personalHistory('user-1');

    expect(result.items[0].reward?.ineligibilityReason).toBe(RewardIneligibilityReason.WALLET_NOT_LINKED);
  });
});

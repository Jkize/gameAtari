import { Prisma, RewardStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RewardsRepository } from './rewards.repository';

describe('RewardsRepository', () => {
  it('upserts reward logs by deterministic idempotency key', async () => {
    const prisma = {
      rewardLog: {
        upsert: jest.fn(async () => undefined),
      },
    } as unknown as PrismaService;
    const repository = new RewardsRepository(prisma);

    await repository.upsertRewardLog({
      matchId: 'match-1',
      userId: '00000000-0000-4000-8000-000000000001',
      placement: 2,
      walletAddress: null,
      potentialAmount: 300,
      amount: 0,
      mint: 'mint-test',
      eligible: false,
      status: RewardStatus.NOT_ELIGIBLE,
    });

    expect(prisma.rewardLog.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { idempotencyKey: 'MATCH_REWARD:match-1:2' },
      create: expect.objectContaining({
        idempotencyKey: 'MATCH_REWARD:match-1:2',
        matchId: 'match-1',
        placement: 2,
      }),
      update: {},
    }));
  });

  it('releases a reserved daily amount when a claimed reward goes to manual review before submission', async () => {
    const tx = {
      rewardLog: {
        findUnique: jest.fn(async () => ({
          userId: '00000000-0000-4000-8000-000000000001',
          walletAddress: 'wallet-1',
          mint: 'mint-1',
          amount: new Prisma.Decimal(700),
          eligible: true,
          status: RewardStatus.PROCESSING,
          retryable: false,
          transactionSignature: null,
          eligibilityCheckedAt: new Date('2026-07-09T20:00:00.000Z'),
          createdAt: new Date('2026-07-09T19:59:00.000Z'),
        })),
        update: jest.fn(async () => undefined),
      },
      $executeRaw: jest.fn(async () => undefined),
    };
    const prisma = {
      $transaction: jest.fn(async callback => callback(tx)),
    } as unknown as PrismaService;
    const repository = new RewardsRepository(prisma);

    await repository.markManualReview('reward-1', 'ERROR', 'failed');

    expect(tx.rewardLog.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'reward-1' },
      data: expect.objectContaining({ status: RewardStatus.MANUAL_REVIEW }),
    }));
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('does not release daily reservation for a reward that already has a submitted signature', async () => {
    const tx = {
      rewardLog: {
        findUnique: jest.fn(async () => ({
          userId: '00000000-0000-4000-8000-000000000001',
          walletAddress: 'wallet-1',
          mint: 'mint-1',
          amount: new Prisma.Decimal(700),
          eligible: true,
          status: RewardStatus.PROCESSING,
          retryable: false,
          transactionSignature: 'sig-1',
          eligibilityCheckedAt: new Date('2026-07-09T20:00:00.000Z'),
          createdAt: new Date('2026-07-09T19:59:00.000Z'),
        })),
        update: jest.fn(async () => undefined),
      },
      $executeRaw: jest.fn(async () => undefined),
    };
    const prisma = {
      $transaction: jest.fn(async callback => callback(tx)),
    } as unknown as PrismaService;
    const repository = new RewardsRepository(prisma);

    await repository.markManualReview('reward-1', 'ERROR', 'failed');

    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('records sent amount when a reward is confirmed for the first time', async () => {
    const tx = {
      rewardLog: {
        findUnique: jest.fn(async () => ({
          userId: '00000000-0000-4000-8000-000000000001',
          walletAddress: 'wallet-1',
          mint: 'mint-1',
          amount: new Prisma.Decimal(700),
          eligible: true,
          status: RewardStatus.SUBMITTED,
          eligibilityCheckedAt: new Date('2026-07-09T20:00:00.000Z'),
          createdAt: new Date('2026-07-09T19:59:00.000Z'),
        })),
        update: jest.fn(async () => undefined),
      },
      $executeRaw: jest.fn(async () => undefined),
    };
    const prisma = {
      $transaction: jest.fn(async callback => callback(tx)),
    } as unknown as PrismaService;
    const repository = new RewardsRepository(prisma);

    await repository.markSent('reward-1');

    expect(tx.rewardLog.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'reward-1' },
      data: expect.objectContaining({ status: RewardStatus.SENT }),
    }));
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('does not record sent amount twice when a reward is already sent', async () => {
    const tx = {
      rewardLog: {
        findUnique: jest.fn(async () => ({
          userId: '00000000-0000-4000-8000-000000000001',
          walletAddress: 'wallet-1',
          mint: 'mint-1',
          amount: new Prisma.Decimal(700),
          eligible: true,
          status: RewardStatus.SENT,
          eligibilityCheckedAt: new Date('2026-07-09T20:00:00.000Z'),
          createdAt: new Date('2026-07-09T19:59:00.000Z'),
        })),
        update: jest.fn(async () => undefined),
      },
      $executeRaw: jest.fn(async () => undefined),
    };
    const prisma = {
      $transaction: jest.fn(async callback => callback(tx)),
    } as unknown as PrismaService;
    const repository = new RewardsRepository(prisma);

    await repository.markSent('reward-1');

    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('re-reserves daily amount before manually retrying a released reward', async () => {
    const tx = {
      rewardLog: {
        findUnique: jest.fn(async () => ({
          userId: '00000000-0000-4000-8000-000000000001',
          walletAddress: 'wallet-1',
          mint: 'mint-1',
          amount: new Prisma.Decimal(700),
          eligible: true,
          status: RewardStatus.MANUAL_REVIEW,
          retryable: false,
          transactionSignature: null,
          eligibilityCheckedAt: new Date('2026-07-09T20:00:00.000Z'),
          createdAt: new Date('2026-07-09T19:59:00.000Z'),
        })),
        update: jest.fn(async () => undefined),
      },
      $executeRaw: jest.fn(async () => undefined),
      $queryRaw: jest.fn(async () => [{ id: 'limit-1' }]),
    };
    const prisma = {
      $transaction: jest.fn(async callback => callback(tx)),
    } as unknown as PrismaService;
    const repository = new RewardsRepository(prisma);

    await repository.retryManually('reward-1');

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.rewardLog.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'reward-1' },
      data: expect.objectContaining({ status: RewardStatus.PENDING }),
    }));
  });

  it('does not manually retry when the daily limit cannot be reserved again', async () => {
    const tx = {
      rewardLog: {
        findUnique: jest.fn(async () => ({
          userId: '00000000-0000-4000-8000-000000000001',
          walletAddress: 'wallet-1',
          mint: 'mint-1',
          amount: new Prisma.Decimal(700),
          eligible: true,
          status: RewardStatus.MANUAL_REVIEW,
          retryable: false,
          transactionSignature: null,
          eligibilityCheckedAt: new Date('2026-07-09T20:00:00.000Z'),
          createdAt: new Date('2026-07-09T19:59:00.000Z'),
        })),
        update: jest.fn(async () => undefined),
      },
      $executeRaw: jest.fn(async () => undefined),
      $queryRaw: jest.fn(async () => []),
    };
    const prisma = {
      $transaction: jest.fn(async callback => callback(tx)),
    } as unknown as PrismaService;
    const repository = new RewardsRepository(prisma);

    await repository.retryManually('reward-1');

    expect(tx.rewardLog.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'reward-1' },
      data: expect.objectContaining({
        status: RewardStatus.DAILY_LIMIT_REACHED,
        errorCode: 'DAILY_LIMIT_REACHED',
      }),
    }));
  });
});

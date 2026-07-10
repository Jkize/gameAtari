import { Prisma } from '@prisma/client';
import { SolanaGateway } from '../solana/solana.types';
import { RewardReconcilerService } from './reward-reconciler.service';
import { ClaimedReward, RewardsRepository } from './rewards.repository';

describe('RewardReconcilerService', () => {
  const reward = (overrides: Partial<ClaimedReward> = {}): ClaimedReward => ({
    id: 'reward-1',
    matchId: 'match-1',
    userId: '00000000-0000-4000-8000-000000000001',
    placement: 1,
    walletAddress: 'wallet-1',
    amount: new Prisma.Decimal(700),
    mint: 'mint-1',
    tokenDecimals: 2,
    retryCount: 0,
    transactionSignature: 'sig-1',
    ...overrides,
  });

  const createHarness = () => {
    const repository = {
      markSent: jest.fn(async () => undefined),
      markFailed: jest.fn(async () => undefined),
      markManualReview: jest.fn(async () => undefined),
      findSubmittedRewards: jest.fn(async () => []),
    };
    const solana = {
      verifySplTokenTransfer: jest.fn(),
    };
    const service = new RewardReconcilerService(
      repository as unknown as RewardsRepository,
      solana as unknown as SolanaGateway,
    );
    return { repository, solana, service };
  };

  it('marks confirmed signatures as sent', async () => {
    const { repository, solana, service } = createHarness();
    solana.verifySplTokenTransfer.mockResolvedValue({ kind: 'confirmed' });

    await service.reconcile(reward());

    expect(repository.markSent).toHaveBeenCalledWith('reward-1');
  });

  it('marks failed signatures as failed', async () => {
    const { repository, solana, service } = createHarness();
    solana.verifySplTokenTransfer.mockResolvedValue({ kind: 'failed', errorMessage: 'InstructionError' });

    await service.reconcile(reward());

    expect(repository.markFailed).toHaveBeenCalledWith('reward-1', expect.objectContaining({
      retryable: false,
      errorCode: 'TRANSACTION_REJECTED',
    }));
  });

  it('marks missing signatures as manual review before any retry', async () => {
    const { repository, solana, service } = createHarness();
    solana.verifySplTokenTransfer.mockResolvedValue({ kind: 'not_found' });

    await service.reconcile(reward());

    expect(repository.markManualReview).toHaveBeenCalledWith(
      'reward-1',
      'SUBMITTED_SIGNATURE_NOT_FOUND',
      expect.any(String),
    );
  });

  it('marks ambiguous verification as manual review', async () => {
    const { repository, solana, service } = createHarness();
    solana.verifySplTokenTransfer.mockResolvedValue({ kind: 'ambiguous', errorMessage: 'wrong recipient' });

    await service.reconcile(reward());

    expect(repository.markManualReview).toHaveBeenCalledWith(
      'reward-1',
      'TRANSFER_VERIFICATION_AMBIGUOUS',
      'wrong recipient',
    );
  });
});

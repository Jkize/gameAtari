jest.mock('@solana/web3.js', () => ({
  PublicKey: class PublicKey {
    constructor(readonly value: string) {}
  },
}));

import { RewardIneligibilityReason, RewardStatus } from '@prisma/client';
import { SolanaConfigService } from '../solana/solana-config.service';
import { SolanaGateway, SolanaGatewayError, SolanaGatewayErrorCode } from '../solana/solana.types';
import { DAILY_REWARD_LIMIT_TOKENS, REWARD_AMOUNTS_BY_PLACEMENT } from './rewards.config';
import { RewardsRepository } from './rewards.repository';
import { RewardsService } from './rewards.service';

describe('RewardsService eligibility', () => {
  const matchId = 'match-1';
  const userId = '00000000-0000-4000-8000-000000000001';
  const wallet = { address: 'wallet-1', verifiedAt: new Date('2026-07-09T10:00:00.000Z') };

  const createHarness = () => {
    const repository = {
      findVerifiedWallet: jest.fn(),
      upsertRewardLog: jest.fn(async () => undefined),
      claimRewardEvaluation: jest.fn(async () => ({ id: 'reward-1' })),
      completeRewardEvaluation: jest.fn(async () => undefined),
      tryReserveDailyAmount: jest.fn(async () => true),
    };
    const solanaConfig = {
      rewardsEnabled: jest.fn(() => true),
      mint: jest.fn(() => 'mint-1'),
    };
    const solana = {
      getTokenBalance: jest.fn(),
      validatePublicKey: jest.fn(),
      getMintDecimals: jest.fn(),
      getTransactionStatus: jest.fn(),
    };

    const service = new RewardsService(
      repository as unknown as RewardsRepository,
      solanaConfig as unknown as SolanaConfigService,
      solana as unknown as SolanaGateway,
    );

    return { repository, solana, solanaConfig, service };
  };

  it('records candidates as not eligible without wallet or Helius checks when rewards are disabled', async () => {
    const { repository, solana, solanaConfig, service } = createHarness();
    solanaConfig.rewardsEnabled.mockReturnValue(false);

    await service.registerMatchRewards([{ matchId, userId, placement: 1 }]);

    expect(repository.completeRewardEvaluation).toHaveBeenCalledWith('reward-1', expect.objectContaining({
      status: RewardStatus.REWARDS_DISABLED,
      ineligibilityReason: null,
      eligible: false,
      amount: 0,
    }));
    expect(repository.upsertRewardLog).toHaveBeenCalledWith(expect.objectContaining({
      potentialAmount: 0,
      amount: 0,
    }));
    expect(repository.findVerifiedWallet).not.toHaveBeenCalled();
    expect(solana.getTokenBalance).not.toHaveBeenCalled();
  });

  it('marks an unauthenticated first place as not eligible', async () => {
    const { repository, service } = createHarness();

    await service.registerMatchRewards([{ matchId, userId: null, placement: 1 }]);

    expect(repository.completeRewardEvaluation).toHaveBeenCalledWith('reward-1', expect.objectContaining({
      status: RewardStatus.NOT_ELIGIBLE,
      ineligibilityReason: RewardIneligibilityReason.USER_NOT_AUTHENTICATED,
      amount: 0,
    }));
  });

  it('marks a Google user without Phantom as not eligible', async () => {
    const { repository, service } = createHarness();
    repository.findVerifiedWallet.mockResolvedValue(null);

    await service.registerMatchRewards([{ matchId, userId, placement: 1 }]);

    expect(repository.completeRewardEvaluation).toHaveBeenCalledWith('reward-1', expect.objectContaining({
      status: RewardStatus.NOT_ELIGIBLE,
      ineligibilityReason: RewardIneligibilityReason.WALLET_NOT_LINKED,
    }));
  });

  it('marks an unverified Phantom wallet as not eligible', async () => {
    const { repository, service } = createHarness();
    repository.findVerifiedWallet.mockResolvedValue({ address: 'wallet-1', verifiedAt: null });

    await service.registerMatchRewards([{ matchId, userId, placement: 1 }]);

    expect(repository.completeRewardEvaluation).toHaveBeenCalledWith('reward-1', expect.objectContaining({
      status: RewardStatus.NOT_ELIGIBLE,
      walletAddress: 'wallet-1',
      ineligibilityReason: RewardIneligibilityReason.WALLET_NOT_VERIFIED,
    }));
  });

  it('marks a holder with 9,999 tokens as insufficient balance', async () => {
    const { repository, solana, service } = createHarness();
    repository.findVerifiedWallet.mockResolvedValue(wallet);
    solana.getTokenBalance.mockResolvedValue({ kind: 'found', amountRaw: 9999n, decimals: 0 });

    await service.registerMatchRewards([{ matchId, userId, placement: 1 }]);

    expect(repository.completeRewardEvaluation).toHaveBeenCalledWith('reward-1', expect.objectContaining({
      status: RewardStatus.NOT_ELIGIBLE,
      tokenBalanceChecked: '9999',
      ineligibilityReason: RewardIneligibilityReason.INSUFFICIENT_TOKEN_BALANCE,
    }));
  });

  it('marks a holder with exactly 10,000 tokens as pending when daily reserve succeeds', async () => {
    const { repository, solana, service } = createHarness();
    repository.findVerifiedWallet.mockResolvedValue(wallet);
    solana.getTokenBalance.mockResolvedValue({ kind: 'found', amountRaw: 10000n, decimals: 0 });

    await service.registerMatchRewards([{ matchId, userId, placement: 1 }]);

    expect(repository.tryReserveDailyAmount).toHaveBeenCalledWith(expect.objectContaining({
      userId,
      walletAddress: 'wallet-1',
      mint: 'mint-1',
    }), REWARD_AMOUNTS_BY_PLACEMENT[1], DAILY_REWARD_LIMIT_TOKENS);
    expect(repository.completeRewardEvaluation).toHaveBeenCalledWith('reward-1', expect.objectContaining({
      status: RewardStatus.PENDING,
      eligible: true,
      amount: REWARD_AMOUNTS_BY_PLACEMENT[1],
      tokenBalanceChecked: '10000',
    }));
  });

  it('marks a holder with more than 10,000 tokens as pending', async () => {
    const { repository, solana, service } = createHarness();
    repository.findVerifiedWallet.mockResolvedValue(wallet);
    solana.getTokenBalance.mockResolvedValue({ kind: 'found', amountRaw: 15000n, decimals: 0 });

    await service.registerMatchRewards([{ matchId, userId, placement: 2 }]);

    expect(repository.completeRewardEvaluation).toHaveBeenCalledWith('reward-1', expect.objectContaining({
      status: RewardStatus.PENDING,
      eligible: true,
      amount: REWARD_AMOUNTS_BY_PLACEMENT[2],
    }));
  });

  it('does not redistribute when first is not eligible and second is eligible', async () => {
    const { repository, solana, service } = createHarness();
    repository.claimRewardEvaluation
      .mockResolvedValueOnce({ id: 'reward-1' })
      .mockResolvedValueOnce({ id: 'reward-2' });
    repository.findVerifiedWallet
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(wallet);
    solana.getTokenBalance.mockResolvedValue({ kind: 'found', amountRaw: 10000n, decimals: 0 });

    await service.registerMatchRewards([
      { matchId, userId: '00000000-0000-4000-8000-000000000001', placement: 1 },
      { matchId, userId: '00000000-0000-4000-8000-000000000002', placement: 2 },
    ]);

    expect(repository.completeRewardEvaluation).toHaveBeenNthCalledWith(1, 'reward-1', expect.objectContaining({
      status: RewardStatus.NOT_ELIGIBLE,
      amount: 0,
    }));
    expect(repository.completeRewardEvaluation).toHaveBeenNthCalledWith(2, 'reward-2', expect.objectContaining({
      status: RewardStatus.PENDING,
      amount: REWARD_AMOUNTS_BY_PLACEMENT[2],
    }));
  });

  it('allows the exact daily limit when the atomic reservation succeeds', async () => {
    const { repository, solana, service } = createHarness();
    repository.findVerifiedWallet.mockResolvedValue(wallet);
    solana.getTokenBalance.mockResolvedValue({ kind: 'found', amountRaw: 10000n, decimals: 0 });
    repository.tryReserveDailyAmount.mockResolvedValue(true);

    await service.registerMatchRewards([{ matchId, userId, placement: 3 }]);

    expect(repository.completeRewardEvaluation).toHaveBeenCalledWith('reward-1', expect.objectContaining({
      status: RewardStatus.PENDING,
      amount: REWARD_AMOUNTS_BY_PLACEMENT[3],
    }));
  });

  it('marks the reward as daily limit reached when the full prize exceeds the limit', async () => {
    const { repository, solana, service } = createHarness();
    repository.findVerifiedWallet.mockResolvedValue(wallet);
    solana.getTokenBalance.mockResolvedValue({ kind: 'found', amountRaw: 10000n, decimals: 0 });
    repository.tryReserveDailyAmount.mockResolvedValue(false);

    await service.registerMatchRewards([{ matchId, userId, placement: 1 }]);

    expect(repository.completeRewardEvaluation).toHaveBeenCalledWith('reward-1', expect.objectContaining({
      status: RewardStatus.DAILY_LIMIT_REACHED,
      amount: 0,
      ineligibilityReason: RewardIneligibilityReason.DAILY_LIMIT_REACHED,
    }));
  });

  it('does not duplicate evaluation work when two finalizations race', async () => {
    const { repository, solana, service } = createHarness();
    repository.claimRewardEvaluation
      .mockResolvedValueOnce({ id: 'reward-1' })
      .mockResolvedValueOnce(null);
    repository.findVerifiedWallet.mockResolvedValue(wallet);
    solana.getTokenBalance.mockResolvedValue({ kind: 'found', amountRaw: 10000n, decimals: 0 });

    await Promise.all([
      service.registerMatchRewards([{ matchId, userId, placement: 1 }]),
      service.registerMatchRewards([{ matchId, userId, placement: 1 }]),
    ]);

    expect(repository.upsertRewardLog).toHaveBeenCalledTimes(2);
    expect(repository.tryReserveDailyAmount).toHaveBeenCalledTimes(1);
    expect(repository.completeRewardEvaluation).toHaveBeenCalledTimes(1);
  });

  it('puts temporary Helius errors into retryable failed state', async () => {
    const { repository, solana, service } = createHarness();
    repository.findVerifiedWallet.mockResolvedValue(wallet);
    solana.getTokenBalance.mockRejectedValue(new SolanaGatewayError(
      SolanaGatewayErrorCode.TEMPORARY_RPC_ERROR,
      'timeout',
      true,
    ));

    await service.registerMatchRewards([{ matchId, userId, placement: 1 }]);

    expect(repository.completeRewardEvaluation).toHaveBeenCalledWith('reward-1', expect.objectContaining({
      status: RewardStatus.FAILED,
      retryable: true,
      errorCode: SolanaGatewayErrorCode.TEMPORARY_RPC_ERROR,
      amount: 0,
    }));
    expect(repository.tryReserveDailyAmount).not.toHaveBeenCalled();
  });

  it('skips re-evaluation when the reward was already evaluated', async () => {
    const { repository, service } = createHarness();
    repository.claimRewardEvaluation.mockResolvedValue(null);

    await service.registerMatchRewards([{ matchId, userId, placement: 1 }]);

    expect(repository.completeRewardEvaluation).not.toHaveBeenCalled();
    expect(repository.tryReserveDailyAmount).not.toHaveBeenCalled();
  });
});

jest.mock('@solana/web3.js', () => ({
  PublicKey: class PublicKey {
    constructor(readonly value: string) {}
  },
}));

import { Prisma } from '@prisma/client';
import { SolanaConfigService } from '../solana/solana-config.service';
import {
  SolanaGateway,
  SolanaGatewayError,
  SolanaGatewayErrorCode,
} from '../solana/solana.types';
import { RewardProcessorService } from './reward-processor.service';
import { RewardReconcilerService } from './reward-reconciler.service';
import { ClaimedReward, RewardsRepository } from './rewards.repository';

describe('RewardProcessorService', () => {
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
    transactionSignature: null,
    ...overrides,
  });

  const createHarness = () => {
    const repository = {
      claimPendingRewards: jest.fn(async () => []),
      markSubmitted: jest.fn(async () => undefined),
      markFailed: jest.fn(async () => undefined),
      markManualReview: jest.fn(async () => undefined),
      retryManually: jest.fn(async () => undefined),
    };
    const solana = {
      sendSplTokenTransfer: jest.fn(),
    };
    const config = {
      rewardProcessorBatchSize: jest.fn(() => 10),
      rewardMaxRetries: jest.fn(() => 3),
    };
    const reconciler = {
      reconcileSubmitted: jest.fn(async () => undefined),
      reconcile: jest.fn(async () => 'sent'),
    };
    const service = new RewardProcessorService(
      repository as unknown as RewardsRepository,
      solana as unknown as SolanaGateway,
      config as unknown as SolanaConfigService,
      reconciler as unknown as RewardReconcilerService,
    );
    return { repository, solana, config, reconciler, service };
  };

  it('processes a successful payment and stores the signature before reconciliation', async () => {
    const { repository, solana, reconciler, service } = createHarness();
    repository.claimPendingRewards.mockResolvedValue([reward()]);
    solana.sendSplTokenTransfer.mockResolvedValue({ signature: 'sig-1' });

    await service.processBatch();

    expect(solana.sendSplTokenTransfer).toHaveBeenCalledWith({
      rewardId: 'reward-1',
      mint: 'mint-1',
      destinationWallet: 'wallet-1',
      amountRaw: 70000n,
      decimals: 2,
    });
    expect(repository.markSubmitted).toHaveBeenCalledWith('reward-1', 'sig-1');
    expect(reconciler.reconcile).toHaveBeenCalledWith(expect.objectContaining({
      id: 'reward-1',
      transactionSignature: 'sig-1',
    }));
  });

  it('marks distributor token shortage as retryable failed', async () => {
    const { repository, solana, service } = createHarness();
    repository.claimPendingRewards.mockResolvedValue([reward()]);
    solana.sendSplTokenTransfer.mockRejectedValue(new SolanaGatewayError(
      SolanaGatewayErrorCode.DISTRIBUTOR_INSUFFICIENT_TOKEN_BALANCE,
      'not enough token',
      true,
    ));

    await service.processBatch();

    expect(repository.markFailed).toHaveBeenCalledWith('reward-1', expect.objectContaining({
      retryable: true,
      errorCode: SolanaGatewayErrorCode.DISTRIBUTOR_INSUFFICIENT_TOKEN_BALANCE,
      retryCountIncrement: 1,
      nextRetryAt: expect.any(Date),
    }));
  });

  it('marks distributor SOL shortage as retryable failed', async () => {
    const { repository, solana, service } = createHarness();
    repository.claimPendingRewards.mockResolvedValue([reward()]);
    solana.sendSplTokenTransfer.mockRejectedValue(new SolanaGatewayError(
      SolanaGatewayErrorCode.DISTRIBUTOR_INSUFFICIENT_SOL,
      'not enough sol',
      true,
    ));

    await service.processBatch();

    expect(repository.markFailed).toHaveBeenCalledWith('reward-1', expect.objectContaining({
      retryable: true,
      errorCode: SolanaGatewayErrorCode.DISTRIBUTOR_INSUFFICIENT_SOL,
    }));
  });

  it('marks temporary RPC failures as retryable failed', async () => {
    const { repository, solana, service } = createHarness();
    repository.claimPendingRewards.mockResolvedValue([reward()]);
    solana.sendSplTokenTransfer.mockRejectedValue(new SolanaGatewayError(
      SolanaGatewayErrorCode.TEMPORARY_RPC_ERROR,
      'rpc timeout',
      true,
    ));

    await service.processBatch();

    expect(repository.markFailed).toHaveBeenCalledWith('reward-1', expect.objectContaining({
      retryable: true,
      errorCode: SolanaGatewayErrorCode.TEMPORARY_RPC_ERROR,
    }));
  });

  it('moves to manual review when retry limit is reached', async () => {
    const { repository, solana, service } = createHarness();
    repository.claimPendingRewards.mockResolvedValue([reward({ retryCount: 2 })]);
    solana.sendSplTokenTransfer.mockRejectedValue(new SolanaGatewayError(
      SolanaGatewayErrorCode.TEMPORARY_RPC_ERROR,
      'rpc timeout',
      true,
    ));

    await service.processBatch();

    expect(repository.markManualReview).toHaveBeenCalledWith(
      'reward-1',
      SolanaGatewayErrorCode.TEMPORARY_RPC_ERROR,
      'rpc timeout',
    );
  });

  it('moves to manual review when the destination ATA is missing', async () => {
    const { repository, solana, service } = createHarness();
    repository.claimPendingRewards.mockResolvedValue([reward()]);
    solana.sendSplTokenTransfer.mockRejectedValue(new SolanaGatewayError(
      SolanaGatewayErrorCode.DESTINATION_ATA_NOT_FOUND,
      'Destination associated token account does not exist',
      false,
    ));

    await service.processBatch();

    expect(repository.markManualReview).toHaveBeenCalledWith(
      'reward-1',
      SolanaGatewayErrorCode.DESTINATION_ATA_NOT_FOUND,
      'Destination associated token account does not exist',
    );
    expect(repository.markFailed).not.toHaveBeenCalled();
  });

  it('does not process already sent or non-eligible rewards because repository claim filters them', async () => {
    const { repository, solana, service } = createHarness();
    repository.claimPendingRewards.mockResolvedValue([]);

    await service.processBatch();

    expect(solana.sendSplTokenTransfer).not.toHaveBeenCalled();
  });

  it('reconciles instead of sending when claimed reward already has a signature', async () => {
    const { repository, solana, reconciler, service } = createHarness();
    repository.claimPendingRewards.mockResolvedValue([reward({ transactionSignature: 'sig-1' })]);

    await service.processBatch();

    expect(solana.sendSplTokenTransfer).not.toHaveBeenCalled();
    expect(reconciler.reconcile).toHaveBeenCalledWith(expect.objectContaining({ transactionSignature: 'sig-1' }));
  });

  it('manual retry returns the same reward to pending without creating another log', async () => {
    const { repository, service } = createHarness();

    await service.retryManually('reward-1');

    expect(repository.retryManually).toHaveBeenCalledWith('reward-1');
  });
});

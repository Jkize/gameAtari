import { Injectable } from '@nestjs/common';
import { SolanaConfigService } from '../solana/solana-config.service';
import {
  SolanaGateway,
  SolanaGatewayError,
  SolanaGatewayErrorCode,
} from '../solana/solana.types';
import { ClaimedReward, RewardsRepository } from './rewards.repository';
import { tokenDecimalStringToRaw } from './rewards.types';
import { RewardReconcilerService } from './reward-reconciler.service';

/**
 * Payment-side worker: sends and confirms on-chain SPL token transfers for rewards that have
 * already been marked eligible by {@link RewardsService}. Never calls Helius/RPC directly —
 * always goes through {@link SolanaGateway}.
 */
@Injectable()
export class RewardProcessorService {
  constructor(
    private readonly rewards: RewardsRepository,
    private readonly solana: SolanaGateway,
    private readonly config: SolanaConfigService,
    private readonly reconciler: RewardReconcilerService,
  ) {}

  /** Reconciles any pending `SUBMITTED` rewards, then atomically claims and processes one batch of payable rewards. Returns the number processed. */
  async processBatch(): Promise<number> {
    await this.reconciler.reconcileSubmitted(this.config.rewardProcessorBatchSize());
    const claimed = await this.rewards.claimPendingRewards(
      this.config.rewardProcessorBatchSize(),
      this.config.rewardMaxRetries(),
    );
    for (const reward of claimed) await this.processReward(reward);
    return claimed.length;
  }

  /** Operator action: clears a reward's manual-review/failed state so the next batch picks it back up. */
  async retryManually(id: string): Promise<void> {
    await this.rewards.retryManually(id);
  }

  /**
   * Pays a single claimed reward. A reward that already has a `transactionSignature` is only
   * reconciled, never resent. Rewards missing required transfer fields go straight to manual
   * review instead of being retried indefinitely.
   */
  private async processReward(reward: ClaimedReward): Promise<void> {
    if (reward.transactionSignature) {
      await this.reconciler.reconcile(reward);
      return;
    }

    if (!reward.walletAddress || !reward.userId || reward.tokenDecimals == null || !reward.mint) {
      await this.rewards.markManualReview(reward.id, 'REWARD_TRANSFER_FIELDS_MISSING', 'Reward is missing required transfer fields');
      return;
    }

    const request = {
      rewardId: reward.id,
      mint: reward.mint,
      destinationWallet: reward.walletAddress,
      amountRaw: tokenDecimalStringToRaw(reward.amount.toString(), reward.tokenDecimals),
      decimals: reward.tokenDecimals,
    };

    try {
      const result = await this.solana.sendSplTokenTransfer(request);
      await this.rewards.markSubmitted(reward.id, result.signature);
      await this.reconciler.reconcile({ ...reward, transactionSignature: result.signature });
    } catch (error) {
      await this.handleFailure(reward, error);
    }
  }

  /** Classifies a transfer failure: schedules an exponential-backoff retry if recoverable and under the retry cap, otherwise routes to manual review. */
  private async handleFailure(reward: ClaimedReward, error: unknown): Promise<void> {
    const gatewayError = error instanceof SolanaGatewayError
      ? error
      : new SolanaGatewayError(
          SolanaGatewayErrorCode.TEMPORARY_RPC_ERROR,
          error instanceof Error ? error.message : 'Reward transfer failed',
          true,
        );
    const nextRetryCount = reward.retryCount + 1;
    if (!gatewayError.retryable || nextRetryCount >= this.config.rewardMaxRetries()) {
      await this.rewards.markManualReview(reward.id, gatewayError.code, this.sanitize(gatewayError.message));
      return;
    }
    await this.rewards.markFailed(reward.id, {
      retryable: true,
      errorCode: gatewayError.code,
      errorMessage: this.sanitize(gatewayError.message),
      retryCountIncrement: 1,
      nextRetryAt: this.nextRetryAt(nextRetryCount),
    });
  }

  /** Exponential backoff (5s base, doubling per retry), capped at one hour. */
  private nextRetryAt(retryCount: number): Date {
    const delayMs = Math.min(60 * 60 * 1000, 5000 * 2 ** Math.max(0, retryCount - 1));
    return new Date(Date.now() + delayMs);
  }

  private sanitize(message: string): string {
    return message.slice(0, 500);
  }
}

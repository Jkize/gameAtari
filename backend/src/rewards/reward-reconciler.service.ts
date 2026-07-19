import { Injectable } from '@nestjs/common';
import { SolanaGateway, SplTransferRequest } from '../solana/solana.types';
import { ClaimedReward, RewardsRepository } from './rewards.repository';
import { tokenDecimalStringToRaw } from './rewards.types';

/**
 * Verifies previously submitted on-chain transfers before any resend is attempted, per the
 * AGENTS.md invariant that a `SUBMITTED` reward with a `transactionSignature` must be
 * reconciled before retrying.
 */
@Injectable()
export class RewardReconcilerService {
  constructor(
    private readonly rewards: RewardsRepository,
    private readonly solana: SolanaGateway,
  ) {}

  /** Reconciles a batch of `SUBMITTED` rewards, oldest first. */
  async reconcileSubmitted(batchSize: number): Promise<number> {
    const rewards = await this.rewards.findSubmittedRewards(batchSize);
    for (const reward of rewards) await this.reconcile(reward);
    return rewards.length;
  }

  /** Verifies a single reward's submitted transaction on-chain and updates the `RewardLog` to `SENT`, `FAILED`, or `MANUAL_REVIEW` accordingly. */
  async reconcile(reward: ClaimedReward): Promise<'sent' | 'failed' | 'manual_review' | 'not_found'> {
    if (!reward.transactionSignature) return 'not_found';
    const request = this.toTransferRequest(reward);
    const result = await this.solana.verifySplTokenTransfer(reward.transactionSignature, request);
    if (result.kind === 'confirmed') {
      await this.rewards.markSent(reward.id);
      return 'sent';
    }
    if (result.kind === 'failed') {
      await this.rewards.markFailed(reward.id, {
        retryable: false,
        errorCode: 'TRANSACTION_REJECTED',
        errorMessage: this.sanitize(result.errorMessage),
      });
      return 'failed';
    }
    if (result.kind === 'not_found') {
      await this.rewards.markManualReview(
        reward.id,
        'SUBMITTED_SIGNATURE_NOT_FOUND',
        'Submitted signature was not found; manual reconciliation is required before retry',
      );
      return 'not_found';
    }
    await this.rewards.markManualReview(reward.id, 'TRANSFER_VERIFICATION_AMBIGUOUS', this.sanitize(result.errorMessage));
    return 'manual_review';
  }

  /** Builds the raw-unit transfer request used to re-verify a submitted transaction against the gateway. */
  private toTransferRequest(reward: ClaimedReward): SplTransferRequest {
    if (!reward.walletAddress || reward.tokenDecimals == null) {
      throw new Error('Reward is missing transfer fields');
    }
    return {
      rewardId: reward.id,
      mint: reward.mint,
      destinationWallet: reward.walletAddress,
      amountRaw: tokenDecimalStringToRaw(reward.amount.toString(), reward.tokenDecimals),
      decimals: reward.tokenDecimals,
    };
  }

  private sanitize(message: string): string {
    return message.slice(0, 500);
  }
}

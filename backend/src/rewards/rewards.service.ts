import { Injectable } from '@nestjs/common';
import { RewardIneligibilityReason, RewardStatus } from '@prisma/client';
import {
  SolanaGateway,
  SolanaGatewayError,
  SolanaGatewayErrorCode,
} from '../solana/solana.types';
import { SolanaConfigService } from '../solana/solana-config.service';
import {
  DAILY_REWARD_LIMIT_TOKENS,
  MINIMUM_HOLDER_BALANCE_TOKENS,
  REWARD_AMOUNTS_BY_PLACEMENT,
} from './rewards.config';
import { RewardsRepository } from './rewards.repository';
import {
  RewardCandidate,
  rawToTokenDecimalString,
  rewardDateInBogota,
  tokensToRaw,
} from './rewards.types';

/**
 * Registers and evaluates SPL token reward eligibility for a match's top-3 finishers.
 * Eligibility is decided from the wallet's token balance at match end, before any payment
 * is attempted; actual on-chain payment is handled separately by {@link RewardProcessorService}.
 */
@Injectable()
export class RewardsService {
  constructor(
    private readonly rewards: RewardsRepository,
    private readonly solanaConfig: SolanaConfigService,
    private readonly solana: SolanaGateway,
  ) {}

  /** Entry point called once per finished match: registers a `RewardLog` and evaluates eligibility for each top-3 candidate. */
  async registerMatchRewards(candidates: RewardCandidate[]): Promise<void> {
    for (const candidate of candidates) {
      await this.registerAndEvaluate(candidate);
    }
  }

  /**
   * Creates/reuses the candidate's `RewardLog`, then walks the eligibility chain in order:
   * authenticated user -> linked wallet -> verified wallet -> minimum token balance -> daily
   * budget reservation. Any Solana gateway failure is routed to {@link buildGatewayFailure}
   * instead of being treated as insufficient balance.
   */
  private async registerAndEvaluate(candidate: RewardCandidate): Promise<void> {
    const potentialAmount = REWARD_AMOUNTS_BY_PLACEMENT[candidate.placement];
    const mint = this.solanaConfig.mint();

    await this.rewards.upsertRewardLog({
      matchId: candidate.matchId,
      userId: candidate.userId,
      placement: candidate.placement,
      walletAddress: null,
      potentialAmount,
      amount: 0,
      mint,
      tokenDecimals: null,
      eligible: false,
      eligibilityCheckedAt: null,
      tokenBalanceChecked: null,
      ineligibilityReason: null,
      status: RewardStatus.PENDING,
      retryable: false,
    });

    const claim = await this.rewards.claimRewardEvaluation(candidate.matchId, candidate.placement);
    if (!claim) return;

    const checkedAt = new Date();
    if (!candidate.userId) {
      await this.rewards.completeRewardEvaluation(claim.id, {
        walletAddress: null,
        amount: 0,
        eligible: false,
        eligibilityCheckedAt: checkedAt,
        ineligibilityReason: RewardIneligibilityReason.USER_NOT_AUTHENTICATED,
        status: RewardStatus.NOT_ELIGIBLE,
      });
      return;
    }

    const wallet = await this.rewards.findVerifiedWallet(candidate.userId);
    if (!wallet) {
      await this.rewards.completeRewardEvaluation(claim.id, {
        walletAddress: null,
        amount: 0,
        eligible: false,
        eligibilityCheckedAt: checkedAt,
        ineligibilityReason: RewardIneligibilityReason.WALLET_NOT_LINKED,
        status: RewardStatus.NOT_ELIGIBLE,
      });
      return;
    }

    if (!wallet.verifiedAt) {
      await this.rewards.completeRewardEvaluation(claim.id, {
        walletAddress: wallet.address,
        amount: 0,
        eligible: false,
        eligibilityCheckedAt: checkedAt,
        ineligibilityReason: RewardIneligibilityReason.WALLET_NOT_VERIFIED,
        status: RewardStatus.NOT_ELIGIBLE,
      });
      return;
    }

    try {
      const balance = await this.solana.getTokenBalance(wallet.address, mint);
      const decimals = balance.decimals;
      const minimumRaw = tokensToRaw(MINIMUM_HOLDER_BALANCE_TOKENS, decimals);
      const balanceRaw = balance.amountRaw;
      const tokenBalanceChecked = rawToTokenDecimalString(balanceRaw, decimals);

      if (balanceRaw < minimumRaw) {
        await this.rewards.completeRewardEvaluation(claim.id, {
          walletAddress: wallet.address,
          amount: 0,
          tokenDecimals: decimals,
          tokenBalanceChecked,
          eligible: false,
          eligibilityCheckedAt: checkedAt,
          ineligibilityReason: RewardIneligibilityReason.INSUFFICIENT_TOKEN_BALANCE,
          status: RewardStatus.NOT_ELIGIBLE,
        });
        return;
      }

      const reserved = await this.rewards.tryReserveDailyAmount(
        {
          userId: candidate.userId,
          walletAddress: wallet.address,
          mint,
          rewardDate: rewardDateInBogota(checkedAt),
        },
        potentialAmount,
        DAILY_REWARD_LIMIT_TOKENS,
      );

      if (!reserved) {
        await this.rewards.completeRewardEvaluation(claim.id, {
          walletAddress: wallet.address,
          amount: 0,
          tokenDecimals: decimals,
          tokenBalanceChecked,
          eligible: false,
          eligibilityCheckedAt: checkedAt,
          ineligibilityReason: RewardIneligibilityReason.DAILY_LIMIT_REACHED,
          status: RewardStatus.DAILY_LIMIT_REACHED,
        });
        return;
      }

      await this.rewards.completeRewardEvaluation(claim.id, {
        walletAddress: wallet.address,
        amount: potentialAmount,
        tokenDecimals: decimals,
        tokenBalanceChecked,
        eligible: true,
        eligibilityCheckedAt: checkedAt,
        ineligibilityReason: null,
        status: RewardStatus.PENDING,
        retryable: false,
      });
    } catch (error) {
      await this.rewards.completeRewardEvaluation(claim.id, this.buildGatewayFailure(wallet.address, error, checkedAt));
    }
  }

  /** Builds the `RewardLog` update for an eligibility-check failure caused by the Solana gateway/RPC rather than the wallet's balance. */
  private buildGatewayFailure(walletAddress: string, error: unknown, checkedAt: Date) {
    const gatewayError = error instanceof SolanaGatewayError
      ? error
      : new SolanaGatewayError(
          SolanaGatewayErrorCode.TEMPORARY_RPC_ERROR,
          error instanceof Error ? error.message : 'Solana gateway failed',
          true,
        );

    return {
      walletAddress,
      amount: 0,
      eligible: false,
      eligibilityCheckedAt: checkedAt,
      status: gatewayError.retryable ? RewardStatus.FAILED : RewardStatus.MANUAL_REVIEW,
      retryable: gatewayError.retryable,
      retryCountIncrement: 1,
      nextRetryAt: gatewayError.retryable ? new Date(Date.now() + 60_000) : null,
      errorCode: gatewayError.code,
      errorMessage: gatewayError.message,
    };
  }
}

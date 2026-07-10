import { Injectable } from '@nestjs/common';
import { Prisma, RewardIneligibilityReason, RewardStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  DAILY_REWARD_LIMIT_TOKENS,
} from './rewards.config';
import {
  DailyRewardLimitKey,
  RewardLogDraft,
  buildRewardIdempotencyKey,
  rewardDateInBogota,
} from './rewards.types';

/** Fields written to a `RewardLog` row once eligibility has been (re-)evaluated. */
export interface RewardEvaluationUpdate {
  walletAddress?: string | null;
  amount: Prisma.Decimal.Value;
  tokenDecimals?: number | null;
  tokenBalanceChecked?: Prisma.Decimal.Value | null;
  eligible: boolean;
  eligibilityCheckedAt: Date;
  ineligibilityReason?: RewardIneligibilityReason | null;
  status: RewardStatus;
  retryable?: boolean;
  retryCountIncrement?: number;
  nextRetryAt?: Date | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}

/** A reward row locked for payment processing (via {@link RewardsRepository.claimPendingRewards} or {@link RewardsRepository.findSubmittedRewards}). */
export interface ClaimedReward {
  id: string;
  matchId: string;
  userId: string | null;
  placement: number;
  walletAddress: string | null;
  amount: Prisma.Decimal;
  mint: string;
  tokenDecimals: number | null;
  retryCount: number;
  transactionSignature: string | null;
}

/**
 * PostgreSQL-backed source of truth for reward idempotency, daily budget reservations,
 * retry state and transaction signatures. Redis must never be used for reward consistency.
 */
@Injectable()
export class RewardsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Finds a user's oldest verified Phantom wallet, checking linked `Wallet` rows first, then legacy `AuthAccount` wallet links. */
  async findVerifiedWallet(userId: string): Promise<{ address: string; verifiedAt: Date | null } | null> {
    const wallet = await this.prisma.wallet.findFirst({
      where: {
        userId,
        provider: 'PHANTOM',
        revokedAt: null,
      },
      select: {
        address: true,
        verifiedAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    if (wallet) return wallet;

    const account = await this.prisma.authAccount.findFirst({
      where: {
        userId,
        provider: 'PHANTOM',
        walletAddress: { not: null },
      },
      select: {
        walletAddress: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return account?.walletAddress
      ? { address: account.walletAddress, verifiedAt: account.createdAt }
      : null;
  }

  /** Creates the one `RewardLog` row for a `(matchId, placement)` idempotency key, or leaves the existing row untouched if it already exists. */
  async upsertRewardLog(draft: RewardLogDraft) {
    const idempotencyKey = buildRewardIdempotencyKey(draft.matchId, draft.placement);
    return this.prisma.rewardLog.upsert({
      where: { idempotencyKey },
      create: {
        matchId: draft.matchId,
        userId: draft.userId,
        placement: draft.placement,
        walletAddress: draft.walletAddress,
        potentialAmount: new Prisma.Decimal(draft.potentialAmount),
        amount: new Prisma.Decimal(draft.amount),
        mint: draft.mint,
        tokenDecimals: draft.tokenDecimals ?? null,
        tokenBalanceChecked: draft.tokenBalanceChecked == null
          ? null
          : new Prisma.Decimal(draft.tokenBalanceChecked),
        eligible: draft.eligible,
        eligibilityCheckedAt: draft.eligibilityCheckedAt ?? null,
        ineligibilityReason: draft.ineligibilityReason ?? null,
        status: draft.status,
        idempotencyKey,
        retryable: draft.retryable ?? false,
        asset: draft.mint,
      },
      update: {},
    });
  }

  /**
   * Atomically claims a reward row for eligibility (re-)evaluation: matches rows that were
   * never evaluated, or were left in a retryable failure state, and whose processing lease
   * (`processingStartedAt`) is empty or stale. Returns `null` if another worker already holds it.
   */
  async claimRewardEvaluation(matchId: string, placement: number): Promise<{ id: string } | null> {
    const idempotencyKey = buildRewardIdempotencyKey(matchId, placement);
    const staleProcessingBefore = new Date(Date.now() - 10 * 60 * 1000);
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      UPDATE "RewardLog"
      SET
        "processingStartedAt" = CURRENT_TIMESTAMP,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "idempotencyKey" = ${idempotencyKey}
        AND (
          "eligibilityCheckedAt" IS NULL
          OR (
            "status" = 'FAILED'
            AND "retryable" = true
            AND ("nextRetryAt" IS NULL OR "nextRetryAt" <= CURRENT_TIMESTAMP)
          )
        )
        AND (
          "processingStartedAt" IS NULL
          OR "processingStartedAt" < ${staleProcessingBefore}
        )
      RETURNING "id"
    `;
    return rows[0] ?? null;
  }

  /** Writes the outcome of an eligibility evaluation back onto the claimed `RewardLog` row and releases the processing lease. */
  async completeRewardEvaluation(id: string, update: RewardEvaluationUpdate): Promise<void> {
    await this.prisma.rewardLog.update({
      where: { id },
      data: {
        walletAddress: update.walletAddress,
        amount: new Prisma.Decimal(update.amount),
        tokenDecimals: update.tokenDecimals ?? null,
        tokenBalanceChecked: update.tokenBalanceChecked == null
          ? null
          : new Prisma.Decimal(update.tokenBalanceChecked),
        eligible: update.eligible,
        eligibilityCheckedAt: update.eligibilityCheckedAt,
        ineligibilityReason: update.ineligibilityReason ?? null,
        status: update.status,
        retryable: update.retryable ?? false,
        retryCount: update.retryCountIncrement ? { increment: update.retryCountIncrement } : undefined,
        nextRetryAt: update.nextRetryAt ?? null,
        errorCode: update.errorCode ?? null,
        errorMessage: update.errorMessage ?? null,
        processingStartedAt: null,
      },
    });
  }

  /** Unconditionally adds `amount` to the day's reserved total, creating the bucket row if needed. Does not enforce the daily cap. */
  async reserveDailyAmount(key: DailyRewardLimitKey, amount: Prisma.Decimal.Value): Promise<void> {
    const id = randomUUID();
    await this.prisma.$executeRaw`
      INSERT INTO "DailyRewardLimit" (
        "id",
        "userId",
        "walletAddress",
        "mint",
        "rewardDate",
        "reservedAmount",
        "sentAmount",
        "cancelledAmount",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${id}::uuid,
        ${key.userId}::uuid,
        ${key.walletAddress},
        ${key.mint},
        ${key.rewardDate}::date,
        ${amount}::numeric,
        0,
        0,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT ("userId", "walletAddress", "mint", "rewardDate")
      DO UPDATE SET
        "reservedAmount" = "DailyRewardLimit"."reservedAmount" + ${amount}::numeric,
        "updatedAt" = CURRENT_TIMESTAMP
    `;
  }

  /**
   * Atomically reserves `amount` against the user's daily budget only if the resulting total
   * stays within `dailyLimit`, using an upsert-then-conditional-UPDATE so concurrent reservations
   * can't both pass the cap check. Returns whether the reservation succeeded.
   */
  async tryReserveDailyAmount(
    key: DailyRewardLimitKey,
    amount: Prisma.Decimal.Value,
    dailyLimit: Prisma.Decimal.Value,
  ): Promise<boolean> {
    const id = randomUUID();
    await this.prisma.$executeRaw`
      INSERT INTO "DailyRewardLimit" (
        "id",
        "userId",
        "walletAddress",
        "mint",
        "rewardDate",
        "reservedAmount",
        "sentAmount",
        "cancelledAmount",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${id}::uuid,
        ${key.userId}::uuid,
        ${key.walletAddress},
        ${key.mint},
        ${key.rewardDate}::date,
        0,
        0,
        0,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT ("userId", "walletAddress", "mint", "rewardDate")
      DO NOTHING
    `;

    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      UPDATE "DailyRewardLimit"
      SET
        "reservedAmount" = "reservedAmount" + ${amount}::numeric,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "userId" = ${key.userId}::uuid
        AND "walletAddress" = ${key.walletAddress}
        AND "mint" = ${key.mint}
        AND "rewardDate" = ${key.rewardDate}::date
        AND ("reservedAmount" + ${amount}::numeric) <= ${dailyLimit}::numeric
      RETURNING "id"
    `;
    return rows.length === 1;
  }

  /** Moves `amount` from reserved to cancelled for the day's bucket, freeing budget for a reward that will no longer be paid. */
  async releaseDailyAmount(key: DailyRewardLimitKey, amount: Prisma.Decimal.Value): Promise<void> {
    await this.releaseDailyAmountWithClient(this.prisma, key, amount);
  }

  /**
   * Atomically claims up to `batchSize` payable rewards (`PENDING`, or `FAILED` + retryable
   * with retries remaining and past their backoff) using `FOR UPDATE SKIP LOCKED` so concurrent
   * processor instances never claim the same row.
   */
  async claimPendingRewards(batchSize: number, maxRetries: number): Promise<ClaimedReward[]> {
    return this.prisma.$queryRaw<ClaimedReward[]>`
      UPDATE "RewardLog"
      SET
        "status" = 'PROCESSING',
        "processingStartedAt" = CURRENT_TIMESTAMP,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" IN (
        SELECT "id"
        FROM "RewardLog"
        WHERE "eligible" = true
          AND "amount" > 0
          AND "userId" IS NOT NULL
          AND "walletAddress" IS NOT NULL
          AND "mint" <> ''
          AND (
            "status" = 'PENDING'
            OR (
              "status" = 'FAILED'
              AND "retryable" = true
              AND "retryCount" < ${maxRetries}
              AND ("nextRetryAt" IS NULL OR "nextRetryAt" <= CURRENT_TIMESTAMP)
            )
          )
        ORDER BY "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${batchSize}
      )
      RETURNING
        "id",
        "matchId",
        "userId",
        "placement",
        "walletAddress",
        "amount",
        "mint",
        "tokenDecimals",
        "retryCount",
        "transactionSignature"
    `;
  }

  /** Records that a transfer transaction was sent on-chain but not yet confirmed. */
  async markSubmitted(id: string, signature: string): Promise<void> {
    await this.prisma.rewardLog.update({
      where: { id },
      data: {
        status: RewardStatus.SUBMITTED,
        transactionSignature: signature,
        transactionId: signature,
        submittedAt: new Date(),
        processingStartedAt: null,
        retryable: false,
        errorCode: null,
        errorMessage: null,
      },
    });
  }

  /** Marks a reward as confirmed on-chain and paid. */
  async markSent(id: string): Promise<void> {
    await this.prisma.$transaction(async tx => {
      const reward = await tx.rewardLog.findUnique({
        where: { id },
        select: {
          userId: true,
          walletAddress: true,
          mint: true,
          amount: true,
          eligible: true,
          status: true,
          eligibilityCheckedAt: true,
          createdAt: true,
        },
      });

      await tx.rewardLog.update({
        where: { id },
        data: {
          status: RewardStatus.SENT,
          confirmedAt: new Date(),
          processingStartedAt: null,
          retryable: false,
          errorCode: null,
          errorMessage: null,
        },
      });

      if (reward && reward.status !== RewardStatus.SENT) {
        await this.recordSentAmountForReward(tx, reward);
      }
    });
  }

  /** Records a failed transfer/reconciliation attempt on the same row, either scheduling a retry or forcing manual review. */
  async markFailed(
    id: string,
    params: {
      retryable: boolean;
      errorCode: string;
      errorMessage: string;
      retryCountIncrement?: number;
      nextRetryAt?: Date | null;
      maxRetries?: number;
    },
  ): Promise<void> {
    const nextRetryCount = (params.retryCountIncrement ?? 0) > 0
      ? { increment: params.retryCountIncrement }
      : undefined;
    await this.prisma.$transaction(async tx => {
      const reward = await tx.rewardLog.findUnique({
        where: { id },
        select: {
          userId: true,
          walletAddress: true,
          mint: true,
          amount: true,
          eligible: true,
          status: true,
          retryable: true,
          transactionSignature: true,
          eligibilityCheckedAt: true,
          createdAt: true,
        },
      });

      await tx.rewardLog.update({
        where: { id },
        data: {
          status: params.maxRetries === 0 ? RewardStatus.MANUAL_REVIEW : RewardStatus.FAILED,
          failedAt: new Date(),
          processingStartedAt: null,
          retryable: params.retryable,
          retryCount: nextRetryCount,
          nextRetryAt: params.nextRetryAt ?? null,
          errorCode: params.errorCode,
          errorMessage: params.errorMessage,
        },
      });

      if (!params.retryable) await this.releaseReservedAmountForTerminalReward(tx, reward);
    });
  }

  /** Parks a reward in `MANUAL_REVIEW`, taking it out of the automatic retry loop until an operator resolves it. */
  async markManualReview(id: string, errorCode: string, errorMessage: string): Promise<void> {
    await this.prisma.$transaction(async tx => {
      const reward = await tx.rewardLog.findUnique({
        where: { id },
        select: {
          userId: true,
          walletAddress: true,
          mint: true,
          amount: true,
          eligible: true,
          status: true,
          retryable: true,
          transactionSignature: true,
          eligibilityCheckedAt: true,
          createdAt: true,
        },
      });

      await tx.rewardLog.update({
        where: { id },
        data: {
          status: RewardStatus.MANUAL_REVIEW,
          failedAt: new Date(),
          processingStartedAt: null,
          retryable: false,
          nextRetryAt: null,
          errorCode,
          errorMessage,
        },
      });

      await this.releaseReservedAmountForTerminalReward(tx, reward);
    });
  }

  /** Fetches rewards awaiting on-chain confirmation, oldest first, so `SUBMITTED` rewards can be reconciled before any resend. */
  async findSubmittedRewards(batchSize: number): Promise<ClaimedReward[]> {
    return this.prisma.rewardLog.findMany({
      where: {
        status: RewardStatus.SUBMITTED,
        transactionSignature: { not: null },
      },
      orderBy: { submittedAt: 'asc' },
      take: batchSize,
    }) as unknown as ClaimedReward[];
  }

  /** Operator action: resets a `MANUAL_REVIEW`/failed reward back to `PENDING` so the processor picks it up again. */
  async retryManually(id: string): Promise<void> {
    await this.prisma.$transaction(async tx => {
      const reward = await tx.rewardLog.findUnique({
        where: { id },
        select: {
          userId: true,
          walletAddress: true,
          mint: true,
          amount: true,
          eligible: true,
          status: true,
          retryable: true,
          transactionSignature: true,
          eligibilityCheckedAt: true,
          createdAt: true,
        },
      });

      if (reward && this.shouldReserveDailyReservationOnRetry(reward)) {
        const reserved = await this.tryReserveDailyAmountWithClient(tx, {
          userId: reward.userId,
          walletAddress: reward.walletAddress,
          mint: reward.mint,
          rewardDate: rewardDateInBogota(reward.eligibilityCheckedAt ?? reward.createdAt),
        }, reward.amount, DAILY_REWARD_LIMIT_TOKENS);
        if (!reserved) {
          await tx.rewardLog.update({
            where: { id },
            data: {
              status: RewardStatus.DAILY_LIMIT_REACHED,
              retryable: false,
              nextRetryAt: null,
              processingStartedAt: null,
              errorCode: 'DAILY_LIMIT_REACHED',
              errorMessage: 'Daily reward limit would be exceeded by this manual retry',
            },
          });
          return;
        }
      }

      await tx.rewardLog.update({
        where: { id },
        data: {
          status: RewardStatus.PENDING,
          retryable: false,
          nextRetryAt: null,
          processingStartedAt: null,
          errorCode: null,
          errorMessage: null,
        },
      });
    });
  }

  private async recordSentAmountForReward(
    tx: Prisma.TransactionClient,
    reward: {
      userId: string | null;
      walletAddress: string | null;
      mint: string;
      amount: Prisma.Decimal;
      eligible: boolean;
      eligibilityCheckedAt: Date | null;
      createdAt: Date;
    },
  ): Promise<void> {
    if (!reward.eligible || !reward.userId || !reward.walletAddress || !reward.amount.gt(0)) return;
    await this.recordSentAmountWithClient(tx, {
      userId: reward.userId,
      walletAddress: reward.walletAddress,
      mint: reward.mint,
      rewardDate: rewardDateInBogota(reward.eligibilityCheckedAt ?? reward.createdAt),
    }, reward.amount);
  }

  private async releaseReservedAmountForTerminalReward(
    tx: Prisma.TransactionClient,
    reward: {
      userId: string | null;
      walletAddress: string | null;
      mint: string;
      amount: Prisma.Decimal;
      eligible: boolean;
      status: RewardStatus;
      retryable: boolean;
      transactionSignature: string | null;
      eligibilityCheckedAt: Date | null;
      createdAt: Date;
    } | null,
  ): Promise<void> {
    if (!reward || !this.shouldReleaseDailyReservation(reward)) return;
    await this.releaseDailyAmountWithClient(tx, {
      userId: reward.userId,
      walletAddress: reward.walletAddress,
      mint: reward.mint,
      rewardDate: rewardDateInBogota(reward.eligibilityCheckedAt ?? reward.createdAt),
    }, reward.amount);
  }

  private shouldReleaseDailyReservation(reward: {
    userId: string | null;
    walletAddress: string | null;
    amount: Prisma.Decimal;
    eligible: boolean;
    status: RewardStatus;
    retryable: boolean;
    transactionSignature: string | null;
  }): reward is typeof reward & { userId: string; walletAddress: string } {
    if (!reward.eligible || !reward.userId || !reward.walletAddress || !reward.amount.gt(0)) return false;
    if (reward.transactionSignature) return false;
    return reward.status === RewardStatus.PENDING
      || reward.status === RewardStatus.PROCESSING
      || (reward.status === RewardStatus.FAILED && reward.retryable);
  }

  private shouldReserveDailyReservationOnRetry(reward: {
    userId: string | null;
    walletAddress: string | null;
    amount: Prisma.Decimal;
    eligible: boolean;
    status: RewardStatus;
    retryable: boolean;
    transactionSignature: string | null;
  }): reward is typeof reward & { userId: string; walletAddress: string } {
    if (!reward.eligible || !reward.userId || !reward.walletAddress || !reward.amount.gt(0)) return false;
    if (reward.transactionSignature) return false;
    return reward.status === RewardStatus.MANUAL_REVIEW
      || (reward.status === RewardStatus.FAILED && !reward.retryable);
  }

  private async tryReserveDailyAmountWithClient(
    tx: Pick<Prisma.TransactionClient, '$executeRaw' | '$queryRaw'>,
    key: DailyRewardLimitKey,
    amount: Prisma.Decimal.Value,
    dailyLimit: Prisma.Decimal.Value,
  ): Promise<boolean> {
    const id = randomUUID();
    await tx.$executeRaw`
      INSERT INTO "DailyRewardLimit" (
        "id",
        "userId",
        "walletAddress",
        "mint",
        "rewardDate",
        "reservedAmount",
        "sentAmount",
        "cancelledAmount",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${id}::uuid,
        ${key.userId}::uuid,
        ${key.walletAddress},
        ${key.mint},
        ${key.rewardDate}::date,
        0,
        0,
        0,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT ("userId", "walletAddress", "mint", "rewardDate")
      DO NOTHING
    `;

    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      UPDATE "DailyRewardLimit"
      SET
        "reservedAmount" = "reservedAmount" + ${amount}::numeric,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "userId" = ${key.userId}::uuid
        AND "walletAddress" = ${key.walletAddress}
        AND "mint" = ${key.mint}
        AND "rewardDate" = ${key.rewardDate}::date
        AND ("reservedAmount" + ${amount}::numeric) <= ${dailyLimit}::numeric
      RETURNING "id"
    `;
    return rows.length === 1;
  }

  private async recordSentAmountWithClient(
    tx: Pick<Prisma.TransactionClient, '$executeRaw'>,
    key: DailyRewardLimitKey,
    amount: Prisma.Decimal.Value,
  ): Promise<void> {
    const id = randomUUID();
    await tx.$executeRaw`
      INSERT INTO "DailyRewardLimit" (
        "id",
        "userId",
        "walletAddress",
        "mint",
        "rewardDate",
        "reservedAmount",
        "sentAmount",
        "cancelledAmount",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${id}::uuid,
        ${key.userId}::uuid,
        ${key.walletAddress},
        ${key.mint},
        ${key.rewardDate}::date,
        0,
        ${amount}::numeric,
        0,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT ("userId", "walletAddress", "mint", "rewardDate")
      DO UPDATE SET
        "sentAmount" = "DailyRewardLimit"."sentAmount" + ${amount}::numeric,
        "updatedAt" = CURRENT_TIMESTAMP
    `;
  }

  private async releaseDailyAmountWithClient(
    tx: Pick<Prisma.TransactionClient, '$executeRaw'>,
    key: DailyRewardLimitKey,
    amount: Prisma.Decimal.Value,
  ): Promise<void> {
    await tx.$executeRaw`
      UPDATE "DailyRewardLimit"
      SET
        "reservedAmount" = GREATEST("reservedAmount" - ${amount}::numeric, 0),
        "cancelledAmount" = "cancelledAmount" + ${amount}::numeric,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "userId" = ${key.userId}::uuid
        AND "walletAddress" = ${key.walletAddress}
        AND "mint" = ${key.mint}
        AND "rewardDate" = ${key.rewardDate}::date
    `;
  }
}

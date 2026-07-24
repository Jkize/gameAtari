import { RewardIneligibilityReason, RewardStatus } from '@prisma/client';
import { REWARD_TIME_ZONE, RewardedPlacement } from './rewards.config';

export type { RewardedPlacement } from './rewards.config';

/** A finished-match player eligible for reward evaluation, keyed by match and placement. */
export interface RewardCandidate {
  matchId: string;
  userId: string | null;
  placement: RewardedPlacement;
  amount: number;
}

/** Initial (pre-evaluation) values used to create or reuse a `RewardLog` row. */
export interface RewardLogDraft {
  matchId: string;
  userId: string | null;
  placement: RewardedPlacement;
  walletAddress: string | null;
  potentialAmount: number;
  amount: number;
  mint: string;
  tokenDecimals?: number | null;
  eligible: boolean;
  eligibilityCheckedAt?: Date | null;
  tokenBalanceChecked?: string | null;
  ineligibilityReason?: RewardIneligibilityReason | null;
  status: RewardStatus;
  retryable?: boolean;
  errorCode?: string | null;
  errorMessage?: string | null;
}

/** Identifies one user's daily reward budget bucket for a given wallet, mint and reward date. */
export interface DailyRewardLimitKey {
  userId: string;
  walletAddress: string;
  mint: string;
  rewardDate: Date;
}

/** Builds the deterministic idempotency key for a `(matchId, placement)` reward, e.g. `MATCH_REWARD:{matchId}:{placement}`. */
export function buildRewardIdempotencyKey(matchId: string, placement: number): string {
  return `MATCH_REWARD:${matchId}:${placement}`;
}

/** Returns midnight UTC for "today" as observed in {@link REWARD_TIME_ZONE}, used as the daily-limit bucket date. */
export function rewardDateInBogota(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: REWARD_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (type: string) => parts.find(part => part.type === type)?.value;
  return new Date(`${value('year')}-${value('month')}-${value('day')}T00:00:00.000Z`);
}

/** Multiplier to convert a whole-token amount into the mint's smallest raw unit. */
export function decimalFactor(decimals: number): bigint {
  return 10n ** BigInt(decimals);
}

/** Converts a whole-token amount (e.g. `10000`) into raw bigint units for the given mint decimals. */
export function tokensToRaw(tokens: number, decimals: number): bigint {
  return BigInt(tokens) * decimalFactor(decimals);
}

/** Converts raw bigint units into a human-readable decimal string, trimming trailing zeroes. */
export function rawToTokenDecimalString(raw: bigint, decimals: number): string {
  const factor = decimalFactor(decimals);
  const whole = raw / factor;
  const fraction = raw % factor;
  if (decimals === 0) return whole.toString();
  const fractionText = fraction.toString().padStart(decimals, '0').replace(/0+$/, '');
  return fractionText ? `${whole}.${fractionText}` : whole.toString();
}

/** Converts a decimal-string token amount (e.g. from `RewardLog.amount`) into raw bigint units for a transfer. */
export function tokenDecimalStringToRaw(value: string, decimals: number): bigint {
  const [wholePart, fractionPart = ''] = value.split('.');
  const normalizedFraction = fractionPart.padEnd(decimals, '0').slice(0, decimals);
  const whole = BigInt(wholePart || '0') * decimalFactor(decimals);
  const fraction = normalizedFraction ? BigInt(normalizedFraction) : 0n;
  return whole + fraction;
}

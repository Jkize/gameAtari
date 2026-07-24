export const REWARDED_PLACEMENTS = [1, 2, 3] as const;
export type RewardedPlacement = (typeof REWARDED_PLACEMENTS)[number];

export interface RewardPrize {
  placement: RewardedPlacement;
  amount: number;
}

interface RewardFormula {
  placement: RewardedPlacement;
  baseAmount: number;
  amountPerAdditionalPlayer: number;
}

interface RewardTier {
  minimumPlayers: number;
  maximumPlayers: number;
  baselinePlayers: number;
  prizes: readonly RewardFormula[];
}

/**
 * Phase-one proportional reward rules.
 *
 * - Fewer than 4 players: no rewards.
 * - 4 players: first place receives 400.
 * - 5-8 players: first and second place grow with every player.
 * - 9-16 players: the top three places grow with every player.
 *
 * A missed or ineligible prize is never redistributed to another placement.
 */
export const REWARD_PHASE_ONE_CONFIG = {
  phase: 1,
  minimumPlayers: 4,
  maximumPlayers: 16,
  tiers: [
    {
      minimumPlayers: 4,
      maximumPlayers: 4,
      baselinePlayers: 4,
      prizes: [
        { placement: 1, baseAmount: 400, amountPerAdditionalPlayer: 0 },
      ],
    },
    {
      minimumPlayers: 5,
      maximumPlayers: 8,
      baselinePlayers: 4,
      prizes: [
        { placement: 1, baseAmount: 400, amountPerAdditionalPlayer: 75 },
        { placement: 2, baseAmount: 0, amountPerAdditionalPlayer: 50 },
      ],
    },
    {
      minimumPlayers: 9,
      maximumPlayers: 16,
      baselinePlayers: 8,
      prizes: [
        { placement: 1, baseAmount: 700, amountPerAdditionalPlayer: 50 },
        { placement: 2, baseAmount: 200, amountPerAdditionalPlayer: 35 },
        { placement: 3, baseAmount: 50, amountPerAdditionalPlayer: 25 },
      ],
    },
  ] satisfies readonly RewardTier[],
} as const;

/** Resolves and freezes the prize podium for the number of players that started a match. */
export function rewardPrizesForPlayerCount(playerCount: number): RewardPrize[] {
  if (!Number.isFinite(playerCount)) return [];
  const normalizedCount = Math.min(
    REWARD_PHASE_ONE_CONFIG.maximumPlayers,
    Math.max(0, Math.floor(playerCount)),
  );
  const tier = REWARD_PHASE_ONE_CONFIG.tiers.find(
    candidate =>
      normalizedCount >= candidate.minimumPlayers
      && normalizedCount <= candidate.maximumPlayers,
  );
  if (!tier) return [];

  const additionalPlayers = normalizedCount - tier.baselinePlayers;
  return tier.prizes.map(prize => ({
    placement: prize.placement,
    amount: prize.baseAmount + prize.amountPerAdditionalPlayer * additionalPlayers,
  }));
}

/** Public exact schedule consumed by clients; formulas remain centralized above. */
export const REWARD_PHASE_ONE_SCHEDULE = Array.from(
  {
    length:
      REWARD_PHASE_ONE_CONFIG.maximumPlayers
      - REWARD_PHASE_ONE_CONFIG.minimumPlayers
      + 1,
  },
  (_, index) => {
    const playerCount = REWARD_PHASE_ONE_CONFIG.minimumPlayers + index;
    return {
      playerCount,
      prizes: rewardPrizesForPlayerCount(playerCount),
    };
  },
);

/** Maximum tokens a single wallet/user may be rewarded within one reward date (see {@link REWARD_TIME_ZONE}). */
export const DAILY_REWARD_LIMIT_TOKENS = 10_000;
/** Minimum token balance a wallet must hold at match end to be eligible for a reward. */
export const MINIMUM_HOLDER_BALANCE_TOKENS = 10_000;
/** Timezone used to compute the reward "day" boundary for the daily limit. */
export const REWARD_TIME_ZONE = 'America/Bogota';
/** Env var name used to toggle reward processing on/off. */
export const REWARDS_ENABLED_ENV = 'REWARDS_ENABLED';
/** Default interval for the reward processor polling loop. Can be overridden with `REWARD_PROCESSOR_INTERVAL_MS`. */
export const DEFAULT_REWARD_PROCESSOR_INTERVAL_MS = 15_000;
/** Default number of payable rewards claimed per processor tick. Can be overridden with `REWARD_PROCESSOR_BATCH_SIZE`. */
export const DEFAULT_REWARD_PROCESSOR_BATCH_SIZE = 10;
/** Default max automatic retries before a reward moves to manual review. Can be overridden with `REWARD_MAX_RETRIES`. */
export const DEFAULT_REWARD_MAX_RETRIES = 10;

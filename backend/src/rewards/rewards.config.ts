/** Fixed SPL token prize per top-3 placement. A missed prize is never redistributed to another placement. */
export const REWARD_AMOUNTS_BY_PLACEMENT = {
  1: 1000,
  2: 400,
  3: 250,
} as const;

/** Maximum tokens a single wallet/user may be rewarded within one reward date (see {@link REWARD_TIME_ZONE}). */
export const DAILY_REWARD_LIMIT_TOKENS = 10_000;
/** Minimum token balance a wallet must hold at match end to be eligible for a reward. */
export const MINIMUM_HOLDER_BALANCE_TOKENS = 10_000;
/** Timezone used to compute the reward "day" boundary for the daily limit. */
export const REWARD_TIME_ZONE = 'America/Bogota';
/** Env var name used to toggle reward processing on/off. */
export const REWARDS_ENABLED_ENV = 'REWARDS_ENABLED';
/** Default interval for the reward processor polling loop. Can be overridden with `REWARD_PROCESSOR_INTERVAL_MS`. */
export const DEFAULT_REWARD_PROCESSOR_INTERVAL_MS = 30_000;
/** Default number of payable rewards claimed per processor tick. Can be overridden with `REWARD_PROCESSOR_BATCH_SIZE`. */
export const DEFAULT_REWARD_PROCESSOR_BATCH_SIZE = 10;
/** Default max automatic retries before a reward moves to manual review. Can be overridden with `REWARD_MAX_RETRIES`. */
export const DEFAULT_REWARD_MAX_RETRIES = 10;

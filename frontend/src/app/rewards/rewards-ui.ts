import { RewardIneligibilityReason, RewardStatus } from './rewards.models';

export function rewardStatusLabel(status?: RewardStatus | null): string {
  switch (status) {
    case 'REWARDS_DISABLED': return 'rewards.status.rewardsDisabled';
    case 'NOT_ELIGIBLE': return 'rewards.status.notEligible';
    case 'DAILY_LIMIT_REACHED': return 'rewards.status.dailyLimitReached';
    case 'PENDING': return 'rewards.status.pending';
    case 'PROCESSING': return 'rewards.status.processing';
    case 'SUBMITTED': return 'rewards.status.submitted';
    case 'SENT': return 'rewards.status.sent';
    case 'FAILED': return 'rewards.status.failed';
    case 'MANUAL_REVIEW': return 'rewards.status.manualReview';
    case 'CANCELLED': return 'rewards.status.cancelled';
    default: return 'rewards.status.none';
  }
}

export function rewardStatusClass(status?: RewardStatus | null): string {
  switch (status) {
    case 'SENT': return 'ok';
    case 'PENDING':
    case 'PROCESSING':
    case 'SUBMITTED': return 'pending';
    case 'FAILED':
    case 'MANUAL_REVIEW': return 'warn';
    case 'NOT_ELIGIBLE':
    case 'REWARDS_DISABLED':
    case 'DAILY_LIMIT_REACHED':
    case 'CANCELLED': return 'muted';
    default: return 'muted';
  }
}

export function ineligibilityReasonLabel(reason?: RewardIneligibilityReason | null): string {
  switch (reason) {
    case 'USER_NOT_AUTHENTICATED': return 'rewards.ineligibility.userNotAuthenticated';
    case 'WALLET_NOT_LINKED': return 'rewards.ineligibility.walletNotLinked';
    case 'WALLET_NOT_VERIFIED': return 'rewards.ineligibility.walletNotVerified';
    case 'INSUFFICIENT_TOKEN_BALANCE': return 'rewards.ineligibility.insufficientBalance';
    case 'DAILY_LIMIT_REACHED': return 'rewards.ineligibility.dailyLimitReached';
    default: return 'rewards.ineligibility.none';
  }
}

export function publicRewardLabel(status?: RewardStatus | null): string {
  if (status === 'REWARDS_DISABLED') return 'rewards.status.rewardsDisabled';
  if (status === 'SENT') return 'rewards.status.sent';
  if (status === 'PENDING' || status === 'PROCESSING' || status === 'SUBMITTED') return 'rewards.publicStatus.pending';
  if (status === 'FAILED' || status === 'MANUAL_REVIEW') return 'rewards.status.manualReview';
  if (status === 'DAILY_LIMIT_REACHED') return 'rewards.status.notEligible';
  if (status === 'NOT_ELIGIBLE') return 'rewards.status.notEligible';
  return 'rewards.status.none';
}

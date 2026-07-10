export type RewardStatus =
  | 'NOT_ELIGIBLE'
  | 'DAILY_LIMIT_REACHED'
  | 'PENDING'
  | 'PROCESSING'
  | 'SUBMITTED'
  | 'SENT'
  | 'FAILED'
  | 'MANUAL_REVIEW'
  | 'CANCELLED';

export type RewardIneligibilityReason =
  | 'USER_NOT_AUTHENTICATED'
  | 'WALLET_NOT_LINKED'
  | 'WALLET_NOT_VERIFIED'
  | 'INSUFFICIENT_TOKEN_BALANCE'
  | 'DAILY_LIMIT_REACHED';

export interface RewardSummary {
  placement: number;
  potentialAmount: number;
  amount: number;
  eligible: boolean;
  status: RewardStatus;
  ineligibilityReason?: RewardIneligibilityReason | null;
  solscanUrl?: string | null;
}

export interface PersonalMatchHistoryItem {
  matchId: string;
  playedAt: string;
  mapName?: string | null;
  placement: number;
  playerCount: number;
  kills: number;
  damageDealt: number;
  winner: boolean;
  reward?: RewardSummary | null;
}

export interface PublicRewardPlayer {
  userId?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  placement: number;
  reward?: RewardSummary | null;
}

export interface PublicMatchHistoryItem {
  matchId: string;
  playedAt: string;
  mapName?: string | null;
  playerCount: number;
  podium: PublicRewardPlayer[];
}

export interface PublicMatchDetailPlayer {
  userId?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  placement: number;
  kills: number;
  damageDealt: number;
  winner: boolean;
  reward?: RewardSummary | null;
}

export interface PublicMatchDetail {
  matchId: string;
  playedAt: string;
  mapName?: string | null;
  playerCount: number;
  players: PublicMatchDetailPlayer[];
}

export interface PagedResult<T> {
  items: T[];
  nextCursor?: string | null;
}

export interface WalletStatus {
  currentProvider: 'GOOGLE' | 'PHANTOM';
  phantom: {
    linked: boolean;
    verified: boolean;
    addressPreview?: string;
  };
  google: {
    linked: boolean;
  };
  holder: {
    status: 'unknown' | 'eligible' | 'insufficient' | 'unavailable';
    requiredTokens: number;
    balance?: string;
    checkedAt?: string;
    message: string;
  };
}

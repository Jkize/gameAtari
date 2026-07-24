export type RoomStatus = 'waiting' | 'countdown' | 'in_game' | 'finished';
export type RoomType = 'public' | 'private';

export interface RoomMember {
  userId: string;
  username: string;
  socketId: string | null;
  disconnectedAt?: number;
  roundsPlayed: number;
  roundWins: number;
  kills: number;
  damageDealt: number;
}

export interface GameRoom {
  id: string;
  name: string;
  normalizedName?: string;
  type: RoomType;
  adminUserId: string | null;
  rewardsEligible: boolean;
  passwordSalt?: string;
  passwordHash?: string;
  status: RoomStatus;
  createdAt: number;
  expiresAt?: number;
  players: Map<string, RoomMember>;
  countdownEndsAt?: number;
  countdownTimer?: NodeJS.Timeout;
  roundResetTimer?: NodeJS.Timeout;
  closingWarningTimer?: NodeJS.Timeout;
  inactivityTimer?: NodeJS.Timeout;
}

export interface RoomPublicState {
  id: string;
  name: string;
  type: RoomType;
  adminUserId: string | null;
  rewardsEligible: boolean;
  status: RoomStatus;
  playerCount: number;
  minPlayers: number;
  maxPlayers: number;
  countdownSeconds: number | null;
  expiresAt: number | null;
  players: Array<{
    userId: string;
    username: string;
    connected: boolean;
    alive: boolean;
    roundsPlayed: number;
    roundWins: number;
    kills: number;
    damageDealt: number;
  }>;
}

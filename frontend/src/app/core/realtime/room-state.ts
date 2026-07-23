export interface RoomState {
  id: string;
  name: string;
  type: 'public' | 'private';
  adminUserId: string | null;
  rewardsEligible: boolean;
  status: 'waiting' | 'countdown' | 'in_game' | 'finished';
  playerCount: number;
  minPlayers: number;
  maxPlayers: number;
  countdownSeconds: number | null;
  expiresAt: number | null;
  players?: Array<{
    userId: string;
    username: string;
    connected: boolean;
    alive?: boolean;
  }>;
}

export interface GameErrorPayload {
  code: string;
  messageKey?: string;
  messageParams?: Record<string, string | number | boolean>;
  message?: string;
}

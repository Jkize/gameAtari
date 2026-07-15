export type RoomStatus = 'waiting' | 'countdown' | 'in_game' | 'finished';

export interface RoomMember {
  userId: string;
  username: string;
  socketId: string | null;
  disconnectedAt?: number;
}

export interface GameRoom {
  id: string;
  name: string;
  status: RoomStatus;
  createdAt: number;
  players: Map<string, RoomMember>;
  countdownEndsAt?: number;
  countdownTimer?: NodeJS.Timeout;
  roundResetTimer?: NodeJS.Timeout;
}

export interface RoomPublicState {
  id: string;
  name: string;
  status: RoomStatus;
  playerCount: number;
  minPlayers: number;
  maxPlayers: number;
  countdownSeconds: number | null;
  players: Array<{ userId: string; username: string; connected: boolean; alive: boolean }>;
}

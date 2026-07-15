export interface RoomState {
  id: string;
  name: string;
  status: 'waiting' | 'countdown' | 'in_game' | 'finished';
  playerCount: number;
  minPlayers: number;
  maxPlayers: number;
  countdownSeconds: number | null;
  players?: Array<{
    userId: string;
    username: string;
    connected: boolean;
    alive?: boolean;
  }>;
}

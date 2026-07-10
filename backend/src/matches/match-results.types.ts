export interface CompletedMatchPlayerResult {
  playerId: string;
  userId: string | null;
  placement: number;
  winner: boolean;
  kills: number;
  deaths: number;
  damageDealt: number;
  damageTaken: number;
}

export interface CompletedMatchResult {
  roomId: string;
  mapName?: string;
  winnerUserId: string | null;
  startedAt: Date;
  endedAt: Date;
  durationSeconds: number;
  players: CompletedMatchPlayerResult[];
}

import { Injectable } from '@nestjs/common';
import { GameLoopService } from '../games/tanks/game-loop.service';
import { RoomsService } from '../rooms/rooms.service';

export interface PublicStats {
  playersOnline: number;
  activeMatches: number;
  availableRooms: number;
}

export interface AdminStats {
  connectedSockets: number;
  activePlayers: number;
  waitingRooms: number;
  playingRooms: number;
  totalRooms: number;
  memory: { rss: number; heapUsed: number; heapTotal: number };
  tick: { targetMs: number; averageMs: number; delayedTicks: number };
  uptimeSeconds: number;
}

@Injectable()
export class StatsService {
  private cachedPublic: PublicStats | null = null;
  private cacheExpiresAt = 0;
  private static readonly CACHE_TTL_MS = 7_000;

  constructor(
    private readonly rooms: RoomsService,
    private readonly gameLoop: GameLoopService,
  ) {}

  getPublicStats(): PublicStats {
    const now = Date.now();
    if (this.cachedPublic && now < this.cacheExpiresAt) return this.cachedPublic;

    const roomList = this.rooms.list();
    const stats: PublicStats = {
      playersOnline: roomList.reduce((sum, r) => sum + r.playerCount, 0),
      activeMatches: roomList.filter(r => r.status === 'in_game').length,
      availableRooms: roomList.filter(r => r.status === 'waiting' || r.status === 'countdown').length,
    };
    this.cachedPublic = stats;
    this.cacheExpiresAt = now + StatsService.CACHE_TTL_MS;
    return stats;
  }

  getAdminStats(): AdminStats {
    const mem = process.memoryUsage();
    const roomList = this.rooms.list();
    return {
      connectedSockets: this.rooms.getSocketCount(),
      activePlayers: roomList.reduce((sum, r) => sum + r.playerCount, 0),
      waitingRooms: roomList.filter(r => r.status === 'waiting' || r.status === 'countdown').length,
      playingRooms: roomList.filter(r => r.status === 'in_game').length,
      totalRooms: roomList.length,
      memory: {
        rss: Math.round(mem.rss / 1024 / 1024),
        heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
      },
      tick: this.gameLoop.getTickMetrics(),
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }
}

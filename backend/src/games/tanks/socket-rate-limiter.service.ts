import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { DevelopmentSettingsService } from '../../config/development-settings.service';
import {
  LOBBY_ACTION_LIMIT,
  LOBBY_ACTION_WINDOW_MS,
  MAX_CONNECTIONS_PER_IP,
  PLAYER_INPUT_LIMIT,
  PLAYER_INPUT_WINDOW_MS,
} from './config/socket.config';

interface Window {
  count: number;
  resetAt: number;
}

@Injectable()
export class SocketRateLimiterService implements OnModuleDestroy {
  private readonly windows = new Map<string, Window>();
  private readonly ipConnections = new Map<string, Set<string>>();
  private readonly cleanupTimer: NodeJS.Timeout;

  constructor(private readonly developmentSettings: DevelopmentSettingsService) {
    this.cleanupTimer = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  onModuleDestroy(): void {
    clearInterval(this.cleanupTimer);
  }

  checkLobbyAction(userId: string): boolean {
    if (this.isDevGameMode()) return true;
    return this.check(`lobby:${userId}`, LOBBY_ACTION_LIMIT, LOBBY_ACTION_WINDOW_MS);
  }

  checkPlayerInput(userId: string): boolean {
    if (this.isDevGameMode()) return true;
    return this.check(`input:${userId}`, PLAYER_INPUT_LIMIT, PLAYER_INPUT_WINDOW_MS);
  }

  private check(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const existing = this.windows.get(key);
    if (!existing || now >= existing.resetAt) {
      this.windows.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    existing.count++;
    return existing.count <= limit;
  }

  connectionCount(ip: string): number {
    return this.ipConnections.get(ip)?.size ?? 0;
  }

  isConnectionAllowed(ip: string): boolean {
    if (this.isDevGameMode()) return true;
    return this.connectionCount(ip) < MAX_CONNECTIONS_PER_IP;
  }

  addConnection(ip: string, socketId: string): void {
    let sockets = this.ipConnections.get(ip);
    if (!sockets) {
      sockets = new Set();
      this.ipConnections.set(ip, sockets);
    }
    sockets.add(socketId);
  }

  removeConnection(ip: string, socketId: string): void {
    const sockets = this.ipConnections.get(ip);
    if (!sockets) return;
    sockets.delete(socketId);
    if (sockets.size === 0) this.ipConnections.delete(ip);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, win] of this.windows) {
      if (now >= win.resetAt) this.windows.delete(key);
    }
  }

  private isDevGameMode(): boolean {
    return this.developmentSettings.shouldBypassRateLimits();
  }
}

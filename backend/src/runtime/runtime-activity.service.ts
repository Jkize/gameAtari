import { Injectable } from '@nestjs/common';

@Injectable()
export class RuntimeActivityService {
  static readonly ACTIVE_PLAYER_THRESHOLD = 2;
  static readonly RECENT_ACTIVITY_WINDOW_MS = 2 * 60 * 1000;

  private readonly connectedPlayerIds = new Set<string>();
  private lastMultiplayerActivityAt: number | null = null;

  playerConnected(userId: string, now = Date.now()): void {
    this.connectedPlayerIds.add(userId);
    this.refreshActivity(now);
  }

  playerDisconnected(userId: string, now = Date.now()): void {
    this.refreshActivity(now);
    this.connectedPlayerIds.delete(userId);
  }

  connectedPlayerCount(): number {
    return this.connectedPlayerIds.size;
  }

  hasCurrentMultiplayerActivity(): boolean {
    return this.connectedPlayerCount() >= RuntimeActivityService.ACTIVE_PLAYER_THRESHOLD;
  }

  hasRecentMultiplayerActivity(now = Date.now()): boolean {
    if (this.hasCurrentMultiplayerActivity()) {
      this.lastMultiplayerActivityAt = now;
      return true;
    }
    return this.lastMultiplayerActivityAt !== null
      && now - this.lastMultiplayerActivityAt <= RuntimeActivityService.RECENT_ACTIVITY_WINDOW_MS;
  }

  getLastMultiplayerActivityAt(): number | null {
    return this.lastMultiplayerActivityAt;
  }

  private refreshActivity(now: number): void {
    if (this.hasCurrentMultiplayerActivity()) this.lastMultiplayerActivityAt = now;
  }
}

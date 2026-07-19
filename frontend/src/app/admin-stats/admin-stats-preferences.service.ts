import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'tank-arena:admin-stats:series-visibility';
const LEGACY_SERIES_KEYS: Record<string, string> = {
  'CPU %': 'realtime.cpu',
  'Event loop %': 'realtime.eventLoopUtil',
  'RSS MB': 'realtime.rss',
  'Heap MB': 'realtime.heap',
  'Disponible MB': 'realtime.availableMemory',
  'Delay event loop ms': 'realtime.eventLoopDelay',
  'Tick ms': 'realtime.tick',
  Jugadores: 'realtime.players',
  Sockets: 'realtime.sockets',
  Salas: 'realtime.rooms',
  Partidas: 'realtime.matches',
  'CPU promedio %': 'history.cpuAverage',
  'CPU máximo %': 'history.cpuMaximum',
  'RSS promedio MB': 'history.rssAverage',
  'RSS máximo MB': 'history.rssMaximum',
  'Heap promedio MB': 'history.heapAverage',
  'Event loop promedio ms': 'history.eventLoopAverage',
  'Event loop máximo ms': 'history.eventLoopMaximum',
  'Tick promedio ms': 'history.tickAverage',
  'Jugadores máximos': 'history.playersMaximum',
  'Sockets máximos': 'history.socketsMaximum',
  'Salas máximas': 'history.roomsMaximum',
  'Partidas máximas': 'history.matchesMaximum',
};

@Injectable({ providedIn: 'root' })
export class AdminStatsPreferencesService {
  private readonly visibility = signal<Record<string, boolean>>(this.restore());

  isVisible(series: string): boolean {
    return this.visibility()[series] ?? true;
  }

  setVisible(series: string, visible: boolean): void {
    this.visibility.update(current => ({ ...current, [series]: visible }));
    this.persist();
  }

  private restore(): Record<string, boolean> {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      const restored = value ? JSON.parse(value) as Record<string, boolean> : {};
      for (const [legacyLabel, stableKey] of Object.entries(LEGACY_SERIES_KEYS)) {
        if (restored[stableKey] === undefined && restored[legacyLabel] !== undefined) {
          restored[stableKey] = restored[legacyLabel];
        }
      }
      return restored;
    } catch {
      return {};
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.visibility()));
    } catch {
      // Storage can be unavailable in private browsing; in-memory state still works.
    }
  }
}

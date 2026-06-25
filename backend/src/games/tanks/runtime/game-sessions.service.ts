import { Injectable } from '@nestjs/common';
import { GameRuntimeContext } from './game-runtime-context.service';
import { GameRuntimeState } from './game-runtime.types';

@Injectable()
export class GameSessionsService {
  private readonly sessions = new Map<string, GameRuntimeState>();

  constructor(private readonly context: GameRuntimeContext) {}

  create(roomId: string): GameRuntimeState {
    const existing = this.sessions.get(roomId);
    if (existing) return existing;
    const state: GameRuntimeState = {
      roomId,
      players: new Map(),
      bullets: [],
      impactEvents: [],
      map: null,
      status: 'waiting',
      usedColorIndices: new Set(),
      startedAt: null,
      endedAt: null,
      eliminationOrder: [],
      stats: new Map(),
      persisted: false,
    };
    this.sessions.set(roomId, state);
    return state;
  }

  get(roomId: string): GameRuntimeState | undefined {
    return this.sessions.get(roomId);
  }

  require(roomId: string): GameRuntimeState {
    const state = this.sessions.get(roomId);
    if (!state) throw new Error(`Game session ${roomId} does not exist`);
    return state;
  }

  run<T>(roomId: string, callback: () => T): T {
    return this.context.run(this.require(roomId), callback);
  }

  remove(roomId: string): void {
    this.sessions.delete(roomId);
  }
}
